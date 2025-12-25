import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, BookOpen } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';

export default function ChubbuckGuideScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    const steps = [
        {
            number: 1,
            title: 'Deseo del personaje',
            subtitle: '¿Qué quiere mi personaje en esta escena?',
            description: 'El deseo es el motor de la escena. Todo personaje quiere algo aquí y ahora.',
            details: [
                'No es una idea general ("ser feliz", "tener éxito"), sino algo concreto dentro de la escena: convencer, obtener información, evitar algo, provocar una reacción, protegerse, dominar, ser escuchado.',
            ],
            questions: [
                '¿Qué pasaría si no lo consigo?',
                '¿Por qué es tan importante ahora?',
            ],
            tip: 'Escríbelo en forma de acción: "Quiero que me crea", "Quiero que se quede", "Quiero salir ileso de esta conversación"',
        },
        {
            number: 2,
            title: 'Necesidad profunda',
            subtitle: '¿Qué necesidad emocional hay detrás de ese deseo?',
            description: 'Aquí entramos en el plano más íntimo del personaje.',
            details: [
                'El deseo visible suele esconder una necesidad más profunda: sentirse amado, no ser abandonado, sentirse valioso, tener control, evitar el dolor, sobrevivir emocionalmente.',
            ],
            questions: [
                '¿Qué herida toca esta escena?',
                '¿Qué miedo o carencia se activa?',
            ],
            tip: 'Esto te ayudará a cargar emocionalmente cada acción.',
        },
        {
            number: 3,
            title: 'Conflicto',
            subtitle: '¿Qué impide que el personaje consiga lo que quiere?',
            description: 'Sin conflicto no hay escena.',
            details: [
                'El conflicto puede ser externo: otra persona, una situación, una amenaza.',
                'O interno: duda, culpa, miedo, contradicción.',
            ],
            questions: [
                '¿Quién o qué se me opone?',
                '¿Qué riesgo corro si sigo adelante?',
                '¿Qué me frena por dentro?',
            ],
            tip: 'El conflicto define la tensión de la escena.',
        },
        {
            number: 4,
            title: 'Relación con el otro',
            subtitle: '¿Quién es el otro para mí en esta escena?',
            description: 'No hablas con "un personaje", hablas con alguien concreto: alguien que amas, que necesitas, que temes, que desprecias.',
            details: [],
            questions: [
                '¿Qué historia compartimos?',
                '¿Qué poder tiene sobre mí?',
                '¿Qué espero de él/ella ahora?',
            ],
            tip: 'Esto afecta directamente al tono, al ritmo y a la energía.',
        },
        {
            number: 5,
            title: 'Estado emocional inicial',
            subtitle: '¿Desde dónde entro en la escena?',
            description: 'La escena no empieza en la primera frase.',
            details: [
                'Tu personaje llega con: una emoción previa, una expectativa, una tensión acumulada.',
            ],
            questions: [
                '¿Qué acaba de pasar antes?',
                '¿Llego calmado, alterado, cansado, decidido?',
            ],
            tip: 'Este punto define el arranque emocional.',
        },
        {
            number: 6,
            title: 'Evolución durante la escena',
            subtitle: '¿Cómo cambia mi personaje a lo largo de la escena?',
            description: 'Una escena siempre transforma algo.',
            details: [],
            questions: [
                '¿Salgo igual que entro?',
                '¿Hay un momento donde algo se rompe, se revela o cambia?',
            ],
            tip: 'Identifica puntos de giro, momentos clave y cambios de intención. Esto evita interpretaciones planas.',
        },
        {
            number: 7,
            title: 'Acciones',
            subtitle: '¿Qué hago para conseguir lo que quiero?',
            description: 'Las emociones no se interpretan, se actúan.',
            details: [
                'Las acciones son verbos activos: presionar, manipular, seducir, atacar, proteger, suplicar, provocar.',
            ],
            questions: [
                '¿Qué hago línea a línea?',
                '¿Cambio de estrategia si no funciona?',
            ],
            tip: 'Las acciones dan vida y dinamismo al texto.',
        },
        {
            number: 8,
            title: 'Subtexto',
            subtitle: '¿Qué pienso o siento realmente mientras hablo?',
            description: 'El subtexto es lo que no se dice, pero se siente.',
            details: [],
            questions: [
                '¿Qué estoy ocultando?',
                '¿Qué no me atrevo a decir?',
                '¿Qué contradicción hay entre lo que digo y lo que siento?',
            ],
            tip: 'Aquí nace la verdad de la escena.',
        },
        {
            number: 9,
            title: 'Circunstancias',
            subtitle: '¿Qué contexto rodea esta escena?',
            description: 'Las circunstancias dan peso y credibilidad.',
            details: [
                'Incluyen: lugar, momento, situación social, hechos previos importantes.',
            ],
            questions: [
                '¿Dónde estamos?',
                '¿Qué consecuencias tiene esta escena?',
                '¿Qué está en juego realmente?',
            ],
            tip: 'Esto ancla la interpretación a la realidad del texto.',
        },
        {
            number: 10,
            title: 'Tema personal',
            subtitle: '¿Dónde conecta esta escena conmigo como actor/actriz?',
            description: 'Este punto no es psicológico, es artístico.',
            details: [],
            questions: [
                '¿Qué parte de mí entiende esta escena?',
                '¿Qué emoción o experiencia personal puedo usar?',
            ],
            tip: 'No es revivir el pasado, sino dar verdad.',
        },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Guía de Referencia</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {/* Título principal */}
                <View style={[styles.titleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <BookOpen size={40} color={colors.primary} style={{ marginBottom: 12 }} />
                    <Text style={[styles.mainTitle, { color: colors.text }]}>Análisis Actoral</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Esta guía te ayudará a comprender en profundidad tu escena y a construir una interpretación más consciente, orgánica y precisa. No se trata de encontrar "respuestas correctas", sino respuestas vivas que te sirvan para actuar.
                    </Text>
                </View>

                {/* Lista de pasos */}
                {steps.map((step) => (
                    <View key={step.number} style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.stepHeader}>
                            <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                                <Text style={styles.stepNumberText}>{step.number}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
                                {step.subtitle && (
                                    <Text style={[styles.stepSubtitle, { color: colors.primary }]}>{step.subtitle}</Text>
                                )}
                            </View>
                        </View>

                        <Text style={[styles.stepDescription, { color: colors.text }]}>
                            {step.description}
                        </Text>

                        {step.details.length > 0 && (
                            <View style={styles.detailsContainer}>
                                {step.details.map((detail, index) => (
                                    <View key={index} style={styles.detailRow}>
                                        <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
                                        <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                                            {detail}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {step.questions && step.questions.length > 0 && (
                            <View style={[styles.questionsContainer, { backgroundColor: colors.input, borderColor: colors.border }]}>
                                <Text style={[styles.questionsTitle, { color: colors.textSecondary }]}>
                                    👉 Pregúntate:
                                </Text>
                                {step.questions.map((question, index) => (
                                    <Text key={index} style={[styles.questionText, { color: colors.text }]}>
                                        • {question}
                                    </Text>
                                ))}
                            </View>
                        )}

                        {step.tip && (
                            <View style={[styles.tipContainer, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
                                <Text style={[styles.tipText, { color: colors.text }]}>
                                    💡 {step.tip}
                                </Text>
                            </View>
                        )}
                    </View>
                ))}

                {/* Cierre */}
                <View style={[styles.closingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.closingTitle, { color: colors.text }]}>
                        Cierre de la Guía
                    </Text>
                    <Text style={[styles.closingText, { color: colors.textSecondary }]}>
                        Este análisis no es un examen, es una herramienta de trabajo. Cuanta más honestidad y concreción haya, más útil será en el:
                    </Text>
                    <View style={styles.modesList}>
                        <Text style={[styles.modeItem, { color: colors.text }]}>• Modo Estudio</Text>
                        <Text style={[styles.modeItem, { color: colors.text }]}>• Modo Coach</Text>
                        <Text style={[styles.modeItem, { color: colors.text }]}>• Modo Memory</Text>
                        <Text style={[styles.modeItem, { color: colors.text }]}>• Grabaciones</Text>
                    </View>
                </View>

                <View style={{ height: 40 }} />
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
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        fontSize: rf(18),
        fontWeight: '600',
        textAlign: 'center',
        marginHorizontal: 8,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: rp(20),
    },
    titleCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: rp(24),
        alignItems: 'center',
        marginBottom: 24,
    },
    mainTitle: {
        fontSize: rf(24),
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: rf(14),
        lineHeight: 20,
        textAlign: 'center',
    },
    stepCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: rp(16),
        marginBottom: 16,
    },
    stepHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    stepNumber: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    stepNumberText: {
        fontSize: rf(16),
        fontWeight: '700',
        color: '#FFFFFF',
    },
    stepTitle: {
        fontSize: rf(18),
        fontWeight: '700',
        marginBottom: 4,
    },
    stepSubtitle: {
        fontSize: rf(14),
        fontWeight: '600',
        fontStyle: 'italic',
    },
    stepDescription: {
        fontSize: rf(14),
        lineHeight: 20,
        marginBottom: 8,
    },
    detailsContainer: {
        marginTop: 8,
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    bullet: {
        fontSize: rf(14),
        marginRight: 8,
        marginTop: 2,
    },
    detailText: {
        flex: 1,
        fontSize: rf(13),
        lineHeight: 18,
    },
    questionsContainer: {
        marginTop: 12,
        padding: rp(12),
        borderRadius: 8,
        borderWidth: 1,
    },
    questionsTitle: {
        fontSize: rf(13),
        fontWeight: '600',
        marginBottom: 8,
    },
    questionText: {
        fontSize: rf(13),
        marginBottom: 4,
        lineHeight: 18,
    },
    tipContainer: {
        marginTop: 12,
        padding: rp(12),
        borderRadius: 8,
        borderWidth: 1,
    },
    tipText: {
        fontSize: rf(13),
        lineHeight: 18,
        fontStyle: 'italic',
    },
    closingCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: rp(20),
        marginTop: 8,
    },
    closingTitle: {
        fontSize: rf(18),
        fontWeight: '700',
        marginBottom: 12,
    },
    closingText: {
        fontSize: rf(14),
        lineHeight: 20,
        marginBottom: 12,
    },
    modesList: {
        marginTop: 8,
    },
    modeItem: {
        fontSize: rf(14),
        marginBottom: 4,
    },
});
