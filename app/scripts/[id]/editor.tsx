import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, PanResponder, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ArrowLeft, Save, Edit3, PenTool, Undo, Redo, Type, Trash2, Bold, Italic, Underline, Strikethrough, Palette, ChevronDown, ChevronUp, AlignLeft, AlignCenter, AlignRight, Menu, ALargeSmall, Pencil, Eraser } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import Svg, { Path, G, Image as SvgImage } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system';
import Slider from '@react-native-community/slider';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { rf, rp } from '@/utils/responsive';

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
    const [isErasing, setIsErasing] = useState(false);

    // Rich Text State
    const [textColor, setTextColor] = useState('#000000');
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);
    const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
    const [fontSize, setFontSize] = useState('6px');

    // Dropdown Menu States
    const [showFormatMenu, setShowFormatMenu] = useState(false);
    const [showAlignMenu, setShowAlignMenu] = useState(false);
    const [showSizeMenu, setShowSizeMenu] = useState(false);
    const [showColorMenu, setShowColorMenu] = useState(false);

    // Drawing Mode Dropdown States
    const [showStrokeMenu, setShowStrokeMenu] = useState(false);
    const [showDrawColorMenu, setShowDrawColorMenu] = useState(false);

    // Scroll State for Drawing Sync
    const [scrollY, setScrollY] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);

    // Drawing Layer Image (PNG)
    const [drawingLayerImage, setDrawingLayerImage] = useState<string | null>(null);

    // Refs
    const webViewRef = useRef<WebView>(null);
    const drawingStateRef = useRef({ paths, history, redoStack, strokeColor, strokeWidth, scrollY, isErasing });
    const currentPathPoints = useRef<Array<{ x: number; y: number }>>([]);

    // Update ref when state changes
    useEffect(() => {
        drawingStateRef.current = { paths, history, redoStack, strokeColor, strokeWidth, scrollY, isErasing };
    }, [paths, history, redoStack, strokeColor, strokeWidth, scrollY, isErasing]);

    // PanResponder for Drawing
    const panResponderRef = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                const { locationX, locationY } = evt.nativeEvent;
                const { strokeColor, strokeWidth, scrollY, paths, history, isErasing } = drawingStateRef.current;

                // Use document coordinates (add scrollY)
                const touchPoint = { x: locationX, y: locationY + scrollY };

                // If erasing, check if we touched a path
                if (isErasing) {
                    // Find path that contains this point
                    const pathIndex = paths.findIndex(path => {
                        // Simple hit detection: check if touch is near any point in the path
                        const pathPoints = path.d.split(/[ML]/).filter(p => p.trim()).map(p => {
                            const [x, y] = p.trim().split(' ').map(Number);
                            return { x, y };
                        });

                        return pathPoints.some(p => {
                            const distance = Math.sqrt(Math.pow(p.x - touchPoint.x, 2) + Math.pow(p.y - touchPoint.y, 2));
                            return distance < (path.width + 10); // Hit tolerance
                        });
                    });

                    if (pathIndex !== -1) {
                        // Remove the touched path
                        const newPaths = paths.filter((_, i) => i !== pathIndex);
                        setHistory([...history, paths]);
                        setRedoStack([]);
                        setPaths(newPaths);
                    }
                } else {
                    // Normal drawing mode
                    const startPoint = touchPoint;
                    const newPath = {
                        d: `M ${startPoint.x} ${startPoint.y}`,
                        color: strokeColor,
                        width: strokeWidth,
                        points: [startPoint]
                    };
                    setCurrentPath(`M ${startPoint.x} ${startPoint.y}`);
                    currentPathPoints.current = [startPoint];
                }
            },
            onPanResponderMove: (evt) => {
                const { isErasing } = drawingStateRef.current;

                // Only draw if not erasing
                if (!isErasing) {
                    const { locationX, locationY } = evt.nativeEvent;
                    const { scrollY } = drawingStateRef.current;

                    // Use document coordinates (add scrollY)
                    const newPoint = { x: locationX, y: locationY + scrollY };
                    currentPathPoints.current.push(newPoint);

                    const pathData = currentPathPoints.current
                        .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
                        .join(' ');
                    setCurrentPath(pathData);
                }
            },
            onPanResponderRelease: () => {
                const { isErasing } = drawingStateRef.current;

                // Only save path if not erasing
                if (!isErasing) {
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
                }
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

            // Priority:
            // 1. script_html (contains full formatting with descriptions/action lines from OpenAI)
            // 2. Reconstruct from scenes/lines (dialogues only, for backward compatibility)
            // 3. Raw text fallback

            if (data.script_html) {
                // Use the full HTML from OpenAI which includes descriptions, action lines, etc.
                setInitialHtml(data.script_html);
                htmlContentRef.current = data.script_html;
            } else {
                // Try to reconstruct from scenes/lines (dialogues only)
                const reconstructed = await reconstructScriptFromData();

                if (reconstructed) {
                    setInitialHtml(reconstructed);
                    htmlContentRef.current = reconstructed;
                } else if (data.content) {
                    setInitialHtml(data.content);
                    htmlContentRef.current = data.content;
                } else if (data.script_raw || data.parsed_text) {
                    const rawText = data.script_raw || data.parsed_text;
                    const formattedHtml = parseScriptLocally(rawText, data.title);
                    setInitialHtml(formattedHtml);
                    htmlContentRef.current = formattedHtml;
                } else {
                    setInitialHtml('<p>No se encontró contenido.</p>');
                }
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
                    setPaths(parsedPaths);
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
        let html = `<div style="text-align: center; font-family: 'Courier New', Courier, monospace; padding: rp(20)px; max-width: 800px; margin: 0 auto;">`;

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

    async function reconstructScriptFromData(): Promise<string | null> {
        // Reconstruct script with professional screenplay formatting
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

            const { data: characters } = await supabase
                .from('characters')
                .select('*')
                .eq('script_id', id);

            if (!scenes || scenes.length === 0) {
                return null; // No scenes, use fallback
            }

            // Professional screenplay HTML format
            let html = `
            <div style="font-family: 'Courier New', Courier, monospace; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.4;">
                <!-- Title -->
                <h1 style="text-align: center; font-weight: bold; text-transform: uppercase; text-decoration: underline; font-size: 18px; margin-bottom: 40px;">
                    ${scriptData?.title || 'GUION'}
                </h1>
            `;

            scenes.forEach((scene, sceneIndex) => {
                // Scene Heading - LEFT aligned, bold, uppercase
                const sceneHeading = `${scene.type || 'INT.'} ${scene.location || 'LOCATION'} - ${scene.time || 'DAY'}`;
                html += `
                <p style="text-align: left; font-weight: bold; text-transform: uppercase; margin-top: 30px; margin-bottom: 15px; font-size: 14px;">
                    ${sceneIndex + 1}. ${sceneHeading}
                </p>
                `;

                // Scene Description - LEFT aligned
                if (scene.description) {
                    html += `
                    <p style="text-align: left; margin-bottom: 15px; font-size: 14px;">
                        ${scene.description}
                    </p>
                    `;
                }

                // Sort lines by order_index
                const sortedLines = scene.lines?.sort((a: any, b: any) => a.order_index - b.order_index) || [];

                sortedLines.forEach((line: any) => {
                    // Use character_name directly from the line, fallback to characters table
                    let charName = line.character_name;

                    if (!charName && line.character_id) {
                        const char = characters?.find(c => c.id === line.character_id);
                        charName = char?.name;
                    }

                    charName = charName?.toUpperCase() || 'PERSONAJE';

                    // Check if line is action/description (no character assigned or specific type)
                    if (line.type === 'action' || line.type === 'description' || !line.character_name) {
                        // Action/Description - LEFT aligned
                        html += `
                        <p style="text-align: left; margin-top: 10px; margin-bottom: 15px; font-size: 14px;">
                            ${line.content}
                        </p>
                        `;
                    } else {
                        // Character Name - CENTERED, bold, uppercase
                        html += `
                        <p style="text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 20px; margin-bottom: 0px; font-size: 14px;">
                            ${charName}
                        </p>
                        `;

                        // Parenthetical - CENTERED, in parentheses
                        if (line.parenthetical) {
                            html += `
                            <p style="text-align: center; margin-top: 0px; margin-bottom: 0px; font-size: 13px; font-style: italic;">
                                (${line.parenthetical})
                            </p>
                            `;
                        }

                        // Dialogue - CENTERED, max-width for readability
                        html += `
                        <p style="text-align: center; margin-top: 0px; margin-bottom: 15px; font-size: 14px; max-width: 70%; margin-left: auto; margin-right: auto;">
                            ${line.content}
                        </p>
                        `;
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
                        padding: rp(20)px; 
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

                    // Fix paste to always be plain text
                    document.addEventListener('paste', function(e) {
                        e.preventDefault();
                        var text = (e.originalEvent || e).clipboardData.getData('text/plain');
                        document.execCommand('insertText', false, text);
                    });

                    // Fix huge margin inheritance on Enter key
                    document.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            setTimeout(function() {
                                var selection = window.getSelection();
                                if (selection.rangeCount > 0) {
                                    var node = selection.focusNode;
                                    while (node && node.nodeName !== 'P' && node.nodeName !== 'DIV' && node !== document.body) {
                                        node = node.parentNode;
                                    }
                                    if (node && node !== document.body) {
                                        node.style.marginTop = '0px';
                                        node.style.marginBottom = '15px';
                                        node.style.fontWeight = 'normal';
                                        node.style.maxWidth = '80%';
                                        node.style.marginLeft = 'auto';
                                        node.style.marginRight = 'auto';
                                        node.style.fontSize = '14px';
                                    }
                                }
                            }, 10);
                        }
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
            // DON'T clear paths - keep them editable
            // setPaths([]);
            // setHistory([]);
            // setRedoStack([]);

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
                    {/* Render current paths only (no old image layer needed) */}
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
                        <Pencil size={24} color={mode === 'draw' ? colors.primary : "#000000"} />
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
                <>
                    {/* Overlay to close menus when clicking outside */}
                    {(showFormatMenu || showAlignMenu || showSizeMenu || showColorMenu || showStrokeMenu || showDrawColorMenu) && (
                        <TouchableOpacity
                            style={styles.menuOverlay}
                            activeOpacity={1}
                            onPress={() => {
                                setShowFormatMenu(false);
                                setShowAlignMenu(false);
                                setShowSizeMenu(false);
                                setShowColorMenu(false);
                                setShowStrokeMenu(false);
                                setShowDrawColorMenu(false);
                            }}
                        />
                    )}
                    <View style={styles.toolbar}>
                        {mode === 'edit' && (
                            <View style={styles.toolsContainer}>
                                <View style={styles.minimalToolbar}>
                                    {/* Format Button (Aa) - Text Styling */}
                                    <View style={styles.dropdownWrapper}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setShowFormatMenu(!showFormatMenu);
                                                setShowAlignMenu(false);
                                                setShowSizeMenu(false);
                                                setShowColorMenu(false);
                                            }}
                                            style={[styles.toolbarButton, showFormatMenu && styles.toolbarButtonActive]}
                                        >
                                            <Text style={[styles.toolbarButtonText, showFormatMenu && { color: colors.primary }]}>Aa</Text>
                                        </TouchableOpacity>
                                        {showFormatMenu && (
                                            <View style={[styles.dropdownMenu, { backgroundColor: '#FFFFFF', borderColor: '#E0E0E0' }]}>
                                                <TouchableOpacity
                                                    onPress={() => { setIsBold(!isBold); formatText('bold'); setShowFormatMenu(false); }}
                                                    style={[styles.dropdownItem, isBold && styles.dropdownItemActive]}
                                                >
                                                    <Bold size={18} color={isBold ? colors.primary : '#000000'} strokeWidth={3} />
                                                    <Text style={[styles.dropdownItemText, isBold && { color: colors.primary, fontWeight: 'bold' }]}>Negrita</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => { setIsItalic(!isItalic); formatText('italic'); setShowFormatMenu(false); }}
                                                    style={[styles.dropdownItem, isItalic && styles.dropdownItemActive]}
                                                >
                                                    <Italic size={18} color={isItalic ? colors.primary : '#000000'} />
                                                    <Text style={[styles.dropdownItemText, isItalic && { color: colors.primary, fontStyle: 'italic' }]}>Cursiva</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => { setIsUnderline(!isUnderline); formatText('underline'); setShowFormatMenu(false); }}
                                                    style={[styles.dropdownItem, isUnderline && styles.dropdownItemActive]}
                                                >
                                                    <Underline size={18} color={isUnderline ? colors.primary : '#000000'} />
                                                    <Text style={[styles.dropdownItemText, isUnderline && { color: colors.primary, textDecorationLine: 'underline' }]}>Subrayado</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => { setIsStrikethrough(!isStrikethrough); formatText('strikeThrough'); setShowFormatMenu(false); }}
                                                    style={[styles.dropdownItem, isStrikethrough && styles.dropdownItemActive]}
                                                >
                                                    <Strikethrough size={18} color={isStrikethrough ? colors.primary : '#000000'} />
                                                    <Text style={[styles.dropdownItemText, isStrikethrough && { color: colors.primary, textDecorationLine: 'line-through' }]}>Tachado</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>

                                    {/* Alignment Button (≡) */}
                                    <View style={styles.dropdownWrapper}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setShowAlignMenu(!showAlignMenu);
                                                setShowFormatMenu(false);
                                                setShowSizeMenu(false);
                                                setShowColorMenu(false);
                                            }}
                                            style={[styles.toolbarButton, showAlignMenu && styles.toolbarButtonActive]}
                                        >
                                            <Menu size={20} color={showAlignMenu ? colors.primary : '#000000'} />
                                        </TouchableOpacity>
                                        {showAlignMenu && (
                                            <View style={[styles.dropdownMenu, { backgroundColor: '#FFFFFF', borderColor: '#E0E0E0' }]}>
                                                <TouchableOpacity
                                                    onPress={() => { setTextAlign('left'); formatText('justifyLeft'); setShowAlignMenu(false); }}
                                                    style={[styles.dropdownItem, textAlign === 'left' && styles.dropdownItemActive]}
                                                >
                                                    <AlignLeft size={18} color={textAlign === 'left' ? colors.primary : '#000000'} />
                                                    <Text style={[styles.dropdownItemText, textAlign === 'left' && { color: colors.primary }]}>Izquierda</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => { setTextAlign('center'); formatText('justifyCenter'); setShowAlignMenu(false); }}
                                                    style={[styles.dropdownItem, textAlign === 'center' && styles.dropdownItemActive]}
                                                >
                                                    <AlignCenter size={18} color={textAlign === 'center' ? colors.primary : '#000000'} />
                                                    <Text style={[styles.dropdownItemText, textAlign === 'center' && { color: colors.primary }]}>Centrado</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => { setTextAlign('right'); formatText('justifyRight'); setShowAlignMenu(false); }}
                                                    style={[styles.dropdownItem, textAlign === 'right' && styles.dropdownItemActive]}
                                                >
                                                    <AlignRight size={18} color={textAlign === 'right' ? colors.primary : '#000000'} />
                                                    <Text style={[styles.dropdownItemText, textAlign === 'right' && { color: colors.primary }]}>Derecha</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>

                                    {/* Font Size Button (Tt) */}
                                    <View style={styles.dropdownWrapper}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setShowSizeMenu(!showSizeMenu);
                                                setShowFormatMenu(false);
                                                setShowAlignMenu(false);
                                                setShowColorMenu(false);
                                            }}
                                            style={[styles.toolbarButton, showSizeMenu && styles.toolbarButtonActive]}
                                        >
                                            <ALargeSmall size={20} color={showSizeMenu ? colors.primary : '#000000'} />
                                        </TouchableOpacity>
                                        {showSizeMenu && (
                                            <View style={[styles.dropdownMenu, { backgroundColor: '#FFFFFF', borderColor: '#E0E0E0' }]}>
                                                {['1px', '2px', '3px', '4px', '5px', '6px', '7px', '8px', '9px', '10px', '11px', '12px'].map((size) => (
                                                    <TouchableOpacity
                                                        key={size}
                                                        onPress={() => { setFontSize(size); formatText('fontSize', size.replace('px', '')); setShowSizeMenu(false); }}
                                                        style={[styles.dropdownItem, fontSize === size && styles.dropdownItemActive]}
                                                    >
                                                        <Text style={[styles.dropdownItemText, { fontSize: Math.max(10, parseInt(size)) }, fontSize === size && { color: colors.primary, fontWeight: 'bold' }]}>{size}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}
                                    </View>

                                    {/* Color Button */}
                                    <View style={styles.dropdownWrapper}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setShowColorMenu(!showColorMenu);
                                                setShowFormatMenu(false);
                                                setShowAlignMenu(false);
                                                setShowSizeMenu(false);
                                            }}
                                            style={[styles.toolbarButton, showColorMenu && styles.toolbarButtonActive]}
                                        >
                                            <Palette size={20} color={showColorMenu ? colors.primary : '#000000'} />
                                        </TouchableOpacity>
                                        {showColorMenu && (
                                            <View style={[styles.dropdownMenu, styles.colorDropdown, { backgroundColor: '#FFFFFF', borderColor: '#E0E0E0' }]}>
                                                <View style={styles.colorGrid}>
                                                    {COLORS.map((color) => (
                                                        <TouchableOpacity
                                                            key={color}
                                                            onPress={() => { setTextColor(color); formatText('foreColor', color); setShowColorMenu(false); }}
                                                            style={[
                                                                styles.colorButton,
                                                                { backgroundColor: color },
                                                                textColor === color && styles.colorButtonActive
                                                            ]}
                                                        />
                                                    ))}
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </View>
                        )}

                        {mode === 'draw' && (
                            <View style={styles.toolsContainer}>
                                <View style={styles.minimalToolbar}>
                                    {/* Stroke Width Button (Pencil with lines) */}
                                    <View style={styles.dropdownWrapper}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setShowStrokeMenu(!showStrokeMenu);
                                                setShowDrawColorMenu(false);
                                            }}
                                            style={[styles.toolbarButton, showStrokeMenu && styles.toolbarButtonActive]}
                                        >
                                            <Pencil size={20} color={showStrokeMenu ? colors.primary : '#000000'} />
                                        </TouchableOpacity>
                                        {showStrokeMenu && (
                                            <View style={[styles.dropdownMenu, { backgroundColor: '#FFFFFF', borderColor: '#E0E0E0' }]}>
                                                <TouchableOpacity
                                                    onPress={() => { setStrokeWidth(2); setShowStrokeMenu(false); }}
                                                    style={[styles.dropdownItem, strokeWidth === 2 && styles.dropdownItemActive]}
                                                >
                                                    <View style={{ width: 30, height: 2, backgroundColor: '#000000' }} />
                                                    <Text style={[styles.dropdownItemText, strokeWidth === 2 && { color: colors.primary }]}>Fino</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => { setStrokeWidth(5); setShowStrokeMenu(false); }}
                                                    style={[styles.dropdownItem, strokeWidth === 5 && styles.dropdownItemActive]}
                                                >
                                                    <View style={{ width: 30, height: 5, backgroundColor: '#000000', borderRadius: 2.5 }} />
                                                    <Text style={[styles.dropdownItemText, strokeWidth === 5 && { color: colors.primary }]}>Medio</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => { setStrokeWidth(10); setShowStrokeMenu(false); }}
                                                    style={[styles.dropdownItem, strokeWidth === 10 && styles.dropdownItemActive]}
                                                >
                                                    <View style={{ width: 30, height: 10, backgroundColor: '#000000', borderRadius: 5 }} />
                                                    <Text style={[styles.dropdownItemText, strokeWidth === 10 && { color: colors.primary }]}>Grueso</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>

                                    {/* Color Button */}
                                    <View style={styles.dropdownWrapper}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setShowDrawColorMenu(!showDrawColorMenu);
                                                setShowStrokeMenu(false);
                                            }}
                                            style={[styles.toolbarButton, showDrawColorMenu && styles.toolbarButtonActive]}
                                        >
                                            <Palette size={20} color={showDrawColorMenu ? colors.primary : '#000000'} />
                                        </TouchableOpacity>
                                        {showDrawColorMenu && (
                                            <View style={[styles.dropdownMenu, styles.colorDropdown, { backgroundColor: '#FFFFFF', borderColor: '#E0E0E0' }]}>
                                                <View style={styles.colorGrid}>
                                                    {COLORS.map((color) => (
                                                        <TouchableOpacity
                                                            key={color}
                                                            onPress={() => { setStrokeColor(color); setShowDrawColorMenu(false); }}
                                                            style={[
                                                                styles.colorButton,
                                                                { backgroundColor: color },
                                                                strokeColor === color && styles.colorButtonActive
                                                            ]}
                                                        />
                                                    ))}
                                                </View>
                                            </View>
                                        )}
                                    </View>

                                    {/* Eraser Button */}
                                    <TouchableOpacity
                                        onPress={() => {
                                            setIsErasing(!isErasing);
                                            setShowStrokeMenu(false);
                                            setShowDrawColorMenu(false);
                                        }}
                                        style={[styles.toolbarButton, isErasing && styles.toolbarButtonActive]}
                                    >
                                        <Eraser size={20} color={isErasing ? colors.primary : '#000000'} />
                                    </TouchableOpacity>

                                    {/* Trash Button */}
                                    <TouchableOpacity
                                        onPress={handleClear}
                                        style={[styles.toolbarButton, { backgroundColor: '#FFF0F0' }]}
                                    >
                                        <Trash2 size={20} color="#FF0000" />
                                    </TouchableOpacity>

                                    {/* Save Button */}
                                    <TouchableOpacity
                                        onPress={handleSaveAnnotations}
                                        style={[styles.toolbarButton, { backgroundColor: '#10B981' }]}
                                    >
                                        <Save size={20} color="#FFFFFF" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                </>
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
                                    {/* Render saved PNG layer if exists (hide in draw mode to allow editing) */}
                                    {drawingLayerImage && mode !== 'draw' && (
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
        paddingHorizontal: rp(16),
        paddingVertical: rp(12),
        borderBottomWidth: 1,
        backgroundColor: '#FFFFFF',
    },
    backButton: {
        padding: rp(4),
    },
    headerControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    iconButton: {
        padding: rp(8),
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
    secondaryToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rp(16),
        paddingVertical: rp(8),
        backgroundColor: '#F5F5F5',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    modeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: rp(8),
        borderRadius: 8,
        marginRight: 16,
        gap: 6,
    },
    activeModeButton: {
        backgroundColor: '#E8F0FE',
    },
    modeText: {
        fontSize: rf(14),
        fontWeight: '500',
        color: '#666666',
    },
    expandButton: {
        marginLeft: 'auto',
        padding: rp(8),
    },
    tertiaryToolbar: {
        padding: rp(12),
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
        padding: rp(12),
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
        fontSize: rf(14),
        color: '#000000',
        fontWeight: '500',
    },
    clearButton: {
        padding: rp(8),
        backgroundColor: '#FFF0F0',
        borderRadius: 4,
        marginLeft: 'auto',
    },
    formatButton: {
        padding: rp(8),
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
    fontSizePicker: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    fontSizeLabel: {
        fontSize: rf(12),
        color: '#666666',
        fontWeight: '500',
    },
    fontSizeButton: {
        paddingHorizontal: rp(10),
        paddingVertical: rp(6),
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
        fontSize: rf(12),
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
    // New Minimalist Toolbar Styles
    menuOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
    },
    minimalToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        paddingVertical: rp(4),
    },
    dropdownWrapper: {
        position: 'relative',
        zIndex: 100,
    },
    toolbarButton: {
        width: 44,
        height: 44,
        borderRadius: 8,
        backgroundColor: '#F5F5F5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    toolbarButtonActive: {
        backgroundColor: '#E8F0FE',
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    toolbarButtonText: {
        fontSize: rf(16),
        fontWeight: '600',
        color: '#000000',
    },
    dropdownMenu: {
        position: 'absolute',
        top: 50,
        left: 0,
        minWidth: 150,
        borderRadius: 12,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 8,
        paddingVertical: 8,
        zIndex: 1000,
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: rp(12),
        paddingHorizontal: rp(16),
    },
    dropdownItemActive: {
        backgroundColor: '#E8F0FE',
    },
    dropdownItemText: {
        fontSize: rf(14),
        color: '#000000',
    },
    colorDropdown: {
        left: '50%',
        marginLeft: -100,  // Half of width (200px / 2)
        width: 200,
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
        borderColor: '#E0E0E0',
    },
    colorButtonActive: {
        borderWidth: 3,
        borderColor: '#000000',
        transform: [{ scale: 1.1 }],
    },
});
