import { ScriptLineWithDirection } from '../../types/voiceDirection';
import { ElevenLabsAdapter } from './adapters/elevenlabs.adapter';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { AzureAdapter } from './adapters/azure.adapter';
import { SystemAdapter } from './adapters/system.adapter';

const elevenLabsAdapter = new ElevenLabsAdapter();
const openAIAdapter = new OpenAIAdapter();
const azureAdapter = new AzureAdapter();
const systemAdapter = new SystemAdapter();

export function buildProviderTTSInput(
  provider: 'elevenlabs' | 'openai' | 'azure' | 'system',
  line: ScriptLineWithDirection
): any {
  if (provider === 'elevenlabs') {
    return elevenLabsAdapter.buildInput(line);
  }

  // Comportamiento idéntico al actual si no hay emoción
  if (!line || !line.direction || line.direction.emotion === 'neutral') {
    return provider === 'azure' ? { text: line.text } : line.text;
  }

  switch (provider) {
    case 'openai':
      return openAIAdapter.buildInput(line);
    case 'azure':
      return azureAdapter.buildInput(line);
    case 'system':
    default:
      return systemAdapter.buildInput(line);
  }
}
