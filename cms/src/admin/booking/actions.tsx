import * as React from 'react';
import { Field, Flex, Textarea, Toggle, Typography } from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

/** Buttons on the Content Manager edit view (plan.md §11A, A3 / A6 / A7). Logic lives on the server. */

const RES = 'api::reservation.reservation';
const WAITLIST = 'api::waitlist-entry.waitlist-entry';
const NOTIFICATION = 'api::notification-log.notification-log';

interface Props {
  model: string;
  documentId?: string;
  document?: Record<string, any>;
}

function useRun() {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  return async (url: string, body: object, success: string) => {
    try {
      await post(url, body);
      toggleNotification({ type: 'success', message: success });
      // The edit view keeps its own copy of the document, so reload to show the new status.
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? err?.message ?? '操作失敗';
      toggleNotification({ type: 'danger', message });
    }
  };
}

const CancelBooking = ({ model, documentId, document }: Props) => {
  const run = useRun();
  const [reason, setReason] = React.useState('');
  const [notify, setNotify] = React.useState(true);
  if (model !== RES || !documentId || !document || !['HELD', 'CONFIRMED'].includes(document.bookingStatus)) return null;
  const isBlock = document.kind === 'BLOCK';
  return {
    label: isBlock ? '取消封時段' : '取消預約並通知',
    variant: 'danger-light' as const,
    position: 'panel' as const,
    dialog: {
      type: 'dialog' as const,
      title: isBlock ? '取消呢個封時段？' : '取消呢個預約？',
      content: (
        <Flex direction="column" gap={4} alignItems="stretch">
          <Typography>
            {isBlock ? '取消之後呢段時間會即刻開返畀病人 book。' : `預約 ${document.reference ?? ''}（${document.patientName ?? ''}）會改做「已取消」，時段會即刻開返，並自動 offer 畀輪候名單。`}
          </Typography>
          <Field.Root name="reason">
            <Field.Label>原因</Field.Label>
            <Textarea value={reason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)} placeholder="例如：醫生臨時請假" />
          </Field.Root>
          {!isBlock && document.email && (
            <Field.Root name="notify">
              <Field.Label>寄電郵通知病人</Field.Label>
              <Toggle checked={notify} onLabel="通知" offLabel="唔通知" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotify(e.target.checked)} />
            </Field.Root>
          )}
        </Flex>
      ),
      variant: 'danger' as const,
      confirmLabel: '確認取消',
      onConfirm: () => run(`/booking-admin/reservations/${documentId}/cancel`, { reason, notify }, '已取消'),
    },
  };
};

const statusAction = (action: string, label: string, from: string[], done: string) => {
  const Action = ({ model, documentId, document }: Props) => {
    const run = useRun();
    if (model !== RES || !documentId || !document || document.kind !== 'APPOINTMENT' || !from.includes(document.bookingStatus)) return null;
    return {
      label,
      position: 'panel' as const,
      onClick: () => {
        run(`/booking-admin/reservations/${documentId}/${action}`, {}, done);
      },
    };
  };
  Action.displayName = `BookingStatus_${action}`;
  return Action;
};

const ResendConfirmation = ({ model, documentId, document }: Props) => {
  const run = useRun();
  if (model !== RES || !documentId || document?.bookingStatus !== 'CONFIRMED' || !document?.email) return null;
  return {
    label: '重發確認電郵',
    position: 'panel' as const,
    onClick: () => {
      run(`/booking-admin/reservations/${documentId}/resend`, {}, '已排隊寄出確認電郵');
    },
  };
};

const OfferNow = ({ model, documentId, document }: Props) => {
  const run = useRun();
  if (model !== WAITLIST || !documentId || document?.queueStatus !== 'ACTIVE') return null;
  return {
    label: '立即搵位 offer',
    position: 'panel' as const,
    onClick: () => {
      run(`/booking-admin/waitlist/${documentId}/offer`, {}, '已嘗試配對；有合適時段就會寄出 offer');
    },
  };
};

const RetryNotification = ({ model, documentId, document }: Props) => {
  const run = useRun();
  if (model !== NOTIFICATION || !documentId || document?.deliveryStatus !== 'FAILED') return null;
  return {
    label: '重試寄出',
    position: 'panel' as const,
    onClick: () => {
      run(`/booking-admin/notifications/${documentId}/retry`, {}, '已重新排隊');
    },
  };
};

CancelBooking.displayName = 'BookingCancel';
ResendConfirmation.displayName = 'BookingResend';
OfferNow.displayName = 'WaitlistOfferNow';
RetryNotification.displayName = 'NotificationRetry';

export const documentActions = [
  statusAction('arrived', '標記已到診', ['CONFIRMED'], '已標記到診'),
  statusAction('completed', '標記已完成', ['CONFIRMED', 'ARRIVED'], '已標記完成'),
  statusAction('no-show', '標記缺席', ['CONFIRMED'], '已標記缺席'),
  ResendConfirmation,
  CancelBooking,
  OfferNow,
  RetryNotification,
];
