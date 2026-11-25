import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhHK from './zh-HK';
import en from './en';

export const LANGS = ['zh-HK', 'en'] as const;
export type Lang = (typeof LANGS)[number];

const STORE_KEY = 'clearlight-lang';

function savedLang(): Lang {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === 'en' || v === 'zh-HK') return v;
  } catch {
    // Storage can be blocked; Chinese is the default.
  }
  return 'zh-HK';
}

i18n.use(initReactI18next).init({
  resources: { 'zh-HK': { translation: zhHK }, en: { translation: en } },
  lng: savedLang(),
  fallbackLng: 'zh-HK',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORE_KEY, lng);
  } catch {
    // Not remembered when storage is blocked.
  }
});
document.documentElement.lang = i18n.language;

export default i18n;
