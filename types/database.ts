export type VoiceGender = 'male' | 'female' | 'neutral';
export type VoicePreset = 'natural' | 'warm' | 'deep' | 'authoritative' | 'soft' | 'energetic';
export type ScriptStatus = 'processing' | 'ready' | 'error';
export type PracticeMode = 'studio' | 'car' | 'memory';

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Script {
  id: string;
  user_id: string;
  title: string;
  pdf_url?: string;
  parsed_text?: string;
  metadata: Record<string, any>;
  status: ScriptStatus;
  created_at: string;
  updated_at: string;
}

export interface Character {
  id: string;
  script_id: string;
  name: string;
  is_user_character: boolean;
  voice_gender: VoiceGender;
  voice_preset: VoicePreset;
  color: string;
  line_count: number;
  occurrence_percentage: number;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  script_id: string;
  scene_number: number;
  heading?: string;
  content: DialogueContent[];
  order_index: number;
  created_at: string;
}

export interface DialogueContent {
  characterName: string;
  text: string;
  prosodyHints?: ProsodyHints;
}

export interface Dialogue {
  id: string;
  scene_id: string;
  character_id?: string;
  text: string;
  order_index: number;
  prosody_hints: ProsodyHints;
  created_at: string;
}

export interface ProsodyHints {
  emphasis?: number;
  hasQuestion?: boolean;
  hasExclamation?: boolean;
  emotion?: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised';
  pace?: 'slow' | 'normal' | 'fast';
}

export interface PracticeSession {
  id: string;
  script_id: string;
  user_id: string;
  scene_ids: string[];
  mode: PracticeMode;
  duration_seconds: number;
  recording_url?: string;
  started_at: string;
  completed_at?: string;
  created_at: string;
}

export interface Recording {
  id: string;
  session_id?: string;
  user_id: string;
  script_id: string;
  audio_url: string;
  duration_seconds: number;
  file_size_bytes: number;
  title?: string;
  notes?: string;
  hidden?: boolean;
  created_at: string;
}

export interface TTSCache {
  id: string;
  text_hash: string;
  text: string;
  voice_gender: VoiceGender;
  voice_preset: VoicePreset;
  audio_url: string;
  provider: string;
  created_at: string;
  expires_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      scripts: {
        Row: Script;
        Insert: Omit<Script, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Script, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      characters: {
        Row: Character;
        Insert: Omit<Character, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Character, 'id' | 'script_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      scenes: {
        Row: Scene;
        Insert: Omit<Scene, 'id' | 'created_at'>;
        Update: Partial<Omit<Scene, 'id' | 'script_id' | 'created_at'>>;
        Relationships: [];
      };
      dialogues: {
        Row: Dialogue;
        Insert: Omit<Dialogue, 'id' | 'created_at'>;
        Update: Partial<Omit<Dialogue, 'id' | 'scene_id' | 'created_at'>>;
        Relationships: [];
      };
      practice_sessions: {
        Row: PracticeSession;
        Insert: Omit<PracticeSession, 'id' | 'created_at'>;
        Update: Partial<Omit<PracticeSession, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      recordings: {
        Row: Recording;
        Insert: Omit<Recording, 'id' | 'created_at'>;
        Update: Partial<Omit<Recording, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      tts_cache: {
        Row: TTSCache;
        Insert: Omit<TTSCache, 'id' | 'created_at'>;
        Update: Partial<Omit<TTSCache, 'id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: {
      [_: string]: never;
    };
    Functions: {
      [_: string]: never;
    };
    Enums: {
      [_: string]: never;
    };
    CompositeTypes: {
      [_: string]: never;
    };
  };
}
