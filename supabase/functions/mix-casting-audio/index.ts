import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// FFmpeg binary for Deno (using pre-compiled binary)
const FFMPEG_URL = "https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4/ffmpeg-linux-x64";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { videoPath, sessionId, userId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting audio normalization for session:', sessionId);

    // Create temp directory
    const tempDir = await Deno.makeTempDir();
    
    // 1. Download video file
    const { data: videoData, error: videoError } = await supabase.storage
      .from('casting-audio')
      .download(videoPath);
    
    if (videoError) throw new Error(`Video download failed: ${videoError.message}`);
    
    const videoInputPath = `${tempDir}/input_video.mp4`;
    await Deno.writeFile(videoInputPath, new Uint8Array(await videoData.arrayBuffer()));

    // 2. Download FFmpeg binary
    const ffmpegPath = `${tempDir}/ffmpeg`;
    const ffmpegResponse = await fetch(FFMPEG_URL);
    await Deno.writeFile(ffmpegPath, new Uint8Array(await ffmpegResponse.arrayBuffer()));
    await Deno.chmod(ffmpegPath, 0o755);

    // 3. Normalize Audio using loudnorm filter
    // This filter normalizes loudness to a target level (usually -23 LUFS for broadcast, 
    // but we'll use -16 LUFS for mobile/web to make it louder and clearer)
    // It also compresses dynamic range, bringing quiet parts (user) up and loud parts (AI) down.
    
    const outputPath = `${tempDir}/final_video.mp4`;
    const normalizeCmd = new Deno.Command(ffmpegPath, {
      args: [
        '-i', videoInputPath,
        '-c:v', 'copy', // Copy video stream without re-encoding (fast)
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', // Audio normalization filter
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath
      ]
    });
    
    const { code, stderr } = await normalizeCmd.output();
    if (code !== 0) {
      const errorText = new TextDecoder().decode(stderr);
      throw new Error(`FFmpeg error: ${errorText}`);
    }

    // 4. Upload final video to recordings bucket
    const finalVideoPath = `${userId}/${sessionId}_normalized.mp4`;
    const finalVideoData = await Deno.readFile(outputPath);
    
    const { error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(finalVideoPath, finalVideoData, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // 5. Clean up temp files
    await Deno.remove(tempDir, { recursive: true });

    // 6. Return storage path
    return new Response(
      JSON.stringify({
        success: true,
        storagePath: finalVideoPath
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Audio normalization error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
