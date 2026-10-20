import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { Trash2, Check, RotateCcw } from 'lucide-react-native';
import { ModalSafeAreaView } from '@/components/ModalSafeAreaView';
import { rf, rp } from '@/utils/responsive';
import type { SubtitleCue } from '@/modules/subtitle-burner';
import { applySubtitleEdits, cueText, formatCueTime } from '@/utils/subtitleText';

interface Props {
  visible: boolean;
  videoUri: string;
  cues: SubtitleCue[];
  maxCharsPerLine: number;
  primaryColor: string;
  /** Subtítulos corregidos, listos para quemar. */
  onConfirm: (cues: SubtitleCue[]) => void;
  /** Guardar el vídeo sin subtítulos. */
  onSkip: () => void;
}

/**
 * Revisar los subtítulos de una Presentación antes de quemarlos (fase 2c). Arriba el vídeo con el
 * subtítulo que toca en cada momento (mismo estilo de franja que el resultado); debajo la lista
 * para corregir lo que la transcripción haya entendido mal o borrar lo que sobre. Tocar un
 * subtítulo lleva el vídeo a ese momento. Siempre oscura, como el resto de la cámara.
 */
export function SubtitleReviewModal({ visible, videoUri, cues, maxCharsPerLine, primaryColor, onConfirm, onSkip }: Props) {
  const [texts, setTexts] = useState<string[]>(() => cues.map(cueText));
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [position, setPosition] = useState(0);
  const videoRef = useRef<Video>(null);
  const listRef = useRef<FlatList<SubtitleCue>>(null);

  useEffect(() => {
    if (!visible) return;
    setTexts(cues.map(cueText));
    setRemoved(new Set());
    setPosition(0);
  }, [visible, cues]);

  const activeIndex = useMemo(
    () => cues.findIndex((c, i) => !removed.has(i) && position >= c.start && position < c.end),
    [cues, removed, position],
  );
  // Lo que se ve sobre el vídeo: el texto ya corregido, partido como quedará.
  const preview = useMemo(() => {
    if (activeIndex < 0) return null;
    return applySubtitleEdits([cues[activeIndex]], [texts[activeIndex]], maxCharsPerLine)[0]?.lines ?? null;
  }, [activeIndex, cues, texts, maxCharsPerLine]);

  const onStatus = (status: AVPlaybackStatus) => {
    if (status.isLoaded) setPosition(status.positionMillis / 1000);
  };

  const seekTo = async (cue: SubtitleCue) => {
    try {
      await videoRef.current?.setPositionAsync(Math.max(0, cue.start * 1000));
      await videoRef.current?.playAsync();
    } catch {}
  };

  const toggleRemoved = (index: number) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const confirm = () => {
    videoRef.current?.pauseAsync().catch(() => {});
    const kept = cues.map((_, i) => i).filter((i) => !removed.has(i));
    onConfirm(applySubtitleEdits(kept.map((i) => cues[i]), kept.map((i) => texts[i]), maxCharsPerLine));
  };
  const skip = () => {
    videoRef.current?.pauseAsync().catch(() => {});
    onSkip();
  };

  const maxLength = maxCharsPerLine * 2;
  const remaining = cues.length - removed.size;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => {}}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      <ModalSafeAreaView style={styles.root}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>Revisar subtítulos</Text>
            <Text style={styles.subtitle}>Corrige lo que no esté bien y toca un subtítulo para verlo en el vídeo.</Text>
          </View>

          <View style={styles.videoBox}>
            <Video
              ref={videoRef}
              source={{ uri: videoUri }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls={false}
              progressUpdateIntervalMillis={100}
              onPlaybackStatusUpdate={onStatus}
            />
            {preview && (
              <View style={styles.previewWrap} pointerEvents="none">
                <View style={styles.previewBox}>
                  {preview.map((line, i) => (
                    <Text key={`${i}-${line}`} style={styles.previewText}>{line}</Text>
                  ))}
                </View>
              </View>
            )}
            <TouchableOpacity style={styles.playBtn} onPress={() => videoRef.current?.replayAsync().catch(() => {})}
              accessibilityLabel="Reproducir desde el principio">
              <RotateCcw size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <FlatList
            ref={listRef}
            data={cues}
            keyExtractor={(cue) => `${cue.start}-${cue.end}`}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: rp(16), paddingBottom: rp(24), gap: rp(10) }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const isRemoved = removed.has(index);
              const isActive = index === activeIndex;
              return (
                <TouchableOpacity activeOpacity={0.85} onPress={() => seekTo(item)}
                  style={[styles.cue, isActive && { borderColor: primaryColor }, isRemoved && { opacity: 0.4 }]}>
                  <View style={styles.cueHeader}>
                    <Text style={[styles.cueTime, isActive && { color: '#FFFFFF' }]}>
                      {formatCueTime(item.start)} – {formatCueTime(item.end)}
                    </Text>
                    <TouchableOpacity onPress={() => toggleRemoved(index)} hitSlop={10}
                      accessibilityLabel={isRemoved ? 'Recuperar subtítulo' : 'Quitar subtítulo'}>
                      {isRemoved ? <RotateCcw size={18} color="#C7C7D1" /> : <Trash2 size={18} color="#C7C7D1" />}
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={[styles.cueInput, isRemoved && { textDecorationLine: 'line-through' }]}
                    value={texts[index]}
                    editable={!isRemoved}
                    multiline
                    maxLength={maxLength}
                    onFocus={() => seekTo(item)}
                    onChangeText={(value) => setTexts((prev) => prev.map((t, i) => (i === index ? value : t)))}
                  />
                </TouchableOpacity>
              );
            }}
          />

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={skip}>
              <Text style={styles.btnSecondaryText}>Guardar sin subtítulos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: primaryColor }, remaining === 0 && { opacity: 0.5 }]}
              onPress={confirm} disabled={remaining === 0}>
              <Check size={16} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}> Añadir subtítulos</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ModalSafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#0B0B10' },
  header: { paddingHorizontal: rp(16), paddingTop: rp(8), paddingBottom: rp(12) },
  title: { color: '#FFFFFF', fontSize: rf(20), fontWeight: '700' },
  subtitle: { color: '#A1A1AA', fontSize: rf(13), marginTop: 4 },
  videoBox: { height: '34%', backgroundColor: '#000000' },
  previewWrap: { position: 'absolute', left: 0, right: 0, bottom: '9%', alignItems: 'center', paddingHorizontal: '6%' },
  previewBox: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 3, paddingHorizontal: rp(8), paddingVertical: rp(3), alignItems: 'center',
  },
  previewText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '600', textAlign: 'center' },
  playBtn: {
    position: 'absolute', top: rp(10), right: rp(10), width: rp(36), height: rp(36), borderRadius: rp(18),
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  cue: { borderWidth: 1.5, borderColor: '#2A2A35', backgroundColor: '#16161E', borderRadius: 12, padding: rp(12) },
  cueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rp(6) },
  cueTime: { color: '#8E8E9A', fontSize: rf(12), fontWeight: '600', fontVariant: ['tabular-nums'] },
  cueInput: { color: '#FFFFFF', fontSize: rf(16), lineHeight: 22, padding: 0 },
  footer: {
    flexDirection: 'row', gap: rp(10), paddingHorizontal: rp(16), paddingTop: rp(10), paddingBottom: rp(12),
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2A2A35',
  },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: rp(14), borderRadius: 12 },
  btnSecondary: { backgroundColor: 'rgba(255,255,255,0.1)' },
  btnSecondaryText: { color: '#FFFFFF', fontSize: rf(15), fontWeight: '600' },
  btnPrimaryText: { color: '#FFFFFF', fontSize: rf(15), fontWeight: '700' },
});
