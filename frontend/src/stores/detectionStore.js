import { persistentAtom } from '@nanostores/persistent';

// Maximum number of detections to keep in memory
const MAX_DETECTIONS = 1000;

// Create persistent store for detections
export const detectionStore = persistentAtom('detections', [], {
    encode: JSON.stringify,
    decode: JSON.parse,
});

// Helper functions for managing detections
export const addDetection = (detection) => {
    const currentDetections = detectionStore.get();
    
    // Add new detection at the beginning (most recent first)
    const newDetections = [detection, ...currentDetections];
    
    // Enforce the maximum limit by keeping only the first MAX_DETECTIONS items
    const limitedDetections = newDetections.slice(0, MAX_DETECTIONS);
    
    detectionStore.set(limitedDetections);
};

export const removeDetection = (detectionId) => {
    const currentDetections = detectionStore.get();
    const filteredDetections = currentDetections.filter(detection => detection.id !== detectionId);
    detectionStore.set(filteredDetections);
};

export const clearAllDetections = () => {
    detectionStore.set([]);
};

export const getDetectionCount = () => {
    return detectionStore.get().length;
};
