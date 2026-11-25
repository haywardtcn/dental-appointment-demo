import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Copy } from './zh-HK';
import type { Lang } from '.';
import { clinicStatus } from '../lib/hours';

/** The current language's copy as a typed object, plus `t` for strings with values filled in. */
export function useCopy() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'zh-HK') as Lang;
  const c = i18n.getResourceBundle(lang, 'translation') as Copy;
  return { c, t, lang, setLang: (l: Lang) => i18n.changeLanguage(l) };
}

/** Open or closed right now, refreshed each minute. */
export function useClinicStatus() {
  const { t, lang } = useCopy();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  void now;
  return clinicStatus(lang, t);
}
