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
        console.log("Nom de cloud utilisé :", import.meta.env.VITE_CLOUDINARY_CLOUD_NAME);
        console.log("Preset utilisé :", import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
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

    // État pour la dictée vocale (stocke le nom du champ en cours d'écoute)
    const [listeningField, setListeningField] = useState<string | null>(null);

    // Référence pour stocker l'instance de reconnaissance vocale en cours
    const recognitionRef = useRef<any>(null);

    // États séparés pour les fichiers bruts (en attente d'envoi) et leurs aperçus visuels locaux
    const [photoFiles, setPhotoFiles] = useState<{
        photo_situation: File | null;
        photo_couvercle: File | null;
        photo_interieur: File | null;
        photo_geolocalisation: File | null;
    }>({
        photo_situation: null,
        photo_couvercle: null,
        photo_interieur: null,
        photo_geolocalisation: null
    });

    const [photoPreviews, setPhotoPreviews] = useState<{
        photo_situation: string | null;
        photo_couvercle: string | null;
        photo_interieur: string | null;
        photo_geolocalisation: File | null;
    }>({
        photo_situation: null,
        photo_couvercle: null,
        photo_interieur: null,
        photo_geolocalisation: null
    });

    // État de chargement global lors de la soumission et de l'envoi des photos
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Configuration de react-hook-form
    const { register, handleSubmit, formState: { errors }, watch, setValue, getValues } = useForm<RecoletBoite>({
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

    // Gestion de l'insertion automatique du symbole au début du champ dimensions selon la forme
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

    // Fonction utilitaire pour retourner la classe de fond selon si le champ est rempli ou non
    const getFieldBg = (fieldName: keyof RecoletBoite) => {
        const val = formValues[fieldName];
        const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0);
        return isEmpty ? "bg-amber-50/80 border-amber-200" : "bg-white border-gray-300";
    };

    // --- GESTION LOCALE DES PHOTOS (Stockage de l'objet File et création d'un aperçu) ---
    const handlePhotoCapture = (photoType: 'photo_situation' | 'photo_couvercle' | 'photo_interieur', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const previewUrl = URL.createObjectURL(file);

        setPhotoFiles(prev => ({ ...prev, [photoType]: file }));
        setPhotoPreviews(prev => ({ ...prev, [photoType]: previewUrl }));
    };

    const handleRemovePhoto = (photoType: 'photo_situation' | 'photo_couvercle' | 'photo_interieur') => {
        setPhotoFiles(prev => ({ ...prev, [photoType]: null }));
        setPhotoPreviews(prev => ({ ...prev, [photoType]: null }));
    };

    // --- GESTION DES REPÈRES (TRIANGULATION) ---
    const getNextRepereName = (list: any[]) => {
        let n = 1;
        while (list.some(r => r.point === `REP ${n}`)) {
            n++;
        }
        return `REP ${n}`;
    };

    const handleOpenModal = () => {
        setCurrentRepere({
            point: getNextRepereName(reperesList),
            description: '',
            distance: '',
            observations: ''
        });
        setIsRepereModalOpen(true);
    };

    const handleAddRepere = () => {
        if (!currentRepere.point || !currentRepere.description) {
            alert("Veuillez renseigner au moins le point de repère et la description.");
            return;
        }

        const nameExists = reperesList.some(
            (r) => r.point.trim().toLowerCase() === currentRepere.point.trim().toLowerCase()
        );

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

    // Fonction de bascule pour démarrer ou arrêter manuellement la dictée vocale
    const toggleDictation = (field: string, isModal: boolean = false) => {
        const trackingKey = isModal ? `modal_${field}` : field;

        if (listeningField === trackingKey && recognitionRef.current) {
            recognitionRef.current.stop();
            return;
        }

        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert("La dictée vocale n'est pas supportée nativement sur ce navigateur. Essayez sur Chrome ou Safari.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;

        recognitionRef.current = recognition;

        recognition.onstart = () => {
            setListeningField(trackingKey);
        };

        recognition.onresult = (event: any) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    transcript += event.results[i][0].transcript;
                }
            }
            if (transcript) {
                if (isModal) {
                    setCurrentRepere(prev => {
                        const currentText = prev[field as keyof typeof prev] || "";
                        const newText = currentText ? `${currentText} ${transcript}` : transcript;
                        return { ...prev, [field]: newText };
                    });
                } else {
                    const currentText = getValues(field as keyof RecoletBoite) || "";
                    const newText = currentText ? `${currentText} ${transcript}` : transcript;
                    setValue(field as keyof RecoletBoite, newText as any);
                }
            }
        };

        recognition.onerror = (event: any) => {
            console.error("Erreur de reconnaissance vocale :", event.error);
            setListeningField(null);
            recognitionRef.current = null;
        };

        recognition.onend = () => {
            setListeningField(null);
            recognitionRef.current = null;
        };

        recognition.start();
    };

    // Fonction d'interrogation des API publiques (BAN & IGN) avec ID Ouvrage automatique
    const fetchAddressAndCadastre = async (lat: number, lon: number) => {
        try {
            setActiveCoords({ lat, lon });

            let codeInsee = '';
            let sectionVal = '';
            let parcelleVal = '';

            const resAdresse = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lon}`);
            const dataAdresse = await resAdresse.json();

            if (dataAdresse.features && dataAdresse.features.length > 0) {
                const props = dataAdresse.features[0].properties;

                if (props.citycode) {
                    codeInsee = props.citycode;
                }

                if (props.city) {
                    setValue('commune', props.city as any);
                } else {
                    setValue('commune', '' as any);
                }

                setValue('voie_numero', props.housenumber || '');
                setValue('voie_nom', props.street || '');
            } else {
                setValue('commune', '' as any);
                setValue('voie_numero', '');
                setValue('voie_nom', '');
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
            } else {
                setValue('section_cadastrale', '');
                setValue('parcelle_cadastrale', '');
            }

            if (codeInsee && sectionVal && parcelleVal) {
                const basePrefix = `${codeInsee}-${sectionVal}${parcelleVal}-BR`;

                const { count, error } = await supabase
                    .from('recolements_boites')
                    .select('*', { count: 'exact', head: true })
                    .ilike('id_ouvrage', `${basePrefix}%`);

                let finalIdOuvrage = basePrefix;

                if (!error && count !== null && count > 0) {
                    const chrono = String(count + 1).padStart(2, '0');
                    finalIdOuvrage = `${basePrefix}-${chrono}`;
                }

                setValue('id_ouvrage', finalIdOuvrage);
            } else {
                setValue('id_ouvrage', '');
            }
        } catch (error) {
            console.error("❌ Erreur lors de la récupération :", error);
            setValue('commune', '' as any);
            setValue('voie_numero', '');
            setValue('voie_nom', '');
            setValue('section_cadastrale', '');
            setValue('parcelle_cadastrale', '');
            setValue('id_ouvrage', '');
        }
    };

    useEffect(() => {
        if (location.latitude != null && location.longitude != null) {
            if (
                !lastFetchedCoords.current ||
                lastFetchedCoords.current.lat !== location.latitude ||
                lastFetchedCoords.current.lon !== location.longitude
            ) {
                lastFetchedCoords.current = { lat: location.latitude, lon: location.longitude };
                fetchAddressAndCadastre(location.latitude, location.longitude);
            }
        }
    }, [location.latitude, location.longitude]);

    // --- SOUMISSION GLOBALE (Envoi des photos vers Cloudinary + Sauvegarde des données) ---
    const onSubmit = async (data: RecoletBoite) => {
        setIsSubmitting(true);

        // 🧹 Nettoyage : Transforme toutes les chaînes vides "" en null pour les enums et champs optionnels
        Object.keys(data).forEach((key) => {
            if ((data as any)[key] === "") {
                (data as any)[key] = null;
            }
        });

        let situationUrl = null;
        let couvercleUrl = null;
        let interieurUrl = null;

        // Si l'utilisateur est en ligne, on envoie les fichiers stockés vers Cloudinary au clic sur Enregistrer
        if (isOnline) {
            try {
                if (photoFiles.photo_situation) {
                    situationUrl = await uploadToCloudinary(photoFiles.photo_situation);
                }
                if (photoFiles.photo_couvercle) {
                    couvercleUrl = await uploadToCloudinary(photoFiles.photo_couvercle);
                }
                if (photoFiles.photo_interieur) {
                    interieurUrl = await uploadToCloudinary(photoFiles.photo_interieur);
                }
            } catch (err) {
                console.error("Erreur lors de l'envoi groupé des photos :", err);
            }
        }

data.reperes = reperesList;

        data.photo_situation_url = situationUrl as any;
        data.photo_couvercle_url = couvercleUrl as any;
        data.photo_interieur_url = interieurUrl as any;

        data.photo_situation = situationUrl as any;
        data.photo_couvercle = couvercleUrl as any;
        data.photo_interieur = interieurUrl as any;

        if (activeCoords) {
            data.latitude = activeCoords.lat;
            data.longitude = activeCoords.lon;
            data.precision_gps = location.accuracy || 5;
        }

        if (isOnline) {
            const { data: responseData, error } = await supabase
                .from('recolements_boites')
                .insert([data])
                .select();

            setIsSubmitting(false);

            if (error) {
                console.error('❌ ERREUR SUPABASE COMPLETE :', error);
                alert(`Erreur Supabase : ${error.message} (Code: ${error.code})`);
            } else {
                console.log('✅ SUCCÈS SUPABASE :', responseData);
                alert('✅ Relevé et photos enregistrés avec succès dans Supabase !');
            }
        } else {
            setIsSubmitting(false);
            try {
                await offlineDb.pendingSync.add({
                    data,
                    createdAt: new Date().toISOString()
                } as any);
                alert('📦 Hors-ligne : Relevé sauvegardé dans la mémoire du téléphone ! (Les photos nécessiteront une connexion lors de la synchronisation)');
            } catch (err: any) {
                console.error('❌ ERREUR DEXIE :', err);
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

            <h1 className="text-2xl font-bold mb-6 text-gray-800">Fiche de Récolement</h1>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

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
                                    placeholder="Votre nom"
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

                        {/* Boîte non trouvée */}
                        <div className="flex items-center space-x-3 pt-2">
                            <input
                                type="checkbox"
                                id="non_trouvee"
                                {...register("non_trouvee")}
                                className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
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

                        {/* Bloc GPS & Carte Interactive */}
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="font-medium text-gray-800">Coordonnées GPS & Carte</span>
                                    <p className="text-xs text-gray-500">Cliquez sur la carte pour ajuster l'emplacement de l'ouvrage</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestLocation}
                                    disabled={location.loading}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium shadow-sm active:bg-blue-700"
                                >
                                    {location.loading ? 'Recherche...' : '📍 Capturer ma position'}
                                </button>
                            </div>

                            {activeCoords ? (
                                <>
                                    <div className="text-sm text-green-700 font-mono bg-green-50 p-2 rounded border border-green-200">
                                        Lat: {activeCoords.lat.toFixed(6)} | Lng: {activeCoords.lon.toFixed(6)}
                                        {location.accuracy && <span className="block text-xs">Précision GPS: ±{Math.round(location.accuracy)} mètres</span>}
                                    </div>

                                    <div className="h-72 w-full rounded-lg overflow-hidden border border-gray-300 shadow-inner z-0">
                                        <MapContainer
                                            center={[activeCoords.lat, activeCoords.lon]}
                                            zoom={18}
                                            style={{ height: '100%', width: '100%' }}
                                        >
                                            <MapRecenter center={[activeCoords.lat, activeCoords.lon]} />
                                            <MapClickHandler onMapClick={(lat, lon) => fetchAddressAndCadastre(lat, lon)} />

                                            <LayersControl position="topright">
                                                <LayersControl.BaseLayer name="Plan (OSM)">
                                                    <TileLayer
                                                        attribution='&copy; OpenStreetMap contributors'
                                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                    />
                                                </LayersControl.BaseLayer>

                                                <LayersControl.BaseLayer checked name="Satellite (IGN)">
                                                    <TileLayer
                                                        url="https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
                                                        attribution="&copy; IGN - Orthophotos (Géoplateforme)"
                                                        maxZoom={19}
                                                    />
                                                </LayersControl.BaseLayer>

                                                <LayersControl.Overlay checked name="Cadastre (IGN)">
                                                    <WMSTileLayer
                                                        url="https://wxs.ign.fr/essentiels/geoportail/wms?"
                                                        layers="CADASTRALPARCELS.PARCELS"
                                                        format="image/png"
                                                        transparent={true}
                                                        version="1.3.0"
                                                        attribution="&copy; IGN - Cadastre"
                                                    />
                                                </LayersControl.Overlay>
                                            </LayersControl>

                                            <Marker position={[activeCoords.lat, activeCoords.lon]}>
                                                <Popup>
                                                    Ouvrage sélectionné <br />
                                                    Lat: {activeCoords.lat.toFixed(5)} <br />
                                                    Lng: {activeCoords.lon.toFixed(5)}
                                                </Popup>
                                            </Marker>
                                        </MapContainer>
                                    </div>
                                </>
                            ) : (
                                <div className="text-sm text-gray-500 italic py-2">
                                    Aucune position capturée. Cliquez sur « Capturer ma position » pour afficher la carte et le cadastre.
                                </div>
                            )}

                            {location.error && (
                                <div className="text-sm text-red-600 mt-2">{location.error}</div>
                            )}
                        </div>



                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Commune *</label>
                            <input
                                {...register("commune", { required: "Commune requise" })}
                                className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('commune')}`}
                                placeholder="Nom de la commune"
                            />
                            {errors.commune && <span className="text-red-500 text-sm mt-1">{errors.commune.message}</span>}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">N° de voie</label>
                                <input
                                    {...register("voie_numero")}
                                    className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('voie_numero')}`}
                                    placeholder="Ex: 12"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de voie</label>
                                <input
                                    {...register("voie_nom")}
                                    className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('voie_nom')}`}
                                    placeholder="Ex: Rue de la République"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Section cadastrale</label>
                                <input
                                    {...register("section_cadastrale")}
                                    className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('section_cadastrale')}`}
                                    placeholder="Ex: AB"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Parcelle cadastrale</label>
                                <input
                                    {...register("parcelle_cadastrale")}
                                    className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('parcelle_cadastrale')}`}
                                    placeholder="Ex: 0123"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Domaine d'assise</label>
                                <select
                                    {...register("domaine_assise")}
                                    className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('domaine_assise')}`}
                                >
                                    <option value="">Sélectionner...</option>
                                    <option value="Domaine Public (Trottoir)">Domaine Public (Trottoir)</option>
                                    <option value="Domaine Public (Chaussée)">Domaine Public (Chaussée)</option>
                                    <option value="Domaine Public (Accotement)">Domaine Public (Accotement)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Accessibilité du site</label>
                                <select
                                    {...register("accessibilite_site")}
                                    className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('accessibilite_site')}`}
                                >
                                    <option value="">Sélectionner...</option>
                                    <option value="Accès libre">Accès libre</option>
                                    <option value="Visibilité masquée (végétation/terre)">Visibilité masquée (végétation/terre)</option>
                                    <option value="Enfouie sous enrobé">Enfouie sous enrobé</option>
                                </select>
                            </div>
                        </div>



                        {/* --- GESTION DES REPÈRES (TRIANGULATION) --- */}
                        <div className="pt-4 border-t border-gray-200 mt-4">
                            <div className="flex justify-between items-center mb-3">
                                <div>
                                    <span className="block text-sm font-bold text-gray-800">Repères de localisation ({reperesList.length})</span>
                                    <span className="text-xs text-gray-500">Points fixes de triangulation</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleOpenModal}
                                    className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
                                >
                                    + Ajouter un repère
                                </button>
                            </div>

                            {reperesList.length > 0 ? (
                                <div className="space-y-2">
                                    {reperesList.map((rep, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                            <div>
                                                <span className="font-bold text-blue-800">{rep.point}</span> : <span className="font-medium">{rep.description}</span> — <span className="font-semibold text-gray-700">{rep.distance}</span>
                                                {rep.observations && <p className="text-gray-500 text-xs italic mt-0.5">{rep.observations}</p>}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveRepere(idx)}
                                                className="text-red-500 hover:text-red-700 p-1 font-bold"
                                                title="Supprimer ce repère"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200 text-center">
                                    Aucun repère enregistré. Cliquez sur « + Ajouter un repère » pour en créer.
                                </div>
                            )}
                        </div>

                        {/* --- ZONE DE SAISIE LIBRE AVEC DICTÉE SOUS LA CARTE --- */}
                        <div className="pt-2">
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-gray-700">Observations de localisation / Accès (Saisie libre)</label>
                                <button
                                    type="button"
                                    onClick={() => toggleDictation('observations_localisation')}
                                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border shadow-sm ${listeningField === 'observations_localisation'
                                        ? 'bg-red-600 text-white border-red-700 animate-pulse'
                                        : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 active:bg-blue-100'
                                        }`}
                                >
                                    <span>{listeningField === 'observations_localisation' ? '⏹️ Arrêter' : '🎤 Dicter'}</span>
                                </button>
                            </div>
                            <textarea
                                {...register("observations_localisation" as keyof RecoletBoite)}
                                rows={2}
                                className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('observations_localisation' as keyof RecoletBoite)}`}
                                placeholder="Précisions sur l'accès, portail, code, repères visuels..."
                            />
                        </div>

                        {/* --- PHOTO SITUATION --- */}
                        <div className="pt-3 border-t border-gray-200">
                            <label className="block text-sm font-bold text-gray-800 mb-2">📸 Photo Situation</label>
                            {photoPreviews.photo_situation ? (
                                <div className="relative inline-block bg-gray-100 p-1 rounded-lg border shadow-sm">
                                    <img src={photoPreviews.photo_situation} alt="Photo Situation" className="h-32 w-32 object-contain rounded" />
                                    <button
                                        type="button"
                                        onClick={() => handleRemovePhoto('photo_situation')}
                                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold shadow hover:bg-red-700"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                    <span className="text-2xl mb-1">📷</span>
                                    <span className="text-sm font-medium text-blue-700">Prendre ou importer la Photo Situation</span>
                                    <span className="text-xs text-gray-500 mt-0.5">Caméra ou galerie</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={(e) => handlePhotoCapture('photo_situation', e)}
                                        className="hidden"
                                    />
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
                                    <select
                                        {...register("forme")}
                                        className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('forme')}`}
                                    >
                                        <option value="">Sélectionner...</option>
                                        <option value="Circulaire">Circulaire</option>
                                        <option value="Carrée">Carrée</option>
                                        <option value="Rectangulaire">Rectangulaire</option>
                                        <option value="Trapézoïdale / Spéciale">Trapézoïdale / Spéciale</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dimensions</label>
                                    <input
                                        {...register("dimensions")}
                                        className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('dimensions')}`}
                                        placeholder="Ex: Ø 800 ou X 600x600"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Matériau</label>
                                    <select
                                        {...register("materiau")}
                                        className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('materiau')}`}
                                    >
                                        <option value="">Sélectionner...</option>
                                        <option value="PVC">PVC</option>
                                        <option value="Béton maçonné">Béton maçonné</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type de couvercle</label>
                                    <select
                                        {...register("type_couvercle")}
                                        className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('type_couvercle')}`}
                                    >
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
                                    <select
                                        {...register("affleurement")}
                                        className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('affleurement')}`}
                                    >
                                        <option value="">Sélectionner...</option>
                                        <option value="Affleurant au sol (RAS)">Affleurant au sol (RAS)</option>
                                        <option value="Surélevé (+1 à +5 cm)">Surélevé (+1 à +5 cm)</option>
                                        <option value="Enfoncé (-1 à -5 cm)">Enfoncé (-1 à -5 cm)</option>
                                        <option value="Sous terre">Sous terre</option>
                                        <option value="sous enrobé">sous enrobé</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">État du couvercle</label>
                                    <select
                                        {...register("etat_couvercle")}
                                        className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('etat_couvercle')}`}
                                    >
                                        <option value="">Sélectionner...</option>
                                        <option value="Bon état">Bon état</option>
                                        <option value="Fissuré / Ébréché">Fissuré / Ébréché</option>
                                        <option value="Cassé à remplacer">Cassé à remplacer</option>
                                        <option value="Verrouillé / Grippé">Verrouillé / Grippé</option>
                                        <option value="Manquant">Manquant</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Profondeur (cm)</label>
                                    <input
                                        type="number"
                                        {...register("profondeur_cm", { valueAsNumber: true })}
                                        className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('profondeur_cm')}`}
                                        placeholder="Ex: 150"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium text-gray-700">Observations physiques</label>
                                    <button
                                        type="button"
                                        onClick={() => toggleDictation('observations_physiques')}
                                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border shadow-sm ${listeningField === 'observations_physiques'
                                            ? 'bg-red-600 text-white border-red-700 animate-pulse'
                                            : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 active:bg-blue-100'
                                            }`}
                                    >
                                        <span>{listeningField === 'observations_physiques' ? '⏹️ Arrêter' : '🎤 Dicter'}</span>
                                    </button>
                                </div>
                                <textarea
                                    {...register("observations_physiques")}
                                    rows={3}
                                    className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('observations_physiques')}`}
                                    placeholder="Remarques sur l'état de l'ouvrage..."
                                />
                            </div>

                            {/* --- PHOTO COUVERCLE --- */}
                            <div className="pt-3 border-t border-gray-200">
                                <label className="block text-sm font-bold text-gray-800 mb-2">📸 Photo Couvercle</label>
                                {photoPreviews.photo_couvercle ? (
                                    <div className="relative inline-block bg-gray-100 p-1 rounded-lg border shadow-sm">
                                        <img src={photoPreviews.photo_couvercle} alt="Photo Couvercle" className="h-32 w-32 object-contain rounded" />
                                        <button
                                            type="button"
                                            onClick={() => handleRemovePhoto('photo_couvercle')}
                                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold shadow hover:bg-red-700"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                        <span className="text-2xl mb-1">📷</span>
                                        <span className="text-sm font-medium text-blue-700">Prendre ou importer la Photo Couvercle</span>
                                        <span className="text-xs text-gray-500 mt-0.5">Caméra ou galerie</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={(e) => handlePhotoCapture('photo_couvercle', e)}
                                            className="hidden"
                                        />
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
                                    <select
                                        {...register("ecoulement")}
                                        className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('ecoulement')}`}
                                    >
                                        <option value="">Sélectionner...</option>
                                        <option value="Fluide et normal">Fluide et normal</option>
                                        <option value="Stagnation légère">Stagnation légère</option>
                                        <option value="Engorgement / Obstrué">Engorgement / Obstrué</option>
                                        <option value="Refoulement constaté">Refoulement constaté</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dépôts</label>
                                    <select
                                        {...register("depots")}
                                        className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('depots')}`}
                                    >
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
                                    <select
                                        {...register("eaux_parasites")}
                                        className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('eaux_parasites')}`}
                                    >
                                        <option value="">Sélectionner...</option>
                                        <option value="Aucune infiltration">Aucune infiltration</option>
                                        <option value="Infiltration eau claire (nappe)">Infiltration eau claire (nappe)</option>
                                        <option value="Apport eau pluviale parasite">Apport eau pluviale parasite</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">État des parois</label>
                                    <select
                                        {...register("etat_parois")}
                                        className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('etat_parois')}`}
                                    >
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
                                    <button
                                        type="button"
                                        onClick={() => toggleDictation('action_preconisee')}
                                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border shadow-sm ${listeningField === 'action_preconisee'
                                            ? 'bg-red-600 text-white border-red-700 animate-pulse'
                                            : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 active:bg-blue-100'
                                            }`}
                                    >
                                        <span>{listeningField === 'action_preconisee' ? '⏹️ Arrêter' : '🎤 Dicter'}</span>
                                    </button>
                                </div>
                                <input
                                    {...register("action_preconisee")}
                                    className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('action_preconisee')}`}
                                    placeholder="Ex: Hydrocurage, Réparation..."
                                />
                            </div>

                            {/* --- PHOTO INTÉRIEUR --- */}
                            <div className="pt-3 border-t border-gray-200">
                                <label className="block text-sm font-bold text-gray-800 mb-2">📸 Photo Intérieur</label>
                                {photoPreviews.photo_interieur ? (
                                    <div className="relative inline-block bg-gray-100 p-1 rounded-lg border shadow-sm">
                                        <img src={photoPreviews.photo_interieur} alt="Photo Intérieur" className="h-32 w-32 object-contain rounded" />
                                        <button
                                            type="button"
                                            onClick={() => handleRemovePhoto('photo_interieur')}
                                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold shadow hover:bg-red-700"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                        <span className="text-2xl mb-1">📷</span>
                                        <span className="text-sm font-medium text-blue-700">Prendre ou importer la Photo Intérieur</span>
                                        <span className="text-xs text-gray-500 mt-0.5">Caméra ou galerie</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={(e) => handlePhotoCapture('photo_interieur', e)}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>

                        </div>
                    </section>
                )}

                {/* --- BOUTON DE SOUMISSION --- */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full py-4 rounded-xl text-xl font-bold shadow-md text-white transition-colors ${isSubmitting ? 'bg-blue-400 cursor-not-allowed animate-pulse' : 'bg-blue-700 active:bg-blue-800'
                            }`}
                    >
                        {isSubmitting ? '⏳ Envoi des photos et enregistrement...' : 'Enregistrer le récolement'}
                    </button>
                </div>

            </form>

            {/* --- FENÊTRE MODALE D'AJOUT DE REPÈRE --- */}
            {isRepereModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="text-lg font-bold text-gray-800">Nouveau repère de localisation</h3>
                            <button
                                type="button"
                                onClick={() => setIsRepereModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">Point de Repère *</label>
                                <input
                                    type="text"
                                    value={currentRepere.point}
                                    onChange={(e) => setCurrentRepere({ ...currentRepere, point: e.target.value })}
                                    placeholder="Ex: Repère 1"
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Description du point fixe *</label>
                                    <button
                                        type="button"
                                        onClick={() => toggleDictation('description', true)}
                                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border shadow-sm ${listeningField === 'modal_description'
                                            ? 'bg-red-600 text-white border-red-700 animate-pulse'
                                            : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 active:bg-blue-100'
                                            }`}
                                    >
                                        <span>{listeningField === 'modal_description' ? '⏹️ Arrêter' : '🎤 Dicter'}</span>
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={currentRepere.description}
                                    onChange={(e) => setCurrentRepere({ ...currentRepere, description: e.target.value })}
                                    placeholder="Ex: Coffret Elec, Poteau Enedis..."
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">Distance Mesurée</label>
                                <input
                                    type="text"
                                    value={currentRepere.distance}
                                    onChange={(e) => setCurrentRepere({ ...currentRepere, distance: e.target.value })}
                                    placeholder="Ex: 4,25 m"
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Observations</label>
                                    <button
                                        type="button"
                                        onClick={() => toggleDictation('observations', true)}
                                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border shadow-sm ${listeningField === 'modal_observations'
                                            ? 'bg-red-600 text-white border-red-700 animate-pulse'
                                            : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 active:bg-blue-100'
                                            }`}
                                    >
                                        <span>{listeningField === 'modal_observations' ? '⏹️ Arrêter' : '🎤 Dicter'}</span>
                                    </button>
                                </div>
                                <textarea
                                    value={currentRepere.observations}
                                    onChange={(e) => setCurrentRepere({ ...currentRepere, observations: e.target.value })}
                                    placeholder="Ex: Observations..."
                                    rows={2}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex space-x-3 pt-3 border-t">
                            <button
                                type="button"
                                onClick={() => setIsRepereModalOpen(false)}
                                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={handleAddRepere}
                                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-medium shadow-sm hover:bg-blue-700 transition-colors"
                            >
                                Valider le repère
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}