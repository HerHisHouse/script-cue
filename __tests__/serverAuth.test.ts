import { describe, it, expect, jest, beforeEach } from '@jest/globals';
/* eslint-disable @typescript-eslint/no-require-imports */
const { createRequireUser } = require('../server/auth');
/* eslint-enable @typescript-eslint/no-require-imports */

function setup(mode: string | undefined, getUser: any) {
    const supabase = { auth: { getUser } };
    let clock = 1_000;
    const middleware = createRequireUser(supabase, { getMode: () => mode, cacheMs: 60_000, now: () => clock });
    const run = async (authorization?: string) => {
        const req: any = { method: 'POST', path: '/tts-hume', headers: authorization ? { authorization } : {} };
        const res: any = { statusCode: 200, body: undefined };
        res.status = (c: number) => { res.statusCode = c; return res; };
        res.json = (b: any) => { res.body = b; return res; };
        const next = jest.fn();
        await middleware(req, res, next);
        return { req, res, next };
    };
    return { run, advance: (ms: number) => { clock += ms; } };
}

const validUser = async () => ({ data: { user: { id: 'user-1' } }, error: null });
const invalidToken = async () => ({ data: { user: null }, error: { message: 'invalid JWT' } });

beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('requireUser en modo warn (por defecto)', () => {
    it('deja pasar una petición sin token y lo avisa en el log', async () => {
        const { run } = setup(undefined, jest.fn(validUser));
        const { next, res } = await run();
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('sin token'));
    });

    it('deja pasar un token inválido, avisa y no rellena req.user', async () => {
        const { run } = setup('warn', jest.fn(invalidToken));
        const { next, req } = await run('Bearer malo');
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toBeUndefined();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('token inválido'));
    });

    it('con token válido rellena req.user', async () => {
        const { run } = setup('warn', jest.fn(validUser));
        const { next, req } = await run('Bearer bueno');
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toEqual({ id: 'user-1' });
    });
});

describe('requireUser en modo enforce', () => {
    it.each([
        ['sin token', undefined],
        ['con esquema distinto de Bearer', 'Basic abc'],
    ])('responde 401 %s', async (_name, header) => {
        const getUser = jest.fn(validUser);
        const { run } = setup('enforce', getUser);
        const { next, res } = await run(header as string | undefined);
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
        expect(getUser).not.toHaveBeenCalled();
    });

    it('responde 401 con un token inválido', async () => {
        const { run } = setup('enforce', jest.fn(invalidToken));
        const { next, res } = await run('Bearer malo');
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('responde 401 (falla cerrado) si Supabase no responde', async () => {
        const { run } = setup('enforce', jest.fn(async () => { throw new Error('network down'); }));
        const { next, res } = await run('Bearer bueno');
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('acepta un token válido', async () => {
        const { run } = setup('enforce', jest.fn(validUser));
        const { next, req, res } = await run('Bearer bueno');
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(req.user.id).toBe('user-1');
    });

    it('el modo se lee en cada petición (se puede cambiar sin reiniciar el middleware)', async () => {
        let mode = 'warn';
        const supabase = { auth: { getUser: jest.fn(validUser) } };
        const mw = createRequireUser(supabase, { getMode: () => mode });
        const call = async () => {
            const res: any = { status: (c: number) => { res.code = c; return res; }, json: () => res };
            const next = jest.fn();
            await mw({ method: 'GET', path: '/x', headers: {} }, res, next);
            return { res, next };
        };
        expect((await call()).next).toHaveBeenCalled();
        mode = 'enforce';
        expect((await call()).res.code).toBe(401);
    });
});

describe('caché de tokens verificados', () => {
    it('no vuelve a llamar a Supabase dentro de la ventana y sí cuando caduca', async () => {
        const getUser = jest.fn(validUser);
        const { run, advance } = setup('enforce', getUser);
        await run('Bearer bueno');
        await run('Bearer bueno');
        expect(getUser).toHaveBeenCalledTimes(1);
        advance(61_000);
        await run('Bearer bueno');
        expect(getUser).toHaveBeenCalledTimes(2);
    });
});
