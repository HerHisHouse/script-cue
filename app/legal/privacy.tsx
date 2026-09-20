import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { X } from 'lucide-react-native';
import { rf, rp } from '@/utils/responsive';

export default function PrivacyScreen() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const onBg = isDark ? '#ffffff' : '#2a2447';
    const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
    const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(124,106,247,0.08)';
    const cardBorder = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(124,106,247,0.2)';

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <ImageBackground
                source={isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png')}
                resizeMode="cover"
                style={styles.container}
            >
            <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
                <View style={[styles.header, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
                    <Text style={[styles.title, { color: onBg }]}>Política de Privacidad</Text>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={[
                            styles.closeButton,
                            isDark
                                ? { backgroundColor: 'rgba(124,106,247,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
                                : { backgroundColor: colors.primary },
                        ]}
                    >
                        <X size={20} color={isDark ? onBg : '#FFFFFF'} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    <Text style={[styles.date, { color: onBg2 }]}>Última actualización: 20 de septiembre de 2026</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Esta Política de Privacidad describe cómo ScriptCue (“la Aplicación”, “nosotros”) recopila, utiliza y protege los datos personales del usuario (“tú”). Estos Términos y Condiciones y la Política de Privacidad se incorporan mutuamente por referencia y constituyen, en su conjunto, un único acuerdo contractual entre tú y ScriptCue.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>1. Responsable del Tratamiento</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        ScriptCue es un servicio operado por Alex Díaz, en calidad de responsable individual (autónomo).{'\n'}Email de contacto: info@scriptcue.es
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>2. Datos que recopilamos</Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>2.1 Datos proporcionados por el usuario</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        • Nombre o alias.{'\n'}
                        • Email.{'\n'}
                        • Guiones importados manualmente.{'\n'}
                        • Grabaciones de audio y vídeo.{'\n'}
                        • Carpetas y proyectos creados dentro de la app.{'\n'}
                        • Preferencias de uso (modo coche, modo escena, modo estudio, etc.).
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>2.2 Datos generados automáticamente</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        • Identificador interno de usuario.{'\n'}
                        • Historial de sesiones.{'\n'}
                        • Estadísticas de uso.{'\n'}
                        • Resultados de análisis generados por IA (si el usuario los solicita).
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>2.3 Datos sensibles</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Las grabaciones solo son procesadas bajo petición explícita del usuario y nunca se comparten ni utilizan para entrenar modelos externos.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>2.4 Datos de terceros en grabaciones</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Si el usuario graba a otros actores/actrices (diálogos en audiciones, ensayos con terceros), el usuario es responsable de:{'\n'}
                        • Obtener consentimiento explícito de otros participantes.{'\n'}• Informarles de que sus voces/imágenes se guardan en la app.{'\n'}• Cumplir normativas de protección de datos (RGPD, LOPDGDD, etc.).
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        ScriptCue no es responsable del uso indebido de grabaciones de terceros por parte del usuario.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>3. Finalidad del tratamiento</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Utilizamos los datos únicamente para:{'\n'}
                        • mostrar guiones, grabaciones y proyectos dentro de la app,{'\n'}• permitir las funciones de grabación,{'\n'}• realizar análisis mediante IA cuando el usuario lo solicita,{'\n'}• almacenar archivos en servidores externos (Supabase),{'\n'}• mejorar las funcionalidades internas de la aplicación,{'\n'}• permitir sincronización entre dispositivos (si está activada).
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        No vendemos, comercializamos ni cedemos datos a terceros.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>4. Base legal</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        El tratamiento de tus datos se basa en:{'\n'}
                        • La ejecución del contrato entre tú y ScriptCue, para prestarte las funciones básicas de la Aplicación (cuenta, almacenamiento de guiones y proyectos, sincronización).{'\n'}• Tu consentimiento explícito, para las funciones que implican grabación de audio/vídeo y análisis mediante inteligencia artificial, que siempre requieren una acción directa tuya.{'\n'}• El cumplimiento de obligaciones legales, cuando resulte aplicable.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>5. Almacenamiento de datos</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Los datos se almacenan en el dispositivo del usuario (modo local), o en servidores externos como Supabase (modo en la nube).
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Adoptamos medidas razonables de seguridad para evitar accesos no autorizados, aunque ningún sistema puede garantizar seguridad absoluta.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>5.1 Almacenamiento local</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        • Los archivos se guardan en la memoria del dispositivo.{'\n'}
                        • ScriptCue no tiene acceso al almacenamiento local.{'\n'}
                        • La responsabilidad de hacer copia de seguridad es del usuario.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>5.2 Almacenamiento remoto (Supabase)</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        • Se usa encriptación en tránsito (HTTPS/TLS).{'\n'}
                        • Los servidores están en la Unión Europea.{'\n'}
                        • Supabase tiene sus propias políticas de seguridad.{'\n'}
                        • En caso de vulneración, Supabase notificará a los usuarios afectados.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>5.3 Retención de datos borrados</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        • Los datos se marcan como eliminados inmediatamente.{'\n'}
                        • Las copias de seguridad pueden conservarlos 30 días más.{'\n'}
                        • Cumplimos el RGPD en la medida en que resulte aplicable.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>5.4 Transferencias internacionales</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Algunos de nuestros proveedores, en concreto los servicios de inteligencia artificial OpenAI, ElevenLabs y Hume, tienen su sede en Estados Unidos. Cuando compartimos texto de guiones o transcripciones con estos proveedores, dicha transferencia internacional se realiza al amparo de las garantías previstas por cada proveedor (como cláusulas contractuales tipo aprobadas por la Comisión Europea o, en su caso, su adhesión al Data Privacy Framework UE-EE.UU.). Te recomendamos consultar las políticas de privacidad de estos proveedores para más detalle. Nunca se transfieren grabaciones completas de audio o vídeo a estos proveedores, solo texto.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>6. Conservación de los datos</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Los datos se conservan mientras la cuenta esté activa o hasta que el usuario solicite su eliminación.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>7. Acceso a grabaciones</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Las grabaciones de audio o vídeo pertenecen al usuario, se procesan solo cuando el usuario ejecuta una función que lo requiere, no se comparten con terceros, y no se emplean para entrenar modelos de IA externos.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>8. Derechos del usuario</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Puedes solicitar en cualquier momento: acceso a tus datos, rectificación, eliminación completa (derecho al olvido), limitación u oposición al tratamiento, y portabilidad de tus datos.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Para ejercer tus derechos, escribe a info@scriptcue.es.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Si consideras que el tratamiento de tus datos no cumple con la normativa aplicable, tienes derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>9. Menores</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        ScriptCue no está dirigida a menores de 14 años (o la edad mínima legal para consentir el tratamiento de datos personales en tu país, si fuera superior). Si tenemos conocimiento de que hemos recopilado datos personales de un menor por debajo de esa edad sin el consentimiento verificable de sus padres o tutores, procederemos a eliminar dicha información y, si procede, desactivar la cuenta correspondiente, tan pronto como tengamos constancia de ello. Si crees que un menor nos ha proporcionado datos personales, contáctanos en info@scriptcue.es.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>10. Cookies y tecnologías de seguimiento</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        ScriptCue no utiliza cookies ni tecnologías de seguimiento de terceros (analítica, publicidad, píxeles, etc.) en su aplicación móvil. Si en el futuro incorporamos herramientas de analítica o similares, actualizaremos esta Política de Privacidad antes de activarlas y te lo notificaremos dentro de la Aplicación.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>11. Servicios de Terceros</Text>

                    <View style={styles.providerList}>
                        <View key="Supabase" style={[styles.providerCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                            <Text style={[styles.providerName, { color: onBg }]}>Supabase</Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Finalidad: </Text>Almacenamiento de datos, archivos y cuenta
                            </Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Datos compartidos: </Text>Datos de usuario, guiones, grabaciones, resultados de análisis
                            </Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Ubicación: </Text>Unión Europea
                            </Text>
                        </View>
                        <View key="OpenAI" style={[styles.providerCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                            <Text style={[styles.providerName, { color: onBg }]}>OpenAI</Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Finalidad: </Text>Procesamiento de texto y transcripción mediante IA
                            </Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Datos compartidos: </Text>Texto de guiones y transcripciones de audio (nunca grabaciones completas)
                            </Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Ubicación: </Text>Estados Unidos (ver 5.4)
                            </Text>
                        </View>
                        <View key="Hume" style={[styles.providerCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                            <Text style={[styles.providerName, { color: onBg }]}>Hume</Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Finalidad: </Text>Generación de voz / réplicas de personajes (voces “naturales”)
                            </Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Datos compartidos: </Text>Texto de guiones
                            </Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Ubicación: </Text>Estados Unidos (ver 5.4)
                            </Text>
                        </View>
                        <View key="ElevenLabs" style={[styles.providerCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                            <Text style={[styles.providerName, { color: onBg }]}>ElevenLabs</Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Finalidad: </Text>Generación de voz / réplicas de personajes (voces “expresivas”)
                            </Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Datos compartidos: </Text>Texto de guiones
                            </Text>
                            <Text style={[styles.providerRow, { color: onBg2 }]}>
                                <Text style={[styles.providerLabel, { color: onBg }]}>Ubicación: </Text>Estados Unidos (ver 5.4)
                            </Text>
                        </View>
                    </View>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        En ningún caso compartimos con terceros: grabaciones de vídeo completas, datos de contacto de otros usuarios, ni tu historial de búsquedas o preferencias internas.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>12. Cambios en esta Política</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Podemos modificar esta Política. Notificaremos las actualizaciones dentro de la Aplicación.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>13. Contacto</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Para consultas sobre privacidad:{'\n'}Email: info@scriptcue.es
                    </Text>
                </ScrollView>
            </SafeAreaView>
            </ImageBackground>
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
    title: {
        fontSize: rf(20),
        fontWeight: '700',
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: rp(20),
        paddingBottom: rp(40),
    },
    date: {
        fontSize: rf(12),
        marginBottom: rp(20),
        fontStyle: 'italic',
    },
    sectionTitle: {
        fontSize: rf(18),
        fontWeight: '700',
        marginTop: rp(24),
        marginBottom: rp(12),
    },
    subsectionTitle: {
        fontSize: rf(16),
        fontWeight: '600',
        marginTop: rp(16),
        marginBottom: rp(8),
    },
    paragraph: {
        fontSize: rf(15),
        lineHeight: rp(24),
        marginBottom: rp(16),
    },
    providerList: {
        gap: rp(12),
        marginBottom: rp(16),
    },
    providerCard: {
        borderWidth: 1,
        borderRadius: 14,
        padding: rp(14),
        gap: rp(6),
    },
    providerName: {
        fontSize: rf(16),
        fontWeight: '700',
        marginBottom: rp(2),
    },
    providerRow: {
        fontSize: rf(14),
        lineHeight: rp(21),
    },
    providerLabel: {
        fontWeight: '600',
    },
});
