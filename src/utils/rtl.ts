/**
 * RTL (Right-to-Left) Language Utilities
 * Provides detection and handling for RTL languages like Arabic and Hebrew
 */

export const RTL_LANGUAGES = ['ar', 'he', 'iw', 'fa', 'ur'] as const;

export type RTLLanguage = (typeof RTL_LANGUAGES)[number];

/**
 * Checks if a given language code is an RTL language
 * @param lang - The language code (e.g., 'ar', 'en', 'ar-SA')
 * @returns true if the language is RTL
 */
export function isRTLLanguage(lang: string): boolean {
  const baseLang = lang.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.includes(baseLang as RTLLanguage);
}

/**
 * Gets the text direction for a given language
 * @param lang - The language code
 * @returns 'rtl' for RTL languages, 'ltr' otherwise
 */
export function getDirection(lang: string): 'ltr' | 'rtl' {
  return isRTLLanguage(lang) ? 'rtl' : 'ltr';
}

/**
 * Returns the appropriate value based on the current direction
 * @param isRTL - Whether the current direction is RTL
 * @param rtlValue - Value to return for RTL
 * @param ltrValue - Value to return for LTR
 */
export function directionalValue<T>(isRTL: boolean, rtlValue: T, ltrValue: T): T {
  return isRTL ? rtlValue : ltrValue;
}
