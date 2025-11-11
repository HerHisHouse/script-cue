import fs from 'fs';

function read(path: string): string {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch (e) {
    throw new Error(`No se pudo leer ${path}: ${(e as Error).message}`);
  }
}

function extractMenuLabels(src: string): string[] {
  // Busca los textos dentro de los elementos del menú de encabezado
  const labels: string[] = [];
  const regex = /<Text[^>]*>\s*([^<]+)\s*<\/Text>/g;
  let m;
  while ((m = regex.exec(src))) {
    const t = m[1].trim();
    if ([
      'Búsqueda avanzada',
      'Selección múltiple',
      'Vista de cuadrícula',
      'Vista de lista',
    ].includes(t)) {
      labels.push(t);
    }
  }
  return labels;
}

describe('Consistencia de menús de encabezado', () => {
  const scriptsPath = 'app/(tabs)/index.tsx';
  const projectsPath = 'app/(tabs)/projects.tsx';
  const recordingsPath = 'app/(tabs)/recordings.tsx';

  test('Mis guiones incluye el botón MoreVertical y opciones requeridas', () => {
    const src = read(scriptsPath);
    expect(src).toContain('MoreVertical');
    expect(src).toContain('Búsqueda avanzada');
    expect(src).toContain('Selección múltiple');
    // Debe contener al menos una de las vistas
    expect(src.includes('Vista de cuadrícula') || src.includes('Vista de lista')).toBe(true);
  });

  test('Orden de opciones es coherente entre pantallas', () => {
    const s = extractMenuLabels(read(scriptsPath));
    const p = extractMenuLabels(read(projectsPath));
    const r = extractMenuLabels(read(recordingsPath));

    // Las primeras dos opciones y su orden deben coincidir (búsqueda y selección)
    expect(s.slice(0, 2)).toEqual(p.slice(0, 2));
    expect(s.slice(0, 2)).toEqual(r.slice(0, 2));
  });
});