import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, PanResponder, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ArrowLeft, Save, Edit3, PenTool, Undo, Redo, Type, Trash2, Bold, Italic, Underline, Palette, ChevronDown, ChevronUp, AlignLeft, AlignCenter, AlignRight } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import Svg, { Path, G, Image as SvgImage } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system';
import Slider from '@react-native-community/slider';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';

// --- Constants ---
const COLORS = [
    '#000000', // Black
    '#FF0000', // Red
    '#0000FF', // Blue
    '#008000', // Green
    '#FFA500', // Orange
    '#800080', // Purple
    '#FFC0CB', // Pink
    '#A52A2A', // Brown
    '#808080', // Gray
    '#00FFFF', // Cyan
];

export default function ScriptEditorScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();

    // State
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mode, setMode] = useState<'view' | 'edit' | 'draw'>('view');
    const [initialHtml, setInitialHtml] = useState(''); // Only for initial load
    const htmlContentRef = useRef(''); // Ref for latest content
    const [toolbarExpanded, setToolbarExpanded] = useState(false);

    // Drawing State
    interface PathData {
        d: string;
        color: string;
        width: number;
    }
    const [paths, setPaths] = useState<PathData[]>([]);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [history, setHistory] = useState<PathData[][]>([]);
    const [redoStack, setRedoStack] = useState<PathData[][]>([]);
    const [strokeColor, setStrokeColor] = useState('#FF0000');
    const [strokeWidth, setStrokeWidth] = useState(2);

    // Rich Text State
    const [textColor, setTextColor] = useState('#000000');
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
    const [fontSize, setFontSize] = useState('16px');

    // Scroll State for Drawing Sync
    const [scrollY, setScrollY] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);

    // Drawing Layer Image (PNG)
    const [drawingLayerImage, setDrawingLayerImage] = useState<string | null>(null);

    // Refs
    const webViewRef = useRef<WebView>(null);
    const drawingStateRef = useRef({ paths, history, redoStack, strokeColor, strokeWidth, scrollY });
    const currentPathPoints = useRef<Array<{ x: number; y: number }>>([]);

    // Update ref when state changes
    useEffect(() => {
        drawingStateRef.current = { paths, history, redoStack, strokeColor, strokeWidth, scrollY };
    }, [paths, history, redoStack, strokeColor, strokeWidth, scrollY]);

    // PanResponder for Drawing
    const panResponderRef = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                const { locationX, locationY } = evt.nativeEvent;
                const { strokeColor, strokeWidth, scrollY } = drawingStateRef.current;

                // Use document coordinates (add scrollY)
                const startPoint = { x: locationX, y: locationY + scrollY };
                const newPath = {
                    d: `M ${startPoint.x} ${startPoint.y}`,
                    color: strokeColor,
                    width: strokeWidth,
                    points: [startPoint]
                };
                setCurrentPath(`M ${startPoint.x} ${startPoint.y}`);
                currentPathPoints.current = [startPoint];
            },
            onPanResponderMove: (evt) => {
                const { locationX, locationY } = evt.nativeEvent;
                const { scrollY } = drawingStateRef.current;

                // Use document coordinates (add scrollY)
                const newPoint = { x: locationX, y: locationY + scrollY };
                currentPathPoints.current.push(newPoint);

                const pathData = currentPathPoints.current
                    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
                    .join(' ');
                setCurrentPath(pathData);
            },
            onPanResponderRelease: () => {
                setCurrentPath((prev) => {
                    if (prev) {
                        const { paths, history, strokeColor, strokeWidth } = drawingStateRef.current;
                        const newPath: PathData = { d: prev, color: strokeColor, width: strokeWidth };
                        const newPaths = [...paths, newPath];

                        setHistory([...history, paths]);
                        setRedoStack([]);
                        setPaths(newPaths);
                    }
                    return '';
                });
            },
        })
    ).current;


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

            // Priority: script_html > content > script_raw > parsed_text > reconstruct
            if (data.script_html) {
                // Use the professionally formatted HTML from OpenAI
                setInitialHtml(data.script_html);
                htmlContentRef.current = data.script_html;
            } else if (data.content) {
                setInitialHtml(data.content);
                htmlContentRef.current = data.content;
            } else if (data.script_raw || data.parsed_text) {
                // Fallback: Parse locally to apply custom formatting
                const rawText = data.script_raw || data.parsed_text;
                const formattedHtml = parseScriptLocally(rawText, data.title);
                setInitialHtml(formattedHtml);
                htmlContentRef.current = formattedHtml;
            } else {
                await reconstructScriptFromData();
            }

            // Load drawing layer if exists
            if (data.script_draw_layer) {
                setDrawingLayerImage(data.script_draw_layer);
            }

            if (data.annotations) {
                setPaths(data.annotations as any[]);
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
        let html = `<div style="text-align: center; font-family: 'Courier New', Courier, monospace; padding: 20px; max-width: 800px; margin: 0 auto;">`;

        // Title
        html += `<h1 style="font-weight: bold; text-transform: uppercase; text-decoration: underline; font-size: 22px; margin-bottom: 40px; color: #000000;">${title || 'GUION'}</h1>`;

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
                html += `<p style="font-weight: bold; text-transform: uppercase; color: #0000FF; margin-top: 40px; margin-bottom: 15px; font-size: 16px;">${item.text}</p>`;
                previousType = 'scene';
            } else if (item.type === 'character') {
                const marginTop = (previousType === 'dialogue' || previousType === 'parenthetical' || previousType === 'action') ? '25px' : '15px';
                html += `<p style="font-weight: bold; text-transform: uppercase; margin-top: ${marginTop}; margin-bottom: 0px; color: #000000;">${item.text}</p>`;
                previousType = 'character';
            } else if (item.type === 'parenthetical') {
                html += `<p style="margin-top: 0px; margin-bottom: 0px; font-size: 14px;">${item.text}</p>`;
                previousType = 'parenthetical';
            } else if (item.type === 'dialogue') {
                html += `<p style="margin-top: 0px; margin-bottom: 15px; max-width: 80%; margin-left: auto; margin-right: auto;">${item.text}</p>`;
                previousType = 'dialogue';
            } else if (item.type === 'transition') {
                html += `<p style="font-weight: bold; text-transform: uppercase; margin-top: 20px; margin-bottom: 20px; text-align: right;">${item.text}</p>`;
                previousType = 'transition';
            } else {
                // Action
                // If previous was character, this might actually be dialogue that failed detection?
                // But we classified it as action.
                // If previous was Character, force it to be Dialogue?
                if (previousType === 'character') {
                    html += `<p style="margin-top: 0px; margin-bottom: 15px; max-width: 80%; margin-left: auto; margin-right: auto;">${item.text}</p>`;
                    previousType = 'dialogue';
                } else {
                    const marginTop = (previousType === 'scene') ? '0px' : '20px';
                    html += `<p style="margin-top: ${marginTop}; margin-bottom: 10px; text-align: center;">${item.text}</p>`;
                    previousType = 'action';
                }
            }
        }

        html += '</div>';
        return html;
    }

    async function reconstructScriptFromData() {
        // Fallback if no parsed_text
        try {
            const { data: scenes } = await supabase
                .from('scenes')
                .select('*, lines(*)')
                .eq('script_id', id)
                .order('order_index');

            const { data: characters } = await supabase
                .from('characters')
                .select('*')
                .eq('script_id', id);

            if (!scenes || !characters) {
                setInitialHtml('<p>No se encontró contenido.</p>');
                return;
            }

            let html = `<div style="text-align: center; font-family: 'Courier New', Courier, monospace; padding: 20px;">`;

            scenes.forEach(scene => {
                html += `<p style="font-weight: bold; text-transform: uppercase; margin-top: 20px; margin-bottom: 10px;">${scene.type} ${scene.location} - ${scene.time}</p>`;
                if (scene.description) {
                    html += `<p style="margin-bottom: 10px;">${scene.description}</p>`;
                }

                const sortedLines = scene.lines?.sort((a: any, b: any) => a.order_index - b.order_index);

                sortedLines?.forEach((line: any) => {
                    const char = characters.find(c => c.id === line.character_id);
                    const charName = char ? char.name : 'UNKNOWN';

                    html += `<p style="margin-top: 10px; margin-bottom: 0px; font-weight: bold; text-transform: uppercase;">${charName}</p>`;

                    if (line.parenthetical) {
                        html += `<p style="margin-bottom: 0px;">(${line.parenthetical})</p>`;
                    }

                    html += `<p style="margin-bottom: 10px;">${line.content}</p>`;
                });
            });
            html += '</div>';

            setInitialHtml(html);
            htmlContentRef.current = html;

        } catch (error) {
            console.error('Error reconstructing script:', error);
            setInitialHtml('<p>Error reconstruyendo el guion.</p>');
        }
    }

    // --- Actions ---

    async function handleSave() {
        if (saving) return;
        setSaving(true);

        try {
            // Save HTML content to script_html
            const { error: updateError } = await supabase
                .from('scripts')
                .update({
                    script_html: htmlContentRef.current,
                    content: htmlContentRef.current, // Keep for compatibility
                    annotations: paths,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id);

            if (updateError) throw updateError;

            // Extract plain text from HTML for regeneration
            const plainText = htmlContentRef.current.replace(/<[^>]+>/g, '\n').trim();

            // Get auth token
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;

            if (!token) throw new Error('No auth token');

            // Call parse-pdf to regenerate scenes/lines from edited HTML
            const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-pdf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    scriptId: id,
                    text: plainText,
                    skipCharacterDetection: true,
                    preserveFormatting: true,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to regenerate script structure');
            }

            Alert.alert('Guardado', 'Guion actualizado y tarjetas regeneradas correctamente.');
            router.back();

        } catch (error: any) {
            console.error('Error saving script:', error);
            Alert.alert('Error', 'No se pudo guardar el guion: ' + error.message);
        } finally {
            setSaving(false);
        }
    }

    function handleUndo() {
        if (mode === 'edit') {
            formatText('undo');
        } else if (mode === 'draw') {
            if (history.length > 0) {
                const previous = history[history.length - 1];
                setRedoStack([...redoStack, paths]);
                setPaths(previous);
                setHistory(history.slice(0, -1));
            }
        }
    }

    function handleRedo() {
        if (mode === 'edit') {
            formatText('redo');
        } else if (mode === 'draw') {
            if (redoStack.length > 0) {
                const next = redoStack[redoStack.length - 1];
                setHistory([...history, paths]);
                setPaths(next);
                setRedoStack(redoStack.slice(0, -1));
            }
        }
    }

    function handleClear() {
        Alert.alert(
            'Borrar todo',
            '¿Estás seguro de que quieres borrar todas las anotaciones?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Borrar',
                    style: 'destructive',
                    onPress: () => {
                        setHistory([...history, paths]);
                        setPaths([]);
                    }
                }
            ]
        );
    }

    function formatText(command: string, value: string | null = null) {
        const script = `
            document.execCommand('${command}', false, ${value ? `'${value}'` : null});
        `;
        webViewRef.current?.injectJavaScript(script);
    }

    // --- Render Helpers ---

    const renderColorPalette = (selectedColor: string, onSelect: (color: string) => void) => (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paletteContainer}>
            {COLORS.map((color) => (
                <TouchableOpacity
                    key={color}
                    onPress={() => onSelect(color)}
                    style={[
                        styles.colorSwatch,
                        { backgroundColor: color },
                        selectedColor === color && styles.selectedSwatch
                    ]}
                />
            ))}
        </ScrollView>
    );

    // Memoize WebView source to prevent reload on re-render
    const webViewSource = useMemo(() => ({
        html: `
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <style>
                    body { 
                        font-family: 'Courier New', Courier, monospace; 
                        font-size: 16px; 
                        padding: 20px; 
                        color: #000000; 
                        background-color: #FFFFFF;
                        text-align: center; /* Default center alignment */
                    }
                    p { margin-bottom: 10px; }
                </style>
            </head>
            <body contenteditable="${mode === 'edit'}">
                ${initialHtml || 'Escribe tu guion aquí...'}
                <script>
                    document.body.addEventListener('input', function() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'content',
                            data: document.body.innerHTML
                        }));
                    });
                    
                    // Send scroll position
                    window.addEventListener('scroll', function() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'scroll',
                            data: window.scrollY
                        }));
                    });
                </script>
            </body>
            </html>
        `
    }), [initialHtml, mode]);

    // Capture View Ref
    const captureViewRef = useRef<View>(null);

    async function handleSaveAnnotations() {
        if (saving) return;
        setSaving(true);

        try {
            // Capture the full drawing layer
            const uri = await captureRef(captureViewRef, {
                format: 'png',
                quality: 0.8,
                result: 'base64' // Get base64 directly
            });

            const base64 = `data:image/png;base64,${uri}`;

            // Save to database
            const { error: updateError } = await supabase
                .from('scripts')
                .update({
                    script_draw_layer: base64,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id);

            if (updateError) throw updateError;

            setDrawingLayerImage(base64);
            // Clear current paths as they are now baked into the image
            setPaths([]);
            setHistory([]);
            setRedoStack([]);

            Alert.alert('Guardado', 'Anotaciones guardadas correctamente.');

        } catch (error: any) {
            console.error('Error saving annotations:', error);
            Alert.alert('Error', 'No se pudieron guardar las anotaciones: ' + error.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
            {/* Off-screen Capture View for Full Document PNG */}
            <View
                ref={captureViewRef}
                collapsable={false}
                style={{
                    position: 'absolute',
                    left: -10000, // Move off-screen
                    top: 0,
                    width: '100%', // Assuming width matches screen width roughly
                    height: contentHeight || 1000, // Full document height
                    backgroundColor: 'transparent',
                }}
            >
                <Svg height="100%" width="100%">
                    {/* Render existing image layer */}
                    {drawingLayerImage && (
                        <SvgImage
                            href={drawingLayerImage}
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            preserveAspectRatio="xMidYMin slice"
                        />
                    )}
                    {/* Render current paths (without scroll translation as this is full height) */}
                    {paths.map((p, i) => (
                        <Path
                            key={i}
                            d={typeof p === 'string' ? p : p.d}
                            stroke={typeof p === 'string' ? 'red' : p.color}
                            strokeWidth={typeof p === 'string' ? 2 : p.width}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ))}
                </Svg>
            </View>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Main Header */}
            <View style={[styles.header, { borderBottomColor: '#E0E0E0' }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#000000" />
                </TouchableOpacity>

                <View style={styles.headerControls}>
                    <TouchableOpacity onPress={handleUndo} style={styles.iconButton}>
                        <Undo size={20} color="#000000" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleRedo} style={styles.iconButton}>
                        <Redo size={20} color="#000000" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setMode(mode === 'edit' ? 'view' : 'edit')}
                        style={[styles.iconButton, mode === 'edit' && styles.activeModeButton]}
                    >
                        <Type size={24} color={mode === 'edit' ? colors.primary : "#000000"} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setMode(mode === 'draw' ? 'view' : 'draw')}
                        style={[styles.iconButton, mode === 'draw' ? styles.activeModeButton : null]}
                    >
                        <PenTool size={24} color={mode === 'draw' ? colors.primary : "#000000"} />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={handleSave} style={[styles.saveButton, { backgroundColor: colors.primary }]} disabled={saving}>
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

            {/* Secondary Toolbar (Format / Draw) */}
            {mode !== 'view' && (
                <View style={styles.toolbar}>
                    {mode === 'edit' && (
                        <View style={styles.toolsContainer}>
                            <View style={styles.formatGroup}>
                                <TouchableOpacity
                                    onPress={() => { setIsBold(!isBold); formatText('bold'); }}
                                    style={[styles.formatButton, isBold && styles.activeFormatButton]}
                                >
                                    <Bold size={20} color={isBold ? colors.primary : "#000000"} strokeWidth={3} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => { setIsItalic(!isItalic); formatText('italic'); }}
                                    style={[styles.formatButton, isItalic && styles.activeFormatButton]}
                                >
                                    <Italic size={20} color={isItalic ? colors.primary : "#000000"} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => { setIsUnderline(!isUnderline); formatText('underline'); }}
                                    style={[styles.formatButton, isUnderline && styles.activeFormatButton]}
                                >
                                    <Underline size={20} color={isUnderline ? colors.primary : "#000000"} />
                                </TouchableOpacity>

                                <View style={styles.separatorVertical} />

                                <TouchableOpacity
                                    onPress={() => { setTextAlign('left'); formatText('justifyLeft'); }}
                                    style={[styles.formatButton, textAlign === 'left' && styles.activeFormatButton]}
                                >
                                    <AlignLeft size={20} color={textAlign === 'left' ? colors.primary : "#000000"} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => { setTextAlign('center'); formatText('justifyCenter'); }}
                                    style={[styles.formatButton, textAlign === 'center' && styles.activeFormatButton]}
                                >
                                    <AlignCenter size={20} color={textAlign === 'center' ? colors.primary : "#000000"} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => { setTextAlign('right'); formatText('justifyRight'); }}
                                    style={[styles.formatButton, textAlign === 'right' && styles.activeFormatButton]}
                                >
                                    <AlignRight size={20} color={textAlign === 'right' ? colors.primary : "#000000"} />
                                </TouchableOpacity>

                                <View style={styles.separatorVertical} />

                                {/* Font Size Picker */}
                                <View style={styles.fontSizePicker}>
                                    <Text style={styles.fontSizeLabel}>Tamaño:</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                                        {['12px', '14px', '16px', '18px', '20px', '24px'].map((size) => (
                                            <TouchableOpacity
                                                key={size}
                                                onPress={() => { setFontSize(size); formatText('fontSize', size.replace('px', '')); }}
                                                style={[
                                                    styles.fontSizeButton,
                                                    fontSize === size && styles.activeFontSizeButton
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.fontSizeButtonText,
                                                    fontSize === size && { color: colors.primary, fontWeight: 'bold' }
                                                ]}>{size}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            </View>
                            <View style={styles.separator} />
                            {renderColorPalette(textColor, (color) => {
                                setTextColor(color);
                                formatText('foreColor', color);
                            })}
                        </View>
                    )}

                    {mode === 'draw' && (
                        <View style={styles.toolsContainer}>
                            <View style={styles.sliderContainer}>
                                <Text style={styles.label}>Grosor: {strokeWidth}</Text>
                                <Slider
                                    style={{ width: 150, height: 40 }}
                                    minimumValue={1}
                                    maximumValue={10}
                                    step={1}
                                    value={strokeWidth}
                                    onValueChange={setStrokeWidth}
                                    minimumTrackTintColor={colors.primary}
                                    maximumTrackTintColor="#000000"
                                />
                            </View>
                            <View style={styles.separator} />
                            {renderColorPalette(strokeColor, setStrokeColor)}
                            <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                                <Trash2 size={20} color="#FF0000" />
                            </TouchableOpacity>

                            {/* Save Annotations Button */}
                            <TouchableOpacity
                                onPress={handleSaveAnnotations}
                                style={[styles.saveButton, { backgroundColor: '#10B981', marginLeft: 'auto' }]}
                            >
                                <Save size={16} color="#FFFFFF" />
                                <Text style={styles.saveText}>Guardar</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

            {/* Content Area */}
            <View style={styles.content}>
                {loading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
                ) : (
                    <>
                        <View style={[styles.webviewContainer, { pointerEvents: mode === 'draw' ? 'none' : 'auto' }]}>
                            <WebView
                                ref={webViewRef}
                                originWhitelist={['*']}
                                source={webViewSource}
                                style={[styles.webview, { backgroundColor: '#FFFFFF' }]}
                                onMessage={(event) => {
                                    try {
                                        const message = JSON.parse(event.nativeEvent.data);
                                        if (message.type === 'content') {
                                            htmlContentRef.current = message.data;
                                        } else if (message.type === 'scroll') {
                                            setScrollY(message.data);
                                        } else if (message.type === 'height') {
                                            setContentHeight(message.data);
                                        }
                                    } catch {
                                        // Fallback for non-JSON messages
                                        htmlContentRef.current = event.nativeEvent.data;
                                    }
                                }}
                                // Disable zoom completely
                                scalesPageToFit={false}
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
                                // Prevent zoom gestures
                                injectedJavaScript={`
                                    const meta = document.createElement('meta');
                                    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
                                    meta.setAttribute('name', 'viewport');
                                    document.getElementsByTagName('head')[0].appendChild(meta);
                                    
                                    // Prevent pinch zoom
                                    document.addEventListener('gesturestart', function(e) {
                                        e.preventDefault();
                                    });
                                    document.addEventListener('gesturechange', function(e) {
                                        e.preventDefault();
                                    });
                                    document.addEventListener('gestureend', function(e) {
                                        e.preventDefault();
                                    });
                                    true;
                                `}
                            />
                        </View>

                        <View
                            style={[styles.drawingLayer, { pointerEvents: mode === 'draw' ? 'auto' : 'none', zIndex: 10 }]}
                            {...panResponderRef.panHandlers}
                        >
                            <Svg height="100%" width="100%">
                                <G transform={`translate(0, -${scrollY})`}>
                                    {/* Render saved PNG layer if exists */}
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

                                    {paths.map((p, i) => (
                                        <Path
                                            key={i}
                                            d={typeof p === 'string' ? p : p.d}
                                            stroke={typeof p === 'string' ? 'red' : p.color}
                                            strokeWidth={typeof p === 'string' ? 2 : p.width}
                                            fill="none"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    ))}
                                    {currentPath ? (
                                        <Path
                                            d={currentPath}
                                            stroke={strokeColor}
                                            strokeWidth={strokeWidth}
                                            fill="none"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    ) : null}
                                </G>
                            </Svg>
                        </View>
                    </>
                )}
            </View>
        </SafeAreaView>
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        backgroundColor: '#FFFFFF',
    },
    backButton: {
        padding: 4,
    },
    headerControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    iconButton: {
        padding: 8,
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    saveText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
    secondaryToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#F5F5F5',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    modeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 8,
        marginRight: 16,
        gap: 6,
    },
    activeModeButton: {
        backgroundColor: '#E8F0FE',
    },
    modeText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#666666',
    },
    expandButton: {
        marginLeft: 'auto',
        padding: 8,
    },
    tertiaryToolbar: {
        padding: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    toolbar: {
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    toolsContainer: {
        padding: 12,
        gap: 12,
    },
    formatGroup: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 8,
        alignItems: 'center',
    },
    sliderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    label: {
        fontSize: 14,
        color: '#000000',
        fontWeight: '500',
    },
    clearButton: {
        padding: 8,
        backgroundColor: '#FFF0F0',
        borderRadius: 4,
        marginLeft: 'auto',
    },
    formatButton: {
        padding: 8,
        backgroundColor: '#F5F5F5',
        borderRadius: 4,
    },
    activeFormatButton: {
        backgroundColor: '#E8F0FE',
        borderColor: '#007AFF',
        borderWidth: 1,
    },
    separator: {
        height: 1,
        backgroundColor: '#E0E0E0',
        marginVertical: 4,
    },
    separatorVertical: {
        width: 1,
        height: 24,
        backgroundColor: '#E0E0E0',
        marginHorizontal: 4,
    },
    paletteContainer: {
        flexDirection: 'row',
        paddingVertical: 4,
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
    fontSizePicker: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    fontSizeLabel: {
        fontSize: 12,
        color: '#666666',
        fontWeight: '500',
    },
    fontSizeButton: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#F5F5F5',
        borderRadius: 4,
        marginRight: 6,
    },
    activeFontSizeButton: {
        backgroundColor: '#E8F0FE',
        borderColor: '#007AFF',
        borderWidth: 1,
    },
    fontSizeButtonText: {
        fontSize: 12,
        color: '#000000',
    },
    content: {
        flex: 1,
        position: 'relative',
    },
    webviewContainer: {
        flex: 1,
    },
    webview: {
        flex: 1,
    },
    drawingLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
    },
});
