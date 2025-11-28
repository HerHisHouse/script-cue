import { describe, it, expect } from '@jest/globals'

function buildDialogueFromStructured(lines: any[], characters: any[]) {
  const out: any[] = []
  let idx = 0
  let activeName: string | null = null
  const normalizeName = (name: string) => (name || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  for (const ln of lines) {
    if (ln.type === 'character' && ln.name) {
      activeName = String(ln.name)
    } else if (ln.type === 'dialogue' && ln.text && activeName) {
      const x = typeof ln.x === 'number' ? ln.x : 0.5
      if (x < 0.35 || x > 0.65) continue
      const target = normalizeName(activeName)
      const character = characters.find((c: any) => normalizeName(c.name) === target)
      const cleanText = (String(ln.text) || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
      if (!cleanText) continue
      const id = `${(character?.id || 'unknown')}-${idx}`
      out.push({ id, characterId: character?.id || `unknown-${target}`, characterName: character?.name || activeName, text: String(ln.text), cleanText })
      idx++
    }
  }
  return out
}

describe('buildDialogueFromStructured', () => {
  it('filtra acciones y conserva solo diálogos centrados', () => {
    const lines = [
      { type: 'scene', text: 'INT. CASA - NOCHE', x: 0.1 },
      { type: 'character', name: 'NICOLE', x: 0.5 },
      { type: 'dialogue', text: 'Zumo.', x: 0.5 },
      { type: 'action', text: 'Él va a la cocina.', x: 0.1 },
      { type: 'character', name: 'CHARLIE (O.S.)', x: 0.5 },
      { type: 'dialogue', text: 'Ah, por cierto…', x: 0.5 },
    ]
    const characters = [
      { id: 'c1', name: 'NICOLE' },
      { id: 'c2', name: 'CHARLIE' },
    ]
    const result = buildDialogueFromStructured(lines, characters)
    expect(result.length).toBe(2)
    expect(result[0].characterName).toBe('NICOLE')
    expect(result[0].cleanText).toBe('Zumo.')
    expect(result[1].characterName).toBe('CHARLIE')
  })
})
