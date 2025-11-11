export function computeSafeTopPadding(insetTop: number): number {
  // Asegura un margen adicional para que los elementos no queden pegados arriba.
  // iPhone modernos suelen tener insets de 44–59px, los antiguos ~20px.
  // Sumamos un pequeño margen y garantizamos un mínimo.
  const extra = 6;
  const minPadding = 12;
  return Math.max(minPadding, Math.floor(insetTop + extra));
}