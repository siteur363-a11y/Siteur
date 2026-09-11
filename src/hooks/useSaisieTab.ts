import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import imageCompression from 'browser-image-compression';
import * as turf from '@turf/turf';
import { useGeolocation } from './useGeolocation'; // Existant
import { supabase } from '../lib/supabase';
import { offlineDb } from '../db/offlineDb';
import { uploadToCloudinary } from '../services/cloudinaryService';
import type { RecoletBoite } from '../types/database';

export function useSaisieTab(isOnline: boolean, refreshPendingCount: () => void, setActiveTab: (tab: any) => void) {
    const { location, requestLocation } = useGeolocation();
    
    // UI & Edit States
const [editId, setEditId] = useState<string | number | null>(null);
    const [isViewMode, setIsViewMode] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Map / Coords
    const [activeCoords, setActiveCoords] = useState<{ lat: number; lon: number } | null>(null);
    const lastFetchedCoords = useRef<{ lat: number; lon: number } | null>(null);
    
    // Repères
    const [isRepereModalOpen, setIsRepereModalOpen] = useState(false);
    const [reperesList, setReperesList] = useState<any[]>([]);
    const [currentRepere, setCurrentRepere] = useState({ point: '', description: '', distance: '', observations: '' });

    // Flag States
    const [showSituationFlag, setShowSituationFlag] = useState<boolean>(true);
    const [situationFlagPos, setSituationFlagPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
    const [flagSize, setFlagSize] = useState<number>(40);
    const [isDraggingFlag, setIsDraggingFlag] = useState<boolean>(false);
    const [isFlagEditModalOpen, setIsFlagEditModalOpen] = useState<boolean>(false);
    const situationImageRef = useRef<HTMLDivElement>(null);

    // Photos
    const [enlargedPhotoUrl, setEnlargedPhotoUrl] = useState<string | null>(null);
    const [photoFiles, setPhotoFiles] = useState<{ photo_situation: File | null; photo_couvercle: File | null; photos_interieur: File[]; }>({ photo_situation: null, photo_couvercle: null, photos_interieur: [] });
    const [photoPreviews, setPhotoPreviews] = useState<{ photo_situation: string | null; photo_couvercle: string | null; photos_interieur: string[]; }>({ photo_situation: null, photo_couvercle: null, photos_interieur: [] });

    // Dictation
    const [listeningField, setListeningField] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    const initialTextRef = useRef<string>("");

    // Dimensions suggestions
    const [existingDimensions, setExistingDimensions] = useState<string[]>([]);

    // Form Hook
    const rhf = useForm<RecoletBoite>({
        defaultValues: {
            technicien: 'S.GUEDES',
            date_recolement: new Date().toISOString().split('T')[0],
            non_trouvee: false, reperes: [], actions_preconisees: [], action_precision: '',
            materiau_conduit: '', etat_cadre: ''
        }
    });

    const { watch, setValue, getValues, reset } = rhf;
    const formValues = watch();
    const nonTrouvee = watch('non_trouvee');
    const formeSelectionnee = watch('forme');

    // Auto-actions watch
    const etatCouvercle = watch('etat_couvercle');
    const etatCadre = watch('etat_cadre');
    const affleurement = watch('affleurement');
    const accessibiliteSite = watch('accessibilite_site');
    const ecoulement = watch('ecoulement');
    const etatParois = watch('etat_parois');
    const depots = watch('depots');
    const eauxParasites = watch('eaux_parasites');

    // Fetch dimensions
    useEffect(() => {
        const fetchDimensions = async () => {
            if (!isOnline) return;
            try {
                const { data, error } = await supabase.from('recolements_boites').select('dimensions').not('dimensions', 'is', null);
                if (!error && data) {
                    const validDims = data.map(d => d.dimensions).filter(dim => dim && dim.trim() !== '' && dim.trim() !== 'Ø' && dim.trim() !== 'X');
                    setExistingDimensions(Array.from(new Set(validDims)).sort() as string[]);
                }
            } catch (err) { console.error("Erreur récupération dimensions :", err); }
        };
        fetchDimensions();
    }, [isOnline]);

    // Dimensions formatter
    useEffect(() => {
        const currentDim = getValues('dimensions') || '';
        if (formeSelectionnee === 'Circulaire') {
            if (!currentDim || currentDim.startsWith('X ')) setValue('dimensions', 'Ø ');
            else if (!currentDim.startsWith('Ø')) setValue('dimensions', `Ø ${currentDim}`);
        } else if (formeSelectionnee === 'Carrée' || formeSelectionnee === 'Rectangulaire') {
            if (!currentDim || currentDim.startsWith('Ø ')) setValue('dimensions', 'X ');
            else if (!currentDim.startsWith('X')) setValue('dimensions', `X ${currentDim}`);
        }
    }, [formeSelectionnee, setValue, getValues]);

    // Auto-actions logic
    useEffect(() => {
        const actions: string[] = [];
        if (etatCouvercle === 'Cassé à remplacer' || etatCouvercle === 'Manquant' || etatCouvercle === 'Fissuré / Ébréché') actions.push("Remplacement du tampon");
        else if (etatCouvercle === 'Verrouillé / Grippé') actions.push("Dégrippage / Déblocage");
        if (etatCadre === 'Cassé' || etatCadre === 'Dégradé' || etatCadre === 'Fissuré / Ébréché') actions.push("Réparation du cadre");
        if (affleurement && affleurement !== 'Affleurant au sol (RAS)') actions.push("Remise à niveau de l'arase");
        if (accessibiliteSite === 'Visibilité masquée (végétation/terre)' || accessibiliteSite === 'Enfouie sous enrobé') actions.push("Dégagement d'accès");
        if (ecoulement === 'Engorgement / Obstrué' || ecoulement === 'Refoulement constaté') {
            actions.push("Débouchage / Dégorgement");
            if (ecoulement === 'Engorgement / Obstrué') actions.push("Curage / Nettoyage");
        }
        if (depots && depots !== 'Aucun dépôt' && !actions.includes("Curage / Nettoyage")) actions.push("Curage / Nettoyage");
        if (etatParois === 'Déboîtement' || etatParois === 'Fracture') actions.push("Reprise de raccordement");
        else if (etatParois === 'Corrosion') actions.push("Traitement anti-corrosion / Réfection");
        else if (etatParois === 'Racines' && !actions.includes("Curage / Nettoyage")) actions.push("Curage / Nettoyage");
        else if (etatParois === 'Fissures') actions.push("Traitement des infiltrations");
        if (eauxParasites && eauxParasites !== 'Aucune infiltration' && !actions.includes("Traitement des infiltrations")) actions.push("Traitement des infiltrations");
        
        if (actions.length === 0) actions.push("R.A.S.");
        setValue('actions_preconisees', actions);
    }, [etatCouvercle, etatCadre, affleurement, accessibiliteSite, ecoulement, etatParois, depots, eauxParasites, setValue]);

const getFieldBg = useCallback((fieldName: keyof RecoletBoite) => {
        const val = formValues[fieldName];
        const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0);
        const bg = isEmpty ? "bg-yellow-100 border-yellow-400" : "bg-white border-gray-300";
        return isViewMode ? `${bg} opacity-70 cursor-not-allowed` : bg;
    }, [formValues, isViewMode]);

    // Dictation
    const toggleDictation = useCallback((field: string, isModal: boolean = false) => {
        const trackingKey = isModal ? `modal_${field}` : field;
        if (listeningField === trackingKey && recognitionRef.current) {
            recognitionRef.current.stop();
            return;
        }
        if (recognitionRef.current) recognitionRef.current.stop();

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) { alert("La dictée vocale n'est pas supportée nativement sur ce navigateur."); return; }

        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR'; recognition.interimResults = false; recognition.continuous = true; recognition.maxAlternatives = 1;
        recognitionRef.current = recognition;

        initialTextRef.current = String(isModal ? (currentRepere[field as keyof typeof currentRepere] || "") : (getValues(field as keyof RecoletBoite) || ""));

        recognition.onstart = () => setListeningField(trackingKey);
        recognition.onresult = (event: any) => {
            let addedTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) if (event.results[i].isFinal) addedTranscript += " " + event.results[i][0].transcript;
            if (addedTranscript.trim()) {
                initialTextRef.current = (initialTextRef.current + " " + addedTranscript.trim()).trim();
                const nextValue = initialTextRef.current;
                if (isModal) setCurrentRepere(prev => ({ ...prev, [field]: nextValue }));
                else setValue(field as keyof RecoletBoite, nextValue as any);
            }
        };
        recognition.onerror = () => { setListeningField(null); recognitionRef.current = null; };
        recognition.onend = () => { setListeningField(null); recognitionRef.current = null; };
        recognition.start();
    }, [listeningField, getValues, setValue, currentRepere]);

    // Photos & Flags logic
    const handlePointerDown = useCallback((e: React.PointerEvent) => { e.preventDefault(); setIsDraggingFlag(true); (e.target as HTMLElement).setPointerCapture(e.pointerId); }, []);
    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingFlag || !situationImageRef.current) return;
        const rect = situationImageRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        setSituationFlagPos({ x, y });
    }, [isDraggingFlag]);
    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (isDraggingFlag) { setIsDraggingFlag(false); try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch (err) { } }
    }, [isDraggingFlag]);

    const handlePhotoCapture = async (photoType: 'photo_situation' | 'photo_couvercle' | 'photos_interieur', e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1920, useWebWorker: true };
        try {
            if (photoType === 'photos_interieur') {
                const compressedFiles = await Promise.all(files.map(f => imageCompression(f, options)));
                const newPreviews = compressedFiles.map(f => URL.createObjectURL(f));
                setPhotoFiles(prev => ({ ...prev, photos_interieur: [...prev.photos_interieur, ...compressedFiles] }));
                setPhotoPreviews(prev => ({ ...prev, photos_interieur: [...prev.photos_interieur, ...newPreviews] }));
            } else {
                const compressedFile = await imageCompression(files[0], options);
                setPhotoFiles(prev => ({ ...prev, [photoType]: compressedFile }));
                setPhotoPreviews(prev => ({ ...prev, [photoType]: URL.createObjectURL(compressedFile) }));
                if (photoType === 'photo_situation') setIsFlagEditModalOpen(true);
            }
        } catch (error) { console.error("Erreur de compression :", error); }
    };

    const handleRemovePhoto = (photoType: 'photo_situation' | 'photo_couvercle' | 'photos_interieur', index?: number) => {
        if (photoType === 'photos_interieur' && typeof index === 'number') {
            setPhotoFiles(prev => ({ ...prev, photos_interieur: prev.photos_interieur.filter((_, i) => i !== index) }));
            setPhotoPreviews(prev => ({ ...prev, photos_interieur: prev.photos_interieur.filter((_, i) => i !== index) }));
        } else {
            setPhotoFiles(prev => ({ ...prev, [photoType]: null as any }));
            setPhotoPreviews(prev => ({ ...prev, [photoType]: null as any }));
        }
    };

    // Location / API fetching
    const fetchAddressAndCadastre = useCallback(async (lat: number, lon: number) => {
        try {
            setActiveCoords({ lat, lon });
            lastFetchedCoords.current = { lat, lon };

            if (!isOnline) {
                const pt = turf.point([lon, lat]);
                if ((offlineDb as any).parcelles) {
                    const parcelles = await (offlineDb as any).parcelles.toArray();
                    const foundParcelle = parcelles.find((p: any) => p.geom && turf.booleanPointInPolygon(pt, p.geom));
                    if (foundParcelle) { setValue('section_cadastrale', foundParcelle.section || ''); setValue('parcelle_cadastrale', foundParcelle.numero || ''); }
                }
                if ((offlineDb as any).adresses) {
                    const adresses = await (offlineDb as any).adresses.toArray();
                    let nearestAddress: any = null, minDistance = Infinity;
                    adresses.forEach((addr: any) => {
                        if (addr.geometry) {
                            const addrPoint = turf.point(addr.geometry.coordinates);
                            const distance = turf.distance(pt, addrPoint, { units: 'meters' });
                            if (distance < minDistance) { minDistance = distance; nearestAddress = addr; }
                        }
                    });
                    if (nearestAddress && minDistance < 50) {
                        setValue('commune', (nearestAddress.city || '') as any); setValue('voie_numero', (nearestAddress.house_number || '') as any); setValue('voie_nom', (nearestAddress.street || '') as any);
                    }
                }
                return;
            }

            let codeInsee = '', sectionVal = '', parcelleVal = '';
            const resAdresse = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lon}`);
            const dataAdresse = await resAdresse.json();
            if (dataAdresse.features?.length > 0) {
                const props = dataAdresse.features[0].properties;
                codeInsee = props.citycode || '';
                setValue('commune', (props.city || '') as any); setValue('voie_numero', props.housenumber || ''); setValue('voie_nom', props.street || '');
            }

            const geometry = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
            const resCadastre = await fetch(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geometry)}&_limit=1`);
            const dataCadastre = await resCadastre.json();
            if (dataCadastre.features?.length > 0) {
                const parcelleProps = dataCadastre.features[0].properties;
                sectionVal = parcelleProps.section || ''; parcelleVal = parcelleProps.numero || '';
                setValue('section_cadastrale', sectionVal); setValue('parcelle_cadastrale', parcelleVal);
            }

            if (!editId && codeInsee && sectionVal && parcelleVal) {
                const basePrefix = `${codeInsee}-${sectionVal}${parcelleVal}-BR`;
                const { count, error } = await supabase.from('recolements_boites').select('*', { count: 'exact', head: true }).ilike('id_ouvrage', `${basePrefix}%`);
                setValue('id_ouvrage', (!error && count !== null && count > 0) ? `${basePrefix}-${String(count + 1).padStart(2, '0')}` : basePrefix);
            }
        } catch (error) { console.error("❌ Erreur de récupération adresse/cadastre :", error); }
    }, [editId, isOnline, setValue]);

    const handleCaptureLocation = useCallback(() => {
        requestLocation();
        if (location.latitude != null && location.longitude != null) fetchAddressAndCadastre(location.latitude, location.longitude);
    }, [location.latitude, location.longitude, requestLocation, fetchAddressAndCadastre]);

    useEffect(() => {
        if (!editId && location.latitude != null && location.longitude != null) {
            if (!lastFetchedCoords.current || lastFetchedCoords.current.lat !== location.latitude || lastFetchedCoords.current.lon !== location.longitude) {
                lastFetchedCoords.current = { lat: location.latitude, lon: location.longitude };
                fetchAddressAndCadastre(location.latitude, location.longitude);
            }
        }
    }, [location.latitude, location.longitude, editId, fetchAddressAndCadastre]);

    // Repères logic
    const handleAddRepere = () => {
        if (!currentRepere.point || !currentRepere.description) return alert("Renseignez le point et la description.");
        const numericDistance = Number(currentRepere.distance);
        if (currentRepere.distance === '' || isNaN(numericDistance) || numericDistance < 0) return alert("Distance valide (cm) requise.");
        if (reperesList.some(r => r.point.trim().toLowerCase() === currentRepere.point.trim().toLowerCase())) return alert(`Le repère "${currentRepere.point}" existe déjà.`);
        
        const updatedList = [...reperesList, { ...currentRepere, distance: numericDistance }];
        setReperesList(updatedList); setValue('reperes', updatedList); setIsRepereModalOpen(false);
    };

    const handleRemoveRepere = (index: number) => {
        const updatedList = reperesList.filter((_, i) => i !== index);
        setReperesList(updatedList); setValue('reperes', updatedList);
    };

    // Resets & Edits
const resetSaisie = useCallback(() => {
        setEditId(null);
        setIsViewMode(false);
        reset({
            id_ouvrage: '', technicien: getValues('technicien'), date_recolement: new Date().toISOString().split('T')[0], non_trouvee: false,
            commune: '', voie_numero: '', voie_nom: '', section_cadastrale: '', parcelle_cadastrale: '', domaine_assise: '', accessibilite_site: '',
            observations_localisation: '', type_couvercle: '', etat_couvercle: '', forme: '', dimensions: '', affleurement: '', materiau: '',
            etat_cadre: '', materiau_conduit: '', profondeur_cm: undefined, ecoulement: '', etat_parois: '', depots: '', eaux_parasites: '',
            observations_physiques: '', actions_preconisees: [], action_precision: '', reperes: []
        });
        setReperesList([]); setActiveCoords(null); setShowSituationFlag(true); setSituationFlagPos({ x: 50, y: 50 }); setFlagSize(40);
        setPhotoPreviews({ photo_situation: null, photo_couvercle: null, photos_interieur: [] }); setPhotoFiles({ photo_situation: null, photo_couvercle: null, photos_interieur: [] });
        lastFetchedCoords.current = null;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [getValues, reset]);

const handleEditRecord = useCallback((record: any, mode: 'edit' | 'view' = 'edit') => {
        setEditId(record.id || record.id_ouvrage);
        setIsViewMode(mode === 'view');
        
        // 🛠️ On formate la date pour s'assurer qu'elle est au format YYYY-MM-DD accepté par l'input date
        const formattedRecord = {
            ...record,
            date_recolement: record.date_recolement ? record.date_recolement.split('T')[0] : '',
        };
        
        reset(formattedRecord);
        
        setReperesList(record.reperes || []);
        if (record.show_situation_flag !== undefined && record.show_situation_flag !== null) setShowSituationFlag(record.show_situation_flag);
        if (record.flag_x !== undefined && record.flag_y !== undefined && record.flag_x !== null && record.flag_y !== null) setSituationFlagPos({ x: record.flag_x, y: record.flag_y });
        if (record.flag_size !== undefined && record.flag_size !== null) setFlagSize(record.flag_size);
        if (record.latitude && record.longitude) setActiveCoords({ lat: record.latitude, lon: record.longitude });
        else setActiveCoords(null);
        setPhotoPreviews({
            photo_situation: record.photo_situation_url || null,
            photo_couvercle: record.photo_couvercle_url || null,
            photos_interieur: record.photos_interieur_urls || (record.photo_interieur_url ? [record.photo_interieur_url] : []),
        });
        setPhotoFiles({ photo_situation: null, photo_couvercle: null, photos_interieur: [] });
        setActiveTab('saisie');
    }, [reset, setActiveTab]);

    // Submit Logic
    const onSubmit = async (data: RecoletBoite) => {
        setIsSubmitting(true);
        Object.keys(data).forEach((key) => { if ((data as any)[key] === "") (data as any)[key] = null; });
        (data as any).show_situation_flag = showSituationFlag;
        (data as any).flag_x = showSituationFlag ? Number(situationFlagPos.x.toFixed(2)) : null;
        (data as any).flag_y = showSituationFlag ? Number(situationFlagPos.y.toFixed(2)) : null;
        (data as any).flag_size = showSituationFlag ? flagSize : null;
        data.reperes = reperesList;
        
        if (activeCoords) {
            data.latitude = activeCoords.lat; data.longitude = activeCoords.lon;
            if (location.accuracy) data.precision_gps = location.accuracy;
        }

        if (isOnline) {
            try {
                if (photoFiles.photo_situation) { const url = await uploadToCloudinary(photoFiles.photo_situation); data.photo_situation_url = url as any; }
                else if (!photoPreviews.photo_situation) { data.photo_situation_url = null as any; }
                if (photoFiles.photo_couvercle) { const url = await uploadToCloudinary(photoFiles.photo_couvercle); data.photo_couvercle_url = url as any; }
                else if (!photoPreviews.photo_couvercle) { data.photo_couvercle_url = null as any; }
                if (photoFiles.photos_interieur?.length > 0) {
                    const urls = await Promise.all(photoFiles.photos_interieur.map(f => uploadToCloudinary(f)));
                    const validUrls = urls.filter((u): u is string => u !== null);
                    data.photos_interieur_urls = validUrls as any;
                    if (validUrls.length > 0) data.photo_interieur_url = validUrls[0] as any;
                } else if (photoPreviews.photos_interieur.length === 0) { data.photos_interieur_urls = [] as any; }
            } catch (err) { console.error("Erreur d'upload :", err); }

            const payload = { ...data } as any;
            delete payload.id; delete payload.created_at; delete payload.photo_situation; delete payload.photo_couvercle; delete payload.photo_interieur;

            let error;
            if (editId) {
                const searchColumn = (typeof editId === 'number' || /^[0-9a-fA-F-]{36}$/.test(String(editId)) || /^\d+$/.test(String(editId))) ? 'id' : 'id_ouvrage';
                const res = await supabase.from('recolements_boites').update(payload).eq(searchColumn, editId).select();
                error = res.error;
                if (!error && (!res.data || res.data.length === 0)) { alert(`⚠️ Échec de la modification : ouvrage introuvable.`); setIsSubmitting(false); return; }
            } else {
                const res = await supabase.from('recolements_boites').insert([payload]);
                error = res.error;
            }

            setIsSubmitting(false);
            if (error) alert(`Erreur Supabase : ${error.message}`);
            else { alert(`✅ Relevé ${editId ? 'modifié' : 'enregistré'} avec succès !`); resetSaisie(); }
        } else {
            setIsSubmitting(false);
            if (editId) return alert("⚠️ Modification impossible hors-ligne.");
            try {
                await offlineDb.pendingSync.add({
                    data,
                    localPhotos: {
                        situation: photoFiles.photo_situation || undefined,
                        couvercle: photoFiles.photo_couvercle || undefined,
                        photos_interieur: photoFiles.photos_interieur.length > 0 ? photoFiles.photos_interieur : undefined,
                    },
                    createdAt: new Date().toISOString(),
                });
                alert('📦 Relevé et photos sauvegardés localement sur la tablette !');
                refreshPendingCount(); resetSaisie();
            } catch (err: any) { alert(`Erreur de stockage local : ${err.message}`); }
        }
    };

    const getNextRepereName = () => { let n = 1; while (reperesList.some(r => r.point === `REP ${n}`)) n++; return `REP ${n}`; };
    const handleOpenModal = () => { setCurrentRepere({ point: getNextRepereName(), description: '', distance: '', observations: '' }); setIsRepereModalOpen(true); };

    return {
        rhf, formValues, nonTrouvee, formeSelectionnee, editId, isSubmitting, activeCoords, reperesList, currentRepere, setCurrentRepere,
        isRepereModalOpen, setIsRepereModalOpen, showSituationFlag, setShowSituationFlag, situationFlagPos, setSituationFlagPos,
        flagSize, setFlagSize, isDraggingFlag, isFlagEditModalOpen, setIsFlagEditModalOpen, situationImageRef, enlargedPhotoUrl, setEnlargedPhotoUrl,
        photoPreviews, listeningField, existingDimensions, getFieldBg, toggleDictation, handlePointerDown, handlePointerMove, handlePointerUp,
        handlePhotoCapture, handleRemovePhoto, fetchAddressAndCadastre, handleCaptureLocation, handleAddRepere, handleRemoveRepere,
resetSaisie, handleEditRecord, handleOpenModal,onSubmit, location, isViewMode, setIsViewMode
    };
}