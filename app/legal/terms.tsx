import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { X } from 'lucide-react-native';
import { rf, rp } from '@/utils/responsive';

export default function TermsScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.title, { color: colors.text }]}>Términos y Condiciones</Text>
                    <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                        <X size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Te doy la bienvenida a Script Cue.{'\n'}
                        Al crear una cuenta y utilizar nuestros servicios, aceptas estos Términos y Condiciones de Uso. Por favor, léelos cuidadosamente. Si no estás de acuerdo, no debes utilizar la Aplicación.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Objeto de la Aplicación</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        La Aplicación ofrece herramientas para:{'\n'}
                        • la práctica e interpretación de guiones,{'\n'}
                        • la grabación de audio y vídeo,{'\n'}
                        • análisis impulsados por inteligencia artificial,{'\n'}
                        • almacenamiento de archivos,{'\n'}
                        • organización de proyectos y contenido personal,{'\n'}
                        • modos interactivos de práctica (modo estudio, modo memory, modo escena, modo coche, modo casting, etc.).{'\n\n'}
                        La Aplicación no sustituye a un coach profesional, escuela de interpretación ni asesoramiento especializado.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Registro y Cuenta</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Para utilizar la Aplicación debes:{'\n'}
                        • ser mayor de 14 años (o edad legal mínima de tu país),{'\n'}
                        • proporcionar información veraz,{'\n'}
                        • mantener la confidencialidad de tu cuenta y contraseña.{'\n\n'}
                        Eres responsable de toda actividad que ocurra bajo tu cuenta.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Uso Permitido</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        El usuario se compromete a:{'\n'}
                        • Usar la Aplicación únicamente para fines personales y legítimos.{'\n'}
                        • No cargar contenido ilegal, ofensivo o que infrinja derechos de terceros.{'\n'}
                        • No intentar acceder, modificar ni interferir con el código, servidores o bases de datos.{'\n'}
                        • No utilizar la App para entrenar modelos externos de IA sin autorización.{'\n\n'}
                        El uso con fines comerciales requiere un acuerdo previo por escrito.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Grabaciones de Audio y Vídeo</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        La Aplicación permite grabar:{'\n'}
                        • Voz.{'\n'}
                        • Interpretación en vídeo.{'\n'}
                        • Diálogos entre el usuario y la IA.{'\n\n'}
                        Al utilizar estas funciones, el usuario acepta lo siguiente:{'\n'}
                        1. Las grabaciones se almacenan localmente en el dispositivo y/o en servidores remotos (por ejemplo, Supabase), según la configuración seleccionada.{'\n'}
                        2. El usuario conserva los derechos de propiedad sobre sus grabaciones.{'\n'}
                        3. La Aplicación solo accede a las grabaciones para:{'\n'}
                        • Mostrarlas en la interfaz.{'\n'}
                        • Analizarlas mediante IA (si el usuario lo solicita).{'\n'}
                        • Permitir su organización en carpetas y proyectos.{'\n'}
                        4. La Aplicación no comparte grabaciones con terceros.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>5. Procesamiento mediante Inteligencia Artificial</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Algunas funciones usan IA para:{'\n'}
                        • Generar réplicas de personajes.{'\n'}
                        • Analizar interpretaciones.{'\n'}
                        • Reformatear guiones.{'\n'}
                        • Ofrecer recomendaciones y feedback.{'\n\n'}
                        El usuario acepta que:{'\n'}
                        • Todo análisis se realiza bajo petición explícita del usuario.{'\n'}
                        • Los modelos de IA pueden generar resultados aproximados, no siempre precisos.{'\n'}
                        • El contenido generado por IA solo debe considerarse un complemento creativo, no asesoramiento profesional.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>6. Propiedad Intelectual</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Los elementos de la App (diseño, código, funcionalidades, logos, etc.) son propiedad de Script Cue.{'\n\n'}
                        Los guiones, grabaciones y materiales importados por el usuario son propiedad del usuario.{'\n'}
                        El usuario es responsable de tener autorización para importar cualquier guion que no sea de su autoría.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>7. Almacenamiento y Seguridad</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        La Aplicación utiliza proveedores externos como Supabase para almacenar datos.{'\n\n'}
                        Nos comprometemos a:{'\n'}
                        • Adoptar medidas razonables de seguridad.{'\n'}
                        • No acceder ni revisar tus grabaciones salvo que tú lo solicites mediante funciones internas de la App.{'\n\n'}
                        Sin embargo, ningún sistema puede garantizar seguridad absoluta.{'\n'}
                        El usuario acepta este riesgo inherente al uso de servicios en línea.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>8. Limitaciones de Responsabilidad</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        La Aplicación se ofrece "tal cual es".{'\n\n'}
                        No garantizamos que:{'\n'}
                        • Esté libre de errores.{'\n'}
                        • Funcione sin interrupciones.{'\n'}
                        • Los resultados de la IA sean siempre correctos.{'\n'}
                        • El almacenamiento remoto esté disponible 24/7.{'\n\n'}
                        En ningún caso seremos responsables por:{'\n'}
                        • Pérdida de grabaciones.{'\n'}
                        • Daños indirectos o emergentes.{'\n'}
                        • Interpretaciones incorrectas derivadas del uso de la IA.{'\n'}
                        • Pérdida de datos durante sincronización o almacenamiento en la nube.{'\n'}
                        • Fallos de terceros (Supabase, APIs de IA).{'\n'}
                        • Uso indebido de resultados de IA en audiciones o castings.{'\n'}
                        • Daños derivados de la interpretación de feedback de IA.{'\n'}
                        • Interrupciones del servicio por mantenimiento o fuerza mayor.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>8.1 Indemnización</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        El usuario acepta indemnizar y eximir a Script Cue de cualquier reclamo derivado de:{'\n'}
                        • Contenido que el usuario suba que infrinja derechos de terceros.{'\n'}
                        • Uso de la App para violar leyes aplicables.{'\n'}
                        • Compartir grabaciones sin autorización de otros actores.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>8.2 Severabilidad</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Si alguna cláusula es inválida, el resto permanece en vigor.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>8.3 Ley Aplicable</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Estos términos se rigen por las leyes de España.{'\n'}
                        Cualquier disputa se resolverá en los tribunales de Madrid.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>9. Suspensión o Eliminación de Cuenta</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Podemos suspender o eliminar cuentas que:{'\n'}
                        • Violen estos términos,{'\n'}
                        • Abusen del sistema,{'\n'}
                        • Suban contenido ilegal o perjudicial.{'\n\n'}
                        El usuario puede solicitar eliminar su cuenta y todos sus datos en cualquier momento.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>10. Modificaciones</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Podemos actualizar estos Términos en cualquier momento.{'\n'}
                        Notificaremos los cambios dentro de la Aplicación.{'\n'}
                        El uso continuado implica la aceptación de los nuevos términos.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>11. Contacto</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Para consultas o soporte:{'\n\n'}
                        Email: info@scriptcue.es{'\n'}
                        Responsable: Alex Díaz
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>12. Aceptación</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Al hacer clic en "Acepto los Términos y Condiciones" durante el registro, confirmas que has leído, comprendido y aceptado este documento.
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
    title: {
        fontSize: rf(20),
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
    paragraph: {
        fontSize: rf(15),
        lineHeight: rp(24),
        marginBottom: rp(16),
    },
});
