import React from 'react';

interface RepereModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentRepere: {
        point: string;
        description: string;
        distance: string;
        observations: string;
    };
    setCurrentRepere: React.Dispatch<React.SetStateAction<{
        point: string;
        description: string;
        distance: string;
        observations: string;
    }>>;
    onAddRepere: () => void;
    toggleDictation: (field: string, isModal?: boolean) => void;
}

export function RepereModal({
    isOpen,
    onClose,
    currentRepere,
    setCurrentRepere,
    onAddRepere,
    toggleDictation
}: RepereModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                <div className="flex justify-between items-center border-b pb-3">
                    <h3 className="text-lg font-bold text-gray-800">Nouveau repère</h3>
                    <button type="button" onClick={onClose} className="text-gray-400 text-xl font-bold">&times;</button>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-semibold mb-1">Point de Repère *</label>
                        <input value={currentRepere.point} onChange={(e) => setCurrentRepere({ ...currentRepere, point: e.target.value })} className="w-full p-2 border rounded-lg" />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-semibold">Description *</label>
                            <button type="button" onClick={() => toggleDictation('description', true)} className="text-xs px-2 py-1 rounded border">🎤 Dicter</button>
                        </div>
                        <input value={currentRepere.description} onChange={(e) => setCurrentRepere({ ...currentRepere, description: e.target.value })} className="w-full p-2 border rounded-lg" />
                    </div>
<div>
                        <label className="block text-xs font-semibold mb-1">Distance (en cm)</label>
                        <input 
                            type="number"
                            value={currentRepere.distance} 
                            onChange={(e) => setCurrentRepere({ ...currentRepere, distance: e.target.value })} 
                            placeholder="Ex : 150"
                            className="w-full p-2 border rounded-lg" 
                        />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-semibold">Observations</label>
                            <button type="button" onClick={() => toggleDictation('observations', true)} className="text-xs px-2 py-1 rounded border">🎤 Dicter</button>
                        </div>
                        <textarea value={currentRepere.observations} onChange={(e) => setCurrentRepere({ ...currentRepere, observations: e.target.value })} rows={2} className="w-full p-2 border rounded-lg resize-none" />
                    </div>
                </div>
                <div className="flex space-x-3 pt-3 border-t">
                    <button type="button" onClick={onClose} className="flex-1 bg-gray-100 py-2 rounded-xl font-medium">Annuler</button>
                    <button type="button" onClick={onAddRepere} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-medium shadow-sm">Valider</button>
                </div>
            </div>
        </div>
    );
}