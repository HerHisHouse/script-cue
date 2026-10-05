import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  ImageBackground,
} from 'react-native';
import { useDialogMaxHeight, dialogScrollStyle } from '@/hooks/useDialogMaxHeight';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import {
  ArrowLeft,
  Brain,
  Sparkles,
  Activity,
  ChevronRight,
  Info,
  AlertCircle,
  Square,
  CheckSquare,
  Target,
  Users,
  ShieldAlert,
  RefreshCw,
  Play,
  User,
  History,
} from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { serverAuthHeaders } from '@/utils/serverAuth';
import { RENDER_SERVER_URL } from '@/utils/serverUrl';
import { createErrorReference, reportErrorToSupport, SUPPORT_EMAIL } from '@/utils/errorReports';
import { useTheme } from '@/contexts/ThemeContext';
import { GlassCard } from '@/components/GlassCard';
import { useAuth } from '@/contexts/AuthContext';
import { BETA_LIMITS, isUserBetaLimited } from '@/constants/betaLimits';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rf, rp } from '@/utils/responsive';
import { trackEvent } from '@/utils/analytics';
import { ModalGlassFill } from '@/components/ModalGlassFill';

// Modo Escena: análisis interpretativo hecho SOLO sobre el guion (escena + personaje). No usa
// grabaciones ni valora la actuación. El análisis lo genera POST /analyze-scene (server/) y se
// guarda en la tabla scene_analyses por escena y personaje.

const COACH_DISCLAIMER_KEY = '@coach_disclaimer_shown';
const ANALYSIS_TIMEOUT_MS = 120000;
const MODE = 'scene';

const INFO_TEXT =
  'Elige una escena y tu personaje: ScriptCue lee el guion y te propone distintas maneras de interpretarlo. No analiza ni valora tu actuación: es un laboratorio para explorar.';

// Errores que el propio usuario puede resolver: se explican sin ofrecer reporte.
const USER_FIXABLE_ERRORS = new Set([
  'UNAUTHORIZED', 'MISSING_FIELDS', 'SCRIPT_NOT_FOUND', 'SCENE_NOT_FOUND',
  'CHARACTER_NOT_FOUND', 'EMPTY_SCENE', 'CHARACTER_NOT_IN_SCENE', 'MAX_PROPOSAL_BATCHES',
  'BETA_SCENE_ANALYSIS_LIMIT',
]);

// Igual que MAX_PROPOSAL_BATCHES en server/sceneAnalysis.js.
const MAX_PROPOSAL_BATCHES = 10;

const INTRO_POINTS = ['Qué quiere tu personaje.', 'Qué se lo impide.', 'Qué relación tiene.'];

interface SceneRow { id: string; heading: string; scene_number: number; order_index: number }
interface LineRow { scene_id: string; character_name: string; content: string; order_index: number }
interface CharacterRow { id: string; name: string; is_user_character: boolean | null }
interface Lectura { objetivo: string; obstaculo: string; relacion: string; ritmo: string }
interface Propuesta { titulo: string; eleccion: string; en_el_texto: string; como_probarlo: string }
interface Tanda { propuestas: Propuesta[]; createdAt: string }
// La lectura se genera una vez; cada "Crear nuevas propuestas" añade una tanda sin borrar las anteriores.
interface SceneAnalysis { lectura: Lectura; tandas: Tanda[] }
interface SavedAnalysis { analysis: SceneAnalysis; updatedAt: string }

const LECTURA_ITEMS: { key: keyof Lectura; label: string; Icon: typeof Target }[] = [
  { key: 'objetivo', label: 'Objetivo', Icon: Target },
  { key: 'obstaculo', label: 'Obstáculo', Icon: ShieldAlert },
  { key: 'relacion', label: 'Relación', Icon: Users },
  { key: 'ritmo', label: 'Ritmo', Icon: Activity },
];

const isActionLine = (name: string) => ['ACCIÓN', 'ACCION'].includes(name.trim().toUpperCase());

// Los análisis guardados antes del historial ({ lectura, propuestas }) se leen como la tanda 1.
function toSceneAnalysis(raw: any, fallbackDate: string): SceneAnalysis | null {
  if (!raw?.lectura) return null;
  if (Array.isArray(raw.tandas)) return { lectura: raw.lectura, tandas: raw.tandas };
  return { lectura: raw.lectura, tandas: [{ propuestas: raw.propuestas || [], createdAt: fallbackDate }] };
}
const analysisKey = (sceneId: string, characterId: string) => `${sceneId}:${characterId}`;

export default function SceneModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const scriptId = String(id);
  const { colors, isDark } = useTheme();
  const dialogMaxHeight = useDialogMaxHeight();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  // Paleta "sobre imagen de fondo" del diseño glass, igual que Modo Análisis / Editar guion
  const onBg = isDark ? '#ffffff' : '#2a2447';
  const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
  const cardBg = isDark ? 'rgba(124,106,247,0.08)' : 'rgba(255,255,255,0.55)';
  const cardBorder = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)';
  const accent = isDark ? '#FFFFFF' : colors.primary;
  const glassHeaderBtn = isDark
    ? { backgroundColor: 'rgba(124,106,247,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
    : { backgroundColor: colors.primary };
  const primaryButtonBg = isDark
    ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
    : { backgroundColor: colors.primary };
  const activeTabBg = isDark ? 'rgba(124,106,247,0.20)' : 'rgba(104,58,121,0.12)';
  const modalOverlayTint = isDark ? 'rgba(124,106,247,0.20)' : 'rgba(235,230,245,0.55)';
  const coachBg = () => (isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png'));

  const [loading, setLoading] = useState(true);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [saved, setSaved] = useState<Record<string, SavedAnalysis>>({});
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'lectura' | 'propuestas' | 'historial'>('lectura');
  // Tanda de propuestas que se está viendo (null = la más reciente).
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null);

  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [infoDialog, setInfoDialog] = useState({ visible: false, title: '', message: '' });
  const [errorDialog, setErrorDialog] = useState<{ visible: boolean; reference: string; technicalMessage?: string }>({
    visible: false,
    reference: '',
  });

  const showInfo = (title: string, message: string) => setInfoDialog({ visible: true, title, message });

  useEffect(() => {
    AsyncStorage.getItem(COACH_DISCLAIMER_KEY)
      .then(value => { if (value !== 'true') setShowDisclaimer(true); })
      .catch(() => setShowDisclaimer(true));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: sceneData } = await supabase
        .from('scenes')
        .select('id, heading, scene_number, order_index')
        .eq('script_id', scriptId)
        .order('order_index', { ascending: true });
      const sceneRows = (sceneData || []) as SceneRow[];

      const [linesRes, charsRes, savedRes] = await Promise.all([
        sceneRows.length
          ? supabase.from('lines').select('scene_id, character_name, content, order_index')
            .in('scene_id', sceneRows.map(s => s.id)).order('order_index', { ascending: true })
          : Promise.resolve({ data: [] as LineRow[] }),
        supabase.from('characters').select('id, name, is_user_character').eq('script_id', scriptId).order('name'),
        supabase.from('scene_analyses').select('scene_id, character_id, analysis, updated_at').eq('script_id', scriptId),
      ]);

      setScenes(sceneRows);
      setLines((linesRes.data || []) as LineRow[]);
      setCharacters((charsRes.data || []) as CharacterRow[]);
      const savedMap: Record<string, SavedAnalysis> = {};
      for (const row of savedRes.data || []) {
        const analysis = toSceneAnalysis(row.analysis, row.updated_at);
        if (analysis) savedMap[analysisKey(row.scene_id, row.character_id)] = { analysis, updatedAt: row.updated_at };
      }
      setSaved(savedMap);
      // Guion de una sola escena (lo habitual): se salta el paso de elegir escena.
      if (sceneRows.length === 1) setSceneId(sceneRows[0].id);
    } catch (e) {
      console.error('[Escena] Error cargando el guion:', e);
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    loadData();
    if (user) trackEvent(user.id, 'mode_opened', MODE, { script_id: scriptId });
  }, [loadData, user, scriptId]);

  // Por escena: réplicas, quién habla (en orden de aparición) y las primeras líneas para reconocerla.
  const sceneInfo = useMemo(() => {
    const info: Record<string, { dialogueCount: number; speakers: string[]; preview: string }> = {};
    for (const scene of scenes) info[scene.id] = { dialogueCount: 0, speakers: [], preview: '' };
    for (const line of lines) {
      const entry = info[line.scene_id];
      if (!entry || isActionLine(line.character_name)) continue;
      entry.dialogueCount++;
      const name = line.character_name.trim().toUpperCase();
      if (!entry.speakers.includes(name)) entry.speakers.push(name);
      if (!entry.preview) entry.preview = `${name}: ${line.content.trim()}`;
    }
    return info;
  }, [scenes, lines]);

  const selectedScene = scenes.find(s => s.id === sceneId) || null;
  const selectedCharacter = characters.find(c => c.id === characterId) || null;
  const sceneCharacters = useMemo(() => {
    if (!sceneId) return [];
    const speakers = sceneInfo[sceneId]?.speakers || [];
    return speakers
      .map(name => characters.find(c => c.name.trim().toUpperCase() === name))
      .filter((c): c is CharacterRow => !!c);
  }, [sceneId, sceneInfo, characters]);

  const current = sceneId && characterId ? saved[analysisKey(sceneId, characterId)] : undefined;
  const singleScene = scenes.length === 1;
  const tandas = current?.analysis.tandas ?? [];
  const batchIndex = selectedBatch != null && selectedBatch < tandas.length ? selectedBatch : tandas.length - 1;
  const shownBatch = tandas[batchIndex];
  const canCreateMore = tandas.length < MAX_PROPOSAL_BATCHES;

  // Beta: un solo análisis por guion (el servidor también lo aplica). Si ya existe, se indica cuál es.
  const betaLimited = isUserBetaLimited(user, profile);
  const betaAnalysisUsed = betaLimited && Object.keys(saved).length >= BETA_LIMITS.MAX_SCENE_ANALYSES_PER_SCRIPT;
  const usedAnalysis = useMemo(() => {
    if (!betaAnalysisUsed) return null;
    const [usedSceneId, usedCharacterId] = Object.keys(saved)[0].split(':');
    const usedScene = scenes.find(s => s.id === usedSceneId);
    const usedCharacter = characters.find(c => c.id === usedCharacterId);
    return usedScene && usedCharacter ? { scene: usedScene, character: usedCharacter } : null;
  }, [betaAnalysisUsed, saved, scenes, characters]);

  function openUsedAnalysis() {
    if (!usedAnalysis) return;
    setSceneId(usedAnalysis.scene.id);
    setCharacterId(usedAnalysis.character.id);
    setSelectedBatch(null);
    setActiveTab('lectura');
  }

  function goBack() {
    if (characterId) { setCharacterId(null); return; }
    if (sceneId && !singleScene) { setSceneId(null); return; }
    router.back();
  }

  async function handleDisclaimerAccept() {
    if (dontShowAgain) {
      await AsyncStorage.setItem(COACH_DISCLAIMER_KEY, 'true').catch(() => { });
    }
    setShowDisclaimer(false);
  }

  async function startAnalysis(newProposals = false) {
    if (!sceneId || !characterId || analyzing) return;
    setAnalyzing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

    try {
      const response = await fetch(`${RENDER_SERVER_URL}/analyze-scene`, {
        method: 'POST',
        headers: { ...(await serverAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId, sceneId, characterId, newProposals }),
        signal: controller.signal,
      });
      let data: any = null;
      try { data = await response.json(); } catch { data = null; }

      const updatedAt = data?.updatedAt || new Date().toISOString();
      const analysis = response.ok && data?.success ? toSceneAnalysis(data.analysis, updatedAt) : null;
      if (analysis) {
        setSaved(prev => ({ ...prev, [analysisKey(sceneId, characterId)]: { analysis, updatedAt } }));
        setSelectedBatch(null);
        setActiveTab(newProposals ? 'propuestas' : 'lectura');
        if (user) trackEvent(user.id, 'analysis_completed', MODE, { script_id: scriptId });
        return;
      }

      if (data?.errorCode && USER_FIXABLE_ERRORS.has(data.errorCode)) {
        showInfo('No se puede analizar', data.error);
        return;
      }
      setErrorDialog({
        visible: true,
        // El servidor ya guardó el detalle con su código; si no llegó, el detalle va en el reporte.
        reference: data?.reference || createErrorReference(),
        technicalMessage: data?.reference ? undefined : `HTTP ${response.status} en /analyze-scene${data ? '' : ' (respuesta no JSON)'}`,
      });
    } catch (e: any) {
      setErrorDialog({
        visible: true,
        reference: createErrorReference(),
        technicalMessage: e?.name === 'AbortError'
          ? `Tiempo agotado (${ANALYSIS_TIMEOUT_MS / 1000}s) en /analyze-scene`
          : `Error de red en /analyze-scene: ${e?.message || e}`,
      });
    } finally {
      clearTimeout(timeoutId);
      setAnalyzing(false);
    }
  }

  async function handleReport() {
    const { reference, technicalMessage } = errorDialog;
    setErrorDialog({ visible: false, reference: '' });
    const { saved: reportSaved, emailOpened } = await reportErrorToSupport({
      reference,
      mode: MODE,
      technicalMessage,
      details: { scriptId, sceneId, characterId },
    });
    if (!emailOpened) {
      showInfo(
        reportSaved ? 'Reporte enviado' : 'No se pudo enviar el reporte',
        reportSaved
          ? `Gracias, lo revisaremos. Si quieres darnos más detalles, escríbenos a ${SUPPORT_EMAIL} indicando el código ${reference}.`
          : `Escríbenos a ${SUPPORT_EMAIL} indicando el código ${reference} y lo revisaremos.`,
      );
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

  const headerTitle = characterId ? 'Análisis de la escena' : sceneId ? 'Elige tu personaje' : 'Modo Escena';

  const renderSceneList = () => (
    <View style={styles.listContent}>
      <Text style={[styles.subtitle, { color: onBg2 }]}>Elige la escena que quieres trabajar.</Text>
      {scenes.map(scene => {
        const info = sceneInfo[scene.id];
        const analyzed = Object.keys(saved).some(k => k.startsWith(`${scene.id}:`));
        return (
          <TouchableOpacity key={scene.id} activeOpacity={0.8} onPress={() => setSceneId(scene.id)}>
            <GlassCard isDark={isDark} style={styles.rowCardOuter} contentStyle={styles.rowCard} backgroundColor={cardBg} borderColor={cardBorder} shadowRecipe={{ offsetY: 2, blur: 10, opacity: 0.05 }} shadowAlwaysOn>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: onBg }]} numberOfLines={2}>
                  {`Escena ${scene.scene_number}${scene.heading ? ` · ${scene.heading}` : ''}`}
                </Text>
                {!!info?.speakers.length && (
                  <Text style={[styles.rowMeta, { color: accent }]} numberOfLines={1}>{info.speakers.join(' · ')}</Text>
                )}
                {!!info?.preview && (
                  <Text style={[styles.rowPreview, { color: onBg2 }]} numberOfLines={2}>{info.preview}</Text>
                )}
                {analyzed && (
                  <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
                    <Brain size={12} color={accent} />
                    <Text style={[styles.badgeText, { color: accent }]}>Analizada</Text>
                  </View>
                )}
              </View>
              <ChevronRight size={20} color={onBg2} />
            </GlassCard>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderCharacterList = () => (
    <View style={styles.listContent}>
      {selectedScene && (
        <Text style={[styles.subtitle, { color: onBg2 }]} numberOfLines={2}>
          {singleScene ? '¿Qué personaje interpretas?' : `Escena ${selectedScene.scene_number}${selectedScene.heading ? ` · ${selectedScene.heading}` : ''}`}
        </Text>
      )}
      {sceneCharacters.length === 0 ? (
        <Text style={[styles.subtitle, { color: onBg2 }]}>Esta escena no tiene réplicas de ningún personaje.</Text>
      ) : (
        sceneCharacters.map(char => {
          const isUser = !!char.is_user_character;
          const analyzed = !!(sceneId && saved[analysisKey(sceneId, char.id)]);
          return (
            <TouchableOpacity key={char.id} activeOpacity={0.8} onPress={() => { setCharacterId(char.id); setActiveTab('lectura'); setSelectedBatch(null); }}>
              <GlassCard
                isDark={isDark}
                style={styles.rowCardOuter}
                contentStyle={styles.rowCard}
                backgroundColor={cardBg}
                borderColor={isUser ? colors.primary : cardBorder}
                shadowRecipe={{ offsetY: 2, blur: 10, opacity: 0.05 }}
                shadowAlwaysOn
              >
                <User size={20} color={isUser ? accent : onBg2} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: onBg }]}>{char.name.toUpperCase()}</Text>
                  {(isUser || analyzed) && (
                    <Text style={[styles.rowMeta, { color: accent }]}>
                      {[isUser ? 'Tu personaje' : null, analyzed ? 'Analizado' : null].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
                <ChevronRight size={20} color={onBg2} />
              </GlassCard>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  const renderAnalysis = () => (
    <View>
      <View style={styles.selectionSummary}>
        <Text style={[styles.summaryCharacter, { color: onBg }]}>{selectedCharacter?.name.toUpperCase()}</Text>
        {selectedScene && (
          <Text style={[styles.summaryScene, { color: onBg2 }]} numberOfLines={2}>
            {`Escena ${selectedScene.scene_number}${selectedScene.heading ? ` · ${selectedScene.heading}` : ''}`}
          </Text>
        )}
      </View>

      {!current ? (
        <View style={styles.introSection}>
          <View style={[styles.introCard, { backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }]}>
            <Brain size={48} color={accent} style={{ marginBottom: 16 }} />
            <Text style={[styles.introTitle, { color: onBg }]}>Lectura de la escena</Text>
            <Text style={[styles.introText, { color: onBg2 }]}>ScriptCue leerá el guion para saber:</Text>
            <View style={styles.introList}>
              {INTRO_POINTS.map(point => (
                <View key={point} style={styles.introListItem}>
                  <Text style={[styles.introText, { color: onBg2 }]}>-</Text>
                  <Text style={[styles.introText, styles.introListText, { color: onBg2 }]}>{point}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.introText, { color: onBg2 }]}>
              Con esta información te dará diferentes propuestas de actuación.
            </Text>
            {betaAnalysisUsed ? (
              <View style={[styles.betaNotice, { borderColor: cardBorder }]}>
                <Text style={[styles.betaNoticeText, { color: onBg }]}>
                  En la versión beta puedes hacer un análisis por guion
                  {usedAnalysis
                    ? ` y ya lo has usado en la escena ${usedAnalysis.scene.scene_number} con ${usedAnalysis.character.name.toUpperCase()}.`
                    : ' y ya lo has usado.'}
                </Text>
                {usedAnalysis && (
                  <TouchableOpacity style={[styles.analyzeButton, primaryButtonBg]} onPress={openUsedAnalysis}>
                    <Brain size={20} color="#fff" />
                    <Text style={styles.analyzeButtonText}>Ver mi análisis</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity style={[styles.analyzeButton, primaryButtonBg]} onPress={() => startAnalysis()} disabled={analyzing}>
                {analyzing ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Sparkles size={20} color="#fff" />
                    <Text style={styles.analyzeButtonText}>Analizar escena</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {analyzing && (
              <Text style={[styles.introHint, { color: onBg2 }]}>Puede tardar hasta un minuto.</Text>
            )}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.tabsRow}>
            {([
              ['lectura', 'Lectura', Activity],
              ['propuestas', 'Propuestas', Sparkles],
              ...(tandas.length > 1 ? [['historial', 'Historial', History] as const] : []),
            ] as const).map(([key, label, Icon]) => {
              const active = activeTab === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.tab, { borderColor: active ? colors.primary : 'transparent' }, active && { backgroundColor: activeTabBg }]}
                  onPress={() => setActiveTab(key)}
                >
                  <Icon size={18} color={active ? accent : onBg2} />
                  <Text style={[styles.tabText, { color: active ? accent : onBg2 }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeTab === 'lectura' ? (
            <View style={styles.tabContent}>
              <GlassCard isDark={isDark} contentStyle={styles.lecturaCard} backgroundColor={cardBg} borderColor={cardBorder} shadowRecipe={{ offsetY: 2, blur: 10, opacity: 0.05 }} shadowAlwaysOn>
                {LECTURA_ITEMS.map(({ key, label, Icon }, index) => (
                  <View key={key} style={styles.lecturaItem}>
                    {index > 0 && <View style={[styles.divider, { backgroundColor: cardBorder }]} />}
                    <View style={styles.lecturaLabelRow}>
                      <Icon size={20} color={accent} />
                      <Text style={[styles.lecturaLabel, { color: accent }]}>{label}</Text>
                    </View>
                    <Text style={[styles.lecturaValue, { color: onBg }]}>{current.analysis.lectura[key]}</Text>
                  </View>
                ))}
              </GlassCard>
            </View>
          ) : activeTab === 'historial' ? (
            <View style={styles.tabContent}>
              {tandas.map((tanda, index) => ({ tanda, index })).reverse().map(({ tanda, index }) => {
                const viewing = index === batchIndex;
                return (
                  <TouchableOpacity key={index} activeOpacity={0.8} onPress={() => { setSelectedBatch(index); setActiveTab('propuestas'); }}>
                    <GlassCard isDark={isDark} style={styles.rowCardOuter} contentStyle={styles.historyCard} backgroundColor={cardBg} borderColor={viewing ? colors.primary : cardBorder} shadowRecipe={{ offsetY: 2, blur: 10, opacity: 0.05 }} shadowAlwaysOn>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: onBg }]}>
                          {`Tanda ${index + 1}`}
                          <Text style={[styles.historyDate, { color: onBg2 }]}>{`  ·  ${formatDate(tanda.createdAt)}`}</Text>
                        </Text>
                        {tanda.propuestas.map((prop, i) => (
                          <Text key={i} style={[styles.rowPreview, { color: onBg2 }]} numberOfLines={1}>{`${i + 1}. ${prop.titulo}`}</Text>
                        ))}
                        {viewing && (
                          <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
                            <Text style={[styles.badgeText, { color: accent }]}>Viendo</Text>
                          </View>
                        )}
                      </View>
                      <ChevronRight size={20} color={onBg2} />
                    </GlassCard>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.tabContent}>
              {tandas.length > 1 && shownBatch && (
                <Text style={[styles.batchHeader, { color: onBg2 }]}>
                  {`Tanda ${batchIndex + 1} de ${tandas.length} · ${formatDate(shownBatch.createdAt)}`}
                </Text>
              )}
              {(shownBatch?.propuestas ?? []).map((prop, i) => (
                <GlassCard key={i} isDark={isDark} style={styles.propuestaCardOuter} contentStyle={[styles.propuestaCard, { borderLeftColor: '#a78bfa' }]} backgroundColor={cardBg} borderColor={cardBorder} borderRadius={12} shadowRecipe={{ offsetY: 2, blur: 10, opacity: 0.05 }} shadowAlwaysOn>
                  <View style={styles.propuestaNumberBox}>
                    <Text style={styles.propuestaNumber}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.propuestaTitle, { color: onBg }]}>{prop.titulo}</Text>
                    <Text style={[styles.propuestaText, { color: onBg }]}>{prop.eleccion}</Text>
                    {!!prop.en_el_texto && (
                      <>
                        <Text style={[styles.propuestaLabel, { color: accent }]}>En el texto</Text>
                        <Text style={[styles.propuestaText, { color: onBg2 }]}>{prop.en_el_texto}</Text>
                      </>
                    )}
                    {!!prop.como_probarlo && (
                      <>
                        <Text style={[styles.propuestaLabel, { color: accent }]}>Cómo probarlo</Text>
                        <Text style={[styles.propuestaText, { color: onBg2 }]}>{prop.como_probarlo}</Text>
                      </>
                    )}
                  </View>
                </GlassCard>
              ))}
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.primary, marginTop: rp(12) }]}
                onPress={() => router.push(`/scripts/${scriptId}/studio-v2`)}
              >
                <Play size={20} color={accent} />
                <Text style={[styles.secondaryButtonText, { color: accent }]}>Ensayar en Modo Estudio</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.reanalyzeRow}>
            {betaLimited ? (
              <Text style={[styles.reanalyzeDate, { color: onBg2 }]}>
                En la versión beta cada guion incluye un análisis, así que no se pueden crear más propuestas.
              </Text>
            ) : canCreateMore ? (
              <>
                <TouchableOpacity style={[styles.secondaryButton, styles.newProposalsButton, { borderColor: colors.primary }]} onPress={() => startAnalysis(true)} disabled={analyzing}>
                  {analyzing ? <ActivityIndicator size="small" color={accent} /> : <RefreshCw size={18} color={accent} />}
                  <Text style={[styles.secondaryButtonText, { color: accent }]}>{analyzing ? 'Creando propuestas…' : 'Crear nuevas propuestas'}</Text>
                </TouchableOpacity>
                <Text style={[styles.reanalyzeDate, { color: onBg2 }]}>
                  {analyzing ? 'Puede tardar hasta un minuto.' : 'Serán distintas de las que ya tienes; las anteriores quedan en el Historial.'}
                </Text>
              </>
            ) : (
              <Text style={[styles.reanalyzeDate, { color: onBg2 }]}>
                {`Has llegado al máximo de ${MAX_PROPOSAL_BATCHES} tandas para esta escena. Puedes repasarlas en el Historial.`}
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );

  return (
    <ImageBackground source={coachBg()} resizeMode="cover" style={styles.container}>
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { borderBottomColor: cardBorder }]}>
          <TouchableOpacity onPress={goBack} style={[styles.headerButton, glassHeaderBtn]}>
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: onBg }]}>{headerTitle}</Text>
          <TouchableOpacity onPress={() => showInfo('Modo Escena', INFO_TEXT)} style={[styles.headerButton, glassHeaderBtn]}>
            <Info size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : scenes.length === 0 ? (
          <View style={styles.emptyState}>
            <AlertCircle size={40} color={onBg2} style={{ marginBottom: 12 }} />
            <Text style={[styles.subtitle, { color: onBg2 }]}>Este guion todavía no tiene escenas con texto.</Text>
          </View>
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: rp(24) + insets.bottom }}>
            {!sceneId ? renderSceneList() : !characterId ? renderCharacterList() : renderAnalysis()}
          </ScrollView>
        )}

        <Modal
          visible={showDisclaimer}
          transparent
          animationType="fade"
          onRequestClose={() => { }}
          supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { borderWidth: 1, borderColor: cardBorder, overflow: 'hidden', maxHeight: dialogMaxHeight }]}>
              <ModalGlassFill isDark={isDark} intensity={isDark ? 55 : 65} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: modalOverlayTint }]} />
              <ScrollView style={dialogScrollStyle} contentContainerStyle={{ alignItems: 'center' }} bounces={false}>
                <View style={styles.modalHeader}>
                  <AlertCircle size={48} color={colors.primary} />
                  <Text style={[styles.modalTitle, { color: onBg }]}>Aviso Importante</Text>
                </View>
                <Text style={[styles.modalText, { color: onBg }]}>
                  El modo Escena es una herramienta de entrenamiento para explorar personajes y escenas desde distintas perspectivas. Diseñada para complementar el estudio y la preparación actoral, no para sustituir la formación profesional.
                </Text>
                <TouchableOpacity style={styles.checkboxRow} onPress={() => setDontShowAgain(!dontShowAgain)} activeOpacity={0.7}>
                  {dontShowAgain ? <CheckSquare size={24} color={colors.primary} /> : <Square size={24} color={onBg2} />}
                  <Text style={[styles.checkboxText, { color: onBg }]}>No volver a mostrar este mensaje</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.primary }]} onPress={handleDisclaimerAccept}>
                  <Text style={styles.modalButtonText}>Entendido</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <ConfirmDialog
          visible={infoDialog.visible}
          title={infoDialog.title}
          message={infoDialog.message}
          singleButton
          confirmText="OK"
          onConfirm={() => setInfoDialog({ visible: false, title: '', message: '' })}
          onCancel={() => setInfoDialog({ visible: false, title: '', message: '' })}
        />

        <ConfirmDialog
          visible={errorDialog.visible}
          title="No hemos podido analizar la escena"
          message={`Ha ocurrido un problema al analizar la escena. Inténtalo de nuevo en unos minutos; si se repite, repórtanoslo para que podamos revisarlo.\n\nCódigo: ${errorDialog.reference}`}
          confirmText="Reportar el problema"
          cancelText="Cerrar"
          onConfirm={handleReport}
          onCancel={() => setErrorDialog({ visible: false, reference: '' })}
        />
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(20),
    paddingVertical: rp(16),
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: rf(18), fontWeight: '600' },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  listContent: { padding: rp(20) },
  subtitle: { fontSize: rf(14), textAlign: 'center', marginBottom: rp(16), lineHeight: 20 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(32) },

  rowCardOuter: { marginBottom: 12 },
  rowCard: { flexDirection: 'row', alignItems: 'center', padding: rp(16) },
  rowTitle: { fontSize: rf(16), fontWeight: '700' },
  rowMeta: { fontSize: rf(12), fontWeight: '600', marginTop: 4, letterSpacing: 0.3 },
  rowPreview: { fontSize: rf(13), marginTop: 6, lineHeight: 18 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 8,
  },
  badgeText: { fontSize: rf(10), fontWeight: '700', textTransform: 'uppercase' },

  selectionSummary: { alignItems: 'center', paddingHorizontal: rp(20), paddingTop: rp(20) },
  summaryCharacter: { fontSize: rf(18), fontWeight: '800', letterSpacing: 1 },
  summaryScene: { fontSize: rf(13), marginTop: 4, textAlign: 'center' },

  introSection: { padding: rp(20) },
  introCard: { padding: rp(30), borderRadius: 16, alignItems: 'center', gap: 12 },
  introTitle: { fontSize: rf(20), fontWeight: '700' },
  introText: { textAlign: 'center', lineHeight: 20 },
  // La lista se centra como bloque, pero sus líneas quedan alineadas a la izquierda, una debajo de otra.
  introList: { alignSelf: 'center', alignItems: 'flex-start', gap: 2 },
  introListItem: { flexDirection: 'row', gap: 8 },
  introListText: { textAlign: 'left' },
  betaNotice: { width: '100%', alignItems: 'center', borderTopWidth: 1, paddingTop: rp(16), marginTop: rp(8) },
  betaNoticeText: { fontSize: rf(14), lineHeight: 20, textAlign: 'center' },
  introHint: { fontSize: rf(12), marginTop: 4 },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: rp(14),
    paddingHorizontal: rp(32),
    borderRadius: 30,
    marginTop: 20,
  },
  analyzeButtonText: { color: '#fff', fontSize: rf(16), fontWeight: '600' },

  tabsRow: { flexDirection: 'row', paddingHorizontal: rp(20), paddingTop: rp(16), gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: rp(8),
    paddingHorizontal: rp(16),
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: { fontSize: rf(14), fontWeight: '600' },
  tabContent: { padding: rp(20) },

  lecturaCard: { padding: rp(20) },
  lecturaItem: { paddingVertical: rp(12), width: '100%' },
  divider: { height: 1, width: '100%', marginBottom: 16, opacity: 0.3 },
  lecturaLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lecturaLabel: { fontSize: rf(13), fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  lecturaValue: { fontSize: rf(15), lineHeight: 22 },

  propuestaCardOuter: { marginBottom: 12 },
  propuestaCard: { flexDirection: 'row', padding: rp(16), borderLeftWidth: 4 },
  propuestaNumberBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  propuestaNumber: { color: '#a78bfa', fontSize: rf(14), fontWeight: '700' },
  propuestaTitle: { fontSize: rf(16), fontWeight: '700', marginBottom: 6 },
  propuestaLabel: { fontSize: rf(11), fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
  propuestaText: { fontSize: rf(14), lineHeight: 20 },

  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: rp(14),
    borderRadius: 12,
    borderWidth: 1.5,
  },
  secondaryButtonText: { fontSize: rf(15), fontWeight: '700' },

  reanalyzeRow: { alignItems: 'center', paddingHorizontal: rp(20), gap: 8 },
  newProposalsButton: { alignSelf: 'stretch' },
  historyCard: { flexDirection: 'row', alignItems: 'center', padding: rp(16) },
  historyDate: { fontSize: rf(13), fontWeight: '400' },
  batchHeader: { fontSize: rf(13), textAlign: 'center', marginBottom: rp(12) },
  reanalyzeDate: { fontSize: rf(12) },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: rp(20) },
  modalContent: { borderRadius: 24, padding: rp(24), alignItems: 'center' },
  modalHeader: { alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: rf(22), fontWeight: '700', marginTop: 12 },
  modalText: { fontSize: rf(15), textAlign: 'center', lineHeight: 22 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 24 },
  checkboxText: { fontSize: rf(14) },
  modalButton: { width: '100%', paddingVertical: rp(16), borderRadius: 16, alignItems: 'center' },
  modalButtonText: { color: '#fff', fontSize: rf(16), fontWeight: '700' },
});
