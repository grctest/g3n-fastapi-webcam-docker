import { persistentAtom } from '@nanostores/persistent';

// Tracks model download status and progress persistently in localStorage
export const gemmaModelStatus = persistentAtom(
  'gemmaModelStatus',
  { ready: false, downloading: false, progress: 0 },
  {
    encode: JSON.stringify,
    decode: JSON.parse,
  }
);
