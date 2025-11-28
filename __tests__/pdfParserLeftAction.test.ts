import { describe, it, expect } from '@jest/globals'
import { parseScreenplay } from '../utils/pdfParser'

describe('parseScreenplay filtra acotaciones alineadas a la izquierda', () => {
  it('no mezcla acción en el diálogo y separa personajes', () => {
    const input = [
      'INT. CASA - NOCHE',
      'NICOLE',
      '        Zumo.',
      'Él va a la cocina. Ella observa su apartamento de alquiler. La entristece.',
      'CHARLIE (O.S.)',
      '        Ah, por cierto…',
    ].join('\n')
    const parsed = parseScreenplay(input)
    const scene = parsed.scenes[0]
    expect(scene.content.length).toBe(2)
    expect(scene.content[0].characterName).toBe('NICOLE')
    expect(scene.content[0].text.trim()).toBe('Zumo.')
    expect(scene.content[1].characterName).toBe('CHARLIE (O.S.)')
  })
})
