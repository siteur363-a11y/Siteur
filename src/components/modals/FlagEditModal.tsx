import React from 'react';
import type { RefObject } from 'react';

interface FlagEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    photoPreviewUrl: string | null;
    showSituationFlag: boolean;
    setShowSituationFlag: (show: boolean) => void;
    flagSize: number;
    setFlagSize: (size: number) => void;
    situationFlagPos: { x: number; y: number };
    situationImageRef: RefObject<HTMLDivElement | null>;
    handlePointerDown: (e: React.PointerEvent) => void;
    handlePointerMove: (e: React.PointerEvent) => void;
    handlePointerUp: (e: React.PointerEvent) => void;
    isViewMode?: boolean; // Ajouté ici
}

export function FlagEditModal({
    isOpen,
    onClose,
    photoPreviewUrl,
    showSituationFlag,
    setShowSituationFlag,
    flagSize,
    setFlagSize,
    situationFlagPos,
    situationImageRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    isViewMode = false
}: FlagEditModalProps) {
    if (!isOpen || !photoPreviewUrl) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-2 backdrop-blur-sm touch-none">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[95vh] overflow-hidden">
                <div className="px-4 py-3 bg-slate-800 text-white flex justify-between items-center">
                    <h3 className="font-bold">{isViewMode ? "Consultation de la photo de situation" : "Positionner le drapeau"}</h3>
                    <button onClick={onClose} className="text-xl font-bold p-1">✕</button>
                </div>

                {/* Masqué en mode affichage */}
                {!isViewMode && (
                    <div className="p-4 bg-gray-50 border-b flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center space-x-3">
                            <input type="checkbox" id="modal_show_situation_flag" checked={showSituationFlag} onChange={(e) => setShowSituationFlag(e.target.checked)} className="w-5 h-5 text-blue-600 rounded cursor-pointer" />
                            <label htmlFor="modal_show_situation_flag" className="font-medium text-gray-700 cursor-pointer">Afficher le drapeau</label>
                        </div>
                        {showSituationFlag && (
                            <div className="flex items-center space-x-2 flex-1 max-w-xs">
                                <span className="text-sm text-gray-600 font-medium whitespace-nowrap">Taille :</span>
                                <input type="range" min="20" max="200" value={flagSize} onChange={(e) => setFlagSize(Number(e.target.value))} className="w-full accent-blue-600 cursor-pointer" />
                            </div>
                        )}
                    </div>
                )}

                <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center relative touch-none p-4 min-h-[50vh]">
                    <div 
                        ref={situationImageRef} 
                        {...(!isViewMode ? { onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerLeave: handlePointerUp } : {})} 
                        className="relative inline-block select-none touch-none shadow-2xl border-2 border-gray-700"
                    >
                        <img src={photoPreviewUrl} alt="Situation large" style={{ maxHeight: '60vh' }} className="w-auto block pointer-events-none" />
                        {showSituationFlag && (
                            <div 
                                {...(!isViewMode ? { onPointerDown: handlePointerDown } : {})} 
                                style={{ left: `${situationFlagPos.x}%`, top: `${situationFlagPos.y}%`, width: `${flagSize}px`, transform: 'translate(-50%, -100%)' }} 
                                className={`absolute z-20 drop-shadow-xl touch-none ${isViewMode ? 'pointer-events-none cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                                {...(!isViewMode ? { title: "Glissez pour positionner le drapeau" } : {})}
                            >
                                <img src="/Drapeaux.png" alt="Drapeau situation" className="w-full h-auto pointer-events-none drop-shadow-md" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-white flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <p className="text-xs text-gray-500 italic hidden sm:block">
                        {isViewMode ? "💡 Visualisation de l'ouvrage et de son drapeau." : "💡 Glissez le drapeau pour le positionner précisément."}
                    </p>
                    <button type="button" onClick={onClose} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-md active:bg-blue-700 w-full sm:w-auto">
                        {isViewMode ? "Fermer" : "Valider la position"}
                    </button>
                </div>
            </div>
        </div>
    );
}