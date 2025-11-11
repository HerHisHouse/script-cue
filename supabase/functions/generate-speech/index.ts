// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TTSRequest {
  text: string;
  voiceGender: string;
  voicePreset: string;
  prosodyHints?: {
    emphasis?: number;
    hasQuestion?: boolean;
    hasExclamation?: boolean;
    emotion?: string;
    pace?: string;
  };
  providerOverride?: "openai" | "elevenlabs" | "google";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const defaultProvider = (Deno.env.get("TTS_PROVIDER") || "google").toLowerCase();
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const openaiModel = (Deno.env.get("OPENAI_TTS_MODEL") || "tts-1");
    const elevenApiKey = Deno.env.get("ELEVENLABS_API_KEY") || "";
    const ttsBucket = Deno.env.get("TTS_BUCKET") || "tts";
    const maxPerMinute = Number(Deno.env.get("TTS_MAX_REQUESTS_PER_MIN")) || 60;

    const requestData: TTSRequest = await req.json();
    const { text, voiceGender, voicePreset, prosodyHints, providerOverride } = requestData;

    const textHash = await generateHash(text + voiceGender + voicePreset);

    const { data: cached } = await supabase
      .from("tts_cache")
      .select("*")
      .eq("text_hash", textHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      return new Response(
        JSON.stringify({
          audioUrl: cached.audio_url,
          cached: true,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Basic request limiting using cache count in last minute (best-effort)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count } = await supabase
      .from("tts_cache")
      .select("id", { count: "exact", head: true })
      .gt("created_at", oneMinuteAgo);

    if ((count || 0) >= maxPerMinute) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = (providerOverride || defaultProvider) as "openai" | "elevenlabs" | "google";

    let audioBinary: ArrayBuffer | null = null;
    let audioMime = "audio/mp3";
    let finalProvider = provider;

    // Retry wrapper
    async function withRetries<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
      let lastErr: any;
      for (let i = 0; i < attempts; i++) {
        try { return await fn(); } catch (err) { lastErr = err; }
      }
      throw lastErr;
    }

    if (provider === "openai") {
      if (!openaiApiKey) {
        console.warn("OPENAI_API_KEY not set, falling back to google mock");
        finalProvider = "google";
      } else {
        const result = await withRetries(() => generateSpeechWithOpenAI(text, voiceGender, prosodyHints, openaiApiKey, openaiModel));
        audioBinary = result.binary;
        audioMime = result.mime;
      }
    }

    if (provider === "elevenlabs" && !audioBinary) {
      if (!elevenApiKey) {
        console.warn("ELEVENLABS_API_KEY not set, falling back to google mock");
        finalProvider = "google";
      } else {
        const result = await withRetries(() => generateSpeechWithElevenLabs(text, voiceGender, voicePreset, prosodyHints, elevenApiKey));
        audioBinary = result.binary;
        audioMime = result.mime;
      }
    }

    let storedAudioUrl: string | null = null;
    if (audioBinary) {
      const path = `cache/${textHash}-${finalProvider}.mp3`;
      const { data: up, error: upErr } = await supabase.storage
        .from(ttsBucket)
        .upload(path, audioBinary, { contentType: audioMime, upsert: true });
      if (!upErr) {
        const { data: pub } = await supabase.storage.from(ttsBucket).getPublicUrl(up.path || path);
        storedAudioUrl = pub.publicUrl;
      } else {
        console.warn("Failed to upload TTS audio, returning data URL", upErr?.message || upErr);
      }
    }

    const audioUrl = storedAudioUrl || (await generateSpeechWithGoogle(text, voiceGender, prosodyHints));

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await supabase.from("tts_cache").insert({
      text_hash: textHash,
      text,
      voice_gender: voiceGender,
      voice_preset: voicePreset,
      audio_url: audioUrl,
      provider: finalProvider,
      expires_at: expiresAt.toISOString(),
    });

    return new Response(
      JSON.stringify({
        audioUrl,
        cached: false,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error generating speech:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

async function generateHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateSpeechWithGoogle(
  text: string,
  voiceGender: string,
  prosodyHints?: any
): Promise<string> {
  const ssml = buildSSML(text, prosodyHints);

  const voiceMap: Record<string, string> = {
    male: "es-ES-Standard-B",
    female: "es-ES-Standard-A",
    neutral: "es-ES-Standard-A",
  };

  const mockAudioUrl = `data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAA4S/mxxxxxxxxx`;

  return mockAudioUrl;
}

function buildSSML(text: string, prosodyHints?: any): string {
  let ssml = "<speak>";

  if (prosodyHints) {
    let prosodyAttrs = "";

    if (prosodyHints.pace) {
      const rateMap: Record<string, string> = {
        slow: "80%",
        normal: "100%",
        fast: "120%",
      };
      prosodyAttrs += ` rate="${rateMap[prosodyHints.pace] || "100%"}"`;
    }

    if (prosodyHints.emphasis && prosodyHints.emphasis > 0) {
      const pitchBoost = Math.min(prosodyHints.emphasis * 5, 20);
      prosodyAttrs += ` pitch="+${pitchBoost}%"`;
    }

    if (prosodyAttrs) {
      ssml += `<prosody${prosodyAttrs}>${text}</prosody>`;
    } else {
      ssml += text;
    }
  } else {
    ssml += text;
  }

  ssml += "</speak>";
  return ssml;
}

async function generateSpeechWithOpenAI(
  text: string,
  voiceGender: string,
  prosodyHints: any,
  apiKey: string,
  model: string
): Promise<{ binary: ArrayBuffer; mime: string }> {
  const voiceMap: Record<string, string> = {
    male: "verse",
    female: "aria",
    neutral: "alloy",
  };
  const voice = voiceMap[voiceGender] || "alloy";

  const payload = {
    model,
    voice,
    input: text,
    response_format: "mp3",
  };

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    // Fallback: try legacy/newer model if provided model fails
    const fallbackModel = model === "tts-1" ? "gpt-4o-mini-tts" : "tts-1";
    const res2 = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, model: fallbackModel }),
    });
    if (!res2.ok) {
      const body2 = await res2.text();
      throw new Error(`OpenAI TTS failed: ${res.status} ${body}; fallback ${res2.status} ${body2}`);
    }
    const buf2 = await res2.arrayBuffer();
    return { binary: buf2, mime: "audio/mp3" };
  }
  const buf = await res.arrayBuffer();
  return { binary: buf, mime: "audio/mp3" };
}

async function generateSpeechWithElevenLabs(
  text: string,
  voiceGender: string,
  voicePreset: string,
  prosodyHints: any,
  apiKey: string
): Promise<{ binary: ArrayBuffer; mime: string }> {
  // Map gender/preset to a generic voice id; in production, use per-character voice IDs
  const voiceMap: Record<string, string> = {
    male: "21m00Tcm4TlvDq8ikWAM", // Adam
    female: "EXAVITQu4vr4xnSDxMaL", // Bella
    neutral: "21m00Tcm4TlvDq8ikWAM",
  };
  const voiceId = voiceMap[voiceGender] || voiceMap.neutral;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
  const body = {
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: Math.min((prosodyHints?.emphasis ?? 0.5) / 2, 1),
      similarity_boost: 0.75,
      style: prosodyHints?.pace === "fast" ? 0.8 : prosodyHints?.pace === "slow" ? 0.2 : 0.5,
      use_speaker_boost: true,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
  const buf = await res.arrayBuffer();
  return { binary: buf, mime: "audio/mpeg" };
}
// @ts-nocheck
// This Edge Function runs in Deno on Supabase; disabling TS checking
// in local editors prevents false-positive errors about 'Deno' and
// 'npm:' imports which are valid in the Deno runtime.
