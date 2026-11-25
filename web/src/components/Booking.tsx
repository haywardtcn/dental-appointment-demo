import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Mail, MapPin, Phone } from 'iconoir-react';
import { useClinicStatus, useCopy } from '../i18n/useCopy';
import { ApiError, api, type Confirmed, type Day, type Hold, type ServicesResponse } from '../lib/api';
import { dateLabel, hoursRows, timeLabel } from '../lib/hours';
import { scrollToId } from '../lib/motion';
import { SERVICE_KEYS, type ServiceKey } from './Services';

export const CLINIC_PHONE = '+852 2888 0000';

type Details = { name: string; phone: string; email: string; note: string; consent: boolean };
type Field = keyof Details | 'date' | 'time';
const EMPTY: Details = { name: '', phone: '', email: '', note: '', consent: false };
const DETAIL_ORDER: Field[] = ['name', 'phone', 'email', 'consent'];
const HK_PHONE = /^[2-9]\d{7}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = 'pick' | 'details' | 'done';
type Props = { service: ServiceKey | ''; onServiceChange: (s: ServiceKey | '') => void };

const bareHkPhone = (v: string) => v.replace(/[\s-]/g, '').replace(/^\+?852/, '');
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const newKey = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Two steps (plan.md §5): pick a time, which holds it for 10 minutes on the server, then fill in details and confirm.
 * "Not sure" on the service list books a general check-up.
 */
export function Booking({ service, onServiceChange }: Props) {
  const { c, t, lang } = useCopy();
  const b = c.booking;
  const status = useClinicStatus();
  const slug = service || 'checkup';

  const [catalog, setCatalog] = useState<ServicesResponse | null>(null);
  const [doctor, setDoctor] = useState('');
  const [days, setDays] = useState<Day[] | null>(null);
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [phase, setPhase] = useState<Phase>('pick');
  const [hold, setHold] = useState<Hold | null>(null);
  const [left, setLeft] = useState(0);
  const [form, setForm] = useState<Details>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<(Confirmed & { email: string }) | null>(null);
  // Server clock minus ours, so the countdown matches the server's expiry.
  const skew = useRef(0);
  const idemKey = useRef(newKey());

  const message = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? err.code : 'NETWORK';
      if (code === 'SLOT_TAKEN') return b.errTaken;
      if (code === 'HOLD_EXPIRED' || code === 'HOLD_NOT_FOUND') return b.errExpired;
      if (code === 'DUPLICATE_BOOKING') return b.errDuplicate;
      if (code === 'RATE_LIMITED') return b.errRate;
      return t('booking.errNetwork', { phone: CLINIC_PHONE });
    },
    [b, t]
  );

  // Messages are cleared on a language switch rather than left in the old language.
  useEffect(() => {
    setErrors({});
    setBanner('');
  }, [lang]);

  useEffect(() => {
    api.services().then(setCatalog, () => setCatalog({ services: [], doctors: [] }));
  }, []);

  const loadDays = useCallback(() => {
    setDays(null);
    api.availability(slug, doctor || undefined).then(
      (a) => setDays(a.days),
      (err) => {
        setDays([]);
        setBanner(message(err));
      }
    );
  }, [slug, doctor, message]);

  useEffect(() => {
    if (phase !== 'pick') return;
    setDate('');
    setStart('');
    loadDays();
  }, [phase, loadDays]);

  const backToPick = useCallback((note = '') => {
    setHold(null);
    setPhase('pick');
    setBanner(note);
  }, []);

  // Countdown; at zero the server has let the time go, so start again.
  useEffect(() => {
    if (!hold) return;
    const tick = () => {
      const ms = new Date(hold.expiresAt).getTime() - (Date.now() + skew.current);
      setLeft(ms);
      if (ms <= 0) backToPick(b.errExpired);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [hold, backToPick, b.errExpired]);

  // Leaving the page gives the time back instead of keeping it for the full 10 minutes.
  useEffect(() => {
    if (!hold) return;
    const leave = () => api.releaseOnLeave(hold.holdId, hold.holdToken);
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [hold]);

  const offered = catalog?.services.find((s) => s.slug === slug);
  const doctors = (catalog?.doctors ?? []).filter((d) => offered?.doctors.includes(d.slug));
  const listed = (days ?? []).filter((d) => d.status !== 'CLOSED');
  const bookable = listed.filter((d) => d.slots.length);
  const slots = listed.find((d) => d.date === date)?.slots ?? [];
  const name = (n: { nameZh: string; nameEn: string } | undefined) => (n ? (lang === 'zh-HK' ? n.nameZh : n.nameEn) : '');

  const pickService = (v: string) => {
    onServiceChange(v as ServiceKey | '');
    setBanner('');
  };

  const submitPick = async (e: FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (!date) next.date = b.errDate;
    else if (!start) next.time = b.errTime;
    setErrors(next);
    if (next.date || next.time) {
      document.getElementById(next.date ? 'f-date' : 'f-time')?.focus();
      return;
    }
    setBusy(true);
    setBanner('');
    try {
      const h = await api.hold({ service: slug, doctor: doctor || 'any', startAt: start });
      skew.current = new Date(h.serverNow).getTime() - Date.now();
      idemKey.current = newKey();
      setHold(h);
      setPhase('details');
      window.setTimeout(() => document.getElementById('f-name')?.focus(), 0);
    } catch (err) {
      setBanner(message(err));
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') {
        setStart('');
        loadDays();
      }
    } finally {
      setBusy(false);
    }
  };

  const changeTime = () => {
    if (hold) api.release(hold.holdId, hold.holdToken).catch(() => undefined);
    backToPick();
  };

  const set = <K extends keyof Details>(key: K, value: Details[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const showErrors = (next: Partial<Record<Field, string>>) => {
    setErrors(next);
    const first = DETAIL_ORDER.find((k) => next[k]);
    // Focus the first field to fix; its message is read out through aria-describedby.
    if (first) document.getElementById(`f-${first}`)?.focus();
    return Boolean(first);
  };

  const submitDetails = async (e: FormEvent) => {
    e.preventDefault();
    if (!hold) return;
    const phone = bareHkPhone(form.phone);
    const next: Partial<Record<Field, string>> = {};
    if (!form.name.trim()) next.name = b.errName;
    if (!HK_PHONE.test(phone)) next.phone = b.errPhone;
    if (!EMAIL.test(form.email.trim())) next.email = b.errEmail;
    if (!form.consent) next.consent = b.errConsent;
    if (showErrors(next)) return;
    setBusy(true);
    setBanner('');
    try {
      const r = await api.confirm(hold, { ...form, phone, email: form.email.trim(), locale: lang }, idemKey.current);
      setDone({ ...r, email: form.email.trim() });
      setHold(null);
      setPhase('done');
      scrollToId('booking');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') {
        const fields = (err.details.fields ?? {}) as Record<string, string>;
        const map: Record<string, string> = { name: b.errName, phone: b.errPhone, email: b.errEmail, consent: b.errConsent };
        showErrors(Object.fromEntries(Object.keys(fields).map((k) => [k, map[k] ?? b.errName])));
      } else if (err instanceof ApiError && (err.code === 'HOLD_EXPIRED' || err.code === 'HOLD_NOT_FOUND')) {
        backToPick(b.errExpired);
      } else {
        setBanner(message(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    setForm(EMPTY);
    onServiceChange('');
    setErrors({});
    setDone(null);
    backToPick();
  };

  const err = (key: Field) => (
    <p className={key === 'consent' ? 'err consent-err' : 'err'} id={`e-${key}`}>
      {errors[key]}
    </p>
  );

  const heldWhen = hold
    ? t('booking.heldFor', {
        date: dateLabel(new Date(new Date(hold.startAt).getTime() + 8 * 3_600_000).toISOString().slice(0, 10), lang),
        time: timeLabel(new Date(hold.startAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit' }), lang),
        service: name(hold.service),
        doctor: name(hold.doctor),
      })
    : '';

  return (
    <section className="book panel" id="booking" aria-labelledby="book-h">
      <div className="wrap book-grid">
        <div>
          <h2 className="h2" id="book-h" data-reveal="text">
            {b.title}
          </h2>
          <p className="lead book-intro" data-reveal="text">
            {b.intro}
          </p>

          {phase === 'done' && done && (
            <div className="done" role="status">
              <h3 className="h3">{b.doneTitle}</h3>
              <p className="lead">{t('booking.doneText', { reference: done.reference, when: done.when, service: done.service, doctor: done.doctor })}</p>
              <p>{t('booking.doneMail', { email: done.email })}</p>
              <button className="btn sm light" type="button" onClick={again}>
                {b.again}
              </button>
            </div>
          )}

          {phase === 'pick' && (
            <form className="form" noValidate onSubmit={submitPick}>
              <p className="step full" data-reveal="text">
                {b.step1}
              </p>
              <div className={doctors.length > 1 ? 'field' : 'field full'} data-reveal="text">
                <label htmlFor="f-service">{b.service}</label>
                <select id="f-service" value={service} onChange={(e) => pickService(e.target.value)}>
                  <option value="">{b.serviceAny}</option>
                  {SERVICE_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {c.services.list[k].name}
                    </option>
                  ))}
                </select>
              </div>
              {doctors.length > 1 && (
                <div className="field">
                  <label htmlFor="f-doctor">{b.doctor}</label>
                  <select id="f-doctor" value={doctor} onChange={(e) => setDoctor(e.target.value)}>
                    <option value="">{b.doctorAny}</option>
                    {doctors.map((d) => (
                      <option key={d.slug} value={d.slug}>
                        {name(d)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field" data-reveal="text">
                <label htmlFor="f-date">{b.date}</label>
                <select
                  id="f-date"
                  value={date}
                  disabled={!days}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setStart('');
                    setErrors({});
                  }}
                  aria-invalid={!!errors.date}
                  aria-describedby="e-date"
                >
                  <option value="">{days ? b.choose : b.loading}</option>
                  {listed.map((d) => (
                    <option key={d.date} value={d.date} disabled={!d.slots.length}>
                      {dateLabel(d.date, lang)}
                      {d.status === 'HOLIDAY' ? ` · ${(lang === 'zh-HK' ? d.labelZh : d.labelEn) ?? b.dayClosed}` : ''}
                      {d.status === 'FULL' ? ` · ${b.dayFull}` : ''}
                    </option>
                  ))}
                </select>
                {err('date')}
              </div>
              <div className="field" data-reveal="text">
                <label htmlFor="f-time">{b.time}</label>
                <select
                  id="f-time"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setErrors({});
                  }}
                  aria-invalid={!!errors.time}
                  aria-describedby="e-time"
                >
                  <option value="">{date ? b.choose : b.timeFirst}</option>
                  {slots.map((s) => (
                    <option key={s.start} value={s.start}>
                      {timeLabel(s.time, lang)} – {timeLabel(s.endTime, lang)}
                    </option>
                  ))}
                </select>
                {err('time')}
              </div>
              {days && !bookable.length && !banner && (
                <p className="notice full" role="status">
                  {t('booking.noSlots', { phone: CLINIC_PHONE })}
                </p>
              )}
              {banner && (
                <p className="notice full" role="alert">
                  {banner}
                </p>
              )}
              <div className="form-foot" data-reveal="text">
                <button className="btn light" type="submit" disabled={busy || !bookable.length}>
                  {busy ? b.holding : b.hold}
                </button>
                <p className="small">{b.holdNote}</p>
              </div>
            </form>
          )}

          {phase === 'details' && hold && (
            <form className="form" noValidate onSubmit={submitDetails}>
              <p className="step full">{b.step2}</p>
              <div className="held full" role="status">
                <div>
                  <p className="held-title">{b.heldTitle}</p>
                  <p>{heldWhen}</p>
                  <p className={left < 120_000 ? 'held-time low' : 'held-time'} aria-live="off">
                    {t('booking.countdown', { time: mmss(left) })}
                  </p>
                </div>
                <button className="btn sm ghost" type="button" onClick={changeTime}>
                  {b.change}
                </button>
              </div>
              <div className="field">
                <label htmlFor="f-name">{b.name}</label>
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
              <div className="field">
                <label htmlFor="f-phone">{b.phone}</label>
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
              <div className="field full">
                <label htmlFor="f-email">{b.email}</label>
                <input
                  id="f-email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  aria-invalid={!!errors.email}
                  aria-describedby="e-email"
                />
                {err('email')}
              </div>
              <div className="field full">
                <label htmlFor="f-note">{b.note}</label>
                <textarea id="f-note" rows={3} maxLength={1000} placeholder={b.notePlaceholder} value={form.note} onChange={(e) => set('note', e.target.value)} />
              </div>
              <label className="consent">
                <input
                  id="f-consent"
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => set('consent', e.target.checked)}
                  aria-invalid={!!errors.consent}
                  aria-describedby="e-consent"
                />
                <span>{b.consent}</span>
              </label>
              {err('consent')}
              {banner && (
                <p className="notice full" role="alert">
                  {banner}
                </p>
              )}
              <div className="form-foot">
                <button className="btn light" type="submit" disabled={busy}>
                  {busy ? b.submitting : b.submit}
                </button>
                <p className="small">{b.submitNote}</p>
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
              <span>{CLINIC_PHONE}</span>
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
