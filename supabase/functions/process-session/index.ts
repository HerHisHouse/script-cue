// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { createFFmpeg, fetchFile } from "npm:@ffmpeg/ffmpeg@0.11.6";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ffmpeg = createFFmpeg({ log: true });

Deno.serve(async (req) => {
  try {
    const { userId = "testuser", sessionId = "testsession", turns, options } = await req.json();
    console.log("[process-session] Mezclando sesión:", sessionId);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    const files = [];

    // Descarga cada archivo del bucket "sessions"
    for (const t of turns) {
      if (t.type === "user" && t.filePath) {
        const { data, error } = await supabase.storage.from("sessions").download(t.filePath);
        if (error) throw error;

        const arrayBuffer = await data.arrayBuffer();
        await ffmpeg.FS("writeFile", t.filePath.split("/").pop(), new Uint8Array(arrayBuffer));
        files.push(`file '${t.filePath.split("/").pop()}'`);
      } else if (t.type === "ai") {
        // Crea un silencio de 0.4 segundos entre frases
        const silenceName = `silence-${t.dialogueLineIndex}.wav`;
        await ffmpeg.run(
          "-f", "lavfi",
          "-i", "anullsrc=r=44100:cl=mono",
          "-t", ((options?.crossfadeMs || 400) / 1000).toString(),
          silenceName
        );
        files.push(`file '${silenceName}'`);
      }
    }

    await ffmpeg.FS("writeFile", "inputs.txt", new TextEncoder().encode(files.join("\n")));

    // Concatenar los clips
    await ffmpeg.run("-f", "concat", "-safe", "0", "-i", "inputs.txt", "-c", "copy", "output.mp3");

    const mixedData = ffmpeg.FS("readFile", "output.mp3");

    // Sube el archivo final a recordings
    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(`mixes/${sessionId}.mp3`, mixedData, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    console.log("[process-session] Mezcla completa:", `mixes/${sessionId}.mp3`);

    return new Response(
      JSON.stringify({ success: true, output: `mixes/${sessionId}.mp3` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[process-session] Error:", err);
    return new Response(
      JSON.stringify({ success: false, message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});