import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, ChevronUp, Mail } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';

interface FAQ {
    question: string;
    answer: string;
    category: string;
}

const faqs: FAQ[] = [
    {
        category: 'General',
        question: '¿Qué es Script Cue?',
        answer: 'Script Cue es una aplicación diseñada para actores y actrices que te ayuda a memorizar y practicar tus guiones de manera efectiva. Ofrece múltiples modos de estudio, de memorización, grabación de selftape con la réplica por IA, análisis de personajes, escenas y mucho más.',
    },
    {
        category: 'General',
        question: '¿Cómo importo un guión?',
        answer: 'Puedes importar guiones de dos formas:\n\n1. Importar PDF: Toca el botón "+" en la pantalla "Mis guiones" y selecciona "Importar guion". Elige un archivo PDF de tu dispositivo.\n\n2. Escanear: Usa la cámara para escanear páginas de guiones físicos, o sube imágenes desde la galería de tu terminal. La app convertirá el texto automáticamente.',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Estudio?',
        answer: 'El Modo Estudio es perfecto para memorizar tus líneas. La IA lee las líneas de los otros personajes mientras tú practicas las tuyas. Puedes:\n\n• Escuchar las líneas de la IA\n• Grabar tus propias líneas\n• Practicar con reconocimiento de voz\n• Editar guion: Un completo editor de texto que te permitirá revisar el guión completo, editar los diálogos, tomar notas y dibujos sobre el propio guión y guardar los cambios para poder consultarlos cuando lo necesites\n• Modo texto literal: Activa esta opción si quieres llevar tu memorización a otro nivel. Mientras practicas o grabas una sesión debes de decir tu texto literal sin poder variar ni añadir palabras, si lo haces la app te lo notificará\n• Crear nuevas tarjetas: Usa el botón "+" para añadir diálogos personalizados\n• Menú de tarjeta (...): Cada tarjeta tiene opciones para editar el diálogo y moverla arriba o abajo',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Casting?',
        answer: 'El Modo Casting te permite grabar video de tu actuación mientras la IA lee las líneas de los otros personajes. Es ideal para:\n\n• Crear self-tapes profesionales\n• Practicar audiciones\n• Revisar tu actuación\n\nEl video final incluye tanto tu actuación como el audio de la IA mezclado.\n\nPuedes configurar:\n• Duración de líneas: Ajusta cuánto tiempo aparece cada línea en pantalla antes de avanzar automáticamente\n• Líneas de acción: Crea líneas personalizadas con indicaciones de acción (ej: "*Se levanta y camina hacia la puerta*") que aparecerán durante la grabación',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Coach?',
        answer: 'El Modo Coach es tu entrenador personal de actuación. Después de practicar tus líneas, la IA te da feedback personalizado sobre:\n\n• Precisión del texto\n• Tono y emoción\n• Ritmo y timing\n• Sugerencias de mejora',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Coche?',
        answer: 'El Modo Coche está diseñado para practicar mientras conduces o haces otras actividades. Funciona completamente con voz:\n\n• Modo manos libres\n• La IA lee todas las líneas automáticamente\n• Reconocimiento de voz para tus líneas\n• Avance automático',
    },
    {
        category: 'Grabaciones',
        question: '¿Dónde se guardan mis grabaciones?',
        answer: 'Tus grabaciones se guardan en la pestaña "Grabaciones". Puedes:\n\n• Reproducir audio y video\n• Enviar los archivos a tus proyectos (esto mueve el archivo de la pestaña Grabaciones)\n• Compartir con otras personas\n• Eliminar las que no necesites\n\nPor defecto se sincronizan con la nube, pero puedes activar "Almacenamiento local" en Ajustes.',
    },
    {
        category: 'Grabaciones',
        question: '¿Cómo reproduzco un video de Modo Casting?',
        answer: 'Ve a la pestaña "Grabaciones", selecciona el video que grabaste en Modo Casting y tócalo para reproducirlo. El reproductor incluye:\n\n• Controles de play/pause\n• Barra de progreso\n• Control de volumen\n• Opciones de repetición\n• Compartir por Chromecast',
    },
    {
        category: 'Proyectos',
        question: '¿Qué son los proyectos?',
        answer: 'Los proyectos te ayudan a organizar tus guiones y grabaciones. Puedes:\n\n• Crear carpetas para diferentes producciones\n• Copiar guiones a proyectos\n• Copiar grabaciones a proyectos\n• Organizar todo tu trabajo\n\nCuando usas "Enviar a...", el archivo se copia a la carpeta de destino, manteniéndose también en su ubicación original.',
    },
    {
        category: 'Análisis',
        question: '¿Qué es el Modo Análisis?',
        answer: 'El Modo Análisis te ayuda a profundizar en tu rol usando 10 puntos clave de actuación:\n\n1. Objetivo del personaje\n2. Obstáculos\n3. Relaciones\n4. Contexto y circunstancias\n5. Subtexto\n6. Arco emocional\n7. Acciones físicas\n8. Voz y lenguaje\n9. Preparación y calentamiento\n10. Reflexión post-ensayo\n\nPuedes hacer análisis manual o usar IA para generar uno automáticamente.',
    },
    {
        category: 'Configuración',
        question: '¿Cómo cambio las voces de la IA?',
        answer: 'Script Cue ofrece múltiples opciones de voces para la IA:\n\n• Voces de OpenAI: Voces de alta calidad con entonación natural\n• Voces de ElevenLabs: Voces premium con mayor realismo y expresividad\n• Voces del sistema: Voces por defecto de tu dispositivo\n• Asignar voces a personajes: Puedes asignar voces específicas a cada personaje de tu guión',
    },
    {
        category: 'Configuración',
        question: '¿Qué es el almacenamiento local?',
        answer: 'El almacenamiento local guarda tus grabaciones solo en tu dispositivo, sin subirlas a la nube. Actívalo en Ajustes si:\n\n• Tienes conexión limitada\n• Prefieres privacidad total\n• Quieres ahorrar datos\n\nNota: Las grabaciones locales no se sincronizan entre dispositivos.',
    },
];

export default function FAQScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const categories = Array.from(new Set(faqs.map(faq => faq.category)));

    const toggleFAQ = (index: number) => {
        setExpandedIndex(expandedIndex === index ? null : index);
    };

    const handleEmailPress = () => {
        Linking.openURL('mailto:scriptcue@gmail.com');
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Preguntas Frecuentes</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
                {categories.map((category) => (
                    <View key={category} style={styles.categorySection}>
                        <Text style={[styles.categoryTitle, { color: colors.textSecondary }]}>{category}</Text>

                        {faqs
                            .filter(faq => faq.category === category)
                            .map((faq, index) => {
                                const globalIndex = faqs.indexOf(faq);
                                const isExpanded = expandedIndex === globalIndex;

                                return (
                                    <TouchableOpacity
                                        key={globalIndex}
                                        style={[
                                            styles.faqCard,
                                            { backgroundColor: colors.surface, borderColor: colors.border }
                                        ]}
                                        onPress={() => toggleFAQ(globalIndex)}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.faqHeader}>
                                            <Text style={[styles.faqQuestion, { color: colors.text }]}>
                                                {faq.question}
                                            </Text>
                                            {isExpanded ? (
                                                <ChevronUp size={20} color={colors.primary} />
                                            ) : (
                                                <ChevronDown size={20} color={colors.textSecondary} />
                                            )}
                                        </View>

                                        {isExpanded && (
                                            <View style={styles.faqAnswerContainer}>
                                                <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>
                                                    {faq.answer}
                                                </Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                    </View>
                ))}

                <View style={[styles.contactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.contactTitle, { color: colors.text }]}>
                        ¿No encuentras lo que buscas?
                    </Text>
                    <Text style={[styles.contactText, { color: colors.textSecondary }]}>
                        Si tienes más preguntas, no dudes en contactarnos:
                    </Text>

                    <TouchableOpacity
                        style={styles.emailButton}
                        onPress={handleEmailPress}
                        activeOpacity={0.7}
                    >
                        <Mail size={20} color={colors.primary} />
                        <Text style={[styles.emailText, { color: colors.primary }]}>
                            scriptcue@gmail.com
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.emailButton, { marginTop: rp(12) }]}
                        onPress={() => Linking.openURL('https://www.scriptcue.es')}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.emailText, { color: colors.primary }]}>
                            www.scriptcue.es
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
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
        paddingHorizontal: rp(20),
        paddingVertical: rp(16),
        borderBottomWidth: 1,
    },
    backButton: {
        padding: rp(4),
    },
    headerTitle: {
        fontSize: rf(18),
        fontWeight: '600',
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: rp(20),
        paddingBottom: rp(100),
    },
    categorySection: {
        marginBottom: rp(32),
    },
    categoryTitle: {
        fontSize: rf(14),
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: rp(12),
    },
    faqCard: {
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: rp(12),
        overflow: 'hidden',
    },
    faqHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: rp(16),
    },
    faqQuestion: {
        flex: 1,
        fontSize: rf(15),
        fontWeight: '600',
        marginRight: rp(12),
    },
    faqAnswerContainer: {
        paddingHorizontal: rp(16),
        paddingBottom: rp(16),
        paddingTop: 0,
    },
    faqAnswer: {
        fontSize: rf(14),
        lineHeight: rf(20),
    },
    contactCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: rp(20),
        marginTop: rp(20),
    },
    contactTitle: {
        fontSize: rf(16),
        fontWeight: '600',
        marginBottom: rp(8),
    },
    contactText: {
        fontSize: rf(14),
        lineHeight: rf(20),
        marginBottom: rp(16),
    },
    emailButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(8),
        paddingVertical: rp(8),
    },
    emailText: {
        fontSize: rf(15),
        fontWeight: '600',
    },
});
