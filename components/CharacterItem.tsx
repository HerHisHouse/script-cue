import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { User, Check } from 'lucide-react-native';
import { Character } from '@/types/database';

interface CharacterItemProps {
  character: Character;
  onPress: () => void;
  isSelected?: boolean;
}

export function CharacterItem({ character, onPress, isSelected }: CharacterItemProps) {
  return (
    <TouchableOpacity
      style={[styles.item, isSelected && styles.itemSelected]}
      onPress={onPress}
    >
      <View style={[styles.iconContainer, { backgroundColor: character.color + '20' }]}>
        <User size={20} color={character.color} />
      </View>
      <View style={styles.content}>
        <Text style={styles.name}>{character.name}</Text>
        <Text style={styles.stats}>
          {character.line_count} líneas • {character.occurrence_percentage.toFixed(1)}%
        </Text>
      </View>
      {isSelected && (
        <View style={styles.checkContainer}>
          <Check size={20} color="#10B981" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  itemSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  stats: {
    fontSize: 13,
    color: '#6B7280',
  },
  checkContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
