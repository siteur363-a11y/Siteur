import { useEffect, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineDb } from '../db/offlineDb';
import { supabase } from '../lib/supabase';

export interface UseSyncQueueReturn {
    syncPendingItems: () => Promise<void>;
    isSyncing: boolean;
    pendingCount: number;
}

// Helper pour uploader un fichier sur Cloudinary sans SDK lourd
async function uploadToCloudinary(file: File | Blob): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);

    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
            method: 'POST',
            body: formData,
        }
    );

    if (!response.ok) {
        throw new Error(`Erreur Cloudinary (${response.status})`);
    }

    const data = await response.json();
    return data.secure_url;
}

export function useSyncQueue(): UseSyncQueueReturn {
    const isOnline = useOnlineStatus();
    const [isSyncing, setIsSyncing] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);

    const syncPendingItems = async () => {
        if (isSyncing) return;

        try {
            const items = await offlineDb.pendingSync.toArray();
            setPendingCount(items.length);

            if (!isOnline || items.length === 0) return;

            setIsSyncing(true);
            console.log(`🔄 Synchronisation de ${items.length} élément(s)...`);

            for (const item of items) {
                const payload = { ...item.data };

                // 1. Upload des images vers Cloudinary si elles existent localement
                if (item.localPhotos) {
                    if (item.localPhotos.situation) {
                        payload.photo_situation_url = await uploadToCloudinary(item.localPhotos.situation);
                    }
                    if (item.localPhotos.couvercle) {
                        payload.photo_couvercle_url = await uploadToCloudinary(item.localPhotos.couvercle);
                    }
                    if (item.localPhotos.interieur) {
                        payload.photo_interieur_url = await uploadToCloudinary(item.localPhotos.interieur);
                    }
                }

                // Nettoyage de la clé primaire auto-générée par IndexedDB
                delete payload.id;

                // 2. Insertion finale dans Supabase avec les URLs Cloudinary
                const { error } = await supabase
                    .from('recolements_boites')
                    .insert([payload]);

                // 3. Suppression de IndexedDB uniquement si Supabase a validé l'entrée
                if (!error && item.id !== undefined) {
                    await offlineDb.pendingSync.delete(item.id);
                    console.log(`✅ Élément #${item.id} synchronisé avec succès.`);
                } else if (error) {
                    console.error(`❌ Échec Supabase pour l'élément #${item.id} :`, error);
                }
            }
        } catch (err) {
            console.error('❌ Erreur générale de synchronisation :', err);
        } finally {
            const remaining = await offlineDb.pendingSync.count();
            setPendingCount(remaining);
            setIsSyncing(false);
        }
    };

    // Un seul useEffect suffit pour réagir au changement de statut réseau
    useEffect(() => {
        if (isOnline) {
            syncPendingItems();
        }
    }, [isOnline]);

    return { syncPendingItems, isSyncing, pendingCount };
}