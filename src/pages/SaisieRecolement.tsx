import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useForm } from 'react-hook-form';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useGeolocation } from '../hooks/useGeolocation';
import type { RecoletBoite } from '../types/database';
import { offlineDb } from '../db/offlineDb';
import { useSyncQueue } from '../hooks/useSyncQueue';

// Imports pour la carte interactive Leaflet (avec LayersControl)
import { MapContainer, TileLayer, Marker, Popup, WMSTileLayer, LayersControl, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Correction standard pour l'affichage des icônes de marqueur Leaflet avec Vite/Webpack
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Composant interne pour recentrer la carte dynamiquement quand le GPS change
function MapRecenter({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, map.getZoom(), { animate: true });
    }, [center, map]);
    return null;
}

// Composant interne pour gérer les clics interactifs sur la carte
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

// Fonction utilitaire pour l'upload vers Cloudinary
const uploadToCloudinary = async (file: File): Promise<string | null> => {
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

export default function SaisieRecolement() {
    const isOnline = useOnlineStatus();
    const { location, requestLocation } = useGeolocation();
    useSyncQueue();

    // --- NOUVEAUX ÉTATS POUR LA GESTION DES ONGLETS ET DE LA MODIFICATION ---
    const [activeTab, setActiveTab] = useState<'saisie' | 'historique'>('saisie');
    const [historique, setHistorique] = useState<any[]>([]);
    const [isLoadingHist, setIsLoadingHist] = useState(false);
    const [editId, setEditId] = useState<string | number | null>(null);

    // États de la modale des repères
    const [isRepereModalOpen, setIsRepereModalOpen] = useState(false);
    const [reperesList, setReperesList] = useState<any[]>([]);
    const [currentRepere, setCurrentRepere] = useState({
        point: '',
        description: '',
        distance: '',
        observations: ''
    });

    // Position active sur la carte
    const [activeCoords, setActiveCoords] = useState<{ lat: number; lon: number } | null>(null);

    // État pour la dictée vocale
    const [listeningField, setListeningField] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

    // États séparés pour les fichiers bruts et leurs aperçus
    const [photoFiles, setPhotoFiles] = useState<{
        photo_situation: File | null;
        photo_couvercle: File | null;
        photo_interieur: File | null;
    }>({ photo_situation: null, photo_couvercle: null, photo_interieur: null });

    const [photoPreviews, setPhotoPreviews] = useState<{
        photo_situation: string | null;
        photo_couvercle: string | null;
        photo_interieur: string | null;
    }>({ photo_situation: null, photo_couvercle: null, photo_interieur: null });

    // État de chargement global
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Configuration de react-hook-form (Ajout de 'reset' pour la modification)
    const { register, handleSubmit, formState: { errors }, watch, setValue, getValues, reset } = useForm<RecoletBoite>({
        defaultValues: {
            technicien: '',
            date_recolement: new Date().toISOString().split('T')[0],
            non_trouvee: false,
            reperes: []
        }
    });

    const nonTrouvee = watch('non_trouvee');
    const formeSelectionnee = watch('forme');
    const lastFetchedCoords = useRef<{ lat: number; lon: number } | null>(null);
    const formValues = watch();

    // --- CHARGEMENT DE L'HISTORIQUE ---
    useEffect(() => {
        if (activeTab === 'historique' && isOnline) {
            fetchHistorique();
        }
    }, [activeTab, isOnline]);

    const fetchHistorique = async () => {
        setIsLoadingHist(true);
        const { data, error } = await supabase
            .from('recolements_boites')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50); // Limite pour les perfs

        if (!error && data) {
            setHistorique(data);
        }
        setIsLoadingHist(false);
    };

    // --- FONCTION DE PASSAGE EN MODE MODIFICATION ---
    const handleEditRecord = (record: any) => {
        // Définir l'ID pour l'update (privilégier id, sinon id_ouvrage)
        setEditId(record.id || record.id_ouvrage);

        // Remplir le formulaire
        reset(record);
        setReperesList(record.reperes || []);

        // Restaurer les coordonnées
        if (record.latitude && record.longitude) {
            setActiveCoords({ lat: record.latitude, lon: record.longitude });
        } else {
            setActiveCoords(null);
        }

        // Restaurer les aperçus photos depuis les URLs existantes
        setPhotoPreviews({
            photo_situation: record.photo_situation_url || null,
            photo_couvercle: record.photo_couvercle_url || null,
            photo_interieur: record.photo_interieur_url || null,
        });

        // Réinitialiser les fichiers en attente (puisqu'ils sont déjà sur le cloud)
        setPhotoFiles({ photo_situation: null, photo_couvercle: null, photo_interieur: null });

        setActiveTab('saisie');
    };

    // --- FONCTION D'ANNULATION / RÉINITIALISATION ---
    const resetSaisie = () => {
        setEditId(null);
        const currentTech = getValues('technicien'); // Conserver le nom du technicien
        reset({
            technicien: currentTech,
            date_recolement: new Date().toISOString().split('T')[0],
            non_trouvee: false,
            reperes: []
        });
        setReperesList([]);
        setActiveCoords(null);
        setPhotoPreviews({ photo_situation: null, photo_couvercle: null, photo_interieur: null });
        setPhotoFiles({ photo_situation: null, photo_couvercle: null, photo_interieur: null });
    };

    // Gestion de l'insertion automatique du symbole
    useEffect(() => {
        const currentDim = getValues('dimensions') || '';
        if (formeSelectionnee === 'Circulaire') {
            if (!currentDim || currentDim.startsWith('X ')) {
                setValue('dimensions', 'Ø ');
            } else if (!currentDim.startsWith('Ø')) {
                setValue('dimensions', `Ø ${currentDim}`);
            }
        } else if (formeSelectionnee === 'Carrée' || formeSelectionnee === 'Rectangulaire') {
            if (!currentDim || currentDim.startsWith('Ø ')) {
                setValue('dimensions', 'X ');
            } else if (!currentDim.startsWith('X')) {
                setValue('dimensions', `X ${currentDim}`);
            }
        }
    }, [formeSelectionnee, setValue, getValues]);

    const getFieldBg = (fieldName: keyof RecoletBoite) => {
        const val = formValues[fieldName];
        const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0);
        return isEmpty ? "bg-amber-50/80 border-amber-200" : "bg-white border-gray-300";
    };

    // --- GESTION LOCALE DES PHOTOS ---
    const handlePhotoCapture = (photoType: 'photo_situation' | 'photo_couvercle' | 'photo_interieur', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const previewUrl = URL.createObjectURL(file);
        setPhotoFiles(prev => ({ ...prev, [photoType]: file }));
        setPhotoPreviews(prev => ({ ...prev, [photoType]: previewUrl }));
    };

    const handleRemovePhoto = (photoType: 'photo_situation' | 'photo_couvercle' | 'photo_interieur') => {
        setPhotoFiles(prev => ({ ...prev, [photoType]: null }));
        setPhotoPreviews(prev => ({ ...prev, [photoType]: null })); // Servira d'indicateur pour supprimer l'URL en BDD
    };

    // --- GESTION DES REPÈRES (TRIANGULATION) ---
    const getNextRepereName = (list: any[]) => {
        let n = 1;
        while (list.some(r => r.point === `REP ${n}`)) n++;
        return `REP ${n}`;
    };

    const handleOpenModal = () => {
        setCurrentRepere({ point: getNextRepereName(reperesList), description: '', distance: '', observations: '' });
        setIsRepereModalOpen(true);
    };

    const handleAddRepere = () => {
        if (!currentRepere.point || !currentRepere.description) {
            alert("Veuillez renseigner au moins le point de repère et la description.");
            return;
        }
        const nameExists = reperesList.some(r => r.point.trim().toLowerCase() === currentRepere.point.trim().toLowerCase());
        if (nameExists) {
            alert(`Le nom de repère "${currentRepere.point}" existe déjà. Veuillez utiliser un nom unique.`);
            return;
        }
        const updatedList = [...reperesList, currentRepere];
        setReperesList(updatedList);
        setValue('reperes', updatedList);
        setIsRepereModalOpen(false);
    };

    const handleRemoveRepere = (index: number) => {
        const updatedList = reperesList.filter((_, i) => i !== index);
        setReperesList(updatedList);
        setValue('reperes', updatedList);
    };

    // --- DICTÉE VOCALE ---
    const toggleDictation = (field: string, isModal: boolean = false) => {
        const trackingKey = isModal ? `modal_${field}` : field;
        if (listeningField === trackingKey && recognitionRef.current) {
            recognitionRef.current.stop();
            return;
        }
        if (recognitionRef.current) recognitionRef.current.stop();

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("La dictée vocale n'est pas supportée nativement sur ce navigateur.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;
        recognitionRef.current = recognition;

        recognition.onstart = () => setListeningField(trackingKey);
        recognition.onresult = (event: any) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
            }
            if (transcript) {
                if (isModal) {
                    setCurrentRepere(prev => ({ ...prev, [field]: (prev[field as keyof typeof prev] || "") + " " + transcript }));
                } else {
                    const currentText = getValues(field as keyof RecoletBoite) || "";
                    setValue(field as keyof RecoletBoite, (currentText + " " + transcript).trim() as any);
                }
            }
        };
        recognition.onerror = () => { setListeningField(null); recognitionRef.current = null; };
        recognition.onend = () => { setListeningField(null); recognitionRef.current = null; };
        recognition.start();
    };

    // --- RECHERCHE ADRESSE / CADASTRE ---
    const fetchAddressAndCadastre = async (lat: number, lon: number) => {
        try {
            setActiveCoords({ lat, lon });
            let codeInsee = '', sectionVal = '', parcelleVal = '';

            const resAdresse = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lon}`);
            const dataAdresse = await resAdresse.json();

            if (dataAdresse.features && dataAdresse.features.length > 0) {
                const props = dataAdresse.features[0].properties;
                codeInsee = props.citycode || '';
                setValue('commune', (props.city || '') as any);
                setValue('voie_numero', props.housenumber || '');
                setValue('voie_nom', props.street || '');
            }

            const geometry = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
            const resCadastre = await fetch(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geometry)}&_limit=1`);
            const dataCadastre = await resCadastre.json();

            if (dataCadastre.features && dataCadastre.features.length > 0) {
                const parcelleProps = dataCadastre.features[0].properties;
                sectionVal = parcelleProps.section || '';
                parcelleVal = parcelleProps.numero || '';
                setValue('section_cadastrale', sectionVal);
                setValue('parcelle_cadastrale', parcelleVal);
            }

            // Génération ID Ouvrage uniquement si ce n'est pas une modification (pour ne pas écraser l'ID existant)
            if (!editId && codeInsee && sectionVal && parcelleVal) {
                const basePrefix = `${codeInsee}-${sectionVal}${parcelleVal}-BR`;
                const { count, error } = await supabase
                    .from('recolements_boites')
                    .select('*', { count: 'exact', head: true })
                    .ilike('id_ouvrage', `${basePrefix}%`);

                let finalIdOuvrage = basePrefix;
                if (!error && count !== null && count > 0) {
                    finalIdOuvrage = `${basePrefix}-${String(count + 1).padStart(2, '0')}`;
                }
                setValue('id_ouvrage', finalIdOuvrage);
            }
        } catch (error) {
            console.error("❌ Erreur API :", error);
        }
    };

    useEffect(() => {
        // En mode édition, on ne veut pas écraser l'adresse dès que le composant monte si la localisation est active
        if (!editId && location.latitude != null && location.longitude != null) {
            if (!lastFetchedCoords.current || lastFetchedCoords.current.lat !== location.latitude || lastFetchedCoords.current.lon !== location.longitude) {
                lastFetchedCoords.current = { lat: location.latitude, lon: location.longitude };
                fetchAddressAndCadastre(location.latitude, location.longitude);
            }
        }
    }, [location.latitude, location.longitude, editId]);

    // --- SOUMISSION GLOBALE (INSERT ou UPDATE) ---
    const onSubmit = async (data: RecoletBoite) => {
        setIsSubmitting(true);

        Object.keys(data).forEach((key) => {
            if ((data as any)[key] === "") (data as any)[key] = null;
        });

        // Gestion conditionnelle des images :
        // On n'écrase pas les URLs existantes (data.photo_xxx_url) sauf si l'utilisateur a uploadé un nouveau fichier, ou s'il a cliqué sur la croix (preview == null).
        if (isOnline) {
            try {
                // Situation
                if (photoFiles.photo_situation) {
                    const url = await uploadToCloudinary(photoFiles.photo_situation);
                    data.photo_situation_url = url as any;
                    data.photo_situation = url as any; // Conservation double-colonne
                } else if (!photoPreviews.photo_situation) {
                    data.photo_situation_url = null as any;
                    data.photo_situation = null as any;
                }

                // Couvercle
                if (photoFiles.photo_couvercle) {
                    const url = await uploadToCloudinary(photoFiles.photo_couvercle);
                    data.photo_couvercle_url = url as any;
                    data.photo_couvercle = url as any;
                } else if (!photoPreviews.photo_couvercle) {
                    data.photo_couvercle_url = null as any;
                    data.photo_couvercle = null as any;
                }

                // Intérieur
                if (photoFiles.photo_interieur) {
                    const url = await uploadToCloudinary(photoFiles.photo_interieur);
                    data.photo_interieur_url = url as any;
                    data.photo_interieur = url as any;
                } else if (!photoPreviews.photo_interieur) {
                    data.photo_interieur_url = null as any;
                    data.photo_interieur = null as any;
                }
            } catch (err) {
                console.error("Erreur d'upload :", err);
            }
        }

        data.reperes = reperesList;

        if (activeCoords) {
            data.latitude = activeCoords.lat;
            data.longitude = activeCoords.lon;
            // On conserve la précision initiale si on ne fait que modifier sans capturer de nouveau le GPS
            if (location.accuracy) data.precision_gps = location.accuracy;
        }

if (isOnline) {
            let error;
            
            // Nettoyage strict : suppression des variables temporaires du formulaire et des champs auto
            const payload = { ...data } as any;
            delete payload.id;
            delete payload.created_at;
            delete payload.photo_situation;
            delete payload.photo_couvercle;
            delete payload.photo_interieur;

if (editId) {
                // MISE À JOUR (UPDATE)
                // CORRECTION : Tolère les entiers convertis en texte (ex: "45")
                const isTechnicalId = typeof editId === 'number' || 
                                      (typeof editId === 'string' && /^\d+$/.test(editId)) || 
                                      (typeof editId === 'string' && /^[0-9a-fA-F-]{36}$/.test(editId));
                
                const searchColumn = isTechnicalId ? 'id' : 'id_ouvrage';
                
                const res = await supabase
                    .from('recolements_boites')
                    .update(payload)
                    .eq(searchColumn, editId)
                    .select(); // 👈 OBLIGATOIRE pour détecter les échecs silencieux

                error = res.error;

                // 🚨 Détection de l'échec silencieux
                if (!error && (!res.data || res.data.length === 0)) {
                    alert(`⚠️ Échec de la modification : l'ouvrage n'a pas été trouvé ou une règle de sécurité Supabase (RLS) bloque l'Update.`);
                    setIsSubmitting(false);
                    return;
                }
            } else {
                // INSERTION
                const res = await supabase
                    .from('recolements_boites')
                    .insert([payload]);
                error = res.error;
            }

            setIsSubmitting(false);

            if (error) {
                console.error('❌ ERREUR SUPABASE :', error);
                alert(`Erreur Supabase (${error.code}) : ${error.message}`);
            } else {
                alert(`✅ Relevé ${editId ? 'modifié' : 'enregistré'} avec succès !`);
                resetSaisie();
            }
        } else {
            setIsSubmitting(false);
            if (editId) {
                alert("⚠️ La modification d'un relevé existant n'est possible qu'en étant connecté à Internet.");
                return;
            }
            try {
                await offlineDb.pendingSync.add({ data, createdAt: new Date().toISOString() } as any);
                alert('📦 Hors-ligne : Relevé sauvegardé dans la mémoire du téléphone !');
                resetSaisie();
            } catch (err: any) {
                alert(`Erreur de stockage local : ${err.message}`);
            }
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-4 pb-24 bg-gray-50 min-h-screen">
            {/* Barre d'état réseau */}
            <div className={`p-2 mb-4 text-center font-bold text-white rounded-md ${isOnline ? 'bg-green-600' : 'bg-red-600'}`}>
                {isOnline ? '🟢 En Ligne (Cloud)' : '🔴 Hors Ligne (Sauvegarde Locale)'}
            </div>

            <h1 className="text-2xl font-bold mb-4 text-gray-800">Fiche de Récolement</h1>

            {/* --- NAVIGATION ONGLETS --- */}
            <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1 mb-6">
                <button
                    type="button"
                    onClick={() => { setActiveTab('saisie'); if (!editId) resetSaisie(); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'saisie' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    {editId ? '✏️ Mode Modification' : '📝 Nouvelle Saisie'}
                </button>
                <button
                    type="button"
                    onClick={() => { setActiveTab('historique'); resetSaisie(); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'historique' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    🗂️ Historique & Modif
                </button>
            </div>

            {/* --- CONTENU ONGLET: HISTORIQUE --- */}
            {activeTab === 'historique' && (
                <div className="space-y-4">
                    {!isOnline ? (
                        <div className="p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-xl text-center">
                            L'historique nécessite une connexion internet.
                        </div>
                    ) : isLoadingHist ? (
                        <div className="text-center py-8 text-gray-500">Chargement des données...</div>
                    ) : historique.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">Aucun récolement trouvé.</div>
                    ) : (
                        historique.map((rec) => (
                            <div key={rec.id || rec.id_ouvrage} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                <div className="flex gap-4 items-center">
                                    {/* Miniature photo */}
                                    {rec.photo_situation_url ? (
                                        <img src={rec.photo_situation_url} alt="Situation" className="w-16 h-16 object-cover rounded-lg border border-gray-200 shadow-sm shrink-0" />
                                    ) : (
                                        <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl border border-gray-200 shadow-sm shrink-0">
                                            📷
                                        </div>
                                    )}
                                    {/* Informations */}
                                    <div>
                                        <h3 className="font-bold text-gray-800">{rec.id_ouvrage}</h3>
                                        <p className="text-sm text-gray-600 font-medium">
                                            {rec.voie_numero ? `${rec.voie_numero} ` : ''}
                                            {rec.voie_nom ? `${rec.voie_nom}, ` : ''}
                                            {rec.commune}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Le {rec.date_recolement} par {rec.technicien}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleEditRecord(rec)}
                                    className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-200 transition-colors w-full sm:w-auto"
                                >
                                    Modifier
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* --- CONTENU ONGLET: SAISIE (Formulaire) --- */}
            {activeTab === 'saisie' && (
                <form
                    onSubmit={handleSubmit(onSubmit, (formErrors) => {
                        console.error("❌ Erreurs de validation :", formErrors);
                        alert("Formulaire incomplet : vérifiez les champs obligatoires (ID Ouvrage, Technicien, Commune, Date).");
                    })}
                    className="space-y-8"
                >

                    {/* Bannière de mode modification */}
                    {editId && (
                        <div className="bg-amber-100 border border-amber-300 text-amber-800 p-3 rounded-xl flex justify-between items-center shadow-sm">
                            <div className="font-medium">
                                ✏️ Vous modifiez l'ouvrage : <span className="font-bold">{getValues('id_ouvrage')}</span>
                            </div>
                            <button type="button" onClick={resetSaisie} className="text-amber-800 text-sm font-bold bg-amber-200 px-3 py-1 rounded hover:bg-amber-300">
                                Annuler
                            </button>
                        </div>
                    )}

                    {/* --- SECTION 0 : IDENTIFIANTS --- */}
                    <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">Informations Générales</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ID Ouvrage *</label>
                                <input
                                    {...register("id_ouvrage", { required: "Ce champ est obligatoire" })}
                                    className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('id_ouvrage')}`}
                                    placeholder="Ex: 27638-AA0142-BR-01"
                                />
                                {errors.id_ouvrage && <span className="text-red-500 text-sm mt-1">{errors.id_ouvrage.message}</span>}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Technicien *</label>
                                    <input
                                        {...register("technicien", { required: "Ce champ est obligatoire" })}
                                        className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('technicien')}`}
                                    />
                                    {errors.technicien && <span className="text-red-500 text-sm mt-1">{errors.technicien.message}</span>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de récolement *</label>
                                    <input
                                        type="date"
                                        {...register("date_recolement", { required: "Date requise" })}
                                        className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('date_recolement')}`}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center space-x-3 pt-2">
                                <input
                                    type="checkbox"
                                    id="non_trouvee"
                                    {...register("non_trouvee")}
                                    className="w-5 h-5 text-blue-600 rounded border-gray-300"
                                />
                                <label htmlFor="non_trouvee" className="text-sm font-medium text-gray-800">
                                    Ouvrage non trouvé / Inaccessible
                                </label>
                            </div>
                        </div>
                    </section>

                    {/* --- SECTION 1 : LOCALISATION & CADASTRE --- */}
                    <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">1. Localisation & Cadastre</h2>
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="font-medium text-gray-800">Coordonnées GPS & Carte</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={requestLocation}
                                        disabled={location.loading}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium shadow-sm active:bg-blue-700"
                                    >
                                        {location.loading ? 'Recherche...' : '📍 Capturer position'}
                                    </button>
                                </div>
                                {activeCoords ? (
                                    <>
                                        <div className="text-sm text-green-700 font-mono bg-green-50 p-2 rounded border border-green-200">
                                            Lat: {activeCoords.lat.toFixed(6)} | Lng: {activeCoords.lon.toFixed(6)}
                                        </div>
                                        <div className="h-72 w-full rounded-lg overflow-hidden border border-gray-300 shadow-inner z-0">
                                            <MapContainer center={[activeCoords.lat, activeCoords.lon]} zoom={18} style={{ height: '100%', width: '100%' }}>
                                                <MapRecenter center={[activeCoords.lat, activeCoords.lon]} />
                                                <MapClickHandler onMapClick={(lat, lon) => fetchAddressAndCadastre(lat, lon)} />
                                                <LayersControl position="topright">
                                                    <LayersControl.BaseLayer name="Plan (OSM)"><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /></LayersControl.BaseLayer>
                                                    <LayersControl.BaseLayer checked name="Satellite (IGN)">
                                                        <TileLayer url="https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}" maxZoom={19} />
                                                    </LayersControl.BaseLayer>
                                                    <LayersControl.Overlay checked name="Cadastre (IGN)">
                                                        <WMSTileLayer url="https://wxs.ign.fr/essentiels/geoportail/wms?" layers="CADASTRALPARCELS.PARCELS" format="image/png" transparent={true} version="1.3.0" />
                                                    </LayersControl.Overlay>
                                                </LayersControl>
                                                <Marker position={[activeCoords.lat, activeCoords.lon]}><Popup>Ouvrage sélectionné</Popup></Marker>
                                            </MapContainer>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-sm text-gray-500 italic py-2">Aucune position capturée.</div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Commune *</label>
                                <input {...register("commune", { required: "Commune requise" })} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('commune')}`} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">N° voie</label><input {...register("voie_numero")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('voie_numero')}`} /></div>
                                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Nom voie</label><input {...register("voie_nom")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('voie_nom')}`} /></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Section</label><input {...register("section_cadastrale")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('section_cadastrale')}`} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Parcelle</label><input {...register("parcelle_cadastrale")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('parcelle_cadastrale')}`} /></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Domaine d'assise</label>
                                    <select {...register("domaine_assise")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('domaine_assise')}`}>
                                        <option value="">Sélectionner...</option>
                                        <option value="Domaine Public (Trottoir)">Domaine Public (Trottoir)</option>
                                        <option value="Domaine Public (Chaussée)">Domaine Public (Chaussée)</option>
                                        <option value="Domaine Public (Accotement)">Domaine Public (Accotement)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Accessibilité</label>
                                    <select {...register("accessibilite_site")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('accessibilite_site')}`}>
                                        <option value="">Sélectionner...</option>
                                        <option value="Accès libre">Accès libre</option>
                                        <option value="Visibilité masquée (végétation/terre)">Visibilité masquée (végétation/terre)</option>
                                        <option value="Enfouie sous enrobé">Enfouie sous enrobé</option>
                                    </select>
                                </div>
                            </div>

                            {/* --- GESTION DES REPÈRES --- */}
                            <div className="pt-4 border-t border-gray-200 mt-4">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="block text-sm font-bold text-gray-800">Repères ({reperesList.length})</span>
                                    <button type="button" onClick={handleOpenModal} className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-green-700 transition-colors">+ Ajouter un repère</button>
                                </div>
                                {reperesList.length > 0 && (
                                    <div className="space-y-2">
                                        {reperesList.map((rep, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                                <div><span className="font-bold text-blue-800">{rep.point}</span> : {rep.description} — {rep.distance}</div>
                                                <button type="button" onClick={() => handleRemoveRepere(idx)} className="text-red-500 font-bold p-1">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-2">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium text-gray-700">Observations / Accès</label>
                                    <button type="button" onClick={() => toggleDictation('observations_localisation')} className={`text-sm px-3 py-1 rounded border ${listeningField === 'observations_localisation' ? 'bg-red-600 text-white animate-pulse' : 'bg-white'}`}>🎤 Dicter</button>
                                </div>
                                <textarea {...register("observations_localisation" as keyof RecoletBoite)} rows={2} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('observations_localisation' as keyof RecoletBoite)}`} />
                            </div>

                            {/* PHOTO SITUATION */}
                            <div className="pt-3 border-t border-gray-200">
                                <label className="block text-sm font-bold text-gray-800 mb-2">📸 Photo Situation</label>
                                {photoPreviews.photo_situation ? (
                                    <div className="relative inline-block bg-gray-100 p-1 rounded-lg border shadow-sm">
                                        <img src={photoPreviews.photo_situation} alt="Situation" className="h-32 w-32 object-cover rounded" />
                                        <button type="button" onClick={() => handleRemovePhoto('photo_situation')} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                        <span className="text-2xl mb-1">📷</span><span className="text-sm font-medium text-blue-700">Importer Photo</span>
                                        <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoCapture('photo_situation', e)} className="hidden" />
                                    </label>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* --- SECTION 2 : CARACTÉRISTIQUES PHYSIQUES --- */}
                    {!nonTrouvee && (
                        <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">2. Caractéristiques Physiques</h2>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Forme</label>
                                        <select {...register("forme")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('forme')}`}>
                                            <option value="">Sélectionner...</option>
                                            <option value="Circulaire">Circulaire</option>
                                            <option value="Carrée">Carrée</option>
                                            <option value="Rectangulaire">Rectangulaire</option>
                                            <option value="Trapézoïdale / Spéciale">Trapézoïdale / Spéciale</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Dimensions</label>
                                        <input {...register("dimensions")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('dimensions')}`} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Matériau</label>
                                        <select {...register("materiau")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('materiau')}`}>
                                            <option value="">Sélectionner...</option>
                                            <option value="PVC">PVC</option>
                                            <option value="Béton maçonné">Béton maçonné</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Type de couvercle</label>
                                        <select {...register("type_couvercle")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('type_couvercle')}`}>
                                            <option value="">Sélectionner...</option>
                                            <option value="Tampon Fonte">Tampon Fonte</option>
                                            <option value="Couvercle PVC">Couvercle PVC</option>
                                            <option value="Dalle Béton">Dalle Béton</option>
                                            <option value="Grille">Grille</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Affleurement</label>
                                        <select {...register("affleurement")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('affleurement')}`}>
                                            <option value="">Sélectionner...</option>
                                            <option value="Affleurant au sol (RAS)">Affleurant au sol (RAS)</option>
                                            <option value="Surélevé (+1 à +5 cm)">Surélevé (+1 à +5 cm)</option>
                                            <option value="Enfoncé (-1 à -5 cm)">Enfoncé (-1 à -5 cm)</option>
                                            <option value="Sous terre">Sous terre</option>
                                            <option value="sous enrobé">sous enrobé</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">État couvercle</label>
                                        <select {...register("etat_couvercle")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('etat_couvercle')}`}>
                                            <option value="">Sélectionner...</option>
                                            <option value="Bon état">Bon état</option>
                                            <option value="Fissuré / Ébréché">Fissuré / Ébréché</option>
                                            <option value="Cassé à remplacer">Cassé à remplacer</option>
                                            <option value="Verrouillé / Grippé">Verrouillé / Grippé</option>
                                            <option value="Manquant">Manquant</option>
                                        </select>
                                    </div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prof. (cm)</label><input type="number" {...register("profondeur_cm", { valueAsNumber: true })} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('profondeur_cm')}`} /></div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-700">Observations physiques</label>
                                        <button type="button" onClick={() => toggleDictation('observations_physiques')} className={`text-sm px-3 py-1 rounded border ${listeningField === 'observations_physiques' ? 'bg-red-600 text-white animate-pulse' : 'bg-white'}`}>🎤 Dicter</button>
                                    </div>
                                    <textarea {...register("observations_physiques")} rows={3} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('observations_physiques')}`} />
                                </div>

                                {/* PHOTO COUVERCLE */}
                                <div className="pt-3 border-t border-gray-200">
                                    <label className="block text-sm font-bold text-gray-800 mb-2">📸 Photo Couvercle</label>
                                    {photoPreviews.photo_couvercle ? (
                                        <div className="relative inline-block bg-gray-100 p-1 rounded-lg border shadow-sm">
                                            <img src={photoPreviews.photo_couvercle} alt="Couvercle" className="h-32 w-32 object-cover rounded" />
                                            <button type="button" onClick={() => handleRemovePhoto('photo_couvercle')} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
                                        </div>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                            <span className="text-2xl mb-1">📷</span><span className="text-sm font-medium text-blue-700">Importer Photo</span>
                                            <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoCapture('photo_couvercle', e)} className="hidden" />
                                        </label>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* --- SECTION 3 : ÉCOULEMENT & DIAGNOSTIC --- */}
                    {!nonTrouvee && (
                        <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">3. Écoulement & Diagnostic</h2>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Écoulement</label>
                                        <select {...register("ecoulement")} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('ecoulement')}`}>
                                            <option value="">Sélectionner...</option>
                                            <option value="Fluide et normal">Fluide et normal</option>
                                            <option value="Stagnation légère">Stagnation légère</option>
                                            <option value="Engorgement / Obstrué">Engorgement / Obstrué</option>
                                            <option value="Refoulement constaté">Refoulement constaté</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Dépôts</label>
                                        <select {...register("depots")} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('depots')}`}>
                                            <option value="">Sélectionner...</option>
                                            <option value="Aucun dépôt">Aucun dépôt</option>
                                            <option value="Graisses">Graisses</option>
                                            <option value="Sables / Boues">Sables / Boues</option>
                                            <option value="Lingettes / Déchets">Lingettes / Déchets</option>
                                            <option value="Tartre / Calcaire">Tartre / Calcaire</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Eaux parasites</label>
                                        <select {...register("eaux_parasites")} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('eaux_parasites')}`}>
                                            <option value="">Sélectionner...</option>
                                            <option value="Aucune infiltration">Aucune infiltration</option>
                                            <option value="Infiltration eau claire (nappe)">Infiltration eau claire (nappe)</option>
                                            <option value="Apport eau pluviale parasite">Apport eau pluviale parasite</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">État parois</label>
                                        <select {...register("etat_parois")} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('etat_parois')}`}>
                                            <option value="">Sélectionner...</option>
                                            <option value="Bon état étanche">Bon état étanche</option>
                                            <option value="Déboîtement / Corrosion">Déboîtement / Corrosion</option>
                                            <option value="Fissures / Infiltrations">Fissures / Infiltrations</option>
                                            <option value="Racines">Racines</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-700">Action préconisée</label>
                                        <button type="button" onClick={() => toggleDictation('action_preconisee')} className={`text-sm px-3 py-1 rounded border ${listeningField === 'action_preconisee' ? 'bg-red-600 text-white animate-pulse' : 'bg-white'}`}>🎤 Dicter</button>
                                    </div>
                                    <input {...register("action_preconisee")} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('action_preconisee')}`} />
                                </div>

                                {/* PHOTO INTERIEUR */}
                                <div className="pt-3 border-t border-gray-200">
                                    <label className="block text-sm font-bold text-gray-800 mb-2">📸 Photo Intérieur</label>
                                    {photoPreviews.photo_interieur ? (
                                        <div className="relative inline-block bg-gray-100 p-1 rounded-lg border shadow-sm">
                                            <img src={photoPreviews.photo_interieur} alt="Intérieur" className="h-32 w-32 object-cover rounded" />
                                            <button type="button" onClick={() => handleRemovePhoto('photo_interieur')} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
                                        </div>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                            <span className="text-2xl mb-1">📷</span><span className="text-sm font-medium text-blue-700">Importer Photo</span>
                                            <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoCapture('photo_interieur', e)} className="hidden" />
                                        </label>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* --- BOUTON DE SOUMISSION --- */}
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-md z-40">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`w-full py-4 rounded-xl text-xl font-bold text-white transition-colors shadow-md ${isSubmitting ? 'bg-blue-400 cursor-not-allowed animate-pulse' : 'bg-blue-700 active:bg-blue-800'}`}
                        >
                            {isSubmitting ? '⏳ Traitement en cours...' : (editId ? 'Sauvegarder les modifications' : 'Enregistrer le récolement')}
                        </button>
                    </div>
                </form>
            )}

            {/* --- MODALE AJOUT REPÈRE --- */}
            {isRepereModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="text-lg font-bold text-gray-800">Nouveau repère</h3>
                            <button type="button" onClick={() => setIsRepereModalOpen(false)} className="text-gray-400 text-xl font-bold">&times;</button>
                        </div>
                        <div className="space-y-3">
                            <div><label className="block text-xs font-semibold mb-1">Point de Repère *</label><input value={currentRepere.point} onChange={(e) => setCurrentRepere({ ...currentRepere, point: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-semibold">Description *</label>
                                    <button type="button" onClick={() => toggleDictation('description', true)} className="text-xs px-2 py-1 rounded border">🎤 Dicter</button>
                                </div>
                                <input value={currentRepere.description} onChange={(e) => setCurrentRepere({ ...currentRepere, description: e.target.value })} className="w-full p-2 border rounded-lg" />
                            </div>
                            <div><label className="block text-xs font-semibold mb-1">Distance</label><input value={currentRepere.distance} onChange={(e) => setCurrentRepere({ ...currentRepere, distance: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-semibold">Observations</label>
                                    <button type="button" onClick={() => toggleDictation('observations', true)} className="text-xs px-2 py-1 rounded border">🎤 Dicter</button>
                                </div>
                                <textarea value={currentRepere.observations} onChange={(e) => setCurrentRepere({ ...currentRepere, observations: e.target.value })} rows={2} className="w-full p-2 border rounded-lg resize-none" />
                            </div>
                        </div>
                        <div className="flex space-x-3 pt-3 border-t">
                            <button type="button" onClick={() => setIsRepereModalOpen(false)} className="flex-1 bg-gray-100 py-2 rounded-xl font-medium">Annuler</button>
                            <button type="button" onClick={handleAddRepere} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-medium shadow-sm">Valider</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}