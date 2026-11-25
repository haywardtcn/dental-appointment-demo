/** Thin client for the Strapi booking API (cms/src/api/booking). Errors come back as `{ error: { code, details } }`. */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/booking';

export class ApiError extends Error {
  constructor(public code: string, public status: number, public details: Record<string, any> = {}) {
    super(code);
  }
}

async function call<T>(path: string, init: RequestInit = {}, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...headers },
    });
  } catch {
    throw new ApiError('NETWORK', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'SERVER_ERROR', res.status, data?.error?.details ?? {});
  return data as T;
}

const post = <T>(path: string, body: object, headers?: Record<string, string>) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body) }, headers);

export type Named = { slug: string; nameZh: string; nameEn: string };
export type ServicesResponse = { services: (Named & { durationMin: number; doctors: string[] })[]; doctors: Named[] };
export type Slot = { start: string; end: string; time: string; endTime: string; doctors: string[] };
export type Day = { date: string; status: 'OPEN' | 'FULL' | 'HOLIDAY' | 'CLOSED'; labelZh: string | null; labelEn: string | null; slots: Slot[] };
export type Availability = { days: Day[] };
export type Hold = { holdId: string; holdToken: string; startAt: string; endAt: string; expiresAt: string; serverNow: string; doctor: Named; service: Named };
export type Patient = { name: string; phone: string; email: string; note: string; consent: boolean; locale: string };
export type Confirmed = { reference: string; startAt: string; when: string; doctor: string; service: string; manageToken: string | null };
export type Booking = Confirmed & {
  status: string; patientName: string; doctorZh: string; doctorEn: string; serviceZh: string; serviceEn: string;
  canCancel: boolean; cancelCutoffHours: number; clinicPhone: string;
};
export type Offer = {
  status: 'OPEN' | 'EXPIRED' | 'BOOKED'; name: string; startAt: string; endAt: string; expiresAt: string; serverNow: string;
  doctorZh: string; doctorEn: string; serviceZh: string; serviceEn: string; reference: string; replacesStartAt: string | null;
};
export type Range = { start: number; end: number };
export type ClinicStatus = { minuteOfDay: number; weekly: Record<string, Range[]>; days: { date: string; weekday: number; open: Range[]; status: string; labelZh: string | null; labelEn: string | null }[]; clinicPhone: string };

export const api = {
  services: () => call<ServicesResponse>('/services'),
  availability: (service: string, doctor?: string) =>
    call<Availability>(`/availability?service=${encodeURIComponent(service)}${doctor ? `&doctor=${encodeURIComponent(doctor)}` : ''}`),
  clinicStatus: () => call<ClinicStatus>('/clinic-status'),
  hold: (body: { service: string; doctor?: string; startAt: string; previousHoldId?: string; previousHoldToken?: string }) => post<Hold>('/holds', body),
  release: (id: string, token: string) => call<{ released: boolean }>(`/holds/${id}`, { method: 'DELETE' }, { 'x-hold-token': token }),
  /** For pagehide: sendBeacon cannot set headers, so the token goes in the body. */
  releaseOnLeave: (id: string, token: string) =>
    navigator.sendBeacon?.(`${BASE}/holds/${id}/release`, new Blob([JSON.stringify({ holdToken: token })], { type: 'application/json' })),
  confirm: (hold: Hold, patient: Patient, idempotencyKey: string) =>
    post<Confirmed>(`/holds/${hold.holdId}/confirm`, patient, { 'x-hold-token': hold.holdToken, 'idempotency-key': idempotencyKey }),
  booking: (token: string) => call<Booking>(`/manage?token=${encodeURIComponent(token)}`),
  cancel: (token: string) => post<Booking>('/manage/cancel', { token }),
  offer: (token: string) => call<Offer>(`/waitlist/offer?token=${encodeURIComponent(token)}`),
  acceptOffer: (token: string) => post<Confirmed>('/waitlist/offer/confirm', { token }),
  leaveWaitlist: (id: string, token: string) => post<{ status: string }>('/waitlist/leave', { id, token }),
};
