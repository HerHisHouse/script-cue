import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, Platform, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { X, FileText, Image as ImageIcon, Check } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';

export interface ExportOptions {
    format: 'pdf' | 'image';
    fileName: string;
    pageFrom: number;
    pageTo: number;
    includeAnnotations: boolean;
}

interface ExportOptionsSheetProps {
    scriptTitle: string;
    totalPages: number;
    hasAnnotations: boolean;
    exporting: boolean;
    onClose: () => void;
    onExport: (options: ExportOptions) => void | Promise<void>;
}

// Hoja de opciones de exportar, al estilo Freenotes: formato, nombre de
// archivo, rango de páginas e incluir anotaciones. "Imagen" solo admite una
// página suelta (ver editor.tsx: no es viable capturar una página completa
// con texto como imagen en iOS — el formato Imagen exporta solo el trazo a
// mano de esa página, con fondo transparente).
export default function ExportOptionsSheet({
    scriptTitle,
    totalPages,
    hasAnnotations,
    exporting,
    onClose,
    onExport,
}: ExportOptionsSheetProps) {
    const { colors, isDark } = useTheme();
    const [format, setFormat] = useState<'pdf' | 'image'>('pdf');
    const [fileName, setFileName] = useState(scriptTitle || 'Guion');
    const [pageFromText, setPageFromText] = useState('1');
    const [pageToText, setPageToText] = useState(String(totalPages));
    const [includeAnnotations, setIncludeAnnotations] = useState(hasAnnotations);

    const onBg = isDark ? '#ffffff' : '#2a2447';
    const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
    const cardBorder = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)';
    // Más opaco que el resto de menús flotantes del editor: aquí detrás no hay
    // el fondo morado con degradado de la pantalla, sino la página del guion en
    // blanco — con la misma opacidad que los demás menús, el blanco se colaba y
    // apenas se distinguían los botones.
    const popupOverlayTint = isDark ? 'rgba(20,16,32,0.82)' : 'rgba(235,230,245,0.92)';
    const chipInactiveBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(104,58,121,0.08)';
    const chipActiveBg = isDark ? 'rgba(124,106,247,0.30)' : 'rgba(104,58,121,0.15)';
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)';
    // colors.primary en modo oscuro es un morado apagado, casi del mismo tono
    // que chipActiveBg — el icono/texto activo quedaba casi invisible encima.
    const activeAccent = isDark ? '#FFFFFF' : colors.primary;
    // Mismo tratamiento que el botón "Guardar" del header del editor: en modo
    // oscuro, relleno morado translúcido con borde blanco en vez de un morado
    // apagado sólido.
    const primaryButtonBg = isDark
        ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
        : { backgroundColor: colors.primary };

    function clampPage(value: number) {
        return Math.min(Math.max(1, value), totalPages);
    }

    function handleFormatChange(next: 'pdf' | 'image') {
        setFormat(next);
        if (next === 'image') {
            // Alcance mínimo: una sola página suelta como imagen.
            setPageToText(pageFromText);
        }
    }

    function handlePageFromChange(text: string) {
        setPageFromText(text.replace(/[^0-9]/g, ''));
    }

    function handlePageToChange(text: string) {
        setPageToText(text.replace(/[^0-9]/g, ''));
    }

    function handleExportPress() {
        if (exporting) return;
        const from = clampPage(parseInt(pageFromText, 10) || 1);
        const toRaw = format === 'image' ? from : (parseInt(pageToText, 10) || totalPages);
        const to = Math.max(from, clampPage(toRaw));
        onExport({
            format,
            fileName: fileName.trim() || scriptTitle || 'Guion',
            pageFrom: from,
            pageTo: to,
            // "Imagen" exporta EXCLUSIVAMENTE el trazo a mano (ver editor.tsx) — el
            // interruptor "incluir anotaciones" ni se muestra en ese formato, así
            // que su último valor (heredado de cuando el formato era PDF) no debe
            // decidir si hay algo que exportar.
            includeAnnotations: format === 'image' ? true : includeAnnotations,
        });
    }

    return (
        <View style={[StyleSheet.absoluteFill, styles.root]}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.sheetWrapper}
                pointerEvents="box-none"
            >
                <View style={[styles.sheetClip, { borderColor: cardBorder }]}>
                    <BlurView intensity={isDark ? 85 : 90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: popupOverlayTint }]} />
                    <SafeAreaView edges={['bottom']}>
                        {/* Toca fuera de un campo de texto para cerrar el teclado sin cerrar
                            la hoja entera — "number-pad" no trae tecla de retorno en iOS, así
                            que sin esto no había ninguna forma de quitar el teclado tras
                            escribir un número. */}
                        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                            <View>
                                <View style={styles.sheetHeader}>
                                    <Text style={[styles.sheetTitle, { color: onBg }]}>Exportar guion</Text>
                                    <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: chipInactiveBg }]}>
                                        <X size={18} color={onBg} />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.section}>
                                    <Text style={[styles.label, { color: onBg2 }]}>Formato</Text>
                                    <View style={styles.segmented}>
                                        <TouchableOpacity
                                            onPress={() => handleFormatChange('pdf')}
                                            style={[styles.segmentOption, { backgroundColor: format === 'pdf' ? chipActiveBg : chipInactiveBg }, format === 'pdf' && { borderColor: colors.primary, borderWidth: 1 }]}
                                        >
                                            <FileText size={16} color={format === 'pdf' ? activeAccent : onBg} />
                                            <Text style={[styles.segmentText, { color: format === 'pdf' ? activeAccent : onBg }]}>PDF</Text>
                                            <Text style={[styles.segmentCaption, { color: format === 'pdf' ? activeAccent : onBg2 }]}>(formato estándar)</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleFormatChange('image')}
                                            style={[styles.segmentOption, { backgroundColor: format === 'image' ? chipActiveBg : chipInactiveBg }, format === 'image' && { borderColor: colors.primary, borderWidth: 1 }]}
                                        >
                                            <ImageIcon size={16} color={format === 'image' ? activeAccent : onBg} />
                                            <Text style={[styles.segmentText, styles.segmentTextCentered, { color: format === 'image' ? activeAccent : onBg }]}>Imagen</Text>
                                            <Text style={[styles.segmentCaption, { color: format === 'image' ? activeAccent : onBg2 }]}>(solo anotaciones)</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={[styles.label, { color: onBg2 }]}>Nombre del archivo</Text>
                                    <TextInput
                                        value={fileName}
                                        onChangeText={setFileName}
                                        style={[styles.textInput, { backgroundColor: inputBg, color: onBg, borderColor: cardBorder }]}
                                        placeholder="Guion"
                                        placeholderTextColor={onBg2}
                                        returnKeyType="done"
                                        onSubmitEditing={Keyboard.dismiss}
                                    />
                                </View>

                                <View style={styles.section}>
                                    <Text style={[styles.label, { color: onBg2 }]}>
                                        {format === 'image' ? 'Página' : `Rango de páginas (1–${totalPages})`}
                                    </Text>
                                    <View style={styles.rangeRow}>
                                        <TextInput
                                            value={pageFromText}
                                            onChangeText={handlePageFromChange}
                                            keyboardType="number-pad"
                                            returnKeyType="done"
                                            onSubmitEditing={Keyboard.dismiss}
                                            style={[styles.pageInput, { backgroundColor: inputBg, color: onBg, borderColor: cardBorder }]}
                                        />
                                        {format === 'pdf' && (
                                            <>
                                                <Text style={[styles.rangeSeparator, { color: onBg2 }]}>a</Text>
                                                <TextInput
                                                    value={pageToText}
                                                    onChangeText={handlePageToChange}
                                                    keyboardType="number-pad"
                                                    returnKeyType="done"
                                                    onSubmitEditing={Keyboard.dismiss}
                                                    style={[styles.pageInput, { backgroundColor: inputBg, color: onBg, borderColor: cardBorder }]}
                                                />
                                            </>
                                        )}
                                    </View>
                                </View>

                                {format === 'pdf' && (
                                    <View style={[styles.section, styles.switchRow]}>
                                        <Text style={[styles.label, { color: onBg2, marginBottom: 0 }]}>Incluir anotaciones</Text>
                                        <Switch
                                            value={includeAnnotations}
                                            onValueChange={setIncludeAnnotations}
                                            trackColor={{ false: isDark ? '#374151' : '#9CA3AF', true: colors.primary }}
                                            thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
                                            ios_backgroundColor={isDark ? '#374151' : '#9CA3AF'}
                                        />
                                    </View>
                                )}

                                <TouchableOpacity
                                    onPress={() => { Keyboard.dismiss(); handleExportPress(); }}
                                    disabled={exporting}
                                    style={[styles.exportButton, primaryButtonBg, { opacity: exporting ? 0.6 : 1 }]}
                                >
                                    <Check size={18} color="#FFFFFF" />
                                    <Text style={styles.exportButtonText}>{exporting ? 'Exportando…' : 'Exportar'}</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
                    </SafeAreaView>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        // Por encima de la barra flotante inferior del editor (zIndex 200) y de
        // la superposición "Ver y marcar" (zIndex 1000) — sin esto, el botón
        // "Exportar" quedaba tapado detrás de la tapbar y no se podía pulsar.
        zIndex: 2000,
        elevation: Platform.OS === 'android' ? 2000 : undefined,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheetWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
    },
    sheetClip: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderBottomWidth: 0,
        overflow: 'hidden',
        paddingHorizontal: rp(20),
        paddingTop: rp(16),
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: rp(16),
    },
    sheetTitle: {
        fontSize: rf(17),
        fontWeight: '700',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    section: {
        marginBottom: rp(16),
    },
    label: {
        fontSize: rf(13),
        fontWeight: '600',
        marginBottom: rp(8),
    },
    segmented: {
        flexDirection: 'row',
        gap: 10,
    },
    segmentOption: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: rp(10),
        paddingHorizontal: rp(8),
        borderRadius: 12,
    },
    segmentText: {
        fontSize: rf(13),
        fontWeight: '600',
    },
    segmentTextCentered: {
        textAlign: 'center',
    },
    segmentCaption: {
        fontSize: rf(11),
        fontWeight: '500',
        textAlign: 'center',
    },
    textInput: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: rp(12),
        paddingVertical: rp(10),
        fontSize: rf(14),
    },
    rangeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    pageInput: {
        width: 64,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: rp(10),
        paddingVertical: rp(10),
        fontSize: rf(14),
        textAlign: 'center',
    },
    rangeSeparator: {
        fontSize: rf(14),
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 16,
        paddingVertical: rp(14),
        marginTop: rp(4),
        marginBottom: rp(12),
    },
    exportButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: rf(15),
    },
});
