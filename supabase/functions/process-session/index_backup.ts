// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex;
}

async function getDialogueByIndex(supabase: any, scriptId: string, idx: number) {
  const { data: scenes } = await supabase.from("scenes").select("*").eq("script_id", scriptId);
  const sorted = (scenes || []).sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));
  const lines: Array<{ characterName: string; text: string }> = [];
  for (const s of sorted) {
    for (const c of (s.content || [])) lines.push({ characterName: c.characterName, text: c.text });
  }
  return lines[idx] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

    const body = await req.json();
    const sessionId = String(body.sessionId || "").trim();
    const scriptId = String(body.scriptId || "").trim();
    const userId = String(body.userId || "").trim();
    const turns = Array.isArray(body.turns) ? body.turns : [];
    const mixOptions = body.mixOptions || { sampleRate: 44100, format: "mp3", crossfadeMs: 120 };

    if (!sessionId || !scriptId || !userId || turns.length === 0) {
      return new Response(JSON.stringify({ success: false, message: "Missing fields" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    const { data: authUser } = await supabase.auth.getUser();
    if (!authUser?.user || authUser.user.id !== userId) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    console.log(`[mix] sessionId ${sessionId} started`);

    const ffmpeg = createFFmpeg({ log: true });
    await ffmpeg.load();

    const inputFiles: Array<{ name: string; kind: string }> = [];
    let downloadedUser = 0;
    let generatedAI = 0;

    for (const t of turns) {
      if (t.type === "user") {
        const path = String(t.filePath || "");
        const { data, error } = await supabase.storage.from("recordings").download(path);
        if (error) throw error;
        const buf = new Uint8Array(await data.arrayBuffer());
        const name = `u_${t.index}.wav`;
        await ffmpeg.FS("writeFile", name, await fetchFile(buf));
        inputFiles.push({ name, kind: "user" });
        downloadedUser++;
      } else if (t.type === "ai") {
        const idx = Number(t.dialogueLineIndex || 0);
        const line = await getDialogueByIndex(supabase, scriptId, idx);
        const text = String(line?.text || "").trim();
        if (!text) continue;
        const key = await sha256(text);
        const cachePath = `tts-cache/${key}.mp3`;
        let buf: Uint8Array | null = null;
        const { data: head } = await supabase.storage.from("recordings").list("tts-cache", { search: `${key}.mp3` });
        if (Array.isArray(head) && head.find((o: any) => o.name === `${key}.mp3`)) {
          const d = await supabase.storage.from("recordings").download(cachePath);
          buf = new Uint8Array(await d.data.arrayBuffer());
        } else {
          const resp = await fetch(`${supabaseUrl}/functions/v1/generate-speech`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` }, body: JSON.stringify({ text, character: String(t.character || "") }) });
          const j = await resp.json();
          if (j?.audioPath) {
            const dd = await supabase.storage.from("recordings").download(j.audioPath);
            buf = new Uint8Array(await dd.data.arrayBuffer());
            await supabase.storage.from("recordings").upload(cachePath, buf, { contentType: "audio/mpeg", upsert: true });
          }
        }
        if (buf) {
          const name = `a_${t.index}.mp3`;
          await ffmpeg.FS("writeFile", name, await fetchFile(buf));
          inputFiles.push({ name, kind: "ai" });
          generatedAI++;
        }
      }
    }

    console.log(`[mix] downloaded ${downloadedUser} audio segments`);
    console.log(`[mix] generated ${generatedAI} TTS segments`);

    let seq = 0;
    const normalized: string[] = [];
    for (const f of inputFiles) {
      const out = `n_${seq++}.wav`;
      await ffmpeg.run("-i", f.name, "-ar", String(mixOptions.sampleRate || 44100), "-ac", "1", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", out);
      normalized.push(out);
    }
    console.log(`[mix] ffmpeg normalization completed`);

    const faded: string[] = [];
    for (let i = 0; i < normalized.length; i++) {
      const inName = normalized[i];
      const outName = `f_${i}.wav`;
      const d = (mixOptions.crossfadeMs || 120) / 1000;
      const fadeIn = i === 0 ? "" : `,afade=t=in:d=${d}`;
      const fadeOut = i === normalized.length - 1 ? "" : `,afade=t=out:d=${d}`;
      const filter = `aformat=sample_fmts=s16:sample_rates=${mixOptions.sampleRate || 44100}:channel_layouts=mono${fadeIn}${fadeOut}`;
      await ffmpeg.run("-i", inName, "-af", filter, outName);
      faded.push(outName);
    }

    const list = "list.txt";
    const concatManifest = faded.map((n) => `file ${n}`).join("\n");
    await ffmpeg.FS("writeFile", list, new TextEncoder().encode(concatManifest));
    const finalName = "final.mp3";
    await ffmpeg.run("-f", "concat", "-safe", "0", "-i", list, "-c:a", "libmp3lame", "-b:a", "192k", finalName);
    const finalBuf = ffmpeg.FS("readFile", finalName);

    const outPath = `${userId}/${sessionId}.mp3`;
    const { error: upErr } = await supabase.storage.from("recordings").upload(outPath, finalBuf, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw upErr;
    console.log(`[mix] uploaded recording ${outPath}`);

    const fileSizeBytes = (finalBuf?.length ?? 0);
    const durationSeconds = 0;
    await supabase.from("recordings").insert({ id: sessionId, user_id: userId, script_id: scriptId, audio_url: outPath, duration_seconds: durationSeconds, file_size_bytes: fileSizeBytes, title: `Sesión ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` });
    console.log(`[mix] process complete`);

    const { data: signed } = await supabase.storage.from("recordings").createSignedUrl(outPath, 60 * 60);
    return new Response(JSON.stringify({ success: true, recordingUrl: signed?.signedUrl || null }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});
