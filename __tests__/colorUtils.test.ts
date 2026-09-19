import { withAlpha } from '../utils/colorUtils';

describe('withAlpha', () => {
  it('convierte #rrggbb', () => {
    expect(withAlpha('#8B5CF6', 0.2)).toBe('rgba(139,92,246,0.2)');
  });
  it('expande #rgb', () => {
    expect(withAlpha('#0af', 0.5)).toBe('rgba(0,170,255,0.5)');
  });
  it('acepta rgb() y rgba()', () => {
    expect(withAlpha('rgb(10, 20, 30)', 0.3)).toBe('rgba(10,20,30,0.3)');
    expect(withAlpha('rgba(10,20,30,0.9)', 0.3)).toBe('rgba(10,20,30,0.3)');
  });
  it('cae a blanco translúcido con valores no válidos', () => {
    expect(withAlpha(undefined, 0.2)).toBe('rgba(255,255,255,0.2)');
    expect(withAlpha('rojo', 0.2)).toBe('rgba(255,255,255,0.2)');
  });
  it('limita alpha a 0-1', () => {
    expect(withAlpha('#000000', 5)).toBe('rgba(0,0,0,1)');
  });
});
