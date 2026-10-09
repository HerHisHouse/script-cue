// Genera la plantilla "Confirm signup" de Supabase Auth a partir del mismo diseño que usa la
// función welcome-email. Ejecutar: node --experimental-strip-types supabase/templates/build.ts
// y pegar supabase/templates/confirmacion-registro.html en Supabase → Authentication → Emails.
import { writeFileSync } from 'node:fs';
import { renderWelcomeEmail } from '../functions/_shared/welcomeEmailTemplate.ts';

writeFileSync('supabase/templates/confirmacion-registro.html', renderWelcomeEmail('confirm'));
console.log('supabase/templates/confirmacion-registro.html');
