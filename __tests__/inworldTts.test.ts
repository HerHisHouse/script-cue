import { describe, it, expect } from '@jest/globals';
/* eslint-disable @typescript-eslint/no-require-imports */
const { buildText, synthesizeInworldMp3, DEFAULT_VOICE, INWORLD_TTS_MODEL } = require('../server/inworldTts');
/* eslint-enable @typescript-eslint/no-require-imports */

type FakeResponse = { ok: boolean; status: number; json?: () => Promise<unknown>; text?: () => Promise<string> };

const okAudio = (audioContent = 'SUQz'): FakeResponse => ({ ok: true, status: 200, json: async () => ({ audioContent }) });
const fail = (status: number): FakeResponse => ({ ok: false, status, text: async () => `error ${status}` });

describe('buildText', () => {
  it('pone la etiqueta de emoción delante de la réplica', () => {
    expect(buildText('Tengo miedo.', 'crying')).toBe('[crying] Tengo miedo.');
    expect(buildText('Ya.', 'clears throat')).toBe('[clears throat] Ya.');
  });
  it('acepta la etiqueta ya con corchetes, como la genera la app para ElevenLabs', () => {
    expect(buildText('Tengo miedo.', '[crying]')).toBe('[crying] Tengo miedo.');
  });
  it('descarta acotaciones largas en texto libre, que podrían leerse en voz alta', () => {
    expect(buildText('No quiero hablar.', 'seca y cortante, sin mirarle')).toBe('No quiero hablar.');
  });
  it('sin etiqueta envía solo la réplica', () => {
    expect(buildText('Hola.', undefined)).toBe('Hola.');
    expect(buildText('Hola.', '  ')).toBe('Hola.');
  });
});

describe('synthesizeInworldMp3', () => {
  it('envía voz, modelo y MP3 con la clave en Basic y devuelve el audio', async () => {
    const calls: any[] = [];
    const fetchImpl = async (url: string, init: any) => { calls.push({ url, init }); return okAudio(); };
    const audio = await synthesizeInworldMp3({ text: 'Hola', description: 'sad', voice: 'Pilar', apiKey: 'k', fetchImpl });
    expect(Buffer.isBuffer(audio)).toBe(true);
    const body = JSON.parse(calls[0].init.body);
    expect(calls[0].url).toBe('https://api.inworld.ai/tts/v1/voice');
    expect(calls[0].init.headers.Authorization).toBe('Basic k');
    expect(body).toEqual({ text: '[sad] Hola', voiceId: 'Pilar', modelId: INWORLD_TTS_MODEL, audioConfig: { audioEncoding: 'MP3' } });
  });

  it('sin voz usa la de por defecto', async () => {
    const bodies: any[] = [];
    const fetchImpl = async (_u: string, init: any) => { bodies.push(JSON.parse(init.body)); return okAudio(); };
    await synthesizeInworldMp3({ text: 'Hola', apiKey: 'k', fetchImpl });
    expect(bodies[0].voiceId).toBe(DEFAULT_VOICE);
  });

  it('reintenta ante un 429 (demasiadas generaciones a la vez)', async () => {
    const responses = [fail(429), okAudio()];
    let calls = 0;
    const audio = await synthesizeInworldMp3({ text: 'Hola', apiKey: 'k', fetchImpl: async () => responses[calls++] });
    expect(calls).toBe(2);
    expect(audio.length).toBeGreaterThan(0);
  }, 15000);

  it('no reintenta errores del cliente (400) y los propaga', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return fail(400); };
    await expect(synthesizeInworldMp3({ text: 'Hola', apiKey: 'k', fetchImpl })).rejects.toThrow('Inworld TTS 400');
    expect(calls).toBe(1);
  });

  it('sin clave falla antes de llamar a Inworld', async () => {
    let calls = 0;
    await expect(synthesizeInworldMp3({ text: 'Hola', apiKey: '', fetchImpl: async () => { calls++; return okAudio(); } })).rejects.toThrow('INWORLD_API_KEY');
    expect(calls).toBe(0);
  });
});
