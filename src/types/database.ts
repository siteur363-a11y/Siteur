export type CommuneEnum = 
  | 'Le Thuit-Signol'
  | "Le Thuit-de-l'Oison"
  | 'Le Thuit-Simer'
  | 'Autre commune';

export type DomaineEnum = 
  | 'Domaine Public (Trottoir)'
  | 'Domaine Public (Chaussée)'
  | 'Domaine Public (Accotement)';

export type AccessibiliteEnum = 
  | 'Accès libre'
  | 'Visibilité masquée (végétation/terre)'
  | 'Enfouie sous enrobé';

export interface Repere {
  code: string; // Ex: 'R1', 'R2'
  description: string; // Ex: 'Coffret Elec', 'Portail'
  distance: number | null; // Ex: 4.25
  observations?: string;
}

export interface RecoletBoite {
  id?: string;
  id_ouvrage: string; // Ex: 27638-AA0142-BR-01
  date_recolement: string;
  technicien: string;
  
  // Localisation
  commune: CommuneEnum;
  voie_numero?: string;
  voie_nom?: string;
  section_cadastrale?: string;
  parcelle_cadastrale?: string;
  domaine_assise?: DomaineEnum;
  accessibilite_site?: AccessibiliteEnum;
  
  // GPS
  latitude?: number | null;
  longitude?: number | null;
  precision_gps?: number | null;
  
  // Triangulation
  non_trouvee: boolean;
  reperes: Repere[];

  // Caractéristiques Physiques
  forme?: 'Circulaire' | 'Carrée' | 'Rectangulaire' | 'Trapézoïdale / Spéciale';
  dimensions?: string;
  materiau?: 'PVC' | 'Béton maçonné';
  type_couvercle?: 'Tampon Fonte' | 'Couvercle PVC' | 'Dalle Béton' | 'Grille';
  affleurement?: string;
  etat_couvercle?: string;
  profondeur_cm?: number | null;
  observations_physiques?: string;

  // Diagnostic Fonctionnel
  ecoulement?: string;
  depots?: string;
  eaux_parasites?: string;
  etat_parois?: string;
  action_preconisee?: string;

  // Photos (URLs Cloudinary)
  photo_situation_url?: string;
  photo_couvercle_url?: string;
  photo_interieur_url?: string;

  created_at?: string;
  updated_at?: string;
  created_by?: string;
}