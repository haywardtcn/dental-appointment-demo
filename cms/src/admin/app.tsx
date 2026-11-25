import type { StrapiApp } from '@strapi/strapi/admin';
import { Calendar } from '@strapi/icons';
import { documentActions } from './booking/actions';

export default {
  config: {
    // 'zh' is Traditional Chinese in the Strapi admin.
    locales: ['zh'],
  },
  register(app: StrapiApp) {
    app.addMenuLink({
      to: 'booking-tools',
      icon: Calendar,
      intlLabel: { id: 'booking-tools.menu', defaultMessage: '預約工具' },
      Component: () => import('./booking/BookingTools'),
      permissions: [],
    });
  },
  bootstrap(app: StrapiApp) {
    (app.getPlugin('content-manager') as any).apis.addDocumentAction((actions: unknown[]) => [...documentActions, ...actions]);
  },
};
