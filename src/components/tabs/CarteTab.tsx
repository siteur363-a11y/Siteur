import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, WMSTileLayer, LayersControl, useMap } from 'react-leaflet';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ZoomIndicator, OfflineMapManager } from '../map/MapComponents';

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const blueIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

function MapFitBounds({ markers }: { markers: { latitude: number; longitude: number }[] }) {
    const map = useMap();
    useEffect(() => {
        const validMarkers = markers.filter((m) => typeof m.latitude === 'number' && typeof m.longitude === 'number');
        if (validMarkers.length > 0) {
            map.fitBounds(
                validMarkers.map((m) => [m.latitude, m.longitude] as [number, number]), 
                { 
                    padding: [10, 10],
                    maxZoom: 19 
                }
            );
        }
    }, [map, markers]);
    return null;
}

export const CarteTab = ({
    isOnline,
    isLoadingMap,
    handleEditRecord,
    historique = [],
    filterDate, setFilterDate,
    filterCommune, setFilterCommune,
    filterNumero, setFilterNumero,
    filterRue, setFilterRue,
    filterNonTrouvee, setFilterNonTrouvee
}: any) => {
    // 1. Valeurs uniques pour les filtres
    const uniqueDates = useMemo(() => Array.from(new Set(historique.map((rec: any) => rec.date_recolement).filter(Boolean))).sort((a: any, b: any) => b.localeCompare(a)), [historique]);
    const uniqueCommunes = useMemo(() => Array.from(new Set(historique.map((rec: any) => rec.commune).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, 'fr', { sensitivity: 'base' })), [historique]);
    const uniqueNumeros = useMemo(() => Array.from(new Set(historique.map((rec: any) => rec.voie_numero).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, undefined, { numeric: true })), [historique]);
    const uniqueRues = useMemo(() => Array.from(new Set(historique.map((rec: any) => rec.voie_nom).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, 'fr', { sensitivity: 'base' })), [historique]);

    // 2. Application des filtres communs sur la carte
    const filteredMapRecords = useMemo(() => {
        return historique.filter((rec: any) => {
            const matchDate = filterDate ? rec.date_recolement === filterDate : true;
            const matchCommune = filterCommune ? rec.commune === filterCommune : true;
            const matchNumero = filterNumero ? rec.voie_numero === filterNumero : true;
            const matchRue = filterRue ? rec.voie_nom === filterRue : true;

            let matchNonTrouvee = true;
            if (filterNonTrouvee === 'trouve') matchNonTrouvee = !rec.non_trouvee;
            else if (filterNonTrouvee === 'non_trouve') matchNonTrouvee = !!rec.non_trouvee;

            return matchDate && matchCommune && matchNumero && matchRue && matchNonTrouvee;
        });
    }, [historique, filterDate, filterCommune, filterNumero, filterRue, filterNonTrouvee]);

    return (
        <div className="space-y-6 max-w-6xl mx-auto w-full pb-12">
            {/* Bloc Titre et Filtres */}
            <div className="bg-white p-4 lg:p-8 rounded-xl shadow-sm lg:shadow border border-gray-200 space-y-4 transition-shadow duration-300 hover:shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-gray-100">
                    <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>🗺️</span> Carte globale des récolements
                    </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-5">
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
                            {uniqueCommunes.map((commune: any) => <option key={commune} value={commune}>{commune}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs lg:text-sm font-bold text-gray-700 mb-1.5">N° de rue</label>
                        <select value={filterNumero} onChange={(e) => setFilterNumero(e.target.value)} className="w-full p-2.5 lg:p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-colors">
                            <option value="">Tous les numéros</option>
                            {uniqueNumeros.map((num: any) => <option key={num} value={num}>{num}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs lg:text-sm font-bold text-gray-700 mb-1.5">Nom de rue</label>
                        <select value={filterRue} onChange={(e) => setFilterRue(e.target.value)} className="w-full p-2.5 lg:p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-colors">
                            <option value="">Toutes les rues</option>
                            {uniqueRues.map((rue: any) => <option key={rue} value={rue}>{rue}</option>)}
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
                        <span className="text-xs lg:text-sm font-semibold text-blue-800 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 whitespace-nowrap">
                            {filteredMapRecords.length} point(s) affiché(s)
                        </span>
                        {(filterDate || filterCommune || filterNumero || filterRue || filterNonTrouvee) && (
                            <button type="button" onClick={() => { setFilterDate(''); setFilterCommune(''); setFilterNumero(''); setFilterRue(''); setFilterNonTrouvee(''); }} className="text-xs lg:text-sm text-red-600 hover:text-red-800 font-bold px-2 py-1 transition-colors">
                                ✕ Effacer les filtres
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Conteneur de la Carte / États de chargement / Hors ligne */}
            {isLoadingMap ? (
                <div className="h-[calc(100vh-280px)] min-h-[420px] w-full flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-gray-600 font-medium text-sm">Chargement de la carte et des points...</p>
                </div>
            ) : !isOnline ? (
                <div className="h-[calc(100vh-280px)] min-h-[420px] w-full flex flex-col items-center justify-center bg-red-50 rounded-xl border border-red-200 p-6 text-center shadow-sm">
                    <span className="text-3xl mb-2">📡</span>
                    <p className="text-red-700 font-bold mb-1">Connexion Internet requise</p>
                    <p className="text-red-600 text-xs sm:text-sm">La carte globale nécessite une connexion réseau pour charger le fond de carte satellite et les données distantes.</p>
                </div>
            ) : (
                <div className="bg-white p-2 lg:p-4 rounded-xl shadow-sm lg:shadow border border-gray-200 transition-shadow duration-300 hover:shadow-md">
                    <div className="h-[calc(100vh-280px)] min-h-[420px] w-full rounded-xl overflow-hidden border border-gray-300 shadow-inner relative z-0">
                        <MapContainer 
                            center={[49.27, 0.96]} 
                            zoom={12} 
                            zoomSnap={0.25}  
                            zoomDelta={0.5}  
                            style={{ height: '100%', width: '100%' }}
                        >
                            <ZoomIndicator />
                            <OfflineMapManager />
                            <LayersControl position="topright">
                                <LayersControl.BaseLayer checked name="Satellite (IGN)">
                                    <TileLayer url="https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}" maxZoom={19} />
                                </LayersControl.BaseLayer>
                                <LayersControl.Overlay checked name="Cadastre (IGN)">
                                    <WMSTileLayer url="https://wxs.ign.fr/essentiels/geoportail/wms?" layers="CADASTRALPARCELS.PARCELS" format="image/png" transparent={true} version="1.3.0" />
                                </LayersControl.Overlay>
                            </LayersControl>
                            {filteredMapRecords.length > 0 && <MapFitBounds markers={filteredMapRecords} />}
                            {filteredMapRecords.map((record: any) => (
<Marker 
    key={record.id || record.id_ouvrage}
    position={[record.latitude, record.longitude]}
    icon={record.non_trouvee ? redIcon : blueIcon}
>
    <Popup>
        <div className="p-1 space-y-2 min-w-[180px]">
            <div className="font-bold text-blue-900 border-b pb-1 text-sm">{record.id_ouvrage}</div>
            <div className="text-xs text-gray-700 space-y-1">
                <div className="flex items-start gap-1">
                    <span>📍</span>
                    <div className="font-medium">
                        {(record.voie_numero || record.voie_nom) && <div>{[record.voie_numero, record.voie_nom].filter(Boolean).join(' ')}</div>}
                        {(record.code_postal || record.commune) && <div>{[record.code_postal, record.commune].filter(Boolean).join(' ')}</div>}
                        {!record.voie_nom && !record.commune && <div>Adresse N.R.</div>}
                    </div>
                </div>
                <p>📅 {record.date_recolement ? new Date(record.date_recolement).toLocaleDateString('fr-FR') : 'Date N.R.'}</p>
            </div>
            <button type="button" onClick={() => handleEditRecord(record, 'view')} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded text-xs transition-colors shadow flex items-center justify-center gap-1 cursor-pointer">
                🔍 Afficher
            </button>
        </div>
    </Popup>
</Marker>
                            ))}
                        </MapContainer>
                    </div>
                </div>
            )}
        </div>
    );
};