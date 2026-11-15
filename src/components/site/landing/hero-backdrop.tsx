"use client";
import { motion, useReducedMotion } from "framer-motion";
import { Parallax } from "../motion";

/** 2.1 hero foot (design "Gala Dock Connected Event Platform"): the soft London skyline band and the "Scroll to explore" cue.
 *  The skyline is a decorative SVG (no photo, no network cost) that drifts with a slow parallax; the cue is a real link to the next
 *  section whose wheel dot loops gently (three times, then rests; static under reduced motion). */
const BUILDINGS: [number, number, number][] = [
  // x, width, height (viewBox 1600 × 190)
  [0, 46, 70], [50, 30, 104], [84, 54, 82], [142, 26, 128], [172, 60, 96], [236, 34, 64], [274, 44, 118], [322, 70, 86], [396, 30, 140], [430, 52, 100],
  [486, 64, 74], [554, 28, 112], [586, 58, 92], [648, 40, 66], [692, 66, 106], [762, 34, 80], [800, 48, 124], [852, 60, 88], [916, 26, 70],
  [946, 56, 116], [1006, 38, 84], [1048, 62, 100], [1114, 30, 76], [1148, 50, 132], [1202, 64, 94], [1270, 36, 70], [1310, 58, 110],
  [1372, 44, 86], [1420, 60, 120], [1484, 34, 78], [1522, 78, 98],
];

export function HeroBackdrop() {
  const reduce = useReducedMotion();
  return <div className="gpl-hero-foot">
    <Parallax className="gpl-skyline" distance={-28}>
      <svg viewBox="0 0 1600 190" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="gpl-sky-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b9c8e4" stopOpacity=".15" /><stop offset=".5" stopColor="#c3d0ea" stopOpacity=".7" /><stop offset="1" stopColor="#dbe4f5" stopOpacity=".95" /></linearGradient>
        </defs>
        <path d="M0 150 C 260 112 520 118 800 132 S 1340 150 1600 120 L1600 190 L0 190 Z" fill="#f1f5fc" />
        <g fill="url(#gpl-sky-fade)">
          {BUILDINGS.map(([x, w, h], i) => { const t = Math.round(h * (i % 3 === 0 ? .62 : i % 3 === 1 ? .78 : .7)); return <rect key={x} x={x} y={190 - t} width={w - 3} height={t} rx="1" />; })}
          {/* The Shard and a gherkin, so the band reads as London without a photograph. */}
          <path d="M1060 190 L1090 26 L1096 18 L1100 26 L1128 190 Z" />
          <path d="M700 190 C 700 120 716 86 732 82 C 748 86 764 120 764 190 Z" />
        </g>
      </svg>
    </Parallax>
    <a className="gpl-scroll" href="#three-ways">
      <span className="gpl-scroll-mouse" aria-hidden="true">
        <motion.i animate={reduce ? undefined : { y: [0, 7, 0], opacity: [1, .25, 1] }} transition={{ duration: 1.8, ease: "easeInOut", repeat: 2, repeatDelay: .6, delay: 1.4 }} />
      </span>
      <span>Scroll to explore</span>
    </a>
  </div>;
}
