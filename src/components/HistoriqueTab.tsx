import { useMemo } from 'react';
import type { RecoletBoite } from '../types/database';

interface HistoriqueTabProps {
    isOnline: boolean;
    historique: any[];
    isLoadingHist: boolean;
    filterDate: string;
    setFilterDate: (val: string) => void;
    filterCommune: string;
    setFilterCommune: (val: string) => void;
    filterNumero: string;
    setFilterNumero: (val: string) => void;
    filterRue: string;
    setFilterRue: (val: string) => void;
    filterNonTrouvee: string;
    setFilterNonTrouvee: (val: string) => void;
    exportingId: string | number | null;
    handleExportExcel: (record: RecoletBoite) => void;
    handleEditRecord: (record: any) => void;
    setRecordToDelete: (record: any) => void;
}

export function HistoriqueTab({
    isOnline,
    historique,
    isLoadingHist,
    filterDate,
    setFilterDate,
    filterCommune,
    setFilterCommune,
    filterNumero,
    setFilterNumero,
    filterRue,
    setFilterRue,
    filterNonTrouvee,
    setFilterNonTrouvee,
    exportingId,
    handleExportExcel,
    handleEditRecord,
    setRecordToDelete
}: HistoriqueTabProps) {
    const uniqueDates = useMemo(() => Array.from(new Set(historique.map(rec => rec.date_recolement).filter(Boolean))).sort((a, b) => b.localeCompare(a)), [historique]);
    const uniqueCommunes = useMemo(() => Array.from(new Set(historique.map(rec => rec.commune).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })), [historique]);
    const uniqueNumeros = useMemo(() => Array.from(new Set(historique.map(rec => rec.voie_numero).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [historique]);
    const uniqueRues = useMemo(() => Array.from(new Set(historique.map(rec => rec.voie_nom).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })), [historique]);

    const historiqueFiltre = historique.filter((rec) => {
        const matchDate = filterDate ? rec.date_recolement === filterDate : true;
        const matchCommune = filterCommune ? rec.commune === filterCommune : true;
        const matchNumero = filterNumero ? rec.voie_numero === filterNumero : true;
        const matchRue = filterRue ? rec.voie_nom === filterRue : true;

        let matchNonTrouvee = true;
        if (filterNonTrouvee === 'trouve') matchNonTrouvee = !rec.non_trouvee;
        else if (filterNonTrouvee === 'non_trouve') matchNonTrouvee = !!rec.non_trouvee;

        return matchDate && matchCommune && matchNumero && matchRue && matchNonTrouvee;
    });

    if (!isOnline) {
        return <div className="p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-xl text-center">L'historique nécessite une connexion internet.</div>;
    }

    return (
        <div className="space-y-4">
            {historique.length > 0 && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Date de récolement</label>
                        <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="">Toutes les dates</option>
                            {uniqueDates.map((date) => <option key={date} value={date}>{date}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Commune</label>
                        <select value={filterCommune} onChange={(e) => setFilterCommune(e.target.value)} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="">Toutes les communes</option>
                            {uniqueCommunes.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">N° de rue</label>
                        <select value={filterNumero} onChange={(e) => setFilterNumero(e.target.value)} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="">Tous les numéros</option>
                            {uniqueNumeros.map((num) => <option key={num} value={num}>{num}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nom de rue</label>
                        <select value={filterRue} onChange={(e) => setFilterRue(e.target.value)} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="">Toutes les rues</option>
                            {uniqueRues.map((rue) => <option key={rue} value={rue}>{rue}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Statut ouvrage</label>
                        <select value={filterNonTrouvee} onChange={(e) => setFilterNonTrouvee(e.target.value)} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="">Tous les statuts</option>
                            <option value="trouve">Trouvés (Actifs)</option>
                            <option value="non_trouve">Non trouvés / Inaccessibles</option>
                        </select>
                    </div>
                    <div className="md:col-span-4 flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
                        <span className="text-xs font-semibold text-gray-600">
                            {historiqueFiltre.length} ouvrage{historiqueFiltre.length > 1 ? 's' : ''} trouvé{historiqueFiltre.length > 1 ? 's' : ''}
                            {(filterDate || filterCommune || filterNumero || filterRue) && <span className="text-gray-400 font-normal"> (sur {historique.length})</span>}
                        </span>
                        {(filterDate || filterCommune || filterNumero || filterRue) && (
                            <button type="button" onClick={() => { setFilterDate(''); setFilterCommune(''); setFilterNumero(''); setFilterRue(''); }} className="text-xs text-red-600 hover:text-red-800 font-bold px-2 py-1">✕ Effacer les filtres</button>
                        )}
                    </div>
                </div>
            )}

            {isLoadingHist ? (
                <div className="text-center py-8 text-gray-500">Chargement des données...</div>
            ) : historiqueFiltre.length === 0 ? (
                <div className="text-center py-8 text-gray-500">{historique.length === 0 ? "Aucun récolement trouvé." : "Aucun récolement ne correspond à vos filtres."}</div>
            ) : (
                historiqueFiltre.map((rec) => (
                    <div key={rec.id || rec.id_ouvrage} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                        <div className="flex gap-4 items-center">
                            {rec.photo_situation_url ? (
                                <img src={rec.photo_situation_url} alt="Situation" className="w-16 h-16 object-cover rounded-lg border border-gray-200 shadow-sm shrink-0" />
                            ) : (
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl border border-gray-200 shadow-sm shrink-0">📷</div>
                            )}
                            <div>
                                <h3 className="font-bold text-gray-800">{rec.id_ouvrage}</h3>
                                <p className="text-sm text-gray-600 font-medium">
                                    {rec.voie_numero ? `${rec.voie_numero} ` : ''}
                                    {rec.voie_nom ? `${rec.voie_nom}, ` : ''}
                                    {rec.commune}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Le {rec.date_recolement ? new Date(rec.date_recolement).toLocaleDateString('fr-FR') : ''} par {rec.technicien}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <button onClick={() => handleExportExcel(rec)} disabled={exportingId === (rec.id || rec.id_ouvrage)} className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                {exportingId === (rec.id || rec.id_ouvrage) ? '⏳ Création...' : '📊 Exporter Excel'}
                            </button>
                            <button onClick={() => handleEditRecord(rec)} className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-200 transition-colors">Modifier</button>
                            <button onClick={() => setRecordToDelete(rec)} className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-200 transition-colors">Supprimer</button>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}