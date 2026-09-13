import { useState, useCallback, useEffect } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { supabase } from '../lib/supabase';

export function useAppLogic() {
    const isOnline = useOnlineStatus();
    const [activeTab, setActiveTab] = useState<'saisie' | 'historique' | 'carte'>('carte');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // États pour les données partagées (Historique & Carte)
    const [historique, setHistorique] = useState<any[]>([]);
    const [isLoadingHist, setIsLoadingHist] = useState<boolean>(false);

    // États pour la connexion
    const [user, setUser] = useState<any>(null);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 5000);
    }, []);

    // 🔑 Écoute de la session Supabase
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    // 🎯 Bascule automatique vers l'onglet "saisie" quand Sébastien se connecte
    useEffect(() => {
        if (user?.email === 'sebastien.guedes@gmail.com') {
            setActiveTab('saisie');
        }
    }, [user]);

    // 🔑 Droit de modification réservé à votre adresse
    const canEdit = user?.email === 'sebastien.guedes@gmail.com';

    // 🔑 Fonction de déconnexion
    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    // Fonction globale pour récupérer l'historique
    const fetchHistorique = useCallback(async () => {
        if (!isOnline) return;
        setIsLoadingHist(true);
        const { data, error } = await supabase
            .from('recolements_boites')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setHistorique(data);
        }
        setIsLoadingHist(false);
    }, [isOnline]);

    // Chargement automatique au démarrage de l'app ou lors du retour en ligne
    useEffect(() => {
        if (isOnline) {
            fetchHistorique();
        }
    }, [isOnline, fetchHistorique]);

    return {
        isOnline,
        activeTab,
        setActiveTab,
        toast,
        setToast,
        showToast,
        // Historique
        historique,
        setHistorique,
        isLoadingHist,
        fetchHistorique,
        // Auth
        user,
        canEdit,
        handleLogout,
        isLoginModalOpen,
        setIsLoginModalOpen
    };
}