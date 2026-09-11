import { useState, useEffect, useCallback } from 'react';
import { offlineDb } from '../db/offlineDb';
import { supabase } from '../lib/supabase';
import { uploadToCloudinary } from '../services/cloudinaryService';
import type { RecoletBoite } from '../types/database';

export function useSyncExport(isOnline: boolean) {
    const [pendingCount, setPendingCount] = useState<number>(0);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [pendingItems, setPendingItems] = useState<any[]>([]);
    const [currentExportIndex, setCurrentExportIndex] = useState<number>(0);
    const [exportForm, setExportForm] = useState<RecoletBoite | null>(null);
    const [enriching, setEnriching] = useState<boolean>(false);
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [suggestions, setSuggestions] = useState<{
        commune?: string; voie_numero?: string; voie_nom?: string;
        section_cadastrale?: string; parcelle_cadastrale?: string; id_ouvrage?: string;
    }>({});
    const [exportPhotoPreviews, setExportPhotoPreviews] = useState<{
        situation: string | null; couvercle: string | null; photos_interieur: string[];
    }>({ situation: null, couvercle: null, photos_interieur: [] });

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
            delete payload.id; delete payload.created_at; delete payload.photo_situation; delete payload.photo_couvercle; delete payload.photo_interieur;
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

    return {
        pendingCount, refreshPendingCount, isExportModalOpen, setIsExportModalOpen, pendingItems,
        currentExportIndex, exportForm, setExportForm, enriching, isExporting, suggestions, exportPhotoPreviews,
        handleOpenExportModal, handleValidateAndExport, handleDeleteLocalDraft
    };
}