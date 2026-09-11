import { Toast } from './components/Toast'; // Existant
import { HistoriqueTab } from './components/tabs/HistoriqueTab'; // Existant
import { ExportInlineModal } from './components/modals/ExportInlineModal'; // Existant
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal'; // Existant

// Imports Hooks & Composants de la nouvelle architecture
import { useAppLogic } from './hooks/useAppLogic';
import { useSyncExport } from './hooks/useSyncExport';
import { useSaisieTab } from './hooks/useSaisieTab';
import { useMapTab } from './hooks/useMapTab';
import { useHistoriqueTab } from './hooks/useHistoriqueTab';
import { SaisieTab } from './components/tabs/SaisieTab';
import { CarteTab } from './components/tabs/CarteTab';

export default function SaisieRecolement() {
    // 1. État global (On récupère maintenant l'historique et isLoadingHist ici)
    const { isOnline, activeTab, setActiveTab, toast, setToast, showToast, historique, setHistorique, isLoadingHist } = useAppLogic();

    // 2. Logique Sync / Export In-line
    const syncState = useSyncExport(isOnline);

    // 3. Logique Onglet Saisie
    const saisieState = useSaisieTab(isOnline, syncState.refreshPendingCount, setActiveTab);

    // 4. Logique Onglet Carte
    const mapState = useMapTab(isOnline, activeTab);

    // 5. Logique Onglet Historique (On passe historique et setHistorique, et on retire activeTab)
    const historiqueState = useHistoriqueTab(historique, setHistorique, isOnline, showToast);

    return (
        <div className="w-full max-w-2xl lg:max-w-7xl xl:max-w-[95%] mx-auto p-2 sm:p-4 lg:p-6 pb-24 bg-gray-50 min-h-screen">
            <Toast toast={toast} onClose={() => setToast(null)} />

            {/* STATUS BAR */}
            <div className={`p-3 mb-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2 shadow-sm ${isOnline ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                    <span>{isOnline ? '🟢 Connecté (Cloud)' : '🔴 Hors Ligne'}</span>
                    {syncState.pendingCount > 0 && <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-mono">{syncState.pendingCount} fiche(s)</span>}
                </div>
                <button type="button" onClick={syncState.handleOpenExportModal} disabled={!isOnline || syncState.pendingCount === 0} className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-bold shadow flex items-center justify-center gap-2 transition-all ${isOnline && syncState.pendingCount > 0 ? 'bg-amber-400 text-amber-950 hover:bg-amber-300 animate-pulse' : 'bg-gray-200 text-gray-500 opacity-60'}`}>
                    🚀 Export In-Line {syncState.pendingCount > 0 ? `(${syncState.pendingCount})` : ''}
                </button>
            </div>

            <h1 className="text-2xl font-bold mb-4 text-gray-800">Fiche de Récolement</h1>

            {/* TAB NAVIGATION */}
            <div className="max-w-6xl mx-auto bg-gray-200/70 p-1.5 rounded-2xl shadow-inner border border-gray-300/60 flex gap-2 mb-6">

                <button
                    type="button"
                    onClick={() => setActiveTab('carte')}
                    className={`flex-1 py-3 px-4 text-sm sm:text-base font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'carte'
                            ? 'bg-white text-blue-900 shadow-md border border-gray-200/80 scale-[1.01]'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-white/40'
                        }`}
                >
                    <span>🗺️</span>
                    <span>Carte des ouvrages</span>
                </button>

                <button
                    type="button"
                    onClick={() => { setActiveTab('historique'); saisieState.resetSaisie(); }}
                    className={`flex-1 py-3 px-4 text-sm sm:text-base font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'historique'
                            ? 'bg-white text-blue-900 shadow-md border border-gray-200/80 scale-[1.01]'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-white/40'
                        }`}
                >
                    <span>🗂️</span>
                    <span>Liste des ouvrages</span>
                </button>


                <button
                    type="button"
                    onClick={() => { setActiveTab('saisie'); if (!saisieState.editId) saisieState.resetSaisie(); }}
                    className={`flex-1 py-3 px-4 text-sm sm:text-base font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'saisie'
                            ? 'bg-white text-blue-900 shadow-md border border-gray-200/80 scale-[1.01]'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-white/40'
                        }`}
                >
                    <span>{saisieState.editId ? '🔍' : '📝'}</span>
                    <span>{saisieState.editId ? 'Afficher' : 'Saisie'}</span>
                </button>

            </div>

            {/* VIEWS */}
            {activeTab === 'saisie' && (
                <SaisieTab saisieState={saisieState} isOnline={isOnline} />
            )}

            {activeTab === 'carte' && (
                <CarteTab
                    isOnline={isOnline}
                    isLoadingMap={mapState.isLoadingMap}
                    handleEditRecord={saisieState.handleEditRecord}
                    historique={historique} // <-- on utilise directement la variable de useAppLogic
                    filterDate={historiqueState.filterDate} setFilterDate={historiqueState.setFilterDate}
                    filterCommune={historiqueState.filterCommune} setFilterCommune={historiqueState.setFilterCommune}
                    filterNumero={historiqueState.filterNumero} setFilterNumero={historiqueState.setFilterNumero}
                    filterRue={historiqueState.filterRue} setFilterRue={historiqueState.setFilterRue}
                    filterNonTrouvee={historiqueState.filterNonTrouvee} setFilterNonTrouvee={historiqueState.setFilterNonTrouvee}
                />
            )}

            {activeTab === 'historique' && (
                <HistoriqueTab
                    isOnline={isOnline}
                    historique={historique} // <-- on utilise directement la variable de useAppLogic
                    isLoadingHist={isLoadingHist} // <-- on utilise directement la variable de useAppLogic
                    filterDate={historiqueState.filterDate} setFilterDate={historiqueState.setFilterDate}
                    filterCommune={historiqueState.filterCommune} setFilterCommune={historiqueState.setFilterCommune}
                    filterNumero={historiqueState.filterNumero} setFilterNumero={historiqueState.setFilterNumero}
                    filterRue={historiqueState.filterRue} setFilterRue={historiqueState.setFilterRue}
                    filterNonTrouvee={historiqueState.filterNonTrouvee} setFilterNonTrouvee={historiqueState.setFilterNonTrouvee}
                    exportingId={historiqueState.exportingId}
                    handleExportExcel={historiqueState.handleExportExcel}
                    handleEditRecord={saisieState.handleEditRecord}
                    setRecordToDelete={historiqueState.setRecordToDelete}
                />
            )}

            {/* MODALS GLOBAUX */}
            <ExportInlineModal
                isOpen={syncState.isExportModalOpen} onClose={() => syncState.setIsExportModalOpen(false)}
                pendingItems={syncState.pendingItems} currentExportIndex={syncState.currentExportIndex}
                exportForm={syncState.exportForm} setExportForm={syncState.setExportForm}
                enriching={syncState.enriching} suggestions={syncState.suggestions}
                exportPhotoPreviews={syncState.exportPhotoPreviews} isExporting={syncState.isExporting}
                handleValidateAndExport={syncState.handleValidateAndExport} handleDeleteLocalDraft={syncState.handleDeleteLocalDraft}
            />

            <DeleteConfirmModal
                recordToDelete={historiqueState.recordToDelete}
                onClose={() => historiqueState.setRecordToDelete(null)}
                onConfirm={historiqueState.executeDelete}
                isDeleting={historiqueState.isDeleting}
            />
        </div>
    );
}