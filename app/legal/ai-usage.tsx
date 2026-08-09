import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { X, Sparkles } from 'lucide-react-native';
import { rf, rp } from '@/utils/responsive';

export default function AIUsageScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <View style={styles.headerContent}>
                        <Sparkles size={24} color={colors.primary} />
                        <Text style={[styles.title, { color: colors.text }]}>Uso de ScriptCue</Text>
                    </View>
                    <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                        <X size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    <View style={[styles.banner, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
                        <Sparkles size={32} color={colors.primary} />
                        <Text style={[styles.bannerText, { color: colors.primary }]}>
                            Esta aplicación utiliza ScriptCue como herramienta creativa y educativa
                        </Text>
                    </View>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>¿Cómo usamos ScriptCue?</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Esta aplicación utiliza nuestros modelos para:{'\n\n'}
                        • Generar respuestas de personajes{'\n'}
                        • Analizar interpretaciones{'\n'}
                        • Transcribir texto{'\n'}
                        • Reformatear guiones{'\n'}
                        • Ofrecer retroalimentación personalizada
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Importante: Limitaciones de ScriptCue</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Los resultados generados por ScriptCue:{'\n\n'}
                        • <Text style={styles.bold}>Pueden contener imprecisiones</Text>{'\n'}
                        ScriptCue no es perfecto y puede cometer errores en sus análisis o sugerencias.{'\n\n'}
                        • <Text style={styles.bold}>No son consejos profesionales</Text>{'\n'}
                        Las recomendaciones de ScriptCue no sustituyen el asesoramiento de un coach, director o profesor de interpretación.{'\n\n'}
                        • <Text style={styles.bold}>Son una ayuda creativa y educativa</Text>{'\n'}
                        Utiliza ScriptCue como una herramienta complementaria para tu práctica, no como única fuente de aprendizaje.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Tu control sobre ScriptCue</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        • Todas las funciones de ScriptCue requieren tu acción explícita{'\n'}
                        • Puedes elegir cuándo y cómo usar las herramientas de ScriptCue{'\n'}
                        • Tus grabaciones nunca se usan para entrenar modelos externos{'\n'}
                        • Los análisis se realizan solo cuando tú lo solicitas
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Responsabilidad del usuario</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        El usuario acepta que:{'\n'}
                        • Verifica la precisión del contenido generado por ScriptCue antes de usarlo.{'\n'}
                        • ScriptCue puede:{'\n'}
                        {'  '}- Malinterpretar emociones en video/audio.{'\n'}
                        {'  '}- Generar sugerencias inadecuadas para géneros específicos.{'\n'}
                        {'  '}- Cometer errores de transcripción.{'\n\n'}
                        • El usuario es responsable de cualquier feedback incorrecto de ScriptCue que use en audiciones reales.{'\n\n'}
                        • Script Cue no será responsable de:{'\n'}
                        {'  '}- Pérdida de oportunidades por seguir recomendaciones de ScriptCue.{'\n'}
                        {'  '}- Crítica negativa de colegas basada en análisis de ScriptCue.{'\n'}
                        {'  '}- Daños emocionales derivados del feedback automático.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacidad y Seguridad</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        • Tus datos personales están protegidos{'\n'}
                        • No compartimos tu información con terceros{'\n'}
                        • Los análisis de ScriptCue se procesan de forma segura{'\n'}
                        • Conservas todos los derechos sobre tus grabaciones
                    </Text>

                    <View style={[styles.disclaimer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.disclaimerTitle, { color: colors.text }]}>Disclaimer</Text>
                        <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
                            Al usar las funciones de ScriptCue en esta aplicación, reconoces que entiendes sus limitaciones y que la usarás como una herramienta complementaria, no como sustituto del aprendizaje profesional.
                        </Text>
                    </View>

                    <Text style={[styles.contact, { color: colors.textSecondary }]}>
                        ¿Preguntas sobre el uso de ScriptCue?{'\n'}
                        Contacta con nosotros: info@scriptcue.es
                    </Text>
                </ScrollView>
            </SafeAreaView>
        </>
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
        paddingHorizontal: rp(20),
        paddingVertical: rp(16),
        borderBottomWidth: 1,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(12),
        flex: 1,
    },
    title: {
        fontSize: rf(18),
        fontWeight: '700',
    },
    closeButton: {
        padding: rp(8),
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: rp(20),
        paddingBottom: rp(40),
    },
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(16),
        padding: rp(20),
        borderRadius: 12,
        borderWidth: 2,
        marginBottom: rp(24),
    },
    bannerText: {
        flex: 1,
        fontSize: rf(16),
        fontWeight: '600',
        lineHeight: rp(22),
    },
    sectionTitle: {
        fontSize: rf(18),
        fontWeight: '700',
        marginTop: rp(24),
        marginBottom: rp(12),
    },
    paragraph: {
        fontSize: rf(15),
        lineHeight: rp(24),
        marginBottom: rp(16),
    },
    bold: {
        fontWeight: '700',
    },
    disclaimer: {
        padding: rp(20),
        borderRadius: 12,
        borderWidth: 1,
        marginTop: rp(24),
        marginBottom: rp(24),
    },
    disclaimerTitle: {
        fontSize: rf(16),
        fontWeight: '700',
        marginBottom: rp(8),
    },
    disclaimerText: {
        fontSize: rf(14),
        lineHeight: rp(20),
    },
    contact: {
        fontSize: rf(13),
        textAlign: 'center',
        fontStyle: 'italic',
    },
});
