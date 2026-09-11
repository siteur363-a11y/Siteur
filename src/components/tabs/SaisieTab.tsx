import { MapContainer, TileLayer, Marker, Popup, WMSTileLayer, LayersControl } from 'react-leaflet';
import { MapRecenter, MapClickHandler, ZoomIndicator, OfflineMapManager } from '../map/MapComponents';
import { RepereModal } from '../modals/RepereModal';
import { FlagEditModal } from '../modals/FlagEditModal';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const blueIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});


export const SaisieTab = ({ saisieState, isOnline }: any) => {
    const {
        rhf, nonTrouvee, formeSelectionnee, editId, isViewMode, setIsViewMode, isSubmitting, activeCoords, reperesList, currentRepere, setCurrentRepere,
        isRepereModalOpen, setIsRepereModalOpen, showSituationFlag, setShowSituationFlag, situationFlagPos,
        flagSize, setFlagSize, isFlagEditModalOpen, setIsFlagEditModalOpen, situationImageRef, enlargedPhotoUrl, setEnlargedPhotoUrl,
        photoPreviews, listeningField, existingDimensions, getFieldBg, toggleDictation, handlePointerDown, handlePointerMove, handlePointerUp,
        handlePhotoCapture, handleRemovePhoto, fetchAddressAndCadastre, handleCaptureLocation, handleAddRepere, handleRemoveRepere, resetSaisie, onSubmit, location
    } = saisieState;

    const { register, handleSubmit, formState: { errors }, getValues, watch } = rhf; // 

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit, (_formErrors: any) => {
                if (!isOnline) alert("Formulaire incomplet : Le champ Technicien et la Date sont obligatoires même hors-ligne.");
                else alert("Formulaire incomplet : vérifiez les champs obligatoires (ID Ouvrage, Technicien, Commune, Date).");
            })}>

                {/* Conteneur principal limité en largeur sur PC (max-w-6xl) et centré */}
                <fieldset disabled={isViewMode} className="space-y-8 lg:space-y-10 max-w-6xl mx-auto pb-32">

                    {editId && (
                        <div className={`${isViewMode ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-amber-100 border-amber-300 text-amber-800'} p-3 lg:p-4 rounded-xl flex justify-between items-center shadow-sm lg:shadow transition-colors border`}>
                            <div className="font-medium text-sm sm:text-base lg:text-lg">
                                {isViewMode ? '🔍 Vous consultez l\'ouvrage :' : '✏️ Vous modifiez l\'ouvrage :'} <span className="font-bold">{getValues('id_ouvrage')}</span>
                            </div>
                            <button type="button" onClick={resetSaisie} className={`${isViewMode ? 'text-blue-800 bg-blue-200 hover:bg-blue-300' : 'text-amber-800 bg-amber-200 hover:bg-amber-300'} text-sm lg:text-base font-bold px-4 py-2 rounded-lg transition-colors`}>
                                Fermer
                            </button>
                        </div>
                    )}

                    {/* GENERAL */}
                    <section className="bg-white p-4 lg:p-8 rounded-xl shadow-sm lg:shadow border border-gray-200 transition-shadow duration-300 hover:shadow-md">
                        <h2 className="text-xl lg:text-2xl font-bold mb-5 text-blue-800 border-b pb-3">Informations Générales</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 items-start">
                            <div className="lg:col-span-2">
                                <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">
                                    ID Ouvrage {isOnline ? '*' : <span className="text-xs text-blue-600 font-normal italic">(Calculé à l'export)</span>}
                                </label>
                                <input
                                    {...register("id_ouvrage", { required: isOnline ? "Ce champ est obligatoire en ligne" : false })}
                                    disabled={isViewMode}
                                    className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('id_ouvrage')} ${isViewMode ? 'bg-gray-100 text-gray-900 font-semibold opacity-100 cursor-default' : ''}`}
                                    placeholder={isOnline ? "Ex: 27638-AA0142-BR-01" : "Sera déduit avec le GPS"}
                                />
                                {errors.id_ouvrage && <span className="text-red-500 text-sm mt-1">{errors.id_ouvrage.message as string}</span>}
                            </div>
                            <div>
                                <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Technicien *</label>
                                <input
                                    {...register("technicien", { required: "Ce champ est obligatoire" })}
                                    disabled={isViewMode}
                                    className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('technicien')} ${isViewMode ? 'bg-gray-100 text-gray-900 font-semibold opacity-100 cursor-default' : ''}`}
                                />
                                {errors.technicien && <span className="text-red-500 text-sm mt-1">{errors.technicien.message as string}</span>}
                            </div>
                            <div>
                                <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Date de récolement *</label>
                                <input
                                    type="date"
                                    disabled={isViewMode}
                                    {...register("date_recolement", { required: "Date requise" })}
                                    className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${getFieldBg('date_recolement')} ${isViewMode ? 'bg-gray-100 text-gray-900 font-semibold opacity-100 cursor-default' : ''}`}
                                />
                            </div>

                            {/* Case Ouvrage non trouvé / Inaccessible (Uniformisée en bleu) */}
                            {(() => {
                                const isNonTrouveeChecked = watch("non_trouvee");

                                return (
                                    <div className={`flex items-center space-x-3 pt-2 col-span-1 md:col-span-2 lg:col-span-4 lg:p-3 lg:rounded-lg lg:border lg:w-fit transition-colors shadow-sm ${isViewMode
                                            ? (isNonTrouveeChecked
                                                ? 'bg-blue-100/90 border-blue-400 text-blue-950 font-semibold shadow-inner'
                                                : 'bg-gray-100/60 border-gray-200 text-gray-400 opacity-60'
                                            )
                                            : 'lg:bg-gray-50 lg:border-gray-100 hover:bg-blue-50 cursor-pointer bg-gray-50'
                                        }`}>
                                        <input
                                            type="checkbox"
                                            id="non_trouvee"
                                            disabled={isViewMode}
                                            {...register("non_trouvee")}
                                            className="w-5 h-5 text-blue-600 rounded border-gray-300 accent-blue-600"
                                        />
                                        <label
                                            htmlFor="non_trouvee"
                                            className={`text-sm lg:text-base font-medium ${isViewMode
                                                    ? (isNonTrouveeChecked ? 'text-blue-950 font-bold cursor-default' : 'text-gray-400 cursor-default')
                                                    : 'text-gray-800 cursor-pointer'
                                                }`}
                                        >
                                            Ouvrage non trouvé / Inaccessible
                                        </label>
                                    </div>
                                );
                            })()}
                        </div>
                    </section>

                    {/* 1 - IDENTIFICATION */}
                    <section className="bg-white p-4 lg:p-8 rounded-xl shadow-sm lg:shadow border border-gray-200 transition-shadow duration-300 hover:shadow-md">
                        <h2 className="text-xl lg:text-2xl font-bold mb-5 text-blue-800 border-b pb-3">1 - Identification de l'ouvrage et localisation</h2>
                        <div className="space-y-6">
                            <div className="p-4 lg:p-5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-4">
                                <div className="flex justify-between items-center">
                                    <div><span className="font-semibold text-gray-800 lg:text-lg">Positionnement cartographique</span></div>
                                    {!isViewMode && (
                                        <button type="button" onClick={handleCaptureLocation} disabled={location.loading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors">
                                            {location.loading ? 'Recherche...' : '📍 Capturer position'}
                                        </button>
                                    )}
                                </div>
                                {activeCoords ? (
                                    <>
                                        <div className="text-sm text-green-700 font-mono bg-green-50 p-2.5 rounded-lg border border-green-200 inline-block shadow-sm">Lat: {activeCoords.lat.toFixed(6)} | Lng: {activeCoords.lon.toFixed(6)}</div>
                                        <div className="h-72 lg:h-96 w-full rounded-xl overflow-hidden border border-gray-300 shadow-inner z-0 relative">
                                            <MapContainer center={[activeCoords.lat, activeCoords.lon]} zoom={18} style={{ height: '100%', width: '100%' }}>
                                                <ZoomIndicator />
                                                <MapRecenter center={[activeCoords.lat, activeCoords.lon]} />
                                                <MapClickHandler onMapClick={(lat: number, lon: number) => fetchAddressAndCadastre(lat, lon)} />
                                                <OfflineMapManager />
                                                <LayersControl position="topright">
                                                    <LayersControl.BaseLayer checked name="Satellite (IGN)"><TileLayer url="https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}" maxZoom={19} /></LayersControl.BaseLayer>
                                                    <LayersControl.Overlay checked name="Cadastre (IGN)"><WMSTileLayer url="https://wxs.ign.fr/essentiels/geoportail/wms?" layers="CADASTRALPARCELS.PARCELS" format="image/png" transparent={true} version="1.3.0" /></LayersControl.Overlay>
                                                </LayersControl>
                                                <Marker position={[activeCoords.lat, activeCoords.lon]} icon={blueIcon}>
                                                    <Popup>Ouvrage sélectionné</Popup>
                                                </Marker>
                                            </MapContainer>
                                        </div>
                                    </>
                                ) : (<div className="text-sm text-gray-500 italic py-3 bg-gray-50 rounded-lg text-center border border-dashed border-gray-300">Aucune position capturée.</div>)}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
                                <div className="lg:col-span-2">
                                    <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Commune {isOnline ? '*' : <span className="text-xs text-blue-600 font-normal italic">(Auto via GPS)</span>}</label>
                                    <input {...register("commune", { required: isOnline ? "Commune requise en ligne" : false })} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('commune')}`} placeholder={!isOnline ? "Laissée vide = auto-complétion" : ""} />
                                </div>
                                <div>
                                    <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">N° voie {!isOnline && '*'}</label>
                                    <input {...register("voie_numero", { required: !isOnline ? "Obligatoire hors-ligne" : false })} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('voie_numero')}`} placeholder={!isOnline ? "Ex: 12 bis" : ""} />
                                </div>
                                <div>
                                    <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Nom voie</label>
                                    <input {...register("voie_nom")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('voie_nom')}`} />
                                </div>
                                <div>
                                    <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Section</label>
                                    <input {...register("section_cadastrale")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('section_cadastrale')}`} />
                                </div>
                                <div>
                                    <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Parcelle</label>
                                    <input {...register("parcelle_cadastrale")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('parcelle_cadastrale')}`} />
                                </div>
                                <div>
                                    <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Domaine d'assise</label>
                                    <select {...register("domaine_assise")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('domaine_assise')}`}>
                                        <option value="">Sélectionner...</option>
                                        <option value="Domaine Public (Trottoir)">Domaine Public (Trottoir)</option>
                                        <option value="Domaine Public (Chaussée)">Domaine Public (Chaussée)</option>
                                        <option value="Domaine Public (Accotement)">Domaine Public (Accotement)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Accessibilité</label>
                                    <select {...register("accessibilite_site")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('accessibilite_site')}`}>
                                        <option value="">Sélectionner...</option>
                                        <option value="Accès libre">Accès libre</option>
                                        <option value="Visibilité masquée (végétation/terre)">Visibilité masquée (végétation/terre)</option>
                                        <option value="Enfouie sous enrobé">Enfouie sous enrobé</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-5 border-t border-gray-200 mt-5">
                                <div className="flex justify-between items-center mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <span className="block text-sm lg:text-base font-bold text-gray-800">Repères fixes du terrain & Distances ({reperesList.length})</span>
                                    {!isViewMode && (
                                        <button type="button" onClick={() => setIsRepereModalOpen(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm lg:text-base font-medium shadow-sm hover:bg-green-700 transition-colors">+ Ajouter un repère</button>
                                    )}
                                </div>
                                <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                                    {reperesList.map((rep: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center p-3.5 bg-white border border-gray-200 rounded-lg text-sm lg:text-base shadow-sm">
                                            <div><span className="font-bold text-blue-800">{rep.point}</span> : {rep.description} — {rep.distance} cm</div>
                                            {!isViewMode && (
                                                <button type="button" onClick={() => handleRemoveRepere(idx)} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded p-1.5 transition-colors font-bold">✕</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 pt-4 items-start">
                                <div className="lg:col-span-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-sm lg:text-sm font-semibold text-gray-700">Observations / Accès</label>
                                        {!isViewMode && (
                                            <button type="button" onClick={() => toggleDictation('observations_localisation')} className={`text-xs lg:text-sm px-3 py-1.5 rounded-full border shadow-sm transition-colors ${listeningField === 'observations_localisation' ? 'bg-red-600 text-white animate-pulse border-red-600' : 'bg-white hover:bg-gray-50'}`}>
                                                🎤 Dicter
                                            </button>
                                        )}
                                    </div>
                                    <textarea {...register("observations_localisation")} rows={4} className={`w-full p-3 lg:p-3 border rounded-lg text-lg lg:text-base outline-none transition-colors ${getFieldBg('observations_localisation')}`} />
                                </div>
                                <div className="lg:col-span-1 pt-3 lg:pt-0">
                                    <label className="block text-sm lg:text-sm font-semibold text-gray-800 mb-2">📸 Photo Situation</label>
                                    {photoPreviews.photo_situation ? (
                                        <div onClick={() => setIsFlagEditModalOpen(true)} className="relative inline-block bg-gray-50 p-1.5 rounded-xl border shadow-sm cursor-pointer hover:ring-4 hover:ring-blue-300 transition-all overflow-hidden group">
                                            <img src={photoPreviews.photo_situation} alt="Situation" className="h-48 w-48 lg:h-56 lg:w-56 object-cover rounded-lg block" />
                                            {showSituationFlag && (
                                                <div style={{ left: `${situationFlagPos.x}%`, top: `${situationFlagPos.y}%`, width: `${flagSize}px`, transform: 'translate(-50%, -100%)' }} className="absolute z-20 pointer-events-none drop-shadow-md">
                                                    <img src="/Drapeaux.png" alt="Drapeau situation" className="w-full h-auto" />
                                                </div>
                                            )}
                                            {!isViewMode && (
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleRemovePhoto('photo_situation'); }} className="absolute top-3 right-3 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-lg z-30 opacity-90 hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">✕</button>
                                            )}
                                        </div>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center h-48 w-48 lg:h-56 lg:w-56 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                                            <span className="text-3xl lg:text-4xl mb-2">📷</span><span className="text-sm font-medium text-blue-700">Importer Photo</span>
                                            <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoCapture('photo_situation', e)} className="hidden" />
                                        </label>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    {!nonTrouvee && (
                        <>
                            {/* 2 - TAMPON */}
                            <section className="bg-white p-4 lg:p-8 rounded-xl shadow-sm lg:shadow border border-gray-200 transition-shadow duration-300 hover:shadow-md">
                                <h2 className="text-xl lg:text-2xl font-bold mb-5 text-blue-800 border-b pb-3">2 - Tampon</h2>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
                                        <div>
                                            <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Type</label>
                                            <select {...register("type_couvercle")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('type_couvercle')}`}>
                                                <option value="">Sélectionner...</option><option value="Tampon Fonte">Tampon Fonte</option><option value="Couvercle PVC">Couvercle PVC</option><option value="Dalle Béton">Dalle Béton</option><option value="Grille">Grille</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">État du tampon</label>
                                            <select {...register("etat_couvercle")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('etat_couvercle')}`}>
                                                <option value="">Sélectionner...</option><option value="Bon état">Bon état</option><option value="Fissuré / Ébréché">Fissuré / Ébréché</option><option value="Cassé à remplacer">Cassé à remplacer</option><option value="Verrouillé / Grippé">Verrouillé / Grippé</option><option value="Manquant">Manquant</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Forme</label>
                                            <select {...register("forme")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('forme')}`}>
                                                <option value="">Sélectionner...</option><option value="Circulaire">Circulaire</option><option value="Carrée">Carrée</option><option value="Rectangulaire">Rectangulaire</option><option value="Spéciale">Spéciale</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Dimensions / Diamètre</label>
                                            <input {...register("dimensions")} list="dimensions-suggestions" autoComplete="off" className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('dimensions')}`} placeholder={formeSelectionnee === 'Circulaire' ? "Ex: Ø 600" : "Ex: 80 x 80"} />
                                            <datalist id="dimensions-suggestions">{existingDimensions.map((dim: string, idx: number) => <option key={idx} value={dim} />)}</datalist>
                                        </div>
                                        {/* Sur PC, l'affleurement prend 2 colonnes au lieu de s'étaler sur 4 */}
                                        <div className="md:col-span-2 lg:col-span-2">
                                            <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Affleurement</label>
                                            <select {...register("affleurement")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('affleurement')}`}>
                                                <option value="">Sélectionner...</option><option value="Affleurant au sol (RAS)">Affleurant au sol (RAS)</option><option value="Surélevé (+1 à +5 cm)">Surélevé (+1 à +5 cm)</option><option value="Enfoncé (-1 à -5 cm)">Enfoncé (-1 à -5 cm)</option><option value="Sous terre">Sous terre</option><option value="sous enrobé">sous enrobé</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-gray-100">
                                        <label className="block text-sm lg:text-sm font-semibold text-gray-800 mb-3">📸 Photo Couvercle</label>
                                        {photoPreviews.photo_couvercle ? (
                                            <div onClick={() => setEnlargedPhotoUrl(photoPreviews.photo_couvercle)} className="relative inline-block bg-gray-50 p-1.5 rounded-xl border shadow-sm cursor-pointer hover:ring-4 hover:ring-blue-300 transition-all group">
                                                <img src={photoPreviews.photo_couvercle} alt="Couvercle" className="h-32 w-32 lg:h-40 lg:w-40 object-cover rounded-lg block" />
                                                {!isViewMode && (
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleRemovePhoto('photo_couvercle'); }} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-lg z-30 opacity-90 hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">✕</button>
                                                )}
                                            </div>
                                        ) : (
                                            <label className="flex flex-col items-center justify-center h-32 w-32 lg:h-40 lg:w-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                                                <span className="text-2xl lg:text-3xl mb-1">📷</span><span className="text-sm font-medium text-blue-700">Importer</span>
                                                <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoCapture('photo_couvercle', e)} className="hidden" />
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {/* 3 - CADRE */}
                            <section className="bg-white p-4 lg:p-8 rounded-xl shadow-sm lg:shadow border border-gray-200 transition-shadow duration-300 hover:shadow-md">
                                <h2 className="text-xl lg:text-2xl font-bold mb-5 text-blue-800 border-b pb-3">3 - Cadre</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
                                    <div className="lg:col-span-2">
                                        <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Matériau</label>
                                        <select {...register("materiau")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('materiau')}`}>
                                            <option value="">Sélectionner...</option><option value="PVC">PVC</option><option value="Béton maçonné">Béton maçonné</option>
                                        </select>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">État du cadre</label>
                                        <select {...register("etat_cadre")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base transition-colors ${getFieldBg('etat_cadre')}`}>
                                            <option value="">Sélectionner...</option><option value="Bon état">Bon état</option><option value="Fissuré / Ébréché">Fissuré / Ébréché</option><option value="Dégradé">Dégradé</option><option value="Cassé">Cassé</option>
                                        </select>
                                    </div>
                                </div>
                            </section>

                            {/* 4 - CONDUITS */}
                            <section className="bg-white p-4 lg:p-8 rounded-xl shadow-sm lg:shadow border border-gray-200 transition-shadow duration-300 hover:shadow-md space-y-6">
                                <h2 className="text-xl lg:text-2xl font-bold text-blue-800 border-b pb-3">4 - Conduits</h2>
                                {/* Grille optimisée à 3 colonnes sur PC pour 6 éléments = 2 lignes propres */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
                                    <div><label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Matériau</label><select {...register("materiau_conduit")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-base lg:text-base bg-white ${getFieldBg('materiau_conduit')}`}><option value="">Sélectionner...</option><option value="PVC">PVC</option><option value="Béton">Béton</option><option value="Fonte">Fonte</option><option value="Grès">Grès</option><option value="Maçonné">Maçonné</option></select></div>
                                    <div><label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Profondeur (cm)</label><input type="number" {...register("profondeur_cm", { valueAsNumber: true })} className={`w-full p-3 lg:p-2.5 border rounded-lg text-base lg:text-base bg-white ${getFieldBg('profondeur_cm')}`} /></div>
                                    <div><label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Écoulement</label><select {...register("ecoulement")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base bg-white ${getFieldBg('ecoulement')}`}><option value="">Sélectionner...</option><option value="Fluide et normal">Fluide et normal</option><option value="Stagnation légère">Stagnation légère</option><option value="Engorgement / Obstrué">Engorgement / Obstrué</option><option value="Refoulement constaté">Refoulement constaté</option></select></div>
                                    <div><label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">État parois</label><select {...register("etat_parois")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base bg-white ${getFieldBg('etat_parois')}`}><option value="">Sélectionner...</option><option value="Bon état étanche">Bon état étanche</option><option value="Déboîtement">Déboîtement</option><option value="Corrosion">Corrosion</option><option value="Fracture">Fracture</option><option value="Fissures">Fissures</option><option value="Racines">Racines</option></select></div>
                                    <div><label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Dépôts</label><select {...register("depots")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base bg-white ${getFieldBg('depots')}`}><option value="">Sélectionner...</option><option value="Aucun dépôt">Aucun dépôt</option><option value="Graisses">Graisses</option><option value="Sables / Boues">Sables / Boues</option><option value="Lingettes / Déchets">Lingettes / Déchets</option><option value="Tartre / Calcaire">Tartre / Calcaire</option></select></div>
                                    <div><label className="block text-sm lg:text-sm font-semibold text-gray-700 mb-1.5">Eaux parasites</label><select {...register("eaux_parasites")} className={`w-full p-3 lg:p-2.5 border rounded-lg text-lg lg:text-base bg-white ${getFieldBg('eaux_parasites')}`}><option value="">Sélectionner...</option><option value="Aucune infiltration">Aucune infiltration</option><option value="Infiltration eau claire (nappe)">Infiltration eau claire (nappe)</option><option value="Apport eau pluviale parasite">Apport eau pluviale parasite</option></select></div>
                                </div>
                                <div className="pt-2">
                                    <div className="flex justify-between items-center mb-2"><label className="block text-sm lg:text-sm font-semibold text-gray-700">Observations</label>
                                        {!isViewMode && (
                                            <button type="button" onClick={() => toggleDictation('observations_physiques')} className={`text-xs lg:text-sm px-3 py-1.5 rounded-full border shadow-sm transition-colors ${listeningField === 'observations_physiques' ? 'bg-red-600 text-white animate-pulse border-red-600' : 'bg-white hover:bg-gray-50'}`}>
                                                🎤 Dicter
                                            </button>
                                        )}
                                    </div>
                                    <textarea {...register("observations_physiques")} rows={3} className={`w-full p-3 lg:p-3 border rounded-lg text-base lg:text-base ${getFieldBg('observations_physiques')}`} />
                                </div>
                                <div className="pt-5 border-t border-gray-100">
                                    <label className="block text-sm lg:text-sm font-semibold text-gray-800 mb-3">📸 Photos Intérieur</label>
                                    <div className="flex flex-wrap gap-4">
                                        {photoPreviews.photos_interieur.map((preview: string, idx: number) => (
                                            <div key={idx} onClick={() => setEnlargedPhotoUrl(preview)} className="relative bg-gray-50 p-1.5 rounded-xl border shadow-sm cursor-pointer hover:ring-4 hover:ring-blue-300 transition-all group">
                                                <img src={preview} alt={`Intérieur ${idx + 1}`} className="h-28 w-28 lg:h-36 lg:w-36 object-cover rounded-lg block" />
                                                {!isViewMode && (
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleRemovePhoto('photos_interieur', idx); }} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold shadow-lg z-30 opacity-90 hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">✕</button>
                                                )}
                                            </div>
                                        ))}

                                        {/* On masque le bouton d'ajout si on est en mode affichage */}
                                        {!isViewMode && (
                                            <label className="flex flex-col items-center justify-center h-28 w-28 lg:h-36 lg:w-36 border-2 border-dashed border-blue-200 rounded-xl cursor-pointer bg-blue-50/50 hover:bg-blue-100 transition-colors">
                                                <span className="text-2xl lg:text-3xl mb-1">📷</span>
                                                <input type="file" accept="image/*" multiple capture="environment" onChange={(e) => handlePhotoCapture('photos_interieur', e)} className="hidden" />
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {/* 5 - ACTIONS */}
                            <section className="bg-white p-4 lg:p-8 rounded-xl shadow-sm lg:shadow border border-gray-200 transition-shadow duration-300 hover:shadow-md">
                                <h2 className="text-xl lg:text-2xl font-bold mb-5 text-blue-800 border-b pb-3">5 - Action(s) préconisée(s)</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
                                    {["R.A.S.", "Curage / Nettoyage", "Débouchage / Dégorgement", "Remplacement du tampon", "Réparation du cadre", "Remise à niveau de l'arase", "Traitement des infiltrations", "Dégagement d'accès", "Reprise de raccordement", "Traitement anti-corrosion / Réfection", "Dégrippage / Déblocage"].map((action, idx) => {
                                        // Vérifie si l'action fait partie des éléments cochés
                                        const isChecked = watch("actions_preconisees")?.includes(action);

                                        return (
                                            <label
                                                key={idx}
                                                className={`flex items-center gap-3 p-3 lg:p-3 border rounded-lg transition-colors shadow-sm ${isViewMode
                                                        ? (isChecked
                                                            ? 'bg-blue-100/90 border-blue-400 text-blue-950 font-semibold shadow-inner' // Style bien visible si coché en affichage
                                                            : 'bg-gray-100/60 border-gray-200 text-gray-400 opacity-60'   // Grisé discret si non coché en affichage
                                                        )
                                                        : 'hover:bg-blue-50 cursor-pointer bg-gray-50' // Style normal en mode saisie/édition
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    value={action}
                                                    disabled={isViewMode} // Désactive l'interaction en mode affichage
                                                    {...register("actions_preconisees")}
                                                    className="w-5 h-5 lg:w-4 lg:h-4 text-blue-600 rounded border-gray-300 accent-blue-600"
                                                />
                                                <span className={`font-medium lg:text-sm ${isViewMode ? (isChecked ? 'text-blue-950 font-bold' : 'text-gray-400') : 'text-gray-800'}`}>
                                                    {action}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                                <div className="pt-6">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-sm lg:text-sm font-semibold text-gray-700">Précisions</label>
                                        {!isViewMode && (
                                            <button type="button" onClick={() => toggleDictation('action_precision')} className={`text-sm lg:text-sm px-3 py-1.5 rounded-full border shadow-sm transition-colors ${listeningField === 'action_precision' ? 'bg-red-600 text-white animate-pulse border-red-600' : 'bg-white hover:bg-gray-50'}`}>
                                                🎤 Dicter
                                            </button>
                                        )}
                                    </div>
                                    <textarea {...register("action_precision")} rows={3} className={`w-full p-3 lg:p-3 border rounded-lg text-lg lg:text-base outline-none transition-colors ${getFieldBg('action_precision')}`} />
                                </div>
                            </section>
                        </>
                    )}
                </fieldset> {/* FIN DU FIELDSET QUI VERROUILLE LE FORMULAIRE */}

                {/* Barre d'action fixe en bas avec arrière-plan flouté et bouton centré sur grand écran */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] z-40">
                    <div className="max-w-6xl mx-auto flex justify-center">
                        {isViewMode ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault(); // 👈 Stoppe net toute propagation ou action par défaut
                                    setIsViewMode(false);
                                }}
                                className="w-full md:w-3/4 lg:w-1/2 py-4 lg:py-3 rounded-xl text-xl lg:text-lg font-bold text-white shadow-md bg-blue-600 hover:bg-blue-700 transition-colors"
                            >
                                ✏️ Passer en mode modification
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={`w-full md:w-3/4 lg:w-1/2 py-4 lg:py-3 rounded-xl text-xl lg:text-lg font-bold text-white shadow-md transition-colors ${isSubmitting ? 'bg-blue-400 animate-pulse' : 'bg-blue-700 hover:bg-blue-800'}`}
                            >
                                {isSubmitting ? '⏳ Traitement...' : (editId ? 'Sauvegarder' : 'Enregistrer')}
                            </button>
                        )}
                    </div>
                </div>
            </form>

            <RepereModal isOpen={isRepereModalOpen} onClose={() => setIsRepereModalOpen(false)} currentRepere={currentRepere} setCurrentRepere={setCurrentRepere} onAddRepere={handleAddRepere} toggleDictation={toggleDictation} />
            <FlagEditModal isOpen={isFlagEditModalOpen} onClose={() => setIsFlagEditModalOpen(false)} photoPreviewUrl={photoPreviews.photo_situation} showSituationFlag={showSituationFlag} setShowSituationFlag={setShowSituationFlag} flagSize={flagSize} setFlagSize={setFlagSize} situationFlagPos={situationFlagPos} situationImageRef={situationImageRef} handlePointerDown={handlePointerDown} handlePointerMove={handlePointerMove} handlePointerUp={handlePointerUp} isViewMode={isViewMode} />

            {enlargedPhotoUrl && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 lg:p-12" onClick={() => setEnlargedPhotoUrl(null)}>
                    <div className="relative max-w-full max-h-full flex items-center justify-center">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setEnlargedPhotoUrl(null); }} className="absolute -top-4 -right-4 lg:-top-6 lg:-right-6 bg-red-600 hover:bg-red-700 text-white rounded-full w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center font-bold text-xl shadow-lg z-[70] transition-colors">✕</button>
                        <img src={enlargedPhotoUrl} alt="Agrandissement" className="max-w-full max-h-[90vh] object-contain rounded-lg lg:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
                    </div>
                </div>
            )}
        </>
    );
};