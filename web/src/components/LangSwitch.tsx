import { useCopy } from '../i18n/useCopy';

export function LangSwitch() {
  const { c, lang, setLang } = useCopy();
  return (
    <div className="lang" role="group" aria-label={c.langLabel}>
      <button type="button" lang="zh-HK" aria-pressed={lang === 'zh-HK'} onClick={() => setLang('zh-HK')}>
        繁
      </button>
      <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
        EN
      </button>
    </div>
  );
}
