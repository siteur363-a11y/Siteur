import imageCompression from 'browser-image-compression';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export async function uploadImageToCloudinary(file: File | Blob, folderName = 'siteur_recolements'): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Configuration Cloudinary incomplète dans .env.local');
  }

  // 1. Compression de la photo côté client
  const options = {
    maxSizeMB: 1, // Max 1 Mo
    maxWidthOrHeight: 1920, // Résolution max HD
    useWebWorker: true,
    fileType: 'image/jpeg'
  };

  let fileToUpload = file;
  if (file instanceof File) {
    fileToUpload = await imageCompression(file, options);
  }

  // 2. Préparation du FormData pour upload Direct Unsigned
  const formData = new FormData();
  formData.append('file', fileToUpload);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folderName);

  // 3. Envoi vers l'API Cloudinary
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Échec du téléversement Cloudinary: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.secure_url;
}