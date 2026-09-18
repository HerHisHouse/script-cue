import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  TextInput, Modal, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Pressable, ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
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
import { ArrowLeft, Edit, Trash2, Plus, CheckCircle, X, Save, Check, FileText } from 'lucide-react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CoachTour, CoachTourRect, CoachTourStepContent } from '@/components/CoachTour';
import { WebView } from 'react-native-webview';

const REVIEW_TOUR_KEY = 'hideReviewTourV1';

export default function ReviewScreen() {
  const router = useRouter();
  const { id, force } = useLocalSearchParams<{ id: string; force?: string }>();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Paleta "sobre imagen de fondo" del diseño glass, igual que en Importar Guion
  const onBg = isDark ? '#ffffff' : '#2a2447';
  const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
  const cardBg = isDark ? 'rgba(124,106,247,0.08)' : 'rgba(255,255,255,0.55)';
  const cardBorder = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)';
  const cardShadow = !isDark ? {
    shadowColor: '#1a1625',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
  } : null;
  const fieldBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)';
  const fieldBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(124,106,247,0.18)';
  const neutralChipBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const glassHeaderBtn = isDark
    ? { backgroundColor: 'rgba(124,106,247,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
    : { backgroundColor: colors.primary };
  // Norma general de modo oscuro: el texto/icono de los botones secundarios (glass,
  // fondo oscuro translúcido) va en blanco para que se lea mejor; en claro mantiene el acento morado.
  const accentOnGlass = isDark ? '#FFFFFF' : colors.primary;
  const bg = () => (isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png'));

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
    { label: 'Aclarando la garganta', value: 'clears_throat' },
    { label: 'Agotado/a', value: 'exhausted' },
    { label: 'Alegre', value: 'cheerful' },
    { label: 'Amenazante', value: 'threatening' },
    { label: 'Asustado/a', value: 'fearful' },
    { label: 'Avergonzado/a', value: 'embarrassed' },
    { label: 'Celoso/a', value: 'jealous' },
    { label: 'Confundido/a', value: 'confused' },
    { label: 'Curioso/a', value: 'curious' },
    { label: 'Desesperado/a', value: 'desperate' },
    { label: 'Dudando/Tartamudeando', value: 'hesitant' },
    { label: 'Emocionado/a', value: 'excited' },
    { label: 'Enfadado/a', value: 'angry' },
    { label: 'Esperanzado/a', value: 'hopeful' },
    { label: 'Gritando', value: 'shouting' },
    { label: 'Juguetón/a', value: 'playful' },
    { label: 'Llorando', value: 'crying' },
    { label: 'Monótono/Plano', value: 'deadpan' },
    { label: 'Nervioso/a', value: 'nervous' },
    { label: 'Neutral', value: 'neutral' },
    { label: 'Orgulloso/a', value: 'proud' },
    { label: 'Resignado/a', value: 'resigned' },
    { label: 'Riendo', value: 'laughing' },
    { label: 'Sarcástico/a', value: 'sarcastic' },
    { label: 'Sin aliento', value: 'breathless' },
    { label: 'Sorprendido/a', value: 'surprised' },
    { label: 'Suplicante', value: 'pleading' },
    { label: 'Suspirando', value: 'sighing' },
    { label: 'Susurrando', value: 'whispering' },
    { label: 'Tierno/a', value: 'tender' },
    { label: 'Travieso/a', value: 'mischievous' }
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
  // ── Tour interactivo (coach marks) ──────────────────────────────────────────
  const [tourVisible, setTourVisible] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourTargetRect, setTourTargetRect] = useState<CoachTourRect | null>(null);
  const tourStepsRef = useRef<{ content: CoachTourStepContent; prepare: () => Promise<CoachTourRect | null> }[]>([]);
  const flatListRef = useRef<any>(null);
  const dragHandleRef = useRef<any>(null);
  const emotionButtonRef = useRef<any>(null);
  const addButtonRef = useRef<any>(null);
  const pdfButtonRef = useRef<any>(null);

  const [showAddLineInfo, setShowAddLineInfo] = useState(false);
  const [dontShowAddLineInfoAgain, setDontShowAddLineInfoAgain] = useState(false);

  const [characters, setCharacters] = useState<any[]>([]);

  // Índice de la primera línea que muestra el selector de emoción (voz
  // Expresiva/ElevenLabs o Natural/Hume) — usado tanto por el tour como por
  // la propia lista para saber a qué tarjeta engancharle el ref de medición.
  const emotionTourIndex = React.useMemo(() => {
    return lines.findIndex(l => {
      if (l.isAction || l.isUserCharacter) return false;
      const charData = characters.find(c => c.name.toLowerCase().trim() === l.characterName.toLowerCase().trim());
      return charData?.voice_provider === 'elevenlabs' || charData?.voice_provider === 'hume';
    });
  }, [lines, characters]);
  const [selectedChar, setSelectedChar] = useState<any>(null);

  // ── Visor del PDF original (Fase 1: comparar el orden de diálogos contra
  // el documento real sin salir de la app) ──────────────────────────────────
  const [scriptPdfPath, setScriptPdfPath] = useState<string | null>(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null);
  const [pdfViewerLoading, setPdfViewerLoading] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !user) return;
    const init = async () => {
      try {
        const { data: script } = await supabase
          .from('scripts').select('reviewed, pdf_url').eq('id', id).single();

        if (script?.reviewed && force !== '1') {
          router.replace(`/scripts/${id}` as any);
          return;
        }

        setScriptPdfPath(script?.pdf_url || null);

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

  // ── Tour interactivo (coach marks) ──────────────────────────────────────────
  // Mide el elemento de un ref ya montado y devuelve su posición real en pantalla.
  const measureRef = (ref: React.RefObject<any>): Promise<CoachTourRect | null> => {
    return new Promise(resolve => {
      if (!ref.current || typeof ref.current.measureInWindow !== 'function') {
        resolve(null);
        return;
      }
      ref.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
      });
    });
  };

  const buildTourSteps = () => {
    const steps: { content: CoachTourStepContent; prepare: () => Promise<CoachTourRect | null> }[] = [
      {
        content: {
          title: 'Reordena las líneas',
          description: 'Mantén pulsado el icono ≡ y arrastra la tarjeta para cambiar el orden de los diálogos o acciones.',
        },
        prepare: async () => {
          flatListRef.current?.scrollToOffset?.({ offset: 0, animated: false });
          await new Promise(r => setTimeout(r, 350));
          return measureRef(dragHandleRef);
        },
      },
      {
        content: {
          title: 'Añade líneas o acciones',
          description: 'Pulsa aquí para crear una nueva línea de diálogo o una tarjeta de acción manualmente.',
        },
        prepare: async () => measureRef(addButtonRef),
      },
      {
        content: {
          title: 'Previsualiza el guion original',
          description: 'Pulsa aquí para abrir el PDF que importaste y comprobar el orden real de los diálogos.',
        },
        prepare: async () => measureRef(pdfButtonRef),
      },
    ];

    // Solo tiene sentido este paso si hay al menos una línea con voz Expresiva
    // (ElevenLabs) o Natural (Hume) — es la única condición bajo la que se
    // muestra el selector de emoción en la tarjeta.
    if (emotionTourIndex !== -1) {
      steps.push({
        content: {
          title: 'Configura la emoción',
          description: 'Si el personaje usa una voz Expresiva o Natural, puedes elegir cómo interpreta cada frase.',
        },
        prepare: async () => {
          flatListRef.current?.scrollToIndex?.({ index: emotionTourIndex, animated: true, viewPosition: 0.4 });
          await new Promise(r => setTimeout(r, 500));
          return measureRef(emotionButtonRef);
        },
      });
    }

    return steps;
  };

  const goToTourStep = async (index: number) => {
    const steps = tourStepsRef.current;
    if (index >= steps.length) {
      finishTour();
      return;
    }
    const rect = await steps[index].prepare();
    setTourStepIndex(index);
    setTourTargetRect(rect);
  };

  const startTour = async () => {
    const steps = buildTourSteps();
    if (steps.length === 0) return;
    tourStepsRef.current = steps;
    setTourVisible(true);
    await goToTourStep(0);
  };

  const finishTour = async () => {
    setTourVisible(false);
    setTourTargetRect(null);
    setTourStepIndex(0);
    await AsyncStorage.setItem(REVIEW_TOUR_KEY, 'true');
  };

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      const hidden = await AsyncStorage.getItem(REVIEW_TOUR_KEY);
      if (!hidden && !cancelled) {
        setTimeout(() => { if (!cancelled) startTour(); }, 500);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

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

      // El texto cambió: invalidar el audio TTS cacheado para esta línea, si no
      // quedaría una fila con el hash antiguo que nunca se refresca (ver migración
      // 20260906120000_add_tts_cache_update_policy.sql para la causa raíz completa).
      if (editText !== editingLine.text) {
        await invalidateCacheForLine(editingLine.id);
      }

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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const confirmAndGenerate = () => setShowConfirmDialog(true);

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

  // ── Visor del PDF original ──────────────────────────────────────────────────
  const openPdfViewer = async () => {
    if (!scriptPdfPath) {
      Alert.alert(
        'PDF no disponible',
        'Este guion no tiene un PDF original asociado (por ejemplo, si se creó escaneando páginas con la cámara).'
      );
      return;
    }

    setPdfViewerLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('scripts')
        .createSignedUrl(scriptPdfPath, 3600);

      if (error || !data?.signedUrl) throw error || new Error('No se recibió URL firmada');

      setPdfSignedUrl(data.signedUrl);
      setShowPdfViewer(true);
    } catch (e) {
      console.error('[Review] Error obteniendo URL del PDF:', e);
      Alert.alert('Error', 'No se pudo abrir el PDF original. Inténtalo de nuevo.');
    } finally {
      setPdfViewerLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ImageBackground source={bg()} resizeMode="cover" style={{ flex: 1 }}>
        <View style={[s.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: onBg2, marginTop: 12 }}>Cargando guion…</Text>
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={bg()} resizeMode="cover" style={{ flex: 1 }}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[s.container, { backgroundColor: 'transparent' }]}>

        {/* ── Header ── */}
        <View style={[s.header, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
          <TouchableOpacity onPress={() => router.back()} style={[s.headerIconBtn, glassHeaderBtn]}>
            <ArrowLeft size={20} color={isDark ? onBg : '#FFFFFF'} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[s.headerTitle, { color: onBg, textAlign: 'center' }]}>Revisar guion</Text>
            <Text style={[s.headerSub, { color: onBg2, textAlign: 'center' }]}>
              {lines.length} líneas · Usa ≡ para reordenar
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity ref={pdfButtonRef} onPress={openPdfViewer} style={[s.headerIconBtn, glassHeaderBtn]} disabled={pdfViewerLoading}>
              {pdfViewerLoading ? (
                <ActivityIndicator size="small" color={isDark ? onBg : '#FFFFFF'} />
              ) : (
                <FileText size={18} color={isDark ? onBg : '#FFFFFF'} />
              )}
            </TouchableOpacity>
            <TouchableOpacity ref={addButtonRef} onPress={async () => {
              const hidden = await AsyncStorage.getItem('hideAddLineInfoV2');
              if (hidden !== 'true') {
                setShowAddLineInfo(true);
              } else {
                setShowAddModal(true);
              }
            }} style={[s.headerIconBtn, glassHeaderBtn]}>
              <Plus size={18} color={isDark ? onBg : '#FFFFFF'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Draggable list ── */}
        <DraggableFlatList
          ref={flatListRef}
          data={lines}
          keyExtractor={item => item.id}
          onDragBegin={() => Haptics.selectionAsync()}
          onDragEnd={({ data }) => { setLines(data); syncOrder(data); }}
          containerStyle={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{ paddingHorizontal: rp(16), paddingTop: rp(12), paddingBottom: 140 }}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item, drag, isActive, getIndex }) => {
            const index = getIndex() ?? 0;
            const charColor = item.isAction ? colors.primary : (item.isUserCharacter ? '#10B981' : (item.color || colors.primary));
            const charData = characters.find(c => c.name.toLowerCase().trim() === item.characterName.toLowerCase().trim());
            const isElevenLabs = charData?.voice_provider === 'elevenlabs';
            const isHume = charData?.voice_provider === 'hume';

            return (
              <ScaleDecorator activeScale={1.02}>
                <View style={[s.cardShadowWrapper, {
                  ...cardShadow,
                  shadowColor: isActive ? charColor : (cardShadow?.shadowColor || 'transparent'),
                  shadowOpacity: isActive ? 0.35 : (cardShadow?.shadowOpacity || 0),
                  elevation: isActive ? 6 : (cardShadow?.elevation || 1),
                }]}>
                <View style={[s.card, {
                  backgroundColor: cardBg,
                  borderColor: charColor,
                  borderStyle: item.isAction ? 'dashed' : 'solid',
                  borderWidth: item.isAction ? 2 : 1.5,
                }]}>
                  <View style={[s.colorBar, { backgroundColor: charColor }]} />
                  <View style={{ flex: 1, padding: rp(12) }}>
                    <View style={s.cardHeader}>
                      <Text style={[s.charName, { color: charColor }]}>
                        {item.isAction ? 'TARJETA DE ACCIÓN' : item.characterName}
                        {!item.isAction && (
                          <Text style={[s.badge, { color: onBg2 }]}>
                            {item.isUserCharacter ? '  · TÚ' : '  · ScriptCue'}
                          </Text>
                        )}
                      </Text>
                      <Text style={[s.lineNum, { color: onBg2 }]}>#{index + 1}</Text>
                    </View>
                    <Text style={[s.dialogueText, { color: onBg }]}>{item.text}</Text>

                    <View style={s.cardFooterRow}>
                      {!item.isAction && !item.isUserCharacter && (isElevenLabs || isHume) ? (
                        <View style={{ alignItems: 'flex-start' }}>
                          <Text style={[s.emotionLabel, { color: onBg2 }]}>Configurar emoción</Text>
                          <TouchableOpacity
                            ref={index === emotionTourIndex ? emotionButtonRef : undefined}
                            style={{ flexDirection: 'row', alignItems: 'center' }}
                            onPress={() => {
                              setActiveEmotionLineId(item.id);
                              setEmotionModalVisible(true);
                            }}
                          >
                            <Text style={{ marginRight: 6 }}>🎭</Text>
                            <View style={{
                                backgroundColor: item.voiceDirection ? charColor + '30' : neutralChipBg,
                                paddingHorizontal: rp(8),
                                paddingVertical: rp(4),
                                borderRadius: rp(12),
                            }}>
                              <Text style={{
                                fontSize: rf(12),
                                color: onBg,
                                fontWeight: item.voiceDirection ? '600' : '400'
                              }}>
                                 {item.voiceDirection ? translateEmotion(item.voiceDirection.emotion) : 'Neutral'} ▾
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      ) : <View />}

                      <View style={s.lineActions}>
                        <TouchableOpacity onPress={() => openEditModal(item)} style={s.iconBtn}>
                          <Edit size={15} color={onBg2} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteLine(item.id)} style={s.iconBtn}>
                          <Trash2 size={15} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  {/* Drag handle */}
                  <TouchableOpacity
                    ref={index === 0 ? dragHandleRef : undefined}
                    onPressIn={drag} delayPressIn={0}
                    style={[s.dragHandle, { borderLeftColor: cardBorder }]} activeOpacity={0.5}>
                    <View style={{ gap: 4 }}>
                      {[0, 1, 2].map(i => (
                        <View key={i} style={{ width: 18, height: 2.5, borderRadius: 2, backgroundColor: isActive ? charColor : onBg2 }} />
                      ))}
                    </View>
                  </TouchableOpacity>
                </View>
                </View>
              </ScaleDecorator>
            );
          }}
        />

        {/* ── Confirm button ── */}
        <View style={s.footer}>
          <BlurView intensity={isDark ? 55 : 65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.14)' : 'rgba(235,230,245,0.5)' }]} />
          <View style={[s.footerContent, { borderTopColor: cardBorder, paddingBottom: Math.max(insets.bottom, rp(16)) }]}>
            {isConfirming ? (
              <View style={s.confirmingContainer}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[s.confirmingText, { color: onBg }]}>
                  Generando voces… {confirmProgress}/{confirmTotal}
                </Text>
                <View style={[s.progressTrack, { backgroundColor: cardBorder }]}>
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
        </View>

        {/* ── Edit Modal ── keyboard-safe bottom sheet outside the list ── */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setEditModalVisible(false)}
         supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <Pressable style={s.modalOverlay} onPress={() => setEditModalVisible(false)}>
              <Pressable onPress={e => e.stopPropagation()} style={s.modalContent}>
                <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.40)' : 'rgba(235,230,245,0.40)' }]} />
                <View style={{ padding: rp(24), paddingBottom: Math.max(insets.bottom + rp(20), rp(40)) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rp(12) }}>
                  <Text style={[s.modalTitle, { color: onBg, marginBottom: 0 }]}>Editar línea</Text>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)} style={{ padding: 4 }}>
                    <X size={20} color={onBg2} />
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', marginBottom: rp(16), gap: 12 }}>
                  <TouchableOpacity onPress={() => setEditSelectedChar(null)} style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: editSelectedChar === null ? colors.primary : cardBorder, backgroundColor: editSelectedChar === null ? colors.primary + '20' : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: editSelectedChar === null ? accentOnGlass : onBg }}>Acción</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditSelectedChar(characters[0] || undefined)} style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: editSelectedChar !== null ? colors.primary : cardBorder, backgroundColor: editSelectedChar !== null ? colors.primary + '20' : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: editSelectedChar !== null ? accentOnGlass : onBg }}>Diálogo</Text>
                  </TouchableOpacity>
                </View>

                {editSelectedChar !== null && (
                  <>
                    <Text style={[s.modalLabel, { color: onBg2 }]}>Personaje:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: rp(16) }}>
                      {characters.map(c => (
                        <TouchableOpacity key={c.id} onPress={() => setEditSelectedChar(c)}
                          style={[s.charChip, {
                            backgroundColor: editSelectedChar?.id === c.id ? c.color + '30' : fieldBg,
                            borderColor: editSelectedChar?.id === c.id ? c.color : cardBorder,
                          }]}>
                          <Text style={[s.charChipText, { color: onBg }]}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <TextInput
                  style={[s.input, {
                    color: onBg, borderColor: fieldBorder,
                    backgroundColor: fieldBg, minHeight: 120,
                  }]}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  autoFocus
                  textAlignVertical="top"
                  scrollEnabled
                  placeholderTextColor={onBg2}
                />

                <View style={s.modalBtns}>
                  <TouchableOpacity
                    onPress={() => setEditModalVisible(false)}
                    style={[s.actionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(124,106,247,0.12)', flex: 1 }]}>
                    <Text style={{ color: onBg }}>Cancelar</Text>
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
         supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
          <Pressable style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={() => setEmotionModalVisible(false)}>
            <View style={[s.modalContent, { paddingBottom: Math.max(insets.bottom + rp(20), rp(20)) }]}>
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.40)' : 'rgba(235,230,245,0.40)' }]} />
              <View style={{ paddingHorizontal: rp(20), paddingTop: rp(20), paddingBottom: rp(12), borderBottomWidth: 1, borderBottomColor: cardBorder }}>
                <Text style={[s.modalTitle, { color: onBg, marginBottom: 0 }]}>Dirección Interpretativa</Text>
              </View>
              <ScrollView style={{ maxHeight: 300 }}>
                {EMOTIONS.map(emo => (
                  <TouchableOpacity
                    key={emo.value}
                    style={{
                      paddingVertical: rp(14),
                      paddingHorizontal: rp(20),
                      borderBottomWidth: 1,
                      borderBottomColor: cardBorder
                    }}
                    onPress={() => handleEmotionSelect(emo.value)}
                  >
                    <Text style={{ color: onBg, fontSize: rf(15) }}>{emo.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {/* ── Add Line Modal ── */}
        <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)} supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <Pressable style={s.modalOverlay} onPress={() => setShowAddModal(false)}>
              <Pressable onPress={e => e.stopPropagation()} style={s.modalContent}>
                <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.40)' : 'rgba(235,230,245,0.40)' }]} />
                <View style={{ padding: rp(24), paddingBottom: Math.max(insets.bottom + rp(20), rp(40)) }}>
                <Text style={[s.modalTitle, { color: onBg }]}>Añadir línea</Text>

                <View style={{ flexDirection: 'row', marginBottom: rp(16), gap: 12 }}>
                  <TouchableOpacity onPress={() => setSelectedChar(null)} style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: selectedChar === null ? colors.primary : cardBorder, backgroundColor: selectedChar === null ? colors.primary + '20' : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: selectedChar === null ? accentOnGlass : onBg }}>Acción</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelectedChar(characters[0] || undefined)} style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: selectedChar !== null ? colors.primary : cardBorder, backgroundColor: selectedChar !== null ? colors.primary + '20' : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: selectedChar !== null ? accentOnGlass : onBg }}>Diálogo</Text>
                  </TouchableOpacity>
                </View>

                {selectedChar !== null && (
                  <>
                    <Text style={[s.modalLabel, { color: onBg2 }]}>Personaje:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: rp(16) }}>
                      {characters.map(c => (
                        <TouchableOpacity key={c.id} onPress={() => setSelectedChar(c)}
                          style={[s.charChip, {
                            backgroundColor: selectedChar?.id === c.id ? c.color + '30' : fieldBg,
                            borderColor: selectedChar?.id === c.id ? c.color : cardBorder,
                          }]}>
                          <Text style={[s.charChipText, { color: onBg }]}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <Text style={[s.modalLabel, { color: onBg2 }]}>{selectedChar === null ? 'Acción:' : 'Diálogo:'}</Text>
                <TextInput
                  style={[s.input, { color: onBg, borderColor: fieldBorder, backgroundColor: fieldBg }]}
                  value={newLineText} onChangeText={setNewLineText}
                  placeholder="Escribe el diálogo…" placeholderTextColor={onBg2}
                  multiline autoFocus
                />
                <View style={s.modalBtns}>
                  <TouchableOpacity onPress={() => setShowAddModal(false)}
                    style={[s.actionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(124,106,247,0.12)', flex: 1 }]}>
                    <Text style={{ color: onBg }}>Cancelar</Text>
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
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* Tour interactivo: sustituye al antiguo aviso de texto plano */}
        <CoachTour
          visible={tourVisible}
          step={tourStepsRef.current[tourStepIndex]?.content || null}
          stepIndex={tourStepIndex}
          totalSteps={tourStepsRef.current.length}
          targetRect={tourTargetRect}
          isLast={tourStepIndex >= tourStepsRef.current.length - 1}
          onNext={() => goToTourStep(tourStepIndex + 1)}
          onSkip={finishTour}
        />

        {/* Add Line Info Modal */}
        <Modal
          visible={showAddLineInfo}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAddLineInfo(false)}
         supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.40)' : 'rgba(235,230,245,0.40)' }]} />
              <View style={{ padding: rp(24), paddingBottom: Math.max(insets.bottom + rp(20), rp(40)) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: rp(16), gap: 12 }}>
                <Plus size={24} color={colors.primary} />
                <Text style={[s.modalTitle, { color: onBg, marginBottom: 0 }]}>Añadir línea o acción</Text>
              </View>

              <Text style={{ color: onBg, fontSize: rf(14), lineHeight: rf(22), marginBottom: rp(20) }}>
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
                  borderColor: dontShowAddLineInfoAgain ? colors.primary : cardBorder,
                  backgroundColor: dontShowAddLineInfoAgain ? colors.primary : 'transparent'
                }}>
                  {dontShowAddLineInfoAgain && <Check size={14} color="#FFFFFF" />}
                </View>
                <Text style={{ color: onBg2, fontSize: rf(13) }}>No volver a mostrar este mensaje</Text>
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
          </View>
        </Modal>

        <ConfirmDialog
          visible={showConfirmDialog}
          title="Confirmar guion"
          message={`Se generarán voces para ${lines.filter(l => !l.isUserCharacter && !l.isAction).length} líneas de réplica. ¿Continuar?`}
          confirmText="Confirmar"
          cancelText="Cancelar"
          onConfirm={() => { setShowConfirmDialog(false); doConfirm(); }}
          onCancel={() => setShowConfirmDialog(false)}
        />

        {/* Visor del PDF original — comparar el orden de diálogos contra el
            documento real sin salir de la app (Fase 1) */}
        <Modal
          visible={showPdfViewer}
          animationType="slide"
          onRequestClose={() => setShowPdfViewer(false)}
          supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1625' }}>
            <View style={[s.header, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
              <TouchableOpacity
                onPress={() => { setShowPdfViewer(false); setPdfSignedUrl(null); }}
                style={[s.headerIconBtn, glassHeaderBtn]}
              >
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[s.headerTitle, { color: '#FFFFFF', textAlign: 'center' }]}>PDF original</Text>
              </View>
              <View style={{ width: 40 }} />
            </View>

            {pdfSignedUrl && (
              <WebView
                source={{ uri: pdfSignedUrl }}
                style={{ flex: 1, backgroundColor: '#FFFFFF' }}
                startInLoadingState
                renderLoading={() => (
                  <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1625' }]}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                  </View>
                )}
                onError={() => {
                  Alert.alert('Error', 'No se pudo cargar el PDF original.');
                  setShowPdfViewer(false);
                  setPdfSignedUrl(null);
                }}
              />
            )}
          </SafeAreaView>
        </Modal>

      </SafeAreaView>
    </GestureHandlerRootView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rp(20), paddingVertical: rp(16), gap: 12 },
  headerIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: rf(16), fontWeight: '700' },
  headerSub: { fontSize: rf(12), marginTop: 2 },
  cardShadowWrapper: { borderRadius: 16, marginBottom: 10, shadowOffset: { width: 0, height: 4 } },
  card: { flexDirection: 'row', borderRadius: 16, overflow: 'hidden' },
  colorBar: { width: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  charName: { fontSize: rf(13), fontWeight: '700' },
  badge: { fontSize: rf(11), fontWeight: '400' },
  lineNum: { fontSize: rf(11) },
  dialogueText: { fontSize: rf(14), lineHeight: rf(22), marginTop: 6 },
  cardFooterRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 },
  emotionLabel: { fontSize: rf(10), fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  lineActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 6 },
  input: { borderWidth: 1, borderRadius: 8, padding: rp(10), fontSize: rf(14), lineHeight: rf(22), minHeight: 80, textAlignVertical: 'top' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: rp(14), paddingVertical: rp(8), borderRadius: 8 },
  dragHandle: { width: 44, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  footerContent: { paddingHorizontal: rp(20), paddingTop: rp(16), borderTopWidth: 1 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: rp(16), borderRadius: 14 },
  confirmBtnText: { color: '#fff', fontSize: rf(16), fontWeight: '700' },
  confirmingContainer: { alignItems: 'center', gap: 8 },
  confirmingText: { fontSize: rf(14) },
  progressTrack: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  modalTitle: { fontSize: rf(18), fontWeight: '700', marginBottom: rp(20) },
  modalLabel: { fontSize: rf(13), marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: rp(16) },
  charChip: { paddingHorizontal: rp(14), paddingVertical: rp(8), borderRadius: 20, borderWidth: 1.5, marginRight: 8 },
  charChipText: { fontSize: rf(13), fontWeight: '600' },
});
