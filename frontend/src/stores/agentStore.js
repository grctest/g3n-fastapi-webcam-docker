import { persistentAtom } from '@nanostores/persistent';

// Agent structure:
// {
//   id,
//   label,
//   description,
//   systemPrompt,
//   interval,
//   paused
// }

export const agentStore = persistentAtom('agents', [], {
    encode: JSON.stringify,
    decode: JSON.parse,
});
