import { useEffect, useState } from 'react';
import { useCopy } from '../i18n/useCopy';
import { lockScroll } from '../lib/motion';

const MIN_MS = 1900; // one full chair-recline cycle
const MAX_MS = 4000;
const LIFT_MS = 900;

type Props = { heroSrc: string; onLift: () => void; onDone: () => void };

/**
 * Covers the page while the hero photo downloads, so the first screen arrives whole.
 * It then lifts upward like a curtain and the hero plays its entrance underneath.
 */
export function Loader({ heroSrc, onLift, onDone }: Props) {
  const { c } = useCopy();
  const [out, setOut] = useState(false);

  useEffect(() => {
    lockScroll(true);
    const start = Date.now();
    let finished = false;
    let lift = 0;
    let done = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      lift = window.setTimeout(() => {
        setOut(true);
        lockScroll(false);
        onLift();
        done = window.setTimeout(onDone, LIFT_MS);
      }, Math.max(0, MIN_MS - (Date.now() - start)));
    };
    const img = new Image();
    img.onload = finish;
    img.onerror = finish;
    img.src = heroSrc;
    if (img.complete) finish();
    const cap = window.setTimeout(finish, MAX_MS);
    return () => {
      window.clearTimeout(lift);
      window.clearTimeout(done);
      window.clearTimeout(cap);
      lockScroll(false);
    };
    // Runs once per page load.
  }, []);

  return (
    <div className={out ? 'loader is-out' : 'loader'} role="status" aria-live="polite">
      <span className="sr">{c.loading}</span>
      <svg viewBox="0 0 480 360" aria-hidden="true">
        <circle cx="240" cy="186" r="150" fill="#DDE6D5" />
        <g fill="#FFFFFF">
          <rect className="ld-cloud" x="40" y="118" width="112" height="16" rx="8" />
          <rect className="ld-cloud b" x="62" y="232" width="86" height="14" rx="7" />
          <rect className="ld-cloud b" x="334" y="152" width="96" height="14" rx="7" />
          <rect className="ld-cloud" x="318" y="250" width="124" height="16" rx="8" />
        </g>
        <rect x="338" y="86" width="8" height="224" rx="4" fill="#B9C6B0" />
        <path d="M342 90H150" stroke="#B9C6B0" strokeWidth="7" strokeLinecap="round" />
        <circle cx="398" cy="96" r="25" fill="#FFFFFF" stroke="#D9D2C8" strokeWidth="3" />
        <path d="M398 96V82" stroke="#161514" strokeWidth="3" strokeLinecap="round" />
        <path className="ld-min" d="M398 96H414" stroke="#161514" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="398" cy="96" r="3" fill="#161514" />
        <g className="ld-plant">
          <ellipse cx="74" cy="250" rx="9" ry="26" fill="#8FAE82" transform="rotate(-24 74 250)" />
          <ellipse cx="98" cy="246" rx="9" ry="28" fill="#A9C29B" transform="rotate(22 98 246)" />
          <ellipse cx="86" cy="240" rx="8" ry="30" fill="#7E9F72" />
        </g>
        <path d="M70 278h32l-4 30H74z" fill="#5E7A6C" />
        {/* Dentist standing behind the chair */}
        <path d="M198 266V300M218 266V300" stroke="#34434E" strokeWidth="10" strokeLinecap="round" />
        <rect x="180" y="140" width="54" height="134" rx="22" fill="#FFFFFF" stroke="#D9D2C8" strokeWidth="2" />
        <circle cx="205" cy="114" r="17" fill="#2B2626" />
        <circle cx="192" cy="101" r="8" fill="#2B2626" />
        <circle cx="209" cy="120" r="13" fill="#E8BFA3" />
        <rect x="205" y="119" width="17" height="11" rx="4" fill="#CFE3EE" />
        {/* Chair and patient */}
        <path d="M236 262h28v42h-28z" fill="#C9D2C3" />
        <rect x="198" y="302" width="104" height="12" rx="6" fill="#AEBBA6" />
        <path d="M176 258H318" stroke="#5E7A6C" strokeWidth="16" strokeLinecap="round" />
        <path d="M318 260L366 292" stroke="#5E7A6C" strokeWidth="15" strokeLinecap="round" />
        <path d="M184 246H316" stroke="#34434E" strokeWidth="20" strokeLinecap="round" />
        <path d="M316 248L358 278" stroke="#34434E" strokeWidth="16" strokeLinecap="round" />
        <circle cx="364" cy="284" r="8" fill="#E7A3B5" />
        <g className="ld-back">
          <path d="M178 258L112 200" stroke="#5E7A6C" strokeWidth="18" strokeLinecap="round" />
          <path d="M106 194L94 182" stroke="#4E6A5C" strokeWidth="14" strokeLinecap="round" />
          <path d="M184 244L128 198" stroke="#E7A3B5" strokeWidth="30" strokeLinecap="round" />
          <path d="M170 236L204 244" stroke="#E8BFA3" strokeWidth="9" strokeLinecap="round" />
          <circle cx="110" cy="182" r="16" fill="#2B2626" />
          <circle cx="118" cy="187" r="13" fill="#E8BFA3" />
        </g>
        <g className="ld-arm">
          <path d="M190 158L150 188" stroke="#D9D2C8" strokeWidth="14" strokeLinecap="round" />
          <path d="M190 158L150 188" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" />
          <circle cx="146" cy="191" r="5" fill="#E8BFA3" />
          <path d="M146 191L129 189" stroke="#7A8A90" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="127" cy="188" r="2.5" fill="#7A8A90" />
        </g>
        {/* Lamp switching on */}
        <path className="ld-beam" d="M134 102h26l24 70H110z" fill="#FFF3C4" />
        <rect x="124" y="84" width="46" height="18" rx="9" fill="#FFFFFF" stroke="#D9D2C8" strokeWidth="2" />
      </svg>
      <p className="loader-name">{c.brand}</p>
    </div>
  );
}
