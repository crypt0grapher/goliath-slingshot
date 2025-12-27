import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getDirection } from '../utils/rtl';

interface DirectionContextType {
  direction: 'ltr' | 'rtl';
  isRTL: boolean;
}

const DirectionContext = createContext<DirectionContextType>({
  direction: 'ltr',
  isRTL: false,
});

export function DirectionProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(() => getDirection(i18n.language));

  const updateDirection = useCallback((lang: string) => {
    const newDirection = getDirection(lang);
    setDirection(newDirection);
    document.documentElement.setAttribute('dir', newDirection);
    document.documentElement.setAttribute('lang', lang);
  }, []);

  useEffect(() => {
    // Set initial direction
    updateDirection(i18n.language);

    // Listen for language changes
    const handleLanguageChanged = (lang: string) => {
      updateDirection(lang);
    };

    i18n.on('languageChanged', handleLanguageChanged);

    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n, updateDirection]);

  return (
    <DirectionContext.Provider value={{ direction, isRTL: direction === 'rtl' }}>
      {children}
    </DirectionContext.Provider>
  );
}

export function useDirection(): DirectionContextType {
  return useContext(DirectionContext);
}

export default DirectionContext;
