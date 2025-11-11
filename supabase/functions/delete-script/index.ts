import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DeleteRequest {
  scriptId: string;
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { scriptId }: DeleteRequest = await req.json();

    const { data: script, error: fetchError } = await supabase
      .from("scripts")
      .select("user_id, pdf_url")
      .eq("id", scriptId)
      .single();

    if (fetchError) throw fetchError;
    if (!script) throw new Error("Script not found");

    if (script.user_id !== user.id) {
      throw new Error("Unauthorized: You can only delete your own scripts");
    }

    if (script.pdf_url) {
      await supabase.storage
        .from("scripts")
        .remove([script.pdf_url]);
    }

    const { data: recordings } = await supabase
      .from("recordings")
      .select("audio_url")
      .eq("script_id", scriptId);

    if (recordings && recordings.length > 0) {
      const audioPaths = recordings
        .map((r: any) => r.audio_url)
        .filter((url: string) => url && url.includes("recordings/"));

      if (audioPaths.length > 0) {
        await supabase.storage
          .from("recordings")
          .remove(audioPaths);
      }
    }

    const { error: deleteCharsError } = await supabase
      .from("characters")
      .delete()
      .eq("script_id", scriptId);

    if (deleteCharsError) {
      console.warn("Error deleting characters:", deleteCharsError);
    }

    const { error: deleteScenesError } = await supabase
      .from("scenes")
      .delete()
      .eq("script_id", scriptId);

    if (deleteScenesError) {
      console.warn("Error deleting scenes:", deleteScenesError);
    }

    const { error: deleteRecordingsError } = await supabase
      .from("recordings")
      .delete()
      .eq("script_id", scriptId);

    if (deleteRecordingsError) {
      console.warn("Error deleting recordings:", deleteRecordingsError);
    }

    const { error: deleteScriptError } = await supabase
      .from("scripts")
      .delete()
      .eq("id", scriptId);

    if (deleteScriptError) throw deleteScriptError;

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error deleting script:", error);
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
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
