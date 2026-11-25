import * as React from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  DateTimePicker,
  Dialog,
  Field,
  Flex,
  Loader,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tabs,
  Tbody,
  Td,
  TextInput,
  Th,
  Thead,
  Toggle,
  Tr,
  Typography,
} from '@strapi/design-system';
import { Layouts, Page, useFetchClient, useNotification } from '@strapi/strapi/admin';

/** 預約工具: schedule preview (A9) and emergency close (A8). Strapi design system only (plan.md §11A). */

interface Doctor {
  documentId: string;
  nameZh: string;
}

interface PreviewRow {
  doctor: string;
  date: string;
  weekday: string;
  status: 'OPEN' | 'CLOSED' | 'HOLIDAY';
  open: string[];
  sessionMinutes: number;
  sessions: number;
  booked: number;
  blocked: number;
  held: number;
  maxBookings: number | null;
  reason: string | null;
  openedBy: string[];
  closedBy: string[];
}

const ALL = 'all';
const RULES_URL = '/admin/content-manager/collection-types/api::schedule-rule.schedule-rule';
const STATUS_LABEL = { OPEN: '開放', CLOSED: '休息', HOLIDAY: '假期' } as const;

const errorText = (err: any) => err?.response?.data?.error?.message ?? err?.message ?? '操作失敗';

function usePreview(doctor: string, days: number) {
  const { get } = useFetchClient();
  const [state, setState] = React.useState<{ loading: boolean; rows: PreviewRow[]; doctors: Doctor[]; error?: string }>({ loading: true, rows: [], doctors: [] });
  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const { data } = await get<{ rows: PreviewRow[]; doctors: Doctor[] }>('/booking-admin/preview', { params: { doctor: doctor || undefined, days } });
      setState({ loading: false, rows: data.rows, doctors: data.doctors });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorText(err) }));
    }
  }, [get, doctor, days]);
  React.useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

function useIsClinicAdmin() {
  const { get } = useFetchClient();
  const [admin, setAdmin] = React.useState(false);
  React.useEffect(() => {
    get<{ clinicAdmin: boolean }>('/booking-admin/me')
      .then(({ data }) => setAdmin(Boolean(data.clinicAdmin)))
      .catch(() => setAdmin(false));
  }, [get]);
  return admin;
}

const Preview = ({ clinicAdmin }: { clinicAdmin: boolean }) => {
  const [doctor, setDoctor] = React.useState('');
  const [days, setDays] = React.useState(14);
  const { loading, rows, doctors, error, reload } = usePreview(doctor, days);
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [importing, setImporting] = React.useState(false);

  const importHolidays = async () => {
    setImporting(true);
    try {
      const { data } = await post<{ added: number; total: number }>('/booking-admin/holidays/import', {});
      toggleNotification({ type: 'success', message: `已 import ${data.added} 日新假期（1823 共 ${data.total} 日）` });
      reload();
    } catch (err) {
      toggleNotification({ type: 'danger', message: errorText(err) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Typography textColor="neutral600">
        按「排期規則」計出嚟嘅開放時間同 session。改完規則即刻生效，喺度可以即刻睇結果。
      </Typography>
      <Flex gap={4} alignItems="flex-end" wrap="wrap">
        <Box minWidth="240px">
          <Field.Root name="doctor">
            <Field.Label>醫生</Field.Label>
            <SingleSelect value={doctor || ALL} onChange={(v: string | number) => setDoctor(v === ALL ? '' : String(v))}>
              <SingleSelectOption value={ALL}>全部醫生</SingleSelectOption>
              {doctors.map((d) => (
                <SingleSelectOption key={d.documentId} value={d.documentId}>
                  {d.nameZh}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </Field.Root>
        </Box>
        <Box minWidth="160px">
          <Field.Root name="days">
            <Field.Label>日數</Field.Label>
            <SingleSelect value={String(days)} onChange={(v: string | number) => setDays(Number(v))}>
              {[7, 14, 31, 62].map((n) => (
                <SingleSelectOption key={n} value={String(n)}>
                  未來 {n} 日
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </Field.Root>
        </Box>
        <Button variant="secondary" onClick={reload}>
          重新整理
        </Button>
        <Button variant="tertiary" tag="a" href={RULES_URL}>
          修改排期規則
        </Button>
        {clinicAdmin && (
          <Button variant="tertiary" onClick={importHolidays} loading={importing}>
            立即 import 公眾假期
          </Button>
        )}
      </Flex>
      {error && <Alert variant="danger" title="載入失敗" closeLabel="關閉">{error}</Alert>}
      {loading ? (
        <Loader>載入中</Loader>
      ) : (
        <Table colCount={7} rowCount={rows.length + 1}>
          <Thead>
            <Tr>
              <Th><Typography variant="sigma">日期</Typography></Th>
              <Th><Typography variant="sigma">醫生</Typography></Th>
              <Th><Typography variant="sigma">狀態</Typography></Th>
              <Th><Typography variant="sigma">開放時段</Typography></Th>
              <Th><Typography variant="sigma">Session</Typography></Th>
              <Th><Typography variant="sigma">已佔用</Typography></Th>
              <Th><Typography variant="sigma">規則 / 原因</Typography></Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((r) => (
              <Tr key={`${r.doctor}-${r.date}`}>
                <Td><Typography>{r.date}（{r.weekday}）</Typography></Td>
                <Td><Typography>{r.doctor}</Typography></Td>
                <Td>
                  <Badge active={r.status === 'OPEN'}>{STATUS_LABEL[r.status]}</Badge>
                </Td>
                <Td><Typography>{r.open.length ? r.open.join('、') : '—'}</Typography></Td>
                <Td>
                  <Typography>
                    {r.status === 'OPEN' ? `${r.sessions} 格 × ${r.sessionMinutes} 分鐘` : '—'}
                    {r.maxBookings !== null ? `（每日上限 ${r.maxBookings}）` : ''}
                  </Typography>
                </Td>
                <Td>
                  <Typography>
                    {r.booked} 預約{r.blocked ? ` · ${r.blocked} 封時段` : ''}{r.held ? ` · ${r.held} 保留中` : ''}
                  </Typography>
                </Td>
                <Td>
                  <Typography textColor="neutral600">
                    {[r.reason, ...r.openedBy.map((n) => `開：${n}`), ...r.closedBy.map((n) => `休：${n}`)].filter(Boolean).join(' · ') || '冇規則適用'}
                  </Typography>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Flex>
  );
};

const REASONS = ['八號風球', '黑色暴雨警告', '醫生臨時請假', '其他'];

interface Affected {
  documentId: string;
  reference: string;
  kind: string;
  status: string;
  when: string;
  doctor: string;
  service: string | null;
  patientName: string | null;
  hasEmail: boolean;
}

const Emergency = ({ doctors }: { doctors: Doctor[] }) => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [from, setFrom] = React.useState<Date | null>(null);
  const [to, setTo] = React.useState<Date | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [reasonKind, setReasonKind] = React.useState(REASONS[0]);
  const [reasonText, setReasonText] = React.useState('');
  const [notify, setNotify] = React.useState(true);
  const [preview, setPreview] = React.useState<Affected[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);

  const reason = reasonKind === '其他' ? reasonText.trim() : reasonKind;
  const payload = () => ({ from: from?.toISOString(), to: to?.toISOString(), doctors: picked, reason, notify });
  const ready = Boolean(from && to && to > from && reason);
  // A new range or doctor choice needs a fresh preview before closing.
  React.useEffect(() => setPreview(null), [from, to, picked]);

  const runPreview = async () => {
    setBusy(true);
    setDone(null);
    try {
      const { data } = await post<{ reservations: Affected[] }>('/booking-admin/emergency/preview', payload());
      setPreview(data.reservations);
    } catch (err) {
      toggleNotification({ type: 'danger', message: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      const { data } = await post<{ cancelled: number; released: number; blocks: number }>('/booking-admin/emergency/close', payload());
      setDone(`已取消 ${data.cancelled} 個預約、釋放 ${data.released} 個保留，並為 ${data.blocks} 位醫生封咗呢段時間。`);
      setPreview(null);
    } catch (err) {
      toggleNotification({ type: 'danger', message: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const bookings = preview?.filter((p) => p.kind === 'APPOINTMENT' && p.status === 'CONFIRMED') ?? [];
  const toMail = bookings.filter((p) => p.hasEmail).length;

  return (
    <Flex direction="column" alignItems="stretch" gap={5}>
      <Typography textColor="neutral600">
        第 1 步揀時間同醫生，第 2 步預覽受影響嘅預約，第 3 步確認。確認之後會取消預約、通知病人，並封住呢段時間。
      </Typography>
      {done && <Alert variant="success" title="已完成" closeLabel="關閉" onClose={() => setDone(null)}>{done}</Alert>}

      <Flex gap={4} wrap="wrap" alignItems="flex-start">
        <Box minWidth="320px">
          <Field.Root name="from" required>
            <Field.Label>由</Field.Label>
            <DateTimePicker value={from} onChange={(d?: Date) => setFrom(d ?? null)} dateLabel="日期" timeLabel="時間" step={15} />
          </Field.Root>
        </Box>
        <Box minWidth="320px">
          <Field.Root name="to" required>
            <Field.Label>至</Field.Label>
            <DateTimePicker value={to} onChange={(d?: Date) => setTo(d ?? null)} dateLabel="日期" timeLabel="時間" step={15} />
          </Field.Root>
        </Box>
      </Flex>

      <Flex direction="column" alignItems="flex-start" gap={2}>
        <Typography variant="pi" fontWeight="bold">醫生（唔揀 = 全部醫生）</Typography>
        <Flex gap={4} wrap="wrap">
          {doctors.map((d) => (
            <Checkbox
              key={d.documentId}
              checked={picked.includes(d.documentId)}
              onCheckedChange={(on: boolean | 'indeterminate') =>
                setPicked((p) => (on === true ? [...p, d.documentId] : p.filter((x) => x !== d.documentId)))
              }
            >
              {d.nameZh}
            </Checkbox>
          ))}
        </Flex>
      </Flex>

      <Flex gap={4} wrap="wrap" alignItems="flex-end">
        <Box minWidth="240px">
          <Field.Root name="reason" required>
            <Field.Label>原因</Field.Label>
            <SingleSelect value={reasonKind} onChange={(v: string | number) => setReasonKind(String(v))}>
              {REASONS.map((r) => (
                <SingleSelectOption key={r} value={r}>{r}</SingleSelectOption>
              ))}
            </SingleSelect>
          </Field.Root>
        </Box>
        {reasonKind === '其他' && (
          <Box minWidth="320px">
            <Field.Root name="reasonText" required>
              <Field.Label>原因說明</Field.Label>
              <TextInput value={reasonText} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReasonText(e.target.value)} />
            </Field.Root>
          </Box>
        )}
        <Field.Root name="notify">
          <Field.Label>寄電郵通知病人</Field.Label>
          <Toggle checked={notify} onLabel="通知" offLabel="唔通知" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotify(e.target.checked)} />
        </Field.Root>
      </Flex>

      <Flex gap={2}>
        <Button variant="secondary" onClick={runPreview} disabled={!ready} loading={busy && !preview}>
          預覽受影響預約
        </Button>
        <Dialog.Root>
          <Dialog.Trigger>
            <Button variant="danger" disabled={!ready || !preview || busy}>
              確認休診
            </Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Header>確認緊急休診？</Dialog.Header>
            <Dialog.Body>
              <Typography>
                會取消 {bookings.length} 個預約{notify ? `，並寄電郵通知其中 ${toMail} 位有電郵嘅病人` : '，唔會通知病人'}。呢個操作唔可以還原。
              </Typography>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.Cancel>
                <Button variant="tertiary">返回</Button>
              </Dialog.Cancel>
              <Dialog.Action>
                <Button variant="danger" onClick={close}>確認休診</Button>
              </Dialog.Action>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>

      {preview && (
        <Flex direction="column" alignItems="stretch" gap={2}>
          <Typography fontWeight="bold">受影響：{preview.length} 項（{bookings.length} 個預約）</Typography>
          {preview.length > 0 && (
            <Table colCount={5} rowCount={preview.length + 1}>
              <Thead>
                <Tr>
                  <Th><Typography variant="sigma">時間</Typography></Th>
                  <Th><Typography variant="sigma">編號</Typography></Th>
                  <Th><Typography variant="sigma">病人</Typography></Th>
                  <Th><Typography variant="sigma">服務 / 醫生</Typography></Th>
                  <Th><Typography variant="sigma">處理</Typography></Th>
                </Tr>
              </Thead>
              <Tbody>
                {preview.map((p) => (
                  <Tr key={p.documentId}>
                    <Td><Typography>{p.when}</Typography></Td>
                    <Td><Typography>{p.reference}</Typography></Td>
                    <Td><Typography>{p.patientName ?? (p.kind === 'BLOCK' ? '封時段' : '—')}</Typography></Td>
                    <Td><Typography>{[p.service, p.doctor].filter(Boolean).join(' · ')}</Typography></Td>
                    <Td>
                      <Typography>
                        {p.kind === 'BLOCK' ? '取消（由新封時段代替）' : p.status === 'HELD' ? '釋放保留' : notify && p.hasEmail ? '取消並寄電郵' : '取消'}
                      </Typography>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Flex>
      )}
    </Flex>
  );
};

const BookingTools = () => {
  const clinicAdmin = useIsClinicAdmin();
  const { doctors } = usePreview('', 1);
  return (
    <Page.Main>
      <Page.Title>預約工具</Page.Title>
      <Layouts.Header title="預約工具" subtitle="排期預覽同緊急休診。預約本身喺 Content Manager 同 Calendar 管理。" />
      <Layouts.Content>
        <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
          <Tabs.Root defaultValue="preview">
            <Tabs.List aria-label="預約工具">
              <Tabs.Trigger value="preview">排期預覽</Tabs.Trigger>
              {clinicAdmin && <Tabs.Trigger value="emergency">緊急休診</Tabs.Trigger>}
            </Tabs.List>
            <Box paddingTop={6}>
              <Tabs.Content value="preview">
                <Preview clinicAdmin={clinicAdmin} />
              </Tabs.Content>
              {clinicAdmin && (
                <Tabs.Content value="emergency">
                  <Emergency doctors={doctors} />
                </Tabs.Content>
              )}
            </Box>
          </Tabs.Root>
        </Box>
      </Layouts.Content>
    </Page.Main>
  );
};

export default BookingTools;
