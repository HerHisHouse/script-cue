import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const API_COSTS: Record<string, number> = {
  openai_tts:        0.000015, // per char
  openai_tts_hd:     0.000030, // per char
  openai_analysis:   0.000005, // per token
  openai_audio:      0.000100, // per audio second
  elevenlabs:        0.000003, // per char
  azure:             0.000004, // per char
  system:            0,
};

interface ApiUsageParams {
  userId: string | null;
  provider: string;
  characters?: number;
  tokens?: number;
  durationSeconds?: number;
  scriptId?: string | null;
  mode?: string | null;
}

export async function logApiUsage(params: ApiUsageParams) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('[Usage] Missing Supabase environment variables');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const costPerUnit = API_COSTS[params.provider] || 0;
    const units = params.characters || params.tokens || params.durationSeconds || 0;
    const estimatedCost = units * costPerUnit;

    const { error } = await supabase.from('api_usage').insert({
      user_id: params.userId,
      provider: params.provider,
      characters_count: params.characters || 0,
      tokens_count: params.tokens || 0,
      duration_seconds: params.durationSeconds || 0,
      estimated_cost_eur: estimatedCost,
      script_id: params.scriptId || null,
      mode: params.mode || null,
    });

    if (error) {
      console.warn('[Usage] Error inserting to api_usage:', error.message);
    }
  } catch (e) {
    console.warn('[Usage] Failed to log API usage:', e);
  }
}
