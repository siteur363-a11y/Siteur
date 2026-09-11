import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { exportRecolementToExcel } from '../services/exportExcelService';
import { deleteFromCloudinary } from '../services/cloudinaryService';

export function useHistoriqueTab(
    historique: any[],
    setHistorique: React.Dispatch<React.SetStateAction<any[]>>,
    isOnline: boolean,
    showToast: (msg: string, type: any) => void
) {
    const [filterDate, setFilterDate] = useState<string>('');
    const [filterCommune, setFilterCommune] = useState<string>('');
    const [filterNumero, setFilterNumero] = useState<string>('');
    const [filterRue, setFilterRue] = useState<string>('');
    const [filterNonTrouvee, setFilterNonTrouvee] = useState<string>('');
    const [exportingId, setExportingId] = useState<string | number | null>(null);
    const [recordToDelete, setRecordToDelete] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    const executeDelete = async (record: any) => {
        if (!isOnline) return showToast("Connexion internet requise pour supprimer.", 'error');
        setIsDeleting(true);
        try {
            const searchColumn = (typeof record.id === 'number' || (typeof record.id === 'string' && /^[0-9a-fA-F-]{36}$/.test(record.id))) ? 'id' : 'id_ouvrage';
            const { error } = await supabase.from('recolements_boites').delete().eq(searchColumn, record[searchColumn]);
            if (error) throw new Error(error.message);

            const urlsToDelete = [record.photo_situation_url, record.photo_couvercle_url, ...(record.photos_interieur_urls || []), record.photo_interieur_url].filter(Boolean);
            const uniqueUrls = Array.from(new Set(urlsToDelete));
            
            let failures = 0;
            for (const url of uniqueUrls) { const success = await deleteFromCloudinary(url); if (!success) failures++; }
            
            setHistorique(prev => prev.filter(r => r[searchColumn] !== record[searchColumn]));
            setRecordToDelete(null);
            showToast(failures > 0 ? `Supprimé, mais ${failures} photo(s) non effacées du cloud.` : 'Supprimé avec succès.', 'success');
        } catch (err: any) { showToast(`Échec suppression: ${err.message}`, 'error'); } 
        finally { setIsDeleting(false); }
    };

    const handleExportExcel = async (record: any) => {
        try {
            setExportingId(record.id || record.id_ouvrage || null);
            await exportRecolementToExcel(record);
        } catch (error: any) { alert(`Erreur export : ${error.message}`); } 
        finally { setExportingId(null); }
    };

    return {
        historique, filterDate, setFilterDate, filterCommune, setFilterCommune, filterNumero, setFilterNumero,
        filterRue, setFilterRue, filterNonTrouvee, setFilterNonTrouvee, exportingId, recordToDelete, setRecordToDelete,
        isDeleting, executeDelete, handleExportExcel
    };
}