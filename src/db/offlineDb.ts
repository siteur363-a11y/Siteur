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

// Structure des parcelles cadastrales stockées localement pour Turf.js
export interface ParcelleItem {
  id?: number;
  codeInsee?: string;
  section: string;
  numero: string;
  geom: any; // Géométrie GeoJSON (Polygon / MultiPolygon)
}

export class OfflineDatabase extends Dexie {
  pendingSync!: Table<PendingSyncItem, number>;
  parcelles!: Table<ParcelleItem, number>;

  constructor() {
    super('SiteurOfflineDB_V2');

    // Historique des versions pour Dexie (migration fluide)
    this.version(2).stores({
      pendingSync: '++id, createdAt'
    });

    // Version 3 : Ajout de la table parcelles cadastrales
    this.version(3).stores({
      pendingSync: '++id, createdAt',
      parcelles: '++id, section, numero, codeInsee'
    });
  }
}

export const offlineDb = new OfflineDatabase();