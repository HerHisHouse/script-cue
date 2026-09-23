import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { BlurView } from 'expo-blur';
import { ANDROID_BLUR_METHOD } from '@/utils/blur';
import { ChevronLeft, Save, Undo, Redo, Pencil, PenTool, Pen, Highlighter, Paintbrush, Ruler, Eraser, Hand, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getShadowStyle } from '@/utils/cardShadow';
import { COLORS, type PathData } from './drawingShared';

type Tool = 'pen' | 'erase' | 'pan';
// Cada pincel trae su propio ancho/opacidad (ver BRUSH_PARAMS en
// buildMarkupHtml, editor.tsx) — sin control manual de grosor por ahora, cada
// uno ya tiene un aspecto reconocible propio. "Regla" no es un pincel en sí:
// convierte el trazo de 1 dedo en una línea recta (del punto inicial al
// actual) en vez de a mano alzada.
type BrushType = 'pencil' | 'fountain' | 'ballpoint' | 'marker' | 'watercolor' | 'ruler';

const BRUSHES: { key: BrushType; label: string; Icon: typeof Pencil }[] = [
    { key: 'pencil', label: 'Lápiz', Icon: Pencil },
    { key: 'fountain', label: 'Pluma', Icon: PenTool },
    { key: 'ballpoint', label: 'Bolígrafo', Icon: Pen },
    { key: 'marker', label: 'Rotulador', Icon: Highlighter },
    { key: 'watercolor', label: 'Acuarela', Icon: Paintbrush },
    { key: 'ruler', label: 'Regla', Icon: Ruler },
];

interface ViewAndMarkOverlayProps {
    html: string;
    paths: PathData[];
    saving: boolean;
    onNewPath: (path: PathData) => void;
    onErasePath: (id: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void | Promise<void>;
    onClose: () => void;
}

// Superposición a pantalla completa de "Ver y marcar": el dibujo vive DENTRO
// de este WebView (no en una capa nativa aparte), así el trazo nunca se
// desalinea del texto a ningún nivel de zoom — ver el <script> táctil
// incrustado por buildMarkupHtml en editor.tsx. Este componente solo
// orquesta la barra de herramientas (herramienta activa, pincel, color) y
// reenvía los mensajes del WebView hacia arriba.
export default function ViewAndMarkOverlay({
    html,
    paths,
    saving,
    onNewPath,
    onErasePath,
    onUndo,
    onRedo,
    onSave,
    onClose,
}: ViewAndMarkOverlayProps) {
    const { colors, isDark } = useTheme();
    const webViewRef = useRef<WebView>(null);
    // Empieza en "mano" (navegar), no en "lápiz": el gesto de 1 dedo más
    // natural al entrar es desplazarse para leer, y dibujar debe ser una
    // elección explícita — si empezara en lápiz, el primer arrastre de
    // lectura dibujaría una línea sin querer y parecería que no hay forma de
    // volver a solo navegar.
    const [activeTool, setActiveTool] = useState<Tool>('pan');
    const [brushType, setBrushType] = useState<BrushType>('pencil');
    const [strokeColor, setStrokeColor] = useState('#FF0000');
    const [showColorMenu, setShowColorMenu] = useState(false);
    // Cuántos trazos nuevos/borrados hay desde el último guardado: si es > 0
    // al salir, se avisa antes de perder las marcas (decidido con el usuario).
    const dirtyCountRef = useRef(0);
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

    const onBg = isDark ? '#ffffff' : '#2a2447';
    const cardBorder = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)';
    // Mismo valor más opaco que usan la barra inferior del editor y la hoja de
    // exportar — aquí detrás está la página del guion en blanco, no el fondo
    // morado con degradado, así que necesita más cobertura para distinguirse.
    const popupOverlayTint = isDark ? 'rgba(20,16,32,0.82)' : 'rgba(235,230,245,0.92)';
    const chipInactiveBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(104,58,121,0.08)';
    const chipActiveBg = isDark ? 'rgba(124,106,247,0.30)' : 'rgba(104,58,121,0.15)';
    // colors.primary en modo oscuro es un morado apagado, casi del mismo tono
    // que chipActiveBg — el icono activo quedaba casi invisible encima. En
    // modo oscuro se usa blanco puro para destacar (el borde sí sigue siendo
    // colors.primary, es un contorno fino, no un relleno).
    const activeAccent = isDark ? '#FFFFFF' : colors.primary;
    const glassHeaderBtn = isDark
        ? { backgroundColor: 'rgba(255,255,255,0.12)' }
        : { backgroundColor: 'rgba(255,255,255,0.35)' };
    const bg = isDark ? '#1a1625' : '#f2eefa';
    // Mismo tratamiento que el botón "Guardar" del header del editor principal.
    const primaryButtonBg = isDark
        ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
        : { backgroundColor: colors.primary };

    // La cápsula de pinceles solo tiene sentido con la herramienta "lápiz"
    // activa (borrar/mover no dibujan) — se despliega automáticamente al
    // elegirla, sin un estado aparte que pueda desincronizarse.
    const showBrushCapsule = activeTool === 'pen';

    useEffect(() => {
        webViewRef.current?.injectJavaScript(`window.__activeTool = ${JSON.stringify(activeTool)}; true;`);
    }, [activeTool]);

    useEffect(() => {
        webViewRef.current?.injectJavaScript(`window.__brushType = ${JSON.stringify(brushType)}; true;`);
    }, [brushType]);

    useEffect(() => {
        webViewRef.current?.injectJavaScript(`window.__strokeColor = ${JSON.stringify(strokeColor)}; true;`);
    }, [strokeColor]);

    // Deshacer/rehacer cambian "paths" del lado de React Native; el WebView no
    // se entera solo (los trazos nuevos/borrados sí se reflejan al instante
    // porque el propio script del WebView los añade/quita, pero un deshacer/
    // rehacer restaura una lista entera desde fuera) — se vuelve a pintar el
    // SVG completo cada vez que cambia esta prop, salvo en el primer render
    // (ese estado ya viene incrustado en "html").
    const isFirstPathsRender = useRef(true);
    useEffect(() => {
        if (isFirstPathsRender.current) {
            isFirstPathsRender.current = false;
            return;
        }
        webViewRef.current?.injectJavaScript(`window.__setAllPaths && window.__setAllPaths(${JSON.stringify(JSON.stringify(paths))}); true;`);
    }, [paths]);

    function handleMessage(event: any) {
        try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'newPath') {
                dirtyCountRef.current += 1;
                onNewPath({ id: message.id, d: message.d, color: message.color, width: message.width, opacity: message.opacity });
            } else if (message.type === 'erasePath') {
                dirtyCountRef.current += 1;
                onErasePath(message.id);
            }
        } catch {
            // mensaje no reconocido, se ignora
        }
    }

    async function handleSavePress() {
        await onSave();
        dirtyCountRef.current = 0;
    }

    function handleClosePress() {
        if (dirtyCountRef.current > 0) {
            setShowUnsavedDialog(true);
        } else {
            onClose();
        }
    }

    async function handleSaveAndClose() {
        setShowUnsavedDialog(false);
        await handleSavePress();
        onClose();
    }

    return (
        <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: bg }]}>
            <SafeAreaView style={styles.flex}>
                <View style={[styles.header, { borderBottomColor: cardBorder }]}>
                    <TouchableOpacity onPress={handleClosePress} style={[styles.headerButton, glassHeaderBtn]}>
                        <ChevronLeft size={22} color={onBg} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: onBg }]}>Modo dibujo</Text>
                    <TouchableOpacity
                        onPress={handleSavePress}
                        disabled={saving}
                        style={[styles.saveButton, primaryButtonBg, { opacity: saving ? 0.6 : 1 }]}
                    >
                        <Save size={16} color="#FFFFFF" />
                        <Text style={styles.saveButtonText}>Guardar</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.webviewWrapper}>
                    <WebView
                        ref={webViewRef}
                        originWhitelist={['*']}
                        source={{ html }}
                        style={styles.webview}
                        onMessage={handleMessage}
                        injectedJavaScriptBeforeContentLoaded={`
                            window.__activeTool = ${JSON.stringify(activeTool)};
                            window.__brushType = ${JSON.stringify(brushType)};
                            window.__strokeColor = ${JSON.stringify(strokeColor)};
                            true;
                        `}
                        scalesPageToFit={true}
                        bounces={false}
                        scrollEnabled={true}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={true}
                        allowsInlineMediaPlayback={true}
                        mediaPlaybackRequiresUserAction={false}
                        domStorageEnabled={true}
                        javaScriptEnabled={true}
                        {...({ useWideViewPort: true, loadWithOverviewMode: true } as any)}
                    />
                </View>

                <View style={styles.toolbarWrapper}>
                    {showBrushCapsule && (
                        <View style={styles.brushCapsule}>
                            <View style={[styles.brushClip, { borderColor: cardBorder }]}>
                                <BlurView experimentalBlurMethod={ANDROID_BLUR_METHOD} intensity={isDark ? 85 : 90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                                <View style={[StyleSheet.absoluteFill, { backgroundColor: popupOverlayTint }]} />
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brushScrollContent}>
                                {BRUSHES.map(({ key, Icon }) => {
                                    const isActive = brushType === key;
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            onPress={() => setBrushType(key)}
                                            style={[
                                                styles.toolbarButton,
                                                { backgroundColor: isActive ? chipActiveBg : chipInactiveBg },
                                                isActive && { borderWidth: 1, borderColor: colors.primary },
                                            ]}
                                        >
                                            <Icon size={18} color={isActive ? activeAccent : onBg} />
                                        </TouchableOpacity>
                                    );
                                })}
                                <TouchableOpacity
                                    onPress={() => setShowColorMenu(!showColorMenu)}
                                    style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}
                                >
                                    <View style={[styles.colorDot, { backgroundColor: strokeColor }]} />
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    )}

                    <View style={styles.toolbarCapsule}>
                        <View style={[styles.toolbarClip, { borderColor: cardBorder }]}>
                            <BlurView experimentalBlurMethod={ANDROID_BLUR_METHOD} intensity={isDark ? 85 : 90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: popupOverlayTint }]} />
                        </View>
                        <View style={styles.toolbarRow}>
                            <TouchableOpacity onPress={() => { setShowColorMenu(false); onUndo(); }} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <Undo size={18} color={onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { setShowColorMenu(false); onRedo(); }} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <Redo size={18} color={onBg} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => { setShowColorMenu(false); setActiveTool('pen'); }}
                                style={[styles.toolbarButton, { backgroundColor: activeTool === 'pen' ? chipActiveBg : chipInactiveBg }, activeTool === 'pen' && { borderWidth: 1, borderColor: colors.primary }]}
                            >
                                <Pencil size={18} color={activeTool === 'pen' ? activeAccent : onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setShowColorMenu(false); setActiveTool('erase'); }}
                                style={[styles.toolbarButton, { backgroundColor: activeTool === 'erase' ? chipActiveBg : chipInactiveBg }, activeTool === 'erase' && { borderWidth: 1, borderColor: colors.primary }]}
                            >
                                <Eraser size={18} color={activeTool === 'erase' ? activeAccent : onBg} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setShowColorMenu(false); setActiveTool('pan'); }}
                                style={[styles.toolbarButton, { backgroundColor: activeTool === 'pan' ? chipActiveBg : chipInactiveBg }, activeTool === 'pan' && { borderWidth: 1, borderColor: colors.primary }]}
                            >
                                <Hand size={18} color={activeTool === 'pan' ? activeAccent : onBg} />
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => { setShowColorMenu(false); handleClosePress(); }} style={[styles.toolbarButton, { backgroundColor: chipInactiveBg }]}>
                                <X size={18} color={onBg} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {showColorMenu && (
                        <View style={[styles.popupShadow, getShadowStyle({ offsetY: -4, blur: 8, opacity: 0.15, rgb: '0,0,0' })]}>
                            <View style={[styles.popupClip, { borderColor: cardBorder }]}>
                                <BlurView experimentalBlurMethod={ANDROID_BLUR_METHOD} intensity={isDark ? 85 : 90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                                <View style={[StyleSheet.absoluteFill, { backgroundColor: popupOverlayTint }]} />
                                <View style={styles.colorGrid}>
                                    {COLORS.map((color) => (
                                        <TouchableOpacity
                                            key={color}
                                            onPress={() => { setStrokeColor(color); setShowColorMenu(false); }}
                                            style={[
                                                styles.colorButton,
                                                { backgroundColor: color },
                                                strokeColor === color && [styles.colorButtonActive, { borderColor: onBg }],
                                            ]}
                                        />
                                    ))}
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            </SafeAreaView>

            <ConfirmDialog
                visible={showUnsavedDialog}
                title="Cambios sin guardar"
                message="Tienes marcas nuevas sin guardar. Si sales ahora, se perderán."
                extraButtonText="Guardar"
                onExtra={handleSaveAndClose}
                confirmText="Salir sin guardar"
                destructive
                onConfirm={() => { setShowUnsavedDialog(false); onClose(); }}
                cancelText="Cancelar"
                onCancel={() => setShowUnsavedDialog(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        zIndex: 1000,
        elevation: Platform.OS === 'android' ? 1000 : undefined,
    },
    flex: {
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
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: rf(16),
        fontWeight: '600',
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rp(12),
        paddingVertical: rp(8),
        borderRadius: 20,
        gap: 6,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: rf(14),
    },
    webviewWrapper: {
        flex: 1,
    },
    webview: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    toolbarWrapper: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 16,
    },
    toolbarCapsule: {
        height: 60,
        borderRadius: 28,
        position: 'relative',
        justifyContent: 'center',
    },
    toolbarClip: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 28,
        borderWidth: 1,
        overflow: 'hidden',
    },
    toolbarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        paddingHorizontal: 10,
    },
    // Cápsula de pinceles: flota justo encima de la principal (solo con la
    // herramienta lápiz activa), con scroll horizontal porque 7 opciones
    // (6 pinceles + color) no caben cómodas en una fila fija como el resto.
    brushCapsule: {
        height: 56,
        borderRadius: 26,
        position: 'relative',
        justifyContent: 'center',
        marginBottom: 8,
    },
    brushClip: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 26,
        borderWidth: 1,
        overflow: 'hidden',
    },
    brushScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 10,
    },
    toolbarButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    colorDot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: 'rgba(120,120,120,0.3)',
    },
    popupShadow: {
        position: 'absolute',
        left: 0,
        right: 0,
        // Encima de las DOS cápsulas apiladas (principal 60 + hueco 8 + pinceles
        // 56 + hueco 8), ya que el botón de color vive en la de pinceles.
        bottom: 132,
        borderRadius: 16,
    },
    popupClip: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        padding: 12,
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
});
