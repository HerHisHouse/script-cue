// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { createFFmpeg, fetchFile } from "npm:@ffmpeg/ffmpeg@0.11.6";

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

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return new Response(JSON.stringify({ success: false, message: "Invalid content-type" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }
    const form = await req.formData();
    const keys: string[] = [];
    for (const [k] of form.entries()) keys.push(String(k));
    console.log('[upload-segment] Recibido FormData con campos:', keys);
    const sessionId = String(form.get("sessionId") || "").trim();
    const scriptIdRaw = String(form.get("scriptId") || "").trim();
    const scriptId = scriptIdRaw || "demo-script";
    const userIdRaw = String(form.get("userId") || "").trim();
    const userId = userIdRaw || "testuser";
    const indexRaw = String(form.get("index") || "0").trim();
    const index = Number(indexRaw);
    const file = form.get("file") as File | null;
    console.log('[upload-segment] Tamaño blob recibido:', (file as any)?.size, 'nombre:', (file as any)?.name, 'type:', (file as any)?.type);
    if (!sessionId || Number.isNaN(index) || !file) {
      return new Response(JSON.stringify({ success: false, message: "Missing fields" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const ext = (file.type || "audio/wav").includes("mp4") || (file.name || "").endsWith(".m4a") ? "m4a" : "wav";
    const path = `testuser/${sessionId}/user-${index}.wav`;
    console.log('[upload-segment] Subiendo a:', path);
    const { data, error: upErr } = await supabase.storage.from('recordings').upload(path, buf, { contentType: 'audio/wav', upsert: true });
    console.log('[upload-segment] Resultado Supabase upload:', { data, error: upErr });
    if (upErr) {
      console.error("[upload-segment] ❌ Error de subida:", upErr);
      throw upErr;
    }
    console.log("[upload-segment] ✅ Subida completada:", path);

    let durationMs = 0;
    try {
      const ffmpeg = createFFmpeg({ log: true, corePath: "https://unpkg.com/@ffmpeg/core@0.11.6/dist/ffmpeg-core.js" });
      let captured = "";
      ffmpeg.setLogger(({ message }) => { captured += String(message) + "\n"; });
      await ffmpeg.load();
      await ffmpeg.FS("writeFile", `in.${ext}`, await fetchFile(buf));
      await ffmpeg.run("-i", `in.${ext}`, "-f", "null", "-");
      const m = captured.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2,})/);
      if (m) {
        const h = Number(m[1]);
        const mm = Number(m[2]);
        const ss = Number(m[3]);
        const frac = Number(m[4]);
        durationMs = ((h * 3600 + mm * 60 + ss) * 1000) + Math.round((frac / 100) * 1000);
      }
    } catch (_) {}

    return new Response(JSON.stringify({ success: true, filePath: path, durationMs }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});
