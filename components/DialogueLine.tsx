import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Character, DialogueContent } from '@/types/database';

interface DialogueLineProps {
  dialogue: DialogueContent;
  character?: Character;
  isUserLine?: boolean;
  hideText?: boolean;
}

export function DialogueLine({ dialogue, character, isUserLine, hideText }: DialogueLineProps) {
  const color = character?.color || '#6B7280';

  return (
    <View style={[styles.container, isUserLine && styles.userContainer]}>
      <View style={[styles.nameContainer, { backgroundColor: color + '20' }]}>
        <Text style={[styles.name, { color }]}>{dialogue.characterName}</Text>
      </View>
      {!hideText && (
        <Text style={styles.text}>{dialogue.text}</Text>
      )}
      {hideText && (
        <Text style={styles.hiddenText}>● ● ●</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  userContainer: {
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 0,
  },
  nameContainer: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
  },
  hiddenText: {
    fontSize: 16,
    color: '#9CA3AF',
    letterSpacing: 4,
  },
});
