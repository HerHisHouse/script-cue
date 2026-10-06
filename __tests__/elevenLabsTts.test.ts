import { describe, it, expect } from '@jest/globals';
/* eslint-disable @typescript-eslint/no-require-imports */
const { synthesizeElevenLabsMp3, listElevenLabsVoices, ELEVENLABS_TTS_MODEL, VOICE_SETTINGS } = require('../server/elevenLabsTts');
/* eslint-enable @typescript-eslint/no-require-imports */

type FakeResponse = { ok: boolean; status: number; arrayBuffer?: () => Promise<ArrayBuffer>; json?: () => Promise<unknown>; text?: () => Promise<string> };
const okMp3 = (): FakeResponse => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
const fail = (status: number): FakeResponse => ({ ok: false, status, text: async () => `error ${status}` });

describe('synthesizeElevenLabsMp3', () => {
  it('llama a ElevenLabs con la clave del servidor, el modelo y los ajustes de siempre', async () => {
    const calls: any[] = [];
    const fetchImpl = async (url: string, init: any) => { calls.push({ url, init }); return okMp3(); };
    const audio = await synthesizeElevenLabsMp3({ text: '[crying] Tengo miedo.', voiceId: 'abc', apiKey: 'k', fetchImpl });
    expect(Buffer.isBuffer(audio)).toBe(true);
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/abc?output_format=mp3_44100_128');
    expect(calls[0].init.headers['xi-api-key']).toBe('k');
    expect(JSON.parse(calls[0].init.body)).toEqual({ text: '[crying] Tengo miedo.', model_id: ELEVENLABS_TTS_MODEL, voice_settings: VOICE_SETTINGS });
  });

  it('reintenta ante un 429 y no ante un 401', async () => {
    let calls = 0;
    const responses = [fail(429), okMp3()];
    await synthesizeElevenLabsMp3({ text: 'Hola', voiceId: 'v', apiKey: 'k', fetchImpl: async () => responses[calls++] });
    expect(calls).toBe(2);

    let calls401 = 0;
    await expect(synthesizeElevenLabsMp3({ text: 'Hola', voiceId: 'v', apiKey: 'k', fetchImpl: async () => { calls401++; return fail(401); } }))
      .rejects.toThrow('ElevenLabs 401');
    expect(calls401).toBe(1);
  }, 15000);

  it('sin clave o sin voz falla antes de llamar a ElevenLabs', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return okMp3(); };
    await expect(synthesizeElevenLabsMp3({ text: 'Hola', voiceId: 'v', apiKey: '', fetchImpl })).rejects.toThrow('ELEVENLABS_API_KEY');
    await expect(synthesizeElevenLabsMp3({ text: 'Hola', voiceId: '', apiKey: 'k', fetchImpl })).rejects.toThrow('voiceId');
    expect(calls).toBe(0);
  });
});

describe('listElevenLabsVoices', () => {
  it('devuelve la lista tal como la da ElevenLabs', async () => {
    const data = { voices: [{ voice_id: 'a', name: 'Ana' }] };
    const fetchImpl = async (_u: string, init: any) => {
      expect(init.headers['xi-api-key']).toBe('k');
      return { ok: true, status: 200, json: async () => data };
    };
    expect(await listElevenLabsVoices({ apiKey: 'k', fetchImpl })).toEqual(data);
  });
});
