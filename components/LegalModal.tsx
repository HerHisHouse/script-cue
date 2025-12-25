import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { X, Sparkles } from 'lucide-react-native';
import { rf, rp } from '@/utils/responsive';

interface LegalModalProps {
    visible: boolean;
    onClose: () => void;
    type: 'terms' | 'privacy' | 'ai';
    isDark: boolean;
    colors: any;
}

export function LegalModal({ visible, onClose, type, isDark, colors }: LegalModalProps) {
    const renderTermsContent = () => (
        <>
            <Text style={[styles.date, { color: colors.textSecondary }]}>Última actualización: 10 de diciembre de 2024</Text>

            <Text style={[styles.paragraph, { color: colors.text }]}>
                Bienvenido/a a Script Cue.{'\n'}
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
                • modos interactivos de práctica (modo estudio, modo memory, modo coach, modo coche, modo casting, etc.).{'\n\n'}
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

            <Text style={[styles.sectionTitle, { color: colors.text }]}>8. Limitación de Responsabilidad</Text>
            <Text style={[styles.paragraph, { color: colors.text }]}>
                La Aplicación se ofrece "tal cual es".{'\n\n'}
                No garantizamos que:{'\n'}
                • Esté libre de errores.{'\n'}
                • Funcione sin interrupciones.{'\n'}
                • Los resultados de la IA sean siempre correctos.{'\n'}
                • El almacenamiento remoto esté disponible 24/7.{'\n\n'}
                En ningún caso seremos responsables por:{'\n'}
                • pérdida de grabaciones,{'\n'}
                • daños indirectos o emergentes,{'\n'}
                • interpretaciones incorrectas derivadas del uso de la IA.
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
                Email: scriptcue@gmail.com{'\n'}
                Responsable: Alex Díaz
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>12. Aceptación</Text>
            <Text style={[styles.paragraph, { color: colors.text }]}>
                Al hacer clic en "Acepto los Términos y Condiciones" durante el registro, confirmas que has leído, comprendido y aceptado este documento.
            </Text>
        </>
    );

    const renderPrivacyContent = () => (
        <>
            <Text style={[styles.date, { color: colors.textSecondary }]}>Última actualización: 10 de diciembre de 2024</Text>

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
                • Preferencias de uso (modo coche, modo coach, modo estudio, etc.)
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
            <Text style={[styles.paragraph, { color: colors.text }]}>
                La App puede usar proveedores como:{'\n'}
                • Supabase (almacenamiento de datos){'\n'}
                • APIs de IA (para análisis, transcripción, estudio, modo coach){'\n\n'}
                Estos servicios cumplen normativas de protección de datos estándar.
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>10. Cambios en esta Política</Text>
            <Text style={[styles.paragraph, { color: colors.text }]}>
                Podemos modificar esta Política. Notificaremos las actualizaciones dentro de la App.
            </Text>
        </>
    );

    const renderAIContent = () => (
        <>
            <View style={[styles.banner, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
                <Sparkles size={32} color={colors.primary} />
                <Text style={[styles.bannerText, { color: colors.primary }]}>
                    Esta aplicación utiliza Inteligencia Artificial como herramienta creativa y educativa
                </Text>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>¿Cómo usamos la IA?</Text>
            <Text style={[styles.paragraph, { color: colors.text }]}>
                Esta aplicación utiliza modelos de Inteligencia Artificial para:{'\n\n'}
                • Generar respuestas de personajes{'\n'}
                • Analizar interpretaciones{'\n'}
                • Transcribir texto{'\n'}
                • Reformatear guiones{'\n'}
                • Ofrecer retroalimentación personalizada
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Importante: Limitaciones de la IA</Text>
            <Text style={[styles.paragraph, { color: colors.text }]}>
                Los resultados generados por IA:{'\n\n'}
                • <Text style={styles.bold}>Pueden contener imprecisiones</Text>{'\n'}
                La IA no es perfecta y puede cometer errores en sus análisis o sugerencias.{'\n\n'}
                • <Text style={styles.bold}>No son consejos profesionales</Text>{'\n'}
                Las recomendaciones de la IA no sustituyen el asesoramiento de un coach, director o profesor de interpretación.{'\n\n'}
                • <Text style={styles.bold}>Son una ayuda creativa y educativa</Text>{'\n'}
                Utiliza la IA como una herramienta complementaria para tu práctica, no como única fuente de aprendizaje.
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Tu control sobre la IA</Text>
            <Text style={[styles.paragraph, { color: colors.text }]}>
                • Todas las funciones de IA requieren tu acción explícita{'\n'}
                • Puedes elegir cuándo y cómo usar las herramientas de IA{'\n'}
                • Tus grabaciones nunca se usan para entrenar modelos externos{'\n'}
                • Los análisis se realizan solo cuando tú lo solicitas
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacidad y Seguridad</Text>
            <Text style={[styles.paragraph, { color: colors.text }]}>
                • Tus datos personales están protegidos{'\n'}
                • No compartimos tu información con terceros{'\n'}
                • Los análisis de IA se procesan de forma segura{'\n'}
                • Conservas todos los derechos sobre tus grabaciones
            </Text>

            <View style={[styles.disclaimer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.disclaimerTitle, { color: colors.text }]}>Disclaimer</Text>
                <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
                    Al usar las funciones de IA en esta aplicación, reconoces que entiendes sus limitaciones y que la usarás como una herramienta complementaria, no como sustituto del aprendizaje profesional.
                </Text>
            </View>

            <Text style={[styles.contact, { color: colors.textSecondary }]}>
                ¿Preguntas sobre el uso de IA?{'\n'}
                Contacta con nosotros: scriptcue@gmail.com
            </Text>
        </>
    );

    const getTitle = () => {
        switch (type) {
            case 'terms': return 'Términos y Condiciones';
            case 'privacy': return 'Política de Privacidad';
            case 'ai': return 'Uso de Inteligencia Artificial';
        }
    };

    const getContent = () => {
        switch (type) {
            case 'terms': return renderTermsContent();
            case 'privacy': return renderPrivacyContent();
            case 'ai': return renderAIContent();
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.title, { color: colors.text }]}>{getTitle()}</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <X size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    {getContent()}
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: rp(20),
        paddingVertical: rp(16),
        paddingTop: rp(50),
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
    bold: {
        fontWeight: '700',
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
