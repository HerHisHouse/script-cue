import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'info@scriptcue.es';
const FROM_NAME = 'ScriptCue';

const WELCOME_HTML = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light dark"/>
  <meta name="supported-color-schemes" content="light dark"/>
  <title>Bienvenido a ScriptCue</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; display: block; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }

    @media (prefers-color-scheme: dark) {
      .body-bg    { background-color: #0f0f17 !important; }
      .card-bg    { background-color: #1a1a2e !important; }
      .footer-bg  { background-color: #12121e !important; }
      .body-text  { color: #ccccdd !important; }
      .muted-text { color: #8888aa !important; }
      .mode-card-bg { background-color: #1e1b38 !important; border-color: #3d2f8f !important; }
      .mode-name  { color: #ffffff !important; }
      .mode-desc  { color: #aaaacc !important; }
      .divider    { border-color: #2a2a44 !important; }
      .section-label { color: #a78bfa !important; }
      .fallback-text { color: #6666aa !important; }
      .header-text { color: #ffffff !important; }
      .header-sub  { color: #9999cc !important; }
      .eyebrow-text { color: #c4b5fd !important; }
    }
    @media only screen and (max-width: 600px) {
      .wrapper    { width: 100% !important; }
      .td-pad     { padding-left: 20px !important; padding-right: 20px !important; }
      .header-title { font-size: 26px !important; }
      .btn        { padding: 14px 36px !important; font-size: 14px !important; }
      .half-td    { display: block !important; width: 100% !important; padding-right: 0 !important; padding-bottom: 12px !important; }
    }
  </style>
</head>
<body class="body-bg" style="margin:0;padding:0;background-color:#f0eeff;">

<div style="display:none;font-size:1px;color:#f0eeff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  Ya eres parte de ScriptCue. Descubre todo lo que puedes hacer con tu nueva cuenta.
</div>

<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding:32px 16px;">

  <table class="wrapper card-bg" role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #ddd8f5;">

    <!-- ══ HEADER ══ -->
    <tr>
      <td align="center" style="background-color:#100e24;background-image:linear-gradient(160deg,#1e1440 0%,#0f0f17 50%,#1a1a2e 100%);padding:52px 32px 44px;border-radius:20px 20px 0 0;">

        <img
          src="https://yucsroyorgebeuvcsmib.supabase.co/storage/v1/object/public/Public/Logo_Blanco.png"
          alt="ScriptCue"
          width="64"
          height="64"
          style="width:64px;height:64px;display:block;margin:0 auto 24px;"
        />

        <!-- CAMBIO 1: Eyebrow pill — "Cuenta creada" en vez de "Activa tu cuenta" -->
        <div class="eyebrow-text" style="display:inline-block;font-family:'Inter',Arial,sans-serif;font-size:10px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:2px;background:rgba(124,106,247,0.2);border:1px solid rgba(167,139,250,0.4);padding:5px 18px;border-radius:20px;margin-bottom:20px;">
          ¡Cuenta creada! 🎉
        </div>

        <h1 class="header-title header-text" style="font-family:'Inter',Arial,sans-serif;font-size:30px;font-weight:700;color:#ffffff;letter-spacing:-0.8px;line-height:1.25;margin:0 0 12px;">
          <span class="header-text" style="color:#ffffff;">Te doy la bienvenida<br/>a </span><span style="color:#a78bfa;">ScriptCue</span>
        </h1>

        <p class="header-sub" style="font-family:'Inter',Arial,sans-serif;font-size:15px;color:#bbbbdd;line-height:1.6;margin:0;max-width:360px;margin-left:auto;margin-right:auto;">
          La réplica que siempre necesitaste,<br/>disponible 24/7
        </p>

      </td>
    </tr>

    <!-- ══ BODY ══ -->
    <tr>
      <td class="td-pad" style="padding:44px 36px;">

        <!-- CAMBIO 2: Saludo adaptado — sin mención a confirmar correo -->
        <p class="body-text" style="font-family:'Inter',Arial,sans-serif;font-size:15px;color:#4a4a6a;line-height:1.75;margin:0 0 32px;">
          ¡Hola! 👋<br/><br/>
          Tu cuenta de ScriptCue ya está activa. A partir de ahora tienes acceso a todos los modos para ensayar, memorizar tus guiones y grabar selftapes profesionales con la réplica en tiempo real.
        </p>

        <!-- CAMBIO 3: Botón hacia la web en vez de confirmación -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:4px 0 36px;">
            <a href="https://scriptcue.es" class="btn" style="display:inline-block;background-color:#7c6af7;background-image:linear-gradient(135deg,#7c6af7 0%,#9b87f5 100%);color:#ffffff;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-size:15px;font-weight:600;padding:16px 52px;border-radius:12px;letter-spacing:0.2px;mso-padding-alt:0;text-align:center;">
              <!--[if mso]><i style="letter-spacing:52px;mso-font-width:-100%;mso-text-raise:30pt">&nbsp;</i><![endif]-->
              Conoce la app a fondo
              <!--[if mso]><i style="letter-spacing:52px;mso-font-width:-100%">&nbsp;</i><![endif]-->
            </a>
          </td>
        </tr>
        </table>

        <!-- Label sección modos -->
        <p class="section-label" style="font-family:'Inter',Arial,sans-serif;font-size:11px;font-weight:700;color:#7c6af7;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 20px;">
          Tienes acceso a:
        </p>

        <!-- ══ MODOS — fila 1 ══ -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:12px;">
        <tr>
          <td class="half-td mode-card-bg" valign="top" width="50%" style="padding-right:6px;padding-bottom:0;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="background-color:#f5f3ff;border:1px solid #ddd8f5;border-radius:14px;padding:18px 16px;">
                <p style="font-size:22px;margin:0 0 10px;line-height:1;">🎭</p>
                <p class="mode-name" style="font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:700;color:#0f0f17;margin:0 0 6px;">Modo Estudio</p>
                <p class="mode-desc" style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#5a5a7a;line-height:1.55;margin:0;">Practica escenas con la App dándote la réplica con voces realistas.</p>
              </td>
            </tr>
            </table>
          </td>
          <td class="half-td mode-card-bg" valign="top" width="50%" style="padding-left:6px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="background-color:#f5f3ff;border:1px solid #ddd8f5;border-radius:14px;padding:18px 16px;">
                <p style="font-size:22px;margin:0 0 10px;line-height:1;">🎬</p>
                <p class="mode-name" style="font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:700;color:#0f0f17;margin:0 0 6px;">Modo Casting</p>
                <p class="mode-desc" style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#5a5a7a;line-height:1.55;margin:0;">Graba tu selftape con el guion en el teleprompter y escucha la réplica en directo.</p>
              </td>
            </tr>
            </table>
          </td>
        </tr>
        </table>

        <!-- ══ MODOS — fila 2 ══ -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:12px;">
        <tr>
          <td class="half-td mode-card-bg" valign="top" width="50%" style="padding-right:6px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="background-color:#f5f3ff;border:1px solid #ddd8f5;border-radius:14px;padding:18px 16px;">
                <p style="font-size:22px;margin:0 0 10px;line-height:1;">🧠</p>
                <p class="mode-name" style="font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:700;color:#0f0f17;margin:0 0 6px;">Modo Memoria</p>
                <p class="mode-desc" style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#5a5a7a;line-height:1.55;margin:0;">Memoriza tus líneas con juegos y desafíos adaptativos.</p>
              </td>
            </tr>
            </table>
          </td>
          <td class="half-td mode-card-bg" valign="top" width="50%" style="padding-left:6px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="background-color:#f5f3ff;border:1px solid #ddd8f5;border-radius:14px;padding:18px 16px;">
                <p style="font-size:22px;margin:0 0 10px;line-height:1;">🔍</p>
                <p class="mode-name" style="font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:700;color:#0f0f17;margin:0 0 6px;">Modo Escena</p>
                <p class="mode-desc" style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#5a5a7a;line-height:1.55;margin:0;">Explora nuevas posibilidades interpretativas mediante ejercicios, retos y propuestas.</p>
              </td>
            </tr>
            </table>
          </td>
        </tr>
        </table>

        <!-- ══ MODOS — fila 3 ══ -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
        <tr>
          <td class="half-td mode-card-bg" valign="top" width="50%" style="padding-right:6px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="background-color:#f5f3ff;border:1px solid #ddd8f5;border-radius:14px;padding:18px 16px;">
                <p style="font-size:22px;margin:0 0 10px;line-height:1;">📊</p>
                <p class="mode-name" style="font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:700;color:#0f0f17;margin:0 0 6px;">Modo Análisis</p>
                <p class="mode-desc" style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#5a5a7a;line-height:1.55;margin:0;">Analiza objetivos, conflictos, emociones y subtexto de la escena o pídele a la ScriptCue que lo examine.</p>
              </td>
            </tr>
            </table>
          </td>
          <td class="half-td mode-card-bg" valign="top" width="50%" style="padding-left:6px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="background-color:#f5f3ff;border:1px solid #ddd8f5;border-radius:14px;padding:18px 16px;">
                <p style="font-size:22px;margin:0 0 10px;line-height:1;">🚗</p>
                <p class="mode-name" style="font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:700;color:#0f0f17;margin:0 0 6px;">Modo Coche</p>
                <p class="mode-desc" style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#5a5a7a;line-height:1.55;margin:0;">Escucha la escena en bucle mientras conduces, entrenas o haces la compra.</p>
              </td>
            </tr>
            </table>
          </td>
        </tr>
        </table>

        <!-- Divider -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr><td class="divider" style="border-top:1px solid #e5e0f5;padding:0;margin:0 0 28px;">&nbsp;</td></tr>
        </table>

        <!-- Nota final — sin fallback de URL ni caducidad -->
        <p class="fallback-text" style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#8888aa;text-align:center;line-height:1.7;margin:0;">
          Si tienes cualquier pregunta o necesitas ayuda,<br/>
          escríbenos a <a href="mailto:info@scriptcue.es" style="color:#7c6af7;text-decoration:none;">info@scriptcue.es</a>
        </p>

      </td>
    </tr>

    <!-- ══ FOOTER ══ -->
    <tr>
      <td class="footer-bg" style="background-color:#f5f3ff;padding:24px 36px;text-align:center;border-top:1px solid #e5e0f5;border-radius:0 0 20px 20px;">
        <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:600;color:#5a5a7a;margin:0 0 10px;">
          ScriptCue — La app para actores y actrices
        </p>
        <p style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#9090b0;margin:0 0 12px;">
          <a href="https://scriptcue.es" style="color:#7c6af7;text-decoration:none;">Web</a>
          &nbsp;·&nbsp;
          <a href="mailto:info@scriptcue.es" style="color:#7c6af7;text-decoration:none;">Soporte</a>
          &nbsp;·&nbsp;
          <a href="https://scriptcue.es/legal/privacy.html" style="color:#7c6af7;text-decoration:none;">Privacidad</a>
        </p>
        <p style="font-family:'Inter',Arial,sans-serif;font-size:11px;color:#b0b0c8;margin:0;">
          © 2026 ScriptCue. Todos los derechos reservados.
        </p>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
`;
// El HTML completo del email de bienvenida para Google
// se proporcionará en el siguiente paso

serve(async (req) => {
  try {
    const payload = await req.json();
    const user = payload.record;

    if (!user) {
      return new Response('No user data', { status: 400 });
    }

    const provider = user.raw_app_meta_data?.provider ||
                     user.identities?.[0]?.provider;
    const isGoogleUser = provider === 'google';
    
    if (!isGoogleUser) {
      console.log('No es usuario de Google, saltando. Provider encontrado:', provider);
      return new Response('Not a Google user', { status: 200 });
    }

    const userEmail = user.email;
    const userName = user.raw_user_meta_data?.full_name || 
                     user.raw_user_meta_data?.name || 
                     '';

    if (!userEmail) {
      return new Response('No email found', { status: 400 });
    }

    console.log(`Enviando email de bienvenida a: ${userEmail}`);

    const greeting = userName 
      ? `¡Hola, ${userName.split(' ')[0]}! 👋`
      : '¡Hola! 👋';

    // Personalizar el saludo con el nombre si está disponible
    const personalizedHtml = WELCOME_HTML.replace(
      '¡Hola! 👋',
      greeting
    );

    // Enviar email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [userEmail],
        subject: '¡Bienvenido a ScriptCue! 🎭',
        html: personalizedHtml,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Error enviando email:', data);
      return new Response(
        JSON.stringify({ error: data }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('Email de bienvenida enviado:', data.id);
    return new Response(
      JSON.stringify({ success: true, emailId: data.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en welcome-email function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
