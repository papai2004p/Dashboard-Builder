import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Reading } from '@/lib/types';
import { generatePDF } from '@/lib/generatePDF';
import * as XLSX from 'xlsx';

// ── Types ─────────────────────────────────────────────────────────────────────

type AssistantState = 'idle' | 'woken' | 'listening' | 'thinking' | 'speaking';

type IdleAnim =
  | 'bounce' | 'blink' | 'lookLeft' | 'lookRight' | 'smile'
  | 'wave' | 'tilt' | 'breathe' | 'float' | 'lookUp' | 'happy';

type ThinkAnim =
  | 'handCheek' | 'eyebrow' | 'looklr' | 'blink' | 'scratch'
  | 'question' | 'spin' | 'lookup' | 'cloud' | 'eyebrows' | 'chart' | 'dots'
  | 'lightbulb' | 'notebook' | 'gears' | 'sparkles';

interface VoiceAssistantProps {
  readings: Reading[];
  tempHistory: { time: number; value: number }[];
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn: boolean;
  systemMode: 'auto' | 'manual';
  onPumpToggle: (v: boolean) => void;
  onFanToggle: (v: boolean) => void;
  onModeChange: (m: 'auto' | 'manual') => void;
  onReset: () => void;
  onOpenAnalysis: () => void;
  onExportExcel: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WAKE_WORDS = [
  'hi pitch', 'hello pitch', 'hey pitch',
  'hi coach', 'hello coach', 'hey coach',
  'hi assistant', 'hello assistant', 'hey assistant',
  'smart pitch', 'cricket assistant',
];

const IDLE_ANIMS: IdleAnim[] = [
  'bounce', 'blink', 'lookLeft', 'lookRight', 'smile',
  'wave', 'tilt', 'breathe', 'float', 'lookUp', 'happy',
];

const THINK_ANIMS: ThinkAnim[] = [
  'handCheek', 'eyebrow', 'looklr', 'blink', 'scratch',
  'question', 'spin', 'lookup', 'cloud', 'eyebrows', 'chart', 'dots',
  'lightbulb', 'notebook', 'gears', 'sparkles',
];

// ── Cricket Ball Mascot SVG ───────────────────────────────────────────────────

function CricketBall({
  state,
  idleAnim,
  thinkAnim,
  mouthOpen,
  eyeX,
  eyeY,
  blinkNow,
}: {
  state: AssistantState;
  idleAnim: IdleAnim;
  thinkAnim: ThinkAnim;
  mouthOpen: number;
  eyeX: number;
  eyeY: number;
  blinkNow: boolean;
}) {
  const isIdle = state === 'idle';
  const isThinking = state === 'thinking';
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening' || state === 'woken';

  // Eye offset computation
  const eyeOffX =
    (isIdle && idleAnim === 'lookLeft') ? -3 :
    (isIdle && idleAnim === 'lookRight') ? 3 :
    (isThinking && thinkAnim === 'looklr') ? eyeX * 4 : 0;

  const eyeOffY =
    (isIdle && idleAnim === 'lookUp') ? -3 :
    (isThinking && (thinkAnim === 'lookup' || thinkAnim === 'eyebrow')) ? -2 : eyeY;

  const blinkScale = blinkNow || (isIdle && idleAnim === 'blink') ||
    (isThinking && thinkAnim === 'blink') ? 0.15 : 1;

  // Eyebrow offsets
  const lbrowY =
    (isThinking && thinkAnim === 'eyebrow') ? -4 :
    (isThinking && thinkAnim === 'eyebrows') ? -3 :
    (isListening) ? -2 :
    (isIdle && idleAnim === 'happy') ? -2 : 0;
  const rbrowY =
    (isThinking && thinkAnim === 'eyebrow') ? 0 :
    (isThinking && thinkAnim === 'eyebrows') ? -3 :
    (isListening) ? -2 :
    (isIdle && idleAnim === 'happy') ? -2 : 0;

  // Mouth shape
  const mouthCY =
    isSpeaking ? 72 + mouthOpen * 14 :
    isListening ? 78 :
    (isIdle && idleAnim === 'smile') ? 80 :
    (isIdle && idleAnim === 'happy') ? 82 :
    isThinking ? 70 : 76;
  const mouthPath = `M 38 70 Q 50 ${mouthCY.toFixed(1)} 62 70`;

  // Right hand position (wave, handCheek, scratch)
  const rHandX = (isIdle && idleAnim === 'wave') ? 88 :
    (isThinking && thinkAnim === 'handCheek') ? 72 :
    (isThinking && thinkAnim === 'scratch') ? 76 : 92;
  const rHandY = (isIdle && idleAnim === 'wave') ? 40 :
    (isThinking && thinkAnim === 'handCheek') ? 55 :
    (isThinking && thinkAnim === 'scratch') ? 48 : 55;

  return (
    <svg viewBox="-15 -10 130 130" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="va-ballGrad" cx="35%" cy="28%" r="65%">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="45%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </radialGradient>
        <radialGradient id="va-highlight" cx="28%" cy="22%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id="va-skinGrad" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="100%" stopColor="#dc2626" />
        </radialGradient>
        <filter id="va-shadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="rgba(0,0,0,0.30)" />
        </filter>
        <filter id="va-glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="va-greenGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Glow ring when listening */}
      {isListening && (
        <motion.circle
          cx="50" cy="50" r="48"
          fill="none" stroke="#22c55e" strokeWidth="3"
          opacity={0.6}
          filter="url(#va-greenGlow)"
          animate={{ r: [46, 50, 46], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {/* Glow ring when speaking */}
      {isSpeaking && (
        <motion.circle
          cx="50" cy="50" r="48"
          fill="none" stroke="#3b82f6" strokeWidth="3"
          opacity={0.5} filter="url(#va-glow)"
          animate={{ r: [45, 49, 45], opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* ── Legs ── */}
      {/* Left leg */}
      <motion.ellipse cx="38" cy="97" rx="7" ry="5" fill="url(#va-skinGrad)"
        animate={isIdle ? { y: [0, -1, 0] } : {}}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
      />
      {/* Right leg */}
      <motion.ellipse cx="62" cy="97" rx="7" ry="5" fill="url(#va-skinGrad)"
        animate={isIdle ? { y: [0, -1, 0] } : {}}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
      />

      {/* ── Left hand ── */}
      <motion.ellipse
        cx="8" cy="55" rx="7" ry="5"
        fill="url(#va-skinGrad)" stroke="#b91c1c" strokeWidth="0.4"
        animate={
          (isIdle && idleAnim === 'wave') ? { y: [0, -3, 0] } :
          isIdle ? { y: [0, 2, 0] } : {}
        }
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* ── Right hand ── */}
      <motion.ellipse
        cx={rHandX} cy={rHandY} rx="7" ry="5"
        fill="url(#va-skinGrad)" stroke="#b91c1c" strokeWidth="0.4"
        animate={
          (isIdle && idleAnim === 'wave') ? { y: [-8, 0, -8], rotate: [-15, 15, -15] } :
          (isThinking && thinkAnim === 'scratch') ? { x: [-2, 2, -2], y: [-2, 2, -2] } :
          isIdle ? { y: [0, 2, 0] } : {}
        }
        transition={{ duration: (isIdle && idleAnim === 'wave') ? 0.5 : 1.5, repeat: Infinity }}
      />

      {/* ── Main ball ── */}
      <circle cx="50" cy="50" r="44" fill="url(#va-ballGrad)" filter="url(#va-shadow)" />

      {/* ── Glossy highlight ── */}
      <ellipse cx="36" cy="31" rx="18" ry="12" fill="url(#va-highlight)" />

      {/* ── Seam lines ── */}
      <path d="M 29 8 Q 44 50 29 92" fill="none" stroke="white" strokeWidth="1.8"
        strokeLinecap="round" opacity="0.65" />
      {[18,28,38,48,58,68,78].map((cy, i) => (
        <line key={`sl-${i}`}
          x1={27 - Math.sin(i * 0.9) * 3} y1={cy}
          x2={21 - Math.sin(i * 0.9) * 3} y2={cy + 5}
          stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.55"
        />
      ))}
      {[16,26,36,46,56,66,76].map((cy, i) => (
        <line key={`sr-${i}`}
          x1={31 + Math.sin(i * 0.9) * 3} y1={cy}
          x2={37 + Math.sin(i * 0.9) * 3} y2={cy + 5}
          stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.55"
        />
      ))}

      {/* ── Eyebrows ── */}
      <motion.path d="M 28 33 Q 36 28 44 32"
        fill="none" stroke="#1c1917" strokeWidth="2.5" strokeLinecap="round"
        animate={{ y: lbrowY }} transition={{ duration: 0.3 }}
      />
      <motion.path d="M 56 32 Q 64 28 72 33"
        fill="none" stroke="#1c1917" strokeWidth="2.5" strokeLinecap="round"
        animate={{ y: rbrowY }} transition={{ duration: 0.3 }}
      />

      {/* ── Eyes ── */}
      <motion.g animate={{ x: eyeOffX, y: eyeOffY }} transition={{ duration: 0.4 }}>
        {/* Left eye white — scaleY blink (CSS transform, Framer-safe) */}
        <motion.ellipse cx="36" cy="46" rx="8.5" ry="8"
          style={{ transformOrigin: '36px 46px' }}
          animate={{ scaleY: blinkScale < 0.5 ? 0.15 : 1 }}
          transition={{ duration: 0.1 }}
          fill="white"
        />
        {/* Left pupil */}
        <motion.g
          style={{ transformOrigin: '36px 46px' }}
          animate={{ scaleY: blinkScale < 0.5 ? 0 : 1, opacity: blinkScale < 0.5 ? 0 : 1 }}
          transition={{ duration: 0.08 }}
        >
          <circle cx={36 + eyeOffX * 0.2} cy="47" r="4.5" fill="#1c1917" />
          <circle cx={37.5 + eyeOffX * 0.2} cy="44.5" r="1.6" fill="white" />
          <circle cx={36 + eyeOffX * 0.2} cy="49" r="0.8" fill="white" opacity="0.5" />
        </motion.g>

        {/* Right eye white — scaleY blink */}
        <motion.ellipse cx="64" cy="46" rx="8.5" ry="8"
          style={{ transformOrigin: '64px 46px' }}
          animate={{ scaleY: blinkScale < 0.5 ? 0.15 : 1 }}
          transition={{ duration: 0.1 }}
          fill="white"
        />
        {/* Right pupil */}
        <motion.g
          style={{ transformOrigin: '64px 46px' }}
          animate={{ scaleY: blinkScale < 0.5 ? 0 : 1, opacity: blinkScale < 0.5 ? 0 : 1 }}
          transition={{ duration: 0.08 }}
        >
          <circle cx={64 + eyeOffX * 0.2} cy="47" r="4.5" fill="#1c1917" />
          <circle cx={65.5 + eyeOffX * 0.2} cy="44.5" r="1.6" fill="white" />
          <circle cx={64 + eyeOffX * 0.2} cy="49" r="0.8" fill="white" opacity="0.5" />
        </motion.g>
      </motion.g>

      {/* ── Mouth ── */}
      <path d={mouthPath} fill="none" stroke="#1c1917" strokeWidth="2.8" strokeLinecap="round" />
      {/* Mouth open fill when speaking */}
      {isSpeaking && mouthOpen > 0.3 && (
        <path d={`M 38 70 Q 50 ${(72 + mouthOpen * 14).toFixed(1)} 62 70 Z`}
          fill="#7f1d1d" opacity="0.6"
        />
      )}

      {/* ── Thinking overlays ── */}
      <AnimatePresence>
        {isThinking && thinkAnim === 'question' && (
          <motion.text x="64" y="18" fontSize="16" fill="#fbbf24" fontWeight="bold"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >?</motion.text>
        )}
        {isThinking && thinkAnim === 'cloud' && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <circle cx="62" cy="18" r="5.5" fill="white" opacity="0.9" />
            <circle cx="70" cy="13" r="7" fill="white" opacity="0.9" />
            <circle cx="79" cy="18" r="5.5" fill="white" opacity="0.9" />
            <circle cx="66" cy="24" r="5.5" fill="white" opacity="0.9" />
            <circle cx="75" cy="24" r="5.5" fill="white" opacity="0.9" />
            <text x="62" y="22" fontSize="7" fill="#64748b" fontWeight="bold">...</text>
          </motion.g>
        )}
        {isThinking && thinkAnim === 'chart' && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <rect x="56" y="8" width="32" height="22" rx="3" fill="white" opacity="0.95" />
            <polyline points="59,27 63,20 68,23 73,14 78,17 85,11" fill="none" stroke="#22c55e" strokeWidth="1.5" />
            <text x="60" y="14" fontSize="5" fill="#94a3b8">📊</text>
          </motion.g>
        )}
        {isThinking && thinkAnim === 'dots' && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {[0, 1, 2].map(i => (
              <motion.circle key={i} cx={58 + i * 9} cy="14" r="4" fill="#fbbf24"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 0.6, delay: i * 0.2, repeat: Infinity }}
              />
            ))}
          </motion.g>
        )}
        {isThinking && thinkAnim === 'lightbulb' && (
          <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
            {/* Bulb glow */}
            <motion.circle cx="70" cy="13" r="10" fill="rgba(251,191,36,0.25)"
              animate={{ r: [8, 12, 8] }} transition={{ duration: 0.9, repeat: Infinity }}
            />
            <ellipse cx="70" cy="12" rx="6" ry="7" fill="#fbbf24" />
            <path d="M 66 18 Q 66 22 70 23 Q 74 22 74 18 Z" fill="#f59e0b" />
            <rect x="67.5" y="23" width="5" height="2.5" rx="1" fill="#92400e" />
            <motion.circle cx="70" cy="8" r="2.5" fill="white" opacity="0.7"
              animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.7, repeat: Infinity }}
            />
          </motion.g>
        )}
        {isThinking && thinkAnim === 'notebook' && (
          <motion.g initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <rect x="56" y="5" width="30" height="24" rx="3" fill="white" opacity="0.95" />
            <rect x="56" y="5" width="5" height="24" rx="2" fill="#3b82f6" opacity="0.8" />
            {[10, 14, 18, 22].map((cy, i) => (
              <motion.rect key={i} x="64" y={cy} width={i % 2 === 0 ? 16 : 12} height="1.5" rx="0.8" fill="#94a3b8"
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: i * 0.12 }}
              />
            ))}
          </motion.g>
        )}
        {isThinking && thinkAnim === 'gears' && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.g animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: '66px 14px' }}>
              <circle cx="66" cy="14" r="7" fill="none" stroke="#64748b" strokeWidth="2.5" />
              <circle cx="66" cy="14" r="3" fill="#64748b" />
              {[0,60,120,180,240,300].map((angle, i) => (
                <rect key={i} x="64.2" y="5.5" width="3.6" height="3" rx="1" fill="#64748b"
                  transform={`rotate(${angle} 66 14)`} />
              ))}
            </motion.g>
            <motion.g animate={{ rotate: -360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: '78px 22px' }}>
              <circle cx="78" cy="22" r="5" fill="none" stroke="#94a3b8" strokeWidth="2" />
              <circle cx="78" cy="22" r="2" fill="#94a3b8" />
              {[0,72,144,216,288].map((angle, i) => (
                <rect key={i} x="76.8" y="15.5" width="2.4" height="2.2" rx="0.8" fill="#94a3b8"
                  transform={`rotate(${angle} 78 22)`} />
              ))}
            </motion.g>
          </motion.g>
        )}
        {isThinking && thinkAnim === 'sparkles' && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {[
              { cx: 65, cy: 10, r: 3, delay: 0 },
              { cx: 75, cy: 6,  r: 2, delay: 0.2 },
              { cx: 82, cy: 14, r: 2.5, delay: 0.4 },
              { cx: 70, cy: 18, r: 1.8, delay: 0.15 },
            ].map((s, i) => (
              <motion.g key={i}>
                <motion.circle cx={s.cx} cy={s.cy} r={s.r} fill="#fbbf24"
                  animate={{ opacity: [0, 1, 0], scale: [0.5, 1.3, 0.5] }}
                  transition={{ duration: 0.8, delay: s.delay, repeat: Infinity, repeatDelay: 0.3 }}
                />
                {/* Star cross */}
                <motion.line x1={s.cx - s.r * 1.4} y1={s.cy} x2={s.cx + s.r * 1.4} y2={s.cy}
                  stroke="#fbbf24" strokeWidth="1" strokeLinecap="round"
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8, delay: s.delay, repeat: Infinity, repeatDelay: 0.3 }}
                />
                <motion.line x1={s.cx} y1={s.cy - s.r * 1.4} x2={s.cx} y2={s.cy + s.r * 1.4}
                  stroke="#fbbf24" strokeWidth="1" strokeLinecap="round"
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8, delay: s.delay, repeat: Infinity, repeatDelay: 0.3 }}
                />
              </motion.g>
            ))}
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}

// ── Grass Wave Screen Effect ──────────────────────────────────────────────────

function GrassWaveEffect({ active }: { active: boolean }) {
  const WAVE_COLORS = [
    'rgba(134,239,172,0.18)',  // light green
    'rgba(34,197,94,0.14)',    // grass green
    'rgba(21,128,61,0.10)',    // dark green
    'rgba(186,230,253,0.12)',  // soft blue
    'rgba(255,255,255,0.08)',  // white
  ];

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: 55 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
        >
          {/* Dark overlay */}
          <motion.div
            className="absolute inset-0 bg-slate-950"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />

          {/* Background blur */}
          <motion.div
            className="absolute inset-0"
            style={{ backdropFilter: 'blur(3px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Grass waves radiating from bottom-center */}
          {WAVE_COLORS.map((color, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                bottom: '72px',
                left: '50%',
                width: 30,
                height: 30,
                marginLeft: -15,
                marginBottom: -15,
                background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
                border: `2px solid ${color.replace('0.', '0.4')}`,
              }}
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 22 + i * 6, opacity: 0 }}
              transition={{
                duration: 2.2,
                delay: i * 0.28,
                repeat: Infinity,
                repeatDelay: 0.8,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            />
          ))}

          {/* Radial green shimmer */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 60% 40% at 50% 100%, rgba(34,197,94,0.18) 0%, rgba(21,128,61,0.08) 50%, transparent 80%)',
            }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Voice Waveform ────────────────────────────────────────────────────────────

function VoiceWaveform({ active }: { active: boolean }) {
  const bars = [0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 0.85, 0.45, 0.75, 0.55, 0.9];
  return (
    <div className="flex items-end gap-[3px] h-8">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-gradient-to-t from-green-600 to-green-400"
          style={{ height: `${h * 100}%` }}
          animate={active ? {
            scaleY: [h, h * 0.3 + Math.random() * 0.7, h],
          } : { scaleY: 0.2 }}
          transition={{
            duration: 0.3 + (i % 4) * 0.07,
            repeat: active ? Infinity : 0,
            repeatType: 'mirror',
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ── Command Processor ─────────────────────────────────────────────────────────

function processCommand(
  raw: string,
  ctx: {
    pumpOn: boolean; fanOn: boolean; mode: 'auto' | 'manual';
    currentTemp: number; currentHum: number; currentSoil: number;
    condition: string; tStats: any; hStats: any; sStats: any;
    readings: Reading[];
    onPumpToggle: (v: boolean) => void;
    onFanToggle: (v: boolean) => void;
    onModeChange: (m: 'auto' | 'manual') => void;
    onReset: () => void;
    onOpenAnalysis: () => void;
    onExportPDF: () => void;
    onExportExcel: () => void;
  }
): string {
  const t = raw.toLowerCase().trim();

  // ── Greetings ──
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)(\s|$)/.test(t)) {
    const h = new Date().getHours();
    const gr = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return `${gr}! I'm Pitch, your AI cricket companion. I'm watching all your sensors in real-time. How can I help you today?`;
  }
  if (/who are you|what are you|introduce/.test(t)) {
    return `I'm Pitch — your AI cricket pitch assistant! I can read live sensor data, control the pump and fan, export reports, analyse the pitch, and navigate the dashboard. Just tell me what you need.`;
  }
  if (/what can you do|how can you help|help me|capabilities/.test(t)) {
    return `I can check temperature, humidity, and soil moisture; control the water pump and drying fan; switch between automatic and manual mode; export a PDF report or Excel spreadsheet; open sensor analytics; and navigate the dashboard. What would you like?`;
  }
  if (/thank/.test(t)) {
    return `You're most welcome! I'm always here keeping your cricket pitch in perfect condition.`;
  }
  if (/bye|goodbye|see you|dismiss/.test(t)) {
    return `Goodbye! I'll keep a close eye on the pitch while you're away. Come back anytime!`;
  }

  // ── Navigation ──
  if (/scroll up|go up/.test(t)) {
    window.scrollBy({ top: -350, behavior: 'smooth' });
    return `Scrolled up for you.`;
  }
  if (/scroll down|go down/.test(t)) {
    window.scrollBy({ top: 350, behavior: 'smooth' });
    return `Scrolled down for you.`;
  }
  if (/go to top|scroll to top|top of page/.test(t)) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return `Taking you to the top of the dashboard.`;
  }
  if (/go to graph|show graph|view graph|show temperature|show humidity|show moisture|update graph/.test(t)) {
    document.querySelector('[data-section="charts"]')?.scrollIntoView({ behavior: 'smooth' });
    window.scrollBy({ top: -80, behavior: 'smooth' });
    return `Navigating to the sensor graphs.`;
  }
  if (/go to quick action|quick action/.test(t)) {
    document.querySelector('[data-section="quickactions"]')?.scrollIntoView({ behavior: 'smooth' });
    return `Navigating to Quick Actions.`;
  }
  if (/go to history|open history|show history|reading history/.test(t)) {
    document.querySelector('[data-section="history"]')?.scrollIntoView({ behavior: 'smooth' });
    return `The reading history is displayed below. The latest reading shows temperature ${ctx.currentTemp}°C and soil moisture ${ctx.currentSoil}%.`;
  }
  if (/close popup|close modal|close analytics|close panel/.test(t)) {
    ctx.onOpenAnalysis();
    return `Closing the analytics panel.`;
  }

  // ── Mode ──
  if ((/auto(matic)?(\s+mode)?|switch.*auto|enable.*auto|set.*auto|disable.*auto.*off/.test(t)) && !/manual/.test(t)) {
    ctx.onModeChange('auto');
    return `Automatic mode activated! The ESP32 will now manage the pump and fan based on live soil moisture. You can relax — I've got it covered.`;
  }
  if (/manual(\s+mode)?|switch.*manual|enable.*manual|set.*manual|switch to manual|disable automatic/.test(t)) {
    ctx.onModeChange('manual');
    return `Switched to manual mode. You're now in full control of the water pump and drying fan.`;
  }
  if (/current mode|what.*mode|which mode/.test(t)) {
    return `You're currently in ${ctx.mode === 'auto' ? 'Automatic' : 'Manual'} mode. ${ctx.mode === 'auto' ? 'The ESP32 is managing things automatically.' : 'You have manual control of the pump and fan.'}`;
  }

  // ── Pump ──
  if (/turn on pump|pump on|start (pump|water|irrig)|water the pitch|enable pump|enable irrig|pump start|switch pump on/.test(t)) {
    if (ctx.mode === 'auto') return `The system is in automatic mode. Please switch to manual mode first, and then I can turn the pump on for you.`;
    ctx.onPumpToggle(true);
    return `Water pump switched ON! Irrigation has started. The pitch is now being watered.`;
  }
  if (/turn off pump|pump off|stop (pump|water|irrig)|disable pump|stop watering|pump stop|switch pump off/.test(t)) {
    if (ctx.mode === 'auto') return `I'm in automatic mode. Please switch to manual mode to control the pump directly.`;
    ctx.onPumpToggle(false);
    return `Water pump switched OFF. Irrigation stopped successfully.`;
  }
  if (/pump status|is the pump/.test(t)) {
    return `The water pump is currently ${ctx.pumpOn ? 'ON and actively irrigating the pitch' : 'OFF'}.`;
  }

  // ── Fan ──
  if (/turn on fan|fan on|start fan|start dry|enable fan|dry the pitch|switch fan on|fan start/.test(t)) {
    if (ctx.mode === 'auto') return `I'm in automatic mode. Please switch to manual mode to control the fan manually.`;
    ctx.onFanToggle(true);
    return `Sure! Switching the drying fan ON now. The pitch will begin drying.`;
  }
  if (/turn off fan|fan off|stop fan|stop dry|disable fan|switch fan off|fan stop/.test(t)) {
    if (ctx.mode === 'auto') return `I'm in automatic mode. Switch to manual mode to stop the fan manually.`;
    ctx.onFanToggle(false);
    return `Drying fan switched OFF. The pitch will retain its current moisture level.`;
  }
  if (/fan status|is the fan/.test(t)) {
    return `The drying fan is currently ${ctx.fanOn ? 'ON and actively drying the pitch' : 'OFF'}.`;
  }

  // ── Sensor stat queries ──
  if (/highest temp/.test(t)) return `The highest recorded temperature is ${ctx.tStats.max}°C.`;
  if (/lowest temp/.test(t)) return `The lowest recorded temperature is ${ctx.tStats.min}°C.`;
  if (/average temp/.test(t)) return `The average temperature is ${ctx.tStats.avg}°C.`;
  if (/highest hum/.test(t)) return `The highest recorded humidity is ${ctx.hStats.max}%.`;
  if (/lowest hum/.test(t)) return `The lowest recorded humidity is ${ctx.hStats.min}%.`;
  if (/average hum/.test(t)) return `The average humidity is ${ctx.hStats.avg}%.`;
  if (/highest (soil|moist)/.test(t)) return `The highest soil moisture recorded is ${ctx.sStats.max}%.`;
  if (/lowest (soil|moist)/.test(t)) return `The lowest soil moisture recorded is ${ctx.sStats.min}%.`;
  if (/average (soil|moist)/.test(t)) return `The average soil moisture is ${ctx.sStats.avg}%.`;

  // ── Live sensor reads ──
  if (/temperature|temp/.test(t)) {
    const s = ctx.currentTemp > 34 ? 'slightly high' : ctx.currentTemp < 29 ? 'on the lower side' : 'within the normal range';
    return `The current temperature is ${ctx.currentTemp}°C — ${s} for an ideal cricket pitch.`;
  }
  if (/humidity|humid/.test(t)) {
    const s = ctx.currentHum > 75 ? 'high — consider drying' : ctx.currentHum < 60 ? 'low — the pitch may be drying out' : 'within the optimal range';
    return `The current humidity is ${ctx.currentHum}%, which is ${s}.`;
  }
  if (/soil|moisture/.test(t)) {
    return `The current soil moisture is ${ctx.currentSoil}%. The pitch condition is ${ctx.condition}.`;
  }
  if (/esp32|wifi|wi-fi|database|connection|system status/.test(t)) {
    return `All systems are fully operational. ESP32 microcontroller is online, Wi-Fi is connected, and the database is syncing perfectly.`;
  }
  if (/last update|last reading/.test(t)) {
    return `The last reading came in just now — temperature ${ctx.currentTemp}°C, humidity ${ctx.currentHum}%, and soil moisture ${ctx.currentSoil}%.`;
  }
  if (/who are you|what are you|introduce/.test(t)) {
    return `I'm Pitch — your AI cricket pitch assistant! I can read live sensor data, control the pump and fan, export reports, analyse the pitch, and navigate the dashboard. Just tell me what you need.`;
  }

  // ── Pitch condition ──
  if (/how is the pitch|pitch condition|pitch health|current condition/.test(t)) {
    const advice = ctx.condition === 'Balanced' ? 'The pitch is in excellent condition — ready for play!'
      : ctx.condition === 'Dry' ? 'The pitch is dry. I recommend activating the water pump.'
      : 'The pitch is too wet. I recommend switching on the drying fan.';
    return `The pitch condition is "${ctx.condition}". Temperature: ${ctx.currentTemp}°C, Humidity: ${ctx.currentHum}%, Soil: ${ctx.currentSoil}%. ${advice}`;
  }
  if (/predict|forecast|trend/.test(t)) {
    return `Based on current sensor trends, the pitch is likely to remain ${ctx.condition} for the next 20–30 minutes. Keep monitoring soil moisture closely.`;
  }

  // ── Exports ──
  if (/pdf|export report|download report|generate report|save report|create report/.test(t)) {
    ctx.onExportPDF();
    return `Your professional cricket pitch monitoring report is being generated. The PDF will download in just a moment.`;
  }
  if (/excel|spreadsheet|export excel|download excel|generate spreadsheet/.test(t)) {
    ctx.onExportExcel();
    return `Exporting all sensor readings to Excel. The file will download shortly.`;
  }

  // ── Analytics ──
  if (/analys|open analys|visual analys|show graph|view data|show chart/.test(t)) {
    ctx.onOpenAnalysis();
    return `Opening the sensor analytics panel with live charts and statistics.`;
  }

  // ── Reset / Refresh ──
  if (/reset|refresh|reload|clear|update reading|update graph/.test(t)) {
    ctx.onReset();
    return `Dashboard refreshed! Sensor data will update with the next ESP32 reading cycle.`;
  }

  // ── Unknown ──
  return `I didn't quite catch that. You can ask me things like "What's the temperature?", "Turn on the fan", "Export PDF", or "Switch to auto mode". What would you like to know?`;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VoiceAssistant({
  readings, tempHistory, humHistory, soilHistory,
  pumpOn, fanOn, systemMode,
  onPumpToggle, onFanToggle, onModeChange, onReset, onOpenAnalysis, onExportExcel,
}: VoiceAssistantProps) {
  const [state, setState] = useState<AssistantState>('idle');
  const [idleAnim, setIdleAnim] = useState<IdleAnim>('bounce');
  const [thinkAnim, setThinkAnim] = useState<ThinkAnim>('eyebrow');
  const [mouthOpen, setMouthOpen] = useState(0);
  const [eyeX, setEyeX] = useState(0);
  const [eyeY, setEyeY] = useState(0);
  const [blinkNow, setBlinkNow] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [commandText, setCommandText] = useState('');
  const [responseText, setResponseText] = useState('');
  const [isSupported, setIsSupported] = useState(true);

  const recRef = useRef<any>(null);
  const shouldListenRef = useRef(true);
  const stateRef = useRef<AssistantState>('idle');
  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eyeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  const ctxRef = useRef({
    readings, tempHistory, humHistory, soilHistory,
    pumpOn, fanOn, systemMode,
    onPumpToggle, onFanToggle, onModeChange, onReset, onOpenAnalysis, onExportExcel,
  });
  useEffect(() => {
    ctxRef.current = {
      readings, tempHistory, humHistory, soilHistory,
      pumpOn, fanOn, systemMode,
      onPumpToggle, onFanToggle, onModeChange, onReset, onOpenAnalysis, onExportExcel,
    };
  });

  // ── Idle animation cycle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
    if (state !== 'idle') return;

    const pickIdle = () => {
      const next = IDLE_ANIMS[Math.floor(Math.random() * IDLE_ANIMS.length)];
      setIdleAnim(next);
    };
    pickIdle();
    idleIntervalRef.current = setInterval(pickIdle, 3500);
    return () => { if (idleIntervalRef.current) clearInterval(idleIntervalRef.current); };
  }, [state]);

  // ── Idle blink (independent of idle anim) ───────────────────────────────────
  useEffect(() => {
    if (state !== 'idle') return;
    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 5000;
      blinkTimeoutRef.current = setTimeout(() => {
        setBlinkNow(true);
        setTimeout(() => setBlinkNow(false), 150);
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
    return () => { if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current); };
  }, [state]);

  // ── Eye wander ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (eyeIntervalRef.current) clearInterval(eyeIntervalRef.current);
    if (state === 'idle') {
      eyeIntervalRef.current = setInterval(() => {
        setEyeX((Math.random() - 0.5) * 2.5);
        setEyeY((Math.random() - 0.5) * 1.5);
      }, 2800);
    }
    return () => { if (eyeIntervalRef.current) clearInterval(eyeIntervalRef.current); };
  }, [state]);

  // ── Thinking animation cycle ─────────────────────────────────────────────────
  useEffect(() => {
    if (state !== 'thinking') return;
    const pick = () => setThinkAnim(THINK_ANIMS[Math.floor(Math.random() * THINK_ANIMS.length)]);
    pick();
    const id = setInterval(pick, 700);
    return () => clearInterval(id);
  }, [state]);

  // ── TTS ──────────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string, onDone?: () => void) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.92;
    utter.pitch = 1.08;
    utter.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /samantha|karen|moira|google uk/i.test(v.name))
      || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utter.voice = preferred;

    if (mouthIntervalRef.current) clearInterval(mouthIntervalRef.current);
    mouthIntervalRef.current = setInterval(() => setMouthOpen(Math.random()), 110);

    utter.onend = () => {
      if (mouthIntervalRef.current) clearInterval(mouthIntervalRef.current);
      setMouthOpen(0);
      onDone?.();
    };
    window.speechSynthesis.speak(utter);
  }, []);

  // ── Wake word check ──────────────────────────────────────────────────────────
  const checkForWakeWord = useCallback((transcript: string): boolean =>
    WAKE_WORDS.some(w => transcript.toLowerCase().includes(w)), []);

  const stripWakeWord = (transcript: string): string => {
    let t = transcript.toLowerCase();
    for (const w of WAKE_WORDS) t = t.replace(w, '').trim();
    return t;
  };

  // ── Wake assistant ───────────────────────────────────────────────────────────
  const wakeAssistant = useCallback(() => {
    if (stateRef.current !== 'idle') return;
    setState('woken');
    setStatusText('Waking up...');
    setCommandText('');
    setResponseText('');

    speak('Yes? I\'m listening!', () => {
      setState('listening');
      setStatusText('Listening...');
      commandTimeoutRef.current = setTimeout(() => {
        if (stateRef.current === 'listening') {
          setState('thinking');
          speak("I didn't catch that. Anything else you need?", () => {
            setState('idle');
            setStatusText('');
          });
        }
      }, 8000);
    });
  }, [speak]);

  // ── Handle command ───────────────────────────────────────────────────────────
  const handleCommand = useCallback((transcript: string) => {
    if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    setState('thinking');
    setCommandText(`"${transcript}"`);
    setStatusText('Thinking...');

    const ctx = ctxRef.current;
    const currentTemp = ctx.tempHistory.length ? ctx.tempHistory[ctx.tempHistory.length - 1].value : 31.2;
    const currentHum = ctx.humHistory.length ? ctx.humHistory[ctx.humHistory.length - 1].value : 68;
    const currentSoil = ctx.soilHistory.length ? ctx.soilHistory[ctx.soilHistory.length - 1].value : 42;
    const condition = currentSoil < 35 ? 'Dry' : currentSoil > 65 ? 'Wet' : 'Balanced';

    const calcStat = (h: { value: number }[]) => {
      if (!h.length) return { max: '0', min: '0', avg: '0' };
      const v = h.map(x => x.value);
      return {
        max: Math.max(...v).toFixed(1),
        min: Math.min(...v).toFixed(1),
        avg: (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1),
      };
    };

    const response = processCommand(transcript, {
      pumpOn: ctx.pumpOn, fanOn: ctx.fanOn, mode: ctx.systemMode,
      currentTemp, currentHum, currentSoil, condition,
      tStats: calcStat(ctx.tempHistory),
      hStats: calcStat(ctx.humHistory),
      sStats: calcStat(ctx.soilHistory),
      readings: ctx.readings,
      onPumpToggle: ctx.onPumpToggle,
      onFanToggle: ctx.onFanToggle,
      onModeChange: ctx.onModeChange,
      onReset: ctx.onReset,
      onOpenAnalysis: ctx.onOpenAnalysis,
      onExportPDF: () => {
        try {
          generatePDF({
            readings: ctx.readings,
            tempHistory: ctx.tempHistory,
            humHistory: ctx.humHistory,
            soilHistory: ctx.soilHistory,
            pumpOn: ctx.pumpOn,
            fanOn: ctx.fanOn,
            mode: ctx.systemMode,
          });
        } catch (e) { console.error('PDF error', e); }
      },
      onExportExcel: () => {
        try {
          const header = ['Time', 'Temperature (°C)', 'Humidity (%)', 'Soil Moisture (%)', 'Pitch Status', 'Pump', 'Fan', 'Mode'];
          const rows = ctx.readings.map(r => [
            r.time, r.temp, r.humidity, r.soil, r.pitchStatus,
            r.pumpOn ? 'ON' : 'OFF', r.fanOn ? 'ON' : 'OFF', r.mode,
          ]);
          const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Readings');
          XLSX.writeFile(wb, 'Cricket-Pitch-Readings.xlsx');
        } catch (e) { console.error('Excel error', e); }
      },
    });

    setTimeout(() => {
      setState('speaking');
      setStatusText('Speaking...');
      setResponseText(response);
      speak(response, () => {
        setState('listening');
        setStatusText('Listening for another command...');
        commandTimeoutRef.current = setTimeout(() => {
          if (stateRef.current === 'listening') {
            setState('idle');
            setStatusText('');
            setCommandText('');
            setResponseText('');
          }
        }, 7000);
      });
    }, 600);
  }, [speak]);

  // ── Speech Recognition ───────────────────────────────────────────────────────
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setIsSupported(false); return; }

    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recRef.current = rec;

    let lastFinal = '';
    rec.onresult = (e: any) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      const candidate = (final || interim).trim();
      if (!candidate) return;

      if (stateRef.current === 'idle') {
        if (checkForWakeWord(candidate)) wakeAssistant();
      } else if (stateRef.current === 'listening' && final && final !== lastFinal) {
        lastFinal = final;
        const cmd = stripWakeWord(final) || final;
        if (cmd.trim().length > 1) handleCommand(cmd.trim());
      }
    };
    rec.onend = () => {
      if (shouldListenRef.current) setTimeout(() => { try { rec.start(); } catch (_) {} }, 200);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') { setIsSupported(false); return; }
      setTimeout(() => { try { rec.start(); } catch (_) {} }, 500);
    };
    try { rec.start(); } catch (_) {}

    return () => {
      shouldListenRef.current = false;
      try { rec.stop(); } catch (_) {}
    };
  }, [checkForWakeWord, wakeAssistant, handleCommand]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    window.speechSynthesis.cancel();
    if (mouthIntervalRef.current) clearInterval(mouthIntervalRef.current);
    if (eyeIntervalRef.current) clearInterval(eyeIntervalRef.current);
    if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
    if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
  }, []);

  if (!isSupported) return null;

  const isActive = state !== 'idle';

  // ── Idle idle animation modifiers ────────────────────────────────────────────
  const idleY = isActive ? 0
    : ['bounce', 'float', 'breathe'].includes(idleAnim) ? [0, -8, 0]
    : idleAnim === 'wave' ? [0, -4, 0]
    : [0, -4, 0];
  const idleRotate = isActive ? 0
    : idleAnim === 'tilt' ? [-6, 6, -6]
    : idleAnim === 'spin' ? [0, 360]
    : 0;
  const idleScale = isActive ? 1
    : idleAnim === 'breathe' ? [1, 1.04, 1] : 1;

  return (
    <>
      {/* ── Grass wave screen effect ── */}
      <GrassWaveEffect active={isActive} />

      {/* ── Floating assistant container ── */}
      <div
        className="fixed z-[60]"
        style={{
          bottom: 24,
          right: isActive ? undefined : 24,
          left: isActive ? '50%' : undefined,
          transform: isActive ? 'translateX(-50%)' : undefined,
          transition: 'left 0.5s cubic-bezier(0.34,1.56,0.64,1), right 0.5s ease, transform 0.5s ease',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* ── Assistant panel ── */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              className="pointer-events-auto"
              initial={{ opacity: 0, y: 24, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.92 }}
              transition={{ type: 'spring', damping: 22, stiffness: 220 }}
              style={{ width: 320 }}
            >
              <div
                className="rounded-[22px] p-5 border border-white/25 shadow-2xl"
                style={{
                  background: 'rgba(15,23,42,0.82)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                {/* Status row */}
                <div className="flex items-center gap-2.5 mb-3">
                  <motion.div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      state === 'listening' ? 'bg-green-400' :
                      state === 'thinking' ? 'bg-amber-400' :
                      state === 'speaking' ? 'bg-blue-400' : 'bg-slate-500'
                    }`}
                    animate={{ scale: state === 'listening' ? [1, 1.5, 1] : 1, opacity: [1, 0.6, 1] }}
                    transition={{ duration: 0.8, repeat: state === 'listening' ? Infinity : 0 }}
                  />
                  <span className={`text-xs font-bold tracking-widest uppercase ${
                    state === 'listening' ? 'text-green-400' :
                    state === 'thinking' ? 'text-amber-400' :
                    state === 'speaking' ? 'text-blue-400' : 'text-slate-400'
                  }`}>
                    {state === 'woken' ? 'Waking Up…' :
                     state === 'listening' ? 'Listening…' :
                     state === 'thinking' ? 'Thinking…' :
                     state === 'speaking' ? 'Speaking' : ''}
                  </span>
                  {/* Microphone icon when listening */}
                  {state === 'listening' && (
                    <motion.div
                      className="ml-auto w-7 h-7 rounded-full bg-green-500/20 border border-green-400/40 flex items-center justify-center"
                      animate={{ boxShadow: ['0 0 0 0 rgba(34,197,94,0.4)', '0 0 0 8px rgba(34,197,94,0)', '0 0 0 0 rgba(34,197,94,0)'] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <rect x="9" y="2" width="6" height="13" rx="3" fill="#4ade80" />
                        <path d="M5 10v2a7 7 0 0014 0v-2" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
                        <line x1="12" y1="19" x2="12" y2="23" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </motion.div>
                  )}
                </div>

                {/* Waveform when listening */}
                {state === 'listening' && (
                  <div className="mb-3">
                    <VoiceWaveform active={state === 'listening'} />
                  </div>
                )}

                {/* Thinking dots */}
                {state === 'thinking' && (
                  <div className="flex gap-1.5 mb-3">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-amber-400"
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }}
                      />
                    ))}
                  </div>
                )}

                {/* Recognized command */}
                <AnimatePresence>
                  {commandText && (
                    <motion.div
                      className="mb-2 px-3 py-1.5 rounded-xl bg-white/8 border border-white/10"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">You said</p>
                      <p className="text-sm text-green-300 font-semibold italic">{commandText}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Response text */}
                <AnimatePresence>
                  {responseText && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <p className="text-sm text-white/90 leading-relaxed font-medium">{responseText}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Hint when first listening */}
                {state === 'listening' && !commandText && (
                  <p className="text-[11px] text-slate-400 mt-1">Say a command or ask a question…</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Cricket Ball Mascot ── */}
        <motion.div
          className="cursor-pointer relative flex-shrink-0"
          style={{
            pointerEvents: 'auto',
            width: isActive ? 140 : 64,
            height: isActive ? 140 : 64,
          }}
          animate={{
            width: isActive ? 140 : 64,
            height: isActive ? 140 : 64,
            y: isActive ? 0 : idleY,
            rotate: isActive ? 0 : idleRotate,
            scale: isActive ? 1 : idleScale,
          }}
          transition={{
            width: { type: 'spring', damping: 18, stiffness: 180 },
            height: { type: 'spring', damping: 18, stiffness: 180 },
            y: { duration: idleAnim === 'bounce' ? 1.8 : 3, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: idleAnim === 'spin' ? 1.5 : 3, repeat: Infinity, ease: 'easeInOut' },
            scale: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
          }}
          onClick={() => {
            if (state === 'idle') {
              wakeAssistant();
            } else if (state !== 'thinking') {
              window.speechSynthesis.cancel();
              setState('idle');
              setStatusText('');
              setCommandText('');
              setResponseText('');
            }
          }}
          title={state === 'idle' ? 'Click to activate Pitch AI, or say "Hey Pitch"' : 'Click to dismiss'}
          whileHover={{ scale: isActive ? 1.05 : 1.12 }}
          whileTap={{ scale: 0.93 }}
        >
          {/* Glow/shadow ring */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: isActive
                ? '0 0 40px rgba(34,197,94,0.35), 0 8px 32px rgba(0,0,0,0.5)'
                : '0 8px 24px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.08)',
              transition: 'box-shadow 0.5s ease',
              borderRadius: '50%',
            }}
          />

          <CricketBall
            state={state}
            idleAnim={idleAnim}
            thinkAnim={thinkAnim}
            mouthOpen={mouthOpen}
            eyeX={eyeX}
            eyeY={eyeY}
            blinkNow={blinkNow}
          />
        </motion.div>

        {/* ── Idle label pill ── */}
        {!isActive && (
          <motion.div
            className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-900/85 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap border border-white/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 4, delay: 4, repeat: Infinity, repeatDelay: 12 }}
          >
            🎤 Say "Hey Pitch"
          </motion.div>
        )}
      </div>
    </>
  );
}
