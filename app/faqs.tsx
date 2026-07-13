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
        question: '¿Qué es ScriptCue?',
        answer: 'ScriptCue es una aplicación diseñada para actores y actrices que te ayuda a memorizar y practicar tus guiones de manera efectiva. Ofrece múltiples modos de estudio, de memorización, grabación de selftape con la réplica por IA, análisis de personajes, laboratorio escénico y mucho más.',
    },
    {
        category: 'General',
        question: '¿Cómo importo un guion?',
        answer: 'Puedes importar guiones de dos formas:\n\n1. Importar PDF o DOCX: Toca el botón "+" en la pantalla "Mis guiones" y selecciona "Importar guion". Elige un archivo PDF o DOCX de tu dispositivo.\n\n2. Escanear: Usa la cámara para escanear páginas de guiones físicos, o sube imágenes desde la galería de tu terminal. La app convertirá el texto automáticamente.',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Estudio?',
        answer: 'El Modo Estudio es perfecto para memorizar tus líneas. La IA lee las líneas de los otros personajes mientras tú practicas las tuyas. Puedes:\n\n• Escuchar las líneas de la IA\n• Grabar tus propias líneas\n• Practicar con reconocimiento de voz\n• Editar guion: Un completo editor de texto que te permitirá revisar el guion completo, editar los diálogos, tomar notas y dibujos sobre el propio guion y guardar los cambios\n• Modo texto literal: Activa esta opción si quieres llevar tu memorización a otro nivel. Mientras practicas o grabas una sesión debes de decir tu texto literal sin poder variar ni añadir palabras\n• Crear nuevas tarjetas: Usa el botón "+" para añadir diálogos personalizados\n• Menú de tarjeta (...): Cada tarjeta tiene opciones para editar el diálogo y moverla arriba o abajo\n• Ocultar mis líneas: permite al usuario que se oculten sólo las líneas de su tarjeta para practicar la memorización.\n• Acotaciones: Si el guion cuenta con acotaciones entre paréntesis como (gritando), (sin mirarle) o (llorando) esto se mostrará en las tarjetas de diálogos para dar más información sobre la escena. Estas acotaciones nunca serán leidas por la IA.\n• Acciones: Si el guion dispone de acciones, al activar esta opción se mostrarán tarjetas específicas en color morado narrando las acciones para una mayor comprensión de la escena.',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Casting?',
        answer: 'El Modo Casting te permite grabar video de tu actuación mientras la IA lee las líneas de los otros personajes. Es ideal para:\n\n• Crear self-tapes profesionales\n• Practicar audiciones\n• Revisar tu actuación\n\nEl video final incluye tanto tu actuación como el audio de la IA mezclado.\n\nPuedes configurar:\n\n• Duración de líneas: Ajusta cuánto tiempo aparece cada línea en pantalla antes de avanzar automáticamente\n• Líneas de acción: Crea líneas personalizadas con indicaciones de acción (ej: "*Se levanta y camina hacia la puerta*") que aparecerán durante la grabación para darle un timing más real a la escena.\n\nEl modo casting te muestra todo lo que va ocurriendo en la escena mediante un teleprompter. Al igual que en el modo estudio puedes activar:\n\n• Ocultar mis líneas\n• Ocultar/mostrar acciones\n• Ocultar/mostrar acotaciones\n• Ocultar/mostrar el teleprompter.\n\nSi necesitas fijar un tiempo extra cuando empieces la grabación para que la escena empiece más tarde, puedes configurar un temporizador que activará el comienzo de la lectura de líneas.\n\nTeleprompter libre: El modo casting cuenta con un apartado de teleprompter que no muestra ningún guion. Puedes escribir el texto que necesites y grabarte como con un teleprompter profesional. Puede venir bien para cuando te piden hacer presentaciones en la que tienes que contar varios temas, así lo puedes estructurar y no olvidarte de nada.',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Escena?',
        answer: 'El Modo Escena es un laboratorio creativo donde puedes explorar tu personaje desde nuevos ángulos. A partir de una grabación tuya, la IA propone ejercicios prácticos para investigar la escena de formas distintas. No es una evaluación: es una herramienta de exploración.',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Memoria?',
        answer: 'Memoriza tus líneas a través de juegos y desafíos para potenciar el aprendizaje. El sistema identifica tus puntos débiles y refuerza automáticamente las partes que necesitan más práctica.',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Coche?',
        answer: 'El Modo Coche está diseñado para practicar mientras conduces o haces otras actividades. Está preparado para reproducir la escena en bucle y esta estará interpretada exclusivamente por la IA, es decir, las líneas de tu personaje también las leerá la IA.\n\nPara ello en la pantalla de "Configurar voces" del modo coche te aparecerán tarjetas con los nombres de todos los personajes que salgan en esa escena y debes de elegir qué voz le asignas a cada personaje y luego pulsas el botón "EMPEZAR".\n\n• La app preparará todo el guion con las voces correspondientes.\n• Se reproduce en bucle por defecto.\n• Tiene una interfaz minimalista y con botones grandes para evitar distracciones al volante. Aconsejamos configurar las voces antes de empezar a conducir.\n• La secuencia seguirá sonando aunque bloquees el teléfono.\n• Si pulsas el menú de los (...) tines la opción "Descargar audio de escena". Esto generará un archivo de audio y lo guardará en la pantalla de Grabaciones. Lo que te permite reproducirlo también en el reproductor nativo de la app.',
    },
    {
        category: 'Modos de Estudio',
        question: '¿Qué es el Modo Análisis?',
        answer: 'El modo Análisis te permite profundizar en las necesidades de tu personaje en la escena en concreto a trabajar. Al entrar en el modo Análisis tienes 3 opciones:\n\n• Análisis manual: Esta opción te recarga una plantilla con 10 preguntas para profundizar en los deseos, necesidades o conflictos de tu personaje. Puedes rellenar las 10 preguntas para comprender mejor el guion.\n• Análisis asistido por IA: Esta opción envía a la IA la misma plantilla con 10 preguntas y esta analiza el guion y te da respuesta a cada una de ellas con lo que considera sobre tu personaje según la escena.\n• Análisis personalizado: Esta opción no recarga ninguna plantilla y te permite que te hagas las preguntas que consideres de manera personalizada. Esto te preparará para un conocimiento mucho más genuino de tu personaje.',
    },
    {
        category: 'Grabaciones',
        question: '¿Dónde se guardan mis grabaciones?',
        answer: 'Tus grabaciones se guardan en la pestaña "Grabaciones". Puedes:\n\n• Reproducir audio y video\n• Copiar los archivos a tus proyectos usando "Enviar a..." (el archivo se mantiene también en Grabaciones)\n• Compartir con otras personas\n• Eliminar las que no necesites\n• El reproductor se puede usar con el teléfono bloqueado.\n• Puedes modificar la velocidad de la reproducción\n• Si seleccionas en el menú "Offline" permite descargar el archivo a tu terminal para que lo puedas escuchar sin conexión a internet.\n• El menú en Grabaciones permite hacer búsquedas avanzadas por nombre, seleccionar múltiples archivos o cambiar la vista entre Lista/Cuadrícula.\n\nPor defecto se sincronizan con la nube, pero puedes activar "Almacenamiento local" en Ajustes.',
    },
    {
        category: 'Grabaciones',
        question: '¿Cómo reproduzco un video de Modo Casting?',
        answer: 'Ve a la pestaña "Grabaciones", selecciona el video que grabaste en Modo Casting y tócalo para reproducirlo. El reproductor incluye:\n\n• Controles de play/pause\n• Barra de progreso\n• Control de volumen\n• Opciones de repetición\n• Compartir por Chromecast',
    },
    {
        category: 'Proyectos',
        question: '¿Qué son los proyectos?',
        answer: 'Los proyectos te ayudan a organizar tus guiones y grabaciones. Puedes:\n\n• Crear carpetas para diferentes producciones\n• Se pueden crear carpetas dentro de carpetas.\n• Copiar guiones a proyectos\n• Copiar grabaciones a proyectos\n• Organizar todo tu trabajo\n\nCuando usas "Enviar a...", el archivo se copia a la carpeta de destino, manteniéndose también en su ubicación original.',
    },
    {
        category: 'Configuración',
        question: '¿Cómo cambio las voces de la IA?',
        answer: 'ScriptCue ofrece múltiples opciones de voces para la IA:\n\n• Voces del sistema: Voces por defecto de tu dispositivo (gratis)\n• Voces de Azure: Voces realistas de Microsoft Azure IA (Actualmente no son muy buenas en castellano)\n• Voces de OpenAI: Voces de calidad con entonación natural (premium)\n• Voces de ElevenLabs: Voces premium con mayor realismo y expresividad permite agregar emociones a las líneas agregando [] corchetes antes de la frase. (Premium)\n\nAsignar voces a personajes: Puedes asignar voces específicas de diferentes proveedores a cada personaje de un mismo guion.',
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
        Linking.openURL('mailto:info@scriptcue.es');
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
                            info@scriptcue.es
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
