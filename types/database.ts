// --- Definiciones de Tipos Básicos ---
export type VoiceGender = 'male' | 'female' | 'neutral';
export type VoicePreset = 'natural' | 'warm' | 'deep' | 'authoritative' | 'soft' | 'energetic';
export type ScriptStatus = 'processing' | 'ready' | 'error' | string | null; // Hacemos string genérico
export type PracticeMode = 'studio' | 'car' | 'memory';

// --- Interfaces Simplificadas (Alineadas con configuracion-db.md) ---

// ** PERFIL CORREGIDO **
// Refleja las columnas (id, username, full_name) que creamos en la tabla 'profiles'
export interface Profile {
  id: string;
  username: string | null;  // <-- AÑADIDO (coincide con la DB)
  full_name: string | null; // <-- AÑADIDO (coincide con la DB)
  avatar_url: string | null; // <-- AÑADIDO (foto de perfil)
}

// ** SCRIPT SIMPLIFICADO **
// Refleja las columnas (id, user_id, title, pdf_path, status) de la tabla 'scripts'
export interface Script {
  id: string;
  user_id: string;
  title: string;
  pdf_path: string | null; // <-- CORREGIDO (antes pdf_url)
  status: ScriptStatus;
  project_id?: string | null; // <-- AÑADIDO
  original_script_id?: string | null; // <-- AÑADIDO: Referencia al guión original si es una copia
  created_at?: string; // Opcional
}

// ** PROJECT NUEVO **
export interface Project {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at?: string;
}

// ** CHARACTER SIMPLIFICADO **
// Refleja las columnas (id, script_id, name, gender, color, is_user_character) de la tabla 'characters'
export interface Character {
  id: string;
  script_id: string;
  name: string | null;
  is_user_character: boolean;
  voice_gender: VoiceGender | null;
  color: string | null;
  voice_id: string | null; // ID de la voz seleccionada (ej: alloy, nova, echo)
  voice_provider: 'openai' | 'elevenlabs' | 'system' | null; // Proveedor de la voz
  // Omitimos campos que aún no hemos añadido a la DB para evitar errores
  // voice_preset: VoicePreset;
  // line_count: number;
  // occurrence_percentage: number;
  created_at?: string; // Opcional
}

// ** DIALOGUE SIMPLIFICADO **
// Refleja las columnas (id, script_id, character_id, line_text, line_number) de la tabla 'dialogues'
export interface Dialogue {
  id: string;
  script_id: string;
  character_id: string | null;
  line_text: string | null;
  line_number: number | null;
  created_at?: string; // Opcional
}

// --- Interfaces de la Plantilla Original (Las mantenemos para no romper otras partes) ---
// (No hemos creado estas tablas aún, pero dejamos los tipos definidos)

export interface Scene {
  id: string;
  script_id: string;
  scene_number: number;
  heading?: string;
  content: DialogueContent[]; // Esto lo usa la Edge Function
  order_index: number;
  created_at: string;
}

export interface DialogueContent {
  characterName: string;
  text: string;
  prosodyHints?: ProsodyHints;
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
  project_id?: string | null;
  audio_url: string;
  duration_seconds: number;
  file_size_bytes: number;
  title?: string;
  notes?: string;
  hidden?: boolean;
  type?: 'audio' | 'video';
  scene_id?: string | null;
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

export interface CoachFeedback {
  id: string;
  recording_id: string;
  user_id: string;
  feedback: any; // JSONB with the analysis structure
  created_at: string;
}

export interface ScriptAnalysis {
  id: string;
  script_id: string;
  user_id: string;
  // Los 10 puntos de análisis actoral
  step_1_character_desire: string | null;
  step_2_deep_need: string | null;
  step_3_conflict: string | null;
  step_4_relationship: string | null;
  step_5_initial_state: string | null;
  step_6_evolution: string | null;
  step_7_actions: string | null;
  step_8_subtext: string | null;
  step_9_circumstances: string | null;
  step_10_personal_theme: string | null;
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
}


// --- Tipo Principal de Base de Datos (ACTUALIZADO) ---
// Refleja las interfaces simplificadas que SÍ tenemos en la DB
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile; // <-- Usa el tipo Profile corregido
        Insert: Omit<Profile, 'id'>; // Simplificado
        Update: Partial<Profile>;
        Relationships: [];
      };
      scripts: {
        Row: Script; // <-- Usa el tipo Script simplificado
        Insert: Omit<Script, 'id' | 'created_at'>;
        Update: Partial<Script>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Project>;
        Relationships: [];
      };
      characters: {
        Row: Character; // <-- Usa el tipo Character simplificado
        Insert: Omit<Character, 'id' | 'created_at'>;
        Update: Partial<Character>;
        Relationships: [];
      };
      dialogues: {
        Row: Dialogue; // <-- Usa el tipo Dialogue simplificado
        Insert: Omit<Dialogue, 'id' | 'created_at'>;
        Update: Partial<Dialogue>;
        Relationships: [];
      };
      // Dejamos el resto de tablas como estaban en tu plantilla
      // para no romper código que aún no hemos revisado
      scenes: {
        Row: Scene;
        Insert: Omit<Scene, 'id' | 'created_at'>;
        Update: Partial<Omit<Scene, 'id' | 'script_id' | 'created_at'>>;
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
      coach_feedback: {
        Row: CoachFeedback;
        Insert: Omit<CoachFeedback, 'id' | 'created_at'>;
        Update: Partial<Omit<CoachFeedback, 'id' | 'created_at'>>;
        Relationships: [];
      };
      script_analysis: {
        Row: ScriptAnalysis;
        Insert: Omit<ScriptAnalysis, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ScriptAnalysis, 'id' | 'script_id' | 'user_id' | 'created_at' | 'updated_at'>>;
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