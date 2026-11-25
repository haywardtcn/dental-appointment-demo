import { useState } from 'react';
import { ArrowDown, NavArrowDown } from 'iconoir-react';
import { useCopy } from '../i18n/useCopy';

export const SERVICE_KEYS = ['surgery', 'implant', 'cosmetic', 'family'] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

const PHOTO: Record<ServiceKey, { src: string; position: string }> = {
  surgery: { src: '/images/svc-surgery.jpg', position: '50% 55%' },
  implant: { src: '/images/svc-implant.jpg', position: '50% 50%' },
  cosmetic: { src: '/images/svc-cosmetic.jpg', position: '55% 50%' },
  family: { src: '/images/svc-family.jpg', position: '50% 30%' },
};

/** Four photo cards in a row on desktop; on phones a list of names, each opening to its details. */
export function Services({ onPick }: { onPick: (key: ServiceKey) => void }) {
  const { c } = useCopy();
  const [open, setOpen] = useState<ServiceKey | null>(null);

  return (
    <section className="svc panel" id="services" aria-labelledby="svc-h">
      <div className="wrap">
        <div className="svc-head">
          <h2 className="h2" id="svc-h" data-reveal="text">
            {c.services.title}
          </h2>
          <p className="lead" data-reveal="text">
            {c.services.intro}
          </p>
        </div>
        <ul className="cards">
          {SERVICE_KEYS.map((key) => {
            const s = c.services.list[key];
            const isOpen = open === key;
            return (
              <li className="card" key={key}>
                <div className="ph" data-reveal="photo">
                  <img src={PHOTO[key].src} alt={s.alt} style={{ objectPosition: PHOTO[key].position }} loading="lazy" />
                </div>
                <h3 className="h3 card-title" data-reveal="text">
                  {s.name}
                </h3>
                <button
                  className="card-toggle"
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`svc-${key}`}
                  onClick={() => setOpen(isOpen ? null : key)}
                  data-reveal="text"
                >
                  {s.name}
                  <NavArrowDown className="chev" aria-hidden />
                </button>
                <div className={isOpen ? 'card-body is-open' : 'card-body'} id={`svc-${key}`} data-reveal="text">
                  <p>{s.desc}</p>
                  <p className="card-items">{s.items}</p>
                  <a
                    className="card-book"
                    href="#booking"
                    onClick={() => onPick(key)}
                    aria-label={`${c.services.bookThis} ${s.name}`}
                  >
                    {c.services.bookThis}
                    <ArrowDown aria-hidden />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
