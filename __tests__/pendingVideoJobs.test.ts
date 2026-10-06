import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const alertMock = jest.fn();
jest.mock('react-native', () => ({ Alert: { alert: alertMock } }));

/* eslint-disable @typescript-eslint/no-require-imports */
const store = require('../utils/pendingVideoJobs');
/* eslint-enable @typescript-eslint/no-require-imports */

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  alertMock.mockClear();
  for (const j of store.getPendingVideoJobs()) if (j.jobId) store.finishVideoJob(j.jobId);
});

describe('pendingVideoJobs', () => {
  it('aparece como subiendo al instante y pasa a procesando con el jobId', async () => {
    let resolveUpload: (r: unknown) => void = () => {};
    store.trackVideoUpload('selftape', () => new Promise((resolve) => { resolveUpload = resolve; }));
    expect(store.getPendingVideoJobs()).toMatchObject([{ kind: 'selftape', status: 'uploading' }]);

    resolveUpload({ jobId: 'casting_1' });
    await flush();
    expect(store.getPendingVideoJobs()).toMatchObject([{ kind: 'selftape', status: 'processing', jobId: 'casting_1' }]);

    store.finishVideoJob('casting_1');
    expect(store.getPendingVideoJobs()).toEqual([]);
  });

  it('si la subida devuelve un error, deja de seguirla y avisa con ese texto', async () => {
    store.trackVideoUpload('video', async () => ({ error: { title: 'Vídeo demasiado grande', message: 'Graba en 480p.' } }));
    await flush();
    expect(store.getPendingVideoJobs()).toEqual([]);
    expect(alertMock).toHaveBeenCalledWith('Vídeo demasiado grande', 'Graba en 480p.');
  });

  it('si la subida lanza una excepción (red), avisa con un mensaje genérico', async () => {
    store.trackVideoUpload('video', async () => { throw new Error('network'); });
    await flush();
    expect(store.getPendingVideoJobs()).toEqual([]);
    expect(alertMock).toHaveBeenCalledWith('No se pudo enviar el vídeo', 'Comprueba tu conexión e inténtalo de nuevo.');
  });

  it('avisa a los suscriptores de cada cambio', async () => {
    const seen: number[] = [];
    const unsubscribe = store.subscribePendingVideoJobs((jobs: unknown[]) => seen.push(jobs.length));
    store.trackVideoUpload('selftape', async () => ({ jobId: 'casting_2' }));
    await flush();
    store.finishVideoJob('casting_2');
    unsubscribe();
    expect(seen).toEqual([0, 1, 1, 0]);
  });
});
