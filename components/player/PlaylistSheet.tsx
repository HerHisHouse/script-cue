import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { GripVertical, Headphones, Video as VideoIcon } from 'lucide-react-native';

const ACCENT = '#a78bfa';

export interface PlaylistTrack {
  id: string;
  name: string;
  duration: string;
  kind: 'audio' | 'video';
  isPlaying: boolean;
}

interface PlaylistSheetProps {
  visible: boolean;
  onClose: () => void;
  tracks: PlaylistTrack[];
  onReorder: (newOrder: PlaylistTrack[]) => void;
  onSelectTrack: (id: string) => void;
  isDark: boolean;
}

export function PlaylistSheet({ visible, onClose, tracks, onReorder, onSelectTrack, isDark }: PlaylistSheetProps) {
  const insets = useSafeAreaInsets();
  const textPrimary = isDark ? '#ffffff' : '#241d3d';
  const textSecondary = isDark ? '#a0a0c0' : '#5c5678';
  const rowBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(120,100,160,0.16)';
  const rowBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.5)';
  const activeRowBg = isDark ? 'rgba(124,106,247,0.16)' : 'rgba(124,106,247,0.10)';

  const renderItem = ({ item, drag, isActive }: RenderItemParams<PlaylistTrack>) => (
    <Pressable
      onLongPress={drag}
      onPress={() => onSelectTrack(item.id)}
      disabled={isActive}
      style={[
        styles.row,
        item.isPlaying
          ? { backgroundColor: activeRowBg, borderColor: ACCENT }
          : { backgroundColor: rowBg, borderColor: rowBorder },
      ]}
    >
      <View style={styles.rowIcon}>
        {item.isPlaying ? (
          <View style={styles.nowPlayingBars}>
            {[14, 22, 10, 18].map((h, i) => (
              <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: ACCENT, marginHorizontal: 2 }} />
            ))}
          </View>
        ) : item.kind === 'audio' ? (
          <Headphones size={20} color={ACCENT} />
        ) : (
          <VideoIcon size={18} color={ACCENT} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, { color: textPrimary }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.rowDuration, { color: textSecondary }]}>{item.duration}</Text>
      </View>
      <Pressable onLongPress={drag} hitSlop={12} style={{ paddingLeft: 12 }}>
        <GripVertical size={20} color={textSecondary} />
      </Pressable>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.40)' : 'rgba(235,230,245,0.40)' }]} />
          <View style={styles.handle} />
          <Text style={[styles.title, { color: textPrimary }]}>Playlist</Text>
          <Text style={[styles.count, { color: textSecondary }]}>{tracks.length} {tracks.length === 1 ? 'pista' : 'pistas'}</Text>
          <DraggableFlatList
            data={tracks}
            onDragEnd={({ data }) => onReorder(data)}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20) }}
          />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: '62%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingTop: 12,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,150,150,0.35)', marginBottom: 16 },
  title: { fontSize: 19, fontWeight: '700', paddingHorizontal: 24, letterSpacing: 0.5 },
  count: { fontSize: 13, marginBottom: 16, paddingHorizontal: 24, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 12,
    marginBottom: 10,
  },
  rowIcon: { marginRight: 10, width: 22, alignItems: 'center' },
  rowName: { fontSize: 14, fontWeight: '600' },
  rowDuration: { fontSize: 12, marginTop: 2 },
  nowPlayingBars: { flexDirection: 'row', alignItems: 'center' },
});
