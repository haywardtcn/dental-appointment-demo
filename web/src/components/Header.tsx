import { useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'iconoir-react';
import { useCopy } from '../i18n/useCopy';
import { lockScroll } from '../lib/motion';
import { LangSwitch } from './LangSwitch';

/**
 * Over the hero the header is transparent with white type. Past the hero the logo leaves on desktop,
 * and the nav pill, Book and the language switch float. Book stays hidden while the hero's own Book button is on screen.
 */
export function Header() {
  const { c } = useCopy();
  const navRef = useRef<HTMLDivElement>(null);
  const [overHero, setOverHero] = useState(true);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const measure = () => {
      const h = navRef.current?.offsetHeight ?? 0;
      const hero = document.querySelector('.hero');
      const actions = document.querySelector('.hero .actions');
      if (hero) setOverHero(hero.getBoundingClientRect().bottom > h);
      if (actions) setHeroCtaVisible(actions.getBoundingClientRect().bottom > h);
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    lockScroll(true);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    const onWide = () => window.innerWidth > 900 && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onWide);
    return () => {
      lockScroll(false);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onWide);
    };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);
  // The open menu covers the hero, so its Book button is out of reach and the header's takes over.
  const hideCta = heroCtaVisible && !menuOpen;
  const cls = ['hdr', !overHero && 'solid', menuOpen && 'open'].filter(Boolean).join(' ');

  return (
    <header className={cls}>
      <div className="nav" ref={navRef}>
        <a className="mark" href="#top" onClick={close}>
          {c.brand}
        </a>
        <nav className="links" aria-label={c.navLabel}>
          <a href="#environment">{c.nav.clinic}</a>
          <a href="#services">{c.nav.services}</a>
          <a href="#about">{c.nav.dentist}</a>
        </nav>
        <div className="hdr-end">
          <a
            className={`btn sm dark go-down hcta${hideCta ? ' is-hidden' : ''}`}
            href="#booking"
            aria-hidden={hideCta}
            tabIndex={hideCta ? -1 : 0}
            onClick={close}
          >
            {c.bookShort}
            <ArrowDown aria-hidden />
          </a>
          <LangSwitch />
          <button
            className="burger"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="m-menu"
            aria-label={menuOpen ? c.menuClose : c.menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="mmenu" id="m-menu" aria-label={c.navLabel}>
          <a className="mlink" href="#environment" onClick={close}>
            {c.nav.clinic}
          </a>
          <a className="mlink" href="#services" onClick={close}>
            {c.nav.services}
          </a>
          <a className="mlink" href="#about" onClick={close}>
            {c.nav.dentist}
          </a>
          <LangSwitch />
        </nav>
      )}
    </header>
  );
}
