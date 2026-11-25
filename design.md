# 晴光牙科醫務中心 · Design System (Art Bible)

Extracted from Hero Variant A. Every other section is built from these rules. (The arch-shaped photo masks of the first draft were dropped: photos are square-cornered.)

- **Audience:** people in Hong Kong looking for a dentist, many already in pain or worried about surgery.
- **Primary conversion:** 預約診症 / Book an Appointment.
- **Idea:** calm and clear. Large type, square photographs from one consistent shoot, pill-shaped controls, and one green field (`--field`) that carries the Services section.

---


## v2 · Warm Panels (current direction, 2026-11-25)

Layout is led by a reference the client supplied (a Dribbble dental site). Sections v1 below still hold for copy, icon motion, form and accessibility rules; v2 replaces colour, type, shape and section layout.

| Token | Value | Use |
|---|---|---|
| `--ground` | `#F7F3EE` | Page, solid header, mobile menu |
| `--ink` | `#161514` | Text, primary pills, booking panel |
| `--soft` | `#6B6560` | Secondary text |
| `--sand` | `#EDE6DC` | Nav pill and toggle on solid header, pale buttons |
| `--sage` | `#DDE6D5` | Services panel |

- **Type:** Geist 500 for display (tight, -0.045em), Geist 400 body; Noto Sans TC for Chinese. Never Inter.
- **Shape:** content sits in inset rounded panels (12px inset, 28px radius; 8px / 22px on phone). Photos 20px radius. Buttons are pills.
- **Hero:** full-bleed photo in a rounded panel, flat 42% dark shade for legibility (no gradient), white H1 bottom-left (two lines, no inline image), one white Book pill plus a ghost Call pill, live status.
- **Header (desktop):** no bar. Over the hero the logo, nav pill and 繁/EN show in white. Past the hero the logo fades out and only the nav pill (turns `--sand`), the Book pill and 繁/EN float. The Book pill stays hidden while the hero Book button is on screen, and carries a 2px `--ground` ring so it stays visible over the dark booking panel.
- **Header (phone):** solid `--ground` bar with logo, Book pill and hamburger once past the hero.
- **Sections:** clinic (centred heading, three scattered photos, "Exit F" fact) → services (sage panel, heading and one line, four photo cards in one row that pre-fill the form; on phone a tap-to-open list with no photos, chevron turns when open) → doctor (heading + bio / portrait / credentials + book) → booking (ink panel) → footer (plain, on the page ground: brand and one line, three link columns (contact items carry phone, mail and pin icons), then copyright and photo credit under a divider).
- **Left out of the reference on purpose:** testimonials, satisfaction stats, blog cards. No real reviews or numbers exist; inventing them is not allowed.
- **Photos:** Kaboompics dental series on Pexels (IDs 6627572 hero, 6627526 chip, 6627575 / 6627373 / 6627563 clinic, 6627529 / 6627567 / 6627571 / 6627410 services, 6627565 doctor detail) + Dr Chan portrait 4269933 by Cedric Fauntleroy.
- **Loader:** flat SVG scene drawn in the page palette (no illustration library, no AI image). Chair reclines (1.2s), lamp switches on, dentist's arm examines on a loop, clock minute hand turns as the progress, clouds drift, plant sways. It covers the hero photo while it loads: minimum 1.9s, maximum 4s, then lifts upward (clip-path, 0.85s) and the hero plays its entrance underneath. Skipped entirely with reduced motion.

## 1. Colour

One ground, one ink, one accent. Surfaces are separated by tone steps, never lines or shadows.

| Token | Hex | Role |
|---|---|---|
| `--ground` | `#EEF2F1` | Page background |
| `--ink` | `#0F2A2E` | All running text, headings, dark section ground (Booking) |
| `--accent` | `#0F5C57` | Primary action only (Book buttons, submit) |
| `--accent-hover` | `#0A403C` | Primary hover / pressed |
| `--field` | `#CFE0DC` | Photo placeholder fill, Services section ground |
| `--field-hover` | `#BFD5CF` | Row hover on the field |
| `--surface` | `#DCE5E3` | Secondary buttons, language toggle track, inputs on light ground |
| `--ink-soft` | `#3D5559` | Secondary notes only (captions, credentials). 7.4:1 on ground |
| `--on-ink` | `#EEF2F1` | Text on the ink section |
| `--on-ink-soft` | `#B7C8C5` | Secondary text on ink. 9.6:1 |
| `--input-on-ink` | `#1C3D42` | Form fields on the ink section |
| `--open` | `#1F8A5B` | "Open now" dot (dot only, never text) |
| `--closed` | `#8A9A98` | "Closed" dot |
| `--error` | `#B3261E` (light) / `#FFB4A9` (on ink) | Form errors |

Contrast: `--accent` with white text is 7.6:1, and `--ink` on `--ground` is 13.9:1. Every text pair passes 4.5:1.

**Banned:** gradients, glows, blobs, purple or indigo, shadows on anything at rest, 1px outline boxes, hairline dividers.

## 2. Typography

| Script | Family | Weights |
|---|---|---|
| Latin | **Figtree** | 400 / 500 / 600 / 700 |
| Traditional Chinese | **Noto Sans TC** | 400 / 500 / 700 |

Stack: `'Figtree', 'Noto Sans TC', sans-serif`. Never Inter, never a system default.

| Token | Size | Leading | Tracking | Use |
|---|---|---|---|---|
| `--t-display` | `clamp(44px, 6.2vw, 96px)` (zh `clamp(40px, 5.4vw, 84px)`) | 1.0 (zh 1.12) | -0.035em (zh 0) | H1, once per page |
| `--t-h2` | `clamp(36px, 4.4vw, 64px)` (zh `clamp(34px, 4vw, 58px)`) | 1.05 (zh 1.2) | -0.03em (zh 0) | Section titles |
| `--t-h3` | `28px` (phone 24px) | 1.2 | -0.01em | Service names, Dr Chan's name |
| `--t-lead` | `20px` (phone 18px) | 1.55 | 0 | Hero sentence, bio |
| `--t-body` | `17px` | 1.6 | 0 | Everything else |
| `--t-small` | `15px` | 1.5 | 0 | Captions, legal, footer |

Rules:
- English H1/H2 are always **Title Case**, never ALL CAPS.
- No eyebrows, no small labels above headings, no index numbers (01 / 02), no tracked uppercase.
- No styled accent word inside a headline: one colour, one weight.
- Headlines stay within two lines at every width. Cut words before shrinking type.
- Chinese and English never mix in one sentence. Proper nouns (B1 exit, BDS) are the only exception.

## 3. Space & Grid

8px base. Desktop: 12 columns, 32px outer margins, 32px gutters. Phone: 1 column, 16px margins.

| Token | Value |
|---|---|
| `--s-1` … `--s-8` | 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64 |
| `--s-section` | `160px` desktop / `96px` phone (between sections) |
| `--gap-heading` | `48px` heading to content (phone 32px) |
| `--max` | `1376px` content width (1440 − 2 × 32) |

Outer margins are equal on both sides. Asymmetry lives inside the grid. A void on one side is always closed by a picture or a column on the other.

## 4. Shape

| Token | Value | Use |
|---|---|---|
| `--r-photo` | `0` | Every photograph: square corners, no half-circle or arched edges |
| `--r-pill` | `999px` | Buttons, hamburger button, language toggle, location tag |
| `--r-field` | `12px` | Form inputs only |

No other radius is used. No cards: content sits directly on the ground or on a full-width field.

## 5. Components

**Buttons** (min height 56px, padding 0 28px, 17px / 600, pill):
- Primary: `--accent` fill, white text. Exactly one per screen. On the `--ink` section the primary inverts to `--field` fill with `--ink` text, because accent on ink lacks separation.
- Secondary: `--surface` fill, `--ink` text.
- Press: `scale(.97)`, 150ms.

**Icon-motion contract.** The icon's hover motion describes what the click does:

| Action | Icon | Hover motion | Why |
|---|---|---|---|
| Book (scrolls to form below) | arrow-down | drops 5px, loops 0.9s | You are about to travel down |
| Call | phone | rings ±14°, 0.5s once | A call is starting |
| Location (jumps to address) | map-pin | drops 3–4px | Lands you on the place |
| Service row "Book this" | arrow-down | slides down 4px | Scrolls to the form with that service filled in |
| Facebook / external | arrow-up-right | moves +3px x, −3px y | Leaves the page |

**Header (fixed):** `position: fixed`, solid `--ground` background (no blur, no shadow), 88px high on desktop and 76px on phone. The page gets matching `padding-top`, and every section gets `scroll-margin-top` so anchors land below the header.
- Desktop: wordmark · 診所環境 · 牙科服務 · 牙醫簡介, then at the right end the Book pill and the 繁 / EN toggle together (the toggle stays at the edge, the pill slides in beside it).
- Phone: wordmark · Book pill · hamburger (48px round, `--surface`). The hamburger opens a full-screen menu with the three links at 28px / 700 and the language toggle. Its three lines turn into an X (300ms) so the button reads as "close". Menu items drop in 12px with a 60ms stagger. Choosing a link closes the menu.

**Header CTA hand-off:** the hero already has the primary CTA, so the header's Book pill stays hidden (`opacity: 0`, `translateY(-14px)`, `visibility: hidden`, `tabindex="-1"`, `aria-hidden="true"`) while the hero CTA is on screen. Once the hero CTA scrolls under the header, the pill slides down into place (300ms), taking over the action. Scrolling back to the hero hides it again. When the phone menu is open the menu covers the hero, so the pill shows. Visibility is measured from the hero CTA's position on every scroll and resize.

**Language toggle:** a pill track (`--surface`); the active language is filled `--ink` with `aria-pressed="true"`. Each language is a complete version of the page, never mixed.

**Open-now status:** a 10px dot plus a sentence computed from Hong Kong time (`Asia/Hong_Kong`) against the real clinic hours. Shown in the hero and the Booking section.

**Form fields:** 56px high, `--r-field`, visible `<label>` above, error text directly under the field (`aria-describedby`), never placeholder-only labels.

## 6. Icons

Iconoir only, 1.6 stroke, 24px viewBox, `currentColor`, `aria-hidden="true"` when beside a text label. Never Lucide, never emoji.

React: `react-icons` doesn't ship the Iconoir set, so use **`iconoir-react`** (`ArrowDown`, `Phone`, `MapPin`, `ArrowUpRight`, `Calendar`, `Check`). If the build must stay on `react-icons` only, inline these SVGs as small components.

## 7. Photography

This demo uses fictional data, so every picture comes from **one stock series**: Cedric Fauntleroy's dental shoot on Pexels (white clinic, daylight, grey scrubs, blue gloves). One series keeps light, colour and people consistent. The same male dentist appears in the portrait and in the treatment shots, so "Dr Chan" reads as one person.

| Slot | Pexels ID | Shape |
|---|---|---|
| Hero photo | 4269500 | Portrait |
| Clinic, large | 4269946 | Portrait |
| Clinic, small | 4269501 | Landscape |
| Dr Chan portrait | 4269933 | Landscape, cropped to face (`object-position: 62% 40%`) |
| Dr Chan at work | 4269941 | Landscape |
| Spare (variants B/C) | 4269688, 4269496, 4269939 | — |

Rules:
1. Stay inside the one series. When a slot needs a new picture, take it from the same photographer and shoot before searching elsewhere.
2. For a real client, replace the series with the clinic's own photos, keeping the same light and crop rules.
3. No graphic surgical close-ups, no AI illustration, no mixing in street or city photos.
4. Credit in the footer: "相片：Cedric Fauntleroy / Pexels" / "Photos: Cedric Fauntleroy / Pexels".

Treatment: natural colour, no filters, square corners, `object-fit: cover`.

## 8. Motion (GSAP 3 + ScrollTrigger + Lenis)

Every move must lead the eye, point to the next section or confirm an action. Transform and opacity only.

| Token | Value |
|---|---|
| `--ease-out` | `power3.out` (CSS `cubic-bezier(.3,.7,.2,1)`) |
| `--d-fast` | 150ms (press) |
| `--d-base` | 300ms (hover) |
| `--d-enter` | 700–900ms (section entrance) |
| `--stagger` | 70ms |
| Rise distance | 24px |

```js
const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(t => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
// every href="#…" goes through lenis.scrollTo(target, { offset: -80, duration: 1.2 })
```

| Where | Move | Purpose |
|---|---|---|
| Hero load | Hero photo opens via `clip-path: inset(100% 0 0 0)` → `inset(0)`, 0.9s; H1 → sentence → buttons rise 24px, 70ms stagger; status dot fades in last | Shows the room first, then guides to the action, then to "open now" |
| Hero → Services | Hero photo scales to full-bleed while scrubbing and becomes the `--field` ground | Points to the next section |
| Clinic | Each photo's clip-path opens upward as it enters | Reveals the rooms one by one |
| Services rows | Rows rise in sequence; hover tints the row `--field-hover` and drops its arrow | Shows each row is an action |
| Dr Chan | Portrait opens upward, then credentials stagger in | Face first, credentials second |
| Booking | Form fields stagger in; after submit, the confirmation slides in from +16px | Confirms the action was received |

`prefers-reduced-motion: reduce`: no travel and no clip reveals. Opacity only (or none), Lenis disabled.

## 9. Copy & i18n

- Languages: 繁體中文 (Hong Kong usage, default) and English, each complete. Avoid Mainland internet terms (e.g. use 電話, 預約, 資料, 港鐵).
- Short and action-led: buttons start with a verb (預約診症, 致電, 送出預約 / Book, Call, Send).
- Keywords to keep naturally: 銅鑼灣牙醫, 植牙, 脫智慧牙, 口腔外科, 美容牙科, 家庭牙科, 港大牙醫 / Causeway Bay dentist, dental implants, wisdom tooth extraction, oral surgery.
- Proof is never invented: no reviews, ratings or patient counts.

## 10. Accessibility Checklist

- Touch targets ≥ 44px, focus ring `2px solid --accent`, `outline-offset: 3px`.
- One `h1`, an `h2` on every section, a real `<ol>`/`<ul>`/`<table>` where the data is a list or a table.
- Alt text describes the photo in the active language.
- Contrast ≥ 4.5:1 for all text (table in §1).
- Respect `prefers-reduced-motion`.
