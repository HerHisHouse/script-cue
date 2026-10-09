import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { renderWelcomeEmail } from '../_shared/welcomeEmailTemplate.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'info@scriptcue.es';
const FROM_NAME = 'ScriptCue';

// Mismo diseño que la plantilla de confirmación de Supabase (ver _shared/welcomeEmailTemplate.ts).
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

    // Saludo con el nombre si Google lo da (escapado: va dentro del HTML)
    const personalizedHtml = renderWelcomeEmail('google', escapeHtml(greeting));

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
