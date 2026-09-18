import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, ScrollView, ImageBackground, Animated, Easing, Keyboard, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ArrowLeft, Save, Edit3, X, Check, PenTool, Undo, Redo, Type, Bold, Italic, Underline, Strikethrough, Palette, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlignLeft, AlignCenter, AlignRight, Menu, Pilcrow, Pencil, Highlighter, Share2, Users } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { BlurView } from 'expo-blur';
import Svg, { Path, G, Image as SvgImage } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import Slider from '@react-native-community/slider';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { rf, rp } from '@/utils/responsive';
import ViewAndMarkOverlay from './components/ViewAndMarkOverlay';
import ExportOptionsSheet from './components/ExportOptionsSheet';
import { COLORS, type PathData } from './components/drawingShared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHARACTER_COLORS, GREEN_COLOR } from '@/utils/characterColors';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// --- Constants ---
// Pausa mínima (sin ninguna edición de texto) para que la siguiente edición
// abra un punto nuevo en el historial de deshacer — ver actionHistoryRef.
const EDIT_CHECKPOINT_GAP_MS = 800;

// Colores de resaltado (marcador/rotulador): llevan el canal alpha ya incorporado
// para que el texto siga leyéndose debajo, a diferencia de un color de texto sólido.
const HIGHLIGHT_COLORS: { key: string; label: string; color: string; swatch: string }[] = [
    { key: 'none', label: 'Sin resaltar', color: 'transparent', swatch: 'transparent' },
    { key: 'yellow', label: 'Amarillo', color: 'rgba(255,235,59,0.45)', swatch: '#FFEB3B' },
    { key: 'green', label: 'Verde', color: 'rgba(76,217,100,0.4)', swatch: '#4CD964' },
    { key: 'red', label: 'Rojo', color: 'rgba(255,59,48,0.4)', swatch: '#FF3B30' },
    { key: 'pink', label: 'Rosa', color: 'rgba(255,105,180,0.4)', swatch: '#FF69B4' },
    { key: 'blue', label: 'Azul', color: 'rgba(0,122,255,0.35)', swatch: '#007AFF' },
    { key: 'orange', label: 'Naranja', color: 'rgba(255,149,0,0.4)', swatch: '#FF9500' },
];

// Convierte un color de personaje (hex sólido) a un rgba translúcido, para
// usarlo como resaltado de marcador sin tapar el texto — mismo criterio de
// opacidad que HIGHLIGHT_COLORS de arriba.
function hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Formatos predefinidos de guion cinematográfico estándar. Cada uno aplica un
// conjunto completo de propiedades (no solo el tamaño) al párrafo donde esté
// el cursor, igual que hace un editor de guiones real.
const LINE_STYLES: { key: string; label: string; style: Record<string, string>; preview: any }[] = [
    {
        key: 'title',
        label: 'Título de guion',
        style: {
            textAlign: 'center',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            textDecoration: 'underline',
            fontSize: '15px',
            marginTop: '0px',
            marginBottom: '18px',
            maxWidth: 'none',
            marginLeft: '0',
            marginRight: '0',
        },
        preview: { fontWeight: 'bold', textTransform: 'uppercase', textDecorationLine: 'underline', textAlign: 'center' },
    },
    {
        key: 'scene',
        label: 'Encabezado de escena',
        style: {
            textAlign: 'left',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            textDecoration: 'none',
            fontSize: '12px',
            marginTop: '16px',
            marginBottom: '8px',
            maxWidth: 'none',
            marginLeft: '0',
            marginRight: '0',
        },
        preview: { fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'left' },
    },
    {
        key: 'action',
        label: 'Descripción de la acción',
        style: {
            textAlign: 'left',
            fontWeight: 'normal',
            textTransform: 'none',
            textDecoration: 'none',
            fontSize: '12px',
            marginTop: '6px',
            marginBottom: '8px',
            maxWidth: 'none',
            marginLeft: '0',
            marginRight: '0',
        },
        preview: { fontWeight: 'normal', textAlign: 'left' },
    },
    {
        key: 'character',
        label: 'Nombre de personaje',
        style: {
            textAlign: 'center',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            textDecoration: 'none',
            fontSize: '12px',
            marginTop: '10px',
            marginBottom: '0px',
            maxWidth: 'none',
            marginLeft: '0',
            marginRight: '0',
        },
        preview: { fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' },
    },
    {
        key: 'dialogue',
        label: 'Diálogo',
        style: {
            textAlign: 'center',
            fontWeight: 'normal',
            textTransform: 'none',
            textDecoration: 'none',
            fontSize: '12px',
            marginTop: '0px',
            marginBottom: '8px',
            maxWidth: '70%',
            marginLeft: 'auto',
            marginRight: 'auto',
        },
        preview: { fontWeight: 'normal', textAlign: 'center' },
    },
];

// --- Reconciliación con scenes/lines --------------------------------------
// El documento del editor se reconstruye SIEMPRE desde las tablas scenes/lines
// (fuente de verdad compartida con Revisar guion y Modo Estudio), y al guardar
// se vuelve a leer con estas mismas funciones en vez de regenerar el guion con
// IA. Cada párrafo lleva atributos data-* para poder emparejarlo de vuelta con
// su fila en la base de datos.

function stripHtmlTags(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// Divide el HTML del documento en sus elementos de nivel superior (<h1>/<p>).
// No hay párrafos anidados en este documento, así que un cierre no-codicioso
// hasta la primera etiqueta de cierre coincidente es suficiente (igual de
// simple que el splitter que ya usa studio-v2.tsx para script_html).
function splitTopLevelElements(html: string): { tag: string; attrs: string; innerHtml: string }[] {
    const result: { tag: string; attrs: string; innerHtml: string }[] = [];
    const regex = /<(h1|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        result.push({ tag: match[1].toLowerCase(), attrs: match[2], innerHtml: match[3] });
    }
    return result;
}

function getAttr(attrs: string, name: string): string | null {
    const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : null;
}

// content_html guarda, en un único TEXT, tanto el estilo propio del párrafo
// (por si el usuario lo reformateó a mano con uno de los 5 presets) como su
// HTML interno (negrita/resaltados/lo que sea) — así al reconstruir se puede
// reinsertar tal cual, sin perder ni el estilo ni el contenido enriquecido.
function packContentHtml(styleAttr: string, innerHtml: string): string {
    return JSON.stringify({ style: styleAttr, html: innerHtml });
}

function unpackContentHtml(packed: string | null): { style: string; html: string } | null {
    if (!packed) return null;
    try {
        const parsed = JSON.parse(packed);
        if (typeof parsed?.html === 'string') {
            return { style: typeof parsed.style === 'string' ? parsed.style : '', html: parsed.html };
        }
    } catch {
        // content_html corrupto o de un formato antiguo: se ignora, se usa la plantilla por defecto
    }
    return null;
}

// Para "lines": un nombre de personaje y su diálogo son DOS párrafos distintos
// (con formato propio cada uno) pero comparten la misma fila/id en BD, así que
// content_html/content_html_source de una línea llevan un JSON con dos "slots"
// independientes ("character" y "dialogue" — este último también se reutiliza
// para una línea de acción, que solo tiene un párrafo), cada uno validado
// contra su propio texto plano.
type PackedBlock = { style: string; html: string } | null;

function packLineContentHtml(dialogue: PackedBlock, character: PackedBlock): string {
    return JSON.stringify({ dialogue, character });
}

function unpackLineContentHtml(packed: string | null): { dialogue: PackedBlock; character: PackedBlock } {
    if (!packed) return { dialogue: null, character: null };
    try {
        const parsed = JSON.parse(packed);
        const dialogue = parsed?.dialogue && typeof parsed.dialogue.html === 'string'
            ? { style: typeof parsed.dialogue.style === 'string' ? parsed.dialogue.style : '', html: parsed.dialogue.html }
            : null;
        const character = parsed?.character && typeof parsed.character.html === 'string'
            ? { style: typeof parsed.character.style === 'string' ? parsed.character.style : '', html: parsed.character.html }
            : null;
        return { dialogue, character };
    } catch {
        return { dialogue: null, character: null };
    }
}

function packLineContentHtmlSource(dialogueSource: string | null, characterSource: string | null): string {
    return JSON.stringify({ dialogue: dialogueSource, character: characterSource });
}

function unpackLineContentHtmlSource(packed: string | null): { dialogue: string | null; character: string | null } {
    if (!packed) return { dialogue: null, character: null };
    try {
        const parsed = JSON.parse(packed);
        return {
            dialogue: typeof parsed?.dialogue === 'string' ? parsed.dialogue : null,
            character: typeof parsed?.character === 'string' ? parsed.character : null,
        };
    } catch {
        return { dialogue: null, character: null };
    }
}

export default function ScriptEditorScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors, isDark } = useTheme();

    // Paleta "sobre imagen de fondo" del diseño glass, igual que Modo Estudio / Importar Guion
    const onBg = isDark ? '#ffffff' : '#2a2447';
    const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
    const cardBorder = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)';
    const glassHeaderBtn = isDark
        ? { backgroundColor: 'rgba(124,106,247,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
        : { backgroundColor: colors.primary };
    // Mismo tratamiento que los botones principales (Modo Análisis / Importar Guion)
    const primaryButtonBg = isDark
        ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
        : { backgroundColor: colors.primary };
    const editorBg = () => (isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png'));
    // Más opaco que un tinte de cristal normal: al estar sobre la página del
    // guion (blanca) en vez de sobre el fondo morado con degradado, con menos
    // opacidad el blanco se colaba y la barra/los menús apenas se distinguían.
    // Mismo valor que usa la hoja de exportar, para que todo el flotante
    // inferior sea consistente.
    const popupOverlayTint = isDark ? 'rgba(20,16,32,0.96)' : 'rgba(235,230,245,0.97)';
    const chipInactiveBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(104,58,121,0.08)';
    const chipActiveBg = isDark ? 'rgba(124,106,247,0.30)' : 'rgba(104,58,121,0.15)';
    // colors.primary en modo oscuro es un morado apagado, casi del mismo tono
    // que chipActiveBg (el relleno de un botón/opción ya seleccionada) — el
    // icono/texto activo se veía casi invisible encima. En modo oscuro se usa
    // blanco puro para el elemento activo en vez de colors.primary (el borde sí
    // puede seguir siendo colors.primary, es un contorno fino, no un relleno).
    const activeAccent = isDark ? '#FFFFFF' : colors.primary;
    const insets = useSafeAreaInsets();
    const windowDimensions = useWindowDimensions();

    // Geometría de "página" REAL (A4, en puntos) — ya no se deriva del ancho de
    // pantalla del teléfono. Es la MISMA fuente de verdad tanto para insertar
    // los saltos de hoja en el WebView visible como para construir el PDF que
    // genera "Compartir" — evita que dos motores calculen algo ligeramente
    // distinto (la causa de los desajustes de intentos anteriores). Medido
    // sobre un guion de referencia real: A4 595×842pt, margen izquierdo ~108pt
    // (1.5in, hueco de encuadernación), resto ~72pt (1in).
    const pageWidth = 595;
    const pageHeight = 842;
    const pageMarginTop = 72;
    const pageMarginBottom = 72;
    const pageMarginRight = 72;
    const pageMarginLeft = 108;
    const pageContentHeight = pageHeight - pageMarginTop - pageMarginBottom;

    // Ancho real de la tarjeta del guion en pantalla — pageShadowWrapper ya no le
    // resta ningún margen horizontal (llega borde a borde). Como la "página"
    // ahora es de tamaño FIJO (más ancha que el teléfono), el WebView se
    // renderiza a pageWidth y se reescala visualmente para caber aquí —
    // displayScale es ese factor, y hay que aplicarlo en cualquier punto donde
    // el dibujo a mano (fuera del WebView, en coordenadas de pantalla real)
    // toque el contenido del documento (en coordenadas lógicas de página).
    const availableScreenWidthPt = windowDimensions.width;
    const displayScale = availableScreenWidthPt / pageWidth;
    // Tope de zoom por pellizco (relectura, no para dibujar — ver el efecto que
    // alterna el rango de zoom según "mode" más abajo). 3x da margen de sobra
    // para leer cómodo sin tener que ir haciendo scroll horizontal.
    const ZOOM_MAX_SCALE = 3;
    // Alto (en puntos de pantalla) del SVG de dibujo EN PANTALLA — generoso y
    // fijo a propósito, nunca "100%" (mezclaría un alto porcentual con un
    // viewBox de alto fijo y deformaría la escala en Y de forma no uniforme).
    // El sobrante lo recorta gratis el overflow:hidden que ya tiene pageCard.
    const drawingSvgHeightPt = windowDimensions.height;
    // Ancho máximo de la cápsula de herramientas al desplegarse: todo el ancho
    // disponible dentro de bottomBarWrapper (que resta 16pt a cada lado de la
    // pantalla) menos el hueco del botón circular (56pt) y su separación (10pt).
    const toolbarCapsuleMaxWidth = windowDimensions.width - 32 - 56 - 10;

    // State
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const [initialHtml, setInitialHtml] = useState(''); // Only for initial load
    const [scriptTitle, setScriptTitle] = useState('');
    const htmlContentRef = useRef(''); // Ref for latest content

    const lastEditCheckpointRef = useRef<number>(0);
    // Índices (dentro de la lista plana de párrafos) donde repaginate() decidió
    // que empieza cada página nueva — se reutiliza tal cual al construir el PDF
    // en handleSharePdf, para que la paginación sea idéntica en pantalla y en el
    // PDF.
    const pageBreaksRef = useRef<number[]>([]);
    const pageBreaksResolveRef = useRef<((breaks: number[]) => void) | null>(null);
    // La barra inferior empieza colapsada en un único botón circular (ver
    // toolbarExpandAnim más abajo) — se despliega hacia la izquierda al
    // pulsarlo, para dejar el visor del texto más despejado por defecto.
    const [toolbarExpanded, setToolbarExpanded] = useState(false);
    const toolbarExpandAnim = useRef(new Animated.Value(0)).current;
    // Ancho real del contenido de cada fila de botones (medido, no el máximo
    // disponible en pantalla) — en horizontal, el ancho disponible es enorme y
    // los botones quedaban agrupados a la izquierda con un hueco vacío enorme
    // antes del botón circular; al abrir la cápsula solo hasta el ancho real
    // de sus botones (acotado por el máximo disponible, para que en pantallas
    // estrechas siga cupiendo/haciendo scroll si hiciera falta), queda ceñida
    // al contenido en vez de estirarse a lo tonto.
    const [viewRowWidth, setViewRowWidth] = useState(0);
    const [editRowWidth, setEditRowWidth] = useState(0);
    function toggleToolbarExpanded() {
        const next = !toolbarExpanded;
        setToolbarExpanded(next);
        if (!next) closeAllMenus();
        Animated.timing(toolbarExpandAnim, {
            toValue: next ? 1 : 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }

    // Drawing State
    const [paths, setPaths] = useState<PathData[]>([]);

    // Pila ÚNICA de deshacer/rehacer, compartida entre texto y dibujo — así
    // "Deshacer"/"Rehacer" funcionan sin importar en qué modo se pulsen (antes
    // cada modo tenía su propia pila y solo se podía deshacer si seguías en ese
    // mismo modo: si dibujabas y luego salías a Vista, Deshacer ya no hacía
    // nada). Cada acción guarda el estado ANTERIOR a ella; deshacer restaura
    // ese estado y empuja el actual a la pila de rehacer, y viceversa.
    type EditAction = { kind: 'text'; before: string } | { kind: 'draw'; before: PathData[] };
    const actionHistoryRef = useRef<EditAction[]>([]);
    const actionRedoRef = useRef<EditAction[]>([]);

    // Rich Text State
    const [textColor, setTextColor] = useState('#000000');
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);
    const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');

    // Dropdown Menu States
    const [showFormatMenu, setShowFormatMenu] = useState(false);
    const [showAlignMenu, setShowAlignMenu] = useState(false);
    const [showSizeMenu, setShowSizeMenu] = useState(false);
    // "data-line-type" del párrafo donde está el cursor ahora mismo (reportado
    // por el WebView en cada updateActiveLine) — para marcar con un tick cuál
    // preset de LINE_STYLES está aplicado en el menú de tamaño/formato.
    const [currentLineType, setCurrentLineType] = useState<string | null>(null);
    const [showColorMenu, setShowColorMenu] = useState(false);
    const [showHighlightMenu, setShowHighlightMenu] = useState(false);

    // ── Marcar personaje: sub-panel dentro del propio menú del marcador ────────
    // 'colors' = grid habitual de colores sueltos; 'characterList' = lista de
    // personajes del guion; 'userColorPicker' = paleta filtrada solo para "mi
    // personaje" (el resto se marcan directo con su color ya asignado).
    const [highlightPanel, setHighlightPanel] = useState<'colors' | 'characterList' | 'userColorPicker'>('colors');
    const [markIncludeDialogue, setMarkIncludeDialogue] = useState(true);
    const [scriptCharacters, setScriptCharacters] = useState<{ id: string; name: string; color: string; is_user_character: boolean }[]>([]);
    // Color elegido para "mi personaje" — por defecto el verde estándar de la
    // app, pero cada actor marca lo suyo con el color que prefiera; se recuerda
    // por guion en AsyncStorage.
    const [userMarkColor, setUserMarkColor] = useState<string>(GREEN_COLOR);

    const anyMenuOpen = showFormatMenu || showAlignMenu || showSizeMenu || showColorMenu || showHighlightMenu;
    function closeAllMenus() {
        setShowFormatMenu(false);
        setShowAlignMenu(false);
        setShowSizeMenu(false);
        setShowColorMenu(false);
        setShowHighlightMenu(false);
        setHighlightPanel('colors');
    }

    // Barra inferior flotante (mismo patrón que PlayerControlsCapsule en Grabaciones):
    // 2 filas superpuestas que se funden entre sí según el modo activo (Vista/
    // Texto — Dibujo ya no es un "modo" de esta barra, ahora es la superposición
    // aparte "Ver y marcar", ver showViewAndMark).
    const barAnim = useRef({
        view: new Animated.Value(1),
        edit: new Animated.Value(0),
    }).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(barAnim.view, { toValue: mode === 'view' ? 1 : 0, duration: 220, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(barAnim.edit, { toValue: mode === 'edit' ? 1 : 0, duration: 220, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]).start();
    }, [mode]);

    // Para que la barra flotante no quede tapada por el teclado al escribir
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardOffset(e.endCoordinates?.height || 0));
        const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOffset(0));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Scroll State for Drawing Sync
    const [scrollY, setScrollY] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);
    // Copia en ref: handleSharePdf necesita leer la altura MÁS RECIENTE justo
    // después de forzar una repaginación (window.__repaginateNow), y el estado
    // de React quedaría "congelado" con el valor de cuando se invocó la función
    // async, por mucho que se espere — un ref sí se lee siempre al día.
    const contentHeightRef = useRef(0);

    // Drawing Layer Image (PNG)
    const [drawingLayerImage, setDrawingLayerImage] = useState<string | null>(null);

    // Exportar a PDF: mientras se genera, se capturan brevemente (fuera de
    // pantalla) los trazos a mano a su altura COMPLETA — el texto no se
    // fotografía, se genera como HTML real (ver handleSharePdf).
    const [exportingPdf, setExportingPdf] = useState(false);
    const [showShareCapture, setShowShareCapture] = useState(false);
    const shareViewRef = useRef<View>(null);

    // "Ver y marcar": superposición aparte (no un modo más de la barra de 3
    // filas) con su propio WebView, donde el dibujo vive DENTRO del documento
    // (no en una capa nativa aparte) — así el trazo nunca se desalinea del
    // texto, a cualquier nivel de zoom. Sustituye por completo al antiguo modo
    // Dibujo.
    const [showViewAndMark, setShowViewAndMark] = useState(false);
    const [markupHtml, setMarkupHtml] = useState('');
    const [showExportSheet, setShowExportSheet] = useState(false);
    const [exportTotalPages, setExportTotalPages] = useState(1);

    // Refs
    const webViewRef = useRef<WebView>(null);

    // Load Script Data
    useEffect(() => {
        loadScript();
    }, [id]);

    async function loadScript() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('scripts')
                .select('content, annotations, title, parsed_text, script_raw, script_html, script_draw_layer')
                .eq('id', id)
                .single();

            if (error) throw error;

            setScriptTitle(data.title || '');

            // Priority:
            // 1. Reconstruir siempre desde escenas/líneas — es la fuente de verdad que
            //    comparten Revisar guion y Modo Estudio, así que cualquier cambio hecho ahí
            //    se ve reflejado aquí. El formato manual (negrita, resaltados, presets de
            //    línea) viaja POR LÍNEA junto a cada fila (content_html), no como un blob
            //    aparte — por eso no se pierde al reconstruir.
            // 2. script_html / content — solo como respaldo si el guion nunca llegó a
            //    estructurarse en escenas/líneas.
            // 3. Texto en bruto como último recurso.

            const reconstructed = await reconstructScriptFromData();

            if (reconstructed) {
                setInitialHtml(reconstructed);
                htmlContentRef.current = reconstructed;
            } else if (data.script_html || data.content) {
                const legacyHtml = data.script_html || data.content;
                setInitialHtml(legacyHtml);
                htmlContentRef.current = legacyHtml;
            } else if (data.script_raw || data.parsed_text) {
                const rawText = data.script_raw || data.parsed_text;
                const formattedHtml = parseScriptLocally(rawText, data.title);
                setInitialHtml(formattedHtml);
                htmlContentRef.current = formattedHtml;
            } else {
                setInitialHtml('<p>No se encontró contenido.</p>');
            }

            // Load drawing layer if exists
            if (data.script_draw_layer) {
                setDrawingLayerImage(data.script_draw_layer);
            }

            // Load saved paths (annotations) if they exist
            if (data.annotations) {
                try {
                    // Parse JSON if it's a string, otherwise use as-is
                    const parsedPaths = typeof data.annotations === 'string'
                        ? JSON.parse(data.annotations)
                        : data.annotations;
                    // Guiones guardados antes de "id" en PathData no lo traen — se
                    // sintetiza uno estable para esta sesión (no hace falta guardarlo
                    // de vuelta hasta que el usuario borre/edite algo y se guarde).
                    const pathsWithIds = (parsedPaths || []).map((p: any, i: number) => (
                        p && p.id ? p : { ...p, id: `legacy-${i}` }
                    ));
                    setPaths(pathsWithIds);
                } catch (e) {
                    console.error('Error parsing annotations:', e);
                    setPaths([]);
                }
            }
        } catch (error) {
            console.error('Error loading script:', error);
            Alert.alert('Error', 'No se pudo cargar el guion.');
        } finally {
            setLoading(false);
        }
    }

    function parseScriptLocally(text: string, title: string) {
        const rawLines = text.split(/\r?\n/);
        // El margen horizontal real lo pone #editor-root (ver webViewSource), no
        // este div — así el ancho de columna de texto es el MISMO tanto aquí como
        // al reconstruir desde scenes/lines y al generar el PDF paginado.
        let html = `<div style="text-align: center; font-family: 'Courier New', Courier, monospace;">`;

        // Title
        html += `<h1 style="font-weight: bold; text-transform: uppercase; text-decoration: underline; font-size: 15px; margin-bottom: 18px; color: #000000;">${title || 'GUION'}</h1>`;

        const SCENE_START_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR|I\/E)/i;
        // Regex to split "UPPERCASE HEADER" from "Mixed Case Content"
        // Captures: Group 1 (Header), Group 2 (Rest)
        // We look for a sequence of Uppercase/Symbols followed by a space and then a Lowercase (or symbol that starts mixed case).
        const SPLIT_REGEX = /^([A-ZÁÉÍÓÚÑ0-9 \-\.\/]+(?:\(.*\))?)\s+([^A-Z0-9].*)$/;

        const PARENTHETICAL_REGEX = /^\(.*\)$/;
        const TRANSITION_REGEX = /^(FADE IN:|FADE OUT|CUT TO:|DISSOLVE TO:|SMASH TO:|MATCH CUT:)/i;

        let previousType = 'none';

        // Pre-process lines to handle splits
        const lines: { type: string, text: string }[] = [];

        for (const rawLine of rawLines) {
            const line = rawLine.trim();
            if (!line) continue;

            // Check for Scene Heading Split
            if (SCENE_START_REGEX.test(line)) {
                const match = line.match(SPLIT_REGEX);
                if (match) {
                    // Split detected: "EXT. HOUSE - DAY Action..."
                    lines.push({ type: 'scene', text: match[1].trim() });
                    lines.push({ type: 'action', text: match[2].trim() });
                } else {
                    // No split (or all uppercase action?), treat as scene if short, or action if long?
                    // If it's a pure scene heading, it should be relatively short.
                    if (line.length < 100) {
                        lines.push({ type: 'scene', text: line });
                    } else {
                        // Too long, probably a glitched line. Treat as Action but maybe bold the start?
                        // For now, just treat as Action to avoid "Blue Wall".
                        lines.push({ type: 'action', text: line });
                    }
                }
            }
            // Check for Character Split
            else if (/^[A-ZÁÉÍÓÚÑ0-9 \-\.]{2,}/.test(line) && !PARENTHETICAL_REGEX.test(line) && !TRANSITION_REGEX.test(line)) {
                const match = line.match(SPLIT_REGEX);
                if (match) {
                    // Split detected: "ALEX Hello there."
                    lines.push({ type: 'character', text: match[1].trim() });
                    lines.push({ type: 'dialogue', text: match[2].trim() });
                } else {
                    // No split. Is it a character name?
                    // If it's all uppercase and short, yes.
                    if (line === line.toUpperCase() && line.length < 50) {
                        lines.push({ type: 'character', text: line });
                    } else {
                        // Mixed case or long -> Action or Dialogue
                        lines.push({ type: 'action', text: line });
                    }
                }
            }
            else {
                // Default
                if (PARENTHETICAL_REGEX.test(line)) {
                    lines.push({ type: 'parenthetical', text: line });
                } else if (TRANSITION_REGEX.test(line)) {
                    lines.push({ type: 'transition', text: line });
                } else {
                    lines.push({ type: 'action', text: line });
                }
            }
        }

        // Render Loop
        for (const item of lines) {
            if (item.type === 'scene') {
                html += `<p style="font-weight: bold; text-transform: uppercase; color: #0000FF; margin-top: 16px; margin-bottom: 8px; font-size: 12px;">${item.text}</p>`;
                previousType = 'scene';
            } else if (item.type === 'character') {
                const marginTop = (previousType === 'dialogue' || previousType === 'parenthetical' || previousType === 'action') ? '14px' : '10px';
                html += `<p style="font-weight: bold; text-transform: uppercase; margin-top: ${marginTop}; margin-bottom: 0px; color: #000000; font-size: 12px;">${item.text}</p>`;
                previousType = 'character';
            } else if (item.type === 'parenthetical') {
                html += `<p style="margin-top: 0px; margin-bottom: 0px; font-size: 12px;">${item.text}</p>`;
                previousType = 'parenthetical';
            } else if (item.type === 'dialogue') {
                html += `<p style="margin-top: 0px; margin-bottom: 8px; max-width: 70%; margin-left: auto; margin-right: auto; font-size: 12px;">${item.text}</p>`;
                previousType = 'dialogue';
            } else if (item.type === 'transition') {
                html += `<p style="font-weight: bold; text-transform: uppercase; margin-top: 14px; margin-bottom: 14px; text-align: right; font-size: 12px;">${item.text}</p>`;
                previousType = 'transition';
            } else {
                // Action
                // If previous was character, this might actually be dialogue that failed detection?
                // But we classified it as action.
                // If previous was Character, force it to be Dialogue?
                if (previousType === 'character') {
                    html += `<p style="margin-top: 0px; margin-bottom: 8px; max-width: 70%; margin-left: auto; margin-right: auto; font-size: 12px;">${item.text}</p>`;
                    previousType = 'dialogue';
                } else {
                    const marginTop = (previousType === 'scene') ? '0px' : '14px';
                    html += `<p style="margin-top: ${marginTop}; margin-bottom: 8px; text-align: center; font-size: 12px;">${item.text}</p>`;
                    previousType = 'action';
                }
            }
        }

        html += '</div>';
        return html;
    }

    async function reconstructScriptFromData(): Promise<string | null> {
        // Reconstruye el guion con formato profesional de guion cinematográfico,
        // usando SIEMPRE el texto plano actual de scenes/lines (para que Revisar
        // guion y Modo Estudio queden siempre reflejados aquí), y reaplicando el
        // formato manual guardado en content_html línea a línea, SOLO si su texto
        // no ha cambiado desde fuera del editor — si no, se usa la plantilla por
        // defecto de su tipo (negrita/mayúsculas/centrado para personaje, etc.).
        try {
            const { data: scriptData } = await supabase
                .from('scripts')
                .select('title')
                .eq('id', id)
                .single();

            const { data: scenes } = await supabase
                .from('scenes')
                .select('*, lines(*)')
                .eq('script_id', id)
                .order('order_index');

            if (!scenes || scenes.length === 0) {
                return null; // No hay escenas todavía, usar el respaldo
            }

            // El margen horizontal real lo pone #editor-root (ver webViewSource), no
            // este div — así el ancho de columna de texto es el MISMO en el WebView
            // visible, en el PDF paginado que genera "Compartir" y aquí.
            let html = `
            <div style="font-family: 'Courier New', Courier, monospace; line-height: 1.15;">
                <h1 data-title="1" style="text-align: center; font-weight: bold; text-transform: uppercase; text-decoration: underline; font-size: 15px; margin-bottom: 18px;">
                    ${scriptData?.title || 'GUION'}
                </h1>
            `;

            scenes.forEach((scene: any, sceneIndex: number) => {
                const heading = scene.heading || 'INT. LOCATION - DAY';
                const savedScene = unpackContentHtml(scene.content_html);
                const sceneUpToDate = savedScene && scene.content_html_source === heading;

                if (sceneUpToDate && savedScene) {
                    html += `<p data-scene-id="${scene.id}" data-line-type="scene" style="${savedScene.style}">${savedScene.html}</p>`;
                } else {
                    html += `
                    <p data-scene-id="${scene.id}" data-line-type="scene" style="text-align: left; font-weight: bold; text-transform: uppercase; margin-top: 16px; margin-bottom: 8px; font-size: 12px;">
                        ${sceneIndex + 1}. ${heading}
                    </p>
                    `;
                }

                const sortedLines = (scene.lines || []).slice().sort((a: any, b: any) => a.order_index - b.order_index);

                sortedLines.forEach((line: any) => {
                    // Una línea es de acción si no tiene personaje asignado, o lleva el
                    // nombre centinela "ACCIÓN" (no existe una columna is_action en BD).
                    const isAction = !line.character_name || line.character_name.toUpperCase() === 'ACCIÓN';

                    if (isAction) {
                        // Una línea de acción es un único párrafo: reutilizamos el "slot"
                        // de diálogo del JSON para guardar su formato.
                        const savedActionFormats = unpackLineContentHtml(line.content_html);
                        const savedActionSources = unpackLineContentHtmlSource(line.content_html_source);
                        const actionUpToDate = savedActionFormats.dialogue && savedActionSources.dialogue === line.content;

                        if (actionUpToDate) {
                            html += `<p data-line-id="${line.id}" data-line-type="action" style="${savedActionFormats.dialogue!.style}">${savedActionFormats.dialogue!.html}</p>`;
                        } else {
                            html += `
                            <p data-line-id="${line.id}" data-line-type="action" style="text-align: left; margin-top: 6px; margin-bottom: 8px; font-size: 12px;">
                                ${line.content}
                            </p>
                            `;
                        }
                    } else {
                        const charName = line.character_name.toUpperCase();
                        // El nombre de personaje y su diálogo comparten la misma fila de
                        // "lines" (mismo id). content_html/content_html_source llevan un
                        // JSON con AMBOS formatos por separado (uno por "character", otro
                        // por "dialogue"), cada uno validado contra su propio texto plano.
                        const savedLineFormats = unpackLineContentHtml(line.content_html);
                        const savedSources = unpackLineContentHtmlSource(line.content_html_source);
                        const charUpToDate = savedLineFormats.character && savedSources.character === line.character_name;
                        const dialogueUpToDate = savedLineFormats.dialogue && savedSources.dialogue === line.content;

                        if (charUpToDate) {
                            html += `<p data-line-id="${line.id}" data-line-type="character" style="${savedLineFormats.character!.style}">${savedLineFormats.character!.html}</p>`;
                        } else {
                            html += `
                            <p data-line-id="${line.id}" data-line-type="character" style="text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 10px; margin-bottom: 0px; font-size: 12px;">
                                ${charName}
                            </p>
                            `;
                        }

                        if (dialogueUpToDate) {
                            html += `<p data-line-id="${line.id}" data-line-type="dialogue" style="${savedLineFormats.dialogue!.style}">${savedLineFormats.dialogue!.html}</p>`;
                        } else {
                            html += `
                            <p data-line-id="${line.id}" data-line-type="dialogue" style="text-align: center; margin-top: 0px; margin-bottom: 8px; font-size: 12px; max-width: 70%; margin-left: auto; margin-right: auto;">
                                ${line.content}
                            </p>
                            `;
                        }
                    }
                });
            });

            html += '</div>';
            return html;

        } catch (error) {
            console.error('Error reconstructing script:', error);
            return null;
        }
    }

    // --- Actions ---

    // Arranque en frío: solo se usa si este guion todavía no tiene NINGUNA escena
    // (nunca llegó a estructurarse). Es el único caso en el que el guardado del
    // editor sigue llamando a la IA — a partir de ese guardado, ya hay escenas y
    // se usa siempre el camino determinista de handleSave().
    async function bootstrapScenesFromPlainText() {
        const plainText = htmlContentRef.current.replace(/<[^>]+>/g, '\n').trim();

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('No auth token');

        const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-pdf`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                scriptId: id,
                text: plainText,
                preserveFormatting: true,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to bootstrap script structure');
        }
    }

    async function handleSave() {
        if (saving) return;
        setSaving(true);

        try {
            const { data: sceneCheck } = await supabase.from('scenes').select('id').eq('script_id', id).limit(1);

            if (!sceneCheck || sceneCheck.length === 0) {
                // Guion nunca estructurado: arrancar con el flujo antiguo (única vez)
                await bootstrapScenesFromPlainText();
                await supabase.from('scripts').update({ annotations: paths, updated_at: new Date().toISOString() }).eq('id', id);
                Alert.alert('Guardado', 'Guion estructurado y guardado correctamente.');
                router.back();
                return;
            }

            // --- Reconciliación determinista (sin IA) ---
            const elements = splitTopLevelElements(htmlContentRef.current);

            const titleEl = elements.find(e => e.tag === 'h1');
            const titleText = titleEl ? stripHtmlTags(titleEl.innerHtml) : null;

            type ParsedLine = {
                id: string | null;
                characterName: string;
                content: string;
                styleAttr: string;
                innerHtml: string;
                characterStyleAttr: string;
                characterInnerHtml: string;
            };
            type ParsedScene = { id: string | null; heading: string; styleAttr: string; innerHtml: string; lines: ParsedLine[] };

            const parsedScenes: ParsedScene[] = [];
            let lastType: string | null = null;
            let pendingCharacterName: string | null = null;
            let pendingCharacterStyleAttr = '';
            let pendingCharacterInnerHtml = '';

            // Defensa contra ids duplicados en el documento (p.ej. si un pegado/corte
            // nativo del WebView clona el data-line-id de un párrafo sobre otro): un
            // mismo id solo puede convertirse en UNA fila de "lines"/"scenes" por
            // guardado. El nombre de personaje y su diálogo comparten el mismo id A
            // PROPÓSITO (misma fila), así que esto se controla al construir cada
            // ParsedScene/ParsedLine (más abajo), no aquí por simple repetición textual.
            const usedSceneRowIds = new Set<string>();
            const usedLineRowIds = new Set<string>();

            for (const el of elements) {
                if (el.tag === 'h1') continue; // el título se gestiona aparte

                const sceneId = getAttr(el.attrs, 'data-scene-id');
                const lineId = getAttr(el.attrs, 'data-line-id');
                const lineType = getAttr(el.attrs, 'data-line-type');
                const styleAttr = getAttr(el.attrs, 'style') || '';
                const plainText = stripHtmlTags(el.innerHtml);

                // Resolver el tipo: por lo que ya sabíamos de este párrafo (escena
                // existente o data-line-type ya presente, incluido el que haya puesto
                // un preset aplicado a mano) o, si es una línea nueva sin etiquetar,
                // heredando el tipo de la línea anterior (después de un personaje
                // siempre va su diálogo).
                let type: string;
                if (sceneId || lineType === 'scene') {
                    type = 'scene';
                } else if (lineType) {
                    type = lineType;
                } else if (lastType === 'character') {
                    type = 'dialogue';
                } else if (lastType) {
                    type = lastType;
                } else {
                    type = 'action';
                }

                if (type === 'scene') {
                    // Un mismo data-scene-id no puede reclamar dos párrafos de escena
                    // en el mismo guardado (ver nota de arriba) — la repetición se trata
                    // como una escena nueva en vez de sobrescribir la primera.
                    const dedupedSceneId = sceneId && !usedSceneRowIds.has(sceneId) ? sceneId : null;
                    if (dedupedSceneId) usedSceneRowIds.add(dedupedSceneId);
                    parsedScenes.push({
                        id: dedupedSceneId,
                        heading: plainText.replace(/^\d+\.\s*/, ''),
                        styleAttr,
                        innerHtml: el.innerHtml,
                        lines: [],
                    });
                    lastType = 'scene';
                    pendingCharacterName = null;
                    pendingCharacterStyleAttr = '';
                    pendingCharacterInnerHtml = '';
                    continue;
                }

                // Documento sin ninguna escena todavía (no debería pasar si llegamos
                // aquí, pero por seguridad creamos una implícita en vez de descartar texto)
                if (parsedScenes.length === 0) {
                    parsedScenes.push({ id: null, heading: 'INT. LOCATION - DAY', styleAttr: '', innerHtml: '', lines: [] });
                }
                const currentScene = parsedScenes[parsedScenes.length - 1];

                if (type === 'character') {
                    // Un párrafo de personaje VACÍO (residuo de ediciones manuales, p.ej.
                    // un Intro de más que se dejó a medio borrar) no debe crear una fila
                    // con el nombre de relleno "PERSONAJE" — se ignora sin más, sin tocar
                    // el nombre pendiente que ya hubiera.
                    if (plainText) {
                        pendingCharacterName = plainText.toUpperCase();
                        pendingCharacterStyleAttr = styleAttr;
                        pendingCharacterInnerHtml = el.innerHtml;
                    }
                    lastType = 'character';
                    continue; // se combina con el párrafo de diálogo que viene justo después
                }

                if (type === 'dialogue') {
                    // Un párrafo de diálogo vacío no se guarda (evita filas fantasma sin
                    // contenido, p.ej. el hueco que deja un Intro de más sin borrar del
                    // todo). El nombre de personaje pendiente se conserva para la
                    // siguiente línea real, no se descarta.
                    if (plainText) {
                        // El nombre de personaje y su diálogo comparten fila/id A PROPÓSITO
                        // (el mismo id ya se pudo "usar" en el párrafo de personaje sin que
                        // eso cuente como duplicado, porque el personaje no crea fila propia).
                        const dedupedLineId = lineId && !usedLineRowIds.has(lineId) ? lineId : null;
                        if (dedupedLineId) usedLineRowIds.add(dedupedLineId);
                        currentScene.lines.push({
                            id: dedupedLineId,
                            characterName: pendingCharacterName || 'PERSONAJE',
                            content: plainText,
                            styleAttr,
                            innerHtml: el.innerHtml,
                            characterStyleAttr: pendingCharacterStyleAttr,
                            characterInnerHtml: pendingCharacterInnerHtml,
                        });
                        pendingCharacterName = null;
                        pendingCharacterStyleAttr = '';
                        pendingCharacterInnerHtml = '';
                    }
                    lastType = 'dialogue';
                    continue;
                }

                // action (o cualquier tipo no reconocido, por seguridad) — igual que el
                // diálogo, una línea de acción vacía no se guarda.
                if (plainText) {
                    const dedupedLineId = lineId && !usedLineRowIds.has(lineId) ? lineId : null;
                    if (dedupedLineId) usedLineRowIds.add(dedupedLineId);
                    currentScene.lines.push({
                        id: dedupedLineId,
                        characterName: 'ACCIÓN',
                        content: plainText,
                        styleAttr,
                        innerHtml: el.innerHtml,
                        characterStyleAttr: '',
                        characterInnerHtml: '',
                    });
                }
                pendingCharacterName = null;
                pendingCharacterStyleAttr = '';
                pendingCharacterInnerHtml = '';
                lastType = 'action';
            }

            // Estado actual en BD, para saber qué escenas/líneas hay que borrar
            const { data: existingScenes } = await supabase
                .from('scenes')
                .select('id, lines(id)')
                .eq('script_id', id);

            const existingSceneIds = new Set((existingScenes || []).map((s: any) => s.id));
            const existingLineIds = new Set((existingScenes || []).flatMap((s: any) => (s.lines || []).map((l: any) => l.id)));
            const seenSceneIds = new Set<string>();
            const seenLineIds = new Set<string>();

            for (let i = 0; i < parsedScenes.length; i++) {
                const scene = parsedScenes[i];
                const sceneContentHtml = packContentHtml(scene.styleAttr, scene.innerHtml);
                let sceneId = scene.id;

                if (sceneId && existingSceneIds.has(sceneId)) {
                    seenSceneIds.add(sceneId);
                    await supabase.from('scenes').update({
                        heading: scene.heading,
                        order_index: i + 1,
                        content_html: sceneContentHtml,
                        content_html_source: scene.heading,
                    }).eq('id', sceneId);
                } else {
                    const { data: newScene, error } = await supabase.from('scenes').insert({
                        script_id: id,
                        scene_number: i + 1,
                        heading: scene.heading,
                        order_index: i + 1,
                        content: scene.heading,
                        content_html: sceneContentHtml,
                        content_html_source: scene.heading,
                    }).select().single();
                    if (error) throw error;
                    sceneId = newScene.id;
                    seenSceneIds.add(sceneId!);
                }

                for (let j = 0; j < scene.lines.length; j++) {
                    const line = scene.lines[j];
                    // El "slot" de personaje solo existe para líneas de diálogo (una
                    // acción no tiene párrafo de nombre delante).
                    const hasCharacterSlot = line.characterName !== 'ACCIÓN' && !!line.characterStyleAttr;
                    const lineContentHtml = packLineContentHtml(
                        { style: line.styleAttr, html: line.innerHtml },
                        hasCharacterSlot ? { style: line.characterStyleAttr, html: line.characterInnerHtml } : null
                    );
                    const lineContentHtmlSource = packLineContentHtmlSource(
                        line.content,
                        hasCharacterSlot ? line.characterName : null
                    );

                    if (line.id && existingLineIds.has(line.id)) {
                        seenLineIds.add(line.id);
                        await supabase.from('lines').update({
                            scene_id: sceneId,
                            character_name: line.characterName,
                            content: line.content,
                            order_index: j + 1,
                            content_html: lineContentHtml,
                            content_html_source: lineContentHtmlSource,
                        }).eq('id', line.id);
                    } else {
                        const { data: newLine, error } = await supabase.from('lines').insert({
                            scene_id: sceneId,
                            character_name: line.characterName,
                            content: line.content,
                            order_index: j + 1,
                            content_html: lineContentHtml,
                            content_html_source: lineContentHtmlSource,
                        }).select().single();
                        if (error) throw error;
                        seenLineIds.add(newLine.id);
                    }
                }
            }

            const linesToDelete = [...existingLineIds].filter(lid => !seenLineIds.has(lid));
            if (linesToDelete.length > 0) {
                await supabase.from('lines').delete().in('id', linesToDelete);
            }
            const scenesToDelete = [...existingSceneIds].filter(sid => !seenSceneIds.has(sid));
            if (scenesToDelete.length > 0) {
                await supabase.from('scenes').delete().in('id', scenesToDelete);
            }

            const scriptUpdates: Record<string, any> = { annotations: paths, updated_at: new Date().toISOString() };
            if (titleText) scriptUpdates.title = titleText;
            const { error: scriptError } = await supabase.from('scripts').update(scriptUpdates).eq('id', id);
            if (scriptError) throw scriptError;
            if (titleText) setScriptTitle(titleText);

            Alert.alert('Guardado', 'Guion actualizado correctamente.');
            router.back();

        } catch (error: any) {
            console.error('Error saving script:', error);
            Alert.alert('Error', 'No se pudo guardar el guion: ' + error.message);
        } finally {
            setSaving(false);
        }
    }

    // Botón "Atrás": si hay cambios sin guardar (texto, marcado o dibujo —
    // actionHistoryRef acumula los tres tipos en la misma pila), avisa antes
    // de salir en vez de descartarlos en silencio.
    const [showUnsavedBackDialog, setShowUnsavedBackDialog] = useState(false);
    function handleBackPress() {
        if (actionHistoryRef.current.length === 0) {
            router.back();
            return;
        }
        setShowUnsavedBackDialog(true);
    }

    // ── Marcar personaje: datos ─────────────────────────────────────────────────
    // Personajes del guion (nombre + color ya asignado) para la lista de "Marcar
    // personaje" del menú del marcador, y el color preferido guardado para "mi
    // personaje" (si el actor cambió el verde por defecto en este guion).
    useEffect(() => {
        if (!id) return;
        (async () => {
            const { data } = await supabase
                .from('characters')
                .select('id, name, color, is_user_character')
                .eq('script_id', id)
                .order('name');
            setScriptCharacters(data || []);
        })();
        AsyncStorage.getItem(`editorMarkColor_${id}`).then((saved) => {
            if (saved) setUserMarkColor(saved);
        });
    }, [id]);

    // Colores de otros personajes (no el mío) ya ocupados en este guion — el
    // verde queda siempre disponible para "mi personaje" porque nunca se le
    // asigna a nadie más (ver GREEN_COLOR).
    const otherCharacterColors = useMemo(() => {
        return new Set(scriptCharacters.filter((c) => !c.is_user_character).map((c) => c.color));
    }, [scriptCharacters]);

    const userMarkColorOptions = useMemo(() => {
        const all = [GREEN_COLOR, ...CHARACTER_COLORS.map((c) => c.value)];
        return all.filter((color, index) => all.indexOf(color) === index && (color === GREEN_COLOR || !otherCharacterColors.has(color)));
    }, [otherCharacterColors]);

    // Envuelve el nombre del personaje (y, si se pide, su diálogo) en un resaltado
    // — reutiliza el mismo mensaje "content" que ya integra el resto de ediciones
    // de texto con el deshacer/rehacer y el guardado (ver onMessage del WebView).
    function applyCharacterMark(characterName: string, color: string, includeDialogue: boolean) {
        const script = `
            (function() {
                var upperName = ${JSON.stringify(characterName.trim().toUpperCase())};
                var color = ${JSON.stringify(color)};
                var includeDialogue = ${includeDialogue ? 'true' : 'false'};
                function markParagraph(p) {
                    var existing = (p.childNodes.length === 1 && p.firstChild.nodeType === 1 && p.firstChild.getAttribute && p.firstChild.getAttribute('data-char-mark') === 'true') ? p.firstChild : null;
                    if (existing) {
                        existing.style.backgroundColor = color;
                    } else {
                        var span = document.createElement('span');
                        span.setAttribute('data-char-mark', 'true');
                        span.style.backgroundColor = color;
                        while (p.firstChild) { span.appendChild(p.firstChild); }
                        p.appendChild(span);
                    }
                }
                var paras = document.querySelectorAll('#editor-root p[data-line-type="character"]');
                for (var i = 0; i < paras.length; i++) {
                    var p = paras[i];
                    if (p.textContent.trim().toUpperCase() !== upperName) continue;
                    markParagraph(p);
                    if (includeDialogue) {
                        var next = p.nextElementSibling;
                        if (next && next.getAttribute('data-line-type') === 'dialogue') {
                            markParagraph(next);
                        }
                    }
                }
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'content', data: document.getElementById('editor-root').innerHTML }));
            })();
            true;
        `;
        webViewRef.current?.injectJavaScript(script);
    }

    function handleMarkCharacterPress(character: { id: string; name: string; color: string; is_user_character: boolean }) {
        if (character.is_user_character) {
            setHighlightPanel('userColorPicker');
            return;
        }
        applyCharacterMark(character.name, hexToRgba(character.color, 0.4), markIncludeDialogue);
        closeAllMenus();
    }

    const userCharacter = scriptCharacters.find((c) => c.is_user_character);

    async function handlePickUserMarkColor(color: string) {
        setUserMarkColor(color);
        if (id) await AsyncStorage.setItem(`editorMarkColor_${id}`, color);
        if (userCharacter) {
            applyCharacterMark(userCharacter.name, hexToRgba(color, 0.4), markIncludeDialogue);
        }
        closeAllMenus();
    }

    // Deshacer/rehacer del texto NO usa document.execCommand('undo'/'redo'): en
    // WebKit ese historial nativo no revierte de forma fiable los resaltados
    // aplicados vía hiliteColor/backColor (son comandos no estándar, con soporte
    // irregular — ver el comentario de applyHighlight más abajo), así que
    // "Deshacer" podía no hacer nada visible tras marcar una palabra. En su
    // lugar, se guarda una pila propia de snapshots del documento y deshacer
    // simplemente reemplaza el contenido por el snapshot anterior.
    function applyEditSnapshot(html: string) {
        htmlContentRef.current = html;
        webViewRef.current?.injectJavaScript(`
            (function() {
                var root = document.getElementById('editor-root');
                if (root) { root.innerHTML = ${JSON.stringify(html)}; }
            })();
            true;
        `);
    }

    // Deshacer/rehacer con una única pila compartida entre texto y dibujo: no
    // dependen del modo activo, así que funcionan aunque hayas salido del modo
    // donde hiciste el último cambio (p.ej. dibujar algo y luego pulsar el
    // lápiz para volver a Vista).
    function handleUndo() {
        const last = actionHistoryRef.current.pop();
        if (!last) return;
        if (last.kind === 'text') {
            actionRedoRef.current.push({ kind: 'text', before: htmlContentRef.current });
            applyEditSnapshot(last.before);
        } else {
            actionRedoRef.current.push({ kind: 'draw', before: paths });
            setPaths(last.before);
        }
    }

    function handleRedo() {
        const next = actionRedoRef.current.pop();
        if (!next) return;
        if (next.kind === 'text') {
            actionHistoryRef.current.push({ kind: 'text', before: htmlContentRef.current });
            applyEditSnapshot(next.before);
        } else {
            actionHistoryRef.current.push({ kind: 'draw', before: paths });
            setPaths(next.before);
        }
    }

    // Los botones de formato (Negrita/Cursiva/Subrayado/Tachado/Alinear/Color) viven
    // fuera del WebView; al tocarlos, el WebView puede perder el foco y
    // "window.getSelection()" queda vacía o desfasada en el momento en que se
    // ejecuta el script inyectado. Por eso, antes de cada execCommand, se restaura
    // primero el último Range que el propio WebView guardó (window.__activeRange,
    // actualizado en cada cambio de selección mientras tenía el foco) — así el
    // comando actúa siempre sobre lo que el usuario realmente seleccionó, nunca
    // sobre una selección más amplia o equivocada.
    function formatText(command: string, value: string | null = null) {
        const script = `
            (function() {
                if (window.__activeRange) {
                    var sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(window.__activeRange);
                }
                document.execCommand('${command}', false, ${value ? `'${value}'` : null});
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'content', data: document.getElementById('editor-root').innerHTML }));
            })();
            true;
        `;
        webViewRef.current?.injectJavaScript(script);
    }

    // Resalta el texto seleccionado con un color translúcido (no lo tapa, se lee debajo).
    // "hiliteColor" es el nombre histórico de Firefox/Gecko para esto; WebKit (Safari/iOS)
    // a veces solo responde a "backColor" con el mismo efecto, así que probamos el segundo
    // si el primero no está soportado en ese motor.
    function applyHighlight(color: string) {
        const script = `
            (function() {
                if (window.__activeRange) {
                    var sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(window.__activeRange);
                }
                var ok = document.execCommand('hiliteColor', false, '${color}');
                if (!ok) { document.execCommand('backColor', false, '${color}'); }
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'content', data: document.getElementById('editor-root').innerHTML }));
            })();
            true;
        `;
        webViewRef.current?.injectJavaScript(script);
        setShowHighlightMenu(false);
    }

    // Aplica un formato predefinido de guion (título / escena / acción / personaje / diálogo)
    // al párrafo donde está el cursor. A diferencia de formatText(), esto no usa
    // execCommand (no vale para "aplicar un conjunto de propiedades al bloque"): busca el
    // elemento de bloque más cercano y le reasigna sus estilos por completo.
    function applyLineStyle(preset: { key: string; style: Record<string, string> }) {
        const declarations = Object.entries(preset.style)
            .map(([prop, value]) => `node.style.${prop} = ${JSON.stringify(value)};`)
            .join(' ');
        // Al aplicar un preset a mano, ese es el tipo más fiable que tenemos de este
        // párrafo (más que cualquier data-scene-id/data-line-type que ya trajera) —
        // por eso lo marcamos aquí, y si deja de ser una escena, quitamos el
        // data-scene-id para que al guardar no se siga tratando como tal.
        const script = `
            (function() {
                var node = window.__activeLine;
                if (!node || !document.getElementById('editor-root').contains(node)) return true;
                node.removeAttribute('style');
                node.setAttribute('data-line-type', ${JSON.stringify(preset.key)});
                ${preset.key !== 'scene' ? "node.removeAttribute('data-scene-id');" : ''}
                ${declarations}
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'content', data: document.getElementById('editor-root').innerHTML }));
            })();
            true;
        `;
        webViewRef.current?.injectJavaScript(script);
        // Optimista: no hace falta esperar a que el WebView confirme por su cuenta
        // (solo lo hace en el siguiente click/selección dentro del documento) — ya
        // sabemos qué preset se acaba de aplicar, así el tick del menú se marca al
        // instante en vez de quedarse mostrando el anterior hasta el próximo toque.
        setCurrentLineType(preset.key);
        setShowSizeMenu(false);
    }

    // Memoize WebView source to prevent reload on re-render
    const webViewSource = useMemo(() => ({
        html: `
            <html>
            <head>
                <!-- Ancho lógico FIJO (595 = A4 real), reescalado a displayScale para
                     caber en la pantalla — como "ver sitio de escritorio" en un móvil.
                     El zoom por pellizco siempre está permitido aquí (Vista/Texto es
                     solo para leer/editar, nunca para dibujar — dibujar ahora vive en
                     la superposición aparte "Ver y marcar", con su propio WebView y su
                     propio rango de zoom). Sin una segunda etiqueta viewport duplicada
                     que pueda desincronizarse de esta. -->
                <meta name="viewport" content="width=${pageWidth}, initial-scale=${displayScale}, minimum-scale=${displayScale}, maximum-scale=${ZOOM_MAX_SCALE}, user-scalable=yes">
                <style>
                    body {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 12px;
                        line-height: 1.15;
                        padding-top: ${pageMarginTop}px;
                        padding-left: 0;
                        padding-right: 0;
                        /* Espacio extra abajo (margen de "página" + hueco para que la última
                           línea no quede tapada por la barra flotante de herramientas). El
                           "140" es un hueco de PANTALLA real (la barra mide eso en puntos
                           de pantalla); al vivir aquí dentro de unidades lógicas de página,
                           hay que dividirlo por displayScale para que siga despejando el
                           mismo hueco físico sea cual sea el factor de escala. */
                        padding-bottom: ${pageMarginBottom + (140 / displayScale)}px;
                        color: #000000;
                        background-color: #FFFFFF;
                        text-align: center; /* Default center alignment */
                    }
                    /* El margen horizontal de "página" vive aquí, no en el div interno que
                       genera reconstructScriptFromData/parseScriptLocally — así el ancho de
                       columna de texto es exactamente el mismo que usa el PDF paginado que
                       genera "Compartir" (buildPagesHtml reutiliza estas mismas cifras).
                       IMPORTANTE: es PADDING, no margin. Con margin, la propia caja de
                       "editor-root" (el elemento contenteditable) queda más ESTRECHA que la
                       página — WebKit dibuja entonces su contorno de foco/edición justo en
                       ese borde interior (las "líneas azules" al entrar en modo Texto), y
                       cualquier cosa insertada dentro (como el separador de salto de
                       página) queda encajonada en esa columna estrecha en vez de ocupar el
                       ancho completo de la hoja. Con padding, la caja de editor-root sigue
                       midiendo la página ENTERA (el contorno de WebKit coincide con el
                       borde real de la hoja) y el texto sigue insetado igual — solo hay que
                       "romper" ese padding explícitamente en .page-break-gap para que el
                       separador sí llegue de borde a borde. */
                    #editor-root {
                        padding-left: ${pageMarginLeft}px;
                        padding-right: ${pageMarginRight}px;
                        box-sizing: border-box;
                        width: 100%;
                    }
                    /* Sin este reset, un <p> sin margen superior propio hereda el margen
                       por defecto del navegador (~1em) además del margin-bottom de aquí abajo,
                       lo que hace que un simple Intro parezca un salto de línea doble. */
                    p { margin-top: 0; margin-bottom: 6px; }
                    /* Separador visual entre "hojas": el hueco mide EXACTAMENTE el margen
                       inferior de la hoja que termina + el margen superior de la siguiente
                       (ni un px más) — así el patrón "una página cada pageHeight px" es
                       exacto, sin lo cual el recorte del dibujo en el PDF (buildPagesHtml)
                       iría desalineándose página a página. NO se puede reducir esta altura
                       sin romper esa matemática — así que, en vez de teñir todo el hueco de
                       gris (se veía como un bloque grueso), se deja BLANCO —es margen real
                       de página, no "vacío raro"— y solo se marca con una línea fina el
                       punto exacto donde una hoja termina y empieza la siguiente, igual que
                       un visor de PDF real.
                       Los márgenes negativos "rompen" el padding de editor-root para que
                       este separador llegue de borde a borde de la hoja (ancho completo de
                       pantalla), en vez de quedar encajonado en la columna de texto. */
                    .page-break-gap {
                        display: block;
                        height: ${pageMarginBottom + pageMarginTop}px;
                        margin: 0 -${pageMarginRight}px 0 -${pageMarginLeft}px;
                        background-color: #FFFFFF;
                        background-image: linear-gradient(to bottom,
                            transparent calc(${pageMarginBottom}px - 1px),
                            rgba(0,0,0,0.18) calc(${pageMarginBottom}px - 1px),
                            rgba(0,0,0,0.18) calc(${pageMarginBottom}px + 1px),
                            transparent calc(${pageMarginBottom}px + 1px));
                        box-sizing: border-box;
                    }
                </style>
            </head>
            <body>
                <div id="editor-root" contenteditable="false">
                    ${initialHtml || 'Escribe tu guion aquí...'}
                </div>
                <script>
                    // El contenido editable vive en su PROPIO contenedor ("editor-root"),
                    // separado del <script> de aquí abajo. Si en vez de esto leyéramos
                    // document.body.innerHTML, esa lectura incluiría también el propio
                    // <script> como hermano (todo <script> es hijo literal de <body>) —
                    // y cualquier "<p>" que aparezca dentro de ESTE CÓDIGO (p.ej. en un
                    // comentario) se colaría en el guardado como si fuera un párrafo real
                    // del documento. Aislar el contenido en su propio div evita esto.
                    var root = document.getElementById('editor-root');
                    root.addEventListener('input', function() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'content',
                            data: root.innerHTML
                        }));
                    });

                    // Altura real del documento (para la capa de dibujo y para exportar a
                    // PDF, que necesitan saber cuánto mide TODO el guion, no solo lo que
                    // cabe en la pantalla). Se usa document.body.scrollHeight (no
                    // root.scrollHeight): el padding que da espacio arriba/abajo del
                    // texto está puesto en <body>, fuera de "editor-root", así que solo
                    // la altura de body representa el alto total real renderizado.
                    function reportHeight() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'height',
                            data: document.body.scrollHeight
                        }));
                    }
                    reportHeight();
                    root.addEventListener('input', reportHeight);
                    window.addEventListener('load', reportHeight);

                    // Paginación real: inserta/quita separadores visuales ("hojas") entre
                    // los párrafos de nivel superior, sin mover ni clonar ningún párrafo
                    // real (así nunca hay que preocuparse por perder data-line-id/
                    // data-line-type/estilo, ni por invalidar el cursor). El mismo cálculo
                    // (qué párrafos van en cada página) se reutiliza tal cual al generar el
                    // PDF en "Compartir", para que ambos coincidan siempre.
                    function repaginate() {
                        var container = root.firstElementChild || root;
                        if (!container) return;

                        // Si la selección actual quedara dentro de un separador que vamos a
                        // quitar, se perdería sin más — se guarda antes de mutar.
                        var sel = window.getSelection();
                        var savedRange = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : null;

                        var oldGaps = container.querySelectorAll('.page-break-gap');
                        for (var g = 0; g < oldGaps.length; g++) { oldGaps[g].remove(); }

                        var children = [];
                        for (var c = 0; c < container.children.length; c++) {
                            children.push(container.children[c]);
                        }

                        var breakBeforeIndices = [];
                        if (children.length > 0) {
                            // Todas las lecturas (getBoundingClientRect) antes que ninguna
                            // escritura, para no forzar reflows de más.
                            var containerTop = container.getBoundingClientRect().top;
                            var pageStart = 0;
                            for (var j = 0; j < children.length; j++) {
                                var rect = children[j].getBoundingClientRect();
                                var elBottom = rect.bottom - containerTop;
                                if (j > 0 && (elBottom - pageStart) > ${pageContentHeight}) {
                                    breakBeforeIndices.push(j);
                                    pageStart = rect.top - containerTop;
                                }
                            }
                            for (var k = breakBeforeIndices.length - 1; k >= 0; k--) {
                                var gapEl = document.createElement('div');
                                gapEl.className = 'page-break-gap';
                                container.insertBefore(gapEl, children[breakBeforeIndices[k]]);
                            }
                        }

                        if (sel && (sel.rangeCount === 0 || !document.contains(sel.anchorNode)) &&
                            savedRange && document.contains(savedRange.startContainer)) {
                            sel.removeAllRanges();
                            sel.addRange(savedRange);
                        }

                        // reportHeight() se envía ANTES que "pageBreaks" a propósito:
                        // handleSharePdf espera a "pageBreaks" para saber que ya puede
                        // capturar, y necesita que la altura (contentHeightRef) ya esté al
                        // día en ese preciso momento.
                        reportHeight();
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'pageBreaks',
                            data: breakBeforeIndices
                        }));
                    }

                    var repaginateTimer = null;
                    function scheduleRepaginate() {
                        if (repaginateTimer) clearTimeout(repaginateTimer);
                        repaginateTimer = setTimeout(repaginate, ${EDIT_CHECKPOINT_GAP_MS});
                    }
                    root.addEventListener('input', scheduleRepaginate);
                    window.addEventListener('load', repaginate);
                    // Flush síncrono (sin esperar el debounce) para cuando "Compartir"
                    // necesita la paginación más reciente antes de generar el PDF.
                    window.__repaginateNow = repaginate;

                    // Los botones de formato viven fuera del WebView (son componentes nativos),
                    // así que al tocarlos el WebView pierde el foco y "window.getSelection()"
                    // deja de ser fiable (a veces llega vacía, a veces desfasada). En vez de
                    // depender de la Selection API, recordamos directamente qué párrafo se
                    // tocó por última vez. No basta con escuchar "click": tras pulsar Intro
                    // el cursor salta a un párrafo nuevo sin que se dispare ningún click ahí,
                    // así que también recalculamos en cada tecla y en cada cambio de selección
                    // (usando la posición real del cursor, no el elemento tocado).
                    function updateActiveLine() {
                        var sel = window.getSelection();
                        if (!sel || sel.rangeCount === 0) return;
                        // Además del párrafo activo, guardamos una COPIA del Range exacto
                        // (no solo el nodo contenedor): los botones de Negrita/Cursiva/
                        // Subrayado/Alinear/Color siguen viviendo fuera del WebView y llaman
                        // a document.execCommand sobre "la selección actual" en el momento en
                        // que se inyecta el script — si para entonces el WebView ya perdió el
                        // foco, esa selección puede haber quedado vacía o distinta a la que
                        // el usuario realmente marcó. Restaurar este Range guardado justo
                        // antes de cada execCommand asegura que el comando actúa exactamente
                        // sobre lo que se seleccionó, nunca sobre "todo el bloque".
                        window.__activeRange = sel.getRangeAt(0).cloneRange();
                        var node = sel.getRangeAt(0).startContainer;
                        if (node.nodeType !== 1) { node = node.parentNode; }
                        while (node && node !== root && node.nodeName !== 'P' && node.nodeName !== 'H1' && node.nodeName !== 'H2' && node !== document.body) {
                            node = node.parentNode;
                        }
                        if (node && node !== root && node !== document.body) {
                            window.__activeLine = node;
                            // Para que el menú de estilos de párrafo pueda marcar con un
                            // tick cuál preset está aplicado al párrafo donde está el cursor.
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'lineType',
                                data: node.getAttribute('data-line-type') || null,
                            }));
                        }
                    }
                    root.addEventListener('click', updateActiveLine);
                    root.addEventListener('mouseup', updateActiveLine);
                    root.addEventListener('keyup', updateActiveLine);
                    root.addEventListener('input', updateActiveLine);
                    document.addEventListener('selectionchange', updateActiveLine);

                    // Send scroll position
                    window.addEventListener('scroll', function() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'scroll',
                            data: window.scrollY
                        }));
                    });

                    // Fix paste to always be plain text, y SIN heredar el resaltado/color
                    // del párrafo donde caiga el cursor (si se pega dentro o justo al lado
                    // de un span resaltado, "insertText" seguiría el "estilo de escritura"
                    // vigente ahí y el texto pegado saldría resaltado igual). Se envuelve el
                    // texto pegado en un span con fondo/color explícitamente neutros para
                    // cortar esa herencia.
                    document.addEventListener('paste', function(e) {
                        e.preventDefault();
                        var text = (e.originalEvent || e).clipboardData.getData('text/plain');
                        var escapeHtml = function(s) {
                            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        };
                        var neutralSpan = function(s) {
                            return '<span style="background-color: transparent; color: inherit;">' + escapeHtml(s) + '</span>';
                        };
                        var lines = text.split(/\\r?\\n/);
                        if (lines.length <= 1) {
                            // Una sola línea: se inserta inline, tal cual, sin crear un
                            // párrafo nuevo (p.ej. pegar una palabra en medio de una frase).
                            document.execCommand('insertHTML', false, neutralSpan(text));
                        } else {
                            // Varias líneas (p.ej. se cortó un bloque entero de nombre de
                            // personaje mas diálogo): cada línea debe quedar en su PROPIO
                            // párrafo, igual que el resto del documento; si se insertaran
                            // todas dentro de un único nodo separadas por saltos de línea,
                            // quedarían fusionadas para siempre en un solo bloque y
                            // compartirían el mismo tipo y formato aunque luego se intente
                            // reformatear solo una de ellas.
                            var openTag = String.fromCharCode(60) + 'p' + String.fromCharCode(62);
                            var closeTag = String.fromCharCode(60) + '/p' + String.fromCharCode(62);
                            var html = lines.map(function(line) {
                                return openTag + neutralSpan(line) + closeTag;
                            }).join('');
                            document.execCommand('insertHTML', false, html);
                        }
                    });

                    // Fix huge margin inheritance on Enter key.
                    // La nueva línea en blanco no debe llevar margen propio: si lo lleva, se
                    // SUMA (por colapso de márgenes) al margen superior de lo que venga
                    // después, y un solo Intro acaba pareciendo un salto de línea doble. El
                    // único espacio que debe añadir un Intro es el de esa propia línea vacía.
                    document.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            var beforeNode = window.__activeLine;
                            setTimeout(function() {
                                var selection = window.getSelection();
                                if (selection.rangeCount > 0) {
                                    var node = selection.focusNode;
                                    while (node && node !== root && node.nodeName !== 'P' && node !== document.body) {
                                        node = node.parentNode;
                                    }
                                    if (node && node !== root && node !== document.body) {
                                        // Tras un párrafo con preset (p.ej. "Nombre de personaje":
                                        // negrita + mayúsculas), a veces el navegador NO crea un
                                        // párrafo nuevo al pulsar Intro, sino que añade un salto de
                                        // línea dentro del MISMO párrafo — el nombre ya escrito y la
                                        // línea en blanco quedan compartiendo un solo nodo. Si en ese
                                        // caso reseteásemos el estilo de "node" (más abajo), se lo
                                        // quitaríamos también al nombre ya escrito. Por eso, si "node"
                                        // sigue siendo el mismo párrafo de antes de pulsar Intro, se
                                        // fuerza aquí un split real a un párrafo nuevo antes de tocar
                                        // ningún estilo.
                                        if (node === beforeNode) {
                                            var newP = document.createElement('p');
                                            var br = node.lastChild;
                                            while (br && br.nodeName !== 'BR') { br = br.previousSibling; }
                                            if (br) {
                                                var after = br.nextSibling;
                                                while (after) {
                                                    var toMove = after;
                                                    after = after.nextSibling;
                                                    newP.appendChild(toMove);
                                                }
                                                br.remove();
                                            }
                                            if (!newP.hasChildNodes()) {
                                                newP.appendChild(document.createElement('br'));
                                            }
                                            node.parentNode.insertBefore(newP, node.nextSibling);
                                            var range = document.createRange();
                                            range.selectNodeContents(newP);
                                            range.collapse(true);
                                            selection.removeAllRanges();
                                            selection.addRange(range);
                                            node = newP;
                                        }

                                        node.removeAttribute('data-line-type');
                                        node.removeAttribute('data-line-id');
                                        node.removeAttribute('data-scene-id');
                                        node.style.marginTop = '0px';
                                        node.style.marginBottom = '0px';
                                        node.style.fontWeight = 'normal';
                                        node.style.textTransform = 'none';
                                        node.style.textDecoration = 'none';
                                        node.style.maxWidth = '70%';
                                        node.style.marginLeft = 'auto';
                                        node.style.marginRight = 'auto';
                                        node.style.fontSize = '12px';

                                        // El párrafo que se acaba de partir (p.ej. un diálogo)
                                        // puede traer su propio margen inferior; si no lo
                                        // neutralizamos también, se suma al de la línea en blanco
                                        // y el hueco se duplica otra vez.
                                        var prev = node.previousElementSibling;
                                        if (prev) {
                                            prev.style.marginBottom = '0px';
                                        }

                                        window.__activeLine = node;
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'content',
                                            data: root.innerHTML
                                        }));
                                    }
                                }
                            }, 10);
                        }
                    });
                </script>
            </body>
            </html>
        `
    }), [initialHtml]);

    // Activar/desactivar la edición sin recargar el WebView. "webViewSource" ya
    // NO depende de "mode" (ver arriba) precisamente para esto: si contenteditable
    // viniera fijado en el HTML según el modo, cada cambio de modo generaría un
    // "source" nuevo y el WebView recargaría desde "initialHtml" (el último
    // guardado), perdiendo cualquier resaltado/negrita/cambio hecho desde
    // entonces que aún no se hubiera guardado. En su lugar, se alterna
    // contentEditable en vivo sobre el documento ya cargado. El rango de zoom
    // de este WebView ya no depende de "mode" (solo tiene Vista/Texto, los dos
    // siempre permiten pellizco) — ver "Ver y marcar" para el dibujo con zoom.
    useEffect(() => {
        webViewRef.current?.injectJavaScript(`
            (function() {
                var root = document.getElementById('editor-root');
                if (root) { root.contentEditable = ${mode === 'edit'}; }
            })();
            true;
        `);
    }, [mode]);

    // Capture View Ref
    const captureViewRef = useRef<View>(null);

    async function handleSaveAnnotations() {
        if (saving) return;
        setSaving(true);

        try {
            // Capture the full drawing layer.
            // useRenderInContext: el método por defecto en iOS (drawViewHierarchyInRect)
            // falla en vistas muy altas (guiones largos) con "drawViewHierarchyInRect was
            // not successful" — renderInContext sí soporta vistas grandes.
            const uri = await captureRef(captureViewRef, {
                format: 'png',
                quality: 0.8,
                result: 'base64', // Get base64 directly
                useRenderInContext: true,
            });

            const base64 = `data:image/png;base64,${uri}`;

            // Save to database - save both the image AND the paths data
            const { error: updateError } = await supabase
                .from('scripts')
                .update({
                    script_draw_layer: base64,
                    annotations: JSON.stringify(paths), // Save paths for editing
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id);

            if (updateError) throw updateError;

            setDrawingLayerImage(base64);
            // No se borran los trazos (paths) al guardar: se dejan editables.

            // Ya está persistido: limpiar la pila de deshacer/rehacer para que el
            // aviso de "cambios sin guardar" del botón Atrás no salte en falso al
            // volver a la pantalla principal del editor después de guardar aquí.
            actionHistoryRef.current = [];
            actionRedoRef.current = [];

            Alert.alert('Guardado', 'Anotaciones guardadas correctamente.');

        } catch (error: any) {
            console.error('Error saving annotations:', error);
            Alert.alert('Error', 'No se pudieron guardar las anotaciones: ' + error.message);
        } finally {
            setSaving(false);
        }
    }

    // HTML de solo lectura para la captura de "Compartir": mismo tipografía/
    // colores que el editor visible, pero sin contenteditable ni el <script> de
    // edición (aquí no hace falta nada de eso, solo se va a fotografiar).
    // Comparte el guion como PDF: el texto se genera como HTML real (negrita,
    // mayúsculas, resaltados y colores son estilos CSS de verdad, no una foto —
    // sale seleccionable y con buena resolución) y los trazos a mano se
    // superponen encima como una capa de imagen. No se intenta capturar el
    // WebView del editor: en iOS, react-native-view-shot no puede fotografiar
    // contenido de un WKWebView en absoluto (falla con "drawViewHierarchyInRect
    // was not successful"), pase lo que pase con su posición en pantalla — lo
    // comprobamos. La captura de los dibujos SÍ funciona porque es un SVG plano,
    // sin ningún WebView de por medio.
    // Construye el PDF como una secuencia de páginas reales, usando los MISMOS
    // cortes que decidió repaginate() en el WebView visible (pageBreaks: índices
    // de la lista plana de párrafos donde empieza cada página nueva) — así no
    // hay dos motores adivinando el ajuste de línea por separado, la causa de
    // los desajustes de los intentos anteriores.
    function buildPagesHtml(
        pageBreaks: number[],
        drawingImageBase64: string | null,
        pageRange?: { from: number; to: number }
    ): string {
        const elements = splitTopLevelElements(htmlContentRef.current);

        const pages: typeof elements[] = [];
        let current: typeof elements = [];
        let breakIdx = 0;
        elements.forEach((el, i) => {
            if (breakIdx < pageBreaks.length && pageBreaks[breakIdx] === i) {
                pages.push(current);
                current = [];
                breakIdx++;
            }
            current.push(el);
        });
        pages.push(current);

        // Rango de páginas a exportar (1-indexado, ambos límites incluidos). Se
        // filtran los índices en vez de recortar el array, para poder seguir
        // usando el índice de página ORIGINAL (pageIndex) en el recorte del
        // dibujo más abajo — si se usara la posición dentro del subconjunto
        // recortado, el "sprite" de cada página apuntaría a un trozo equivocado
        // de la imagen de trazos.
        const from = pageRange ? Math.max(1, pageRange.from) : 1;
        const to = pageRange ? Math.min(pages.length, pageRange.to) : pages.length;
        const selectedIndices: number[] = [];
        for (let i = from - 1; i < to; i++) selectedIndices.push(i);

        const pagesHtml = selectedIndices.map((pageIndex, selectionPos) => {
            const pageElements = pages[pageIndex];
            const innerHtml = pageElements.map((el) => `<${el.tag}${el.attrs}>${el.innerHtml}</${el.tag}>`).join('');
            const isLast = selectionPos === selectedIndices.length - 1;
            // Recorte tipo "sprite" en CSS: la MISMA imagen completa de los trazos
            // se reutiliza en cada página, desplazada hacia arriba una página
            // entera por cada página anterior (índice ORIGINAL, no el de este
            // subconjunto), y recortada a la ventana de esta página — sin
            // librería de recorte de imágenes ni dependencia nueva.
            const drawingCrop = drawingImageBase64
                ? `<div style="position:absolute; top:0; left:0; width:100%; height:${pageHeight}px; overflow:hidden; pointer-events:none;">
                       <img src="data:image/png;base64,${drawingImageBase64}" style="position:absolute; top:${-pageIndex * pageHeight}px; left:0; width:100%; display:block;" />
                   </div>`
                : '';
            return `
                <div class="page" style="position:relative; width:${pageWidth}px; height:${pageHeight}px;${isLast ? '' : ' page-break-after: always;'}">
                    <div class="editor-root" style="box-sizing:border-box; width:100%; height:100%; padding:${pageMarginTop}px ${pageMarginRight}px ${pageMarginBottom}px ${pageMarginLeft}px;">
                        ${innerHtml}
                    </div>
                    ${drawingCrop}
                </div>
            `;
        }).join('');

        return `
            <html>
            <head>
                <meta name="viewport" content="width=${pageWidth}">
                <style>
                    body { margin: 0; padding: 0; }
                    .editor-root {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 12px;
                        line-height: 1.15;
                        color: #000000;
                        background-color: #FFFFFF;
                        text-align: center;
                    }
                    p { margin-top: 0; margin-bottom: 6px; }
                </style>
            </head>
            <body>
                ${pagesHtml}
            </body>
            </html>
        `;
    }

    // Construye el HTML de "Ver y marcar": mismas páginas rígidas que
    // buildPagesHtml (sin holgura entre ellas — 1 unidad = 1 punto lógico en
    // TODO el documento apilado), pero sin incrustar una imagen de dibujo: los
    // trazos van como <path> vectoriales de verdad, dentro de un <svg> que
    // cubre el documento entero, para poder seguir dibujando/borrando sobre
    // ellos. Sin ningún viewBox de compensación — al vivir dentro de este mismo
    // WebView (que hace zoom nativamente), las coordenadas de un toque ya
    // llegan en el mismo espacio lógico que el texto.
    function buildMarkupHtml(pageBreaks: number[], pathsForHtml: PathData[]): string {
        const elements = splitTopLevelElements(htmlContentRef.current);
        const pages: typeof elements[] = [];
        let current: typeof elements = [];
        let breakIdx = 0;
        elements.forEach((el, i) => {
            if (breakIdx < pageBreaks.length && pageBreaks[breakIdx] === i) {
                pages.push(current);
                current = [];
                breakIdx++;
            }
            current.push(el);
        });
        pages.push(current);

        const totalHeight = pages.length * pageHeight;

        const pagesHtml = pages.map((pageElements) => {
            const innerHtml = pageElements.map((el) => `<${el.tag}${el.attrs}>${el.innerHtml}</${el.tag}>`).join('');
            return `
                <div class="page" style="position:relative; width:${pageWidth}px; height:${pageHeight}px;">
                    <div class="editor-root" style="box-sizing:border-box; width:100%; height:100%; padding:${pageMarginTop}px ${pageMarginRight}px ${pageMarginBottom}px ${pageMarginLeft}px;">
                        ${innerHtml}
                    </div>
                </div>
            `;
        }).join('');

        const pathsSvg = pathsForHtml.map((p) => (
            `<path data-path-id="${p.id}" d="${p.d}" stroke="${p.color}" stroke-width="${p.width}" stroke-opacity="${p.opacity ?? 1}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`
        )).join('');

        return `
            <html>
            <head>
                <meta name="viewport" content="width=${pageWidth}, initial-scale=${displayScale}, minimum-scale=${displayScale}, maximum-scale=${ZOOM_MAX_SCALE}, user-scalable=yes">
                <style>
                    html, body { margin:0; padding:0; background:#FFFFFF; }
                    .pages { position: relative; width: ${pageWidth}px; }
                    .page {
                        background: #FFFFFF;
                        /* Línea fina marcando el fin de cada hoja, sin añadir altura a la
                           caja (mismo truco que .page-break-gap del Editor) — así las
                           páginas quedan perfectamente pegadas, condición necesaria para
                           que 1 punto lógico = 1 punto en TODO el documento apilado. */
                        box-shadow: inset 0 -1px 0 rgba(0,0,0,0.15);
                        box-sizing: border-box;
                    }
                    .editor-root {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 12px;
                        line-height: 1.15;
                        color: #000000;
                        text-align: center;
                    }
                    p { margin-top: 0; margin-bottom: 6px; }
                    #ink-overlay { position: absolute; top: 0; left: 0; }
                </style>
            </head>
            <body>
                <div class="pages" id="pages-container">
                    ${pagesHtml}
                    <svg id="ink-overlay" width="${pageWidth}" height="${totalHeight}" viewBox="0 0 ${pageWidth} ${totalHeight}">
                        ${pathsSvg}
                    </svg>
                </div>
                <script>
                    (function() {
                        var svg = document.getElementById('ink-overlay');
                        var svgNS = 'http://www.w3.org/2000/svg';
                        var activeStroke = null; // { points: [{x,y}], el: <path> }
                        window.__activeTool = window.__activeTool || 'pan'; // 'pen' | 'erase' | 'pan'
                        window.__brushType = window.__brushType || 'pencil';

                        // Ancho/opacidad propios de cada tipo de pincel — sin control manual
                        // de grosor (de momento): cada pincel ya trae su aspecto característico.
                        var BRUSH_PARAMS = {
                            pencil:     { width: 2,  opacity: 0.85 },
                            fountain:   { width: 2.5, opacity: 1 },
                            ballpoint:  { width: 3,  opacity: 1 },
                            marker:     { width: 7,  opacity: 0.85 },
                            watercolor: { width: 14, opacity: 0.35 },
                            ruler:      { width: 3,  opacity: 1 },
                        };
                        function brushParams() {
                            return BRUSH_PARAMS[window.__brushType] || BRUSH_PARAMS.pencil;
                        }

                        // Deshacer/rehacer cambia "paths" del lado de React Native, no aquí
                        // dentro del WebView (los trazos nuevos/borrados sí se reflejan al
                        // instante porque el propio script los añade/quita del DOM) — RN
                        // llama a esto para volver a pintar el SVG entero tras un deshacer/
                        // rehacer, para que ambos lados no se desincronicen.
                        window.__setAllPaths = function(pathsJson) {
                            var list = JSON.parse(pathsJson);
                            while (svg.firstChild) { svg.removeChild(svg.firstChild); }
                            list.forEach(function(p) {
                                var el = document.createElementNS(svgNS, 'path');
                                el.setAttribute('data-path-id', p.id);
                                el.setAttribute('d', p.d);
                                el.setAttribute('stroke', p.color);
                                el.setAttribute('stroke-width', String(p.width));
                                el.setAttribute('stroke-opacity', String(p.opacity != null ? p.opacity : 1));
                                el.setAttribute('fill', 'none');
                                el.setAttribute('stroke-linecap', 'round');
                                el.setAttribute('stroke-linejoin', 'round');
                                svg.appendChild(el);
                            });
                        };

                        function svgPoint(touch) {
                            // pageX/pageY ya están en coordenadas de DOCUMENTO (px de layout),
                            // independientes del nivel de zoom actual — es justo lo que hace
                            // que el trazo nunca se desalinee del texto bajo cualquier zoom.
                            return { x: touch.pageX, y: touch.pageY };
                        }

                        function pointsToPath(points) {
                            return points.map(function(p, i) {
                                return (i === 0 ? 'M ' : 'L ') + p.x + ' ' + p.y;
                            }).join(' ');
                        }

                        function startStroke(point) {
                            var brush = brushParams();
                            activeStroke = {
                                points: [point],
                                startPoint: point, // para la regla: la recta va SIEMPRE de aquí al punto actual
                                width: brush.width,
                                opacity: brush.opacity,
                                el: document.createElementNS(svgNS, 'path'),
                            };
                            activeStroke.el.setAttribute('stroke', window.__strokeColor || '#FF0000');
                            activeStroke.el.setAttribute('stroke-width', String(brush.width));
                            activeStroke.el.setAttribute('stroke-opacity', String(brush.opacity));
                            activeStroke.el.setAttribute('fill', 'none');
                            activeStroke.el.setAttribute('stroke-linecap', 'round');
                            activeStroke.el.setAttribute('stroke-linejoin', 'round');
                            activeStroke.el.setAttribute('d', pointsToPath(activeStroke.points));
                            svg.appendChild(activeStroke.el);
                        }

                        function abortStroke() {
                            if (activeStroke) {
                                svg.removeChild(activeStroke.el);
                                activeStroke = null;
                            }
                        }

                        function commitStroke() {
                            if (!activeStroke) return;
                            if (activeStroke.points.length < 2) { abortStroke(); return; }
                            var id = 'p' + Date.now() + '-' + Math.random().toString(36).slice(2);
                            activeStroke.el.setAttribute('data-path-id', id);
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'newPath',
                                id: id,
                                d: pointsToPath(activeStroke.points),
                                color: window.__strokeColor || '#FF0000',
                                width: activeStroke.width,
                                opacity: activeStroke.opacity
                            }));
                            activeStroke = null;
                        }

                        // Distancia mínima al SEGMENTO (no solo a los vértices): con un
                        // trazo a mano alzada, denso en puntos, mirar solo los vértices ya
                        // daba una distancia razonable — pero una línea de la regla son solo
                        // 2 puntos, y con eso solo se podía borrar tocando cerca de sus dos
                        // extremos, nunca por el medio.
                        function distanceToSegment(point, ax, ay, bx, by) {
                            var dx = bx - ax, dy = by - ay;
                            var lenSq = dx * dx + dy * dy;
                            var t = lenSq > 0 ? ((point.x - ax) * dx + (point.y - ay) * dy) / lenSq : 0;
                            t = Math.max(0, Math.min(1, t));
                            var px = ax + t * dx, py = ay + t * dy;
                            return Math.sqrt(Math.pow(px - point.x, 2) + Math.pow(py - point.y, 2));
                        }

                        function distanceToPolyline(point, d) {
                            var coords = d.match(/-?\\d+(\\.\\d+)?/g);
                            if (!coords || coords.length < 2) return Infinity;
                            var min = Infinity;
                            var prevX = null, prevY = null;
                            for (var i = 0; i + 1 < coords.length; i += 2) {
                                var px = parseFloat(coords[i]), py = parseFloat(coords[i + 1]);
                                if (prevX !== null) {
                                    var dist = distanceToSegment(point, prevX, prevY, px, py);
                                    if (dist < min) min = dist;
                                }
                                prevX = px; prevY = py;
                            }
                            return min;
                        }

                        function eraseNear(point) {
                            var candidates = svg.querySelectorAll('path[data-path-id]');
                            for (var i = 0; i < candidates.length; i++) {
                                var el = candidates[i];
                                var w = parseFloat(el.getAttribute('stroke-width')) || 2;
                                if (distanceToPolyline(point, el.getAttribute('d')) < (w + 10)) {
                                    var id = el.getAttribute('data-path-id');
                                    el.remove();
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'erasePath', id: id }));
                                    return;
                                }
                            }
                        }

                        // No se usa touch-action:none aquí — se evaluaría una sola vez al
                        // primer toque y bloquearía también el pellizco nativo aunque
                        // llegara un 2º dedo después. Toda la decisión de "quién se queda
                        // con el gesto" se hace a mano con preventDefault() selectivo.
                        document.addEventListener('touchstart', function(e) {
                            if (window.__activeTool === 'pan') return;
                            if (e.touches.length !== 1) { abortStroke(); return; }
                            var point = svgPoint(e.touches[0]);
                            if (window.__activeTool === 'erase') {
                                eraseNear(point);
                            } else {
                                startStroke(point);
                            }
                        }, { passive: false });

                        document.addEventListener('touchmove', function(e) {
                            if (window.__activeTool === 'pan') return;
                            if (e.touches.length !== 1) { abortStroke(); return; }
                            var point = svgPoint(e.touches[0]);
                            if (window.__activeTool === 'erase') {
                                e.preventDefault();
                                eraseNear(point);
                            } else if (activeStroke) {
                                // Desde el PRIMER touchmove de la secuencia: si se espera más,
                                // iOS ya habrá cedido el gesto al scroll nativo y preventDefault
                                // deja de tener efecto para el resto de esta secuencia.
                                e.preventDefault();
                                if (window.__brushType === 'ruler') {
                                    // Regla: la línea va siempre del punto inicial al dedo ahora
                                    // mismo (2 puntos, se sustituye en cada movimiento en vez de
                                    // acumular) — da una recta en vivo, no un trazo a mano alzada.
                                    activeStroke.points = [activeStroke.startPoint, point];
                                } else {
                                    activeStroke.points.push(point);
                                }
                                activeStroke.el.setAttribute('d', pointsToPath(activeStroke.points));
                            }
                        }, { passive: false });

                        document.addEventListener('touchend', function() {
                            if (window.__activeTool === 'pen') commitStroke();
                        }, { passive: false });
                        document.addEventListener('touchcancel', function() {
                            abortStroke();
                        }, { passive: false });
                    })();
                </script>
            </body>
            </html>
        `;
    }

    async function handleExport(options: {
        format: 'pdf' | 'image';
        fileName: string;
        pageFrom: number;
        pageTo: number;
        includeAnnotations: boolean;
    }) {
        if (exportingPdf) return;
        setExportingPdf(true);

        try {
            const canShare = await Sharing.isAvailableAsync();
            if (!canShare) {
                Alert.alert('Error', 'No se puede compartir en este dispositivo.');
                return;
            }

            // Fuerza una paginación fresca (sin esperar el debounce) antes de
            // capturar nada: si el usuario acaba de escribir, la paginación
            // guardada en pageBreaksRef podría estar desactualizada, y exportar
            // con cortes viejos reintroduciría el mismo desajuste que se quiere
            // eliminar.
            const freshPageBreaks = await new Promise<number[]>((resolve) => {
                pageBreaksResolveRef.current = resolve;
                webViewRef.current?.injectJavaScript('window.__repaginateNow && window.__repaginateNow(); true;');
                setTimeout(() => resolve(pageBreaksRef.current), 2000);
            });

            const safeName = (options.fileName || scriptTitle || 'Guion').replace(/[\\/:*?"<>|]/g, '').trim() || 'Guion';

            let drawingImageBase64: string | null = null;
            if (options.includeAnnotations && paths.length > 0) {
                // Monta (fuera de pantalla) los trazos a mano a la altura COMPLETA
                // del documento YA paginado, para capturarlos todos de una vez — es
                // un SVG plano, sin WebView, así que sí puede capturarse fuera de
                // pantalla sin problema (a diferencia de intentar fotografiar el
                // WebView del texto).
                setShowShareCapture(true);
                await new Promise((resolve) => setTimeout(resolve, 150));
                drawingImageBase64 = await captureRef(shareViewRef, {
                    format: 'png',
                    quality: 1,
                    result: 'base64',
                    useRenderInContext: true,
                });
                setShowShareCapture(false);
            }

            if (options.format === 'image') {
                // No es viable capturar una página con texto como imagen: en iOS,
                // react-native-view-shot no puede fotografiar contenido de un
                // WKWebView en absoluto (el mismo motivo por el que el PDF se genera
                // como HTML real en vez de una captura) — así que "Imagen" exporta
                // SOLO las anotaciones a mano (fondo transparente), que sí se pueden
                // capturar al ser un SVG plano.
                if (!drawingImageBase64) {
                    Alert.alert('Nada que exportar', 'No hay anotaciones a mano en este guion.');
                    return;
                }
                const imageUri = `${FileSystem.cacheDirectory}${safeName}-anotaciones.png`;
                const existingImg = await FileSystem.getInfoAsync(imageUri);
                if (existingImg.exists) {
                    await FileSystem.deleteAsync(imageUri, { idempotent: true });
                }
                await FileSystem.writeAsStringAsync(
                    imageUri,
                    drawingImageBase64,
                    { encoding: 'base64' }
                );
                await Sharing.shareAsync(imageUri, {
                    UTI: 'public.png',
                    mimeType: 'image/png',
                    dialogTitle: 'Compartir anotaciones',
                });
                return;
            }

            const pageHtml = buildPagesHtml(freshPageBreaks, drawingImageBase64, { from: options.pageFrom, to: options.pageTo });

            const { uri: rawPdfUri } = await Print.printToFileAsync({
                html: pageHtml,
                width: pageWidth,
                height: pageHeight,
                margins: { top: 0, right: 0, bottom: 0, left: 0 },
            });

            // printToFileAsync guarda el PDF con un nombre interno (tipo UUID de
            // Supabase/caché), no con el nombre elegido — se copia con el nombre
            // correcto antes de compartirlo para que sea ese el que vea el usuario.
            const pdfUri = `${FileSystem.cacheDirectory}${safeName}.pdf`;
            // Si ya se compartió este mismo guion antes en esta sesión, el archivo
            // puede seguir en caché con ese nombre — copyAsync falla si el destino
            // ya existe.
            const existing = await FileSystem.getInfoAsync(pdfUri);
            if (existing.exists) {
                await FileSystem.deleteAsync(pdfUri, { idempotent: true });
            }
            await FileSystem.copyAsync({ from: rawPdfUri, to: pdfUri });

            await Sharing.shareAsync(pdfUri, {
                UTI: 'com.adobe.pdf',
                mimeType: 'application/pdf',
                dialogTitle: 'Compartir guion en PDF',
            });

        } catch (error: any) {
            console.error('Error exporting:', error);
            Alert.alert('Error', 'No se pudo exportar: ' + error.message);
        } finally {
            setShowShareCapture(false);
            setExportingPdf(false);
        }
    }

    // Abre "Ver y marcar": fuerza una repaginación fresca (igual que antes de
    // exportar) y construye el HTML con los trazos actuales ya incrustados.
    async function handleOpenViewAndMark() {
        const freshPageBreaks = await new Promise<number[]>((resolve) => {
            pageBreaksResolveRef.current = resolve;
            webViewRef.current?.injectJavaScript('window.__repaginateNow && window.__repaginateNow(); true;');
            setTimeout(() => resolve(pageBreaksRef.current), 2000);
        });
        setMarkupHtml(buildMarkupHtml(freshPageBreaks, paths));
        setShowViewAndMark(true);
    }

    function handleNewPathFromMarkup(path: PathData) {
        actionHistoryRef.current.push({ kind: 'draw', before: paths });
        actionRedoRef.current = [];
        setPaths((prev) => [...prev, path]);
    }

    function handleErasePathFromMarkup(id: string) {
        actionHistoryRef.current.push({ kind: 'draw', before: paths });
        actionRedoRef.current = [];
        setPaths((prev) => prev.filter((p) => p.id !== id));
    }

    // Abre la hoja de exportar: repagina en fresco (mismo motivo que antes de
    // compartir/marcar) para que "total de páginas" y el recorte por rango
    // usen cortes actualizados, no los que hubiera de la última edición.
    async function handleOpenExportSheet() {
        const freshPageBreaks = await new Promise<number[]>((resolve) => {
            pageBreaksResolveRef.current = resolve;
            webViewRef.current?.injectJavaScript('window.__repaginateNow && window.__repaginateNow(); true;');
            setTimeout(() => resolve(pageBreaksRef.current), 2000);
        });
        setExportTotalPages(freshPageBreaks.length + 1);
        setShowExportSheet(true);
    }

    return (
        <ImageBackground source={editorBg()} resizeMode="cover" style={styles.container}>
        <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
            {/* Off-screen Capture View for Full Document PNG */}
            <View
                ref={captureViewRef}
                collapsable={false}
                style={{
                    position: 'absolute',
                    left: -10000, // Move off-screen
                    top: 0,
                    // Ancho LÓGICO de página (no de pantalla): los trazos se guardan en
                    // ese sistema de coordenadas, así que esta vista invisible debe medir
                    // exactamente eso para que el PNG resultante no salga comprimido/
                    // recortado respecto al ancho real de los trazos.
                    width: pageWidth,
                    height: contentHeight || 1000, // Full document height (lógico)
                    backgroundColor: 'transparent',
                }}
            >
                <Svg height="100%" width="100%">
                    {/* Render current paths only (no old image layer needed) */}
                    {/* Render current paths (without scroll translation as this is full height) */}
                    {paths.map((p) => (
                        <Path
                            key={p.id}
                            d={p.d}
                            stroke={p.color}
                            strokeWidth={p.width}
                            strokeOpacity={p.opacity ?? 1}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ))}
                </Svg>
            </View>

            {/* Captura oculta de los trazos a mano (solo SVG, sin WebView) para
                "Compartir en PDF" — a la altura completa del documento, con el
                mismo ancho que la tarjeta visible para que coincida con el texto
                real que genera handleSharePdf. Al ser un SVG plano sí puede vivir
                fuera de pantalla sin problema (el texto, en cambio, ya no se
                fotografía: se genera como HTML real — ver buildTextPageHtml). */}
            {showShareCapture && (
                <View
                    ref={shareViewRef}
                    collapsable={false}
                    style={{
                        position: 'absolute',
                        left: -10000,
                        top: 0,
                        width: pageWidth,
                        // contentHeightRef (no el estado contentHeight): handleSharePdf
                        // fuerza una repaginación justo antes de mostrar esta captura, y
                        // el ref sí refleja ese valor al instante; el estado de React
                        // podría no haberse aplicado todavía en este render.
                        height: contentHeightRef.current || 1000,
                        backgroundColor: 'transparent',
                    }}
                >
                    <Svg height="100%" width="100%">
                        {paths.map((p) => (
                            <Path
                                key={p.id}
                                d={p.d}
                                stroke={p.color}
                                strokeWidth={p.width}
                                strokeOpacity={p.opacity ?? 1}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        ))}
                    </Svg>
                </View>
            )}
            <Stack.Screen options={{ headerShown: false }} />

            {/* Main Header */}
            <View style={[styles.header, { borderBottomColor: cardBorder }]}>
                <TouchableOpacity onPress={handleBackPress} style={[styles.backButton, glassHeaderBtn]}>
                    <ArrowLeft size={20} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.headerCenter} pointerEvents="none">
                    <Text style={styles.headerTitle} numberOfLines={1}>Editar guion</Text>
                </View>

                <TouchableOpacity onPress={handleSave} style={[styles.saveButton, primaryButtonBg]} disabled={saving}>
                    {saving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <>
                            <Save size={18} color="#FFFFFF" />
                            <Text style={styles.saveText}>Guardar</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            {/* Overlay to close menus when tapping outside them */}
            {anyMenuOpen && (
                <TouchableOpacity
                    style={styles.menuOverlay}
                    activeOpacity={1}
                    onPress={closeAllMenus}
                />
            )}

            {/* Content Area */}
            <View style={styles.content}>
                {loading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
                ) : (
                    <View style={styles.pageShadowWrapper}>
                    <View style={styles.pageCard}>
                        <View style={styles.webviewContainer}>
                            <WebView
                                ref={webViewRef}
                                originWhitelist={['*']}
                                source={webViewSource}
                                style={styles.webview}
                                onMessage={(event) => {
                                    try {
                                        const message = JSON.parse(event.nativeEvent.data);
                                        if (message.type === 'content') {
                                            const now = Date.now();
                                            if (
                                                htmlContentRef.current &&
                                                htmlContentRef.current !== message.data &&
                                                now - lastEditCheckpointRef.current > EDIT_CHECKPOINT_GAP_MS
                                            ) {
                                                actionHistoryRef.current.push({ kind: 'text', before: htmlContentRef.current });
                                                if (actionHistoryRef.current.length > 50) actionHistoryRef.current.shift();
                                                actionRedoRef.current = []; // cualquier edición nueva invalida el rehacer
                                            }
                                            lastEditCheckpointRef.current = now;
                                            htmlContentRef.current = message.data;
                                        } else if (message.type === 'scroll') {
                                            setScrollY(message.data);
                                        } else if (message.type === 'height') {
                                            contentHeightRef.current = message.data;
                                            setContentHeight(message.data);
                                        } else if (message.type === 'pageBreaks') {
                                            pageBreaksRef.current = message.data;
                                            if (pageBreaksResolveRef.current) {
                                                pageBreaksResolveRef.current(message.data);
                                                pageBreaksResolveRef.current = null;
                                            }
                                        } else if (message.type === 'lineType') {
                                            setCurrentLineType(message.data);
                                        }
                                    } catch {
                                        // Fallback for non-JSON messages
                                        htmlContentRef.current = event.nativeEvent.data;
                                    }
                                }}
                                // Android: permite el zoom por pellizco (este WebView es solo
                                // Vista/Texto — dibujar vive en "Ver y marcar", aparte).
                                scalesPageToFit={true}
                                bounces={false}
                                scrollEnabled={true}
                                showsHorizontalScrollIndicator={false}
                                showsVerticalScrollIndicator={true}
                                // iOS specific
                                allowsInlineMediaPlayback={true}
                                mediaPlaybackRequiresUserAction={false}
                                // Android specific
                                domStorageEnabled={true}
                                javaScriptEnabled={true}
                                // Android ignora <meta viewport> sin esto — necesario para que
                                // respete el ancho lógico fijo (pageWidth) igual que iOS. La
                                // librería sí los soporta a nivel nativo (WebSettings de
                                // Android), pero esta versión no los declara en sus tipos de
                                // TypeScript — de ahí el "as any".
                                {...({ useWideViewPort: true, loadWithOverviewMode: true } as any)}
                            />
                        </View>

                        <View
                            style={[styles.drawingLayer, { pointerEvents: 'none', zIndex: 10 }]}
                        >
                            {/* Capa de SOLO LECTURA: muestra los trazos ya guardados mientras
                                se lee/edita el texto, pero ya no se puede dibujar aquí —
                                dibujar vive en la superposición aparte "Ver y marcar", donde
                                el trazo forma parte del propio WebView (alineado con
                                cualquier nivel de zoom, sin esta conversión de coordenadas).
                                viewBox: el contenido (paths, en coordenadas lógicas de
                                página) se dibuja como si el SVG midiera pageWidth de ancho,
                                y SVG lo reescala solo para caber en el tamaño real en
                                pantalla (width/height) — mismo mecanismo que "displayScale"
                                aplica al WebView, sin necesidad de transform manual. */}
                            <Svg
                                width="100%"
                                height={drawingSvgHeightPt}
                                viewBox={`0 0 ${pageWidth} ${drawingSvgHeightPt / displayScale}`}
                            >
                                <G transform={`translate(0, -${scrollY})`}>
                                    {drawingLayerImage && (
                                        <SvgImage
                                            href={drawingLayerImage}
                                            x="0"
                                            y="0"
                                            width="100%"
                                            height={contentHeight || '100%'}
                                            preserveAspectRatio="xMidYMin slice"
                                        />
                                    )}

                                    {paths.map((p) => (
                                        <Path
                                            key={p.id}
                                            d={p.d}
                                            stroke={p.color}
                                            strokeWidth={p.width}
                                            strokeOpacity={p.opacity ?? 1}
                                            fill="none"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    ))}
                                </G>
                            </Svg>
                        </View>
                    </View>
                    </View>
                )}
            </View>

            {/* Barra flotante inferior: Deshacer/Rehacer/Texto/Dibujo, y al activar Texto o
                Dibujo se funde con los botones de esa herramienta, en el mismo módulo. */}
            <View
                pointerEvents="box-none"
                style={[
                    styles.bottomBarWrapper,
                    { bottom: keyboardOffset > 0 ? keyboardOffset + rp(8) : insets.bottom + rp(20) },
                ]}
            >
                <View style={styles.bottomBarRowOuter} pointerEvents="box-none">
                    <Animated.View
                        pointerEvents={toolbarExpanded ? 'auto' : 'none'}
                        style={[
                            styles.bottomBarCapsule,
                            {
                                width: toolbarExpandAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, Math.min(toolbarCapsuleMaxWidth, (mode === 'view' ? viewRowWidth : editRowWidth) || toolbarCapsuleMaxWidth)],
                                }),
                                marginRight: toolbarExpandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }),
                            },
                        ]}
                    >
                        {/* Sin BlurView aquí (a diferencia de los desplegables, que sí lo
                            llevan y se ven bien): este contenedor va dentro de un
                            Animated.View cuyo ancho se anima al abrir/cerrar, y un
                            BlurView anidado en una vista animada no siempre captura bien
                            el fondo en vivo — se veía demasiado transparente. Un tinte
                            plano y opaco es más fiable. */}
                        <View style={[styles.bottomBarClip, { borderColor: cardBorder, backgroundColor: popupOverlayTint }]} />

                    {/* Fila: modo vista */}
                    <Animated.View
                        style={[
                            styles.bottomBarRow,
                            { opacity: barAnim.view, transform: [{ translateY: barAnim.view.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
                        ]}
                        pointerEvents={mode === 'view' ? 'auto' : 'none'}
                    >
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.bottomBarScrollContent}
                            onContentSizeChange={(w) => setViewRowWidth(w)}
                        >
                            <TouchableOpacity onPress={handleUndo} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <Undo size={20} color={onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleRedo} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <Redo size={20} color={onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setMode('edit')} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <Type size={22} color={onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleOpenViewAndMark} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <Pencil size={22} color={onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleOpenExportSheet} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <Share2 size={20} color={onBg} />
                            </TouchableOpacity>
                        </ScrollView>
                    </Animated.View>

                    {/* Fila: modo texto */}
                    <Animated.View
                        style={[
                            styles.bottomBarRow,
                            { opacity: barAnim.edit, transform: [{ translateY: barAnim.edit.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
                        ]}
                        pointerEvents={mode === 'edit' ? 'auto' : 'none'}
                    >
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.bottomBarScrollContent}
                            onContentSizeChange={(w) => setEditRowWidth(w)}
                        >
                            <TouchableOpacity onPress={handleUndo} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <Undo size={20} color={onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleRedo} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <Redo size={20} color={onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setMode('view')} style={[styles.toolbarButton, styles.toolbarButtonActive, { backgroundColor: chipActiveBg, borderColor: colors.primary }]}>
                                <Type size={22} color={activeAccent} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setShowSizeMenu(!showSizeMenu); setShowFormatMenu(false); setShowAlignMenu(false); setShowColorMenu(false); setShowHighlightMenu(false); }}
                                style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }, showSizeMenu && [styles.toolbarButtonActive, { backgroundColor: chipActiveBg, borderColor: colors.primary }]]}
                            >
                                <Pilcrow size={20} color={showSizeMenu ? activeAccent : onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setShowHighlightMenu(!showHighlightMenu); setHighlightPanel('colors'); setShowFormatMenu(false); setShowAlignMenu(false); setShowSizeMenu(false); setShowColorMenu(false); }}
                                style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }, showHighlightMenu && [styles.toolbarButtonActive, { backgroundColor: chipActiveBg, borderColor: colors.primary }]]}
                            >
                                <Highlighter size={20} color={showHighlightMenu ? activeAccent : onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setShowColorMenu(!showColorMenu); setShowFormatMenu(false); setShowAlignMenu(false); setShowSizeMenu(false); setShowHighlightMenu(false); }}
                                style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }, showColorMenu && [styles.toolbarButtonActive, { backgroundColor: chipActiveBg, borderColor: colors.primary }]]}
                            >
                                <Palette size={20} color={showColorMenu ? activeAccent : onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setShowFormatMenu(!showFormatMenu); setShowAlignMenu(false); setShowSizeMenu(false); setShowColorMenu(false); setShowHighlightMenu(false); }}
                                style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }, showFormatMenu && [styles.toolbarButtonActive, { backgroundColor: chipActiveBg, borderColor: colors.primary }]]}
                            >
                                <Text style={[styles.toolbarButtonText, { color: onBg }, showFormatMenu && { color: activeAccent }]}>Aa</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setShowAlignMenu(!showAlignMenu); setShowFormatMenu(false); setShowSizeMenu(false); setShowColorMenu(false); setShowHighlightMenu(false); }}
                                style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }, showAlignMenu && [styles.toolbarButtonActive, { backgroundColor: chipActiveBg, borderColor: colors.primary }]]}
                            >
                                <Menu size={20} color={showAlignMenu ? activeAccent : onBg} />
                            </TouchableOpacity>
                        </ScrollView>
                    </Animated.View>
                    </Animated.View>

                    {/* Sin BlurView: a este tamaño tan pequeño y con el radio máximo
                        (círculo perfecto), el recorte del blur podía verse facetado
                        ("hexagonal") en vez de circular — un tinte plano y opaco, como
                        el de "Guardar"/el botón atrás del header, es más fiable y ya
                        pega con el resto de círculos del header. */}
                    <TouchableOpacity
                        onPress={toggleToolbarExpanded}
                        activeOpacity={0.85}
                        style={[styles.fabButton, { borderColor: cardBorder, backgroundColor: popupOverlayTint }]}
                    >
                        {toolbarExpanded ? <X size={22} color={onBg} /> : <Edit3 size={22} color={onBg} />}
                    </TouchableOpacity>
                </View>

                {/* Paneles emergentes (Aa / alineación / tamaño / color / trazo) — flotan
                    justo encima de la cápsula, con el mismo cristal morado que el módulo
                    principal, fuera del ScrollView para que no se recorten */}
                {showFormatMenu && (
                    <View style={styles.bottomPopupShadow}>
                        <View style={[styles.bottomPopupClip, { borderColor: cardBorder }]}>
                            <BlurView intensity={isDark ? 85 : 90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: popupOverlayTint }]} />
                            <TouchableOpacity
                                onPress={() => { setIsBold(!isBold); formatText('bold'); setShowFormatMenu(false); }}
                                style={[styles.dropdownItem, { borderBottomWidth: 1, borderBottomColor: cardBorder }, isBold && styles.dropdownItemActive]}
                            >
                                <Bold size={18} color={isBold ? activeAccent : onBg} strokeWidth={3} />
                                <Text style={[styles.dropdownItemText, { color: onBg }, isBold && { color: activeAccent, fontWeight: 'bold' }]}>Negrita</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setIsItalic(!isItalic); formatText('italic'); setShowFormatMenu(false); }}
                                style={[styles.dropdownItem, { borderBottomWidth: 1, borderBottomColor: cardBorder }, isItalic && styles.dropdownItemActive]}
                            >
                                <Italic size={18} color={isItalic ? activeAccent : onBg} />
                                <Text style={[styles.dropdownItemText, { color: onBg }, isItalic && { color: activeAccent, fontStyle: 'italic' }]}>Cursiva</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setIsUnderline(!isUnderline); formatText('underline'); setShowFormatMenu(false); }}
                                style={[styles.dropdownItem, { borderBottomWidth: 1, borderBottomColor: cardBorder }, isUnderline && styles.dropdownItemActive]}
                            >
                                <Underline size={18} color={isUnderline ? activeAccent : onBg} />
                                <Text style={[styles.dropdownItemText, { color: onBg }, isUnderline && { color: activeAccent, textDecorationLine: 'underline' }]}>Subrayado</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setIsStrikethrough(!isStrikethrough); formatText('strikeThrough'); setShowFormatMenu(false); }}
                                style={[styles.dropdownItem, isStrikethrough && styles.dropdownItemActive]}
                            >
                                <Strikethrough size={18} color={isStrikethrough ? activeAccent : onBg} />
                                <Text style={[styles.dropdownItemText, { color: onBg }, isStrikethrough && { color: activeAccent, textDecorationLine: 'line-through' }]}>Tachado</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {showAlignMenu && (
                    <View style={styles.bottomPopupShadow}>
                        <View style={[styles.bottomPopupClip, { borderColor: cardBorder }]}>
                            <BlurView intensity={isDark ? 85 : 90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: popupOverlayTint }]} />
                            <TouchableOpacity
                                onPress={() => { setTextAlign('left'); formatText('justifyLeft'); setShowAlignMenu(false); }}
                                style={[styles.dropdownItem, { borderBottomWidth: 1, borderBottomColor: cardBorder }, textAlign === 'left' && styles.dropdownItemActive]}
                            >
                                <AlignLeft size={18} color={textAlign === 'left' ? activeAccent : onBg} />
                                <Text style={[styles.dropdownItemText, { color: onBg }, textAlign === 'left' && { color: activeAccent }]}>Izquierda</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setTextAlign('center'); formatText('justifyCenter'); setShowAlignMenu(false); }}
                                style={[styles.dropdownItem, { borderBottomWidth: 1, borderBottomColor: cardBorder }, textAlign === 'center' && styles.dropdownItemActive]}
                            >
                                <AlignCenter size={18} color={textAlign === 'center' ? activeAccent : onBg} />
                                <Text style={[styles.dropdownItemText, { color: onBg }, textAlign === 'center' && { color: activeAccent }]}>Centrado</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setTextAlign('right'); formatText('justifyRight'); setShowAlignMenu(false); }}
                                style={[styles.dropdownItem, textAlign === 'right' && styles.dropdownItemActive]}
                            >
                                <AlignRight size={18} color={textAlign === 'right' ? activeAccent : onBg} />
                                <Text style={[styles.dropdownItemText, { color: onBg }, textAlign === 'right' && { color: activeAccent }]}>Derecha</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {showSizeMenu && (
                    <View style={styles.bottomPopupShadow}>
                        <View style={[styles.bottomPopupClip, { borderColor: cardBorder }]}>
                            <BlurView intensity={isDark ? 85 : 90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: popupOverlayTint }]} />
                            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator nestedScrollEnabled>
                                {LINE_STYLES.map((preset, index) => {
                                    const isActive = preset.key === currentLineType;
                                    return (
                                        <TouchableOpacity
                                            key={preset.key}
                                            onPress={() => applyLineStyle(preset)}
                                            style={[
                                                styles.dropdownItem,
                                                index < LINE_STYLES.length - 1 && { borderBottomWidth: 1, borderBottomColor: cardBorder },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.dropdownItemText,
                                                    styles.dropdownItemTextFlex,
                                                    { color: isActive ? activeAccent : onBg },
                                                    preset.preview,
                                                    // preset.preview trae el textAlign REAL que tendrá en el
                                                    // guion (centrado para título/personaje, izquierda para el
                                                    // resto) — en un menú vertical de opciones todas deben ir
                                                    // alineadas igual (a la izquierda), si no, dentro de este
                                                    // Text ya con flex:1 (para dejar sitio al tick) quedaban
                                                    // unos ítems centrados y otros no.
                                                    styles.dropdownItemTextAlign,
                                                ]}
                                            >
                                                {preset.label}
                                            </Text>
                                            {isActive && <Check size={16} color={activeAccent} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                )}

                {showColorMenu && (
                    <View style={styles.bottomPopupShadow}>
                        <View style={[styles.bottomPopupClip, { borderColor: cardBorder }]}>
                            <BlurView intensity={isDark ? 85 : 90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: popupOverlayTint }]} />
                            <View style={styles.colorGrid}>
                                {COLORS.map((color) => (
                                    <TouchableOpacity
                                        key={color}
                                        onPress={() => { setTextColor(color); formatText('foreColor', color); setShowColorMenu(false); }}
                                        style={[
                                            styles.colorButton,
                                            { backgroundColor: color },
                                            textColor === color && [styles.colorButtonActive, { borderColor: onBg }]
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>
                    </View>
                )}

                {showHighlightMenu && (
                    <View style={styles.bottomPopupShadow}>
                        <View style={[styles.bottomPopupClip, { borderColor: cardBorder }]}>
                            <BlurView intensity={isDark ? 85 : 90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: popupOverlayTint }]} />

                            {highlightPanel === 'colors' && (
                                <View>
                                    <View style={[styles.colorGrid, { paddingHorizontal: rp(12) }]}>
                                        {HIGHLIGHT_COLORS.map((preset) => (
                                            <TouchableOpacity
                                                key={preset.key}
                                                onPress={() => applyHighlight(preset.color)}
                                                style={[
                                                    styles.colorButton,
                                                    preset.key === 'none'
                                                        ? { backgroundColor: 'transparent', borderColor: onBg, alignItems: 'center', justifyContent: 'center' }
                                                        : { backgroundColor: preset.swatch },
                                                ]}
                                            >
                                                {preset.key === 'none' && (
                                                    <Text style={{ color: onBg, fontSize: 14, fontWeight: '700' }}>✕</Text>
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    {scriptCharacters.length > 0 && (
                                        <TouchableOpacity
                                            onPress={() => setHighlightPanel('characterList')}
                                            style={[styles.markCharacterRow, { borderTopColor: cardBorder }]}
                                        >
                                            <Users size={16} color={onBg2} />
                                            <Text style={[styles.markCharacterRowText, { color: onBg2 }]}>Marcar todas las líneas de un personaje</Text>
                                            <ChevronRight size={16} color={onBg2} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}

                            {highlightPanel === 'characterList' && (
                                <View>
                                    <View style={styles.markPanelHeader}>
                                        <TouchableOpacity onPress={() => setHighlightPanel('colors')} style={styles.markBackBtn}>
                                            <ChevronLeft size={18} color={onBg} />
                                        </TouchableOpacity>
                                        <Text style={[styles.markPanelTitle, { color: onBg }]}>Marcar personaje</Text>
                                        <View style={{ width: 28 }} />
                                    </View>
                                    <View style={[styles.markToggleRow, { borderColor: cardBorder }]}>
                                        <TouchableOpacity
                                            onPress={() => setMarkIncludeDialogue(false)}
                                            style={[styles.markToggleOption, !markIncludeDialogue && { backgroundColor: chipActiveBg }]}
                                        >
                                            <Text style={[styles.markToggleText, { color: !markIncludeDialogue ? activeAccent : onBg2 }]}>Solo nombre</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setMarkIncludeDialogue(true)}
                                            style={[styles.markToggleOption, markIncludeDialogue && { backgroundColor: chipActiveBg }]}
                                        >
                                            <Text style={[styles.markToggleText, { color: markIncludeDialogue ? activeAccent : onBg2 }]}>Nombre + diálogo</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <ScrollView style={{ maxHeight: 170 }} showsVerticalScrollIndicator nestedScrollEnabled>
                                        {scriptCharacters.map((character, index) => (
                                            <TouchableOpacity
                                                key={character.id}
                                                onPress={() => handleMarkCharacterPress(character)}
                                                style={[
                                                    styles.dropdownItem,
                                                    index < scriptCharacters.length - 1 && { borderBottomWidth: 1, borderBottomColor: cardBorder },
                                                ]}
                                            >
                                                <View style={[styles.markSwatch, { backgroundColor: character.is_user_character ? userMarkColor : character.color }]} />
                                                <Text style={[styles.dropdownItemText, styles.dropdownItemTextFlex, { color: onBg }]}>
                                                    {character.name}{character.is_user_character ? '  ·  TÚ' : ''}
                                                </Text>
                                                <ChevronRight size={16} color={onBg2} />
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}

                            {highlightPanel === 'userColorPicker' && (
                                <View>
                                    <View style={styles.markPanelHeader}>
                                        <TouchableOpacity onPress={() => setHighlightPanel('characterList')} style={styles.markBackBtn}>
                                            <ChevronLeft size={18} color={onBg} />
                                        </TouchableOpacity>
                                        <Text style={[styles.markPanelTitle, { color: onBg }]}>Tu color</Text>
                                        <View style={{ width: 28 }} />
                                    </View>
                                    <View style={[styles.colorGrid, { paddingHorizontal: rp(12) }]}>
                                        {userMarkColorOptions.map((color) => (
                                            <TouchableOpacity
                                                key={color}
                                                onPress={() => handlePickUserMarkColor(color)}
                                                style={[
                                                    styles.colorButton,
                                                    { backgroundColor: color },
                                                    userMarkColor === color && [styles.colorButtonActive, { borderColor: onBg }],
                                                ]}
                                            />
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>
                )}

            </View>

            {showViewAndMark && (
                <ViewAndMarkOverlay
                    html={markupHtml}
                    paths={paths}
                    saving={saving}
                    onNewPath={handleNewPathFromMarkup}
                    onErasePath={handleErasePathFromMarkup}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onSave={handleSaveAnnotations}
                    onClose={() => setShowViewAndMark(false)}
                />
            )}

            {showExportSheet && (
                <ExportOptionsSheet
                    scriptTitle={scriptTitle}
                    totalPages={exportTotalPages}
                    hasAnnotations={paths.length > 0}
                    exporting={exportingPdf}
                    onClose={() => setShowExportSheet(false)}
                    onExport={async (options) => {
                        await handleExport(options);
                        setShowExportSheet(false);
                    }}
                />
            )}

            <ConfirmDialog
                visible={showUnsavedBackDialog}
                title="¿Guardar cambios?"
                message="Has hecho cambios sin guardar en este guion (texto, marcado o dibujo). ¿Quieres guardarlos antes de salir?"
                extraButtonText="Guardar y salir"
                onExtra={() => { setShowUnsavedBackDialog(false); handleSave(); }}
                confirmText="Salir sin guardar"
                destructive
                onConfirm={() => { setShowUnsavedBackDialog(false); router.back(); }}
                cancelText="Cancelar"
                onCancel={() => setShowUnsavedBackDialog(false)}
            />
        </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: rp(16),
        paddingVertical: rp(12),
        borderBottomWidth: 1,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rp(12),
        paddingVertical: rp(8),
        borderRadius: 20,
        gap: 6,
    },
    saveText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: rf(14),
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: rp(8),
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: rf(16),
        fontWeight: '700',
    },
    paletteContainer: {
        flexDirection: 'row',
        paddingVertical: rp(4),
    },
    colorSwatch: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    selectedSwatch: {
        borderWidth: 2,
        borderColor: '#000000',
        transform: [{ scale: 1.1 }],
    },
    content: {
        flex: 1,
        position: 'relative',
    },
    pageShadowWrapper: {
        flex: 1,
        // Sin margen horizontal: la página llega a los bordes de la pantalla (antes
        // se veía el fondo morado a los lados, reforzando la sensación de "todo
        // muy estrecho"). Sin esquinas redondeadas tampoco — pegadas al borde real
        // de la pantalla sin margen alrededor se verían como un recorte raro, no
        // como una tarjeta flotante.
        marginBottom: rp(12),
        shadowColor: '#1a1625',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
        elevation: 6,
    },
    pageCard: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
    },
    webviewContainer: {
        flex: 1,
    },
    webview: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    drawingLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
    },
    menuOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
    },
    // Barra flotante inferior (mismo lenguaje visual que la tab bar / PlayerControlsCapsule)
    bottomBarWrapper: {
        position: 'absolute',
        left: 16,
        right: 16,
        // Por encima de menuOverlay (zIndex: 50): en RN, en cuanto un hermano define
        // zIndex, deja de valer el orden del árbol para decidir quién recibe el toque.
        zIndex: 200,
    },
    bottomBarRowOuter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    bottomBarCapsule: {
        height: 64,
        borderRadius: 28,
        position: 'relative',
        overflow: 'hidden',
    },
    fabButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        // Un solo contorno redondeado en vez de dos anidados (uno en este botón
        // y otro en una capa interna aparte) — dos bordes redondeados casi del
        // mismo tamaño uno encima del otro podían dar una sensación de facetado
        // ("hexagonal") en vez de un círculo limpio.
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomBarClip: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 28,
        borderWidth: 1,
        overflow: 'hidden',
    },
    bottomBarRow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    bottomBarScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 14,
    },
    bottomPopupShadow: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 72, // altura de la cápsula (64) + separación (8)
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 8,
    },
    bottomPopupClip: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        paddingVertical: 8,
        maxHeight: 280,
    },
    toolbarButton: {
        width: 44,
        height: 44,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toolbarButtonActive: {
        borderWidth: 1,
    },
    toolbarButtonText: {
        fontSize: rf(16),
        fontWeight: '600',
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: rp(12),
        paddingHorizontal: rp(16),
    },
    dropdownItemTextFlex: {
        flex: 1,
    },
    dropdownItemTextAlign: {
        textAlign: 'left',
    },
    dropdownItemActive: {
        backgroundColor: 'rgba(124,106,247,0.14)',
    },
    dropdownItemText: {
        fontSize: rf(14),
    },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center',
    },
    colorButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(120,120,120,0.3)',
    },
    colorButtonActive: {
        borderWidth: 3,
        transform: [{ scale: 1.1 }],
    },
    markCharacterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        paddingTop: 10,
        paddingHorizontal: rp(16),
        borderTopWidth: 1,
    },
    markCharacterRowText: {
        flex: 1,
        fontSize: rf(13),
        fontWeight: '500',
    },
    markPanelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: rp(12),
        paddingBottom: 8,
    },
    markBackBtn: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    markPanelTitle: {
        fontSize: rf(14),
        fontWeight: '700',
    },
    markToggleRow: {
        flexDirection: 'row',
        marginHorizontal: rp(12),
        marginBottom: 8,
        borderRadius: 10,
        borderWidth: 1,
        overflow: 'hidden',
    },
    markToggleOption: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
    },
    markToggleText: {
        fontSize: rf(12),
        fontWeight: '600',
    },
    markSwatch: {
        width: 18,
        height: 18,
        borderRadius: 9,
    },
});
