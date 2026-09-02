import { useEffect, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineDb } from '../db/offlineDb';
import { supabase } from '../lib/supabase';

export interface UseSyncQueueReturn {
  syncPendingItems: () => Promise<void>;
  isSyncing: boolean;
  pendingCount: number;
}

export function useSyncQueue(): UseSyncQueueReturn {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Fonction principale de synchronisation
  const syncPendingItems = async () => {
    if (isSyncing) return;

    try {
      const items = await offlineDb.pendingSync.toArray();
      setPendingCount(items.length);

      // S'il n'y a rien à synchroniser ou qu'on est hors-ligne, on s'arrête
      if (!isOnline || items.length === 0) {
        return;
      }

      setIsSyncing(true);
      console.log(`🔄 Synchronisation de ${items.length} élément(s) vers Supabase...`);

      for (const item of items) {
        const { error } = await supabase
          .from('recolements_boites')
          .insert([item.data]);

        if (!error && item.id !== undefined) {
          await offlineDb.pendingSync.delete(item.id);
          console.log(`✅ Élément #${item.id} synchronisé et retiré de Dexie.`);
        } else if (error) {
          console.error(`❌ Échec de synchro pour l'élément #${item.id} :`, error);
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

  // 1. Vérification au chargement initial du composant (si on est déjà en ligne avec des données en attente)
  useEffect(() => {
    if (isOnline) {
      syncPendingItems();
    }
  }, []);

  // 2. Vérification dès que l'état de la connexion change (passage de Hors-ligne à En ligne)
  useEffect(() => {
    if (isOnline) {
      syncPendingItems();
    }
  }, [isOnline]);

  return { syncPendingItems, isSyncing, pendingCount };
}