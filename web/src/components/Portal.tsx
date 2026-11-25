import { useEffect, useRef, useState } from 'react';
import { useCopy } from '../i18n/useCopy';
import { ApiError, api, type Booking, type Offer } from '../lib/api';
import { CLINIC_PHONE } from './Booking';

/** Pages opened from email links (plan.md §6, §7): manage a booking, accept a waiting-list offer, leave the list. */

export type PortalRoute = 'manage' | 'offer' | 'leave';

export function portalRoute(path: string): PortalRoute | null {
  if (path.startsWith('/manage')) return 'manage';
  if (path.startsWith('/offer')) return 'offer';
  if (path.startsWith('/waitlist/leave')) return 'leave';
  return null;
}

const param = (k: string) => new URLSearchParams(window.location.search).get(k) ?? '';
const hkWhen = (iso: string, lang: string) =>
  new Date(iso).toLocaleString(lang === 'zh-HK' ? 'zh-HK' : 'en-GB', {
    timeZone: 'Asia/Hong_Kong',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useCopy();
  return (
    <section className="book portal" aria-labelledby="portal-h">
      <div className="wrap portal-wrap">
        <h1 className="h2" id="portal-h">
          {title}
        </h1>
        {children}
        <a className="btn sm ghost" href="/">
          {c.portal.home}
        </a>
      </div>
    </section>
  );
}

function ManagePage() {
  const { c, t, lang } = useCopy();
  const p = c.portal;
  const token = param('token');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    api.booking(token).then(setBooking, () => setFailed(true));
  }, [token]);

  const cancel = async () => {
    setBusy(true);
    try {
      setBooking(await api.cancel(token));
      setNote(p.cancelled);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      setNote(code === 'CANCEL_CUTOFF' ? t('portal.cutoff', { hours: booking?.cancelCutoffHours ?? 24, phone: CLINIC_PHONE }) : t('portal.notFound', { phone: CLINIC_PHONE }));
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  if (failed) return <Shell title={p.manageTitle}><p className="lead">{t('portal.notFound', { phone: CLINIC_PHONE })}</p></Shell>;
  if (!booking) return <Shell title={p.manageTitle}><p className="lead">{p.loading}</p></Shell>;

  const zh = lang === 'zh-HK';
  const phone = booking.clinicPhone || CLINIC_PHONE;
  const active = booking.status === 'CONFIRMED' || booking.status === 'HELD';
  return (
    <Shell title={p.manageTitle}>
      <dl className="summary">
        <dt>{p.reference}</dt>
        <dd>{booking.reference}</dd>
        <dt>{p.when}</dt>
        <dd>{hkWhen(booking.startAt, lang)}</dd>
        <dt>{p.service}</dt>
        <dd>{zh ? booking.serviceZh : booking.serviceEn}</dd>
        <dt>{p.doctor}</dt>
        <dd>{zh ? booking.doctorZh : booking.doctorEn}</dd>
        <dt>{p.status}</dt>
        <dd>{p.statuses[booking.status as keyof typeof p.statuses] ?? booking.status}</dd>
      </dl>
      {note && <p className="notice" role="status">{note}</p>}
      {active && (
        <>
          <p className="small soft-on-ink">{t('portal.reschedule', { phone })}</p>
          {!booking.canCancel ? (
            <p className="small soft-on-ink">{t('portal.cutoff', { hours: booking.cancelCutoffHours, phone })}</p>
          ) : asking ? (
            <div className="ask" role="alertdialog" aria-labelledby="ask-text">
              <p id="ask-text">{p.cancelAsk}</p>
              <div className="form-foot">
                <button className="btn light" type="button" onClick={cancel} disabled={busy}>
                  {p.cancelYes}
                </button>
                <button className="btn ghost" type="button" onClick={() => setAsking(false)}>
                  {p.cancelNo}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn light" type="button" onClick={() => setAsking(true)}>
              {p.cancel}
            </button>
          )}
        </>
      )}
    </Shell>
  );
}

function OfferPage() {
  const { c, t, lang } = useCopy();
  const p = c.portal;
  const token = param('token');
  const [offer, setOffer] = useState<Offer | null>(null);
  const [failed, setFailed] = useState(false);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  // Server clock minus ours, so the countdown matches the server's expiry.
  const skew = useRef(0);

  useEffect(() => {
    api.offer(token).then((o) => {
      skew.current = new Date(o.serverNow).getTime() - Date.now();
      setOffer(o);
    }, () => setFailed(true));
  }, [token]);

  useEffect(() => {
    if (offer?.status !== 'OPEN') return;
    const tick = () => {
      const ms = new Date(offer.expiresAt).getTime() - (Date.now() + skew.current);
      setLeft(ms);
      if (ms <= 0) setOffer((o) => (o ? { ...o, status: 'EXPIRED' } : o));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [offer]);

  const accept = async () => {
    setBusy(true);
    try {
      const r = await api.acceptOffer(token);
      setResult(t('portal.accepted', { reference: r.reference }));
      setOffer((o) => (o ? { ...o, status: 'BOOKED' } : o));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'HOLD_EXPIRED') setOffer((o) => (o ? { ...o, status: 'EXPIRED' } : o));
      else setResult(t('portal.notFound', { phone: CLINIC_PHONE }));
    } finally {
      setBusy(false);
    }
  };

  if (failed) return <Shell title={p.offerTitle}><p className="lead">{t('portal.notFound', { phone: CLINIC_PHONE })}</p></Shell>;
  if (!offer) return <Shell title={p.offerTitle}><p className="lead">{p.loading}</p></Shell>;

  const zh = lang === 'zh-HK';
  const s = Math.max(0, Math.ceil(left / 1000));
  return (
    <Shell title={p.offerTitle}>
      <p className="lead">{t('portal.offerIntro', { name: offer.name })}</p>
      <dl className="summary">
        <dt>{p.when}</dt>
        <dd>{hkWhen(offer.startAt, lang)}</dd>
        <dt>{p.service}</dt>
        <dd>{zh ? offer.serviceZh : offer.serviceEn}</dd>
        <dt>{p.doctor}</dt>
        <dd>{zh ? offer.doctorZh : offer.doctorEn}</dd>
      </dl>
      {result && <p className="notice" role="status">{result}</p>}
      {offer.status === 'OPEN' && (
        <>
          {offer.replacesStartAt && <p className="small soft-on-ink">{t('portal.offerReplaces', { when: hkWhen(offer.replacesStartAt, lang) })}</p>}
          <p className="held-time">{t('portal.offerCountdown', { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })}</p>
          <button className="btn light" type="button" onClick={accept} disabled={busy}>
            {p.accept}
          </button>
        </>
      )}
      {offer.status === 'EXPIRED' && <p className="notice">{p.offerExpired}</p>}
      {offer.status === 'BOOKED' && !result && <p className="notice">{p.offerBooked}</p>}
    </Shell>
  );
}

function LeavePage() {
  const { c, t } = useCopy();
  const p = c.portal;
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'failed'>('ask');

  const leave = async () => {
    setState('busy');
    try {
      await api.leaveWaitlist(param('id'), param('token'));
      setState('done');
    } catch {
      setState('failed');
    }
  };

  return (
    <Shell title={p.leaveTitle}>
      {state === 'done' && <p className="lead" role="status">{p.left}</p>}
      {state === 'failed' && <p className="lead" role="alert">{t('portal.notFound', { phone: CLINIC_PHONE })}</p>}
      {(state === 'ask' || state === 'busy') && (
        <>
          <p className="lead">{p.leaveAsk}</p>
          <button className="btn light" type="button" onClick={leave} disabled={state === 'busy'}>
            {p.leave}
          </button>
        </>
      )}
    </Shell>
  );
}

export function Portal({ route }: { route: PortalRoute }) {
  if (route === 'manage') return <ManagePage />;
  if (route === 'offer') return <OfferPage />;
  return <LeavePage />;
}
