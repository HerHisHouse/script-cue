/**
 * Devuelve `color` con la opacidad `alpha` (0-1) como cadena rgba().
 * Acepta #rgb, #rrggbb, rgb() y rgba(); si no reconoce el formato devuelve
 * un blanco translúcido para que nunca falle el render.
 */
export function withAlpha(color: string | undefined | null, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  const fallback = `rgba(255,255,255,${a})`;
  if (!color) return fallback;
  const c = color.trim();

  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  const rgb = c.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${a})`;

  return fallback;
}
