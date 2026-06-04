import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  TextInput, Modal, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { generateAndCacheAudio, invalidateCacheForLine } from '@/utils/ttsCache';
import { rf, rp } from '@/utils/responsive';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Edit, Trash2, Plus, CheckCircle, X, Save, Check } from 'lucide-react-native';

const REVIEW_INFO_KEY = 'hideReviewInfoV2';

export default function ReviewScreen() {
  const router = useRouter();
  const { id, force } = useLocalSearchParams<{ id: string; force?: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();

  const [lines, setLines] = useState<DialogueLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmProgress, setConfirmProgress] = useState(0);
  const [confirmTotal, setConfirmTotal] = useState(0);

  // Edit modal — separate from list to avoid keyboard/scroll conflicts
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingLine, setEditingLine] = useState<DialogueLine | null>(null);
  const [editText, setEditText] = useState('');
  const [editSelectedChar, setEditSelectedChar] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Add line modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLineText, setNewLineText] = useState('');

  // Emotion selector modal
  const [emotionModalVisible, setEmotionModalVisible] = useState(false);
  const [activeEmotionLineId, setActiveEmotionLineId] = useState<string | null>(null);

  const EMOTIONS = [
    { label: 'Neutral', value: 'neutral' },
    { label: 'Susurrando', value: 'whispering' },
    { label: 'Gritando', value: 'shouting' },
    { label: 'Llorando', value: 'crying' },
    { label: 'Riendo', value: 'laughing' },
    { label: 'Enfadado/a', value: 'angry' },
    { label: 'Emocionado/a', value: 'excited' },
    { label: 'Triste', value: 'sad' },
    { label: 'Asustado/a', value: 'fearful' },
    { label: 'Tierno/a', value: 'tender' }
  ];

  const translateEmotion = (val: string) => EMOTIONS.find(e => e.value === val)?.label || 'Neutral';

  const handleEmotionSelect = async (emotionVal: string) => {
    if (!activeEmotionLineId) return;
    
    // Optimistic UI update
    setLines(prev => prev.map(l => {
      if (l.id === activeEmotionLineId) {
        return {
          ...l,
          voiceDirection: emotionVal === 'neutral' ? null : { emotion: emotionVal, intensity: 0.8 }
        };
      }
      return l;
    }));

    setEmotionModalVisible(false);

    // Update DB silently
    const updatePayload = emotionVal === 'neutral' ? null : { emotion: emotionVal, intensity: 0.8 };
    try {
      await supabase.from('lines').update({ voice_direction: updatePayload }).eq('id', activeEmotionLineId);
      // Invalidar caché TTS para que se regenere con la nueva emoción
      await invalidateCacheForLine(activeEmotionLineId);
      console.log(`[Review] 🗑️ Caché TTS invalidada para línea ${activeEmotionLineId} (nueva emoción: ${emotionVal})`);
    } catch (e) {
      console.error('Error updating voice_direction:', e);
    }
  };
  const [showReviewInfo, setShowReviewInfo] = useState(false);
  const [dontShowReviewInfoAgain, setDontShowReviewInfoAgain] = useState(false);
  
  const [showAddLineInfo, setShowAddLineInfo] = useState(false);
  const [dontShowAddLineInfoAgain, setDontShowAddLineInfoAgain] = useState(false);

  const [characters, setCharacters] = useState<any[]>([]);
  const [selectedChar, setSelectedChar] = useState<any>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !user) return;
    const init = async () => {
      try {
        const { data: script } = await supabase
          .from('scripts').select('reviewed').eq('id', id).single();

        if (script?.reviewed && force !== '1') {
          router.replace(`/scripts/${id}` as any);
          return;
        }

        const hidden = await AsyncStorage.getItem(REVIEW_INFO_KEY);
        if (!hidden) {
          setShowReviewInfo(true);
        }

        const [loadedLines, charsResult] = await Promise.all([
          loadDialogueLines(id),
          supabase.from('characters').select('*').eq('script_id', id),
        ]);
        setLines(loadedLines);
        setCharacters(charsResult.data || []);
      } catch (e) {
        console.error('[Review] Error loading:', e);
        Alert.alert('Error', 'No se pudo cargar el guion');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, user]);

  // ── Persist order ─────────────────────────────────────────────────────────
  const syncOrder = useCallback(async (newLines: DialogueLine[]) => {
    if (!user) return;
    const updates = newLines.map((l, i) => ({
      id: l.id, order_index: i + 1,
      scene_id: l.sceneId, character_name: l.characterName, content: l.text,
    }));
    const { error } = await supabase.from('lines').upsert(updates);
    if (error) console.error('[Review] syncOrder error:', error);
  }, [user]);

  // ── Edit (via bottom-sheet modal — keyboard-safe) ─────────────────────────
  const openEditModal = (line: DialogueLine) => {
    setEditingLine(line);
    setEditText(line.text);
    if (line.isAction) {
      setEditSelectedChar(null);
    } else {
      const foundChar = characters.find(c => c.name.toLowerCase().trim() === line.characterName.toLowerCase().trim());
      setEditSelectedChar(foundChar || null);
    }
    setEditModalVisible(true);
  };

  const saveEdit = async () => {
    if (!editingLine) return;
    setIsSaving(true);
    try {
      const charName = editSelectedChar ? editSelectedChar.name : 'ACCIÓN';
      const charId = editSelectedChar ? editSelectedChar.id : 'action-card';

      const { error } = await supabase
        .from('lines').update({ 
          content: editText,
          character_name: charName
        }).eq('id', editingLine.id);
      if (error) throw error;
      
      setLines(prev => prev.map(l =>
        l.id === editingLine.id
          ? { 
              ...l, 
              text: editText, 
              cleanText: editText.replace(/\([^)]*\)/g, '').trim(),
              characterName: charName,
              characterId: charId,
              isAction: editSelectedChar === null,
              color: editSelectedChar ? (editSelectedChar.color || '#6B7280') : colors.primary,
              voiceGender: editSelectedChar ? (editSelectedChar.voice_gender || 'neutral') : 'neutral',
              isUserCharacter: editSelectedChar ? (editSelectedChar.is_user_character || false) : false,
            }
          : l
      ));
      setEditModalVisible(false);
      setEditingLine(null);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la edición');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteLine = (lineId: string) => {
    Alert.alert('Eliminar línea', '¿Seguro que quieres eliminar esta línea?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('lines').delete().eq('id', lineId);
          if (error) { Alert.alert('Error', 'No se pudo eliminar'); return; }
          setLines(prev => prev.filter(l => l.id !== lineId));
        }
      },
    ]);
  };

  // ── Add line ──────────────────────────────────────────────────────────────
  const addLine = async () => {
    if ((!selectedChar && selectedChar !== null) || !newLineText.trim()) return;
    setIsSaving(true);
    try {
      const sceneId = lines[lines.length - 1]?.sceneId;
      if (!sceneId) throw new Error('No scene found');
      const newOrderIndex = lines.length + 1;

      const charName = selectedChar ? selectedChar.name : 'ACCIÓN';
      const charId = selectedChar ? selectedChar.id : 'action-card';

      const { data, error } = await supabase
        .from('lines')
        .insert({ scene_id: sceneId, character_name: charName, content: newLineText.trim(), order_index: newOrderIndex })
        .select().single();
      if (error) throw error;

      const newLine: DialogueLine = {
        id: data.id, characterId: charId, characterName: charName,
        text: data.content, cleanText: data.content.replace(/\([^)]*\)/g, '').trim(),
        color: selectedChar ? (selectedChar.color || '#6B7280') : colors.primary,
        voiceGender: selectedChar ? (selectedChar.voice_gender || 'neutral') : 'neutral',
        voicePreset: 'natural', isUserCharacter: selectedChar ? (selectedChar.is_user_character || false) : false,
        isAction: selectedChar === null,
        orderIndex: newOrderIndex, sceneId,
      };
      setLines(prev => [...prev, newLine]);
      setShowAddModal(false);
      setNewLineText('');
      setSelectedChar(null);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo añadir la línea');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Confirm & generate TTS ────────────────────────────────────────────────
  const confirmAndGenerate = () => {
    Alert.alert(
      'Confirmar guion',
      `Se generarán voces para ${lines.filter(l => !l.isUserCharacter && !l.isAction).length} líneas de IA. ¿Continuar?`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', onPress: doConfirm }]
    );
  };

  const doConfirm = async () => {
    if (!user) return;
    setIsConfirming(true);
    try {
      await supabase.from('scripts').update({ reviewed: true }).eq('id', id);
      await syncOrder(lines);

      const aiLines = lines.filter(l => !l.isUserCharacter && !l.isAction);
      setConfirmTotal(aiLines.length);

      const { data: charRows } = await supabase.from('characters').select('*').eq('script_id', id);

      for (let i = 0; i < aiLines.length; i++) {
        const line = aiLines[i];
        setConfirmProgress(i + 1);
        const char = charRows?.find(c => c.name.toLowerCase().trim() === line.characterName.toLowerCase().trim());
        const provider = char?.voice_provider || 'openai';
        const voiceId = char?.voice_id || 'nova';
        try {
          await generateAndCacheAudio(id as string, line.id, line.characterName, line.text, { provider, voiceId }, user.id, line.voiceDirection);
        } catch (e) {
          console.warn(`[Review] TTS failed for line ${line.id}:`, e);
        }
      }
      router.replace(`/scripts/${id}` as any);
    } catch (e) {
      console.error('[Review] Confirm error:', e);
      Alert.alert('Error', 'Hubo un problema al confirmar. Inténtalo de nuevo.');
      setIsConfirming(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.center, { flex: 1, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Cargando guion…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[s.container, { backgroundColor: colors.surface }]}>

        {/* ── Header ── */}
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[s.headerTitle, { color: colors.text, textAlign: 'center' }]}>Revisar guion</Text>
            <Text style={[s.headerSub, { color: colors.textSecondary, textAlign: 'center' }]}>
              {lines.length} líneas · Usa ≡ para reordenar
            </Text>
          </View>
          <TouchableOpacity onPress={async () => {
            const hidden = await AsyncStorage.getItem('hideAddLineInfoV2');
            if (hidden !== 'true') {
              setShowAddLineInfo(true);
            } else {
              setShowAddModal(true);
            }
          }} style={[s.addBtn, { backgroundColor: colors.primary }]}>
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Draggable list ── */}
        <DraggableFlatList
          data={lines}
          keyExtractor={item => item.id}
          onDragBegin={() => Haptics.selectionAsync()}
          onDragEnd={({ data }) => { setLines(data); syncOrder(data); }}
          containerStyle={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={{ paddingHorizontal: rp(16), paddingTop: rp(12), paddingBottom: 140 }}
          renderItem={({ item, drag, isActive, getIndex }) => {
            const index = getIndex() ?? 0;
            const charColor = item.isAction ? colors.primary : (item.isUserCharacter ? '#10B981' : (item.color || colors.primary));
            const charData = characters.find(c => c.name.toLowerCase().trim() === item.characterName.toLowerCase().trim());
            const isElevenLabs = charData?.voice_provider === 'elevenlabs';
            
            return (
              <ScaleDecorator activeScale={1.02}>
                <View style={[s.card, {
                  backgroundColor: colors.surface,
                  borderColor: charColor,
                  borderStyle: item.isAction ? 'dashed' : 'solid',
                  borderWidth: item.isAction ? 2 : 1.5,
                  shadowColor: isActive ? charColor : 'transparent',
                  shadowOpacity: isActive ? 0.3 : 0,
                  shadowRadius: 8, elevation: isActive ? 6 : 1,
                }]}>
                  <View style={[s.colorBar, { backgroundColor: charColor }]} />
                  <View style={{ flex: 1, padding: rp(12) }}>
                    <View style={s.cardHeader}>
                      <Text style={[s.charName, { color: charColor }]}>
                        {item.isAction ? 'TARJETA DE ACCIÓN' : item.characterName}
                        {!item.isAction && (
                          <Text style={[s.badge, { color: colors.textSecondary }]}>
                            {item.isUserCharacter ? '  · TÚ' : '  · IA'}
                          </Text>
                        )}
                      </Text>
                      <Text style={[s.lineNum, { color: colors.textSecondary }]}>#{index + 1}</Text>
                    </View>
                    <Text style={[s.dialogueText, { color: colors.text }]}>{item.text}</Text>
                    
                    {!item.isAction && !item.isUserCharacter && isElevenLabs && (
                      <TouchableOpacity 
                        style={{ marginTop: rp(8), flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}
                        onPress={() => {
                          setActiveEmotionLineId(item.id);
                          setEmotionModalVisible(true);
                        }}
                      >
                        <Text style={{ marginRight: 6 }}>🎭</Text>
                        <View style={{
                            backgroundColor: item.voiceDirection ? charColor + '20' : colors.border,
                            paddingHorizontal: rp(8),
                            paddingVertical: rp(4),
                            borderRadius: rp(12),
                        }}>
                          <Text style={{ 
                            fontSize: rf(12), 
                            color: item.voiceDirection ? charColor : colors.textSecondary,
                            fontWeight: item.voiceDirection ? '600' : '400'
                          }}>
                             {item.voiceDirection ? translateEmotion(item.voiceDirection.emotion) : 'Neutral'} ▾
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    <View style={s.lineActions}>
                      <TouchableOpacity onPress={() => openEditModal(item)} style={s.iconBtn}>
                        <Edit size={15} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteLine(item.id)} style={s.iconBtn}>
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {/* Drag handle */}
                  <TouchableOpacity onPressIn={drag} delayPressIn={0}
                    style={[s.dragHandle, { borderLeftColor: colors.border }]} activeOpacity={0.5}>
                    <View style={{ gap: 4 }}>
                      {[0, 1, 2].map(i => (
                        <View key={i} style={{ width: 18, height: 2.5, borderRadius: 2, backgroundColor: isActive ? charColor : colors.textSecondary }} />
                      ))}
                    </View>
                  </TouchableOpacity>
                </View>
              </ScaleDecorator>
            );
          }}
        />

        {/* ── Confirm button ── */}
        <View style={[s.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {isConfirming ? (
            <View style={s.confirmingContainer}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[s.confirmingText, { color: colors.text }]}>
                Generando voces… {confirmProgress}/{confirmTotal}
              </Text>
              <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
                <View style={[s.progressFill, {
                  backgroundColor: colors.primary,
                  width: (confirmTotal > 0 ? `${(confirmProgress / confirmTotal) * 100}%` : '0%') as any,
                }]} />
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={confirmAndGenerate}
              style={[s.confirmBtn, { backgroundColor: '#10B981' }]} activeOpacity={0.85}>
              <CheckCircle size={20} color="#fff" />
              <Text style={s.confirmBtnText}>Confirmar guion y generar voces</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Edit Modal ── keyboard-safe bottom sheet outside the list ── */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <Pressable style={s.modalOverlay} onPress={() => setEditModalVisible(false)}>
              <Pressable onPress={e => e.stopPropagation()} style={[s.modalContent, { backgroundColor: colors.surface }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rp(12) }}>
                  <Text style={[s.modalTitle, { color: colors.text, marginBottom: 0 }]}>Editar línea</Text>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)} style={{ padding: 4 }}>
                    <X size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', marginBottom: rp(16), gap: 12 }}>
                  <TouchableOpacity onPress={() => setEditSelectedChar(null)} style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: editSelectedChar === null ? colors.primary : colors.border, backgroundColor: editSelectedChar === null ? colors.primary + '20' : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: editSelectedChar === null ? colors.primary : colors.text }}>Acción</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditSelectedChar(characters[0] || undefined)} style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: editSelectedChar !== null ? colors.primary : colors.border, backgroundColor: editSelectedChar !== null ? colors.primary + '20' : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: editSelectedChar !== null ? colors.primary : colors.text }}>Diálogo</Text>
                  </TouchableOpacity>
                </View>

                {editSelectedChar !== null && (
                  <>
                    <Text style={[s.modalLabel, { color: colors.textSecondary }]}>Personaje:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: rp(16) }}>
                      {characters.map(c => (
                        <TouchableOpacity key={c.id} onPress={() => setEditSelectedChar(c)}
                          style={[s.charChip, {
                            backgroundColor: editSelectedChar?.id === c.id ? c.color + '30' : colors.background,
                            borderColor: editSelectedChar?.id === c.id ? c.color : colors.border,
                          }]}>
                          <Text style={[s.charChipText, { color: editSelectedChar?.id === c.id ? c.color : colors.text }]}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <TextInput
                  style={[s.input, {
                    color: colors.text, borderColor: colors.border,
                    backgroundColor: colors.background, minHeight: 120,
                  }]}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  autoFocus
                  textAlignVertical="top"
                  scrollEnabled
                />

                <View style={s.modalBtns}>
                  <TouchableOpacity
                    onPress={() => setEditModalVisible(false)}
                    style={[s.actionBtn, { backgroundColor: colors.border, flex: 1 }]}>
                    <Text style={{ color: colors.text }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveEdit}
                    disabled={isSaving}
                    style={[s.actionBtn, { backgroundColor: '#10B981', flex: 1 }]}>
                    {isSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><Save size={14} color="#fff" /><Text style={{ color: '#fff' }}> Guardar</Text></>
                    }
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Emotion Selector Modal ── */}
        <Modal
          visible={emotionModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEmotionModalVisible(false)}
        >
          <Pressable style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={() => setEmotionModalVisible(false)}>
            <View style={[s.modalContent, { backgroundColor: colors.surface, paddingHorizontal: 0, paddingBottom: rp(20) }]}>
              <View style={{ paddingHorizontal: rp(20), paddingBottom: rp(12), borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={[s.modalTitle, { color: colors.text, marginBottom: 0 }]}>Dirección Interpretativa</Text>
              </View>
              <ScrollView style={{ maxHeight: 300 }}>
                {EMOTIONS.map(emo => (
                  <TouchableOpacity 
                    key={emo.value}
                    style={{ 
                      paddingVertical: rp(14), 
                      paddingHorizontal: rp(20),
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border
                    }}
                    onPress={() => handleEmotionSelect(emo.value)}
                  >
                    <Text style={{ color: colors.text, fontSize: rf(15) }}>{emo.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {/* ── Add Line Modal ── */}
        <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <Pressable style={s.modalOverlay} onPress={() => setShowAddModal(false)}>
              <Pressable onPress={e => e.stopPropagation()} style={[s.modalContent, { backgroundColor: colors.surface }]}>
                <Text style={[s.modalTitle, { color: colors.text }]}>Añadir línea</Text>
                
                <View style={{ flexDirection: 'row', marginBottom: rp(16), gap: 12 }}>
                  <TouchableOpacity onPress={() => setSelectedChar(null)} style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: selectedChar === null ? colors.primary : colors.border, backgroundColor: selectedChar === null ? colors.primary + '20' : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: selectedChar === null ? colors.primary : colors.text }}>Acción</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelectedChar(characters[0] || undefined)} style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: selectedChar !== null ? colors.primary : colors.border, backgroundColor: selectedChar !== null ? colors.primary + '20' : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: selectedChar !== null ? colors.primary : colors.text }}>Diálogo</Text>
                  </TouchableOpacity>
                </View>

                {selectedChar !== null && (
                  <>
                    <Text style={[s.modalLabel, { color: colors.textSecondary }]}>Personaje:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: rp(16) }}>
                      {characters.map(c => (
                        <TouchableOpacity key={c.id} onPress={() => setSelectedChar(c)}
                          style={[s.charChip, {
                            backgroundColor: selectedChar?.id === c.id ? c.color + '30' : colors.background,
                            borderColor: selectedChar?.id === c.id ? c.color : colors.border,
                          }]}>
                          <Text style={[s.charChipText, { color: selectedChar?.id === c.id ? c.color : colors.text }]}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}
                
                <Text style={[s.modalLabel, { color: colors.textSecondary }]}>{selectedChar === null ? 'Acción:' : 'Diálogo:'}</Text>
                <TextInput
                  style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={newLineText} onChangeText={setNewLineText}
                  placeholder="Escribe el diálogo…" placeholderTextColor={colors.textSecondary}
                  multiline autoFocus
                />
                <View style={s.modalBtns}>
                  <TouchableOpacity onPress={() => setShowAddModal(false)}
                    style={[s.actionBtn, { backgroundColor: colors.border, flex: 1 }]}>
                    <Text style={{ color: colors.text }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={addLine}
                    disabled={(!selectedChar && selectedChar !== null) || !newLineText.trim() || isSaving}
                    style={[s.actionBtn, { backgroundColor: colors.primary, flex: 1,
                      opacity: ((!selectedChar && selectedChar !== null) || !newLineText.trim()) ? 0.5 : 1 }]}>
                    {isSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: '#fff' }}>Añadir</Text>
                    }
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* Review Info Modal */}
        <Modal
          visible={showReviewInfo}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowReviewInfo(false)}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: rp(16), gap: 12 }}>
                <Edit size={24} color={colors.primary} />
                <Text style={[s.modalTitle, { color: colors.text, marginBottom: 0 }]}>Revisa el guion</Text>
              </View>

              <Text style={{ color: colors.textSecondary, fontSize: rf(14), lineHeight: rf(22), marginBottom: rp(20) }}>
                La IA puede cometer errores al transcribir el guion.
                {'\n\n'}
                Revisa el texto, comprueba las tarjetas de las acciones y los diálogos, reordena las líneas si es necesario puedes crear nuevas pulsando "+". Confirma cuando esté listo. Después se generarán las voces automáticamente.
              </Text>

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: rp(24), gap: 10 }}
                onPress={() => setDontShowReviewInfoAgain(!dontShowReviewInfoAgain)}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                  borderColor: dontShowReviewInfoAgain ? colors.primary : colors.textSecondary,
                  backgroundColor: dontShowReviewInfoAgain ? colors.primary : 'transparent'
                }}>
                  {dontShowReviewInfoAgain && <Check size={14} color="#FFFFFF" />}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: rf(13) }}>No volver a mostrar este mensaje</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  if (dontShowReviewInfoAgain) {
                    await AsyncStorage.setItem(REVIEW_INFO_KEY, 'true');
                  }
                  setShowReviewInfo(false);
                }}
              >
                <Text style={{ color: '#fff', fontSize: rf(14), fontWeight: '600' }}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Add Line Info Modal */}
        <Modal
          visible={showAddLineInfo}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAddLineInfo(false)}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: rp(16), gap: 12 }}>
                <Plus size={24} color={colors.primary} />
                <Text style={[s.modalTitle, { color: colors.text, marginBottom: 0 }]}>Añadir línea o acción</Text>
              </View>

              <Text style={{ color: colors.textSecondary, fontSize: rf(14), lineHeight: rf(22), marginBottom: rp(20) }}>
                Puedes agregar nuevas líneas de diálogo o acciones al guion manualmente.
                {'\n\n'}
                Ten en cuenta que las nuevas tarjetas se añadirán por defecto al final de la lista, pero luego podrás arrastrarlas a la posición que desees usando el botón lateral (≡).
              </Text>

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: rp(24), gap: 10 }}
                onPress={() => setDontShowAddLineInfoAgain(!dontShowAddLineInfoAgain)}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                  borderColor: dontShowAddLineInfoAgain ? colors.primary : colors.textSecondary,
                  backgroundColor: dontShowAddLineInfoAgain ? colors.primary : 'transparent'
                }}>
                  {dontShowAddLineInfoAgain && <Check size={14} color="#FFFFFF" />}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: rf(13) }}>No volver a mostrar este mensaje</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  if (dontShowAddLineInfoAgain) {
                    await AsyncStorage.setItem('hideAddLineInfoV2', 'true');
                  }
                  setShowAddLineInfo(false);
                  setShowAddModal(true);
                }}
              >
                <Text style={{ color: '#fff', fontSize: rf(14), fontWeight: '600' }}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rp(16), paddingVertical: rp(12), borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: rf(16), fontWeight: '700' },
  headerSub: { fontSize: rf(12), marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', borderRadius: 12, marginBottom: 10, borderWidth: 1.5, overflow: 'hidden', shadowOffset: { width: 0, height: 4 } },
  colorBar: { width: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  charName: { fontSize: rf(13), fontWeight: '700' },
  badge: { fontSize: rf(11), fontWeight: '400' },
  lineNum: { fontSize: rf(11) },
  dialogueText: { fontSize: rf(14), lineHeight: rf(22), marginTop: 6 },
  lineActions: { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' },
  iconBtn: { padding: 6 },
  input: { borderWidth: 1, borderRadius: 8, padding: rp(10), fontSize: rf(14), lineHeight: rf(22), minHeight: 80, textAlignVertical: 'top' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: rp(14), paddingVertical: rp(8), borderRadius: 8 },
  dragHandle: { width: 44, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: rp(20), paddingVertical: rp(16), borderTopWidth: 1 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: rp(16), borderRadius: 14 },
  confirmBtnText: { color: '#fff', fontSize: rf(16), fontWeight: '700' },
  confirmingContainer: { alignItems: 'center', gap: 8 },
  confirmingText: { fontSize: rf(14) },
  progressTrack: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: rp(24), paddingBottom: rp(40) },
  modalTitle: { fontSize: rf(18), fontWeight: '700', marginBottom: rp(20) },
  modalLabel: { fontSize: rf(13), marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: rp(16) },
  charChip: { paddingHorizontal: rp(14), paddingVertical: rp(8), borderRadius: 20, borderWidth: 1.5, marginRight: 8 },
  charChipText: { fontSize: rf(13), fontWeight: '600' },
});
