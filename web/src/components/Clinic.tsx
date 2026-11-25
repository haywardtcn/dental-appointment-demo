import { MapPin } from 'iconoir-react';
import { useCopy } from '../i18n/useCopy';

export function Clinic() {
  const { c } = useCopy();
  return (
    <section className="env" id="environment" aria-labelledby="env-h">
      <div className="wrap">
        <div className="env-stage">
          <div className="env-text">
            <h2 className="h2" id="env-h" data-reveal="text">
              {c.clinic.title}
            </h2>
            <p className="lead" data-reveal="text">
              {c.clinic.lead}
            </p>
            <a className="btn dark sm go-pin" href="#address" data-reveal="text">
              <MapPin aria-hidden />
              {c.clinic.link}
            </a>
          </div>
          <div className="ph env-a" data-reveal="photo">
            <img src="/images/clinic-mirror.jpg" alt={c.clinic.altMirror} loading="lazy" />
          </div>
          <div className="ph env-b" data-reveal="photo">
            <img src="/images/clinic-consult.jpg" alt={c.clinic.altConsult} loading="lazy" />
          </div>
          <div className="ph env-c" data-reveal="photo">
            <img src="/images/clinic-chair.jpg" alt={c.clinic.altChair} loading="lazy" />
          </div>
          <p className="env-fact" data-reveal="text">
            <strong>{c.clinic.factBig}</strong>
            <span className="soft">{c.clinic.factNote}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
