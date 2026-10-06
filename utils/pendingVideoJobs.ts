import { Alert } from 'react-native';

/**
 * Subidas de vídeo de Casting (Selftape y Presentación) que siguen en marcha
 * después de salir de la pantalla de grabación.
 *
 * Antes Casting esperaba como mucho 5 s a que el servidor confirmara el trabajo
 * y, si la subida tardaba más (lo normal con un vídeo de decenas de MB), pasaba
 * a Grabaciones sin el identificador: no salía el aviso de "procesando en
 * segundo plano", Grabaciones no se recargaba al terminar y, si la subida
 * fallaba, el error solo quedaba en el log. Ahora Casting registra la subida
 * aquí y Grabaciones la sigue desde el primer momento.
 */

export type PendingVideoKind = 'selftape' | 'video';

export type PendingVideoJob = {
  localId: string;
  kind: PendingVideoKind;
  /** 'uploading' mientras sube; 'processing' cuando el servidor ya devolvió el jobId. */
  status: 'uploading' | 'processing';
  jobId?: string;
};

export type UploadResult = { jobId: string } | { error: { title: string; message: string } };

type Listener = (jobs: PendingVideoJob[]) => void;

let jobs: PendingVideoJob[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit() {
  const snapshot = [...jobs];
  listeners.forEach((listener) => listener(snapshot));
}

export function getPendingVideoJobs(): PendingVideoJob[] {
  return [...jobs];
}

export function subscribePendingVideoJobs(listener: Listener): () => void {
  listeners.add(listener);
  listener([...jobs]);
  return () => { listeners.delete(listener); };
}

/**
 * Registra una subida y la deja corriendo en segundo plano. Devuelve enseguida,
 * para poder pasar a Grabaciones sin esperar. Si la subida falla, se avisa con
 * el título y el mensaje que devuelva `upload`.
 */
export function trackVideoUpload(kind: PendingVideoKind, upload: () => Promise<UploadResult>): string {
  const localId = `upload-${kind}-${nextId++}`;
  jobs = [...jobs, { localId, kind, status: 'uploading' }];
  emit();

  upload()
    .catch((): UploadResult => ({
      error: { title: 'No se pudo enviar el vídeo', message: 'Comprueba tu conexión e inténtalo de nuevo.' },
    }))
    .then((result) => {
      if ('jobId' in result) {
        jobs = jobs.map((j) => (j.localId === localId ? { ...j, status: 'processing', jobId: result.jobId } : j));
      } else {
        jobs = jobs.filter((j) => j.localId !== localId);
        Alert.alert(result.error.title, result.error.message);
      }
      emit();
    });

  return localId;
}

/** El servidor terminó (bien o mal) el trabajo `jobId`: deja de seguirlo. */
export function finishVideoJob(jobId: string): void {
  const before = jobs.length;
  jobs = jobs.filter((j) => j.jobId !== jobId);
  if (jobs.length !== before) emit();
}
