import { useState, useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.offline'; // Charge les méthodes d'extension sur L

/**
 * Composant pour recentrer dynamiquement la carte Leaflet
 */
export function MapRecenter({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, map.getZoom(), { animate: true });
    }, [center, map]);
    return null;
}

/**
 * Gestionnaire de clics sur la carte pour récupérer les coordonnées
 */
export function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

/**
 * Indicateur de zoom en temps réel (UI Overlay)
 */
export function ZoomIndicator() {
    const [zoom, setZoom] = useState(18);
    const map = useMap();

    useMapEvents({
        zoom() {
            setZoom(map.getZoom());
        },
    });

    return (
        <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono z-[1000] pointer-events-none">
            Zoom : {zoom}
        </div>
    );
}

/**
 * Gestionnaire du cache hors-ligne Leaflet
 */
export function OfflineMapManager() {
    const map = useMap();

    useEffect(() => {
        // @ts-ignore
        const offlineLayer = L.tileLayer.offline('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap (Cache Offline)'
        });

        offlineLayer.addTo(map);

        // @ts-ignore
        const saveControl = L.control.savetiles(offlineLayer, {
            zoomlevels: [16, 17, 18, 19],
            confirm(info: any, savetiles: any) {
                if (window.confirm(`Télécharger ${info._tilesforSave.length} tuiles cartographiques pour le mode hors-ligne ?`)) {
                    savetiles();
                }
            },
            confirmSave() {
                alert('✅ Zone cartographique téléchargée et disponible sans réseau !');
            },
            saveText: '💾 Cacher la zone',
            rmText: '🗑️ Vider le cache',
        });

        saveControl.addTo(map);

        return () => {
            map.removeControl(saveControl);
            map.removeLayer(offlineLayer);
        };
    }, [map]);

    return null;
}