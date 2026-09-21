const { spawn } = require('child_process');
const pdfParse = require('pdf-parse');

const PDFTOTEXT_TIMEOUT_MS = 30000;

/**
 * Runs poppler's `pdftotext` on an in-memory PDF (stdin -> stdout, nothing touches disk).
 * Default reading order, not `-layout`: layout mode adds ~50% more characters as indentation,
 * which eats into the 50k-character limit sent to OpenAI and breaks the regex fallback parser.
 */
function runPdftotext(buffer, extraArgs = []) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.env.PDFTOTEXT_BIN || 'pdftotext', [...extraArgs, '-enc', 'UTF-8', '-nopgbrk', '-', '-'], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const out = [];
        const err = [];
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fn(value);
        };
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            finish(reject, new Error(`pdftotext timed out after ${PDFTOTEXT_TIMEOUT_MS}ms`));
        }, PDFTOTEXT_TIMEOUT_MS);

        child.stdout.on('data', (chunk) => out.push(chunk));
        child.stderr.on('data', (chunk) => err.push(chunk));
        child.on('error', (e) => finish(reject, e)); // e.g. ENOENT when poppler is not installed
        child.on('close', (code) => {
            if (code === 0) finish(resolve, Buffer.concat(out).toString('utf8'));
            else finish(reject, new Error(`pdftotext exited with ${code}: ${Buffer.concat(err).toString('utf8').trim()}`));
        });
        // pdftotext may exit before consuming all input (corrupt PDF); the 'close' handler reports it.
        child.stdin.on('error', () => {});
        child.stdin.end(buffer);
    });
}

/**
 * Extracts the text of a PDF. Poppler first (orders text by its position on the page, which
 * pdf-parse does not: it returned "(amenazante)" as "amenazante()"), pdf-parse as fallback if
 * poppler is missing (native Node runtime, local dev without it) or returns nothing.
 * Resolves { text, engine } where engine is 'poppler' | 'pdf-parse'.
 */
async function extractPdfText(buffer) {
    try {
        const text = await runPdftotext(buffer);
        if (text && text.trim().length > 0) return { text, engine: 'poppler' };
        console.warn('pdftotext returned no text, falling back to pdf-parse');
    } catch (e) {
        console.warn('pdftotext unavailable or failed, falling back to pdf-parse:', e.message);
    }
    const parsed = await pdfParse(buffer);
    return { text: (parsed && parsed.text) || '', engine: 'pdf-parse' };
}

/**
 * Same text but keeping the horizontal layout (indentation), for the OpenAI parser: character
 * cues are centered, dialogue is indented and actions sit at the left margin, which is what
 * tells them apart. Poppler only: returns null if it is unavailable (the plain text is used then).
 */
async function extractPdfLayoutText(buffer) {
    try {
        const text = await runPdftotext(buffer, ['-layout']);
        return text && text.trim().length > 0 ? text : null;
    } catch (e) {
        console.warn('pdftotext -layout unavailable, using plain text:', e.message);
        return null;
    }
}

module.exports = { extractPdfText, extractPdfLayoutText };
