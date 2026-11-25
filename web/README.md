# Clearlight Dental · Patient Front End

React port of the approved "Final v2 · Warm Panels + Loader" canvas design. Design rules live in `../design.md`; backend plan in `../plan.md`.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

- Stack: Vite, React 18, TypeScript, react-i18next (zh-HK default, en), GSAP + ScrollTrigger, Lenis, iconoir-react, Geist + Noto Sans TC via Fontsource.
- Copy: `src/i18n/zh-HK.ts` and `src/i18n/en.ts`. The language choice is remembered in localStorage.
- Hours, status line, bookable dates and time slots: `src/lib/hours.ts` (Hong Kong time).
- Motion: `src/lib/motion.ts`. The loader, hero entrance and section reveals are all skipped when the visitor prefers reduced motion.
- The booking form is a front-end demo: it validates and confirms on screen but sends nothing. Holds, slots and confirmation come from the Strapi `/api/booking/*` endpoints in plan.md §11.
- All clinic details are demo data. Photos: Kaboompics and Cedric Fauntleroy on Pexels.
