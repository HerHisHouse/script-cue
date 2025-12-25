import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Mic, Square, Play, Pause } from 'lucide-react-native';
import { rf, rp } from '@/utils/responsive';

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  duration: string;
  onRecord: () => void;
  onStop: () => void;
  onPause?: () => void;
}

export function RecordingControls({
  isRecording,
  isPaused,
  duration,
  onRecord,
  onStop,
  onPause,
}: RecordingControlsProps) {
  return (
    <View style={styles.container}>
      {isRecording && (
        <View style={styles.durationContainer}>
          <View style={styles.recordingIndicator} />
          <Text style={styles.duration}>{duration}</Text>
        </View>
      )}

      <View style={styles.controls}>
        {!isRecording ? (
          <TouchableOpacity style={styles.recordButton} onPress={onRecord}>
            <Mic size={28} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <>
            {onPause && (
              <TouchableOpacity style={styles.pauseButton} onPress={onPause}>
                {isPaused ? (
                  <Play size={24} color="#FFFFFF" />
                ) : (
                  <Pause size={24} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.stopButton} onPress={onStop}>
              <Square size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: rp(20),
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: rp(16),
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    marginRight: rp(8),
  },
  duration: {
    fontSize: rf(18),
    fontWeight: '600',
    color: '#111827',
  },
  controls: {
    flexDirection: 'row',
    gap: 16,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  pauseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
