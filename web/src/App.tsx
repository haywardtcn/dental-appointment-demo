import { useEffect, useState } from 'react';
import { IconoirProvider } from 'iconoir-react';
import { Booking } from './components/Booking';
import { Clinic } from './components/Clinic';
import { Dentist } from './components/Dentist';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { HERO_SRC, Hero } from './components/Hero';
import { Loader } from './components/Loader';
import { Services, type ServiceKey } from './components/Services';
import { playHero, prefersReducedMotion, scrollToId, startReveals, startSmoothScroll } from './lib/motion';

export default function App() {
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
