import { ArrowDown, Phone } from 'iconoir-react';
import { useClinicStatus, useCopy } from '../i18n/useCopy';

export const HERO_SRC = '/images/hero.jpg';

export function Hero() {
  const { c } = useCopy();
  const status = useClinicStatus();
  return (
    <section className="hero" id="top">
      <img className="hero-photo" src={HERO_SRC} alt={c.hero.alt} />
      <div className="hero-shade" />
      <div className="hero-copy">
        <h1 className="h1">
          <span>{c.hero.line1}</span>
          <span>{c.hero.line2}</span>
        </h1>
        <p className="hero-sub">{c.hero.sub}</p>
        <div className="actions">
          <a className="btn light go-down" href="#booking">
            {c.hero.book}
            <ArrowDown aria-hidden />
          </a>
          <a className="btn ghost go-call" href="tel:+85228880000">
            <Phone aria-hidden />
            {c.hero.call}
          </a>
        </div>
        <p className="status">
          <span className="dot" style={{ background: status.open ? 'var(--open)' : '#C9C1B8' }} aria-hidden />
          {status.text}
        </p>
      </div>
    </section>
  );
}
