import { ArrowUpRight, Mail, MapPin, Phone } from 'iconoir-react';
import { useCopy } from '../i18n/useCopy';

export function Footer() {
  const { c } = useCopy();
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-top">
          <div className="foot-brand" data-reveal="text">
            <a className="mark" href="#top">
              {c.brand}
            </a>
            <p className="soft">{c.footer.line}</p>
          </div>
          <div className="foot-col" data-reveal="text">
            <h3>{c.footer.clinic}</h3>
            <a href="#environment">{c.nav.clinic}</a>
            <a href="#services">{c.nav.services}</a>
            <a href="#about">{c.nav.dentist}</a>
            <a href="#booking">{c.bookShort}</a>
          </div>
          <div className="foot-col" data-reveal="text">
            <h3>{c.contact.title}</h3>
            <a className="go-call" href="tel:+85228880000">
              <Phone aria-hidden />
              2888 0000
            </a>
            <a href="mailto:hello@clearlight-dental.example">
              <Mail aria-hidden />
              {c.footer.email}
            </a>
            <a className="go-pin" href="#address">
              <MapPin aria-hidden />
              {c.footer.where}
            </a>
          </div>
          <div className="foot-col" data-reveal="text">
            <h3>{c.footer.more}</h3>
            <a className="go-out" href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer">
              Facebook
              <ArrowUpRight aria-hidden />
            </a>
            <a href="#privacy">{c.footer.privacy}</a>
          </div>
        </div>
        <div className="foot-meta">
          <span>{c.footer.copy}</span>
          <span>{c.footer.credit}</span>
        </div>
      </div>
    </footer>
  );
}
