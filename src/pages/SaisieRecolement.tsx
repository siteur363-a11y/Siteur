import { useState, useEffect, useRef, useMemo } from 'react';

import { supabase } from '../lib/supabase';
import { useForm } from 'react-hook-form';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useGeolocation } from '../hooks/useGeolocation';
import type { RecoletBoite } from '../types/database';
import { offlineDb } from '../db/offlineDb';
import imageCompression from 'browser-image-compression';
import { exportRecolementToExcel } from '../services/exportExcelService';


// --- IMPORTS HORS-LIGNE & CARTOGRAPHIE ---
import * as turf from '@turf/turf';
import 'leaflet.offline';

// Imports pour la carte interactive Leaflet
import { MapContainer, TileLayer, Marker, Popup, WMSTileLayer, LayersControl, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';



const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Composant de recentrage
function MapRecenter({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, map.getZoom(), { animate: true });
    }, [center, map]);
    return null;
}

// Gestion des clics
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

// Indicateur de zoom en temps réel
function ZoomIndicator() {
    const [zoom, setZoom] = useState(18);
    useMapEvents({
        zoom() {
            setZoom(map.getZoom());
        },
    });

    return (
        <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono z-[1000] pointer-events-none">
            Zoom : {zoom}
        </div>
    );
}

// GESTIONNAIRE DE CARTE HORS-LIGNE
function OfflineMapManager() {
    const map = useMap();

    useEffect(() => {
        // @ts-ignore
        const offlineLayer = L.tileLayer.offline('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap (Cache Offline)'
        });

        offlineLayer.addTo(map);

        // @ts-ignore
        const saveControl = L.control.savetiles(offlineLayer, {
            zoomlevels: [16, 17, 18, 19],
            confirm(info: any, savetiles: any) {
                if (window.confirm(`Télécharger ${info._tilesforSave.length} tuiles cartographiques pour le mode hors-ligne ?`)) {
                    savetiles();
                }
            },
            confirmSave() {
                alert('✅ Zone cartographique téléchargée et disponible sans réseau !');
            },
            saveText: '💾 Cacher la zone',
            rmText: '🗑️ Vider le cache',
        });

        saveControl.addTo(map);

        return () => {
            map.removeControl(saveControl);
            map.removeLayer(offlineLayer);
        };
    }, [map]);

    return null;
}

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

    // États pour le filtrage de l'historique
    const [filterDate, setFilterDate] = useState<string>('');
    const [filterCommune, setFilterCommune] = useState<string>('');
    const [filterNumero, setFilterNumero] = useState<string>('');
    const [filterRue, setFilterRue] = useState<string>('');

    const [activeTab, setActiveTab] = useState<'saisie' | 'historique'>('saisie');
    const [historique, setHistorique] = useState<any[]>([]);
    const [isLoadingHist, setIsLoadingHist] = useState(false);
    const [editId, setEditId] = useState<string | number | null>(null);
    const [exportingId, setExportingId] = useState<string | number | null>(null);

    // Compteur de fiches hors-ligne en attente d'export
    const [pendingCount, setPendingCount] = useState<number>(0);

    // États pour le Modal d'Exportation In-Line
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [pendingItems, setPendingItems] = useState<any[]>([]);
    const [currentExportIndex, setCurrentExportIndex] = useState<number>(0);
    const [exportForm, setExportForm] = useState<RecoletBoite | null>(null);
    const [enriching, setEnriching] = useState<boolean>(false);
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [suggestions, setSuggestions] = useState<{
        commune?: string;
        voie_numero?: string;
        voie_nom?: string;
        section_cadastrale?: string;
        parcelle_cadastrale?: string;
        id_ouvrage?: string;
    }>({});
    const [exportPhotoPreviews, setExportPhotoPreviews] = useState<{
        situation: string | null;
        couvercle: string | null;
        interieur: string | null;
    }>({ situation: null, couvercle: null, interieur: null });

    // Repères Modal
    const [isRepereModalOpen, setIsRepereModalOpen] = useState(false);
    const [reperesList, setReperesList] = useState<any[]>([]);
    const [currentRepere, setCurrentRepere] = useState({
        point: '',
        description: '',
        distance: '',
        observations: ''
    });

    const [activeCoords, setActiveCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [listeningField, setListeningField] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

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

    const [isSubmitting, setIsSubmitting] = useState(false);

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

    // Listes d'options uniques extraites dynamiquement de l'historique pour les listes déroulantes
    const uniqueDates = useMemo(() => {
        const list = historique.map(rec => rec.date_recolement).filter(Boolean);
        return Array.from(new Set(list)).sort((a, b) => b.localeCompare(a));
    }, [historique]);

    const uniqueCommunes = useMemo(() => {
        const list = historique.map(rec => rec.commune).filter(Boolean);
        return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    }, [historique]);

    const uniqueNumeros = useMemo(() => {
        const list = historique.map(rec => rec.voie_numero).filter(Boolean);
        return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [historique]);

    const uniqueRues = useMemo(() => {
        const list = historique.map(rec => rec.voie_nom).filter(Boolean);
        return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    }, [historique]);

    // Rafraîchissement du nombre de fiches en attente
    const refreshPendingCount = async () => {
        try {
            const count = await offlineDb.pendingSync.count();
            setPendingCount(count);
        } catch (err) {
            console.error("Erreur lecture fiches hors-ligne :", err);
        }
    };

    useEffect(() => {
        refreshPendingCount();
        const interval = setInterval(refreshPendingCount, 4000);
        return () => clearInterval(interval);
    }, []);

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
            .limit(50);

        if (!error && data) {
            setHistorique(data);
        }
        setIsLoadingHist(false);
    };

    // --- LOGIQUE DE L'EXPORTATION IN-LINE PAS-À-PAS ---
    const handleOpenExportModal = async () => {
        const items = await offlineDb.pendingSync.toArray();
        if (items.length === 0) {
            alert("Aucune fiche en attente d'exportation.");
            return;
        }
        setPendingItems(items);
        setCurrentExportIndex(0);
        setIsExportModalOpen(true);
        loadExportItemAtIndex(0, items);
    };

    const loadExportItemAtIndex = (index: number, itemsList: any[]) => {
        const pendingItem = itemsList[index];
        if (!pendingItem) return;

        const formData = { ...pendingItem.data };
        setExportForm(formData);

        // Préparation des aperçus photos
        const situationUrl = pendingItem.localPhotos?.situation
            ? URL.createObjectURL(pendingItem.localPhotos.situation)
            : formData.photo_situation_url || null;

        const couvercleUrl = pendingItem.localPhotos?.couvercle
            ? URL.createObjectURL(pendingItem.localPhotos.couvercle)
            : formData.photo_couvercle_url || null;

        const interieurUrl = pendingItem.localPhotos?.interieur
            ? URL.createObjectURL(pendingItem.localPhotos.interieur)
            : formData.photo_interieur_url || null;

        setExportPhotoPreviews({
            situation: situationUrl,
            couvercle: couvercleUrl,
            interieur: interieurUrl
        });

        // Enrichissement automatique en ligne
        enrichPendingItem(pendingItem);
    };

    const enrichPendingItem = async (pendingItem: any) => {
        const data = pendingItem.data;
        const lat = data.latitude;
        const lon = data.longitude;

        setEnriching(true);
        setSuggestions({});

        let suggestedCommune = '';
        let suggestedNumero = '';
        let suggestedVoie = '';
        let codeInsee = '';
        let suggestedSection = '';
        let suggestedParcelle = '';
        let suggestedIdOuvrage = '';

        if (lat && lon && isOnline) {
            try {
                // 1. API Adresse (BAN)
                const resAdresse = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lon}`);
                if (resAdresse.ok) {
                    const dataAdresse = await resAdresse.json();
                    if (dataAdresse.features && dataAdresse.features.length > 0) {
                        const props = dataAdresse.features[0].properties;
                        suggestedCommune = props.city || '';
                        suggestedNumero = props.housenumber || '';
                        suggestedVoie = props.street || '';
                        codeInsee = props.citycode || '';
                    }
                }

                // 2. API Cadastre (APICarto IGN)
                const geometry = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
                const resCadastre = await fetch(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geometry)}&_limit=1`);
                if (resCadastre.ok) {
                    const dataCadastre = await resCadastre.json();
                    if (dataCadastre.features && dataCadastre.features.length > 0) {
                        const props = dataCadastre.features[0].properties;
                        suggestedSection = props.section || '';
                        suggestedParcelle = props.numero || '';
                    }
                }

                // 3. Calcul de l'ID Ouvrage unique sur Supabase
                if (codeInsee && suggestedSection && suggestedParcelle) {
                    const basePrefix = `${codeInsee}-${suggestedSection}${suggestedParcelle}-BR`;
                    const { count, error } = await supabase
                        .from('recolements_boites')
                        .select('*', { count: 'exact', head: true })
                        .ilike('id_ouvrage', `${basePrefix}%`);

                    if (!error && count !== null && count > 0) {
                        suggestedIdOuvrage = `${basePrefix}-${String(count + 1).padStart(2, '0')}`;
                    } else {
                        suggestedIdOuvrage = basePrefix;
                    }
                }
            } catch (err) {
                console.error("Erreur d'enrichissement en ligne :", err);
            }
        }

        setSuggestions({
            commune: suggestedCommune,
            voie_numero: suggestedNumero,
            voie_nom: suggestedVoie,
            section_cadastrale: suggestedSection,
            parcelle_cadastrale: suggestedParcelle,
            id_ouvrage: suggestedIdOuvrage
        });

        // Compléter par défaut si les champs de la fiche terrain étaient vides
        setExportForm(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                commune: prev.commune || suggestedCommune,
                voie_numero: prev.voie_numero,
                voie_nom: prev.voie_nom || suggestedVoie,
                section_cadastrale: prev.section_cadastrale || suggestedSection,
                parcelle_cadastrale: prev.parcelle_cadastrale || suggestedParcelle,
                id_ouvrage: prev.id_ouvrage || suggestedIdOuvrage
            };
        });

        setEnriching(false);
    };

    const handleValidateAndExport = async () => {
        if (!exportForm) return;
        setIsExporting(true);

        const currentPendingItem = pendingItems[currentExportIndex];

        try {
            const finalData = { ...exportForm };

            // Upload des photos vers Cloudinary si présentes localement
            if (currentPendingItem.localPhotos?.situation) {
                const url = await uploadToCloudinary(currentPendingItem.localPhotos.situation);
                if (url) finalData.photo_situation_url = url;
            }
            if (currentPendingItem.localPhotos?.couvercle) {
                const url = await uploadToCloudinary(currentPendingItem.localPhotos.couvercle);
                if (url) finalData.photo_couvercle_url = url;
            }
            if (currentPendingItem.localPhotos?.interieur) {
                const url = await uploadToCloudinary(currentPendingItem.localPhotos.interieur);
                if (url) finalData.photo_interieur_url = url;
            }

            // Nettoyage des champs système/temporaires avant envoi à Supabase
            const payload = { ...finalData } as any;
            delete payload.id;
            delete payload.created_at;
            delete payload.photo_situation;
            delete payload.photo_couvercle;
            delete payload.photo_interieur;

            // Remplacement des chaînes vides par null
            Object.keys(payload).forEach((key) => {
                if (payload[key] === "") payload[key] = null;
            });

            // Envoi dans la table Supabase
            const { error } = await supabase
                .from('recolements_boites')
                .insert([payload]);

            if (error) throw error;

            // Supprimer le brouillon local Dexie une fois l'export réussi
            if (currentPendingItem.id) {
                await offlineDb.pendingSync.delete(currentPendingItem.id);
            }

            // Mettre à jour la liste des fiches restantes
            const remaining = pendingItems.filter((_, idx) => idx !== currentExportIndex);
            setPendingItems(remaining);
            refreshPendingCount();

            if (remaining.length === 0) {
                setIsExportModalOpen(false);
                alert("🎉 Toutes les fiches hors-ligne ont été vérifiées et exportées avec succès !");
            } else {
                const nextIdx = currentExportIndex >= remaining.length ? remaining.length - 1 : currentExportIndex;
                setCurrentExportIndex(nextIdx);
                loadExportItemAtIndex(nextIdx, remaining);
            }

        } catch (err: any) {
            alert(`❌ Erreur lors de l'exportation : ${err.message || 'Erreur inconnue'}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleDeleteLocalDraft = async () => {
        const currentPendingItem = pendingItems[currentExportIndex];
        if (!currentPendingItem?.id) return;

        if (window.confirm("Voulez-vous vraiment supprimer définitivement cette fiche saisie hors-ligne ?")) {
            await offlineDb.pendingSync.delete(currentPendingItem.id);
            const remaining = pendingItems.filter((_, idx) => idx !== currentExportIndex);
            setPendingItems(remaining);
            refreshPendingCount();

            if (remaining.length === 0) {
                setIsExportModalOpen(false);
            } else {
                const nextIdx = currentExportIndex >= remaining.length ? remaining.length - 1 : currentExportIndex;
                setCurrentExportIndex(nextIdx);
                loadExportItemAtIndex(nextIdx, remaining);
            }
        }
    };

    const handleEditRecord = (record: any) => {
        setEditId(record.id || record.id_ouvrage);
        reset(record);
        setReperesList(record.reperes || []);
        if (record.latitude && record.longitude) {
            setActiveCoords({ lat: record.latitude, lon: record.longitude });
        } else {
            setActiveCoords(null);
        }
        setPhotoPreviews({
            photo_situation: record.photo_situation_url || null,
            photo_couvercle: record.photo_couvercle_url || null,
            photo_interieur: record.photo_interieur_url || null,
        });
        setPhotoFiles({ photo_situation: null, photo_couvercle: null, photo_interieur: null });
        setActiveTab('saisie');
    };

    const resetSaisie = () => {
        setEditId(null);
        const currentTech = getValues('technicien');
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

    const handlePhotoCapture = async (
        photoType: 'photo_situation' | 'photo_couvercle' | 'photo_interieur',
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const options = {
            maxSizeMB: 0.8,
            maxWidthOrHeight: 1920,
            useWebWorker: true
        };

        try {
            const compressedFile = await imageCompression(file, options);
            const previewUrl = URL.createObjectURL(compressedFile);

            setPhotoFiles(prev => ({ ...prev, [photoType]: compressedFile }));
            setPhotoPreviews(prev => ({ ...prev, [photoType]: previewUrl }));
        } catch (error) {
            console.error("Erreur lors de la compression de l'image :", error);
        }
    };

    const handleRemovePhoto = (photoType: 'photo_situation' | 'photo_couvercle' | 'photo_interieur') => {
        setPhotoFiles(prev => ({ ...prev, [photoType]: null }));
        setPhotoPreviews(prev => ({ ...prev, [photoType]: null }));
    };

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

    // RECHERCHE ADRESSE / CADASTRE ADAPTÉE HORS-LIGNE (TURF.JS)
    const fetchAddressAndCadastre = async (lat: number, lon: number) => {
        try {
            setActiveCoords({ lat, lon });

            if (!isOnline) {
                console.log("Mode hors-ligne détecté : recherche spatiale locale via Turf...");
                const pt = turf.point([lon, lat]);

                if ((offlineDb as any).parcelles) {
                    const parcelles = await (offlineDb as any).parcelles.toArray();
                    const foundParcelle = parcelles.find((p: any) => p.geom && turf.booleanPointInPolygon(pt, p.geom));

                    if (foundParcelle) {
                        setValue('section_cadastrale', foundParcelle.section || '');
                        setValue('parcelle_cadastrale', foundParcelle.numero || '');
                    }
                }

                if ((offlineDb as any).adresses) {
                    const adresses = await (offlineDb as any).adresses.toArray();
                    let nearestAddress: any = null;
                    let minDistance = Infinity;

                    adresses.forEach((addr: any) => {
                        if (addr.geometry) {
                            const addrPoint = turf.point(addr.geometry.coordinates);
                            const distance = turf.distance(pt, addrPoint, { units: 'meters' });
                            if (distance < minDistance) {
                                minDistance = distance;
                                nearestAddress = addr;
                            }
                        }
                    });

                    if (nearestAddress && minDistance < 50) {
                        setValue('commune', (nearestAddress.city || '') as any);
                        setValue('voie_numero', (nearestAddress.house_number || '') as any);
                        setValue('voie_nom', (nearestAddress.street || '') as any);
                    }
                }
                return;
            }

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
            console.error("❌ Erreur de récupération adresse/cadastre :", error);
        }
    };

    useEffect(() => {
        if (!editId && location.latitude != null && location.longitude != null) {
            if (!lastFetchedCoords.current || lastFetchedCoords.current.lat !== location.latitude || lastFetchedCoords.current.lon !== location.longitude) {
                lastFetchedCoords.current = { lat: location.latitude, lon: location.longitude };
                fetchAddressAndCadastre(location.latitude, location.longitude);
            }
        }
    }, [location.latitude, location.longitude, editId]);

    const onSubmit = async (data: RecoletBoite) => {
        setIsSubmitting(true);

        Object.keys(data).forEach((key) => {
            if ((data as any)[key] === "") (data as any)[key] = null;
        });

        if (isOnline) {
            try {
                if (photoFiles.photo_situation) {
                    const url = await uploadToCloudinary(photoFiles.photo_situation);
                    data.photo_situation_url = url as any;
                    data.photo_situation = url as any;
                } else if (!photoPreviews.photo_situation) {
                    data.photo_situation_url = null as any;
                    data.photo_situation = null as any;
                }

                if (photoFiles.photo_couvercle) {
                    const url = await uploadToCloudinary(photoFiles.photo_couvercle);
                    data.photo_couvercle_url = url as any;
                    data.photo_couvercle = url as any;
                } else if (!photoPreviews.photo_couvercle) {
                    data.photo_couvercle_url = null as any;
                    data.photo_couvercle = null as any;
                }

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
            if (location.accuracy) data.precision_gps = location.accuracy;
        }

        if (isOnline) {
            let error;
            const payload = { ...data } as any;
            delete payload.id;
            delete payload.created_at;
            delete payload.photo_situation;
            delete payload.photo_couvercle;
            delete payload.photo_interieur;

            if (editId) {
                const isTechnicalId = typeof editId === 'number' ||
                    (typeof editId === 'string' && /^\d+$/.test(editId)) ||
                    (typeof editId === 'string' && /^[0-9a-fA-F-]{36}$/.test(editId));

                const searchColumn = isTechnicalId ? 'id' : 'id_ouvrage';

                const res = await supabase
                    .from('recolements_boites')
                    .update(payload)
                    .eq(searchColumn, editId)
                    .select();

                error = res.error;

                if (!error && (!res.data || res.data.length === 0)) {
                    alert(`⚠️ Échec de la modification : l'ouvrage n'a pas été trouvé.`);
                    setIsSubmitting(false);
                    return;
                }
            } else {
                const res = await supabase
                    .from('recolements_boites')
                    .insert([payload]);
                error = res.error;
            }

            setIsSubmitting(false);

            if (error) {
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
                await offlineDb.pendingSync.add({
                    data,
                    localPhotos: {
                        situation: photoFiles.photo_situation || undefined,
                        couvercle: photoFiles.photo_couvercle || undefined,
                        interieur: photoFiles.photo_interieur || undefined,
                    },
                    createdAt: new Date().toISOString(),
                });
                alert('📦 Relevé et photos sauvegardés localement sur la tablette !');
                refreshPendingCount();
                resetSaisie();
            } catch (err: any) {
                alert(`Erreur de stockage local : ${err.message}`);
            }
        }
    };


    const handleExportExcel = async (record: RecoletBoite) => {
        try {
            setExportingId(record.id || record.id_ouvrage || null);
            await exportRecolementToExcel(record);
        } catch (error: any) {
            alert(`Erreur lors de l'exportation : ${error.message}`);
        } finally {
            setExportingId(null);
        }
    };


    // Filtrage dynamique de l'historique avec sélection stricte
    const historiqueFiltre = historique.filter((rec) => {
        const matchDate = filterDate ? rec.date_recolement === filterDate : true;
        const matchCommune = filterCommune ? rec.commune === filterCommune : true;
        const matchNumero = filterNumero ? rec.voie_numero === filterNumero : true;
        const matchRue = filterRue ? rec.voie_nom === filterRue : true;
        return matchDate && matchCommune && matchNumero && matchRue;
    });

    return (
        <div className="max-w-2xl mx-auto p-4 pb-24 bg-gray-50 min-h-screen">

            {/* BARRE D'ÉTAT + BOUTON EXPORT IN-LINE */}
            <div className={`p-3 mb-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2 shadow-sm ${isOnline ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                    <span>{isOnline ? '🟢 Connecté (Cloud)' : '🔴 Mode Hors Ligne'}</span>
                    {pendingCount > 0 && (
                        <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-mono">
                            {pendingCount} fiche(s) locale(s)
                        </span>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleOpenExportModal}
                    disabled={!isOnline || pendingCount === 0}
                    className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-bold shadow flex items-center justify-center gap-2 transition-all ${isOnline && pendingCount > 0
                        ? 'bg-amber-400 text-amber-950 hover:bg-amber-300 animate-pulse cursor-pointer'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60'
                        }`}
                >
                    🚀 Export In-Line {pendingCount > 0 ? `(${pendingCount})` : ''}
                </button>
            </div>

            <h1 className="text-2xl font-bold mb-4 text-gray-800">Fiche de Récolement</h1>

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

            {activeTab === 'historique' && (
                <div className="space-y-4">

                    {/* BANDEAU DE FILTRES AVEC LISTES DÉROULANTES DYNAMIQUES */}
                    {isOnline && historique.length > 0 && (
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Date de récolement</label>
                                <select
                                    value={filterDate}
                                    onChange={(e) => setFilterDate(e.target.value)}
                                    className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    <option value="">Toutes les dates</option>
                                    {uniqueDates.map((date) => (
                                        <option key={date} value={date}>{date}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Commune</label>
                                <select
                                    value={filterCommune}
                                    onChange={(e) => setFilterCommune(e.target.value)}
                                    className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    <option value="">Toutes les communes</option>
                                    {uniqueCommunes.map((commune) => (
                                        <option key={commune} value={commune}>{commune}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">N° de rue</label>
                                <select
                                    value={filterNumero}
                                    onChange={(e) => setFilterNumero(e.target.value)}
                                    className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    <option value="">Tous les numéros</option>
                                    {uniqueNumeros.map((num) => (
                                        <option key={num} value={num}>{num}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Nom de rue</label>
                                <select
                                    value={filterRue}
                                    onChange={(e) => setFilterRue(e.target.value)}
                                    className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    <option value="">Toutes les rues</option>
                                    {uniqueRues.map((rue) => (
                                        <option key={rue} value={rue}>{rue}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Compteur d'ouvrages et réinitialisation */}
                            <div className="md:col-span-4 flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
                                <span className="text-xs font-semibold text-gray-600">
                                    {historiqueFiltre.length} ouvrage{historiqueFiltre.length > 1 ? 's' : ''} trouvé{historiqueFiltre.length > 1 ? 's' : ''}
                                    {(filterDate || filterCommune || filterNumero || filterRue) && (
                                        <span className="text-gray-400 font-normal"> (sur {historique.length})</span>
                                    )}
                                </span>

                                {(filterDate || filterCommune || filterNumero || filterRue) && (
                                    <button
                                        type="button"
                                        onClick={() => { setFilterDate(''); setFilterCommune(''); setFilterNumero(''); setFilterRue(''); }}
                                        className="text-xs text-red-600 hover:text-red-800 font-bold px-2 py-1"
                                    >
                                        ✕ Effacer les filtres
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* AFFICHAGE DES ÉLÉMENTS FILTRÉS */}
                    {!isOnline ? (
                        <div className="p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-xl text-center">
                            L'historique nécessite une connexion internet.
                        </div>
                    ) : isLoadingHist ? (
                        <div className="text-center py-8 text-gray-500">Chargement des données...</div>
                    ) : historiqueFiltre.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            {historique.length === 0 ? "Aucun récolement trouvé." : "Aucun récolement ne correspond à vos filtres."}
                        </div>
                    ) : (
                        historiqueFiltre.map((rec) => (
                            <div key={rec.id || rec.id_ouvrage} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                <div className="flex gap-4 items-center">
                                    {rec.photo_situation_url ? (
                                        <img src={rec.photo_situation_url} alt="Situation" className="w-16 h-16 object-cover rounded-lg border border-gray-200 shadow-sm shrink-0" />
                                    ) : (
                                        <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl border border-gray-200 shadow-sm shrink-0">
                                            📷
                                        </div>
                                    )}
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
                                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={() => handleExportExcel(rec)}
                                        disabled={exportingId === (rec.id || rec.id_ouvrage)}
                                        className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {exportingId === (rec.id || rec.id_ouvrage) ? '⏳ Création...' : '📊 Exporter Excel'}
                                    </button>
                                    <button
                                        onClick={() => handleEditRecord(rec)}
                                        className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-200 transition-colors"
                                    >
                                        Modifier
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {activeTab === 'saisie' && (
                <form
                    onSubmit={handleSubmit(onSubmit, (formErrors) => {
                        console.error("❌ Erreurs de validation :", formErrors);
                        if (!isOnline) {
                            alert("Formulaire incomplet : Le champ Technicien et la Date sont obligatoires même hors-ligne.");
                        } else {
                            alert("Formulaire incomplet : vérifiez les champs obligatoires (ID Ouvrage, Technicien, Commune, Date).");
                        }
                    })}
                    className="space-y-8"
                >
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

                    <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">Informations Générales</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    ID Ouvrage {isOnline ? '*' : <span className="text-xs text-blue-600 font-normal italic">(Calculé à l'export)</span>}
                                </label>
                                <input
                                    {...register("id_ouvrage", { required: isOnline ? "Ce champ est obligatoire en ligne" : false })}
                                    className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('id_ouvrage')}`}
                                    placeholder={isOnline ? "Ex: 27638-AA0142-BR-01" : "Sera déduit avec le GPS"}
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
                                        <div className="h-72 w-full rounded-lg overflow-hidden border z-0 relative">
                                            <MapContainer center={[activeCoords.lat, activeCoords.lon]} zoom={18} style={{ height: '100%', width: '100%' }}>
                                                <ZoomIndicator />
                                                <MapRecenter center={[activeCoords.lat, activeCoords.lon]} />
                                                <MapClickHandler onMapClick={(lat, lon) => fetchAddressAndCadastre(lat, lon)} />

                                                <OfflineMapManager />

                                                <LayersControl position="topright">
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Commune {isOnline ? '*' : <span className="text-xs text-blue-600 font-normal italic">(Auto via GPS)</span>}
                                </label>
                                <input
                                    {...register("commune", { required: isOnline ? "Commune requise en ligne" : false })}
                                    className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('commune')}`}
                                    placeholder={!isOnline ? "Laissée vide = auto-complétion" : ""}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        N° voie {!isOnline && '*'}
                                    </label>
                                    <input
                                        {...register("voie_numero", { required: !isOnline ? "Obligatoire hors-ligne" : false })}
                                        className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('voie_numero')}`}
                                        placeholder={!isOnline ? "Ex: 12 bis" : ""}
                                    />
                                    {errors.voie_numero && <span className="text-red-500 text-xs mt-1">{errors.voie_numero.message}</span>}
                                </div>
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

            {/* MODAL DE DÉFINITION D'UN REPÈRE */}
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

            {/* MODAL EXPORT IN-LINE (REVUE ET VALIDATION PAS-À-PAS) */}
            {isExportModalOpen && exportForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-gray-200">

                        {/* Header Modal */}
                        <div className="px-6 py-4 bg-slate-800 text-white flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2">
                                    🚀 Contrôle Export In-Line
                                </h2>
                                <p className="text-xs text-slate-300">
                                    Fiche {currentExportIndex + 1} sur {pendingItems.length} en attente
                                </p>
                            </div>
                            <button onClick={() => setIsExportModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">✕</button>
                        </div>

                        {/* Corps Modal avec défilement */}
                        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">

                            {/* Alerte Enrichissement */}
                            {enriching ? (
                                <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-xl text-xs flex items-center gap-2 animate-pulse">
                                    <span>🔄</span> Recherche automatique BAN / Cadastre & calcul d'ID Ouvrage...
                                </div>
                            ) : (
                                <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded-xl text-xs flex items-center gap-2">
                                    <span>✅</span> Données enrichies via les services en ligne. Vous pouvez ajuster chaque champ avant export.
                                </div>
                            )}

                            {/* Section 1 : Ouvrage & Technicien */}
                            <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <h3 className="font-bold text-blue-800 border-b pb-1 text-base">Identifiants de la fiche</h3>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">ID Ouvrage</label>
                                    <input
                                        type="text"
                                        value={exportForm.id_ouvrage || ''}
                                        onChange={(e) => setExportForm({ ...exportForm, id_ouvrage: e.target.value })}
                                        className="w-full p-2.5 border rounded-lg font-mono font-bold bg-white"
                                    />
                                    {suggestions.id_ouvrage && exportForm.id_ouvrage !== suggestions.id_ouvrage && (
                                        <button
                                            type="button"
                                            onClick={() => setExportForm({ ...exportForm, id_ouvrage: suggestions.id_ouvrage })}
                                            className="text-xs text-blue-600 underline mt-1 block font-medium"
                                        >
                                            💡 Appliquer l'ID calculé : {suggestions.id_ouvrage}
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Technicien</label>
                                        <input
                                            type="text"
                                            value={exportForm.technicien || ''}
                                            onChange={(e) => setExportForm({ ...exportForm, technicien: e.target.value })}
                                            className="w-full p-2.5 border rounded-lg bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Date récolement</label>
                                        <input
                                            type="date"
                                            value={exportForm.date_recolement || ''}
                                            onChange={(e) => setExportForm({ ...exportForm, date_recolement: e.target.value })}
                                            className="w-full p-2.5 border rounded-lg bg-white"
                                        />
                                    </div>
                                </div>
                            </div>


                            {/* Carte Satellite dans la revue */}
                            {exportForm.latitude && exportForm.longitude && (
                                <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                    <div className="flex justify-between items-center border-b pb-1">
                                        <h3 className="font-bold text-blue-800 text-base">Localisation Terrain (Vue Satellite)</h3>
                                        <span className="text-xs text-gray-500 font-mono">
                                            Lat: {exportForm.latitude.toFixed(6)} | Lng: {exportForm.longitude.toFixed(6)}
                                        </span>
                                    </div>

                                    <div className="h-64 w-full rounded-lg overflow-hidden border border-gray-300 shadow-sm relative z-0">
                                        <MapContainer
                                            center={[exportForm.latitude, exportForm.longitude]}
                                            zoom={19}
                                            style={{ height: '100%', width: '100%' }}
                                        >
                                            <MapRecenter center={[exportForm.latitude, exportForm.longitude]} />
                                            <TileLayer
                                                url="https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
                                                maxZoom={19}
                                            />
                                            <Marker position={[exportForm.latitude, exportForm.longitude]}>
                                                <Popup>Emplacement capturé hors-ligne</Popup>
                                            </Marker>
                                        </MapContainer>
                                    </div>
                                </div>
                            )}

                            {/* Section 2 : Adresse & Cadastre */}
                            <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <h3 className="font-bold text-blue-800 border-b pb-1 text-base">Adresse & Cadastre enrichis</h3>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Commune</label>
                                    <input
                                        type="text"
                                        value={exportForm.commune || ''}
                                        onChange={(e) => setExportForm({ ...exportForm, commune: e.target.value })}
                                        className="w-full p-2.5 border rounded-lg bg-white"
                                    />
                                    {suggestions.commune && exportForm.commune !== suggestions.commune && (
                                        <button
                                            type="button"
                                            onClick={() => setExportForm({ ...exportForm, commune: suggestions.commune })}
                                            className="text-xs text-blue-600 underline mt-1 block"
                                        >
                                            💡 Suggestion BAN : {suggestions.commune}
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">N° voie</label>
                                        <input
                                            type="text"
                                            value={exportForm.voie_numero || ''}
                                            onChange={(e) => setExportForm({ ...exportForm, voie_numero: e.target.value })}
                                            className="w-full p-2.5 border rounded-lg bg-white"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Nom voie</label>
                                        <input
                                            type="text"
                                            value={exportForm.voie_nom || ''}
                                            onChange={(e) => setExportForm({ ...exportForm, voie_nom: e.target.value })}
                                            className="w-full p-2.5 border rounded-lg bg-white"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Section cadastrale</label>
                                        <input
                                            type="text"
                                            value={exportForm.section_cadastrale || ''}
                                            onChange={(e) => setExportForm({ ...exportForm, section_cadastrale: e.target.value })}
                                            className="w-full p-2.5 border rounded-lg bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Parcelle cadastrale</label>
                                        <input
                                            type="text"
                                            value={exportForm.parcelle_cadastrale || ''}
                                            onChange={(e) => setExportForm({ ...exportForm, parcelle_cadastrale: e.target.value })}
                                            className="w-full p-2.5 border rounded-lg bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 3 : Visualisation des photos */}
                            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <h3 className="font-bold text-blue-800 border-b pb-1 text-base">Photos rattachées</h3>
                                <div className="grid grid-cols-3 gap-3 text-center">
                                    <div>
                                        <span className="block text-xs font-semibold mb-1">Situation</span>
                                        {exportPhotoPreviews.situation ? (
                                            <img src={exportPhotoPreviews.situation} alt="Situation" className="w-full h-24 object-cover rounded-lg border" />
                                        ) : (
                                            <div className="w-full h-24 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-500">Sans photo</div>
                                        )}
                                    </div>
                                    <div>
                                        <span className="block text-xs font-semibold mb-1">Couvercle</span>
                                        {exportPhotoPreviews.couvercle ? (
                                            <img src={exportPhotoPreviews.couvercle} alt="Couvercle" className="w-full h-24 object-cover rounded-lg border" />
                                        ) : (
                                            <div className="w-full h-24 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-500">Sans photo</div>
                                        )}
                                    </div>
                                    <div>
                                        <span className="block text-xs font-semibold mb-1">Intérieur</span>
                                        {exportPhotoPreviews.interieur ? (
                                            <img src={exportPhotoPreviews.interieur} alt="Intérieur" className="w-full h-24 object-cover rounded-lg border" />
                                        ) : (
                                            <div className="w-full h-24 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-500">Sans photo</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Section 4 : Observations */}
                            <div className="space-y-3">
                                <label className="block text-xs font-semibold text-gray-700">Observations Terrain</label>
                                <textarea
                                    rows={2}
                                    value={exportForm.observations_localisation || ''}
                                    onChange={(e) => setExportForm({ ...exportForm, observations_localisation: e.target.value })}
                                    className="w-full p-2.5 border rounded-lg text-xs"
                                />
                            </div>

                        </div>

                        {/* Footer Modal Actions */}
                        <div className="p-4 bg-gray-100 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">

                            {/* Navigation */}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const prevIdx = currentExportIndex - 1;
                                        setCurrentExportIndex(prevIdx);
                                        loadExportItemAtIndex(prevIdx, pendingItems);
                                    }}
                                    disabled={currentExportIndex === 0}
                                    className="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold disabled:opacity-40"
                                >
                                    ◀ Précédent
                                </button>
                                <span className="text-xs font-mono font-bold">
                                    {currentExportIndex + 1} / {pendingItems.length}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const nextIdx = currentExportIndex + 1;
                                        setCurrentExportIndex(nextIdx);
                                        loadExportItemAtIndex(nextIdx, pendingItems);
                                    }}
                                    disabled={currentExportIndex >= pendingItems.length - 1}
                                    className="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold disabled:opacity-40"
                                >
                                    Suivant ▶
                                </button>
                            </div>

                            {/* Validation / Suppression */}
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <button
                                    type="button"
                                    onClick={handleDeleteLocalDraft}
                                    className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg"
                                >
                                    🗑️ Supprimer
                                </button>

                                <button
                                    type="button"
                                    onClick={handleValidateAndExport}
                                    disabled={isExporting}
                                    className={`px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow flex items-center gap-2 ${isExporting ? 'animate-pulse opacity-70' : ''}`}
                                >
                                    {isExporting ? '⏳ Exportation...' : '✅ Valider & Exporter'}
                                </button>
                            </div>

                        </div>

                    </div>
                </div>
            )}

        </div>
    );
}