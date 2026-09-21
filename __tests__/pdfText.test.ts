import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { spawnSync } from 'child_process';
// pdf.js (dentro de pdf-parse) no funciona bajo el entorno de jest (Uint8Array de otro "realm"),
// así que en los tests se simula; el comportamiento real de pdf-parse se comprobó a mano.
jest.mock('../server/node_modules/pdf-parse', () => jest.fn(async () => ({ text: 'texto de respaldo' })));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractPdfText } = require('../server/pdfText');

// Minimal one-page PDF whose content stream writes the word BEFORE its opening parenthesis,
// although the "(" is drawn to the left of it — the same layout that made pdf-parse return
// "(amenazante)" as "amenazante()".
function buildPdf(): Buffer {
    const stream = [
        'BT /F1 12 Tf 100 700 Td (amenazante) Tj ET',
        'BT /F1 12 Tf 92.8 700 Td (\\() Tj ET',
        'BT /F1 12 Tf 172 700 Td (\\)) Tj ET',
        'BT /F1 12 Tf 100 680 Td (Hola mundo) Tj ET',
    ].join('\n');
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    ];
    let body = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((obj, i) => {
        offsets.push(body.length);
        body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefStart = body.length;
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(body, 'latin1');
}

const hasPoppler = spawnSync('pdftotext', ['-v']).error === undefined;

afterEach(() => {
    delete process.env.PDFTOTEXT_BIN;
});

describe('extractPdfText', () => {
    (hasPoppler ? it : it.skip)('usa poppler y respeta la posición del paréntesis', async () => {
        const { text, engine } = await extractPdfText(buildPdf());
        expect(engine).toBe('poppler');
        expect(text).toContain('(amenazante)');
        expect(text).toContain('Hola mundo');
    });

    it('cae a pdf-parse si poppler no está instalado', async () => {
        process.env.PDFTOTEXT_BIN = 'pdftotext-que-no-existe';
        const { text, engine } = await extractPdfText(buildPdf());
        expect(engine).toBe('pdf-parse');
        expect(text).toBe('texto de respaldo');
    });
});
