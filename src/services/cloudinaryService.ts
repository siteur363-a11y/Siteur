/**
 * Service d'upload d'images vers Cloudinary
 */
export const uploadToCloudinary = async (file: File): Promise<string | null> => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
        alert("Configuration Cloudinary manquante dans le fichier .env.local");
        return null;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: "POST",
            body: formData,
        });
        const data = await response.json();
        return data.secure_url || null;
    } catch (error) {
        console.error("Erreur lors de l'upload vers Cloudinary :", error);
        return null;
    }
};

/**
 * Extraction du public_id depuis une URL Cloudinary
 */
export const extractCloudinaryPublicId = (url: string): string | null => {
    if (!url || !url.includes('cloudinary.com')) return null;
    const parts = url.split('/');
    const uploadIndex = parts.findIndex(p => p === 'upload');
    if (uploadIndex === -1) return null;

    const pathParts = parts.slice(uploadIndex + 1);
    if (pathParts[0].startsWith('v') && !isNaN(parseInt(pathParts[0].substring(1)))) {
        pathParts.shift(); // Supprime la version
    }

    const fullPath = pathParts.join('/');
    const lastDotIndex = fullPath.lastIndexOf('.');
    return lastDotIndex !== -1 ? fullPath.substring(0, lastDotIndex) : fullPath;
};

/**
 * Service de suppression définitive d'images sur Cloudinary
 */
export const deleteFromCloudinary = async (url: string): Promise<boolean | null> => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY;
    const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
        console.warn("Clés API Cloudinary manquantes pour la suppression (.env.local).");
        return null;
    }

    const publicId = extractCloudinaryPublicId(url);
    if (!publicId) return false;

    // Génération de la signature SHA-1 exigée par Cloudinary
    const timestamp = Math.round(new Date().getTime() / 1000).toString();
    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

    const encoder = new TextEncoder();
    const data = encoder.encode(stringToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('signature', signature);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();
        return result.result === 'ok';
    } catch (error) {
        console.error("Erreur lors de la suppression Cloudinary:", error);
        return false;
    }
};