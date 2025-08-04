// Image processing utilities for webcam capture and upload optimization

/**
 * Convert a base64 data URL to a File object for multipart upload
 * @param {string} dataUrl - Base64 data URL from webcam
 * @param {string} filename - Filename for the file object
 * @returns {File} - File object ready for upload
 */
export function dataUrlToFile(dataUrl, filename = 'webcam-capture.jpg') {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

/**
 * Compress an image from webcam for more efficient upload
 * @param {string} dataUrl - Base64 data URL from webcam
 * @param {number} quality - JPEG quality (0.1 to 1.0)
 * @param {number} maxWidth - Maximum width in pixels
 * @param {number} maxHeight - Maximum height in pixels
 * @returns {Promise<string>} - Compressed image as data URL
 */
export function compressImage(dataUrl, quality = 0.8, maxWidth = 800, maxHeight = 600) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            // Calculate new dimensions while maintaining aspect ratio
            let { width, height } = img;
            
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = width * ratio;
                height = height * ratio;
            }
            
            // Set canvas dimensions
            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress image
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            
            resolve(compressedDataUrl);
        };
        
        img.src = dataUrl;
    });
}

/**
 * Get image metadata from a data URL
 * @param {string} dataUrl - Base64 data URL
 * @returns {Promise<Object>} - Image metadata (width, height, size)
 */
export function getImageMetadata(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // Calculate approximate file size
            const base64Data = dataUrl.split(',')[1];
            const sizeInBytes = (base64Data.length * 3) / 4;
            
            resolve({
                width: img.width,
                height: img.height,
                sizeInBytes: sizeInBytes,
                sizeInKB: Math.round(sizeInBytes / 1024),
                format: dataUrl.split(';')[0].split('/')[1]
            });
        };
        img.src = dataUrl;
    });
}
