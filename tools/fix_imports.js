const fs = require('fs');

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');

  // Remove dynamic imports
  content = content.replace(/.*const\s+\{\s*generateAndCacheAudio\s*\}\s*=\s*await\s+import\('@\/utils\/ttsCache'\);\n/g, '');
  content = content.replace(/.*const\s+AsyncStorage\s*=\s*\(await\s+import\('@react-native-async-storage\/async-storage'\)\)\.default;\n/g, '');
  content = content.replace(/.*const\s+AsyncStorage\s*=\s*\n\s*\(await\s+import\('@react-native-async-storage\/async-storage'\)\)\.default;\n/g, '');
  content = content.replace(/.*const\s+\{\s*extractDialogue\s*\}\s*=\s*await\s+import\('@\/utils\/dialogueParser'\);\n/g, '');
  content = content.replace(/.*const\s+\{\s*enableRecordingMode\s*\}\s*=\s*await\s+import\('@\/utils\/audioMode'\);\n/g, '');
  content = content.replace(/.*const\s+\{\s*setAudioModeForPlayback\s*\}\s*=\s*await\s+import\('@\/utils\/audioMode'\);\n/g, '');
  content = content.replace(/.*const\s+\{\s*getElevenLabsVoices\s*\}\s*=\s*await\s+import\('@\/utils\/voiceService'\);\n/g, '');

  fs.writeFileSync(file, content);
}

const files = [
  'app/scripts/[id]/casting.tsx',
  'app/scripts/[id]/memory/reinforcement.tsx',
  'app/scripts/[id]/memory/echo.tsx',
  'app/scripts/[id]/index.tsx'
];

files.forEach(fixFile);

// For casting.tsx, add static imports
let casting = fs.readFileSync('app/scripts/[id]/casting.tsx', 'utf8');
if (!casting.includes('import AsyncStorage')) {
  casting = casting.replace(
    "import { DialogueLine } from '@/utils/dialogueParser';",
    "import { DialogueLine, extractDialogue } from '@/utils/dialogueParser';"
  );
  casting = casting.replace(
    "import { loadDialogueLines } from '@/utils/loadDialogueLines';",
    "import { loadDialogueLines } from '@/utils/loadDialogueLines';\nimport { generateAndCacheAudio } from '@/utils/ttsCache';\nimport AsyncStorage from '@react-native-async-storage/async-storage';"
  );
  fs.writeFileSync('app/scripts/[id]/casting.tsx', casting);
}

// For memory/reinforcement.tsx
let reinf = fs.readFileSync('app/scripts/[id]/memory/reinforcement.tsx', 'utf8');
if (!reinf.includes('enableRecordingMode')) {
  reinf = reinf.replace(
    "import { Audio, InterruptionModeIOS } from 'expo-av';",
    "import { Audio, InterruptionModeIOS } from 'expo-av';\nimport { enableRecordingMode } from '@/utils/audioMode';"
  );
  fs.writeFileSync('app/scripts/[id]/memory/reinforcement.tsx', reinf);
}

// For memory/echo.tsx
let echo = fs.readFileSync('app/scripts/[id]/memory/echo.tsx', 'utf8');
if (!echo.includes('setAudioModeForPlayback')) {
  echo = echo.replace(
    "import { Audio, InterruptionModeIOS } from 'expo-av';",
    "import { Audio, InterruptionModeIOS } from 'expo-av';\nimport { setAudioModeForPlayback, enableRecordingMode } from '@/utils/audioMode';\nimport { generateAndCacheAudio } from '@/utils/ttsCache';"
  );
  fs.writeFileSync('app/scripts/[id]/memory/echo.tsx', echo);
}

// For index.tsx
let idx = fs.readFileSync('app/scripts/[id]/index.tsx', 'utf8');
if (!idx.includes('getElevenLabsVoices')) {
  idx = idx.replace(
    "import { getSettings } from '@/utils/appSettings';",
    "import { getSettings } from '@/utils/appSettings';\nimport { getElevenLabsVoices } from '@/utils/voiceService';"
  );
  fs.writeFileSync('app/scripts/[id]/index.tsx', idx);
}
console.log('Fixed all remaining files');
