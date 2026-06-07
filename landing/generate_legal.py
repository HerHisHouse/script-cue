import os

# Create legal directory
os.makedirs('/Users/alexdiaz/Documents/RS/landing/legal', exist_ok=True)

# Common HTML template
template = """<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} | ScriptCue</title>
    <meta name="robots" content="noindex">
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Ibarra+Real+Nova:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">
    <!-- Styles -->
    <link rel="stylesheet" href="../styles.css">
    <style>
        .legal-page {{
            padding: 140px 24px 80px;
            max-width: 800px;
            margin: 0 auto;
            color: var(--text-primary);
        }}
        .legal-title {{
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: var(--gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }}
        .legal-date {{
            color: var(--text-muted);
            font-style: italic;
            margin-bottom: 40px;
            display: block;
        }}
        .legal-content h2 {{
            font-size: 1.5rem;
            margin-top: 40px;
            margin-bottom: 16px;
            color: var(--text-primary);
        }}
        .legal-content h3 {{
            font-size: 1.25rem;
            margin-top: 24px;
            margin-bottom: 12px;
            color: var(--text-primary);
        }}
        .legal-content p {{
            color: var(--text-secondary);
            line-height: 1.6;
            margin-bottom: 16px;
        }}
        .legal-content ul {{
            color: var(--text-secondary);
            line-height: 1.6;
            margin-bottom: 16px;
            padding-left: 20px;
        }}
        .legal-content li {{
            margin-bottom: 8px;
        }}
        .legal-disclaimer {{
            background: rgba(168, 85, 247, 0.1);
            border: 1px solid var(--accent-primary);
            padding: 24px;
            border-radius: 12px;
            margin: 40px 0;
        }}
        .legal-disclaimer h3 {{
            margin-top: 0;
            color: var(--accent-primary);
        }}
        .legal-disclaimer p {{
            margin-bottom: 0;
        }}
    </style>
</head>
<body>
    <!-- Navigation -->
    <nav class="navbar" style="background: rgba(13, 17, 23, 0.95); padding: 12px 0;">
        <div class="nav-container">
            <a href="/" class="nav-logo">
                <img src="../screenshots/Logo Blanco.png" alt="ScriptCue Logo" class="logo-img">
                <span class="logo-text">ScriptCue</span>
            </a>
            <div class="nav-menu" id="nav-menu">
                <a href="/#features" class="nav-link">Características</a>
                <a href="/#how-it-works" class="nav-link">Cómo funciona</a>
                <a href="/#modes" class="nav-link">Modos</a>
                <a href="/#faqs" class="nav-link">FAQs</a>
                <a href="/#download" class="nav-link nav-cta">Descargar</a>
            </div>
        </div>
    </nav>

    <main class="legal-page">
        <h1 class="legal-title">{title}</h1>
        {date_html}
        <div class="legal-content">
{content}
        </div>
    </main>

    <!-- Footer -->
    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div class="footer-brand">
                    <a href="/" class="footer-logo">
                        <img src="../screenshots/Logo Blanco.png" alt="ScriptCue Logo" class="logo-img">
                        <span class="logo-text">ScriptCue</span>
                    </a>
                    <p class="footer-tagline">Donde los guiones cobran vida</p>
                </div>
                <div class="footer-links">
                    <div class="footer-column">
                        <h4>Explorar</h4>
                        <a href="/#features">Características</a>
                        <a href="/#how-it-works">Cómo funciona</a>
                        <a href="/#modes">Modos</a>
                        <a href="/#faqs">FAQs</a>
                    </div>
                    <div class="footer-column">
                        <h4>Legal</h4>
                        <a href="/legal/terms">Términos y condiciones</a>
                        <a href="/legal/privacy">Política de privacidad</a>
                        <a href="/legal/ai">Uso de inteligencia Artificial</a>
                    </div>
                    <div class="footer-column">
                        <h4>Contacto</h4>
                        <a href="mailto:hola@scriptcue.es">hola@scriptcue.es</a>
                    </div>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2025 ScriptCue. Todos los derechos reservados. ¡Gracias por ser parte de nuestra comunidad!</p>
            </div>
        </div>
    </footer>
</body>
</html>
"""

# TERMS AND CONDITIONS
terms_content = """
            <p>Te doy la bienvenida a Script Cue.<br>
            Al crear una cuenta y utilizar nuestros servicios, aceptas estos Términos y Condiciones de Uso. Por favor, léelos cuidadosamente. Si no estás de acuerdo, no debes utilizar la Aplicación.</p>

            <h2>1. Objeto de la Aplicación</h2>
            <p>La Aplicación ofrece herramientas para:</p>
            <ul>
                <li>la práctica e interpretación de guiones,</li>
                <li>la grabación de audio y vídeo,</li>
                <li>análisis impulsados por inteligencia artificial,</li>
                <li>almacenamiento de archivos,</li>
                <li>organización de proyectos y contenido personal,</li>
                <li>modos interactivos de práctica (modo estudio, modo memory, modo escena, modo coche, modo casting, etc.).</li>
            </ul>
            <p>La Aplicación no sustituye a un coach profesional, escuela de interpretación ni asesoramiento especializado.</p>

            <h2>2. Registro y Cuenta</h2>
            <p>Para utilizar la Aplicación debes:</p>
            <ul>
                <li>ser mayor de 14 años (o edad legal mínima de tu país),</li>
                <li>proporcionar información veraz,</li>
                <li>mantener la confidencialidad de tu cuenta y contraseña.</li>
            </ul>
            <p>Eres responsable de toda actividad que ocurra bajo tu cuenta.</p>

            <h2>3. Uso Permitido</h2>
            <p>El usuario se compromete a:</p>
            <ul>
                <li>Usar la Aplicación únicamente para fines personales y legítimos.</li>
                <li>No cargar contenido ilegal, ofensivo o que infrinja derechos de terceros.</li>
                <li>No intentar acceder, modificar ni interferir con el código, servidores o bases de datos.</li>
                <li>No utilizar la App para entrenar modelos externos de IA sin autorización.</li>
            </ul>
            <p>El uso con fines comerciales requiere un acuerdo previo por escrito.</p>

            <h2>4. Grabaciones de Audio y Vídeo</h2>
            <p>La Aplicación permite grabar: Voz, Interpretación en vídeo y Diálogos entre el usuario y la IA.</p>
            <p>Al utilizar estas funciones, el usuario acepta lo siguiente:</p>
            <ul>
                <li>Las grabaciones se almacenan localmente en el dispositivo y/o en servidores remotos (por ejemplo, Supabase), según la configuración seleccionada.</li>
                <li>El usuario conserva los derechos de propiedad sobre sus grabaciones.</li>
                <li>La Aplicación solo accede a las grabaciones para: Mostrarlas en la interfaz, Analizarlas mediante IA (si el usuario lo solicita), y Permitir su organización en carpetas y proyectos.</li>
                <li>La Aplicación no comparte grabaciones con terceros.</li>
            </ul>

            <h2>5. Procesamiento mediante Inteligencia Artificial</h2>
            <p>Algunas funciones usan IA para: Generar réplicas de personajes, Analizar interpretaciones, Reformatear guiones, y Ofrecer recomendaciones y feedback.</p>
            <p>El usuario acepta que:</p>
            <ul>
                <li>Todo análisis se realiza bajo petición explícita del usuario.</li>
                <li>Los modelos de IA pueden generar resultados aproximados, no siempre precisos.</li>
                <li>El contenido generado por IA solo debe considerarse un complemento creativo, no asesoramiento profesional.</li>
            </ul>

            <h2>6. Propiedad Intelectual</h2>
            <p>Los elementos de la App (diseño, código, funcionalidades, logos, etc.) son propiedad de Script Cue.</p>
            <p>Los guiones, grabaciones y materiales importados por el usuario son propiedad del usuario. El usuario es responsable de tener autorización para importar cualquier guion que no sea de su autoría.</p>

            <h2>7. Almacenamiento y Seguridad</h2>
            <p>La Aplicación utiliza proveedores externos como Supabase para almacenar datos.</p>
            <p>Nos comprometemos a: Adoptar medidas razonables de seguridad y No acceder ni revisar tus grabaciones salvo que tú lo solicites mediante funciones internas de la App.</p>
            <p>Sin embargo, ningún sistema puede garantizar seguridad absoluta. El usuario acepta este riesgo inherente al uso de servicios en línea.</p>

            <h2>8. Limitaciones de Responsabilidad</h2>
            <p>La Aplicación se ofrece "tal cual es". No garantizamos que esté libre de errores, funcione sin interrupciones, los resultados de la IA sean siempre correctos, o que el almacenamiento remoto esté disponible 24/7.</p>
            <p>En ningún caso seremos responsables por: Pérdida de grabaciones, Daños indirectos o emergentes, Interpretaciones incorrectas derivadas del uso de la IA, Pérdida de datos durante sincronización o almacenamiento en la nube, Fallos de terceros (Supabase, APIs de IA), Uso indebido de resultados de IA en audiciones o castings, Daños derivados de la interpretación de feedback de IA, e Interrupciones del servicio por mantenimiento o fuerza mayor.</p>

            <h3>8.1 Indemnización</h3>
            <p>El usuario acepta indemnizar y eximir a Script Cue de cualquier reclamo derivado de: Contenido que el usuario suba que infrinja derechos de terceros, Uso de la App para violar leyes aplicables, y Compartir grabaciones sin autorización de otros actores.</p>

            <h3>8.2 Severabilidad</h3>
            <p>Si alguna cláusula es inválida, el resto permanece en vigor.</p>

            <h3>8.3 Ley Aplicable</h3>
            <p>Estos términos se rigen por las leyes de España. Cualquier disputa se resolverá en los tribunales de Madrid.</p>

            <h2>9. Suspensión o Eliminación de Cuenta</h2>
            <p>Podemos suspender o eliminar cuentas que: Violen estos términos, Abusen del sistema, o Suban contenido ilegal o perjudicial.</p>
            <p>El usuario puede solicitar eliminar su cuenta y todos sus datos en cualquier momento.</p>

            <h2>10. Modificaciones</h2>
            <p>Podemos actualizar estos Términos en cualquier momento. Notificaremos los cambios dentro de la Aplicación. El uso continuado implica la aceptación de los nuevos términos.</p>

            <h2>11. Contacto</h2>
            <p>Para consultas o soporte:<br>Email: scriptcue@gmail.com<br>Responsable: Alex Díaz</p>

            <h2>12. Aceptación</h2>
            <p>Al hacer clic en "Acepto los Términos y Condiciones" durante el registro, confirmas que has leído, comprendido y aceptado este documento.</p>
"""

with open('/Users/alexdiaz/Documents/RS/landing/legal/terms.html', 'w') as f:
    f.write(template.format(
        title="Términos y Condiciones",
        date_html='<span class="legal-date">Última actualización: 10 de diciembre de 2024</span>',
        content=terms_content
    ))


# PRIVACY
privacy_content = """
            <p>Esta Política de Privacidad describe cómo Script Cue ("la Aplicación", "nosotros") recopila, utiliza y protege los datos personales del usuario ("tú").</p>

            <h2>1. Responsable del Tratamiento</h2>
            <p>Script Cue<br>Email: scriptcue@gmail.com</p>

            <h2>2. Datos que recopilamos</h2>
            
            <h3>2.1 Datos proporcionados por el usuario</h3>
            <ul>
                <li>Nombre o alias</li>
                <li>Email</li>
                <li>Guiones importados manualmente</li>
                <li>Grabaciones de audio y vídeo</li>
                <li>Carpetas y proyectos creados dentro de la app</li>
                <li>Preferencias de uso (modo coche, modo escena, modo estudio, etc.)</li>
            </ul>

            <h3>2.2 Datos generados automáticamente</h3>
            <ul>
                <li>Identificador interno de usuario</li>
                <li>Historial de sesiones</li>
                <li>Estadísticas de uso</li>
                <li>Resultados de análisis generados por IA (si el usuario los solicita)</li>
            </ul>

            <h3>2.3 Datos sensibles</h3>
            <p>Las grabaciones solo son procesadas bajo petición explícita del usuario y nunca se comparten ni utilizan para entrenar modelos externos.</p>

            <h3>2.4 Datos de terceros en grabaciones</h3>
            <p>Si el usuario graba a otros actores/actrices (diálogos en audiciones, ensayos con terceros), el usuario es responsable de:</p>
            <ul>
                <li>Obtener consentimiento explícito de otros participantes.</li>
                <li>Informarles de que sus voces/imágenes se guardan en la app.</li>
                <li>Cumplir normativas de protección de datos (RGPD, LSRFP, etc.).</li>
            </ul>
            <p>Script Cue no es responsable del uso indebido de grabaciones de terceros.</p>

            <h2>3. Finalidad del tratamiento</h2>
            <p>Utilizamos los datos únicamente para:</p>
            <ul>
                <li>mostrar guiones, grabaciones y proyectos dentro de la app,</li>
                <li>permitir las funciones de grabación,</li>
                <li>realizar análisis mediante IA cuando el usuario lo solicita,</li>
                <li>almacenar archivos en servidores externos (por ejemplo, Supabase),</li>
                <li>mejorar las funcionalidades internas de la aplicación,</li>
                <li>permitir sincronización entre dispositivos (si está activada).</li>
            </ul>
            <p>No vendemos, comercializamos ni cedemos datos a terceros.</p>

            <h2>4. Base legal</h2>
            <p>Tu consentimiento explícito al registrarte y al usar las funciones que implican grabación o análisis mediante IA.</p>

            <h2>5. Almacenamiento de datos</h2>
            <p>Los datos se almacenan en: el dispositivo del usuario (modo local), o servidores externos como Supabase (modo en la nube).</p>
            <p>Adoptamos medidas razonables de seguridad para evitar accesos no autorizados, aunque ningún sistema puede garantizar seguridad absoluta.</p>

            <h3>5.1 Almacenamiento local</h3>
            <ul>
                <li>Los archivos se guardan en la memoria del dispositivo.</li>
                <li>Script Cue no tiene acceso al almacenamiento local.</li>
                <li>La responsabilidad de hacer backup es del usuario.</li>
            </ul>

            <h3>5.2 Almacenamiento remoto (Supabase)</h3>
            <ul>
                <li>Se usa encriptación en tránsito (HTTPS/TLS).</li>
                <li>Los servidores están en EU.</li>
                <li>Supabase tiene sus propias políticas de seguridad.</li>
                <li>En caso de vulneración, Supabase notificará a los usuarios.</li>
            </ul>

            <h3>5.3 Retención de datos borrados</h3>
            <ul>
                <li>Los datos se marcan como eliminados inmediatamente.</li>
                <li>Las copias de seguridad pueden conservarlos 30 días más.</li>
                <li>Cumplimos RGPD en caso de que aplique.</li>
            </ul>

            <h2>6. Conservación de los datos</h2>
            <p>Los datos se conservan mientras la cuenta esté activa o hasta que el usuario solicite su eliminación.</p>

            <h2>7. Acceso a grabaciones</h2>
            <p>Las grabaciones de audio o vídeo: pertenecen al usuario, se procesan solo cuando el usuario ejecuta una función que lo requiere, no se comparten con terceros, y no se emplean para entrenar modelos de IA externos.</p>

            <h2>8. Derechos del usuario</h2>
            <p>Puedes solicitar en cualquier momento: acceso a tus datos, rectificación, eliminación completa, y suspensión de cuenta.</p>
            <p>Para ejercer tus derechos, escribe a scriptcue@gmail.com</p>

            <h2>9. Servicios de Terceros</h2>
            
            <h3>9.1 Supabase</h3>
            <ul>
                <li>Proveedor: Supabase (supabase.com).</li>
                <li>Ubicación de los servidores: EU.</li>
                <li>Datos transferidos: usuario, guiones, grabaciones, análisis.</li>
                <li>Política: https://supabase.com/privacy</li>
            </ul>

            <h3>9.2 APIs de IA (OpenAI, Elevenlabs, etc.)</h3>
            <ul>
                <li>Datos compartidos: Texto de guiones, transcripciones de audio.</li>
                <li>Restricción: NUNCA se comparten grabaciones de video/audio completas.</li>
                <li>Estos servicios pueden tener sus propias retenciones de datos.</li>
            </ul>

            <h3>9.3 Datos no compartidos</h3>
            <p>En NINGÚN caso compartimos con terceros: Grabaciones de video completas, Datos de contacto de otros usuarios, o Historial de búsquedas o preferencias.</p>

            <h2>10. Cambios en esta Política</h2>
            <p>Podemos modificar esta Política. Notificaremos las actualizaciones dentro de la App.</p>
"""

with open('/Users/alexdiaz/Documents/RS/landing/legal/privacy.html', 'w') as f:
    f.write(template.format(
        title="Política de Privacidad",
        date_html='<span class="legal-date">Última actualización: 10 de diciembre de 2024</span>',
        content=privacy_content
    ))

# AI USAGE
ai_content = """
            <div class="legal-disclaimer">
                <h3>Uso como herramienta creativa</h3>
                <p>Esta aplicación utiliza Inteligencia Artificial como herramienta creativa y educativa.</p>
            </div>

            <h2>¿Cómo usamos la IA?</h2>
            <p>Esta aplicación utiliza modelos de Inteligencia Artificial para:</p>
            <ul>
                <li>Generar respuestas de personajes</li>
                <li>Analizar interpretaciones</li>
                <li>Transcribir texto</li>
                <li>Reformatear guiones</li>
                <li>Ofrecer retroalimentación personalizada</li>
            </ul>

            <h2>Importante: Limitaciones de la IA</h2>
            <p>Los resultados generados por IA:</p>
            <ul>
                <li><strong>Pueden contener imprecisiones</strong><br>La IA no es perfecta y puede cometer errores en sus análisis o sugerencias.</li>
                <li><strong>No son consejos profesionales</strong><br>Las recomendaciones de la IA no sustituyen el asesoramiento de un coach, director o profesor de interpretación.</li>
                <li><strong>Son una ayuda creativa y educativa</strong><br>Utiliza la IA como una herramienta complementaria para tu práctica, no como única fuente de aprendizaje.</li>
            </ul>

            <h2>Tu control sobre la IA</h2>
            <ul>
                <li>Todas las funciones de IA requieren tu acción explícita</li>
                <li>Puedes elegir cuándo y cómo usar las herramientas de IA</li>
                <li>Tus grabaciones nunca se usan para entrenar modelos externos</li>
                <li>Los análisis se realizan solo cuando tú lo solicitas</li>
            </ul>

            <h2>Responsabilidad del usuario</h2>
            <p>El usuario acepta que:</p>
            <ul>
                <li>Verifica la precisión del contenido generado por IA antes de usarlo.</li>
                <li>La IA puede:
                    <ul>
                        <li>Malinterpretar emociones en video/audio.</li>
                        <li>Generar sugerencias inadecuadas para géneros específicos.</li>
                        <li>Cometer errores de transcripción.</li>
                    </ul>
                </li>
                <li>El usuario es responsable de cualquier feedback incorrecto de IA que use en audiciones reales.</li>
                <li>Script Cue no será responsable de:
                    <ul>
                        <li>Pérdida de oportunidades por seguir recomendaciones de IA.</li>
                        <li>Crítica negativa de colegas basada en análisis de IA.</li>
                        <li>Daños emocionales derivados del feedback automático.</li>
                    </ul>
                </li>
            </ul>

            <h2>Privacidad y Seguridad</h2>
            <ul>
                <li>Tus datos personales están protegidos</li>
                <li>No compartimos tu información con terceros</li>
                <li>Los análisis de IA se procesan de forma segura</li>
                <li>Conservas todos los derechos sobre tus grabaciones</li>
            </ul>

            <div class="legal-disclaimer">
                <h3>Disclaimer</h3>
                <p>Al usar las funciones de IA en esta aplicación, reconoces que entiendes sus limitaciones y que la usarás como una herramienta complementaria, no como sustituto del aprendizaje profesional.</p>
            </div>

            <p style="text-align: center; font-style: italic; margin-top: 40px;">¿Preguntas sobre el uso de IA?<br>Contacta con nosotros: scriptcue@gmail.com</p>
"""

with open('/Users/alexdiaz/Documents/RS/landing/legal/ai.html', 'w') as f:
    f.write(template.format(
        title="Uso de Inteligencia Artificial",
        date_html='',
        content=ai_content
    ))

print("Legal pages generated successfully.")
