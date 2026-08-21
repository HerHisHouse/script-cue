# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Script Cue (`es.scriptcue.app`) is a React Native + Expo app for actors to import PDF scripts, auto-detect
characters/dialogue, and rehearse scenes against AI-generated voices reading the other characters' lines.
Product/UX details for the practice modes (Studio, Car, Memory, Casting/self-tape, Coach) are documented in
`docs/script_cue_overview.md` — read it before touching any of those modes, since the UX intent isn't obvious
from the code alone.

The repo has three runtime pieces:
- **`app/`** — the Expo Router mobile/web client (this is what `npm run dev` runs).
- **`supabase/functions/`** — Deno edge functions (Postgres/Auth/Storage lives in Supabase).
- **`server/`** — a separate Node/Express microservice (`audio-merge-server`), deployed to Render
  (see `render.yaml`), with its own `package.json`/`node_modules`. It does the heavy lifting Supabase Edge
  Functions can't: ffmpeg audio/video mixing, video compression, and some TTS provider calls (Azure, Hume).

## Commands

Run from the repo root (client) unless noted.

```bash
npm run dev          # expo start (EXPO_NO_TELEMETRY=1)
npm run ios          # expo run:ios
npm run android      # expo run:android
npm run build:web    # expo export --platform web

npm run typecheck    # tsc --noEmit
npm run lint         # expo lint
npm run static-checks # tools/static-checks.js — custom pattern checks, see below
npm run ci           # typecheck && lint && static-checks — run this before considering a change done
npm test             # jest (ts-jest), test files under __tests__/**/*.test.ts
```

Single test file: `npx jest __tests__/dialogueStructured.test.ts`

The `server/` microservice has its own dependency tree and is not part of `npm run ci`:
```bash
cd server && npm install && npm start   # runs index.js on $PORT (defaults 3000)
```

### `tools/static-checks.js`

Not a linter config — a small hand-rolled script that greps `app/` and `utils/` for recurring mistakes in this
codebase and fails the build if it finds them:
- `expo-file-system` imported without the `/legacy` subpath (this project pins to the legacy FS API throughout)
- `key={index}` in list rendering
- `FileSystem.*` used behind a `Platform.OS === "web"` check (FileSystem isn't available on web)
- `atob(` used under `app/`
- `expo-sharing` imported without an `Sharing.isAvailableAsync` guard

It also runs a few inline unit tests for the dialogue-parsing name-normalization logic at the bottom of the same
file. Treat failures here as real bugs to fix, not noise to bypass.

## Architecture

### Client structure (Expo Router, file-based routes under `app/`)

- `app/(tabs)/` — bottom tab screens: Mis Guiones (`index`), Grabaciones, Mis Proyectos, Comunidad, Ajustes.
- `app/scripts/[id]/` — everything scoped to one script: `index` (overview), `editor`, and the practice modes
  (`studio-v2`, `car`, `casting`, `coach`, `analysis`, `memory/*`, `chubbuck-guide`).
- `contexts/AuthContext.tsx` and `contexts/ThemeContext.tsx` wrap the whole app in `app/_layout.tsx`; auth
  redirect logic (send unauthenticated users to `/auth`) lives in that root layout.
- **Headers are always hidden.** Every `_layout.tsx` in the route tree sets `headerShown: false`, and every
  screen builds its own header from scratch with `SafeAreaView`. This is a deliberate, repo-wide rule (see
  `.agent/HEADERS_OCULTOS.md`) — never rely on the native Expo Router header, and set `headerShown: false`
  whenever you add a new route or layout.
- `utils/` holds most business logic as plain modules rather than hooks/services: `pdfParser.ts` /
  `dialogueParser.ts` (script → characters/scenes/dialogue), `tts.ts` / `ttsCache.ts` / `tts/` (TTS provider
  abstraction + Supabase-Storage-backed audio cache, keyed by text hash), `voiceService.ts` (provider/voice
  catalog for OpenAI/ElevenLabs/Azure/Hume/system), `audio.ts` / `audioMode.ts` / `trackPlayerService.ts`
  (playback), `storage.ts` / `supabase.ts` (Supabase client + file storage), `cache.ts` / `metrics.ts`
  (generic cache + usage counters).
- `services/` is a smaller, newer layer (`parseScript.ts`, `transcription.ts`, `playbackService.ts` for
  react-native-track-player background audio).

### TTS provider abstraction

Multiple TTS backends are supported per-character: `system` (device TTS, free), `hume` ("Natural"),
`elevenlabs` ("Expresiva", emotion-configurable), plus `openai` and `azure`. Each provider has an adapter in
`utils/tts/adapters/*.adapter.ts` implementing `TTSAdapter.buildInput()` (`utils/tts/types.ts`); `voiceService.ts`
holds the voice catalog and `ttsCache.ts` is the cache-first entry point that hashes text+voice config, checks
Supabase Storage/`tts_cache` table before generating new audio, and calls the Azure/Hume paths through the
`server/` microservice's `/tts-azure` and `/tts-hume` endpoints. When adding a new practice mode or changing how
lines are read aloud, go through this cache-first path rather than calling a provider SDK directly.

### Backend split: Supabase Edge Functions vs. `server/` (Render)

Decide which side new backend logic belongs on:
- **Supabase Edge Functions** (`supabase/functions/*`, Deno) — auth-gated, lightweight, close to the DB:
  `parse-pdf` (PDF → characters/scenes via GPT-4o-mini), `generate-speech`, `transcribe-audio`, `process-ocr`,
  `process-session`, `generate-script-analysis`, `delete-script`, `welcome-email`, `upload-segment`. These are
  excluded from the root `tsconfig.json`/eslint config (different module resolution/runtime) — don't expect
  `npm run typecheck`/`lint` to cover them.
- **`server/` Express app** (`index.js`, deployed per `render.yaml`) — anything needing ffmpeg or a heavier
  native dependency: `/merge` and `/process-casting` (mix TTS audio with a recorded video/audio take),
  `/compress-video`, `/analyze-recording` (Coach mode feedback), `/generate-quiz`, `/tts-azure` / `/tts-hume`
  (providers without a convenient Deno/edge SDK), `/api/azure/voices`, `/api/tts/preview/:provider/:voiceId`,
  `/usage/summary`. It logs per-call API cost estimates to the `api_usage` table via `logApiUsage()`
  (`API_COSTS` table near the top of `index.js`) — follow that pattern when adding a new paid-API call so cost
  tracking stays consistent.

### Database

Supabase Postgres, migrations in `supabase/migrations/` (timestamp-prefixed, applied in order — add new schema
changes as a new migration file, never edit an old one). Core tables: `profiles`, `scripts`, `characters`,
`scenes`, `dialogues`/lines, `practice_sessions`, `recordings`, `tts_cache`, `projects`/folders, `casting_jobs`,
`api_usage`. Storage buckets: `scripts` (PDFs), `recordings`, `avatars`.

### Native config quirks worth knowing

- `plugins/` has several custom Expo config plugins applied in `app.json`: `withAndroidNetworkConfig.js`,
  `withAudioEchoCancellation.js` (backs the `modules/audio-echo-cancellation` native module used to mute the
  user's mic while AI dialogue plays, e.g. in Casting mode), plus `withTrackPlayer.js` / `withFfmpegKit.js` used
  during native builds.
- `newArchEnabled: true` (New Architecture) and `typedRoutes: true` are both on.
- `expo-file-system/legacy` is used everywhere on purpose (not the new FS API) — see the static-checks rule
  above.
- iOS `NSAppTransportSecurity` carves out an insecure-HTTP exception specifically for the Render server domain.

## Repo hygiene notes

- Build artifacts (`.aab`, `.apk`) are gitignored, but `.ipa` is **not** — check `git status` before committing
  after a build; stray `build-*.ipa` files at the repo root are a recurring issue, not intentional additions.
- The root directory accumulates many dated `*.md` postmortem/change-log files (e.g. `CASTING_MODE_*.md`,
  `FIX_*.md`, `ANDROID_FIXES_*.md`) and one-off `fix_*.py`/`.js` scripts from past sessions. These are historical
  notes, not living docs — don't treat them as current architecture, and don't assume the scripts still apply to
  the current schema/UI before running them.
