import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import XHR from 'i18next-xhr-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

// Dev-only: Check for ?lang= query parameter override
const getLanguageOverride = (): string | undefined => {
  if (process.env.NODE_ENV !== 'production') {
    const params = new URLSearchParams(window.location.search);
    const langOverride = params.get('lang');
    if (langOverride) {
      console.log(`[i18n] Dev language override: ${langOverride}`);
      return langOverride;
    }
  }
  return undefined;
};

const languageOverride = getLanguageOverride();

i18next
  .use(XHR)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: `./locales/{{lng}}.json`,
    },
    react: {
      useSuspense: true,
    },
    lng: languageOverride, // Use override if set, otherwise let detector handle it
    fallbackLng: 'en',
    preload: ['en'],
    keySeparator: false,
    interpolation: { escapeValue: false },
    detection: {
      // Prioritize query string in dev mode
      order: ['querystring', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lang',
    },
  });

export default i18next;
