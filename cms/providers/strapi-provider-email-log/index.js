'use strict';

// The full message is kept in the notification-log content type; the log line masks the address.
const mask = (to) => {
  const [user = '', domain = ''] = String(to || '').split('@');
  return `${user.slice(0, 1)}***@${domain}`;
};

module.exports = {
  init(providerOptions = {}, settings = {}) {
    return {
      async send(options) {
        const log = global.strapi ? global.strapi.log : console;
        log.info(`[email-log] to=${mask(options.to)} from=${options.from || settings.defaultFrom} subject="${options.subject}"`);
      },
    };
  },
};
