import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useMapTab(isOnline: boolean, activeTab: string) {
    const [mapRecords, setMapRecords] = useState<any[]>([]);
    const [isLoadingMap, setIsLoadingMap] = useState<boolean>(false);
    const [mapFilterStatus, setMapFilterStatus] = useState<string>('tous');

    const fetchMapRecords = useCallback(async () => {
        setIsLoadingMap(true);
        try {
            const { data, error } = await supabase.from('recolements_boites').select('*').not('latitude', 'is', null).not('longitude', 'is', null);
            if (!error && data) setMapRecords(data);
        } catch (err) { console.error("Erreur carte :", err); } 
        finally { setIsLoadingMap(false); }
    }, []);

    useEffect(() => { if (activeTab === 'carte' && isOnline) fetchMapRecords(); }, [activeTab, isOnline, fetchMapRecords]);

    const filteredMapRecords = mapRecords.filter((record) => {
        if (mapFilterStatus === 'trouve') return !record.non_trouvee;
        if (mapFilterStatus === 'non_trouve') return Boolean(record.non_trouvee);
        return true;
    });

    return { isLoadingMap, mapFilterStatus, setMapFilterStatus, filteredMapRecords };
}