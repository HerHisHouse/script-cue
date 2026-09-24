import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/**
 * Caché TTS compartida entre usuarios, sin abrir la caché de nadie.
 *
 * Las políticas RLS de `tts_cache` y del bucket `tts-cache` solo dejan a cada usuario ver lo de
 * sus propios guiones. Cuando el cliente no encuentra un audio en su caché, llama a esta función
 * con el hash de la línea (texto procesado + emoción + proveedor) y la voz. Si OTRO usuario ya
 * generó exactamente ese audio, se copia a la carpeta del usuario que lo pide y se le crea su
 * propia fila de caché, así que no se vuelve a pagar la generación.
 *
 * Por qué es seguro: para dar con un audio hay que conocer ya el texto exacto de la línea (el hash
 * se deriva de él), y la respuesta solo contiene la ruta de la copia en la carpeta del propio
 * usuario — nunca datos ni rutas de otros usuarios. La línea y el guion se validan como suyos.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LookupRequest {
  textHash: string;
  provider: string;
  voiceId: string | null;
  emotion: string;
  scriptId: string;
  lineId: string;
  characterName: string;
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const HEX_HASH = /^[a-f0-9]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as LookupRequest;
    const { textHash, provider, voiceId, emotion, scriptId, lineId, characterName } = body;

    if (
      !HEX_HASH.test(textHash || "") ||
      !SAFE_SEGMENT.test(provider || "") ||
      typeof emotion !== "string" || emotion.length > 64 ||
      !UUID.test(scriptId || "") ||
      !UUID.test(lineId || "") ||
      (voiceId !== null && (typeof voiceId !== "string" || voiceId.length > 200)) ||
      typeof characterName !== "string"
    ) {
      return json({ error: "Invalid request" }, 400);
    }

    // La línea tiene que pertenecer al guion indicado, y el guion al usuario.
    const { data: line } = await supabase
      .from("lines")
      .select("id, scenes!inner(script_id, scripts!inner(user_id))")
      .eq("id", lineId)
      .eq("scenes.script_id", scriptId)
      .maybeSingle();
    const ownerId = (line as any)?.scenes?.scripts?.user_id;
    if (!line || ownerId !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    // Audios ya generados con ese mismo hash y voz (de cualquier usuario), del más reciente al más antiguo.
    let query = supabase
      .from("tts_cache")
      .select("storage_path, file_size_bytes")
      .eq("text_hash", textHash)
      .eq("provider", provider);
    query = voiceId ? query.eq("voice_id", voiceId) : query.is("voice_id", null);
    const { data: candidates, error: queryError } = await query
      .order("created_at", { ascending: false })
      .limit(5);
    if (queryError) throw queryError;
    if (!candidates || candidates.length === 0) {
      return json({ hit: false });
    }

    // Ruta única para la copia: la que usa el cliente al generar (`<línea>_<proveedor>_<emoción>.mp3`)
    // no incluye la voz, y sobrescribirla podría romper el audio de otra voz de esta misma línea.
    const emotionSegment = emotion.replace(/[^A-Za-z0-9_-]/g, "_") || "neutral";
    const targetPath = `${user.id}/${scriptId}/${lineId}_${provider}_${emotionSegment}_shared_${crypto.randomUUID().slice(0, 8)}.mp3`;
    const bucket = supabase.storage.from("tts-cache");

    for (const candidate of candidates) {
      const { error: copyError } = await bucket.copy(candidate.storage_path, targetPath);
      if (copyError) {
        // El archivo de ese candidato ya no existe (p.ej. su dueño borró el guion): probar el siguiente.
        console.warn("[tts-cache-lookup] copy failed:", candidate.storage_path, copyError.message);
        continue;
      }

      const { error: upsertError } = await supabase.from("tts_cache").upsert({
        script_id: scriptId,
        line_id: lineId,
        character_name: characterName,
        provider,
        voice_id: voiceId,
        storage_path: targetPath,
        text_hash: textHash,
        file_size_bytes: candidate.file_size_bytes,
      }, { onConflict: "line_id,provider,voice_id" });
      if (upsertError) {
        // Sin fila el cliente no volvería a encontrar la copia: se quita para no dejar huérfanos.
        await bucket.remove([targetPath]);
        throw upsertError;
      }

      return json({ hit: true, storagePath: targetPath });
    }

    return json({ hit: false });
  } catch (error) {
    console.error("[tts-cache-lookup] error:", error);
    return json({ error: "Internal error" }, 500);
  }
});
