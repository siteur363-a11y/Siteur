interface ToastProps {
    toast: { message: string; type: 'success' | 'error' | 'info' } | null;
    onClose: () => void;
}

export function Toast({ toast, onClose }: ToastProps) {
    if (!toast) return null;

    return (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-3 rounded-lg shadow-xl font-bold flex items-center gap-3 transition-all ${
            toast.type === 'success' ? 'bg-green-600 text-white' :
            toast.type === 'error' ? 'bg-red-600 text-white' :
            'bg-blue-600 text-white'
        }`}>
            <span>{toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}</span>
            {toast.message}
            <button onClick={onClose} className="text-white/80 hover:text-white ml-2 text-lg">✕</button>
        </div>
    );
}