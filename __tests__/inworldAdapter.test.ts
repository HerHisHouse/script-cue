import { describe, it, expect } from '@jest/globals';
import { InworldAdapter } from '../utils/tts/adapters/inworld.adapter';
import { ELEVENLABS_PREFIXES } from '../utils/tts/adapters/elevenlabs.adapter';
import { buildProviderTTSInput } from '../utils/tts/buildProviderInput';
import type { ScriptLineWithDirection } from '../types/voiceDirection';

const line = (rawText: string, emotion: string, text = rawText): ScriptLineWithDirection =>
  ({ lineId: 'l1', text, rawText, direction: { emotion, intensity: 1 } } as unknown as ScriptLineWithDirection);

describe('InworldAdapter (voces "Natural")', () => {
  const adapter = new InworldAdapter();

  it('envía la misma etiqueta que ElevenLabs, aparte del texto', () => {
    expect(adapter.buildInput(line('Tengo miedo.', 'crying'))).toEqual({ text: 'Tengo miedo.', description: ELEVENLABS_PREFIXES.crying });
    expect(adapter.buildInput(line('Ya.', 'clears_throat')).description).toBe('[clears throat]');
  });

  it('quita del texto las etiquetas y las acotaciones entre paréntesis', () => {
    expect(adapter.buildInput(line('[whispering] (en voz baja) Nada, Rosa.', 'whispering')).text).toBe('Nada, Rosa.');
  });

  it('sin emoción o con emoción neutra no envía etiqueta', () => {
    expect(adapter.buildInput(line('Hola.', 'neutral'))).toEqual({ text: 'Hola.', description: '' });
  });

  it('una emoción sin etiqueta conocida se envía sin etiqueta (nunca texto libre)', () => {
    expect(adapter.buildInput(line('Hola.', 'emocion-inventada')).description).toBe('');
  });

  it('buildProviderTTSInput enruta "inworld" a este adaptador', () => {
    expect(buildProviderTTSInput('inworld', line('Tengo miedo.', 'crying'))).toEqual({ text: 'Tengo miedo.', description: '[crying]' });
  });
});
