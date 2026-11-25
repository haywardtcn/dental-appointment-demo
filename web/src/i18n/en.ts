import type { Copy } from './zh-HK';

// British English, as used in Hong Kong. Clinic details are demo data.
const en: Copy = {
  brand: 'Clearlight Dental',
  navLabel: 'Main menu',
  langLabel: 'Language',
  loading: 'Loading',
  nav: { clinic: 'Our Clinic', services: 'Services', dentist: 'Our Dentist' },
  bookShort: 'Book',
  menuOpen: 'Open menu',
  menuClose: 'Close menu',

  hero: {
    line1: 'Welcome to',
    line2: 'Clearlight Dental',
    sub: 'Modern dentistry, gentle care. We provide implants, oral surgery, cosmetic and family dentistry in a calm, safe setting.',
    book: 'Book an Appointment',
    call: 'Call 2888 0000',
    alt: 'A smiling patient in the chair while the dentist matches a tooth shade guide',
  },

  clinic: {
    title: 'Inside the Clinic',
    lead: 'Bright, calm treatment rooms, and a clear explanation before every treatment begins.',
    link: 'See Address and Directions',
    altMirror: 'A patient checking the result in a hand mirror',
    altConsult: 'A dentist talking with a teenage patient in the treatment room',
    altChair: 'A patient relaxing in the chair',
    factBig: 'Exit F',
    factNote: 'Causeway Bay MTR, a short walk to 12/F, Hoi Ching Centre.',
  },

  services: {
    title: 'Dental Services',
    intro: 'Impacted wisdom teeth, implants and the family check-up, treated by the same dentist.',
    bookThis: 'Book This',
    list: {
      surgery: {
        name: 'Oral Surgery',
        alt: 'A dentist examining a patient',
        desc: 'Years of hospital oral and maxillofacial surgery experience, removing impacted wisdom teeth and other teeth set in bone.',
        items: 'Surgical extractions, wisdom tooth removal, oral surgery, oral pathology',
      },
      implant: {
        name: 'Implants and Dentures',
        alt: 'A dentist treating a patient with instruments',
        desc: 'Assessed with a CT scan, missing teeth are replaced with implants, bridges or removable dentures.',
        items: 'Implants, bridges, removable dentures, CT scanning',
      },
      cosmetic: {
        name: 'Cosmetic Dentistry',
        alt: 'A dentist matching tooth shades for a patient',
        desc: 'Improve the colour, shape and alignment of your teeth.',
        items: 'Cosmetic treatment, whitening, orthodontics',
      },
      family: {
        name: 'Family Dentistry',
        alt: 'A teenage patient in protective glasses before a check-up',
        desc: 'Everyday care for the whole family, from fillings to root canal treatment.',
        items: 'Restorations, root canal treatment, gum disease treatment',
      },
    },
  },

  dentist: {
    title: 'Meet Dr Chan',
    name: 'Dr Chan Tsz-long',
    role: 'Dentist',
    bio: 'Dr Chan spent many years in hospital oral and maxillofacial surgery. He now focuses on implants and oral surgery, and believes a clear explanation makes every treatment easier.',
    creds: [
      'Bachelor of Dental Surgery, The University of Hong Kong',
      'Fellow, College of Dental Surgeons of Hong Kong (Oral and Maxillofacial Surgery)',
      'Member of the Faculty of Dental Surgery, Royal College of Surgeons of Edinburgh',
    ],
    book: 'Book with Dr Chan',
    alt: 'Dr Chan Tsz-long',
    altTreatment: 'Dr Chan treating a patient',
  },

  booking: {
    title: 'Book an Appointment',
    intro: 'Pick a date and time, and we will call you to confirm.',
    name: 'Name',
    phone: 'Phone',
    service: 'Service (optional)',
    serviceAny: 'Not sure / General check-up',
    date: 'Date',
    time: 'Time',
    choose: 'Please choose',
    timeFirst: 'Choose a date first',
    consent: 'I have read and agree to the Privacy Policy, and allow the clinic to use my personal data to arrange this appointment.',
    submit: 'Send Booking',
    note: 'We will call you to confirm your appointment.',
    errName: 'Please enter your name',
    errPhone: 'Please enter an 8-digit Hong Kong phone number',
    errDate: 'Please choose a date',
    errTime: 'Please choose a time',
    errConsent: 'Please agree to the Privacy Policy first',
    doneTitle: 'Booking Request Received',
    doneText: 'We will call {{phone}} during opening hours to confirm {{date}} at {{time}}.',
    again: 'Book Another',
  },

  contact: {
    title: 'Contact Us',
    address: 'Room 1203, 12/F, Hoi Ching Centre, 18 Ching Kwong Road, Causeway Bay (MTR Exit F)',
    hours: 'Opening hours',
    days: { weekdays: 'Monday to Friday', saturday: 'Saturday', sunday: 'Sundays and public holidays' },
    closed: 'Closed',
  },

  status: {
    openUntil: 'Open now, until {{time}}',
    opensToday: 'Opens today at {{time}}',
    backAfterLunch: 'Lunch break, back at {{time}}',
    closedUntil: 'Closed now. Opens {{day}} at {{time}}',
    tomorrow: 'tomorrow',
  },

  footer: {
    line: 'Oral surgery and family dentistry in Causeway Bay.',
    clinic: 'Clinic',
    more: 'More',
    email: 'Email Us',
    where: '12/F, Hoi Ching Centre',
    privacy: 'Privacy Policy',
    copy: '© 2026 Clearlight Dental Medical Centre',
    credit: 'Photos: Kaboompics, Cedric Fauntleroy / Pexels',
  },
};

export default en;
