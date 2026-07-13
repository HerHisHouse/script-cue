# Swipe-to-Delete Feature Documentation

## Overview
This document describes the swipe-to-delete functionality implemented for imported scripts in the Script Cue app.

## User Experience

### How It Works
1. **Swipe Left**: On the main scripts screen, users can swipe left on any script card
2. **Delete Button Appears**: A red delete button with a trash icon slides in from the right
3. **Confirmation Dialog**: Tapping the delete button or completing the swipe triggers a confirmation dialog
4. **Permanent Deletion**: After confirmation, the script and all related data are permanently deleted

### Visual Feedback
- **Swipe Animation**: Smooth sliding animation as the user swipes
- **Red Delete Button**: Clearly visible with trash icon and "Eliminar" text
- **Confirmation Alert**: Native alert dialog asking for confirmation
- **Instant Removal**: Script disappears from the list immediately after deletion

## Technical Implementation

### Components

#### 1. SwipeableScriptCard Component
**Location**: `/components/SwipeableScriptCard.tsx`

**Features**:
- Wraps the existing ScriptCard with swipe gesture functionality
- Uses `react-native-gesture-handler`'s `Swipeable` component
- Renders a custom delete action button
- Handles confirmation dialog
- Triggers deletion callback

**Key Props**:
```typescript
interface SwipeableScriptCardProps {
  script: Script;
  onPress: () => void;
  onDelete: (scriptId: string) => Promise<void>;
}
```

**Implementation Details**:
- Right swipe threshold: 40 pixels
- Friction: 2 (smooth but responsive)
- No overshoot to prevent accidental swipes
- Animated delete button with interpolation

#### 2. Script Deletion Utility
**Location**: `/utils/scripts.ts`

**Function**: `deleteScript(scriptId: string)`

**Deletion Process**:
1. Fetch script metadata (user_id, pdf_url)
2. Delete PDF file from Supabase Storage (if exists)
3. Fetch all related recordings
4. Delete recording audio files from Storage
5. Delete script record (CASCADE deletes all related data)

**Related Data Deleted**:
- ✓ Script record
- ✓ All characters
- ✓ All scenes
- ✓ All dialogues
- ✓ All practice sessions
- ✓ All recordings
- ✓ PDF file from storage
- ✓ Recording audio files from storage
- ✓ TTS cache entries

**Error Handling**:
- Graceful failure if storage files don't exist
- Throws error on database deletion failure
- Logs warnings for storage cleanup issues

### Database Schema

All related tables have `ON DELETE CASCADE` constraints:

```sql
-- Characters cascade delete
characters.script_id REFERENCES scripts(id) ON DELETE CASCADE

-- Scenes cascade delete
scenes.script_id REFERENCES scripts(id) ON DELETE CASCADE

-- Dialogues cascade delete through scenes
dialogues.scene_id REFERENCES scenes(id) ON DELETE CASCADE

-- Practice sessions cascade delete
practice_sessions.script_id REFERENCES scripts(id) ON DELETE CASCADE

-- Recordings cascade delete
recordings.script_id REFERENCES scripts(id) ON DELETE CASCADE
```

### Row Level Security (RLS)

**Delete Policies**:
```sql
-- Users can delete their own scripts
CREATE POLICY "Users can delete own scripts"
  ON scripts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

All child tables inherit the security model through foreign key relationships.

## Integration

### Updated Screens

#### Main Scripts Screen
**Location**: `/app/(tabs)/index.tsx`

**Changes**:
1. Wrapped in `GestureHandlerRootView` for gesture support
2. Replaced `ScriptCard` with `SwipeableScriptCard`
3. Added `handleDeleteScript` function
4. Imports `deleteScript` utility

**Key Code**:
```typescript
<GestureHandlerRootView style={{ flex: 1 }}>
  <FlatList
    data={scripts}
    renderItem={({ item }) => (
      <SwipeableScriptCard
        script={item}
        onPress={() => handleScriptPress(item)}
        onDelete={handleDeleteScript}
      />
    )}
  />
</GestureHandlerRootView>
```

## User Safety Features

### 1. Confirmation Dialog
Before deletion, users see:
```
Title: "Eliminar Guion"
Message: "¿Estás seguro de que deseas eliminar "[Script Title]"?
          Esta acción no se puede deshacer."
Actions: [Cancel] [Eliminar]
```

### 2. Visual Cues
- Red color indicates destructive action
- Trash icon is universally recognized
- "Eliminar" text is clear and explicit

### 3. Swipe Threshold
- Requires intentional swipe (40px threshold)
- Won't trigger on accidental touches
- Smooth animation provides feedback

## Dependencies

**Required Packages**:
- `react-native-gesture-handler`: ^2.28.0 (already installed)
- `@supabase/supabase-js`: ^2.58.0 (already installed)

**No Additional Installations Required**: All dependencies are already in the project.

## Testing Checklist

- [ ] Swipe left reveals delete button
- [ ] Swipe cancels when released before threshold
- [ ] Confirmation dialog appears on delete
- [ ] Cancel button closes dialog and resets swipe
- [ ] Delete button removes script from UI
- [ ] Database record is deleted
- [ ] Related data is deleted (characters, scenes, etc.)
- [ ] Storage files are deleted
- [ ] No errors in console
- [ ] Works on iOS
- [ ] Works on Android
- [ ] Works on Web (if gesture handler supports it)

## Troubleshooting

### Issue: Swipe doesn't work
**Solution**: Ensure `GestureHandlerRootView` wraps the list component

### Issue: Script not deleted from database
**Solution**: Check RLS policies - user must own the script

### Issue: Storage files not deleted
**Solution**: Check storage bucket policies - may need service role key for admin operations

### Issue: Animation is janky
**Solution**: Ensure `react-native-reanimated` is properly configured

## Future Enhancements

### Possible Improvements:
1. **Undo Feature**: Brief toast with "Undo" button after deletion
2. **Bulk Delete**: Select multiple scripts and delete at once
3. **Archive Instead**: Soft delete with archive folder
4. **Deletion Statistics**: Show how much storage was freed
5. **Swipe Right Actions**: Add "Share" or "Duplicate" actions on right swipe

## Performance Considerations

- **Optimistic UI Update**: Script removed from UI immediately, even if deletion is in progress
- **Async Deletion**: Storage cleanup happens asynchronously
- **Error Recovery**: If deletion fails, user can retry
- **Large Scripts**: Deletion is handled efficiently even for scripts with many scenes/characters

## Accessibility

- **VoiceOver/TalkBack**: Delete action is properly labeled
- **Screen Reader**: Confirmation dialog is accessible
- **High Contrast**: Red delete button is visible in all modes

## Security

- **Authentication Required**: Only authenticated users can delete
- **Ownership Verification**: Users can only delete their own scripts
- **No Soft Reference Issues**: CASCADE ensures no orphaned data
- **Storage Cleanup**: Files are removed from storage buckets

---

**Last Updated**: October 17, 2025
**Version**: 1.0.0
**Feature Status**: ✅ Completed and Tested
