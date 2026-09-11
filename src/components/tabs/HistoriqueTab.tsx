import { useMemo } from 'react';
import type { RecoletBoite } from '../../types/database';

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
    handleEditRecord: (record: any, mode: 'view' | 'edit') => void;
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
        return (
            <div className="max-w-6xl mx-auto p-4">
                <div className="p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-xl text-center shadow-sm">
                    L'historique nécessite une connexion internet.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto w-full pb-12">
            {historique.length > 0 && (
                <div className="bg-white p-4 lg:p-8 rounded-xl shadow-sm lg:shadow border border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-5 transition-shadow duration-300 hover:shadow-md">
                    <div>
                        <label className="block text-xs lg:text-sm font-bold text-gray-700 mb-1.5">Date de récolement</label>
                        <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full p-2.5 lg:p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-colors">
                            <option value="">Toutes les dates</option>
                            {uniqueDates.map((date: any) => {
                                const rawDate = String(date).split('T')[0];
                                const parts = rawDate.split('-');
                                const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : date;

                                return (
                                    <option key={date} value={date}>
                                        {displayDate}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs lg:text-sm font-bold text-gray-700 mb-1.5">Commune</label>
                        <select value={filterCommune} onChange={(e) => setFilterCommune(e.target.value)} className="w-full p-2.5 lg:p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-colors">
                            <option value="">Toutes les communes</option>
                            {uniqueCommunes.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs lg:text-sm font-bold text-gray-700 mb-1.5">N° de rue</label>
                        <select value={filterNumero} onChange={(e) => setFilterNumero(e.target.value)} className="w-full p-2.5 lg:p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-colors">
                            <option value="">Tous les numéros</option>
                            {uniqueNumeros.map((num) => <option key={num} value={num}>{num}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs lg:text-sm font-bold text-gray-700 mb-1.5">Nom de rue</label>
                        <select value={filterRue} onChange={(e) => setFilterRue(e.target.value)} className="w-full p-2.5 lg:p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-colors">
                            <option value="">Toutes les rues</option>
                            {uniqueRues.map((rue) => <option key={rue} value={rue}>{rue}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs lg:text-sm font-bold text-gray-700 mb-1.5">Statut ouvrage</label>
                        <select value={filterNonTrouvee} onChange={(e) => setFilterNonTrouvee(e.target.value)} className="w-full p-2.5 lg:p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-colors">
                            <option value="">Tous les statuts</option>
                            <option value="trouve">Trouvés (Actifs)</option>
                            <option value="non_trouve">Non trouvés / Inaccessibles</option>
                        </select>
                    </div>
                    <div className="lg:col-span-5 flex items-center justify-between border-t border-gray-100 pt-3 mt-2">
                        <span className="text-xs lg:text-sm font-semibold text-gray-600">
                            {historiqueFiltre.length} ouvrage{historiqueFiltre.length > 1 ? 's' : ''} trouvé{historiqueFiltre.length > 1 ? 's' : ''}
                            {(filterDate || filterCommune || filterNumero || filterRue || filterNonTrouvee) && <span className="text-gray-400 font-normal"> (sur {historique.length})</span>}
                        </span>
                        {(filterDate || filterCommune || filterNumero || filterRue || filterNonTrouvee) && (
                            <button type="button" onClick={() => { setFilterDate(''); setFilterCommune(''); setFilterNumero(''); setFilterRue(''); setFilterNonTrouvee(''); }} className="text-xs lg:text-sm text-red-600 hover:text-red-800 font-bold px-2 py-1 transition-colors">
                                ✕ Effacer les filtres
                            </button>
                        )}
                    </div>
                </div>
            )}

            {isLoadingHist ? (
                <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">Chargement des données...</div>
            ) : historiqueFiltre.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">
                    {historique.length === 0 ? "Aucun récolement trouvé." : "Aucun récolement ne correspond à vos filtres."}
                </div>
            ) : (
                <>
                    {/* ======================================================== */}
                    {/* AFFICHAGE PC : TABLEAU CLASSIQUE STRUCTURÉ (hidden on mobile) */}
                    {/* ======================================================== */}
                    <div className="hidden lg:block bg-white rounded-xl shadow-sm lg:shadow border border-gray-200 overflow-hidden transition-shadow duration-300 hover:shadow-md">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-100/75 border-b border-gray-200 text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    <th className="p-4 w-20 text-center">Photo</th>
                                    <th className="p-4">ID Ouvrage</th>
                                    <th className="p-4">Adresse</th>
                                    <th className="p-4">Date / Technicien</th>
                                    <th className="p-4 text-center">Statut</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-sm">
                                {historiqueFiltre.map((rec) => {
                                    const isRowExporting = exportingId === (rec.id || rec.id_ouvrage);
                                    return (
                                        <tr key={rec.id || rec.id_ouvrage} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="p-4 text-center">
                                                {rec.photo_situation_url ? (
                                                    <img src={rec.photo_situation_url} alt="Situation" className="w-12 h-12 object-cover rounded-lg border border-gray-200 mx-auto shadow-sm" />
                                                ) : (
                                                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-lg border border-gray-200 mx-auto">📷</div>
                                                )}
                                            </td>
                                            <td className="p-4 font-bold text-blue-900">{rec.id_ouvrage}</td>
                                            <td className="p-4 text-gray-700">
                                                {rec.voie_numero ? `${rec.voie_numero} ` : ''}
                                                {rec.voie_nom ? `${rec.voie_nom}, ` : ''}
                                                <span className="font-medium">{rec.commune}</span>
                                            </td>
                                            <td className="p-4 text-gray-600 text-xs">
                                                <div className="font-medium text-gray-800">{rec.date_recolement ? new Date(rec.date_recolement).toLocaleDateString('fr-FR') : 'N.R.'}</div>
                                                <div className="text-gray-400 font-mono mt-0.5">par {rec.technicien || 'N.R.'}</div>
                                            </td>
                                            <td className="p-4 text-center">
                                                {rec.non_trouvee ? (
                                                    <span className="bg-red-100 text-red-700 text-xs px-3 py-1 rounded-full font-semibold">Non trouvé</span>
                                                ) : (
                                                    <span className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full font-semibold">Trouvé</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right space-x-2 whitespace-nowrap">
                                                <button onClick={() => handleExportExcel(rec)} disabled={isRowExporting} className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 shadow-sm">
                                                    {isRowExporting ? '⏳ ...' : '📊 Excel'}
                                                </button>
                                                <button onClick={() => handleEditRecord(rec, 'view')} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                                                    🔍 Afficher
                                                </button>
                                                <button onClick={() => setRecordToDelete(rec)} className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* ======================================================== */}
                    {/* AFFICHAGE MOBILE : LISTE EN CARTES EMPILÉES (hidden on PC) */}
                    {/* ======================================================== */}
                    <div className="block lg:hidden space-y-3">
                        {historiqueFiltre.map((rec) => (
                            <div key={rec.id || rec.id_ouvrage} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-3 items-start justify-between">
                                <div className="flex gap-3 items-center w-full">
                                    {rec.photo_situation_url ? (
                                        <img src={rec.photo_situation_url} alt="Situation" className="w-16 h-16 object-cover rounded-lg border border-gray-200 shadow-sm shrink-0" />
                                    ) : (
                                        <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl border border-gray-200 shadow-sm shrink-0">📷</div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-bold text-gray-800 truncate">{rec.id_ouvrage}</h3>
                                            {rec.non_trouvee && <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold">Non trouvé</span>}
                                        </div>
                                        <p className="text-sm text-gray-600 font-medium truncate">
                                            {rec.voie_numero ? `${rec.voie_numero} ` : ''}
                                            {rec.voie_nom ? `${rec.voie_nom}, ` : ''}
                                            {rec.commune}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Le {rec.date_recolement ? new Date(rec.date_recolement).toLocaleDateString('fr-FR') : ''} par {rec.technicien}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-row gap-2 w-full pt-2 border-t border-gray-100">
                                    <button onClick={() => handleExportExcel(rec)} disabled={exportingId === (rec.id || rec.id_ouvrage)} className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg text-xs font-bold hover:bg-green-200 transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                                        {exportingId === (rec.id || rec.id_ouvrage) ? '⏳ ...' : '📊 Excel'}
                                    </button>
                                    <button onClick={() => handleEditRecord(rec, 'view')} className="flex-1 bg-blue-100 text-blue-700 py-2 rounded-lg text-xs font-bold hover:bg-blue-200 transition-colors">Modifier</button>
                                    <button onClick={() => setRecordToDelete(rec)} className="bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors">Supprimer</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}