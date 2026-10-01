// Lógica pura (sin imports de React Native) de cómo convive la app con la barra de
// navegación de Android. La usa components/AndroidNavBarGuard.tsx y la cubren los
// tests de __tests__/androidNavBar.test.ts. Ver la sección "Barra de navegación de
// Android" de CLAUDE.md antes de cambiar nada aquí.

// Con navegación por gestos el inset inferior es la barrita (~16-34dp); con la barra
// de 2 o 3 botones es ~42-48dp. No hay API JS para saber el modo de navegación, así
// que se deduce del tamaño del inset.
export const ANDROID_BUTTON_NAV_MIN_INSET = 40;

// Color de la franja que queda detrás de los botones: el final del degradado de
// fondo de la app (assets/images/ui-dark-bg.png termina en negro puro y
// ui-light-bg.png en #FEFEFE), para que la franja se funda con las pantallas.
export const NAV_STRIP_DARK = '#000000';
export const NAV_STRIP_LIGHT = '#FEFEFE';

export function shouldReserveAndroidNavBar(os: string, bottomInset: number): boolean {
  return os === 'android' && bottomInset >= ANDROID_BUTTON_NAV_MIN_INSET;
}

export function navStripColor(isDark: boolean, override: string | null): string {
  return override ?? (isDark ? NAV_STRIP_DARK : NAV_STRIP_LIGHT);
}

// Botones claros sobre franja oscura y viceversa. Acepta #RGB y #RRGGBB.
export function isDarkColor(hex: string): boolean {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}
