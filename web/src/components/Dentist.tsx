import { ArrowDown, Check } from 'iconoir-react';
import { useCopy } from '../i18n/useCopy';

export function Dentist() {
  const { c } = useCopy();
  return (
    <section className="doc" id="about" aria-labelledby="about-h">
      <div className="wrap doc-grid">
        <div className="doc-head">
          <div className="doc-title">
            <h2 className="h2" id="about-h" data-reveal="text">
              {c.dentist.title}
            </h2>
            <div className="name-row" data-reveal="text">
              <h3 className="h3">{c.dentist.name}</h3>
              <p className="soft">{c.dentist.role}</p>
            </div>
          </div>
          <p className="lead" data-reveal="text">
            {c.dentist.bio}
          </p>
        </div>
        <div className="ph portrait" data-reveal="photo">
          <img src="/images/dr-chan.jpg" alt={c.dentist.alt} loading="lazy" />
        </div>
        <div className="doc-side">
          <ul className="creds">
            {c.dentist.creds.map((cred) => (
              <li key={cred} data-reveal="text">
                <Check aria-hidden />
                <span>{cred}</span>
              </li>
            ))}
          </ul>
          <a className="btn dark go-down" href="#booking" data-reveal="text">
            {c.dentist.book}
            <ArrowDown aria-hidden />
          </a>
          <div className="ph doc-small" data-reveal="photo">
            <img src="/images/dr-treatment.jpg" alt={c.dentist.altTreatment} loading="lazy" />
          </div>
        </div>
      </div>
    </section>
  );
}
