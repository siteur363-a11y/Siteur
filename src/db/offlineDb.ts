import Dexie, { type Table } from 'dexie';
import type { RecoletBoite } from '../types/database';

export interface PendingSyncItem {
  id?: number;
  data: RecoletBoite;
  localPhotos?: {
    situation?: File;
    couvercle?: File;
    interieur?: File;
  };
  createdAt: string;
}

export class OfflineDatabase extends Dexie {
  pendingSync!: Table<PendingSyncItem, number>;

  constructor() {
    super('SiteurOfflineDB_V2');
    // Passage en version 2 pour forcer la création de la table pendingSync
    this.version(2).stores({
      pendingSync: '++id, createdAt'
    });
  }
}

export const offlineDb = new OfflineDatabase();