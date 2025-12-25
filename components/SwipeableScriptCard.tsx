import React, { useRef, useState } from 'react';
import { Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Trash2 } from 'lucide-react-native';
import { Script } from '@/types/database';
import { ScriptCard } from './ScriptCard';
import { ConfirmDialog } from './ConfirmDialog';
import { rf, rp } from '@/utils/responsive';

interface SwipeableScriptCardProps {
  script: Script;
  onPress: () => void;
  onDelete: (scriptId: string) => Promise<void>;
}

export function SwipeableScriptCard({
  script,
  onPress,
  onDelete
}: SwipeableScriptCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  function handleDeletePress() {
    setShowConfirmDialog(true);
  }

  async function handleConfirmDelete() {
    setShowConfirmDialog(false);
    try {
      await onDelete(script.id);
      swipeableRef.current?.close();
    } catch (error) {
      console.error('Error deleting script:', error);
    }
  }

  function handleCancelDelete() {
    setShowConfirmDialog(false);
    swipeableRef.current?.close();
  }

  function renderRightActions(
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) {
    const translateX = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: 'clamp',
    });

    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    return (
      <Animated.View
        style={[
          styles.deleteAction,
          {
            transform: [{ translateX }],
            opacity,
          },
        ]}
      >
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeletePress}>
          <Trash2 size={24} color="#FFFFFF" />
          <Text style={styles.deleteText}>Eliminar</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        friction={2}
        overshootRight={false}
      >
        <ScriptCard script={script} onPress={onPress} />
      </Swipeable>

      <ConfirmDialog
        visible={showConfirmDialog}
        title="¿Estás seguro que quieres eliminar este guion?"
        message={`El guion "${script.title}" será eliminado permanentemente.`}
        confirmText="SÍ"
        cancelText="NO"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        destructive
      />
    </>
  );
}

const styles = StyleSheet.create({
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: rp(12),
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: rp(16),
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: rf(12),
    fontWeight: '600',
    marginTop: rp(4),
  },
});
