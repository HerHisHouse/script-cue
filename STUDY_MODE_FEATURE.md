# Study Mode - Feature Documentation

## Overview

Study Mode is an interactive rehearsal feature that helps actors practice their lines by providing a script reading experience with AI voice responses.

## Features Implemented

### 1. Script Processing
- ✅ Extracts ONLY dialogue lines from imported scripts
- ✅ Ignores stage directions and scene descriptions
- ✅ Recognizes character names from parsed script content
- ✅ Removes parenthetical directions (e.g., "(angrily)", "(pause)")
- ✅ Maintains correct dialogue order across all scenes

### 2. Visual Display
- ✅ User's lines displayed with GREEN accent color
- ✅ Other characters' lines use their assigned colors
- ✅ Clean, readable format with large text
- ✅ Previous/next line context shown dimmed
- ✅ Progress indicator showing current position

### 3. Interactive Functionality
- ✅ Text-to-speech for AI character responses
- ✅ Gender-based voice generation (male/female/neutral)
- ✅ Voice preset support (natural, warm, deep, authoritative, soft, energetic)
- ✅ Auto-progression through dialogue
- ✅ Manual controls (previous, next, pause/resume)

### 4. User Flow

```
1. User selects script from "Mis Guiones"
2. Taps "Modo Estudio" button
3. App loads and parses all dialogue lines
4. First line appears (user's line in green)
5. "Toca para continuar" indicator shows
6. User reads their line and taps screen
7. Next line appears (other character with color)
8. AI speaks the line automatically
9. Process continues through entire script
10. Manual navigation available at all times
```

## Technical Implementation

### Files Created

1. **`/utils/dialogueParser.ts`**
   - Extracts dialogue from scenes
   - Removes parentheticals
   - Creates DialogueLine objects with metadata

2. **`/app/scripts/[id]/study.tsx`**
   - Main Study Mode screen
   - Manages state and progression
   - Handles TTS playback
   - Provides UI controls

### Voice Generation

The system uses `expo-speech` for text-to-speech:

- **Spanish voices**: Language set to 'es-ES'
- **Male voices**: Lower pitch (0.85), slower rate (0.88)
- **Female voices**: Higher pitch (1.15), slightly faster rate (0.92)
- **Voice presets**: Additional modifications for personality
  - Warm: +10% pitch
  - Deep: -15% pitch
  - Authoritative: Slower, lower pitch
  - Soft: Higher pitch, normal rate
  - Energetic: +5% rate

### User Line Handling

For user lines (green background):
- Screen shows "Toca para continuar cuando termines"
- User taps anywhere on the line card to advance
- No automatic progression (user controls timing)

For AI lines (character colors):
- TTS automatically speaks the line
- Auto-advances after 800ms delay when complete
- Shows "Reproduciendo..." indicator

## Usage Instructions

### For Users

1. **Start Study Mode:**
   - Open any script
   - Tap "Modo Estudio"
   - Wait for dialogue to load

2. **Practice:**
   - Read your lines (green) aloud
   - Tap screen when finished
   - Listen to AI responses
   - Continue through script

3. **Controls:**
   - ⏮️ Previous line
   - ⏭️ Next line
   - ⏸️ Pause/Resume
   - ❌ Exit

### For Developers

**Add new voice presets:**
```typescript
// In study.tsx, modify getVoiceOptions()
switch (line.voicePreset) {
  case 'your_preset':
    options.pitch *= 1.2;
    options.rate = 0.95;
    break;
}
```

**Customize timing:**
```typescript
// After TTS completion
setTimeout(() => {
  setCurrentIndex(currentIndex + 1);
}, 800); // Change this value
```

## Future Enhancements

### Phase 2: Advanced Features
- [ ] Speech recognition for line matching
- [ ] Fuzzy matching algorithm for flexibility
- [ ] Recording user's performance
- [ ] Playback comparison

### Phase 3: Analytics
- [ ] Track practice sessions in database
- [ ] Show statistics (time per line, completion rate)
- [ ] Identify problematic lines (replayed multiple times)

### Phase 4: AI Enhancements
- [ ] Better voice quality (external TTS service)
- [ ] Emotion detection in dialogue
- [ ] Acting feedback and tips
- [ ] Multi-language support

## Known Limitations

1. **Voice Quality:**
   - Uses system TTS (quality varies by device)
   - May sound robotic
   - Limited emotion expression

2. **No Speech Recognition:**
   - User must manually tap to advance
   - Can't verify if user spoke correctly
   - Future enhancement needed

3. **Platform Differences:**
   - TTS quality varies (iOS vs Android vs Web)
   - Some voices may not be available
   - Pitch/rate control may differ

4. **Performance:**
   - Very long scripts may have memory impact
   - Consider pagination for 100+ lines

## Testing Checklist

- [x] Dialogue extraction works correctly
- [x] User lines show green accent
- [x] Other lines show character colors
- [x] TTS plays for AI lines
- [x] Manual tap advances user lines
- [x] Previous/Next buttons work
- [x] Pause/Resume functions
- [x] Progress bar updates
- [x] Exit returns to script detail
- [ ] Test with multiple characters
- [ ] Test with long scripts (50+ lines)
- [ ] Test with various voice presets
- [ ] Test on iOS device
- [ ] Test on Android device
- [ ] Test on web browser

## Troubleshooting

**Issue:** No dialogue appears
- **Solution:** Check that script has parsed content in scenes
- **Solution:** Verify characters are properly assigned

**Issue:** TTS not working
- **Solution:** Check device volume
- **Solution:** Verify expo-speech is installed
- **Solution:** Check platform compatibility

**Issue:** Wrong character colors
- **Solution:** Verify character names match exactly
- **Solution:** Check case sensitivity in character matching

**Issue:** App crashes with long scripts
- **Solution:** Implement pagination
- **Solution:** Load dialogues in chunks

## API Reference

### DialogueLine Interface
```typescript
interface DialogueLine {
  id: string;              // Unique identifier
  characterId: string;     // Character UUID
  characterName: string;   // Display name
  text: string;            // Original text with parentheticals
  cleanText: string;       // Text for TTS (no parentheticals)
  color: string;           // Hex color code
  voiceGender: string;     // 'male' | 'female' | 'neutral'
  voicePreset: string;     // Voice personality
  isUserCharacter: boolean;// Is this the user's character?
  orderIndex: number;      // Position in script
  sceneId: string;         // Scene UUID
}
```

### Functions

**extractDialogue(scenes, characters)**
- Extracts dialogue lines from scenes
- Returns array of DialogueLine objects

**getDialogueStats(lines)**
- Returns statistics about dialogue
- Total lines, user lines, character counts

**removeParentheticals(text)**
- Strips parenthetical directions
- Returns clean text for TTS

## Support

For issues or questions:
1. Check this documentation
2. Review console logs for errors
3. Verify all dependencies installed
4. Test on different device/platform
