import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  TextInput, Modal, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Pressable, ImageBackground,
} from 'react-native';
import { useDialogMaxHeight, dialogScrollStyle } from '@/hooks/useDialogMaxHeight';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { ANDROID_BLUR_METHOD } from '@/utils/blur';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { normalizeVoiceProvider } from '@/utils/voiceDefaults';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { persistLineOrder } from '@/utils/persistLineOrder';
import { mergeVisibleOrder, insertAfter, scenesWithLines } from '@/utils/sceneSelection';
import { bracketsToParentheses } from '@/utils/stringUtils';
import { generateAndCacheAudio } from '@/utils/ttsCache';
import { getCardShadow } from '@/utils/cardShadow';
import { rf, rp } from '@/utils/responsive';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Edit, Trash2, Plus, CheckCircle, X, Save, Check, FileText, ChevronRight } from 'lucide-react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CoachTour, CoachTourRect, CoachTourStepContent } from '@/components/CoachTour';
import { WebView } from 'react-native-webview';
import { AndroidPdfViewer } from '@/components/AndroidPdfViewer';
import { ModalGlassFill } from '@/components/ModalGlassFill';
import { ExpressiveTagsSheet } from '@/components/ExpressiveTagsSheet';
import { initialMarkup, isMarkupCurrent, stripTags } from '@/utils/tts/expressiveTags';
import { canUseExpressiveTags } from '@/utils/plan';

const REVIEW_TOUR_KEY = 'hideReviewTourV1';

/**
 * Sombra de cada tarjeta arrastrable: en reposo, la estándar de la app (getCardShadow); mientras se
 * arrastra (isActive), un halo teñido con el color del personaje — charColor siempre es un hex
 * "#RRGGBB" (colors.primary / CHARACTER_COLORS), por eso se le puede añadir el canal alfa a mano en
 * la rama de Android (boxShadow no acepta shadowColor + shadowOpacity por separado como iOS).
 */
function draggableCardShadow(isDark: boolean, isActive: boolean, charColor: string) {
  if (!isActive) return getCardShadow(isDark);
  return Platform.OS === 'android'
    ? { boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 20, spreadDistance: 2, color: `${charColor}59` }] }
    : { shadowColor: charColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 6 };
}

// Voces con selector de emoción por réplica: Expresiva (ElevenLabs) y Natural
// (Inworld), que interpretan las mismas etiquetas de emoción.
function supportsEmotionSelector(voiceProvider: string | null | undefined): boolean {
  return voiceProvider === 'elevenlabs' || voiceProvider === 'inworld';
}

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

  // `lines` es el guion COMPLETO (todas las escenas, para no romper el orden global);
  // la lista muestra solo las escenas elegidas (visibleLines).
  const [lines, setLines] = useState<DialogueLine[]>([]);
  // Escenas incluidas (scenes.included): en guiones de varias escenas el usuario elige
  // primero cuáles prepara y solo se generan sus voces. Se guarda al confirmar.
  const [scenes, setScenes] = useState<{ id: string; scene_number: number; heading: string | null; included: boolean }[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'scenes' | 'lines'>('lines');
  // Cambios que afectan a la voz (emoción y texto) pendientes de "Confirmar": no se guardan
  // ni se toca la caché hasta entonces, para que salir sin confirmar no deje réplicas sin voz.
  const [pendingChanges, setPendingChanges] = useState<Record<string, { voice_direction?: any; content?: string; character_name?: string }>>({});
  const hasPendingChanges = Object.keys(pendingChanges).length > 0;
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const allowLeaveRef = useRef(false);
  const pendingLeaveActionRef = useRef<any>(null);
  const navigation = useNavigation();
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
  // Voces Expresiva (ElevenLabs v4): etiquetas dentro de la réplica, con su propia hoja.
  const [tagsLine, setTagsLine] = useState<DialogueLine | null>(null);
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
    { label: 'Travieso/a', value: 'mischievous' },
    { label: 'Triste', value: 'sad' }
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

    // Pendiente hasta "Confirmar" (ver pendingChanges).
    const lineId = activeEmotionLineId;
    const updatePayload = emotionVal === 'neutral' ? null : { emotion: emotionVal, intensity: 0.8 };
    setPendingChanges(prev => ({ ...prev, [lineId]: { ...prev[lineId], voice_direction: updatePayload } }));
  };

  // Etiquetas de la réplica (voz Expresiva). Pendiente hasta "Confirmar", como la emoción.
  const handleTagsSave = (markup: string) => {
    if (!tagsLine) return;
    const lineId = tagsLine.id;
    const hasTags = stripTags(markup) !== markup.replace(/\s+/g, ' ').trim();
    const direction = hasTags ? { emotion: 'neutral' as const, intensity: 0.5, markup } : null;
    setLines(prev => prev.map(l => (l.id === lineId ? { ...l, voiceDirection: direction } : l)));
    setPendingChanges(prev => ({ ...prev, [lineId]: { ...prev[lineId], voice_direction: direction } }));
    setTagsLine(null);
  };
  // ── Tour interactivo (coach marks) ──────────────────────────────────────────
  const [tourVisible, setTourVisible] = useState(false);
  const dialogMaxHeight = useDialogMaxHeight();
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

  const multiScene = scenes.length > 1;
  const visibleLines = React.useMemo(
    () => (multiScene ? lines.filter(l => selectedSceneIds.has(l.sceneId)) : lines),
    [lines, multiScene, selectedSceneIds],
  );
  const sceneById = React.useMemo(() => new Map(scenes.map(sc => [sc.id, sc])), [scenes]);

  // Índice de la primera línea que muestra el selector de emoción (voz
  // Expresiva o Natural) — usado tanto por el tour como por
  // la propia lista para saber a qué tarjeta engancharle el ref de medición.
  const emotionTourIndex = React.useMemo(() => {
    return visibleLines.findIndex(l => {
      if (l.isAction || l.isUserCharacter) return false;
      const charData = characters.find(c => c.name.toLowerCase().trim() === l.characterName.toLowerCase().trim());
      return supportsEmotionSelector(charData?.voice_provider);
    });
  }, [visibleLines, characters]);
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

        const [loadedLines, charsResult, scenesResult] = await Promise.all([
          loadDialogueLines(id, { includeExcludedScenes: true }),
          supabase.from('characters').select('*').eq('script_id', id),
          supabase.from('scenes').select('id, scene_number, heading, included').eq('script_id', id).order('order_index', { ascending: true }),
        ]);
        setLines(loadedLines);
        setCharacters(charsResult.data || []);
        const pickable = scenesWithLines(scenesResult.data || [], loadedLines);
        setScenes(pickable);
        setSelectedSceneIds(new Set(pickable.filter(sc => sc.included !== false).map(sc => sc.id)));
        // Varias escenas: primero se eligen cuáles preparar.
        if (pickable.length > 1) setStep('scenes');
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
  // Android: measureInWindow resta la altura de la barra de estado (RN la descuenta como
  // "visible display frame"), pero el Modal del tour es edge-to-edge y empieza en y=0, así que
  // el foco salía desplazado hacia arriba. `measure` (pageX/pageY) parte del borde real de la
  // pantalla. iOS sigue con measureInWindow, que ya coincidía.
  const measureRef = (ref: React.RefObject<any>): Promise<CoachTourRect | null> => {
    return new Promise(resolve => {
      const node = ref.current;
      const done = (x: number, y: number, width: number, height: number) =>
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
      if (Platform.OS === 'android' && node && typeof node.measure === 'function') {
        node.measure((_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) =>
          done(pageX, pageY, width, height));
        return;
      }
      if (!node || typeof node.measureInWindow !== 'function') {
        resolve(null);
        return;
      }
      node.measureInWindow(done);
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
    // o Natural — es la única condición bajo la que se
    // muestra el selector de emoción en la tarjeta.
    if (emotionTourIndex !== -1) {
      steps.push({
        content: {
          title: 'Configura la emoción',
          description: 'Si el personaje usa una voz "Expresiva" o "Natural", puedes elegir cómo interpreta cada frase.',
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
    if (loading || step !== 'lines') return;
    let cancelled = false;
    (async () => {
      const hidden = await AsyncStorage.getItem(REVIEW_TOUR_KEY);
      if (!hidden && !cancelled) {
        setTimeout(() => { if (!cancelled) startTour(); }, 500);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, step]);

  // ── Persist order ─────────────────────────────────────────────────────────
  const syncOrder = useCallback(async (newLines: DialogueLine[]) => {
    if (!user) return;
    try {
      await persistLineOrder(newLines.map(l => l.id));
    } catch (error) {
      console.error('[Review] syncOrder error:', error);
    }
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

      // Pendiente hasta "Confirmar": entonces se guarda y se genera la voz del texto nuevo
      // (la caché es por texto, la versión anterior no hace falta borrarla).
      const lineId = editingLine.id;
      // Con etiquetas de voz Expresiva y el texto cambiado, las etiquetas ya no encajan: se quitan.
      const dropMarkup = !!editingLine.voiceDirection?.markup && stripTags(editText) !== stripTags(editingLine.text);
      setPendingChanges(prev => ({
        ...prev,
        [lineId]: {
          ...prev[lineId],
          content: bracketsToParentheses(editText),
          character_name: charName,
          ...(dropMarkup ? { voice_direction: null } : {}),
        },
      }));
      if (dropMarkup) {
        Alert.alert('Emociones quitadas', 'Has cambiado el texto de la réplica, así que sus emociones ya no encajan. Vuelve a ponerlas desde "Configurar emociones".');
      }

      setLines(prev => prev.map(l =>
        l.id === editingLine.id
          ? {
              ...l,
              ...(dropMarkup ? { voiceDirection: null } : {}),
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
      // Al final de lo que se ve (la última escena elegida), no del guion entero.
      const lastVisible = visibleLines[visibleLines.length - 1];
      const sceneId = lastVisible?.sceneId;
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
      const reordered = insertAfter(lines, newLine, lastVisible?.id ?? null);
      setLines(reordered);
      syncOrder(reordered);
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
      // Cambios pendientes (emoción y texto) a la base de datos.
      for (const [lineId, changes] of Object.entries(pendingChanges)) {
        const { error } = await supabase.from('lines').update(changes).eq('id', lineId);
        if (error) throw error;
      }
      setPendingChanges({});

      // Primero las escenas: si falla, no se marca el guion como revisado ni se generan voces.
      if (multiScene) {
        const included = scenes.filter(sc => selectedSceneIds.has(sc.id)).map(sc => sc.id);
        const excluded = scenes.filter(sc => !selectedSceneIds.has(sc.id)).map(sc => sc.id);
        const results = await Promise.all([
          included.length ? supabase.from('scenes').update({ included: true }).in('id', included) : null,
          excluded.length ? supabase.from('scenes').update({ included: false }).in('id', excluded) : null,
        ]);
        const failed = results.find(res => res?.error);
        if (failed?.error) throw failed.error;
      }
      await supabase.from('scripts').update({ reviewed: true }).eq('id', id);
      await syncOrder(lines);

      // Solo las voces de las escenas elegidas (las que ya estaban hechas salen de la caché).
      const aiLines = visibleLines.filter(l => !l.isUserCharacter && !l.isAction);
      setConfirmTotal(aiLines.length);

      const { data: charRows } = await supabase.from('characters').select('*').eq('script_id', id);

      for (let i = 0; i < aiLines.length; i++) {
        const line = aiLines[i];
        setConfirmProgress(i + 1);
        const char = charRows?.find(c => c.name.toLowerCase().trim() === line.characterName.toLowerCase().trim());
        // Sin voz configurada (o 'openai' antiguo): voz del sistema, no se genera audio en la nube
        const provider = normalizeVoiceProvider(char?.voice_provider);
        const voiceId = char?.voice_id || undefined;
        try {
          await generateAndCacheAudio(id as string, line.id, line.characterName, line.text, { provider, voiceId }, user.id, line.voiceDirection);
        } catch (e) {
          console.warn(`[Review] TTS failed for line ${line.id}:`, e);
        }
      }
      allowLeaveRef.current = true;
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

  // ── Salir con cambios sin confirmar ───────────────────────────────────────
  // Cubre la flecha, el gesto de volver de iOS y el botón atrás de Android.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event: any) => {
      if (allowLeaveRef.current || !hasPendingChanges) return;
      event.preventDefault();
      pendingLeaveActionRef.current = event.data.action;
      setShowDiscardDialog(true);
    });
    return unsubscribe;
  }, [navigation, hasPendingChanges]);

  const discardAndLeave = () => {
    setShowDiscardDialog(false);
    allowLeaveRef.current = true;
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    if (action) navigation.dispatch(action); else router.back();
  };

  // ── Paso de escenas (guiones de varias escenas) ───────────────────────────
  const toggleScene = (sceneId: string) => {
    setSelectedSceneIds(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId); else next.add(sceneId);
      return next;
    });
  };
  const allScenesSelected = selectedSceneIds.size === scenes.length;

  const renderScenePicker = () => (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: rp(16), paddingTop: rp(8), paddingBottom: 140 }}>
        <Text style={[s.scenesIntro, { color: onBg2 }]}>
          Elige las escenas que vas a trabajar: solo se prepararán sus voces. Podrás añadir más cuando quieras desde Revisar guion y aparecerán en su sitio.
        </Text>
        <TouchableOpacity
          onPress={() => setSelectedSceneIds(allScenesSelected ? new Set() : new Set(scenes.map(sc => sc.id)))}
          style={s.scenesToggleAll}
        >
          <Text style={[s.scenesToggleAllText, { color: accentOnGlass }]}>
            {allScenesSelected ? 'Quitar todas' : 'Seleccionar todas'}
          </Text>
        </TouchableOpacity>
        {scenes.map(scene => {
          const sceneLines = lines.filter(l => l.sceneId === scene.id && !l.isAction);
          const speakers = [...new Set(sceneLines.map(l => l.characterName.trim().toUpperCase()))];
          const aiCount = sceneLines.filter(l => !l.isUserCharacter).length;
          const checked = selectedSceneIds.has(scene.id);
          return (
            <TouchableOpacity key={scene.id} activeOpacity={0.85} onPress={() => toggleScene(scene.id)}
              style={[s.cardShadowWrapper, getCardShadow(isDark)]}>
              <View style={[s.sceneCard, { backgroundColor: cardBg, borderColor: checked ? colors.primary : cardBorder }]}>
                <View style={[s.sceneCheck, { borderColor: checked ? colors.primary : onBg2, backgroundColor: checked ? colors.primary : 'transparent' }]}>
                  {checked && <Check size={14} color="#FFFFFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sceneTitle, { color: onBg }]} numberOfLines={2}>
                    {`Escena ${scene.scene_number}${scene.heading ? ` · ${scene.heading}` : ''}`}
                  </Text>
                  {speakers.length > 0 && (
                    <Text style={[s.sceneMeta, { color: accentOnGlass }]} numberOfLines={1}>{speakers.join(' · ')}</Text>
                  )}
                  <Text style={[s.scenePreview, { color: onBg2 }]} numberOfLines={2}>
                    {sceneLines[0] ? `${sceneLines[0].characterName.trim().toUpperCase()}: ${sceneLines[0].cleanText || sceneLines[0].text}` : ''}
                  </Text>
                  <Text style={[s.sceneVoices, { color: onBg2 }]}>
                    {aiCount === 1 ? '1 réplica con voz' : `${aiCount} réplicas con voz`}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <BlurView experimentalBlurMethod={ANDROID_BLUR_METHOD} intensity={isDark ? 55 : 65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.14)' : 'rgba(235,230,245,0.5)' }]} />
        <View style={[s.footerContent, { borderTopColor: cardBorder, paddingBottom: Math.max(insets.bottom, rp(16)) }]}>
          <TouchableOpacity
            onPress={() => setStep('lines')}
            disabled={selectedSceneIds.size === 0}
            style={[s.confirmBtn, { backgroundColor: colors.primary, opacity: selectedSceneIds.size === 0 ? 0.5 : 1 }]}
            activeOpacity={0.85}
          >
            <Text style={s.confirmBtnText}>
              {selectedSceneIds.size === 0
                ? 'Elige al menos una escena'
                : `Continuar con ${selectedSceneIds.size === 1 ? '1 escena' : `${selectedSceneIds.size} escenas`}`}
            </Text>
            {selectedSceneIds.size > 0 && <ChevronRight size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

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
      <SafeAreaView style={[s.container, { backgroundColor: 'transparent' }]} edges={['top', 'left', 'right']}>

        {/* ── Header ── */}
        <View style={[s.header, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
          <TouchableOpacity
            onPress={() => (step === 'lines' && multiScene ? setStep('scenes') : router.back())}
            style={[s.headerIconBtn, glassHeaderBtn]}
          >
            <ArrowLeft size={20} color={isDark ? onBg : '#FFFFFF'} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[s.headerTitle, { color: onBg, textAlign: 'center' }]}>
              {step === 'scenes' ? 'Elige las escenas' : 'Revisar guion'}
            </Text>
            <Text style={[s.headerSub, { color: onBg2, textAlign: 'center' }]}>
              {step === 'scenes'
                ? `${selectedSceneIds.size} de ${scenes.length} escenas`
                : `${visibleLines.length} líneas · Usa ≡ para reordenar`}
            </Text>
          </View>
          {step === 'scenes' ? <View style={{ width: 84 }} /> : (
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
          )}
        </View>

        {step === 'scenes' ? renderScenePicker() : (
        <>

        {/* ── Draggable list ── */}
        <DraggableFlatList
          ref={flatListRef}
          data={visibleLines}
          keyExtractor={item => item.id}
          onDragBegin={() => Haptics.selectionAsync()}
          onDragEnd={({ data }) => {
            // Se reordena lo visible; las escenas no elegidas siguen pegadas a sus vecinas.
            const merged = multiScene ? mergeVisibleOrder(lines, data) : data;
            setLines(merged);
            syncOrder(merged);
          }}
          containerStyle={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{ paddingHorizontal: rp(16), paddingTop: rp(12), paddingBottom: 140 }}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item, drag, isActive, getIndex }) => {
            const index = getIndex() ?? 0;
            const charColor = item.isAction ? colors.primary : (item.isUserCharacter ? '#10B981' : (item.color || colors.primary));
            const charData = characters.find(c => c.name.toLowerCase().trim() === item.characterName.toLowerCase().trim());
            const hasEmotionSelector = supportsEmotionSelector(charData?.voice_provider);
            // Expresiva (ElevenLabs v4): varias etiquetas por réplica en vez de una emoción.
            const isExpressiveVoice = charData?.voice_provider === 'elevenlabs';
            const tagMarkup = item.voiceDirection?.markup;
            const tagCount = tagMarkup && isMarkupCurrent(tagMarkup, item.text) ? (tagMarkup.match(/\([^)]*\)/g) || []).length : 0;
            const sceneStart = multiScene && !isActive && (index === 0 || visibleLines[index - 1]?.sceneId !== item.sceneId)
              ? sceneById.get(item.sceneId)
              : undefined;

            return (
              <ScaleDecorator activeScale={1.02}>
                {sceneStart && (
                  <Text style={[s.sceneDivider, { color: onBg2 }]} numberOfLines={1}>
                    {`ESCENA ${sceneStart.scene_number}${sceneStart.heading ? ` · ${sceneStart.heading}` : ''}`}
                  </Text>
                )}
                <View style={[s.cardShadowWrapper, draggableCardShadow(isDark, isActive, charColor)]}>
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
                      <Text style={[s.lineNum, { color: onBg2 }]}>
                        {pendingChanges[item.id] ? 'sin confirmar · ' : ''}#{index + 1}
                      </Text>
                    </View>
                    {(() => {
                      // Voz Expresiva con etiquetas: se ve la réplica con ellas, resaltadas.
                      const markup = item.voiceDirection?.markup;
                      if (markup && isMarkupCurrent(markup, item.text)) {
                        return (
                          <Text style={[s.dialogueText, { color: onBg }]}>
                            {(markup as string).split(/(\([^)]*\))/g).map((part: string, i: number) => (
                              /^\(.*\)$/.test(part)
                                ? <Text key={`${i}-${part}`} style={{ color: charColor, fontStyle: 'italic', fontWeight: '600' }}>{part}</Text>
                                : <Text key={`${i}-${part}`}>{part}</Text>
                            ))}
                          </Text>
                        );
                      }
                      return (
                        <>
                          <Text style={[s.dialogueText, { color: onBg }]}>{item.text}</Text>
                          {!!markup && (
                            <Text style={[s.emotionLabel, { color: '#F59E0B', marginTop: 4 }]}>
                              El texto cambió y sus emociones ya no encajan: vuelve a ponerlas.
                            </Text>
                          )}
                        </>
                      );
                    })()}

                    <View style={s.cardFooterRow}>
                      {!item.isAction && !item.isUserCharacter && isExpressiveVoice ? (
                        <View style={{ alignItems: 'flex-start' }}>
                          <Text style={[s.emotionLabel, { color: onBg2 }]}>Configurar emociones</Text>
                          <TouchableOpacity
                            ref={index === emotionTourIndex ? emotionButtonRef : undefined}
                            style={{ flexDirection: 'row', alignItems: 'center' }}
                            onPress={() => {
                              if (!canUseExpressiveTags()) {
                                Alert.alert('Voces Expresiva', 'Las emociones por frase están disponibles en el plan superior.');
                                return;
                              }
                              setTagsLine(item);
                            }}
                          >
                            <Text style={{ marginRight: 6 }}>🎭</Text>
                            <View style={{
                                backgroundColor: tagCount > 0 ? charColor + '30' : neutralChipBg,
                                paddingHorizontal: rp(8),
                                paddingVertical: rp(4),
                                borderRadius: rp(12),
                            }}>
                              <Text style={{ fontSize: rf(12), color: onBg, fontWeight: tagCount > 0 ? '600' : '400' }}>
                                {tagCount === 0 ? 'Sin emociones' : tagCount === 1 ? '1 emoción' : `${tagCount} emociones`} ▸
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      ) : !item.isAction && !item.isUserCharacter && hasEmotionSelector ? (
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
          <BlurView experimentalBlurMethod={ANDROID_BLUR_METHOD} intensity={isDark ? 55 : 65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
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
        </>
        )}

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
                <ModalGlassFill isDark={isDark} intensity={isDark ? 55 : 75} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.40)' : 'rgba(235,230,245,0.40)' }]} />
                <SafeAreaView edges={{ bottom: 'additive' }} style={{ padding: rp(24) }}>
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
                </SafeAreaView>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        <ExpressiveTagsSheet
          visible={!!tagsLine}
          characterName={tagsLine?.characterName || ''}
          initialText={tagsLine ? initialMarkup(tagsLine.text, tagsLine.voiceDirection) : ''}
          onCancel={() => setTagsLine(null)}
          onSave={handleTagsSave}
          isDark={isDark}
          colors={{ onBg, onBg2, fieldBg, fieldBorder, cardBorder, primary: colors.primary, accent: accentOnGlass }}
        />

        {/* ── Emotion Selector Modal ── */}
        <Modal
          visible={emotionModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEmotionModalVisible(false)}
         supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
          <Pressable style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={() => setEmotionModalVisible(false)}>
            <SafeAreaView edges={{ bottom: 'additive' }} style={[s.modalContent, { paddingBottom: rp(20) }]}>
              <ModalGlassFill isDark={isDark} intensity={isDark ? 55 : 75} />
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
            </SafeAreaView>
          </Pressable>
        </Modal>

        {/* ── Add Line Modal ── */}
        <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)} supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <Pressable style={s.modalOverlay} onPress={() => setShowAddModal(false)}>
              <Pressable onPress={e => e.stopPropagation()} style={s.modalContent}>
                <ModalGlassFill isDark={isDark} intensity={isDark ? 55 : 75} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.40)' : 'rgba(235,230,245,0.40)' }]} />
                <SafeAreaView edges={{ bottom: 'additive' }} style={{ padding: rp(24) }}>
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
                </SafeAreaView>
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
            <View style={[s.modalContent, { maxHeight: dialogMaxHeight }]}>
              <ModalGlassFill isDark={isDark} intensity={isDark ? 55 : 75} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.40)' : 'rgba(235,230,245,0.40)' }]} />
              <ScrollView style={dialogScrollStyle} bounces={false}>
              <SafeAreaView edges={{ bottom: 'additive' }} style={{ padding: rp(24) }}>
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
              </SafeAreaView>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <ConfirmDialog
          visible={showDiscardDialog}
          title="Cambios sin confirmar"
          message="Has cambiado emociones o textos que aún no se han guardado. Si sales ahora se descartan y las voces se quedan como estaban."
          cancelText="Seguir revisando"
          confirmText="Salir sin guardar"
          destructive
          onCancel={() => { setShowDiscardDialog(false); pendingLeaveActionRef.current = null; }}
          onConfirm={discardAndLeave}
        />
        <ConfirmDialog
          visible={showConfirmDialog}
          title="Confirmar guion"
          message={`Se prepararán las voces de ${visibleLines.filter(l => !l.isUserCharacter && !l.isAction).length} líneas de réplica${multiScene ? ` (${selectedSceneIds.size} de ${scenes.length} escenas)` : ''}. Las que ya estaban hechas no se vuelven a generar. ¿Continuar?`}
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
          <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1625' }} edges={['top', 'left', 'right']}>
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

            {/* Android: su WebView no muestra PDF (lo descarga), ver AndroidPdfViewer */}
            {pdfSignedUrl && Platform.OS === 'android' && (
              <AndroidPdfViewer
                url={pdfSignedUrl}
                onError={() => {
                  Alert.alert('Error', 'No se pudo cargar el PDF original.');
                  setShowPdfViewer(false);
                  setPdfSignedUrl(null);
                }}
              />
            )}
            {pdfSignedUrl && Platform.OS !== 'android' && (
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
  cardShadowWrapper: { borderRadius: 16, marginBottom: 10 },
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
  scenesIntro: { fontSize: rf(14), lineHeight: 20, textAlign: 'center', marginBottom: rp(8), paddingHorizontal: rp(8) },
  scenesToggleAll: { alignSelf: 'flex-end', paddingVertical: rp(8), paddingHorizontal: rp(4), marginBottom: rp(4) },
  scenesToggleAllText: { fontSize: rf(14), fontWeight: '700' },
  sceneCard: { flexDirection: 'row', alignItems: 'flex-start', gap: rp(12), padding: rp(14), borderRadius: 14, borderWidth: 1.5 },
  sceneCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  sceneTitle: { fontSize: rf(15), fontWeight: '700' },
  sceneMeta: { fontSize: rf(12), fontWeight: '600', marginTop: 4, letterSpacing: 0.3 },
  scenePreview: { fontSize: rf(13), marginTop: 6, lineHeight: 18 },
  sceneVoices: { fontSize: rf(12), marginTop: 6 },
  sceneDivider: { fontSize: rf(12), fontWeight: '700', letterSpacing: 0.6, marginTop: rp(8), marginBottom: rp(8), marginLeft: rp(4) },
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
