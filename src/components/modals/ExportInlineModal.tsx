import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MapRecenter } from '../map/MapComponents';
import type { RecoletBoite } from '../../types/database';

interface ExportInlineModalProps {
    isOpen: boolean;
    onClose: () => void;
    pendingItems: any[];
    currentExportIndex: number;
    exportForm: RecoletBoite | null;
    setExportForm: React.Dispatch<React.SetStateAction<RecoletBoite | null>>;
    enriching: boolean;
    suggestions: {
        commune?: string;
        voie_numero?: string;
        voie_nom?: string;
        section_cadastrale?: string;
        parcelle_cadastrale?: string;
        id_ouvrage?: string;
    };
    exportPhotoPreviews: {
        situation: string | null;
        couvercle: string | null;
        photos_interieur: string[];
    };
    isExporting: boolean;
    handleValidateAndExport: () => void;
    handleDeleteLocalDraft: () => void;
}

export function ExportInlineModal({
    isOpen,
    onClose,
    pendingItems,
    currentExportIndex,
    exportForm,
    setExportForm,
    enriching,
    suggestions,
    exportPhotoPreviews,
    isExporting,
    handleValidateAndExport,
    handleDeleteLocalDraft
}: ExportInlineModalProps) {
    if (!isOpen || !exportForm) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-gray-200">
                <div className="px-6 py-4 bg-slate-800 text-white flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">🚀 Contrôle Export In-Line</h2>
                        <p className="text-xs text-slate-300">Fiche {currentExportIndex + 1} sur {pendingItems.length} en attente</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white font-bold text-xl">✕</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
                    {enriching ? (
                        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-xl text-xs flex items-center gap-2 animate-pulse">
                            <span>🔄</span> Recherche automatique BAN / Cadastre & calcul d'ID Ouvrage...
                        </div>
                    ) : (
                        <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded-xl text-xs flex items-center gap-2">
                            <span>✅</span> Données enrichies via les services en ligne. Vous pouvez ajuster chaque champ avant export.
                        </div>
                    )}

                    <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h3 className="font-bold text-blue-800 border-b pb-1 text-base">Identifiants de la fiche</h3>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">ID Ouvrage</label>
                            <input type="text" value={exportForm.id_ouvrage || ''} onChange={(e) => setExportForm({ ...exportForm, id_ouvrage: e.target.value })} className="w-full p-2.5 border rounded-lg font-mono font-bold bg-white" />
                            {suggestions.id_ouvrage && exportForm.id_ouvrage !== suggestions.id_ouvrage && (
                                <button type="button" onClick={() => setExportForm({ ...exportForm, id_ouvrage: suggestions.id_ouvrage })} className="text-xs text-blue-600 underline mt-1 block font-medium">💡 Appliquer l'ID calculé : {suggestions.id_ouvrage}</button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Technicien</label>
                                <input type="text" value={exportForm.technicien || ''} onChange={(e) => setExportForm({ ...exportForm, technicien: e.target.value })} className="w-full p-2.5 border rounded-lg bg-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Date récolement</label>
                                <input type="date" value={exportForm.date_recolement || ''} onChange={(e) => setExportForm({ ...exportForm, date_recolement: e.target.value })} className="w-full p-2.5 border rounded-lg bg-white" />
                            </div>
                        </div>
                    </div>

                    {exportForm.latitude && exportForm.longitude && (
                        <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <div className="flex justify-between items-center border-b pb-1">
                                <h3 className="font-bold text-blue-800 text-base">Localisation Terrain (Vue Satellite)</h3>
                                <span className="text-xs text-gray-500 font-mono">Lat: {exportForm.latitude.toFixed(6)} | Lng: {exportForm.longitude.toFixed(6)}</span>
                            </div>
                            <div className="h-64 w-full rounded-lg overflow-hidden border border-gray-300 shadow-sm relative z-0">
                                <MapContainer center={[exportForm.latitude, exportForm.longitude]} zoom={19} style={{ height: '100%', width: '100%' }}>
                                    <MapRecenter center={[exportForm.latitude, exportForm.longitude]} />
                                    <TileLayer url="https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}" maxZoom={19} />
                                    <Marker position={[exportForm.latitude, exportForm.longitude]}><Popup>Emplacement capturé hors-ligne</Popup></Marker>
                                </MapContainer>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h3 className="font-bold text-blue-800 border-b pb-1 text-base">Adresse & Cadastre enrichis</h3>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Commune</label>
                            <input type="text" value={exportForm.commune || ''} onChange={(e) => setExportForm({ ...exportForm, commune: e.target.value })} className="w-full p-2.5 border rounded-lg bg-white" />
                            {suggestions.commune && exportForm.commune !== suggestions.commune && (
                                <button type="button" onClick={() => setExportForm({ ...exportForm, commune: suggestions.commune })} className="text-xs text-blue-600 underline mt-1 block">💡 Suggestion BAN : {suggestions.commune}</button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div><label className="block text-xs font-semibold text-gray-700 mb-1">N° voie</label><input type="text" value={exportForm.voie_numero || ''} onChange={(e) => setExportForm({ ...exportForm, voie_numero: e.target.value })} className="w-full p-2.5 border rounded-lg bg-white" /></div>
                            <div className="sm:col-span-2"><label className="block text-xs font-semibold text-gray-700 mb-1">Nom voie</label><input type="text" value={exportForm.voie_nom || ''} onChange={(e) => setExportForm({ ...exportForm, voie_nom: e.target.value })} className="w-full p-2.5 border rounded-lg bg-white" /></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div><label className="block text-xs font-semibold text-gray-700 mb-1">Section cadastrale</label><input type="text" value={exportForm.section_cadastrale || ''} onChange={(e) => setExportForm({ ...exportForm, section_cadastrale: e.target.value })} className="w-full p-2.5 border rounded-lg bg-white" /></div>
                            <div><label className="block text-xs font-semibold text-gray-700 mb-1">Parcelle cadastrale</label><input type="text" value={exportForm.parcelle_cadastrale || ''} onChange={(e) => setExportForm({ ...exportForm, parcelle_cadastrale: e.target.value })} className="w-full p-2.5 border rounded-lg bg-white" /></div>
                        </div>
                    </div>

                    <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h3 className="font-bold text-blue-800 border-b pb-1 text-base">Photos rattachées</h3>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                                <span className="block text-xs font-semibold mb-1">Situation</span>
                                {exportPhotoPreviews.situation ? <img src={exportPhotoPreviews.situation} alt="Situation" className="w-full h-24 object-cover rounded-lg border" /> : <div className="w-full h-24 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-500">Sans photo</div>}
                            </div>
                            <div>
                                <span className="block text-xs font-semibold mb-1">Couvercle</span>
                                {exportPhotoPreviews.couvercle ? <img src={exportPhotoPreviews.couvercle} alt="Couvercle" className="w-full h-24 object-cover rounded-lg border" /> : <div className="w-full h-24 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-500">Sans photo</div>}
                            </div>
                            <div>
                                <span className="block text-xs font-semibold mb-1">Intérieur</span>
                                {exportPhotoPreviews.photos_interieur?.length > 0 ? <img src={exportPhotoPreviews.photos_interieur[0]} alt="Intérieur" className="w-full h-24 object-cover rounded-lg border" /> : <div className="w-full h-24 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-500">Sans photo</div>}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-xs font-semibold text-gray-700">Observations Terrain</label>
                        <textarea rows={2} value={exportForm.observations_localisation || ''} onChange={(e) => setExportForm({ ...exportForm, observations_localisation: e.target.value })} className="w-full p-2.5 border rounded-lg text-xs" />
                    </div>
                </div>

                <div className="p-4 bg-gray-100 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <button type="button" onClick={handleDeleteLocalDraft} className="text-red-600 font-bold text-xs hover:underline flex items-center gap-1 w-full sm:w-auto">
                        🗑️ Supprimer le brouillon local
                    </button>
                    <button type="button" onClick={handleValidateAndExport} disabled={isExporting} className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-white shadow-md transition-colors ${isExporting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                        {isExporting ? 'Exportation...' : '✔️ Valider & Exporter vers Supabase'}
                    </button>
                </div>
            </div>
        </div>
    );
}