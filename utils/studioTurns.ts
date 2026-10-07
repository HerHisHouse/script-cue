/**
 * ¿La siguiente línea con voz (saltando tarjetas de acción) es del usuario?
 * Estudio solo prepara el micrófono por adelantado en ese caso: si después sonara otra
 * réplica de la IA, el cambio a modo reproducción de iOS dejaría esa grabación muerta.
 */
export function nextSpokenLineIsUser(
  lines: { isUserCharacter?: boolean; isAction?: boolean }[],
  index: number,
  loop: boolean,
): boolean {
  for (let step = 1; step <= lines.length; step++) {
    let next = index + step;
    if (next >= lines.length) {
      if (!loop) return false;
      next %= lines.length;
    }
    const line = lines[next];
    if (line.isAction) continue;
    return !!line.isUserCharacter;
  }
  return false;
}
