/**
 * Correos de bienvenida de ScriptCue, con un único diseño claro que se ve igual en modo claro
 * y oscuro.
 *
 * Antes el HTML se declaraba "light dark" y traía reglas @media (prefers-color-scheme: dark)
 * que cada cliente aplicaba a su manera: Apple Mail ponía en blanco los títulos de las
 * tarjetas sin oscurecer su fondo (texto blanco sobre tarjeta clara). Ahora se declara
 * "light only" y no hay reglas de modo oscuro: Apple Mail lo muestra tal cual, y los
 * clientes que invierten por su cuenta (Gmail en iPhone) lo hacen de forma coherente
 * porque todo es claro (nada de cabecera oscura con texto blanco).
 *
 * Variantes:
 *  - 'confirm': plantilla "Confirm signup" de Supabase Auth (registro con email). Lleva
 *    {{ .ConfirmationURL }}, que rellena Supabase. Se pega en el panel de Supabase:
 *    supabase/templates/confirmacion-registro.html (generada con supabase/templates/build.ts).
 *  - 'google': la manda la función welcome-email al registrarse con Google.
 *
 * Solo TypeScript sin APIs de Deno ni Node: lo importan la función (Deno) y el script.
 */

export type WelcomeVariant = 'confirm' | 'google';

const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const C = {
  page: '#f4f2fb',
  card: '#ffffff',
  border: '#e4defa',
  title: '#1a1530',
  text: '#4a4763',
  muted: '#7d7a96',
  primary: '#7c6af7',
  primaryDark: '#5b47d6',
  tile: '#f7f5ff',
  pill: '#efebff',
};
const LOGO_URL = 'https://yucsroyorgebeuvcsmib.supabase.co/storage/v1/object/public/Public/Logo_Morado.png';

const MODES: [string, string, string][] = [
  ['🎭', 'Modo Estudio', 'Ensaya tus escenas con ScriptCue dándote la réplica con voces realistas.'],
  ['🎬', 'Modo Casting', 'Graba tu selftape con el guion en el teleprompter y la réplica en directo.'],
  ['🧠', 'Modo Memoria', 'Memoriza tus líneas con juegos y retos que refuerzan dónde fallas.'],
  ['🔍', 'Modo Escena', 'Descubre nuevas formas de interpretar cada escena con lecturas y propuestas.'],
  ['📊', 'Modo Análisis', 'Analiza objetivos, conflictos y subtexto, o deja que ScriptCue lo examine.'],
  ['🚗', 'Modo Coche', 'Escucha la escena en bucle mientras conduces, entrenas o haces la compra.'],
];

function modeTile([emoji, name, desc]: [string, string, string]): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${C.tile}" style="background-color:${C.tile};border:1px solid ${C.border};border-radius:14px;">
              <tr><td style="padding:18px 16px;">
                <p style="font-size:22px;line-height:1;margin:0 0 10px;">${emoji}</p>
                <p style="font-family:${FONT};font-size:14px;font-weight:700;color:${C.title};margin:0 0 6px;">${name}</p>
                <p style="font-family:${FONT};font-size:12px;line-height:1.55;color:${C.text};margin:0;">${desc}</p>
              </td></tr>
            </table>`;
}

function modeRows(): string {
  const rows: string[] = [];
  for (let i = 0; i < MODES.length; i += 2) {
    rows.push(`<table class="modes-row" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:12px;">
          <tr>
            <td class="half" valign="top" width="50%" style="padding-right:6px;">${modeTile(MODES[i])}</td>
            <td class="half" valign="top" width="50%" style="padding-left:6px;">${modeTile(MODES[i + 1])}</td>
          </tr>
        </table>`);
  }
  return rows.join('\n        ');
}

function button(href: string, label: string): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center">
          <tr><td align="center" bgcolor="${C.primary}" style="background-color:${C.primary};border-radius:12px;">
            <a href="${href}" class="btn" style="display:inline-block;padding:16px 48px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${label}</a>
          </td></tr>
        </table>`;
}

export function renderWelcomeEmail(variant: WelcomeVariant, greeting = '¡Hola! 👋'): string {
  const confirm = variant === 'confirm';
  const eyebrow = confirm ? 'Activa tu cuenta' : '¡Cuenta creada! 🎉';
  const preheader = confirm
    ? 'Confirma tu correo y empieza a ensayar con ScriptCue.'
    : 'Tu cuenta de ScriptCue ya está activa. ¡Empieza a ensayar!';
  const intro = confirm
    ? 'Gracias por unirte a ScriptCue. Confirma tu correo para activar tu cuenta y empezar a ensayar, memorizar tus guiones y grabar selftapes con la réplica en tiempo real.'
    : 'Tu cuenta de ScriptCue ya está activa. A partir de ahora puedes ensayar, memorizar tus guiones y grabar selftapes con la réplica en tiempo real.';
  const cta = confirm ? button('{{ .ConfirmationURL }}', 'Confirmar correo') : button('https://scriptcue.es', 'Conoce la app a fondo');
  const label = confirm ? 'Podrás tener acceso a:' : 'Tienes acceso a:';
  const closing = confirm
    ? `<p style="font-family:${FONT};font-size:12px;line-height:1.7;color:${C.muted};text-align:center;margin:0 0 8px;">¿No funciona el botón? Copia y pega este enlace en tu navegador:</p>
        <p style="font-family:${FONT};font-size:11px;line-height:1.7;text-align:center;word-break:break-all;margin:0 0 24px;"><a href="{{ .ConfirmationURL }}" style="color:${C.primaryDark};text-decoration:none;">{{ .ConfirmationURL }}</a></p>
        <p style="font-family:${FONT};font-size:12px;line-height:1.7;color:${C.muted};text-align:center;margin:0;">El enlace caduca en <strong>24 horas</strong>.<br/>Si no has creado una cuenta en ScriptCue, puedes ignorar este mensaje.</p>`
    : `<p style="font-family:${FONT};font-size:12px;line-height:1.7;color:${C.muted};text-align:center;margin:0;">¿Tienes dudas o sugerencias? Escríbenos a <a href="mailto:info@scriptcue.es" style="color:${C.primaryDark};text-decoration:none;">info@scriptcue.es</a>.</p>`;

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light only"/>
  <meta name="supported-color-schemes" content="light only"/>
  <title>ScriptCue</title>
  <style>
    :root { color-scheme: light only; supported-color-schemes: light only; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: separate; }
    img { -ms-interpolation-mode: bicubic; border: 0; display: block; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    @media only screen and (max-width: 600px) {
      .wrapper { width: 100% !important; }
      .pad { padding-left: 20px !important; padding-right: 20px !important; }
      .title { font-size: 26px !important; }
      .half { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; }
      .modes-row { margin-bottom: 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${C.page};">${preheader}</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:32px 16px;">

  <table class="wrapper" role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" bgcolor="${C.card}" style="max-width:600px;background-color:${C.card};border:1px solid ${C.border};border-radius:20px;">

    <tr><td align="center" class="pad" style="padding:44px 36px 8px;">
      <img src="${LOGO_URL}" alt="ScriptCue" width="56" height="56" style="width:56px;height:56px;margin:0 auto 20px;"/>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px;">
        <tr><td bgcolor="${C.pill}" style="background-color:${C.pill};border-radius:20px;padding:5px 16px;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.primaryDark};">${eyebrow}</td></tr>
      </table>
      <h1 class="title" style="font-family:${FONT};font-size:30px;font-weight:800;line-height:1.25;letter-spacing:-0.6px;color:${C.title};margin:0 0 10px;">Te doy la bienvenida a <span style="color:${C.primary};">ScriptCue</span></h1>
      <p style="font-family:${FONT};font-size:15px;line-height:1.6;color:${C.muted};margin:0;">La réplica que siempre necesitaste, disponible 24/7</p>
    </td></tr>

    <tr><td class="pad" style="padding:32px 36px 40px;">
      <p style="font-family:${FONT};font-size:15px;line-height:1.75;color:${C.text};margin:0 0 28px;">${greeting}<br/><br/>${intro}</p>
      ${cta}
      <p style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.primaryDark};margin:36px 0 16px;">${label}</p>
        ${modeRows()}
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 24px;">
        <tr><td style="border-top:1px solid ${C.border};font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
        ${closing}
    </td></tr>

    <tr><td align="center" bgcolor="${C.tile}" style="background-color:${C.tile};border-top:1px solid ${C.border};border-radius:0 0 20px 20px;padding:24px 36px;">
      <p style="font-family:${FONT};font-size:13px;font-weight:600;color:${C.text};margin:0 0 10px;">ScriptCue — La app para actores y actrices</p>
      <p style="font-family:${FONT};font-size:12px;color:${C.muted};margin:0 0 12px;">
        <a href="https://scriptcue.es" style="color:${C.primaryDark};text-decoration:none;">Web</a>&nbsp;·&nbsp;<a href="mailto:info@scriptcue.es" style="color:${C.primaryDark};text-decoration:none;">Soporte</a>&nbsp;·&nbsp;<a href="https://scriptcue.es/legal/privacy.html" style="color:${C.primaryDark};text-decoration:none;">Privacidad</a>
      </p>
      <p style="font-family:${FONT};font-size:11px;color:${C.muted};margin:0;">© 2026 ScriptCue. Todos los derechos reservados.</p>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>
`;
}
