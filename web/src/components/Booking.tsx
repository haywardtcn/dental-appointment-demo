import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Mail, MapPin, Phone } from 'iconoir-react';
import { useClinicStatus, useCopy } from '../i18n/useCopy';
import { bookingDates, hoursRows, slotsFor } from '../lib/hours';
import { SERVICE_KEYS, type ServiceKey } from './Services';

type Form = { name: string; phone: string; date: string; time: string; consent: boolean };
type Field = keyof Form;
const EMPTY: Form = { name: '', phone: '', date: '', time: '', consent: false };
const FIELD_ORDER: Field[] = ['name', 'phone', 'date', 'time', 'consent'];
const HK_PHONE = /^[2-9]\d{7}$/;

type Props = { service: ServiceKey | ''; onServiceChange: (s: ServiceKey | '') => void };

/** Demo form: it validates and confirms on screen. Real holds and slots come later from the booking API (plan.md §11). */
export function Booking({ service, onServiceChange }: Props) {
  const { c, t, lang } = useCopy();
  const status = useClinicStatus();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [sent, setSent] = useState(false);

  // Messages are cleared on a language switch rather than left in the old language.
  useEffect(() => setErrors({}), [lang]);

  const dates = useMemo(() => bookingDates(lang), [lang]);
  const chosen = dates.find((d) => d.value === form.date);
  const slots = chosen ? slotsFor(chosen.day, lang) : [];
  const slot = slots.find((s) => s.value === form.time);

  const set = <K extends Field>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'date' ? { time: '' } : {}) }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const b = c.booking;
    const next: Partial<Record<Field, string>> = {};
    if (!form.name.trim()) next.name = b.errName;
    if (!HK_PHONE.test(form.phone.replace(/\s/g, ''))) next.phone = b.errPhone;
    if (!form.date) next.date = b.errDate;
    if (!form.time) next.time = b.errTime;
    if (!form.consent) next.consent = b.errConsent;
    setErrors(next);
    const first = FIELD_ORDER.find((k) => next[k]);
    // Focus the first field to fix; its message is read out through aria-describedby.
    if (first) document.getElementById(`f-${first}`)?.focus();
    else setSent(true);
  };

  const again = () => {
    setForm(EMPTY);
    onServiceChange('');
    setErrors({});
    setSent(false);
  };

  const err = (key: Field) => (
    <p className={key === 'consent' ? 'err consent-err' : 'err'} id={`e-${key}`}>
      {errors[key]}
    </p>
  );

  return (
    <section className="book panel" id="booking" aria-labelledby="book-h">
      <div className="wrap book-grid">
        <div>
          <h2 className="h2" id="book-h" data-reveal="text">
            {c.booking.title}
          </h2>
          <p className="lead book-intro" data-reveal="text">
            {c.booking.intro}
          </p>

          {sent ? (
            <div className="done" role="status">
              <h3 className="h3">{c.booking.doneTitle}</h3>
              <p className="lead">
                {t('booking.doneText', { phone: form.phone, date: chosen?.label, time: slot?.label })}
              </p>
              <button className="btn sm light" type="button" onClick={again}>
                {c.booking.again}
              </button>
            </div>
          ) : (
            <form className="form" noValidate onSubmit={submit}>
              <div className="field" data-reveal="text">
                <label htmlFor="f-name">{c.booking.name}</label>
                <input
                  id="f-name"
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  aria-invalid={!!errors.name}
                  aria-describedby="e-name"
                />
                {err('name')}
              </div>
              <div className="field" data-reveal="text">
                <label htmlFor="f-phone">{c.booking.phone}</label>
                <input
                  id="f-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  aria-invalid={!!errors.phone}
                  aria-describedby="e-phone"
                />
                {err('phone')}
              </div>
              <div className="field full" data-reveal="text">
                <label htmlFor="f-service">{c.booking.service}</label>
                <select id="f-service" value={service} onChange={(e) => onServiceChange(e.target.value as ServiceKey | '')}>
                  <option value="">{c.booking.serviceAny}</option>
                  {SERVICE_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {c.services.list[k].name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" data-reveal="text">
                <label htmlFor="f-date">{c.booking.date}</label>
                <select
                  id="f-date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  aria-invalid={!!errors.date}
                  aria-describedby="e-date"
                >
                  <option value="">{c.booking.choose}</option>
                  {dates.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {err('date')}
              </div>
              <div className="field" data-reveal="text">
                <label htmlFor="f-time">{c.booking.time}</label>
                <select
                  id="f-time"
                  value={form.time}
                  onChange={(e) => set('time', e.target.value)}
                  aria-invalid={!!errors.time}
                  aria-describedby="e-time"
                >
                  <option value="">{chosen ? c.booking.choose : c.booking.timeFirst}</option>
                  {slots.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {err('time')}
              </div>
              <label className="consent" data-reveal="text">
                <input
                  id="f-consent"
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => set('consent', e.target.checked)}
                  aria-invalid={!!errors.consent}
                  aria-describedby="e-consent"
                />
                <span>{c.booking.consent}</span>
              </label>
              {err('consent')}
              <div className="form-foot" data-reveal="text">
                <button className="btn light" type="submit">
                  {c.booking.submit}
                </button>
                <p className="small">{c.booking.note}</p>
              </div>
            </form>
          )}
        </div>

        <div className="contact" id="address">
          <h3 className="h3" data-reveal="text">
            {c.contact.title}
          </h3>
          <p data-reveal="text">
            <span className="dot" style={{ background: status.open ? 'var(--open)' : '#8E8780' }} aria-hidden />
            {status.text}
          </p>
          <div className="contact-list" data-reveal="text">
            <a className="go-call" href="tel:+85228880000">
              <Phone aria-hidden />
              <span>+852 2888 0000</span>
            </a>
            <a href="mailto:hello@clearlight-dental.example">
              <Mail aria-hidden />
              <span>hello@clearlight-dental.example</span>
            </a>
            <a
              className="go-pin"
              href="https://www.google.com/maps/search/?api=1&query=Causeway+Bay+MTR+Station"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin aria-hidden />
              <span>{c.contact.address}</span>
            </a>
          </div>
          <table className="hours" data-reveal="text">
            <caption>{c.contact.hours}</caption>
            <tbody>
              {hoursRows(lang, t).map((r) => (
                <tr key={r.key} className={r.today ? 'today' : undefined}>
                  <th scope="row">{r.day}</th>
                  <td>{r.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
