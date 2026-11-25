// Public booking API (plan.md §10.1). No login; abuse is limited in the controller.
const open = { auth: false as const };

export default {
  routes: [
    { method: 'GET', path: '/booking/services', handler: 'booking.services', config: open },
    { method: 'GET', path: '/booking/availability', handler: 'booking.availability', config: open },
    { method: 'GET', path: '/booking/clinic-status', handler: 'booking.clinicStatus', config: open },
    { method: 'POST', path: '/booking/holds', handler: 'booking.createHold', config: open },
    { method: 'DELETE', path: '/booking/holds/:id', handler: 'booking.releaseHold', config: open },
    { method: 'POST', path: '/booking/holds/:id/release', handler: 'booking.releaseHold', config: open },
    { method: 'POST', path: '/booking/holds/:id/confirm', handler: 'booking.confirmHold', config: open },
    { method: 'GET', path: '/booking/manage', handler: 'booking.viewBooking', config: open },
    { method: 'POST', path: '/booking/manage/cancel', handler: 'booking.cancelBooking', config: open },
    { method: 'GET', path: '/booking/waitlist/offer', handler: 'booking.viewOffer', config: open },
    { method: 'POST', path: '/booking/waitlist/offer/confirm', handler: 'booking.acceptOffer', config: open },
    { method: 'POST', path: '/booking/waitlist/leave', handler: 'booking.leaveWaitlist', config: open },
  ],
};
