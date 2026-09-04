export type CommuneEnum = 
  | 'Le Thuit-Signol'
  | "Le Thuit-de-l'Oison"
  | 'Le Thuit-Simer'
  | 'Autre commune'
  | (string & {});

export type DomaineEnum = 
  | 'Domaine Public (Trottoir)'
  | 'Domaine Public (Chaussée)'
  | 'Domaine Public (Accotement)'
  | ''
  | (string & {});

export type AccessibiliteEnum = 
  | 'Accès libre'
  | 'Visibilité masquée (végétation/terre)'
  | 'Enfouie sous enrobé'
  | ''
  | (string & {});

export interface Repere {
  code?: string; // Ex: 'R1', 'R2' (Conservé pour rétro-compatibilité)
  point?: string; // Ex: 'REP 1', 'REP 2' (Utilisé dans SaisieRecolement)
  description?: string; // Ex: 'Coffret Elec', 'Portail'
  distance?: number | string | null; // Ex: 4.25 ou "4.25" (Formulaires)
  observations?: string;
}

export interface RecoletBoite {
  id?: string | number | null; // Supporte les ID Supabase (UUID/string) et Dexie (number)
  id_ouvrage?: string | null; // Ex: 27638-AA0142-BR-01
  date_recolement?: string | null;
  technicien?: string | null;
  
  // Localisation
  commune?: CommuneEnum | string | null;
  voie_numero?: string | null;
  voie_nom?: string | null;
  section_cadastrale?: string | null;
  parcelle_cadastrale?: string | null;
  domaine_assise?: DomaineEnum | string | null;
  accessibilite_site?: AccessibiliteEnum | string | null;
  observations_localisation?: string | null;
  
  // GPS
  latitude?: number | null;
  longitude?: number | null;
  precision_gps?: number | null;
  
  // Triangulation
  non_trouvee?: boolean | null;
  reperes?: Repere[] | null;

  // Caractéristiques Physiques
  forme?: 'Circulaire' | 'Carrée' | 'Rectangulaire' | 'Trapézoïdale / Spéciale' | '' | string | null;
  dimensions?: string | null;
  materiau?: 'PVC' | 'Béton maçonné' | '' | string | null;
  type_couvercle?: 'Tampon Fonte' | 'Couvercle PVC' | 'Dalle Béton' | 'Grille' | '' | string | null;
  affleurement?: string | null;
  etat_couvercle?: string | null;
  profondeur_cm?: number | string | null;
  observations_physiques?: string | null;

  // Diagnostic Fonctionnel
  ecoulement?: string | null;
  depots?: string | null;
  eaux_parasites?: string | null;
  etat_parois?: string | null;
  action_preconisee?: string | null;

  // Photos (URLs Cloudinary & Fichiers locaux/Brouillons)
  photo_situation_url?: string | null;
  photo_couvercle_url?: string | null;
  photo_interieur_url?: string | null;
  photos_interieur_urls?: string[] | null;

  photo_situation?: string | File | null;
  photo_couvercle?: string | File | null;
  photo_interieur?: string | File | null;
  photos_interieur?: (string | File)[] | null;

  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
}