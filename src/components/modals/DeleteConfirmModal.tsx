interface DeleteConfirmModalProps {
    recordToDelete: any | null;
    onClose: () => void;
    onConfirm: (record: any) => void;
    isDeleting: boolean;
}

export function DeleteConfirmModal({
    recordToDelete,
    onClose,
    onConfirm,
    isDeleting
}: DeleteConfirmModalProps) {
    if (!recordToDelete) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                <h3 className="text-lg font-bold text-red-600 border-b pb-2">⚠️ Confirmer la suppression</h3>
                <p className="text-gray-700">Êtes-vous sûr de vouloir supprimer définitivement la fiche <strong>{recordToDelete.id_ouvrage || 'sélectionnée'}</strong> ?</p>
                <p className="text-sm text-gray-500 italic">Cette action supprimera également les photos associées sur le cloud et est irréversible.</p>
                <div className="flex space-x-3 pt-4 border-t">
                    <button type="button" onClick={onClose} disabled={isDeleting} className="flex-1 bg-gray-100 py-2 rounded-xl font-medium hover:bg-gray-200 transition-colors">
                        Annuler
                    </button>
                    <button type="button" onClick={() => onConfirm(recordToDelete)} disabled={isDeleting} className={`flex-1 text-white py-2 rounded-xl font-medium shadow-sm transition-colors ${isDeleting ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}>
                        {isDeleting ? 'Suppression...' : 'Oui, supprimer'}
                    </button>
                </div>
            </div>
        </div>
    );
}