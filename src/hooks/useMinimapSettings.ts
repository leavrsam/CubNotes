import { useState, useEffect } from 'react';

export function useMinimapSettings() {
  const [showMinimap, setShowMinimapState] = useState(true);

  useEffect(() => {
    // Only access localStorage on the client
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('motif-show-minimap') ?? localStorage.getItem('cubnotes-show-minimap');
      if (saved !== null) {
        setShowMinimapState(saved === 'true');
      }
    }
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'motif-show-minimap' || e.key === 'cubnotes-show-minimap') {
        setShowMinimapState(e.newValue === 'true');
      }
    };
    
    const handleLocalChange = () => {
      const saved = localStorage.getItem('motif-show-minimap') ?? localStorage.getItem('cubnotes-show-minimap');
      if (saved !== null) {
        setShowMinimapState(saved === 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('motif-minimap-toggle', handleLocalChange);
    window.addEventListener('cubnotes-minimap-toggle', handleLocalChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('motif-minimap-toggle', handleLocalChange);
      window.removeEventListener('cubnotes-minimap-toggle', handleLocalChange);
    };
  }, []);

  const setShowMinimap = (value: boolean) => {
    setShowMinimapState(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('motif-show-minimap', String(value));
      window.dispatchEvent(new Event('motif-minimap-toggle'));
    }
  };

  return { showMinimap, setShowMinimap };
}
