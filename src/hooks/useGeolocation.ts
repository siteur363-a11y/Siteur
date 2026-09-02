import { useState, useEffect } from 'react';

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null; // Précision en mètres
  error: string | null;
  loading: boolean;
}

export function useGeolocation() {
  const [location, setLocation] = useState<LocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: false,
  });

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocation((prev) => ({ ...prev, error: "La géolocalisation n'est pas supportée par ce navigateur." }));
      return;
    }

    setLocation((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          error: null,
          loading: false,
        });
      },
      (error) => {
        let errorMessage = "Erreur inconnue lors de la géolocalisation.";
        if (error.code === 1) errorMessage = "L'accès à la position a été refusé.";
        if (error.code === 2) errorMessage = "Position indisponible (Pas de signal GPS).";
        if (error.code === 3) errorMessage = "Délai d'attente dépassé.";
        
        setLocation((prev) => ({ ...prev, error: errorMessage, loading: false }));
      },
      {
        enableHighAccuracy: true, // Force le GPS
        timeout: 15000,           // Attend jusqu'à 15s pour un fix GPS
        maximumAge: 0             // Ne pas utiliser le cache, forcer une nouvelle mesure
      }
    );
  };

  return { location, requestLocation };
}