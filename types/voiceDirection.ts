export type EmotionTag =
  | 'neutral'
  | 'whispering'
  | 'shouting'
  | 'crying'
  | 'laughing'
  | 'angry'
  | 'excited'
  | 'sad'
  | 'fearful'
  | 'tender'
  | 'sarcastic'
  | 'curious'
  | 'mischievous'
  | 'sighing'
  | 'breathless'
  | 'hesitant'
  | 'resigned'
  | 'cheerful'
  | 'deadpan'
  | 'playful'
  | 'surprised'
  | 'nervous'
  | 'clears_throat'
  | 'desperate'
  | 'threatening'
  | 'pleading'
  | 'proud'
  | 'embarrassed'
  | 'exhausted'
  | 'jealous'
  | 'hopeful'
  | 'confused';

export type VoiceDirection = {
  emotion: EmotionTag;
  intensity: number;    // 0.0 → 1.0
  speed?: number;       // 0.5 → 2.0, default 1.0
  stylePrompt?: string; // texto libre adicional
  detectedFrom?: string; // "(susurrando)" original, para UI futura
};

export type ScriptLineWithDirection = {
  lineId: string;
  text: string;          // texto limpio SIN acotación
  rawText: string;       // texto original con acotación
  direction: VoiceDirection;
};
