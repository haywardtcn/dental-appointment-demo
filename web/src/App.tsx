import { useEffect, useState } from 'react';
import { IconoirProvider } from 'iconoir-react';
import { Booking } from './components/Booking';
import { Clinic } from './components/Clinic';
import { Dentist } from './components/Dentist';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { HERO_SRC, Hero } from './components/Hero';
import { Loader } from './components/Loader';
import { Portal, portalRoute } from './components/Portal';
import { Services, type ServiceKey } from './components/Services';
import { playHero, prefersReducedMotion, scrollToId, startReveals, startSmoothScroll } from './lib/motion';

export default function App() {
  const route = portalRoute(window.location.pathname);

  // Email-link pages have none of the home page sections, so header links go back to them.
  useEffect(() => {
    if (!route) return;
    const onClick = (e: MouseEvent) => {
      const href = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')?.getAttribute('href');
      if (!href) return;
      e.preventDefault();
      window.location.assign(`/${href}`);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [route]);

  return route ? (
    <IconoirProvider iconProps={{ strokeWidth: 1.6 }}>
      <Header />
      <main>
        <Portal route={route} />
      </main>
      <Footer />
    </IconoirProvider>
  ) : (
    <Site />
  );
}

function Site() {
  const [loading, setLoading] = useState(() => !prefersReducedMotion());
  const [service, setService] = useState<ServiceKey | ''>('');

  useEffect(() => startSmoothScroll(), []);

  // Every in-page link scrolls with Lenis and lands below the fixed header.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      const id = a?.getAttribute('href')?.slice(1);
      if (!id || !document.getElementById(id)) return;
      e.preventDefault();
      scrollToId(id);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Section reveals start once the loader has gone, so nothing animates behind it.
  useEffect(() => (loading ? undefined : startReveals()), [loading]);

  return (
    <IconoirProvider iconProps={{ strokeWidth: 1.6 }}>
      {loading && <Loader heroSrc={HERO_SRC} onLift={playHero} onDone={() => setLoading(false)} />}
      <Header />
      <main>
        <Hero />
        <Clinic />
        <Services onPick={setService} />
        <Dentist />
        <Booking service={service} onServiceChange={setService} />
      </main>
      <Footer />
    </IconoirProvider>
  );
}
