import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { X } from 'lucide-react-native';
import { rf, rp } from '@/utils/responsive';

export default function TermsScreen() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const onBg = isDark ? '#ffffff' : '#2a2447';
    const onBg2 = isDark ? '#a0a0c0' : '#5c5678';

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
                    <Text style={[styles.title, { color: onBg }]}>Términos y Condiciones</Text>
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
                        Te doy la bienvenida a ScriptCue. Al crear una cuenta y utilizar nuestros servicios, aceptas estos Términos y Condiciones de Uso (“Términos”), así como nuestra Política de Privacidad. Estos Términos y Condiciones y la Política de Privacidad se incorporan mutuamente por referencia y constituyen, en su conjunto, un único acuerdo contractual entre tú y ScriptCue. Por favor, léelos cuidadosamente. Si no estás de acuerdo, no debes utilizar la Aplicación.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>1. Objeto de la Aplicación</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        La Aplicación ofrece herramientas para:{'\n'}
                        • la práctica e interpretación de guiones,{'\n'}• la grabación de audio y vídeo,{'\n'}• análisis impulsados por inteligencia artificial,{'\n'}• almacenamiento de archivos,{'\n'}• organización de proyectos y contenido personal,{'\n'}• modos interactivos de práctica (modo estudio, modo memoria, modo escena, modo coche, modo casting, etc.).
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        La Aplicación no sustituye a un coach profesional, escuela de interpretación ni asesoramiento especializado.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>2. Fase Beta y Modelo de Precios</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        ScriptCue se encuentra actualmente en fase beta. Durante esta fase, el acceso a la Aplicación es completamente gratuito para los usuarios que participan como testers.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Está previsto que, en el futuro, ScriptCue pase a un modelo de suscripción de pago. Cuando ese modelo quede definido, publicaremos condiciones específicas de precio, facturación, renovación automática y cancelación, y te notificaremos dentro de la Aplicación con antelación razonable antes de que entren en vigor. El uso continuado de la Aplicación tras la introducción de dichas condiciones implicará su aceptación.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Durante la fase beta, la Aplicación puede sufrir cambios frecuentes de funcionalidad, interrupciones, pérdida de datos de prueba o comportamiento inestable propio de un entorno en desarrollo activo. El usuario que participa como tester acepta este carácter experimental.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>3. Registro y Cuenta</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Para utilizar la Aplicación debes:{'\n'}
                        • ser mayor de 14 años (o la edad legal mínima de tu país),{'\n'}• proporcionar información veraz,{'\n'}• mantener la confidencialidad de tu cuenta y contraseña.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Eres responsable de toda actividad que ocurra bajo tu cuenta.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>4. Uso Permitido</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        El usuario se compromete a:{'\n'}
                        • Usar la Aplicación únicamente para fines personales y legítimos.{'\n'}• No cargar contenido ilegal, ofensivo o que infrinja derechos de terceros.{'\n'}• No intentar acceder, modificar ni interferir con el código, servidores o bases de datos.{'\n'}• No utilizar la Aplicación para entrenar modelos externos de IA sin autorización.{'\n'}• No usar la Aplicación con fines comerciales sin un acuerdo previo por escrito.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>5. Grabaciones de Audio y Vídeo</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        La Aplicación permite grabar voz, interpretación en vídeo y diálogos entre el usuario y la IA. Al utilizar estas funciones, el usuario acepta lo siguiente:{'\n'}
                        • Las grabaciones se almacenan localmente en el dispositivo y/o en servidores remotos (Supabase), según la configuración seleccionada.{'\n'}• El usuario conserva los derechos de propiedad sobre sus grabaciones.{'\n'}• La Aplicación solo accede a las grabaciones para mostrarlas en la interfaz, analizarlas mediante IA (si el usuario lo solicita) y permitir su organización en carpetas y proyectos.{'\n'}• La Aplicación no comparte grabaciones con terceros.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>6. Procesamiento mediante Inteligencia Artificial</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Algunas funciones usan IA para: generar réplicas de personajes, analizar interpretaciones, transcribir audio, reformatear guiones, y ofrecer recomendaciones y retroalimentación personalizada.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        El usuario acepta que:{'\n'}
                        • Todo análisis se realiza bajo petición explícita del usuario; ninguna función de IA se ejecuta sin tu acción directa.{'\n'}• Los modelos de IA pueden generar resultados aproximados, no siempre precisos, y pueden cometer errores de transcripción, malinterpretar emociones en audio/vídeo, o generar sugerencias poco adecuadas para un género o estilo interpretativo concreto.{'\n'}• El contenido generado por IA es una ayuda creativa y educativa complementaria, y en ningún caso sustituye el asesoramiento de un coach, director o profesor de interpretación profesional.{'\n'}• Es tu responsabilidad verificar la precisión y adecuación de cualquier contenido generado por IA antes de utilizarlo, especialmente en contextos profesionales como audiciones o castings reales.{'\n'}• Tus grabaciones nunca se utilizan para entrenar modelos de IA externos.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Además de las limitaciones generales de responsabilidad de la sección 9, y en relación específicamente con el uso de IA, ScriptCue no será responsable de: pérdida de oportunidades profesionales derivadas de seguir recomendaciones generadas por IA, valoraciones o críticas de terceros basadas en análisis de IA, ni malestar emocional derivado de la retroalimentación automática generada por estas funciones.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>7. Propiedad Intelectual</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Los elementos de la Aplicación (diseño, código, funcionalidades, marca, logotipos, etc.) son propiedad de ScriptCue.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Los guiones, grabaciones y demás materiales que importes o generes dentro de la Aplicación son de tu propiedad. Al subirlos o generarlos, nos concedes una licencia limitada, no exclusiva y revocable para alojar, almacenar, reproducir, procesar y mostrarte dicho contenido dentro de la Aplicación, en la medida estrictamente necesaria para prestarte el servicio (por ejemplo, generar una réplica de voz, analizar una interpretación o sincronizar tus archivos entre dispositivos). Esta licencia incluye la posibilidad de que dicho contenido sea procesado por los proveedores externos indicados en nuestra Política de Privacidad, exclusivamente para prestar el servicio solicitado.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Eres responsable de contar con la autorización necesaria para importar o utilizar cualquier guion, grabación o material que no sea de tu autoría.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>8. Almacenamiento y Seguridad</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        La Aplicación utiliza Supabase como proveedor externo para almacenar datos.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Nos comprometemos a adoptar medidas razonables de seguridad y a no acceder ni revisar tus grabaciones salvo que tú lo solicites mediante funciones internas de la Aplicación.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Sin embargo, ningún sistema puede garantizar seguridad absoluta. El usuario acepta este riesgo inherente al uso de servicios en línea.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>9. Limitaciones de Responsabilidad</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        La Aplicación se ofrece “tal cual es”. No garantizamos que esté libre de errores, funcione sin interrupciones, que los resultados de la IA sean siempre correctos, o que el almacenamiento remoto esté disponible 24/7.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        En ningún caso seremos responsables por:{'\n'}
                        • Pérdida de grabaciones.{'\n'}• Daños indirectos o emergentes.{'\n'}• Interpretaciones incorrectas derivadas del uso de la IA.{'\n'}• Pérdida de datos durante sincronización o almacenamiento en la nube.{'\n'}• Fallos de terceros (Supabase, APIs de IA).{'\n'}• Uso indebido de resultados de IA en audiciones o castings.{'\n'}• Daños derivados de la interpretación de feedback de IA.{'\n'}• Interrupciones del servicio por mantenimiento o fuerza mayor.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>9.1 Indemnización</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        El usuario acepta indemnizar y eximir a ScriptCue de cualquier reclamo derivado de: contenido que el usuario suba que infrinja derechos de terceros, uso de la Aplicación para violar leyes aplicables, y compartir grabaciones sin autorización de otros actores.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>9.2 Severabilidad</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Si alguna cláusula es inválida, el resto permanece en vigor.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: onBg }]}>9.3 Ley Aplicable</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Estos términos se rigen por las leyes de España. Cualquier disputa se resolverá en los tribunales de Madrid.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>10. Suspensión o Eliminación de Cuenta</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Podemos suspender o eliminar cuentas que violen estos términos, abusen del sistema, o suban contenido ilegal o perjudicial.
                    </Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        El usuario puede solicitar eliminar su cuenta y todos sus datos en cualquier momento.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>11. Modificaciones</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Podemos actualizar estos Términos en cualquier momento. Notificaremos los cambios dentro de la Aplicación. El uso continuado implica la aceptación de los nuevos términos.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>12. Disposiciones para Apple y Google</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Cuando accedas a la Aplicación a través de una aplicación móvil descargada desde la App Store de Apple o Google Play (cada una, un “Distribuidor de Aplicaciones”), se aplica además lo siguiente:{'\n'}
                        • La licencia que se te concede para usar la aplicación móvil se limita a una licencia no transferible para utilizarla en un dispositivo que funcione con iOS o Android, según corresponda.{'\n'}• Somos nosotros, y no el Distribuidor de Aplicaciones, los responsables de prestar cualquier servicio de mantenimiento y soporte respecto de la aplicación móvil.{'\n'}• En caso de que la aplicación móvil no cumpla con alguna garantía aplicable, puedes notificarlo al Distribuidor de Aplicaciones correspondiente, quien podrá, conforme a sus propias condiciones, reembolsarte el precio de compra, si procede.{'\n'}• Debes cumplir con los términos de servicio aplicables del Distribuidor de Aplicaciones correspondiente al utilizar la aplicación móvil.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>13. Contacto</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Para consultas o soporte:{'\n'}Email: info@scriptcue.es{'\n'}Responsable: Alex Díaz
                    </Text>

                    <Text style={[styles.sectionTitle, { color: onBg }]}>14. Aceptación</Text>

                    <Text style={[styles.paragraph, { color: onBg2 }]}>
                        Al hacer clic en “Acepto los Términos y Condiciones” durante el registro, confirmas que has leído, comprendido y aceptado este documento.
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
});
