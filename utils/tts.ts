import { VoiceGender, VoicePreset, ProsodyHints } from '@/types/database';
import { getSettings } from './appSettings';
import * as cache from './cache';
import { inc } from './metrics';

export interface TTSRequest {
  text: string;
  voiceGender: VoiceGender;
  voicePreset: VoicePreset;
  prosodyHints?: ProsodyHints;
  providerOverride?: 'openai' | 'elevenlabs' | 'google' | 'system';
  scriptId?: string;
}

export interface TTSResponse {
  audioUrl: string;
  cached: boolean;
}

export interface TTSProvider {
  generateSpeech(request: TTSRequest): Promise<TTSResponse>;
  getName(): string;
}

export class TTSService {
  private provider: TTSProvider;
  private supabaseUrl: string;

  constructor(provider: TTSProvider, supabaseUrl: string) {
    this.provider = provider;
    this.supabaseUrl = supabaseUrl;
  }

  async generateSpeech(request: TTSRequest): Promise<TTSResponse> {
    // Cache-first: build cache key from text + voice params
    const settings = await getSettings();
    const scriptId = request.scriptId || 'unknown';
    const keyStr = JSON.stringify({ t: request.text, v: request.voicePreset, g: request.voiceGender, p: request.prosodyHints });
    const cachedVal = await cache.get('tts', scriptId, keyStr);
    if (cachedVal && typeof cachedVal === 'string') {
      await inc('cache.hits');
      await inc('api.savings');
      return { audioUrl: cachedVal, cached: true };
    } else {
      await inc('cache.misses');
    }

    const res = await this.provider.generateSpeech(request);
    // Cache result with TTL (e.g., 7 días)
    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    try {
      await cache.put('tts', scriptId, keyStr, res.audioUrl, ttlMs);
    } catch {}
    return res;
  }

  buildSSML(text: string, prosodyHints?: ProsodyHints): string {
    let ssml = '<speak>';

    if (prosodyHints) {
      let prosodyAttrs = '';

      if (prosodyHints.pace) {
        const rateMap = { slow: '80%', normal: '100%', fast: '120%' };
        prosodyAttrs += ` rate="${rateMap[prosodyHints.pace]}"`;
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

    ssml += '</speak>';
    return ssml;
  }
}

export class SupabaseTTSProvider implements TTSProvider {
  private functionUrl: string;
  private anonKey: string;

  constructor(supabaseUrl: string, anonKey: string) {
    this.functionUrl = `${supabaseUrl}/functions/v1/generate-speech`;
    this.anonKey = anonKey;
  }

  async generateSpeech(request: TTSRequest): Promise<TTSResponse> {
    const response = await fetch(this.functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.anonKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`TTS generation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  getName(): string {
    return 'supabase-tts';
  }
}

export function createTTSService(supabaseUrl: string, anonKey: string): TTSService {
  const provider = new SupabaseTTSProvider(supabaseUrl, anonKey);
  return new TTSService(provider, supabaseUrl);
}
