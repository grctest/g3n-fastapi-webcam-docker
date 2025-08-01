import { map } from 'nanostores';

export const downloadStatus = map({
    status: 'idle', // idle, downloading, finished, error
    modelId: null,
    error: null,
});
