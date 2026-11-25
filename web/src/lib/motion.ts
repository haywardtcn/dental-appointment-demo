import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const EASE = 'power3.out';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis: Lenis | null = null;

/** Smooth scrolling, driven by GSAP's ticker so ScrollTrigger reads the same scroll position. */
export function startSmoothScroll(): () => void {
  if (prefersReducedMotion()) return () => {};
  lenis = new Lenis({ lerp: 0.12 });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    lenis?.destroy();
    lenis = null;
  };
}

export function lockScroll(locked: boolean) {
  document.documentElement.style.overflow = locked ? 'hidden' : '';
  if (locked) lenis?.stop();
  else lenis?.start();
}

function headerHeight() {
  return document.querySelector<HTMLElement>('.hdr .nav')?.offsetHeight ?? 0;
}

/** Scrolls to an in-page section below the fixed header, then moves focus there for keyboard and screen-reader users. */
export function scrollToId(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const focus = () => {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };
  const offset = id === 'top' ? 0 : -headerHeight();
  // A link in the open mobile menu fires while the menu still holds the scroll lock. Release it first:
  // Lenis's start() resets any running scroll, so unlocking later would cancel this one.
  lockScroll(false);
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.1, onComplete: focus });
  } else {
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset });
    focus();
  }
}

/** The hero's entrance, played as the loader lifts: the photo settles and the copy rises line by line. */
export function playHero() {
  if (prefersReducedMotion()) return;
  const tl = gsap.timeline({ defaults: { ease: EASE } });
  tl.from('.hero-photo', { scale: 1.08, duration: 1.4 }, 0);
  tl.from('.hero .h1 > span, .hero-sub, .hero .actions, .hero .status', { autoAlpha: 0, y: 28, duration: 0.8, stagger: 0.08 }, 0.3);
}

/**
 * Sections reveal as they scroll into view: photos open upward, text rises into place.
 * Returns a cleanup that also restores anything not yet revealed.
 */
export function startReveals(): () => void {
  if (prefersReducedMotion()) return () => {};
  const mm = gsap.matchMedia();
  mm.add({ desktop: '(min-width: 901px)', phone: '(max-width: 900px)' }, (ctx) => {
    const text = gsap.utils.toArray<HTMLElement>('[data-reveal="text"]').filter(
      // On phones the service details are collapsed; revealing them later would leave them hidden when opened.
      (el) => ctx.conditions?.desktop || !el.classList.contains('card-body'),
    );
    const photos = gsap.utils.toArray<HTMLElement>('[data-reveal="photo"]');
    gsap.set(text, { autoAlpha: 0, y: 24 });
    gsap.set(photos, { clipPath: 'inset(100% 0% 0% 0% round 20px)' });
    ScrollTrigger.batch(text, {
      start: 'top bottom-=40',
      once: true,
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.07, ease: EASE }),
    });
    ScrollTrigger.batch(photos, {
      start: 'top bottom-=40',
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, { clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 0.9, stagger: 0.07, ease: EASE }),
    });
  });
  return () => mm.revert();
}
