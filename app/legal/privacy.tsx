import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { X } from 'lucide-react-native';
import { rf, rp } from '@/utils/responsive';

export default function PrivacyScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.title, { color: colors.text }]}>Política de Privacidad</Text>
                    <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                        <X size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Esta Política de Privacidad describe cómo Script Cue ("la Aplicación", "nosotros") recopila, utiliza y protege los datos personales del usuario ("tú").
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Responsable del Tratamiento</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Script Cue{'\n'}
                        Email: scriptcue@gmail.com
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Datos que recopilamos</Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>2.1 Datos proporcionados por el usuario</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        • Nombre o alias{'\n'}
                        • Email{'\n'}
                        • Guiones importados manualmente{'\n'}
                        • Grabaciones de audio y vídeo{'\n'}
                        • Carpetas y proyectos creados dentro de la app{'\n'}
                        • Preferencias de uso (modo coche, modo escena, modo estudio, etc.)
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>2.2 Datos generados automáticamente</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        • Identificador interno de usuario{'\n'}
                        • Historial de sesiones{'\n'}
                        • Estadísticas de uso{'\n'}
                        • Resultados de análisis generados por IA (si el usuario los solicita)
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>2.3 Datos sensibles</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Las grabaciones solo son procesadas bajo petición explícita del usuario y nunca se comparten ni utilizan para entrenar modelos externos.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>2.4 Datos de terceros en grabaciones</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Si el usuario graba a otros actores/actrices (diálogos en audiciones, ensayos con terceros), el usuario es responsable de:{'\n'}
                        • Obtener consentimiento explícito de otros participantes.{'\n'}
                        • Informarles de que sus voces/imágenes se guardan en la app.{'\n'}
                        • Cumplir normativas de protección de datos (RGPD, LSRFP, etc.).{'\n\n'}
                        Script Cue no es responsable del uso indebido de grabaciones de terceros.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Finalidad del tratamiento</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Utilizamos los datos únicamente para:{'\n'}
                        • mostrar guiones, grabaciones y proyectos dentro de la app,{'\n'}
                        • permitir las funciones de grabación,{'\n'}
                        • realizar análisis mediante IA cuando el usuario lo solicita,{'\n'}
                        • almacenar archivos en servidores externos (por ejemplo, Supabase),{'\n'}
                        • mejorar las funcionalidades internas de la aplicación,{'\n'}
                        • permitir sincronización entre dispositivos (si está activada).{'\n\n'}
                        No vendemos, comercializamos ni cedemos datos a terceros.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Base legal</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Tu consentimiento explícito al registrarte y al usar las funciones que implican grabación o análisis mediante IA.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>5. Almacenamiento de datos</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Los datos se almacenan en:{'\n'}
                        • el dispositivo del usuario (modo local),{'\n'}
                        • servidores externos como Supabase (modo en la nube).{'\n\n'}
                        Adoptamos medidas razonables de seguridad para evitar accesos no autorizados, aunque ningún sistema puede garantizar seguridad absoluta.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>5.1 Almacenamiento local</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        • Los archivos se guardan en la memoria del dispositivo.{'\n'}
                        • Script Cue no tiene acceso al almacenamiento local.{'\n'}
                        • La responsabilidad de hacer backup es del usuario.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>5.2 Almacenamiento remoto (Supabase)</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        • Se usa encriptación en tránsito (HTTPS/TLS).{'\n'}
                        • Los servidores están en EU.{'\n'}
                        • Supabase tiene sus propias políticas de seguridad.{'\n'}
                        • En caso de vulneración, Supabase notificará a los usuarios.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>5.3 Retención de datos borrados</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        • Los datos se marcan como eliminados inmediatamente.{'\n'}
                        • Las copias de seguridad pueden conservarlos 30 días más.{'\n'}
                        • Cumplimos RGPD en caso de que aplique.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>6. Conservación de los datos</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Los datos se conservan mientras la cuenta esté activa o hasta que el usuario solicite su eliminación.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>7. Acceso a grabaciones</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Las grabaciones de audio o vídeo:{'\n'}
                        • pertenecen al usuario,{'\n'}
                        • se procesan solo cuando el usuario ejecuta una función que lo requiere,{'\n'}
                        • no se comparten con terceros,{'\n'}
                        • no se emplean para entrenar modelos de IA externos.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>8. Derechos del usuario</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Puedes solicitar en cualquier momento:{'\n'}
                        • acceso a tus datos,{'\n'}
                        • rectificación,{'\n'}
                        • eliminación completa,{'\n'}
                        • suspensión de cuenta.{'\n\n'}
                        Para ejercer tus derechos, escribe a scriptcue@gmail.com
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>9. Servicios de Terceros</Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>9.1 Supabase</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        • Proveedor: Supabase (supabase.com).{'\n'}
                        • Ubicación de los servidores: EU.{'\n'}
                        • Datos transferidos: usuario, guiones, grabaciones, análisis.{'\n'}
                        • Política: https://supabase.com/privacy
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>9.2 APIs de IA (OpenAI, Elevenlabs, etc.)</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        • Datos compartidos: Texto de guiones, transcripciones de audio.{'\n'}
                        • Restricción: NUNCA se comparten grabaciones de video/audio completas.{'\n'}
                        • Estos servicios pueden tener sus propias retenciones de datos.
                    </Text>

                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>9.3 Datos no compartidos</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        En NINGÚN caso compartimos con terceros:{'\n'}
                        • Grabaciones de video completas.{'\n'}
                        • Datos de contacto de otros usuarios.{'\n'}
                        • Historial de búsquedas o preferencias.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>10. Cambios en esta Política</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Podemos modificar esta Política. Notificaremos las actualizaciones dentro de la App.
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
