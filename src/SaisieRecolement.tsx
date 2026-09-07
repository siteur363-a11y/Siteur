import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import imageCompression from 'browser-image-compression';
import * as turf from '@turf/turf';
import { MapContainer, TileLayer, Marker, Popup, WMSTileLayer, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { supabase } from './lib/supabase';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useGeolocation } from './hooks/useGeolocation';
import type { RecoletBoite } from './types/database';
import { offlineDb } from './db/offlineDb';
import { exportRecolementToExcel } from './services/exportExcelService';
import { uploadToCloudinary, deleteFromCloudinary } from './services/cloudinaryService';

import './components/map/LeafletSetup';
import { MapRecenter, MapClickHandler, ZoomIndicator, OfflineMapManager } from './components/map/MapComponents';
import { Toast } from './components/Toast';
import { RepereModal } from './components/modals/RepereModal';
import { FlagEditModal } from './components/modals/FlagEditModal';
import { ExportInlineModal } from './components/modals/ExportInlineModal';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { HistoriqueTab } from './components/HistoriqueTab';

export default function SaisieRecolement() {
    // --- ÉTATS GLOBAUX & REQUIS ---
    const isOnline = useOnlineStatus();
    const { location, requestLocation } = useGeolocation();

    // --- ÉTATS UI: TOAST & MODAL SUPPRESSION ---
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [recordToDelete, setRecordToDelete] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 5000);
    }, []);

    // --- ÉTATS UI: DRAPEAU INTERACTIF ---
    const [showSituationFlag, setShowSituationFlag] = useState<boolean>(true);
    const [situationFlagPos, setSituationFlagPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
    const [flagSize, setFlagSize] = useState<number>(40);
    const [isDraggingFlag, setIsDraggingFlag] = useState<boolean>(false);
    const situationImageRef = useRef<HTMLDivElement>(null);
    const [isFlagEditModalOpen, setIsFlagEditModalOpen] = useState<boolean>(false);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        setIsDraggingFlag(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingFlag || !situationImageRef.current) return;
        const rect = situationImageRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        setSituationFlagPos({ x, y });
    }, [isDraggingFlag]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (isDraggingFlag) {
            setIsDraggingFlag(false);
            try {
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            } catch (err) { console.warn("Erreur releasePointerCapture", err); }
        }
    }, [isDraggingFlag]);

    // --- ÉTATS DE L'HISTORIQUE & FILTRES ---
    const [filterDate, setFilterDate] = useState<string>('');
    const [filterCommune, setFilterCommune] = useState<string>('');
    const [filterNumero, setFilterNumero] = useState<string>('');
    const [filterRue, setFilterRue] = useState<string>('');
    const [filterNonTrouvee, setFilterNonTrouvee] = useState<string>('');

    const [activeTab, setActiveTab] = useState<'saisie' | 'historique'>('saisie');
    const [historique, setHistorique] = useState<any[]>([]);
    const [isLoadingHist, setIsLoadingHist] = useState(false);
    const [editId, setEditId] = useState<string | number | null>(null);
    const [exportingId, setExportingId] = useState<string | number | null>(null);
    const [pendingCount, setPendingCount] = useState<number>(0);

    // --- ÉTATS EXPORT IN-LINE ---
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
        photos_interieur: string[];
    }>({ situation: null, couvercle: null, photos_interieur: [] });

    // --- ÉTATS FORMULAIRE & REPÈRES ---
    const [isRepereModalOpen, setIsRepereModalOpen] = useState(false);
    const [reperesList, setReperesList] = useState<any[]>([]);
    const [currentRepere, setCurrentRepere] = useState({
        point: '', description: '', distance: '', observations: ''
    });

    const [activeCoords, setActiveCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [listeningField, setListeningField] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

    const [photoFiles, setPhotoFiles] = useState<{
        photo_situation: File | null;
        photo_couvercle: File | null;
        photos_interieur: File[];
    }>({ photo_situation: null, photo_couvercle: null, photos_interieur: [] });

    const [photoPreviews, setPhotoPreviews] = useState<{
        photo_situation: string | null;
        photo_couvercle: string | null;
        photos_interieur: string[];
    }>({ photo_situation: null, photo_couvercle: null, photos_interieur: [] });

    const [isSubmitting, setIsSubmitting] = useState(false);

    // Initialisation React Hook Form
    const { register, handleSubmit, formState: { errors }, watch, setValue, getValues, reset } = useForm<RecoletBoite>({
        defaultValues: {
            technicien: 'S.GUEDES',
            date_recolement: new Date().toISOString().split('T')[0],
            non_trouvee: false,
            reperes: [],
            actions_preconisees: [], // Ajouté
            action_precision: '',     // Ajouté
            materiau_conduit: '',     // Ajouté 
            etat_cadre: ''            // Ajouté
        }
    });

    const nonTrouvee = watch('non_trouvee');
    const formeSelectionnee = watch('forme');
    const lastFetchedCoords = useRef<{ lat: number; lon: number } | null>(null);
    const formValues = watch();

    // --- SURVEILLANCE DES CHAMPS POUR L'AUTOMATISATION DES ACTIONS ---
    const etatCouvercle = watch('etat_couvercle');
    const etatCadre = watch('etat_cadre');
    const affleurement = watch('affleurement');
    const accessibiliteSite = watch('accessibilite_site');
    const ecoulement = watch('ecoulement');
    const etatParois = watch('etat_parois');
    const depots = watch('depots');
    const eauxParasites = watch('eaux_parasites');

    useEffect(() => {
        const actions: string[] = [];

        // 1. Contrôles Tampon, Cadre & Arase
        if (etatCouvercle === 'Cassé à remplacer' || etatCouvercle === 'Manquant' || etatCouvercle === 'Fissuré / Ébréché') {
            actions.push("Remplacement du tampon");
        } else if (etatCouvercle === 'Verrouillé / Grippé') {
            actions.push("Dégrippage / Déblocage");
        }

        if (etatCadre === 'Cassé' || etatCadre === 'Dégradé' || etatCadre === 'Fissuré / Ébréché') {
            actions.push("Réparation du cadre");
        }

        if (affleurement && affleurement !== 'Affleurant au sol (RAS)') {
            actions.push("Remise à niveau de l'arase");
        }

        // 2. Contrôle Accessibilité
        if (accessibiliteSite === 'Visibilité masquée (végétation/terre)' || accessibiliteSite === 'Enfouie sous enrobé') {
            actions.push("Dégagement d'accès");
        }

        // 3. Contrôles Réseau & Conduits
        if (ecoulement === 'Engorgement / Obstrué') {
            actions.push("Curage / Nettoyage");
            actions.push("Débouchage / Dégorgement");
        } else if (ecoulement === 'Refoulement constaté') {
            actions.push("Débouchage / Dégorgement");
        }

        if (depots && depots !== 'Aucun dépôt') {
            if (!actions.includes("Curage / Nettoyage")) {
                actions.push("Curage / Nettoyage");
            }
        }

        // 4. Contrôle des parois / raccordements
        if (etatParois === 'Déboîtement' || etatParois === 'Fracture') {
            actions.push("Reprise de raccordement");
        } else if (etatParois === 'Corrosion') {
            actions.push("Traitement anti-corrosion / Réfection");
        } else if (etatParois === 'Racines') {
            if (!actions.includes("Curage / Nettoyage")) {
                actions.push("Curage / Nettoyage");
            }
        } else if (etatParois === 'Fissures') {
            actions.push("Traitement des infiltrations");
        }

        // Contrôle des eaux parasites
        if (eauxParasites && eauxParasites !== 'Aucune infiltration') {
            if (!actions.includes("Traitement des infiltrations")) {
                actions.push("Traitement des infiltrations");
            }
        }

        // 5. Gestion stricte du R.A.S.
        const hasAnomaly = actions.length > 0;

        if (!hasAnomaly) {
            actions.push("R.A.S.");
        }

        setValue('actions_preconisees', actions);
    }, [etatCouvercle, etatCadre, affleurement, accessibiliteSite, ecoulement, etatParois, depots, eauxParasites, setValue]);

    // ==========================================
    // EFFETS & FETCH DATA
    // ==========================================

    const refreshPendingCount = useCallback(async () => {
        try {
            const count = await offlineDb.pendingSync.count();
            setPendingCount(count);
        } catch (err) {
            console.error("Erreur lecture fiches hors-ligne :", err);
        }
    }, []);

    useEffect(() => {
        refreshPendingCount();
        const interval = setInterval(refreshPendingCount, 4000);
        return () => clearInterval(interval);
    }, [refreshPendingCount]);

    const fetchHistorique = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        if (activeTab === 'historique' && isOnline) {
            fetchHistorique();
        }
    }, [activeTab, isOnline, fetchHistorique]);

    // Formatage dynamique des dimensions en fonction de la forme
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

    // ==========================================
    // GESTIONNAIRES D'ÉVÉNEMENTS (HANDLERS)
    // ==========================================

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

        const situationUrl = pendingItem.localPhotos?.situation ? URL.createObjectURL(pendingItem.localPhotos.situation) : formData.photo_situation_url || null;
        const couvercleUrl = pendingItem.localPhotos?.couvercle ? URL.createObjectURL(pendingItem.localPhotos.couvercle) : formData.photo_couvercle_url || null;
        const interieurUrls = pendingItem.localPhotos?.photos_interieur ? pendingItem.localPhotos.photos_interieur.map((f: File) => URL.createObjectURL(f)) : formData.photos_interieur_urls || (formData.photo_interieur_url ? [formData.photo_interieur_url] : []);

        setExportPhotoPreviews({ situation: situationUrl, couvercle: couvercleUrl, photos_interieur: interieurUrls });
        enrichPendingItem(pendingItem);
    };

    const enrichPendingItem = async (pendingItem: any) => {
        const data = pendingItem.data;
        const lat = data.latitude;
        const lon = data.longitude;

        setEnriching(true);
        setSuggestions({});

        let suggestedCommune = '', suggestedNumero = '', suggestedVoie = '', codeInsee = '', suggestedSection = '', suggestedParcelle = '', suggestedIdOuvrage = '';

        if (lat && lon && isOnline) {
            try {
                const resAdresse = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lon}`);
                if (resAdresse.ok) {
                    const dataAdresse = await resAdresse.json();
                    if (dataAdresse.features?.length > 0) {
                        const props = dataAdresse.features[0].properties;
                        suggestedCommune = props.city || '';
                        suggestedNumero = props.housenumber || '';
                        suggestedVoie = props.street || '';
                        codeInsee = props.citycode || '';
                    }
                }

                const geometry = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
                const resCadastre = await fetch(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geometry)}&_limit=1`);
                if (resCadastre.ok) {
                    const dataCadastre = await resCadastre.json();
                    if (dataCadastre.features?.length > 0) {
                        const props = dataCadastre.features[0].properties;
                        suggestedSection = props.section || '';
                        suggestedParcelle = props.numero || '';
                    }
                }

                if (codeInsee && suggestedSection && suggestedParcelle) {
                    const basePrefix = `${codeInsee}-${suggestedSection}${suggestedParcelle}-BR`;
                    const { count, error } = await supabase.from('recolements_boites').select('*', { count: 'exact', head: true }).ilike('id_ouvrage', `${basePrefix}%`);

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

        setSuggestions({ commune: suggestedCommune, voie_numero: suggestedNumero, voie_nom: suggestedVoie, section_cadastrale: suggestedSection, parcelle_cadastrale: suggestedParcelle, id_ouvrage: suggestedIdOuvrage });

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

            if (currentPendingItem.localPhotos?.situation) {
                const url = await uploadToCloudinary(currentPendingItem.localPhotos.situation);
                if (url) finalData.photo_situation_url = url;
            }
            if (currentPendingItem.localPhotos?.couvercle) {
                const url = await uploadToCloudinary(currentPendingItem.localPhotos.couvercle);
                if (url) finalData.photo_couvercle_url = url;
            }
            if (currentPendingItem.localPhotos?.photos_interieur?.length > 0) {
                const urls = await Promise.all(currentPendingItem.localPhotos.photos_interieur.map((f: File) => uploadToCloudinary(f)));
                const validUrls = urls.filter((u): u is string => u !== null);
                finalData.photos_interieur_urls = validUrls;
                if (validUrls.length > 0) finalData.photo_interieur_url = validUrls[0];
            }

            const payload = { ...finalData } as any;
            delete payload.id;
            delete payload.created_at;
            delete payload.photo_situation;
            delete payload.photo_couvercle;
            delete payload.photo_interieur;

            Object.keys(payload).forEach((key) => { if (payload[key] === "") payload[key] = null; });

            const { error } = await supabase.from('recolements_boites').insert([payload]);
            if (error) throw error;

            if (currentPendingItem.id) await offlineDb.pendingSync.delete(currentPendingItem.id);

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

    const handleEditRecord = useCallback((record: any) => {
        setEditId(record.id || record.id_ouvrage);
        reset(record);
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
    }, [reset]);

    const resetSaisie = useCallback(() => {
        setEditId(null);
        const currentTech = getValues('technicien');
        reset({
            technicien: currentTech,
            date_recolement: new Date().toISOString().split('T')[0],
            non_trouvee: false,
            reperes: [],
            actions_preconisees: [], // Ajouté
            action_precision: '',     // Ajouté
            materiau_conduit: '',     // Ajouté
            etat_cadre: ''            // Ajouté
        });
        setReperesList([]);
        setActiveCoords(null);
        setShowSituationFlag(true);
        setSituationFlagPos({ x: 50, y: 50 });
        setFlagSize(40);
        setPhotoPreviews({ photo_situation: null, photo_couvercle: null, photos_interieur: [] });
        setPhotoFiles({ photo_situation: null, photo_couvercle: null, photos_interieur: [] });
    }, [getValues, reset]);

    const executeDelete = async (record: any) => {
        if (!isOnline) {
            showToast("La suppression d'une fiche distante nécessite une connexion internet.", 'error');
            setRecordToDelete(null);
            return;
        }

        setIsDeleting(true);
        try {
            const searchColumn = (typeof record.id === 'number' || (typeof record.id === 'string' && /^[0-9a-fA-F-]{36}$/.test(record.id))) ? 'id' : 'id_ouvrage';
            const idValue = record[searchColumn];

            // 1. Suppression Supabase
            const { error } = await supabase.from('recolements_boites').delete().eq(searchColumn, idValue);
            if (error) throw new Error(`Erreur Supabase: ${error.message}`);

            // 2. Nettoyage des photos sur Cloudinary
            const urlsToDelete = [
                record.photo_situation_url,
                record.photo_couvercle_url,
                ...(record.photos_interieur_urls || []),
                record.photo_interieur_url
            ].filter(Boolean);

            const uniqueUrls = Array.from(new Set(urlsToDelete));

            let cloudinaryFailures = 0;
            for (const url of uniqueUrls) {
                const success = await deleteFromCloudinary(url);
                if (success === false) cloudinaryFailures++;
            }

            // 3. Mise à jour de l'UI
            setHistorique(prev => prev.filter(r => r[searchColumn] !== idValue));
            setRecordToDelete(null);

            if (cloudinaryFailures > 0) {
                showToast(`Fiche supprimée, mais ${cloudinaryFailures} photo(s) n'ont pas pu être effacées de Cloudinary.`, 'info');
            } else {
                showToast('Fiche et photos supprimées avec succès.', 'success');
            }
        } catch (err: any) {
            showToast(`Échec de la suppression : ${err.message}`, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const getFieldBg = useCallback((fieldName: keyof RecoletBoite) => {
        const val = formValues[fieldName];
        const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0);
        return isEmpty ? "bg-amber-50/80 border-amber-200" : "bg-white border-gray-300";
    }, [formValues]);

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
                const previewUrl = URL.createObjectURL(compressedFile);
                setPhotoFiles(prev => ({ ...prev, [photoType]: compressedFile }));
                setPhotoPreviews(prev => ({ ...prev, [photoType]: previewUrl }));

                if (photoType === 'photo_situation') setIsFlagEditModalOpen(true);
            }
        } catch (error) {
            console.error("Erreur de compression :", error);
        }
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

        // 1. Contrôle de la bonne saisie de la distance en numérique (en cm)
        const numericDistance = Number(currentRepere.distance);
        if (currentRepere.distance === '' || isNaN(numericDistance) || numericDistance < 0) {
            alert("Veuillez saisir une distance valide en centimètres (valeur numérique positive).");
            return;
        }

        const nameExists = reperesList.some(r => r.point.trim().toLowerCase() === currentRepere.point.trim().toLowerCase());
        if (nameExists) {
            alert(`Le nom de repère "${currentRepere.point}" existe déjà. Veuillez utiliser un nom unique.`);
            return;
        }

        // 2. Enregistrement avec la distance convertie en nombre (garantit l'intégrité pour Supabase)
        const updatedList = [...reperesList, { ...currentRepere, distance: numericDistance }];
        setReperesList(updatedList);
        setValue('reperes', updatedList);
        setIsRepereModalOpen(false);
    };
    const handleRemoveRepere = (index: number) => {
        const updatedList = reperesList.filter((_, i) => i !== index);
        setReperesList(updatedList);
        setValue('reperes', updatedList);
    };

const initialTextRef = useRef<string>("");

const toggleDictation = useCallback((field: string, isModal: boolean = false) => {
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
    // 1. ✅ Désactivation des résultats intermédiaires pour éviter les doublons IME sur mobile
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    // 2. ✅ Capture de la valeur initiale du champ au déclenchement de l'écoute
    const baseText = isModal
        ? (currentRepere[field as keyof typeof currentRepere] || "")
        : (getValues(field as keyof RecoletBoite) || "");
    initialTextRef.current = String(baseText);

    recognition.onstart = () => {
        setListeningField(trackingKey);
    };

    recognition.onresult = (event: any) => {
        let addedTranscript = "";

        // 3. ✅ Utilisation de event.resultIndex (propriété native API, ignore les faux départs)
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                addedTranscript += " " + event.results[i][0].transcript;
            }
        }

        if (addedTranscript.trim()) {
            // 4. ✅ Mise à jour sur la base de la référence stable sans relire le state/form
            initialTextRef.current = (initialTextRef.current + " " + addedTranscript.trim()).trim();
            const nextValue = initialTextRef.current;

            if (isModal) {
                setCurrentRepere(prev => ({
                    ...prev,
                    [field]: nextValue
                }));
            } else {
                setValue(field as keyof RecoletBoite, nextValue as any);
            }
        }
    };

    recognition.onerror = () => { setListeningField(null); recognitionRef.current = null; };
    recognition.onend = () => { setListeningField(null); recognitionRef.current = null; };
    recognition.start();
}, [listeningField, getValues, setValue]);

    const fetchAddressAndCadastre = useCallback(async (lat: number, lon: number) => {
        try {
            setActiveCoords({ lat, lon });

            if (!isOnline) {
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
                    let nearestAddress: any = null, minDistance = Infinity;
                    adresses.forEach((addr: any) => {
                        if (addr.geometry) {
                            const addrPoint = turf.point(addr.geometry.coordinates);
                            const distance = turf.distance(pt, addrPoint, { units: 'meters' });
                            if (distance < minDistance) { minDistance = distance; nearestAddress = addr; }
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

            if (dataAdresse.features?.length > 0) {
                const props = dataAdresse.features[0].properties;
                codeInsee = props.citycode || '';
                setValue('commune', (props.city || '') as any);
                setValue('voie_numero', props.housenumber || '');
                setValue('voie_nom', props.street || '');
            }

            const geometry = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
            const resCadastre = await fetch(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geometry)}&_limit=1`);
            const dataCadastre = await resCadastre.json();

            if (dataCadastre.features?.length > 0) {
                const parcelleProps = dataCadastre.features[0].properties;
                sectionVal = parcelleProps.section || '';
                parcelleVal = parcelleProps.numero || '';
                setValue('section_cadastrale', sectionVal);
                setValue('parcelle_cadastrale', parcelleVal);
            }

            if (!editId && codeInsee && sectionVal && parcelleVal) {
                const basePrefix = `${codeInsee}-${sectionVal}${parcelleVal}-BR`;
                const { count, error } = await supabase.from('recolements_boites').select('*', { count: 'exact', head: true }).ilike('id_ouvrage', `${basePrefix}%`);
                let finalIdOuvrage = basePrefix;
                if (!error && count !== null && count > 0) finalIdOuvrage = `${basePrefix}-${String(count + 1).padStart(2, '0')}`;
                setValue('id_ouvrage', finalIdOuvrage);
            }
        } catch (error) {
            console.error("❌ Erreur de récupération adresse/cadastre :", error);
        }
    }, [editId, isOnline, setValue]);

    useEffect(() => {
        if (!editId && location.latitude != null && location.longitude != null) {
            if (!lastFetchedCoords.current || lastFetchedCoords.current.lat !== location.latitude || lastFetchedCoords.current.lon !== location.longitude) {
                lastFetchedCoords.current = { lat: location.latitude, lon: location.longitude };
                fetchAddressAndCadastre(location.latitude, location.longitude);
            }
        }
    }, [location.latitude, location.longitude, editId, fetchAddressAndCadastre]);

    // ==========================================
    // SOUMISSION DU FORMULAIRE
    // ==========================================

    const onSubmit = async (data: RecoletBoite) => {
        setIsSubmitting(true);
        Object.keys(data).forEach((key) => { if ((data as any)[key] === "") (data as any)[key] = null; });

        (data as any).show_situation_flag = showSituationFlag;
        (data as any).flag_x = showSituationFlag ? Number(situationFlagPos.x.toFixed(2)) : null;
        (data as any).flag_y = showSituationFlag ? Number(situationFlagPos.y.toFixed(2)) : null;
        (data as any).flag_size = showSituationFlag ? flagSize : null;

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

                if (photoFiles.photos_interieur?.length > 0) {
                    const urls = await Promise.all(photoFiles.photos_interieur.map(f => uploadToCloudinary(f)));
                    const validUrls = urls.filter((u): u is string => u !== null);
                    data.photos_interieur_urls = validUrls as any;
                    if (validUrls.length > 0) data.photo_interieur_url = validUrls[0] as any;
                } else if (photoPreviews.photos_interieur.length === 0) {
                    data.photos_interieur_urls = [] as any;
                    data.photo_interieur_url = null as any;
                }
            } catch (err) { console.error("Erreur d'upload :", err); }
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
                const isTechnicalId = typeof editId === 'number' || (typeof editId === 'string' && /^\d+$/.test(editId)) || (typeof editId === 'string' && /^[0-9a-fA-F-]{36}$/.test(editId));
                const searchColumn = isTechnicalId ? 'id' : 'id_ouvrage';
                const res = await supabase.from('recolements_boites').update(payload).eq(searchColumn, editId).select();
                error = res.error;

                if (!error && (!res.data || res.data.length === 0)) {
                    alert(`⚠️ Échec de la modification : l'ouvrage n'a pas été trouvé.`);
                    setIsSubmitting(false);
                    return;
                }
            } else {
                const res = await supabase.from('recolements_boites').insert([payload]);
                error = res.error;
            }

            setIsSubmitting(false);
            if (error) alert(`Erreur Supabase (${error.code}) : ${error.message}`);
            else { alert(`✅ Relevé ${editId ? 'modifié' : 'enregistré'} avec succès !`); resetSaisie(); }
        } else {
            setIsSubmitting(false);
            if (editId) { alert("⚠️ La modification d'un relevé existant n'est possible qu'en étant connecté à Internet."); return; }
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
                refreshPendingCount();
                resetSaisie();
            } catch (err: any) { alert(`Erreur de stockage local : ${err.message}`); }
        }
    };

    const handleExportExcel = async (record: RecoletBoite) => {
        try {
            setExportingId(record.id || record.id_ouvrage || null);
            await exportRecolementToExcel(record);
        } catch (error: any) { alert(`Erreur lors de l'exportation : ${error.message}`); }
        finally { setExportingId(null); }
    };

    return (
        <div className="max-w-2xl mx-auto p-4 pb-24 bg-gray-50 min-h-screen">

            {/* NOTIFICATION TOAST */}
            <Toast toast={toast} onClose={() => setToast(null)} />

            {/* BARRE D'ÉTAT + BOUTON EXPORT IN-LINE */}
            <div className={`p-3 mb-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2 shadow-sm ${isOnline ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                    <span>{isOnline ? '🟢 Connecté (Cloud)' : '🔴 Mode Hors Ligne'}</span>
                    {pendingCount > 0 && <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-mono">{pendingCount} fiche(s) locale(s)</span>}
                </div>
                <button type="button" onClick={handleOpenExportModal} disabled={!isOnline || pendingCount === 0} className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-bold shadow flex items-center justify-center gap-2 transition-all ${isOnline && pendingCount > 0 ? 'bg-amber-400 text-amber-950 hover:bg-amber-300 animate-pulse cursor-pointer' : 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60'}`}>
                    🚀 Export In-Line {pendingCount > 0 ? `(${pendingCount})` : ''}
                </button>
            </div>

            <h1 className="text-2xl font-bold mb-4 text-gray-800">Fiche de Récolement</h1>

            <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1 mb-6">
                <button type="button" onClick={() => { setActiveTab('saisie'); if (!editId) resetSaisie(); }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'saisie' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {editId ? '✏️ Mode Modification' : '📝 Nouvelle Saisie'}
                </button>
                <button type="button" onClick={() => { setActiveTab('historique'); resetSaisie(); }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'historique' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    🗂️ Historique & Modif
                </button>
            </div>

            {/* ONGLET HISTORIQUE */}
            {activeTab === 'historique' && (
                <HistoriqueTab
                    isOnline={isOnline}
                    historique={historique}
                    isLoadingHist={isLoadingHist}
                    filterDate={filterDate}
                    setFilterDate={setFilterDate}
                    filterCommune={filterCommune}
                    setFilterCommune={setFilterCommune}
                    filterNumero={filterNumero}
                    setFilterNumero={setFilterNumero}
                    filterRue={filterRue}
                    setFilterRue={setFilterRue}
                    filterNonTrouvee={filterNonTrouvee}
                    setFilterNonTrouvee={setFilterNonTrouvee}
                    exportingId={exportingId}
                    handleExportExcel={handleExportExcel}
                    handleEditRecord={handleEditRecord}
                    setRecordToDelete={setRecordToDelete}
                />
            )}

            {/* ONGLET SAISIE */}
            {activeTab === 'saisie' && (
                <form
                    onSubmit={handleSubmit(onSubmit, (formErrors) => {
                        console.error("❌ Erreurs de validation :", formErrors);
                        if (!isOnline) alert("Formulaire incomplet : Le champ Technicien et la Date sont obligatoires même hors-ligne.");
                        else alert("Formulaire incomplet : vérifiez les champs obligatoires (ID Ouvrage, Technicien, Commune, Date).");
                    })}
                    className="space-y-8"
                >
                    {editId && (
                        <div className="bg-amber-100 border border-amber-300 text-amber-800 p-3 rounded-xl flex justify-between items-center shadow-sm">
                            <div className="font-medium">✏️ Vous modifiez l'ouvrage : <span className="font-bold">{getValues('id_ouvrage')}</span></div>
                            <button type="button" onClick={resetSaisie} className="text-amber-800 text-sm font-bold bg-amber-200 px-3 py-1 rounded hover:bg-amber-300">Annuler</button>
                        </div>
                    )}

                    <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">Informations Générales</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    ID Ouvrage {isOnline ? '*' : <span className="text-xs text-blue-600 font-normal italic">(Calculé à l'export)</span>}
                                </label>
                                <input {...register("id_ouvrage", { required: isOnline ? "Ce champ est obligatoire en ligne" : false })} className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('id_ouvrage')}`} placeholder={isOnline ? "Ex: 27638-AA0142-BR-01" : "Sera déduit avec le GPS"} />
                                {errors.id_ouvrage && <span className="text-red-500 text-sm mt-1">{errors.id_ouvrage.message}</span>}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Technicien *</label>
                                    <input {...register("technicien", { required: "Ce champ est obligatoire" })} className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('technicien')}`} />
                                    {errors.technicien && <span className="text-red-500 text-sm mt-1">{errors.technicien.message}</span>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de récolement *</label>
                                    <input type="date" {...register("date_recolement", { required: "Date requise" })} className={`w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('date_recolement')}`} />
                                </div>
                            </div>
                            <div className="flex items-center space-x-3 pt-2">
                                <input type="checkbox" id="non_trouvee" {...register("non_trouvee")} className="w-5 h-5 text-blue-600 rounded border-gray-300" />
                                <label htmlFor="non_trouvee" className="text-sm font-medium text-gray-800">Ouvrage non trouvé / Inaccessible</label>
                            </div>
                        </div>
                    </section>

                    <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">1 - Identification de l'ouvrage et localisation</h2>
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-4">
                                <div className="flex justify-between items-center">
                                    <div><span className="font-medium text-gray-800">Positionnement cartographique</span></div>
                                    <button type="button" onClick={requestLocation} disabled={location.loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium shadow-sm active:bg-blue-700">
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
                                <input {...register("commune", { required: isOnline ? "Commune requise en ligne" : false })} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('commune')}`} placeholder={!isOnline ? "Laissée vide = auto-complétion" : ""} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">N° voie {!isOnline && '*'}</label>
                                    <input {...register("voie_numero", { required: !isOnline ? "Obligatoire hors-ligne" : false })} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('voie_numero')}`} placeholder={!isOnline ? "Ex: 12 bis" : ""} />
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
                                    <span className="block text-sm font-bold text-gray-800">Repères fixes du terrain & Distances ({reperesList.length})</span>
                                    <button type="button" onClick={handleOpenModal} className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-green-700 transition-colors">+ Ajouter un repère</button>
                                </div>
                                {reperesList.length > 0 && (
                                    <div className="space-y-2">
                                        {reperesList.map((rep, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                                <div><span className="font-bold text-blue-800">{rep.point}</span> : {rep.description} — {rep.distance} cm</div>
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
                                    <div className="space-y-2">
                                        <div onClick={() => setIsFlagEditModalOpen(true)} className="relative inline-block bg-gray-100 p-1 rounded-lg border shadow-sm cursor-pointer hover:ring-4 hover:ring-blue-300 transition-all overflow-hidden">
                                            <img src={photoPreviews.photo_situation} alt="Situation" className="h-48 w-48 object-cover rounded block" />
                                            {showSituationFlag && (
                                                <div style={{ left: `${situationFlagPos.x}%`, top: `${situationFlagPos.y}%`, width: `${flagSize}px`, transform: 'translate(-50%, -100%)' }} className="absolute z-20 pointer-events-none drop-shadow-md">
                                                    <img src="/Drapeaux.png" alt="Drapeau situation" className="w-full h-auto" />
                                                </div>
                                            )}
                                            <button type="button" onClick={(e) => { e.stopPropagation(); handleRemovePhoto('photo_situation'); }} className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold shadow z-30">✕</button>
                                            <div className="absolute bottom-2 right-2 bg-blue-700 text-white text-xs px-2 py-1 rounded shadow font-bold pointer-events-none flex items-center gap-1"><span>🔍</span> Ajuster le drapeau</div>
                                        </div>
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
                        <>
                            <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">2 - Tampon</h2>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">État du tampon</label>
                                            <select {...register("etat_couvercle")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('etat_couvercle')}`}>
                                                <option value="">Sélectionner...</option>
                                                <option value="Bon état">Bon état</option>
                                                <option value="Fissuré / Ébréché">Fissuré / Ébréché</option>
                                                <option value="Cassé à remplacer">Cassé à remplacer</option>
                                                <option value="Verrouillé / Grippé">Verrouillé / Grippé</option>
                                                <option value="Manquant">Manquant</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Niveau d'affleurement</label>
                                            <select {...register("affleurement")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('affleurement')}`}>
                                                <option value="">Sélectionner...</option>
                                                <option value="Affleurant au sol (RAS)">Affleurant au sol (RAS)</option>
                                                <option value="Surélevé (+1 à +5 cm)">Surélevé (+1 à +5 cm)</option>
                                                <option value="Enfoncé (-1 à -5 cm)">Enfoncé (-1 à -5 cm)</option>
                                                <option value="Sous terre">Sous terre</option>
                                                <option value="sous enrobé">sous enrobé</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="pt-3 border-t border-gray-200">
                                        <label className="block text-sm font-bold text-gray-800 mb-2">📸 Photo Couvercle / Tampon</label>
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

                            <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                <h2 className="text-xl font-bold mb-1 text-blue-800 border-b pb-2">3 - Cadre</h2>
                                <div className="space-y-4">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-1">État du cadre</label>
                                            <select {...register("etat_cadre")} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('etat_cadre')}`}>
                                                <option value="">Sélectionner...</option>
                                                <option value="Bon état">Bon état</option>
                                                <option value="Fissuré / Ébréché">Fissuré / Ébréché</option>
                                                <option value="Dégradé">Dégradé</option>
                                                <option value="Cassé">Cassé</option>
                                            </select>
                                        </div>

                                    </div>
                                </div>
                            </section>

                            <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">4 - Conduits</h2>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Matériau du conduit</label>
                                            <select {...register("materiau_conduit")} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('materiau_conduit')}`}>
                                                <option value="">Sélectionner...</option>
                                                <option value="PVC">PVC</option>
                                                <option value="Béton">Béton</option>
                                                <option value="Fonte">Fonte</option>
                                                <option value="Grès">Grès</option>
                                                <option value="Maçonné">Maçonné</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Profondeur au radier (cm)</label>
                                            <input type="number" {...register("profondeur_cm", { valueAsNumber: true })} className={`w-full p-3 border rounded-lg text-lg transition-colors ${getFieldBg('profondeur_cm')}`} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Écoulement et fils d'eau</label>
                                            <select {...register("ecoulement")} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('ecoulement')}`}>
                                                <option value="">Sélectionner...</option>
                                                <option value="Fluide et normal">Fluide et normal</option>
                                                <option value="Stagnation légère">Stagnation légère</option>
                                                <option value="Engorgement / Obstrué">Engorgement / Obstrué</option>
                                                <option value="Refoulement constaté">Refoulement constaté</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">État des raccordements</label>
                                                <select {...register("etat_parois")} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('etat_parois')}`}>
                                                    <option value="">Sélectionner...</option>
                                                    <option value="Bon état étanche">Bon état étanche</option>
                                                    <option value="Déboîtement">Déboîtement</option>
                                                    <option value="Corrosion">Corrosion</option>
                                                    <option value="Fracture">Fracture</option>
                                                    <option value="Fissures">Fissures</option>
                                                    <option value="Racines">Racines</option>
                                                </select>
                                            </div>
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
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Eaux parasites</label>
                                            <select {...register("eaux_parasites")} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('eaux_parasites')}`}>
                                                <option value="">Sélectionner...</option>
                                                <option value="Aucune infiltration">Aucune infiltration</option>
                                                <option value="Infiltration eau claire (nappe)">Infiltration eau claire (nappe)</option>
                                                <option value="Apport eau pluviale parasite">Apport eau pluviale parasite</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="block text-sm font-medium text-gray-700">Matériaux et dimensions (Observations physiques)</label>
                                            <button type="button" onClick={() => toggleDictation('observations_physiques')} className={`text-sm px-3 py-1 rounded border ${listeningField === 'observations_physiques' ? 'bg-red-600 text-white animate-pulse' : 'bg-white'}`}>🎤 Dicter</button>
                                        </div>
                                        <textarea {...register("observations_physiques")} rows={3} className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('observations_physiques')}`} />
                                    </div>

                                    <div className="pt-3 border-t border-gray-200">
                                        <label className="block text-sm font-bold text-gray-800 mb-2">📸 Photos Intérieur (Multiples)</label>
                                        <div className="flex flex-wrap gap-3">
                                            {photoPreviews.photos_interieur.map((preview, idx) => (
                                                <div key={idx} className="relative inline-block bg-gray-100 p-1 rounded-lg border shadow-sm">
                                                    <img src={preview} alt={`Intérieur ${idx + 1}`} className="h-32 w-32 object-cover rounded" />
                                                    <button type="button" onClick={() => handleRemovePhoto('photos_interieur', idx)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold shadow">✕</button>
                                                </div>
                                            ))}
                                            <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                                <span className="text-2xl mb-1">📷</span><span className="text-sm font-medium text-blue-700">Ajouter</span>
                                                <input type="file" accept="image/*" multiple capture="environment" onChange={(e) => handlePhotoCapture('photos_interieur', e)} className="hidden" />
                                            </label>
                                        </div>
                                    </div>

                                    <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                        <h2 className="text-xl font-bold mb-4 text-blue-800 border-b pb-2">5 - Action(s) préconisée(s)</h2>

                                        <div className="space-y-4">
                                            <label className="block text-sm font-medium text-gray-700">Cocher les interventions à prévoir :</label>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {[
                                                    "R.A.S.",
                                                    "Curage / Nettoyage",
                                                    "Débouchage / Dégorgement",
                                                    "Remplacement du tampon",
                                                    "Réparation du cadre",
                                                    "Remise à niveau de l'arase",
                                                    "Traitement des infiltrations",
                                                    "Dégagement d'accès",
                                                    "Reprise de raccordement",
                                                    "Traitement anti-corrosion / Réfection",
                                                    "Dégrippage / Déblocage"
                                                ].map((action, idx) => (
                                                    <label
                                                        key={idx}
                                                        className="flex items-center gap-3 p-3 border rounded-lg hover:bg-blue-50 cursor-pointer transition-colors bg-gray-50"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            value={action}
                                                            {...register("actions_preconisees")}
                                                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                        />
                                                        <span className="text-gray-800 font-medium">{action}</span>
                                                    </label>
                                                ))}
                                            </div>

                                            <div className="pt-2">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="block text-sm font-medium text-gray-700">Autre action / Précisions complémentaires</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleDictation('action_precision')}
                                                        className={`text-sm px-3 py-1 rounded border ${listeningField === 'action_precision' ? 'bg-red-600 text-white animate-pulse' : 'bg-white'}`}
                                                    >
                                                        🎤 Dicter
                                                    </button>
                                                </div>
                                                <textarea
                                                    {...register("action_precision")}
                                                    rows={2}
                                                    className={`w-full p-3 border rounded-lg text-lg outline-none transition-colors ${getFieldBg('action_precision')}`}
                                                    placeholder="Préciser les détails si nécessaire..."
                                                />
                                            </div>
                                        </div>
                                    </section>

                                </div>
                            </section>
                        </>
                    )}

                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-md z-40">
                        <button type="submit" disabled={isSubmitting} className={`w-full py-4 rounded-xl text-xl font-bold text-white transition-colors shadow-md ${isSubmitting ? 'bg-blue-400 cursor-not-allowed animate-pulse' : 'bg-blue-700 active:bg-blue-800'}`}>
                            {isSubmitting ? '⏳ Traitement en cours...' : (editId ? 'Sauvegarder les modifications' : 'Enregistrer le récolement')}
                        </button>
                    </div>
                </form>
            )}

            {/* MODAL REPÈRE */}
            <RepereModal
                isOpen={isRepereModalOpen}
                onClose={() => setIsRepereModalOpen(false)}
                currentRepere={currentRepere}
                setCurrentRepere={setCurrentRepere}
                onAddRepere={handleAddRepere}
                toggleDictation={toggleDictation}
            />

            {/* MODAL DRAPEAU PLEIN ÉCRAN */}
            <FlagEditModal
                isOpen={isFlagEditModalOpen}
                onClose={() => setIsFlagEditModalOpen(false)}
                photoPreviewUrl={photoPreviews.photo_situation}
                showSituationFlag={showSituationFlag}
                setShowSituationFlag={setShowSituationFlag}
                flagSize={flagSize}
                setFlagSize={setFlagSize}
                situationFlagPos={situationFlagPos}
                situationImageRef={situationImageRef}
                handlePointerDown={handlePointerDown}
                handlePointerMove={handlePointerMove}
                handlePointerUp={handlePointerUp}
            />

            {/* MODAL EXPORT IN-LINE */}
            <ExportInlineModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                pendingItems={pendingItems}
                currentExportIndex={currentExportIndex}
                exportForm={exportForm}
                setExportForm={setExportForm}
                enriching={enriching}
                suggestions={suggestions}
                exportPhotoPreviews={exportPhotoPreviews}
                isExporting={isExporting}
                handleValidateAndExport={handleValidateAndExport}
                handleDeleteLocalDraft={handleDeleteLocalDraft}
            />

            {/* MODAL CONFIRMATION DE SUPPRESSION */}
            <DeleteConfirmModal
                recordToDelete={recordToDelete}
                onClose={() => setRecordToDelete(null)}
                onConfirm={executeDelete}
                isDeleting={isDeleting}
            />
        </div>
    );
}