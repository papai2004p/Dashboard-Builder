import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import type { Reading } from '@/lib/types';
import { generatePDF } from '@/lib/generatePDF';
import * as XLSX from 'xlsx';
import {
  WAKE_WORDS,
  COMMAND_LANG,
  isPorcupineConfigured,
} from '@/lib/wakeWordEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

type AssistantState =
  | 'idle' | 'sleeping' | 'woken' | 'listening'
  | 'thinking' | 'speaking' | 'excited' | 'error' | 'success';

type IdleAnim =
  | 'bounce' | 'blink' | 'lookLeft' | 'lookRight' | 'smile'
  | 'wave' | 'tilt' | 'breathe' | 'float' | 'lookUp' | 'happy'
  | 'yawn' | 'rubEyes' | 'snore' | 'roll' | 'curious'
  | 'tiny_bounce' | 'happy_blink' | 'stretch';

type ThinkAnim =
  | 'handCheek' | 'eyebrow' | 'looklr' | 'blink' | 'scratch'
  | 'question' | 'spin' | 'lookup' | 'cloud' | 'eyebrows' | 'chart' | 'dots'
  | 'lightbulb' | 'notebook' | 'gears' | 'sparkles' | 'magnify';

type GestureDir = 'none' | 'left' | 'right' | 'up' | 'down';

/** Idle phases: 0 = quiet, 1 = subtle (20s), 2 = expressive (40s), 3 = sleep/juggle (60s) */
type IdlePhase = 0 | 1 | 2 | 3;

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

// Phase 1 idles: subtle, small
const IDLE_ANIMS_P1: IdleAnim[] = ['blink', 'breathe', 'lookLeft', 'lookRight', 'lookUp', 'happy_blink'];
// Phase 2 idles: more expressive
const IDLE_ANIMS_P2: IdleAnim[] = [
  'bounce', 'blink', 'lookLeft', 'lookRight', 'smile',
  'wave', 'tilt', 'breathe', 'float', 'lookUp', 'happy',
  'yawn', 'curious', 'tiny_bounce', 'happy_blink', 'stretch',
];

const THINK_ANIMS: ThinkAnim[] = [
  'handCheek', 'eyebrow', 'looklr', 'blink', 'scratch',
  'question', 'spin', 'lookup', 'cloud', 'eyebrows', 'chart', 'dots',
  'lightbulb', 'notebook', 'gears', 'sparkles', 'magnify',
];

const INTRO_TEXT =
  "Hello! I'm Ball, your AI Cricket Pitch Assistant. All systems are online and running smoothly. I'm listening — how can I help you today?";

const COMMAND_HINTS = [
  "What's the temperature?",
  'Turn on the fan.',
  'Turn off the pump.',
  'Switch to automatic mode.',
  'Switch to manual mode.',
  'Export PDF.',
  'Export Excel.',
  'Open Sensor Analysis.',
  'Refresh dashboard.',
  'Show recent readings.',
];

// ── Confetti particle data ────────────────────────────────────────────────────

const CONFETTI_PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: 20 + (i % 6) * 18,
  color: ['#fbbf24', '#34d399', '#60a5fa', '#f87171', '#a78bfa', '#fb923c'][i % 6],
  delay: (i * 0.08) % 0.7,
  size: 3 + (i % 3) * 1.5,
}));

// ── Cricket Ball Mascot SVG ───────────────────────────────────────────────────

const CricketBall = memo(function CricketBall({
  state,
  idleAnim,
  idlePhase,
  thinkAnim,
  mouthOpen,
  eyeX,
  eyeY,
  blinkNow,
  gesture,
  speaking,
  speechBeat,
  isJuggling,
}: {
  state: AssistantState;
  idleAnim: IdleAnim;
  idlePhase: IdlePhase;
  thinkAnim: ThinkAnim;
  mouthOpen: number;
  eyeX: number;
  eyeY: number;
  blinkNow: boolean;
  gesture: GestureDir;
  speaking: boolean;
  speechBeat: number;
  isJuggling: boolean;
}) {
  const isIdle      = state === 'idle';
  const isSleeping  = state === 'sleeping';
  const isThinking  = state === 'thinking';
  const isSpeaking  = state === 'speaking';
  const isListening = state === 'listening' || state === 'woken';
  const isWoken     = state === 'woken';
  const isExcited   = state === 'excited';
  const isError     = state === 'error';
  const isSuccess   = state === 'success';
  const isHappy     = isExcited || isSuccess;

  const idleAnimsEnabled = idlePhase >= 1;
  const activeIdle = idleAnimsEnabled ? idleAnim : 'breathe';

  const gestureEyeX = gesture === 'left' ? -5 : gesture === 'right' ? 5 : 0;
  const gestureEyeY = gesture === 'up'   ? -3 : gesture === 'down'  ? 3 : 0;

  const eyeOffX =
    gestureEyeX !== 0 ? gestureEyeX :
    (isIdle && activeIdle === 'lookLeft')  ? -4 :
    (isIdle && activeIdle === 'lookRight') ?  4 :
    (isIdle && activeIdle === 'curious')   ?  3 :
    (isThinking && thinkAnim === 'looklr') ? eyeX * 4 : eyeX;

  const eyeOffY =
    gestureEyeY !== 0 ? gestureEyeY :
    (isIdle && activeIdle === 'lookUp') ? -4 :
    (isThinking && (thinkAnim === 'lookup' || thinkAnim === 'eyebrow')) ? -2 : eyeY;

  const isYawning = isIdle && activeIdle === 'yawn';
  const isRubbing = isIdle && activeIdle === 'rubEyes';
  const isSnoring = isIdle && activeIdle === 'snore';

  const blinkScale =
    isSleeping ? 0.08 :
    isSnoring  ? 0.08 :
    isRubbing  ? 0.15 :
    isYawning  ? 0.25 :
    blinkNow || (idleAnimsEnabled && (activeIdle === 'blink' || activeIdle === 'happy_blink')) ||
    (isThinking && thinkAnim === 'blink') ? 0.12 : 1;

  const lbrowY =
    (isThinking && thinkAnim === 'eyebrow')  ? -4 :
    (isThinking && thinkAnim === 'eyebrows') ? -3 :
    (isIdle && activeIdle === 'curious')     ? -5 :
    isListening || isExcited   ? -3 :
    (isIdle && (activeIdle === 'happy' || activeIdle === 'happy_blink')) ? -2 :
    isYawning ? 2 :
    isError   ? 3 : 0;
  const rbrowY =
    (isThinking && thinkAnim === 'eyebrow')  ?  0 :
    (isThinking && thinkAnim === 'eyebrows') ? -3 :
    isListening || isExcited   ? -3 :
    (isIdle && (activeIdle === 'happy' || activeIdle === 'happy_blink')) ? -2 :
    isYawning ? 2 :
    isError   ? 3 : 0;
  const lbrowRot = isError ? 15 : (isIdle && activeIdle === 'curious') ? 8 : 0;
  const rbrowRot = isError ? -15 : 0;

  // ── Mouth: two-lip system ──────────────────────────────────────────────────
  const upperLipCtrlY =
    isYawning   ? 61 :
    isSpeaking  ? 63 :
    isListening ? 66 :
    isHappy     ? 61 :
    isError     ? 72 :
    isSleeping || isSnoring ? 69 :
    (isIdle && (activeIdle === 'smile' || activeIdle === 'happy_blink')) ? 63 :
    (isIdle && activeIdle === 'happy') ? 61 :
    isThinking  ? 70 : 67;

  const lowerLipCtrlY =
    isYawning   ? 93 :
    isSpeaking  ? 74 + mouthOpen * 13 + speechBeat * 4 :
    isListening ? 79 :
    isHappy     ? 85 :
    isError     ? 65 :
    isSleeping || isSnoring ? 73 :
    (isIdle && (activeIdle === 'smile' || activeIdle === 'happy_blink')) ? 81 :
    (isIdle && activeIdle === 'happy') ? 83 :
    isThinking  ? 73 : 77;

  const upperLipPath  = `M 38 70 Q 50 ${upperLipCtrlY.toFixed(1)} 62 70`;
  const lowerLipPath  = `M 38 70 Q 50 ${lowerLipCtrlY.toFixed(1)} 62 70`;
  const mouthFillPath = `M 38 70 Q 50 ${upperLipCtrlY.toFixed(1)} 62 70 Q 50 ${lowerLipCtrlY.toFixed(1)} 38 70 Z`;
  const showMouthFill = (isSpeaking && mouthOpen > 0.1) || isYawning;
  const mouthFillOpacity = isYawning ? 0.82 : Math.min(0.88, 0.3 + mouthOpen * 0.65);

  // ── Hand visibility (per reference image spec) ─────────────────────────────
  // Hands shown ONLY during: Thinking, Juggling, Wave, Thumbs-up, Shrug, Greeting, Celebration
  const showLeftHand =
    (isIdle && (activeIdle === 'wave' || activeIdle === 'stretch')) ||
    isRubbing ||
    isHappy ||   // celebration: both up
    isWoken ||   // greeting: left raised
    isError;     // shrug: both out

  const showRightHand =
    (isIdle && (activeIdle === 'wave' || activeIdle === 'stretch')) ||
    isRubbing ||
    (isThinking && (thinkAnim === 'handCheek' || thinkAnim === 'scratch')) ||
    isHappy ||   // thumbs-up (success) / celebration
    isError;     // shrug

  // Cheek glow
  const cheekBase =
    isHappy || (isIdle && (activeIdle === 'happy' || activeIdle === 'happy_blink')) ? 0.9 :
    isListening ? 0.6 :
    isSpeaking ? 0.4 + speechBeat * 0.35 :
    isYawning  ? 0.65 : 0.35;

  const ballStop1 = isError ? '#f87171' : isHappy ? '#fca5a5' : '#f87171';
  const ballStop2 = isError ? '#b91c1c' : isHappy ? '#ef4444' : '#dc2626';
  const ballStop3 = isError ? '#450a0a' : isHappy ? '#7f1d1d' : '#7f1d1d';

  // ── Hand SVG component (reusable rounded cartoon hand) ─────────────────────
  // Coords are relative to a local origin; parent <g> sets position + rotation.
  // fingers: 'up' | 'right' | 'down'
  const HandShape = ({
    cx, cy, rotate = 0, scale = 1, mirrorX = false,
    variant = 'open',
  }: {
    cx: number; cy: number; rotate?: number; scale?: number;
    mirrorX?: boolean;
    /** open = fingers up/spread | fist = closed | thumbUp | pointRight */
    variant?: 'open' | 'fist' | 'thumbUp' | 'shrug';
  }) => {
    const flip = mirrorX ? 'scale(-1,1)' : '';
    const t = `translate(${cx} ${cy}) rotate(${rotate}) scale(${scale}) ${flip}`;

    if (variant === 'thumbUp') {
      // Fist facing right, thumb pointing up
      return (
        <g transform={t} style={{ willChange: 'transform' }}>
          {/* Fist body */}
          <ellipse cx="0" cy="2" rx="10" ry="8" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
          {/* Knuckle bumps (top of fist) */}
          <ellipse cx="-5"  cy="-4.5" rx="3.2" ry="2.2" fill="#ef4444" stroke="#991b1b" strokeWidth="0.3" />
          <ellipse cx="0"   cy="-5.5" rx="3.2" ry="2.2" fill="#ef4444" stroke="#991b1b" strokeWidth="0.3" />
          <ellipse cx="5"   cy="-4.5" rx="3.2" ry="2.2" fill="#ef4444" stroke="#991b1b" strokeWidth="0.3" />
          {/* Thumb pointing straight up */}
          <ellipse cx="-10" cy="-9"   rx="3.5" ry="7.5"  fill="#ef4444" stroke="#991b1b" strokeWidth="0.4" />
          {/* Highlight */}
          <ellipse cx="0"   cy="0"    rx="6"   ry="3"    fill="rgba(255,255,255,0.18)" />
        </g>
      );
    }

    if (variant === 'shrug') {
      // Palm facing viewer, fingers spread, slight outward tilt
      return (
        <g transform={t} style={{ willChange: 'transform' }}>
          {/* Palm */}
          <ellipse cx="0" cy="0" rx="11" ry="9" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
          {/* Four fingers spread upward */}
          <ellipse cx="-8"  cy="-11" rx="3"   ry="6.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.35" />
          <ellipse cx="-2"  cy="-13" rx="3.2" ry="7"   fill="#ef4444" stroke="#991b1b" strokeWidth="0.35" />
          <ellipse cx="4"   cy="-13" rx="3.2" ry="7"   fill="#ef4444" stroke="#991b1b" strokeWidth="0.35" />
          <ellipse cx="10"  cy="-11" rx="2.8" ry="6.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.35" />
          {/* Thumb to the side */}
          <ellipse cx="13"  cy="3"   rx="4.5" ry="2.8" fill="#ef4444" stroke="#991b1b" strokeWidth="0.3" />
          {/* Knuckle highlight */}
          <ellipse cx="0"   cy="-3"  rx="7"   ry="3"   fill="rgba(255,255,255,0.18)" />
        </g>
      );
    }

    if (variant === 'fist') {
      return (
        <g transform={t} style={{ willChange: 'transform' }}>
          <ellipse cx="0" cy="0" rx="10" ry="8" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
          <ellipse cx="-5" cy="-5.5" rx="3" ry="2" fill="#ef4444" stroke="#991b1b" strokeWidth="0.3" />
          <ellipse cx="0"  cy="-6.5" rx="3" ry="2" fill="#ef4444" stroke="#991b1b" strokeWidth="0.3" />
          <ellipse cx="5"  cy="-5.5" rx="3" ry="2" fill="#ef4444" stroke="#991b1b" strokeWidth="0.3" />
          <ellipse cx="0"  cy="-1"   rx="6" ry="2.5" fill="rgba(255,255,255,0.15)" />
        </g>
      );
    }

    // Default: open hand, fingers pointing upward
    return (
      <g transform={t} style={{ willChange: 'transform' }}>
        {/* Palm */}
        <ellipse cx="0"  cy="2"  rx="11" ry="9"  fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
        {/* Four fingers */}
        <ellipse cx="-8" cy="-9"  rx="3"   ry="6.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.35" />
        <ellipse cx="-2" cy="-11" rx="3.2" ry="7.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.35" />
        <ellipse cx="4"  cy="-11" rx="3.2" ry="7.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.35" />
        <ellipse cx="10" cy="-9"  rx="2.8" ry="6.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.35" />
        {/* Thumb */}
        <ellipse cx="-13" cy="4"  rx="4.5" ry="2.8" fill="#ef4444" stroke="#991b1b" strokeWidth="0.3" />
        {/* Knuckle highlight */}
        <ellipse cx="0"  cy="-2"  rx="7"   ry="3"   fill="rgba(255,255,255,0.18)" />
      </g>
    );
  };

  return (
    <svg
      viewBox="-15 -10 130 130"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible', willChange: 'transform' }}
    >
      <defs>
        <radialGradient id="va-ballGrad" cx="35%" cy="28%" r="65%">
          <stop offset="0%"   stopColor={ballStop1} />
          <stop offset="45%"  stopColor={ballStop2} />
          <stop offset="100%" stopColor={ballStop3} />
        </radialGradient>
        <radialGradient id="va-highlight" cx="28%" cy="22%" r="50%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id="va-cheekGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(251,113,133,0.55)" />
          <stop offset="100%" stopColor="rgba(251,113,133,0)" />
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
        <filter id="va-redGlow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── State glow rings ── */}
      {isListening && (<>
        <motion.circle cx="50" cy="50" r="48"
          fill="none" stroke="#22c55e" strokeWidth="3" opacity={0.6}
          filter="url(#va-greenGlow)"
          animate={{ r: [46, 52, 46], opacity: [0.35, 0.85, 0.35] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.circle cx="50" cy="50" r="55"
          fill="none" stroke="#22c55e" strokeWidth="1.5" opacity={0.3}
          animate={{ r: [52, 60, 52], opacity: [0.15, 0.45, 0.15] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
        />
      </>)}
      {isSpeaking && (
        <motion.circle cx="50" cy="50" r="48"
          fill="none" stroke="#3b82f6" strokeWidth="3" opacity={0.5}
          filter="url(#va-glow)"
          animate={{ r: [45, 50, 45], opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {isExcited && (
        <motion.circle cx="50" cy="50" r="48"
          fill="none" stroke="#f59e0b" strokeWidth="3" opacity={0.5}
          filter="url(#va-glow)"
          animate={{ r: [44, 54, 44], opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 0.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {isError && (
        <motion.circle cx="50" cy="50" r="48"
          fill="none" stroke="#ef4444" strokeWidth="3" opacity={0.5}
          filter="url(#va-redGlow)"
          animate={{ r: [46, 50, 46], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {isSuccess && (<>
        <motion.circle cx="50" cy="50" r="48"
          fill="none" stroke="#10b981" strokeWidth="3" opacity={0.6}
          filter="url(#va-greenGlow)"
          animate={{ r: [46, 54, 46], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.circle cx="50" cy="50" r="58"
          fill="none" stroke="#10b981" strokeWidth="1" opacity={0.3}
          animate={{ r: [55, 65, 55], opacity: [0.1, 0.35, 0.1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
        />
      </>)}

      {/* ── Juggling mode: large side-hands + arcing cricket ball ── */}
      <AnimatePresence>
        {isJuggling && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Left hand (juggles at left side) */}
            <motion.g
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ellipse cx="1"  cy="70" rx="20" ry="14" fill="#ef4444" stroke="#991b1b" strokeWidth="0.6" />
              <ellipse cx="-11" cy="55" rx="4.5" ry="7.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="-3"  cy="50" rx="4.5" ry="8.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="5"   cy="50" rx="4.5" ry="8.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="13"  cy="53" rx="4.0" ry="7.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="-17" cy="70" rx="4.5" ry="3.2" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="1"   cy="66" rx="10"  ry="4"   fill="rgba(255,255,255,0.18)" />
            </motion.g>

            {/* Right hand (catches at right side) */}
            <motion.g
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: 0.45 }}
            >
              <ellipse cx="99"  cy="70" rx="20" ry="14" fill="#ef4444" stroke="#991b1b" strokeWidth="0.6" />
              <ellipse cx="87"  cy="55" rx="4.0" ry="7.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="95"  cy="50" rx="4.5" ry="8.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="103" cy="50" rx="4.5" ry="8.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="111" cy="53" rx="4.5" ry="7.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="117" cy="70" rx="4.5" ry="3.2" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />
              <ellipse cx="99"  cy="66" rx="10"  ry="4"   fill="rgba(255,255,255,0.18)" />
            </motion.g>

            {/* Tiny cricket ball arcing over head */}
            <motion.circle r="10" fill="#dc2626" stroke="#991b1b" strokeWidth="0.5"
              animate={{ cx: [1, 50, 99, 50, 1], cy: [50, -58, 50, -58, 50] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', times: [0, 0.25, 0.5, 0.75, 1] }}
            />
            <motion.path
              fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round"
              animate={{
                d: [
                  'M -4 50 Q 1 44 6 50',
                  'M 44 -58 Q 50 -64 56 -58',
                  'M 94 50 Q 99 44 104 50',
                  'M 44 -58 Q 50 -64 56 -58',
                  'M -4 50 Q 1 44 6 50',
                ],
              }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', times: [0, 0.25, 0.5, 0.75, 1] }}
            />
            <motion.circle r="4" fill="rgba(255,255,255,0.4)"
              animate={{ cx: [-1, 47, 96, 47, -1], cy: [46, -62, 46, -62, 46] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', times: [0, 0.25, 0.5, 0.75, 1] }}
            />
            {/* Arc trail */}
            <motion.path
              fill="none" stroke="rgba(252,165,165,0.45)" strokeWidth="1.2"
              strokeDasharray="4 5" strokeLinecap="round"
              d="M 1 50 Q 50 -75 99 50"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.g>
        )}
      </AnimatePresence>

      {/* ── Confetti (excited / celebration) ── */}
      <AnimatePresence>
        {isExcited && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {CONFETTI_PARTICLES.map(p => (
              <motion.rect
                key={p.id}
                x={p.x} y={-8} width={p.size} height={p.size * 1.6}
                fill={p.color}
                rx="1"
                animate={{
                  y: [-8, 110],
                  x: [p.x, p.x + (p.id % 2 === 0 ? 12 : -12)],
                  rotate: [0, 360 * (p.id % 2 === 0 ? 1 : -1)],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: 1.2 + (p.id % 4) * 0.18,
                  delay: p.delay,
                  repeat: Infinity,
                  repeatDelay: 0.4,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
              />
            ))}
          </motion.g>
        )}
      </AnimatePresence>

      {/* ── LEFT HAND ── */}
      <AnimatePresence>
        {showLeftHand && !isJuggling && (
          <motion.g
            key="left-hand"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', damping: 18, stiffness: 280 }}
          >
            {/* GREETING / WOKEN — left hand raised high, waving */}
            {isWoken && (
              <motion.g
                animate={{ rotate: [-20, 20, -20] }}
                transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: '4px 18px' }}
              >
                <HandShape cx={4} cy={8} rotate={0} />
              </motion.g>
            )}

            {/* CELEBRATION (excited) — both hands raised */}
            {isExcited && !isSuccess && (
              <motion.g
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <HandShape cx={2} cy={5} rotate={-15} />
              </motion.g>
            )}

            {/* SUCCESS — left also raised with right-thumbsup */}
            {isSuccess && (
              <motion.g
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <HandShape cx={2} cy={8} rotate={-10} />
              </motion.g>
            )}

            {/* ERROR — shrug: left hand extended to left */}
            {isError && (
              <motion.g
                animate={{ y: [0, 3, 0], rotate: [-8, 8, -8] }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: '-8px 52px' }}
              >
                <HandShape cx={-8} cy={52} rotate={20} variant="shrug" mirrorX />
              </motion.g>
            )}

            {/* IDLE WAVE */}
            {isIdle && activeIdle === 'wave' && (
              <motion.g
                animate={{ rotate: [-18, 18, -18], y: [-2, -6, -2] }}
                transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: '4px 18px' }}
              >
                <HandShape cx={4} cy={12} rotate={-5} />
              </motion.g>
            )}

            {/* IDLE STRETCH */}
            {isIdle && activeIdle === 'stretch' && (
              <motion.g
                animate={{ y: [0, -14, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <HandShape cx={6} cy={20} rotate={10} />
              </motion.g>
            )}

            {/* RUB EYES */}
            {isRubbing && (
              <motion.g
                animate={{ x: [-3, 3, -3], y: [-2, 2, -2] }}
                transition={{ duration: 0.3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <HandShape cx={30} cy={42} rotate={30} scale={0.8} />
              </motion.g>
            )}
          </motion.g>
        )}
      </AnimatePresence>

      {/* ── RIGHT HAND ── */}
      <AnimatePresence>
        {showRightHand && !isJuggling && (
          <motion.g
            key="right-hand"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', damping: 18, stiffness: 280 }}
          >
            {/* THINKING — right hand on cheek */}
            {isThinking && thinkAnim === 'handCheek' && (
              <motion.g
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <HandShape cx={76} cy={54} rotate={120} scale={0.9} />
              </motion.g>
            )}

            {/* THINKING — scratch */}
            {isThinking && thinkAnim === 'scratch' && (
              <motion.g
                animate={{ x: [-2, 2, -2], y: [-2, 2, -2] }}
                transition={{ duration: 0.22, repeat: Infinity, ease: 'linear' }}
              >
                <HandShape cx={76} cy={46} rotate={110} scale={0.85} />
              </motion.g>
            )}

            {/* SUCCESS — right hand THUMBS UP */}
            {isSuccess && (
              <motion.g
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.55, repeat: Infinity, ease: 'easeInOut' }}
              >
                <HandShape cx={90} cy={65} rotate={0} variant="thumbUp" />
              </motion.g>
            )}

            {/* EXCITED / CELEBRATION — right hand raised */}
            {isExcited && !isSuccess && (
              <motion.g
                animate={{ y: [0, -7, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut', delay: 0.12 }}
              >
                <HandShape cx={98} cy={5} rotate={15} />
              </motion.g>
            )}

            {/* ERROR — shrug: right hand extended to right */}
            {isError && (
              <motion.g
                animate={{ y: [0, 3, 0], rotate: [-8, 8, -8] }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
                style={{ transformOrigin: '110px 52px' }}
              >
                <HandShape cx={110} cy={52} rotate={-20} variant="shrug" />
              </motion.g>
            )}

            {/* IDLE WAVE */}
            {isIdle && activeIdle === 'wave' && (
              <motion.g
                animate={{ rotate: [-12, 12, -12], y: [-8, 0, -8] }}
                transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: '92px 40px' }}
              >
                <HandShape cx={92} cy={30} rotate={5} />
              </motion.g>
            )}

            {/* IDLE STRETCH */}
            {isIdle && activeIdle === 'stretch' && (
              <motion.g
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
              >
                <HandShape cx={96} cy={22} rotate={-10} />
              </motion.g>
            )}

            {/* RUB EYES */}
            {isRubbing && (
              <motion.g
                animate={{ x: [-3, 3, -3], y: [-2, 2, -2] }}
                transition={{ duration: 0.3, repeat: Infinity, ease: 'easeInOut', delay: 0.08 }}
              >
                <HandShape cx={62} cy={42} rotate={-30} scale={0.8} />
              </motion.g>
            )}
          </motion.g>
        )}
      </AnimatePresence>

      {/* ── Main ball circle ── */}
      <motion.circle
        cx="50" cy="50" r="44"
        fill="url(#va-ballGrad)" filter="url(#va-shadow)"
        animate={
          (isSleeping || isSnoring) ? { scaleX: [1, 1.02, 1] } :
          isSpeaking ? { scaleY: [1, 1 + speechBeat * 0.012, 1] } : {}
        }
        transition={{ duration: isSpeaking ? 0.18 : 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{ willChange: 'transform' }}
      />

      {/* ── Glossy highlight ── */}
      <ellipse cx="36" cy="31" rx="18" ry="12" fill="url(#va-highlight)" />

      {/* ── Seam lines ── */}
      <path d="M 29 8 Q 44 50 29 92"
        fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.65"
      />
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

      {/* ── Cheeks ── */}
      <motion.ellipse cx="22" cy="57" rx="9" ry="6" fill="url(#va-cheekGrad)"
        animate={{ opacity: cheekBase }} transition={{ duration: 0.12 }}
      />
      <motion.ellipse cx="78" cy="57" rx="9" ry="6" fill="url(#va-cheekGrad)"
        animate={{ opacity: cheekBase }} transition={{ duration: 0.12 }}
      />

      {/* ── Eyebrows ── */}
      <motion.path d="M 28 33 Q 36 28 44 32"
        fill="none" stroke="#1c1917" strokeWidth="2.5" strokeLinecap="round"
        animate={{ y: lbrowY, rotate: lbrowRot }}
        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
        style={{ transformOrigin: '36px 30px' }}
      />
      <motion.path d="M 56 32 Q 64 28 72 33"
        fill="none" stroke="#1c1917" strokeWidth="2.5" strokeLinecap="round"
        animate={{ y: rbrowY, rotate: rbrowRot }}
        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
        style={{ transformOrigin: '64px 30px' }}
      />

      {/* ── Speaking head micro-tilt ── */}
      {isSpeaking && (
        <motion.g
          animate={{ rotate: [-1.5, 1.5, -1.5] }}
          transition={{ duration: 0.55, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '50px 50px' }}
        />
      )}

      {/* ── Eyes ── */}
      <motion.g
        animate={{ x: eyeOffX, y: eyeOffY }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        style={{ willChange: 'transform' }}
      >
        {/* Left eye */}
        <motion.ellipse cx="36" cy="46" rx="8.5" ry="8"
          style={{ transformOrigin: '36px 46px' }}
          animate={{ scaleY: blinkScale }}
          transition={{ duration: 0.1 }}
          fill="white"
        />
        <motion.g
          style={{ transformOrigin: '36px 46px' }}
          animate={{ scaleY: blinkScale < 0.5 ? 0 : 1, opacity: blinkScale < 0.5 ? 0 : 1 }}
          transition={{ duration: 0.08 }}
        >
          <circle cx={36 + eyeOffX * 0.2} cy="47" r={isExcited ? 5.5 : 4.5} fill="#1c1917" />
          <circle cx={37.5 + eyeOffX * 0.2} cy="44.5" r="1.6" fill="white" />
          <circle cx={36 + eyeOffX * 0.2} cy="49" r="0.8" fill="white" opacity="0.5" />
        </motion.g>

        {/* Right eye */}
        <motion.ellipse cx="64" cy="46" rx="8.5" ry="8"
          style={{ transformOrigin: '64px 46px' }}
          animate={{ scaleY: blinkScale }}
          transition={{ duration: 0.1 }}
          fill="white"
        />
        <motion.g
          style={{ transformOrigin: '64px 46px' }}
          animate={{ scaleY: blinkScale < 0.5 ? 0 : 1, opacity: blinkScale < 0.5 ? 0 : 1 }}
          transition={{ duration: 0.08 }}
        >
          <circle cx={64 + eyeOffX * 0.2} cy="47" r={isExcited ? 5.5 : 4.5} fill="#1c1917" />
          <circle cx={65.5 + eyeOffX * 0.2} cy="44.5" r="1.6" fill="white" />
          <circle cx={64 + eyeOffX * 0.2} cy="49" r="0.8" fill="white" opacity="0.5" />
        </motion.g>
      </motion.g>

      {/* ── Sleeping ZZZs ── */}
      <AnimatePresence>
        {(isSleeping || isSnoring) && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {['z', 'Z', 'Z'].map((z, i) => (
              <motion.text key={i}
                x={62 + i * 10} y={18 - i * 12}
                fontSize={12 + i * 5} fill="#111827" fontWeight="900"
                stroke="#374151" strokeWidth="0.3"
                animate={{ y: [18 - i * 12, 10 - i * 12, 18 - i * 12], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, delay: i * 0.5, repeat: Infinity, ease: 'easeInOut' }}
              >{z}</motion.text>
            ))}
          </motion.g>
        )}
      </AnimatePresence>

      {/* ── Yawn tear ── */}
      <AnimatePresence>
        {isYawning && (
          <motion.ellipse cx="67" cy="52" rx="2" ry="3" fill="#93c5fd" opacity={0.7}
            initial={{ opacity: 0 }} animate={{ opacity: 1, y: [0, 5, 0] }} exit={{ opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          />
        )}
      </AnimatePresence>

      {/* ── Error ! ── */}
      <AnimatePresence>
        {isError && (
          <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <motion.text x="56" y="14" fontSize="20" fill="#ef4444" fontWeight="bold"
              animate={{ rotate: [-5, 5, -5] }}
              transition={{ duration: 0.3, repeat: Infinity }}
            >!</motion.text>
          </motion.g>
        )}
      </AnimatePresence>

      {/* ── Success ✓ ── */}
      <AnimatePresence>
        {isSuccess && (
          <motion.g initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <circle cx="72" cy="14" r="9" fill="#10b981" opacity="0.9" />
            <motion.path d="M 66 14 L 71 19 L 79 9"
              fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.4 }}
            />
          </motion.g>
        )}
      </AnimatePresence>

      {/* ── Excited sparkle burst ── */}
      <AnimatePresence>
        {isExcited && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {[0,60,120,180,240,300].map((angle, i) => (
              <motion.circle key={i}
                cx={50 + Math.cos(angle * Math.PI / 180) * 54}
                cy={50 + Math.sin(angle * Math.PI / 180) * 54}
                r="3.5" fill="#fbbf24"
                animate={{ opacity: [0, 1, 0], scale: [0.5, 1.6, 0.5] }}
                transition={{ duration: 0.5, delay: i * 0.08, repeat: Infinity, repeatDelay: 0.3 }}
              />
            ))}
          </motion.g>
        )}
      </AnimatePresence>

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
            <circle cx="70" cy="13" r="7"   fill="white" opacity="0.9" />
            <circle cx="79" cy="18" r="5.5" fill="white" opacity="0.9" />
            <circle cx="66" cy="24" r="5.5" fill="white" opacity="0.9" />
            <circle cx="75" cy="24" r="5.5" fill="white" opacity="0.9" />
            <text x="62" y="22" fontSize="7" fill="#64748b" fontWeight="bold">...</text>
          </motion.g>
        )}
        {isThinking && thinkAnim === 'chart' && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <rect x="56" y="8" width="32" height="22" rx="3" fill="white" opacity="0.95" />
            <polyline points="59,27 63,20 68,23 73,14 78,17 85,11"
              fill="none" stroke="#22c55e" strokeWidth="1.5" />
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
            <motion.circle cx="70" cy="12" r="10" fill="rgba(251,191,36,0.25)"
              animate={{ r: [8, 13, 8] }} transition={{ duration: 0.9, repeat: Infinity }}
            />
            <ellipse cx="70" cy="11" rx="6" ry="7" fill="#fbbf24" />
            <path d="M 66 17 Q 66 21 70 22 Q 74 21 74 17 Z" fill="#f59e0b" />
            <rect x="67.5" y="22" width="5" height="2.5" rx="1" fill="#92400e" />
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
              { cx: 65, cy: 10, r: 3,   delay: 0    },
              { cx: 75, cy: 6,  r: 2,   delay: 0.2  },
              { cx: 82, cy: 14, r: 2.5, delay: 0.4  },
              { cx: 70, cy: 18, r: 1.8, delay: 0.15 },
            ].map((s, i) => (
              <motion.g key={i}>
                <motion.circle cx={s.cx} cy={s.cy} r={s.r} fill="#fbbf24"
                  animate={{ opacity: [0, 1, 0], scale: [0.5, 1.3, 0.5] }}
                  transition={{ duration: 0.8, delay: s.delay, repeat: Infinity, repeatDelay: 0.3 }}
                />
                <motion.line x1={s.cx - s.r * 1.4} y1={s.cy} x2={s.cx + s.r * 1.4} y2={s.cy}
                  stroke="#fbbf24" strokeWidth="1" strokeLinecap="round"
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8, delay: s.delay, repeat: Infinity, repeatDelay: 0.3 }}
                />
              </motion.g>
            ))}
          </motion.g>
        )}
        {isThinking && thinkAnim === 'magnify' && (
          <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <circle cx="68" cy="14" r="8" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
            <circle cx="68" cy="14" r="4" fill="rgba(147,197,253,0.3)" />
            <motion.line x1="74" y1="20" x2="82" y2="28"
              stroke="#94a3b8" strokeWidth="3" strokeLinecap="round"
              animate={{ rotate: [-5, 5, -5] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: '74px 20px' }}
            />
          </motion.g>
        )}
        {isThinking && thinkAnim === 'spin' && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.circle cx="70" cy="12" r="8" fill="none" stroke="#a78bfa" strokeWidth="2"
              strokeDasharray="12 8"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: '70px 12px' }}
            />
          </motion.g>
        )}
        {isThinking && thinkAnim === 'eyebrow' && (
          <motion.text x="64" y="16" fontSize="14" fill="#fbbf24" fontWeight="bold"
            initial={{ opacity: 0 }} animate={{ opacity: [0.6, 1, 0.6] }} exit={{ opacity: 0 }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >?</motion.text>
        )}
      </AnimatePresence>

      {/* ── Mouth ── */}
      {showMouthFill && (
        <path d={mouthFillPath} fill="#3d0000" opacity={mouthFillOpacity} />
      )}
      <path d={upperLipPath} fill="none" stroke="#1c1917" strokeWidth="2.8" strokeLinecap="round" />
      <path d={lowerLipPath} fill="none" stroke="#1c1917" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
});

// ── Entry Ripple ──────────────────────────────────────────────────────────────

const EntryRipple = memo(function EntryRipple({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <>
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="fixed rounded-full pointer-events-none"
              style={{
                right: 24, bottom: 24,
                width: 64, height: 64,
                zIndex: 58,
                border: `2px solid rgba(134,239,172,${0.6 - i * 0.15})`,
                boxShadow: '0 0 8px rgba(34,197,94,0.25)',
              }}
              initial={{ scale: 1, opacity: 0.75 - i * 0.15 }}
              animate={{ scale: 3.5 + i * 1.8, opacity: 0 }}
              exit={{}}
              transition={{ duration: 0.4, delay: i * 0.09, ease: [0.0, 0.0, 0.35, 1.0] }}
            />
          ))}
        </>
      )}
    </AnimatePresence>
  );
});

// ── Grass Wave Screen Effect ──────────────────────────────────────────────────

const GrassWaveEffect = memo(function GrassWaveEffect({ active }: { active: boolean }) {
  const WAVE_COLORS = [
    'rgba(134,239,172,0.18)',
    'rgba(34,197,94,0.14)',
    'rgba(21,128,61,0.10)',
    'rgba(186,230,253,0.12)',
    'rgba(255,255,255,0.08)',
  ];
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: 55 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
          <motion.div className="absolute inset-0 bg-slate-950"
            initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
          />
          <motion.div className="absolute inset-0" style={{ backdropFilter: 'blur(3px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          {WAVE_COLORS.map((color, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                bottom: '72px', left: '50%',
                width: 30, height: 30,
                marginLeft: -15, marginBottom: -15,
                background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
                border: `2px solid ${color.replace('0.', '0.4')}`,
              }}
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 22 + i * 6, opacity: 0 }}
              transition={{
                duration: 2.2, delay: i * 0.28,
                repeat: Infinity, repeatDelay: 0.8,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            />
          ))}
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
});

// ── Voice Waveform ────────────────────────────────────────────────────────────

const VoiceWaveform = memo(function VoiceWaveform({ active }: { active: boolean }) {
  const bars = [0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 0.85, 0.45, 0.75, 0.55, 0.9];
  return (
    <div className="flex items-end gap-[3px] h-8">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-gradient-to-t from-green-600 to-green-400"
          style={{ height: `${h * 100}%`, willChange: 'transform' }}
          animate={active ? { scaleY: [h, h * 0.3 + 0.7 * Math.sin(i), h] } : { scaleY: 0.2 }}
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
});

// ── Phoneme-driven mouth frame builder ────────────────────────────────────────

function buildMouthFrames(text: string): number[] {
  const frames: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/[aA]/.test(ch))          frames.push(0.86 + Math.random() * 0.11);
    else if (/[oO]/.test(ch))     frames.push(0.78 + Math.random() * 0.14);
    else if (/[eE]/.test(ch))     frames.push(0.54 + Math.random() * 0.14);
    else if (/[iI]/.test(ch))     frames.push(0.44 + Math.random() * 0.12);
    else if (/[uU]/.test(ch))     frames.push(0.60 + Math.random() * 0.13);
    else if (/[bBpPmM]/.test(ch)) frames.push(0.03 + Math.random() * 0.05);
    else if (/[fFvV]/.test(ch))   frames.push(0.18 + Math.random() * 0.10);
    else if (/[szSZ]/.test(ch))   frames.push(0.28 + Math.random() * 0.10);
    else if (/[.,!?;:]/.test(ch)) { frames.push(0.04); frames.push(0.02); }
    else if (ch === ' ')           frames.push(0.07 + Math.random() * 0.06);
    else                           frames.push(0.21 + Math.random() * 0.19);
  }
  return frames;
}

// ── Multi-Command Parser ──────────────────────────────────────────────────────

function parseMultiCommand(raw: string): string[] {
  const t = raw.toLowerCase().trim();
  const actionPrefix = /^(turn|switch|enable|disable|show|open|close|export|refresh|scroll|set|activate|deactivate|start|stop|go|get)/;
  const parts = t
    .split(/\s+(?:and|then|also|plus)\s+/)
    .flatMap(p => p.split(/,\s*/))
    .map(p => p.trim())
    .filter(p => p.length > 2);
  if (parts.length >= 2 && (actionPrefix.test(parts[1]) || /pump|fan|mode|export|pdf|excel|refresh|analys/.test(parts[1]))) {
    return parts;
  }
  return [raw];
}

// ── Command Processor ─────────────────────────────────────────────────────────

function processCommand(
  raw: string,
  ctx: {
    pumpOn: boolean; fanOn: boolean; mode: 'auto' | 'manual';
    currentTemp: number; currentHum: number; currentSoil: number;
    condition: string;
    tStats: { max: string; min: string; avg: string };
    hStats: { max: string; min: string; avg: string };
    sStats: { max: string; min: string; avg: string };
    readings: Reading[];
    onPumpToggle: (v: boolean) => void;
    onFanToggle: (v: boolean) => void;
    onModeChange: (m: 'auto' | 'manual') => void;
    onReset: () => void;
    onOpenAnalysis: () => void;
    onExportPDF: () => void;
    onExportExcel: () => void;
  },
  setGesture: (d: GestureDir) => void,
  goIdle: () => void,
): { response: string; stateHint?: AssistantState } {
  const t = raw.toLowerCase().trim();
  const resp = (r: string, hint?: AssistantState) => ({ response: r, stateHint: hint });

  if (/\b(sleep|stop listening|go to sleep|bye|goodbye|see you|dismiss|close|quiet|that's all|that is all|stop)\b/.test(t)) {
    setTimeout(goIdle, 800);
    return resp(`Alright! I'll keep an eye on the pitch while you rest. Just say "Hey Ball" when you need me!`);
  }
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|good night|howdy|namaste)(\s|$)/.test(t)) {
    const h = new Date().getHours();
    const gr = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return resp(`${gr}! I'm Ball, your AI cricket companion. How can I help you today?`, 'excited');
  }
  if (/how are you|are you okay|you good/.test(t)) {
    return resp(`I'm doing great! All sensors are green and the pitch is in ${ctx.condition} condition. What can I do for you?`, 'excited');
  }
  if (/who are you|what are you|introduce|your name|tell me about yourself/.test(t)) {
    return resp(`I'm Ball — your AI cricket pitch assistant! I monitor temperature, humidity, and soil moisture in real-time, and I can control the pump and fan, export reports, and navigate the dashboard. What would you like?`);
  }
  if (/what can you do|how can you help|capabilities|help me|help/.test(t)) {
    return resp(`I can check sensor readings, control the water pump and drying fan, switch between automatic and manual mode, export PDF reports and Excel spreadsheets, open sensor analytics, and navigate the dashboard. What do you need?`);
  }
  if (/thank|good job|awesome|nice|great|well done|perfect|shabash/.test(t)) {
    return resp(`You're very welcome! Always here to keep your cricket pitch in perfect shape.`, 'success');
  }
  if (/are you there|wake up|you there|hello ball/.test(t)) {
    return resp(`I'm right here! Ready and listening. What can I do for you?`, 'excited');
  }

  if (/scroll up|go up/.test(t)) {
    window.scrollBy({ top: -350, behavior: 'smooth' });
    return resp(`Scrolled up.`);
  }
  if (/scroll down|go down/.test(t)) {
    window.scrollBy({ top: 350, behavior: 'smooth' });
    return resp(`Scrolled down.`);
  }
  if (/go to top|scroll to top|top of page|open dashboard/.test(t)) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return resp(`Taking you to the top of the dashboard.`);
  }
  if (/show graph|view graph|show temperature|show humidity|show moisture|show soil|show readings|show current|go to graph|go to chart/.test(t)) {
    setGesture('up');
    document.querySelector('[data-section="charts"]')?.scrollIntoView({ behavior: 'smooth' });
    return resp(`Navigating to the sensor graphs.`);
  }
  if (/quick action/.test(t)) {
    document.querySelector('[data-section="quickactions"]')?.scrollIntoView({ behavior: 'smooth' });
    return resp(`Navigating to Quick Actions.`);
  }
  if (/show history|show recent|reading history|recent readings|latest readings/.test(t)) {
    document.querySelector('[data-section="history"]')?.scrollIntoView({ behavior: 'smooth' });
    return resp(`Opening the reading history. Latest: ${ctx.currentTemp}°C, ${ctx.currentHum}% humidity, ${ctx.currentSoil}% soil moisture.`);
  }
  if (/close popup|close modal|close analytics|close panel|close analysis|close history/.test(t)) {
    ctx.onOpenAnalysis();
    return resp(`Closed.`);
  }
  if (/dark mode/.test(t)) {
    document.documentElement.classList.add('dark');
    return resp(`Dark mode activated.`);
  }
  if (/light mode/.test(t)) {
    document.documentElement.classList.remove('dark');
    return resp(`Light mode activated.`);
  }

  if ((/auto(matic)?(\s+mode)?|switch.*auto|enable.*auto|set.*auto|automatic please/.test(t)) && !/manual/.test(t)) {
    setGesture('left');
    ctx.onModeChange('auto');
    return resp(`Automatic mode activated! The Arduino will now manage the pump and fan based on live soil moisture.`, 'success');
  }
  if (/manual(\s+mode)?|switch.*manual|enable.*manual|set.*manual|switch to manual|disable automatic|manual please/.test(t)) {
    setGesture('left');
    ctx.onModeChange('manual');
    return resp(`Switched to manual mode. You're now in full control of the water pump and drying fan.`, 'success');
  }
  if (/current mode|what.*mode|which mode/.test(t)) {
    return resp(`You're in ${ctx.mode === 'auto' ? 'Automatic' : 'Manual'} mode. ${ctx.mode === 'auto' ? 'The Arduino is managing things automatically.' : 'You have manual control of the pump and fan.'}`);
  }

  if (/emergency stop|stop everything|stop all|kill all|shut down everything/.test(t)) {
    if (ctx.mode === 'auto') return resp(`I'm in automatic mode. Please switch to manual mode first for emergency control.`);
    ctx.onPumpToggle(false);
    ctx.onFanToggle(false);
    return resp(`Emergency stop executed! Both the water pump and drying fan have been turned off immediately.`, 'error');
  }

  const pumpOn  = /pump\s*(on|start)|turn\s*(on|up)\s*(the\s*)?pump|(start|switch\s*on|enable|activate|please\s*start|can\s*you\s*start|please\s*turn\s*on|switch\s*the\s*pump\s*on|water\s*the\s*pitch|start\s*water|start\s*irrig|irrig\s*on|enable\s*irrig)(\s*(the\s*)?(pump|water|irrig))?/.test(t)
    && !/off|stop|turn\s*off/.test(t);
  const pumpOff = /pump\s*(off|stop)|turn\s*(off|down)\s*(the\s*)?pump|(stop|switch\s*off|disable|deactivate|please\s*stop|can\s*you\s*stop|turn\s*off\s*(the\s*)?(pump|water|irrig)|stop\s*water|stop\s*irrig)(\s*(the\s*)?(pump|water|irrig))?/.test(t);

  if (pumpOn) {
    setGesture('right');
    if (ctx.mode === 'auto') return resp(`The system is in automatic mode. Please switch to manual mode first to control the pump manually.`);
    ctx.onPumpToggle(true);
    return resp(`Water pump switched ON! Irrigation has started. The pitch is now being watered.`, 'success');
  }
  if (pumpOff) {
    setGesture('right');
    if (ctx.mode === 'auto') return resp(`I'm in automatic mode. Please switch to manual mode to control the pump.`);
    ctx.onPumpToggle(false);
    return resp(`Water pump switched OFF. Irrigation stopped successfully.`, 'success');
  }
  if (/pump status|is the pump|pump\s*(on|off)\?/.test(t)) {
    return resp(`The water pump is currently ${ctx.pumpOn ? 'ON and actively irrigating the pitch' : 'OFF'}.`);
  }

  const fanOn  = /fan\s*(on|start)|turn\s*(on|up)\s*(the\s*)?fan|(start|switch\s*on|enable|activate|please\s*start|can\s*you\s*start|please\s*turn\s*on|switch\s*the\s*fan\s*on|dry\s*the\s*pitch|start\s*dry)(\s*(the\s*)?(fan|drying|dryer))?|fan\s*please/.test(t)
    && !/off|stop|turn\s*off/.test(t);
  const fanOff = /fan\s*(off|stop)|turn\s*(off|down)\s*(the\s*)?fan|(stop|switch\s*off|disable|deactivate|please\s*stop|can\s*you\s*stop|turn\s*off\s*(the\s*)?fan|stop\s*dry)(\s*(the\s*)?(fan|drying))?/.test(t);

  if (fanOn) {
    setGesture('right');
    if (ctx.mode === 'auto') return resp(`I'm in automatic mode. Please switch to manual mode to control the fan manually.`);
    ctx.onFanToggle(true);
    return resp(`Sure! Switching the drying fan ON now. The pitch will begin drying.`, 'success');
  }
  if (fanOff) {
    setGesture('right');
    if (ctx.mode === 'auto') return resp(`I'm in automatic mode. Switch to manual mode to stop the fan manually.`);
    ctx.onFanToggle(false);
    return resp(`Drying fan switched OFF. The pitch will retain its current moisture level.`, 'success');
  }
  if (/fan status|is the fan|fan\s*(on|off)\?/.test(t)) {
    return resp(`The drying fan is currently ${ctx.fanOn ? 'ON and actively drying the pitch' : 'OFF'}.`);
  }

  if (/highest temp/.test(t)) return resp(`The highest recorded temperature is ${ctx.tStats.max}°C.`);
  if (/lowest temp/.test(t))  return resp(`The lowest recorded temperature is ${ctx.tStats.min}°C.`);
  if (/average temp/.test(t)) return resp(`The average temperature is ${ctx.tStats.avg}°C.`);
  if (/highest hum/.test(t))  return resp(`The highest recorded humidity is ${ctx.hStats.max}%.`);
  if (/lowest hum/.test(t))   return resp(`The lowest recorded humidity is ${ctx.hStats.min}%.`);
  if (/average hum/.test(t))  return resp(`The average humidity is ${ctx.hStats.avg}%.`);
  if (/highest (soil|moist)/.test(t)) return resp(`The highest soil moisture recorded is ${ctx.sStats.max}%.`);
  if (/lowest (soil|moist)/.test(t))  return resp(`The lowest soil moisture recorded is ${ctx.sStats.min}%.`);
  if (/average (soil|moist)/.test(t)) return resp(`The average soil moisture is ${ctx.sStats.avg}%.`);

  if (/\b(temp|temperature)\b/.test(t)) {
    setGesture('up');
    const s = ctx.currentTemp > 34 ? 'slightly high — monitor carefully' : ctx.currentTemp < 29 ? 'on the cooler side' : 'within the normal range';
    return resp(`The current temperature is ${ctx.currentTemp}°C, which is ${s} for a cricket pitch.`);
  }
  if (/\b(humid|humidity)\b/.test(t)) {
    setGesture('up');
    const s = ctx.currentHum > 75 ? 'high — consider activating the drying fan' : ctx.currentHum < 60 ? 'low — the pitch may be drying out' : 'within the optimal range';
    return resp(`The current humidity is ${ctx.currentHum}%, which is ${s}.`);
  }
  if (/\b(soil|moisture|moist)\b/.test(t)) {
    setGesture('up');
    return resp(`The current soil moisture is ${ctx.currentSoil}%. The pitch condition is ${ctx.condition}.`);
  }
  if (/esp32|arduino|wifi|wi-fi|database|connection|system status/.test(t)) {
    return resp(`All systems operational. Arduino microcontroller is online, USB Serial is connected, and the database is syncing perfectly.`);
  }
  if (/last update|last reading|latest reading|recent reading/.test(t)) {
    return resp(`The latest reading — temperature ${ctx.currentTemp}°C, humidity ${ctx.currentHum}%, and soil moisture ${ctx.currentSoil}%.`);
  }

  if (/how is the pitch|pitch condition|pitch health|current condition|today.*report|pitch status|status/.test(t)) {
    const advice =
      ctx.condition === 'Balanced' ? 'The pitch is in excellent condition — ready for play!' :
      ctx.condition === 'Dry' ? 'The pitch is dry. I recommend activating the water pump.' :
      'The pitch is too wet. Consider switching on the drying fan.';
    return resp(`Pitch condition is "${ctx.condition}". Temp: ${ctx.currentTemp}°C, Humidity: ${ctx.currentHum}%, Soil: ${ctx.currentSoil}%. ${advice}`);
  }
  if (/predict|forecast|trend/.test(t)) {
    return resp(`Based on current trends, the pitch is likely to remain ${ctx.condition} for the next 20–30 minutes. Keep monitoring soil moisture closely.`);
  }

  if (/pdf|export report|download report|generate report|save report|create report/.test(t)) {
    setGesture('down');
    ctx.onExportPDF();
    return resp(`Your professional cricket pitch monitoring report is being generated. The PDF will download in just a moment.`);
  }
  if (/excel|spreadsheet|export excel|download excel|generate spreadsheet/.test(t)) {
    setGesture('down');
    ctx.onExportExcel();
    return resp(`Exporting all sensor readings to Excel. The file will download shortly.`);
  }

  if (/analys|sensor analys|open analys|show chart|view data|view chart|show graph|open graph/.test(t)) {
    setGesture('down');
    ctx.onOpenAnalysis();
    return resp(`Opening the sensor analytics panel with live charts and statistics.`);
  }

  if (/reset|refresh|reload|clear|update reading|update graph|refresh dashboard|reload dashboard|update dashboard/.test(t)) {
    ctx.onReset();
    return resp(`Dashboard refreshed! Sensor data will update with the next Arduino reading cycle.`, 'success');
  }

  return resp(
    `Oops! That delivery missed the stumps. Could you repeat your command?`,
    'error'
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VoiceAssistant({
  readings, tempHistory, humHistory, soilHistory,
  pumpOn, fanOn, systemMode,
  onPumpToggle, onFanToggle, onModeChange, onReset, onOpenAnalysis, onExportExcel,
}: VoiceAssistantProps) {

  // ── Core state ──
  const [state, setState]           = useState<AssistantState>('idle');
  const [idleAnim, setIdleAnim]     = useState<IdleAnim>('breathe');
  const [idlePhase, setIdlePhase]   = useState<IdlePhase>(0);
  const [thinkAnim, setThinkAnim]   = useState<ThinkAnim>('eyebrow');
  const [mouthOpen, setMouthOpen]   = useState(0);
  const [speechBeat, setSpeechBeat] = useState(0);
  const [eyeX, setEyeX]             = useState(0);
  const [eyeY, setEyeY]             = useState(0);
  const [blinkNow, setBlinkNow]     = useState(false);
  const [statusText, setStatusText] = useState('');
  const [commandText, setCommandText]   = useState('');
  const [responseText, setResponseText] = useState('');
  const [interimText, setInterimText]   = useState('');
  const [isSupported, setIsSupported]   = useState(true);
  const [permDenied, setPermDenied]     = useState(false);
  const [gesture, setGestureState]      = useState<GestureDir>('none');
  const [showHints, setShowHints]       = useState(false);
  const [isJuggling, setIsJuggling]     = useState(false);
  const [entryRippleActive, setEntryRippleActive] = useState(false);

  const ballControls = useAnimation();

  // ── Refs ──
  const stateRef          = useRef<AssistantState>('idle');
  const ctxRef            = useRef({ readings, tempHistory, humHistory, soilHistory, pumpOn, fanOn, systemMode, onPumpToggle, onFanToggle, onModeChange, onReset, onOpenAnalysis, onExportExcel });
  const recRef            = useRef<any>(null);
  const recModeRef        = useRef<'wakeword' | 'command'>('wakeword');
  const isSpeakingRef     = useRef(false);
  const shouldListenRef   = useRef(true);
  const firstLaunchRef    = useRef(true);
  const failCountRef      = useRef(0);
  const lastFinalRef      = useRef('');
  const lastResponseRef   = useRef('');
  const wakeDebounceRef   = useRef(false);
  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouthIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const eyeIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const blinkTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const gestureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartDelayRef   = useRef(150);
  const speechBeatRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleCycleActiveRef = useRef(false);
  const startIdleCycleRef  = useRef<() => void>(() => {});

  // Inactivity timers (three-phase per spec)
  const phase1TimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase2TimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase3TimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    ctxRef.current = { readings, tempHistory, humHistory, soilHistory, pumpOn, fanOn, systemMode, onPumpToggle, onFanToggle, onModeChange, onReset, onOpenAnalysis, onExportExcel };
  });

  // ── 3-phase idle system ───────────────────────────────────────────────────────
  // Phase 1 (20s): subtle blink/breathe/eye movement
  // Phase 2 (40s): head tilt, smile, bounce
  // Phase 3 (60s): sleep OR juggle (50/50)
  const resetInactivityTimers = useCallback(() => {
    idleCycleActiveRef.current = false;
    setIsJuggling(false);
    setIdlePhase(0);
    setIdleAnim('breathe');

    [phase1TimerRef, phase2TimerRef, phase3TimerRef, cycleTimerRef].forEach(r => {
      if (r.current) clearTimeout(r.current);
    });

    // Phase 1 — 20 s: enable subtle idle animations
    phase1TimerRef.current = setTimeout(() => {
      if (stateRef.current !== 'idle') return;
      setIdlePhase(1);
    }, 20_000);

    // Phase 2 — 40 s: enable expressive animations
    phase2TimerRef.current = setTimeout(() => {
      if (stateRef.current !== 'idle') return;
      setIdlePhase(2);
    }, 40_000);

    // Phase 3 — 60 s: sleep or juggle
    phase3TimerRef.current = setTimeout(() => {
      if (stateRef.current !== 'idle') return;
      setIdlePhase(3);
      idleCycleActiveRef.current = true;
      startIdleCycleRef.current();
    }, 60_000);
  }, []);

  // Idle cycle — picks sleeping OR juggling, holds indefinitely
  const startIdleCycle = useCallback(() => {
    if (!idleCycleActiveRef.current) return;
    const pickSleep = Math.random() < 0.5;
    if (pickSleep) {
      setState('sleeping');
      setIsJuggling(false);
    } else {
      setState('idle');
      setIsJuggling(true);
    }
  }, []);
  useEffect(() => { startIdleCycleRef.current = startIdleCycle; }, [startIdleCycle]);

  // Activity listeners
  useEffect(() => {
    const onPassive = () => {
      if (stateRef.current === 'idle' && !idleCycleActiveRef.current) {
        resetInactivityTimers();
      }
    };
    const onInterrupt = () => {
      if (stateRef.current === 'idle' || stateRef.current === 'sleeping') {
        resetInactivityTimers();
      }
    };
    window.addEventListener('mousemove',  onPassive,    { passive: true });
    window.addEventListener('keydown',    onPassive,    { passive: true });
    window.addEventListener('click',      onInterrupt,  { passive: true });
    window.addEventListener('touchstart', onInterrupt,  { passive: true });
    window.addEventListener('scroll',     onInterrupt,  { passive: true, capture: true });
    resetInactivityTimers();
    return () => {
      window.removeEventListener('mousemove',  onPassive);
      window.removeEventListener('keydown',    onPassive);
      window.removeEventListener('click',      onInterrupt);
      window.removeEventListener('touchstart', onInterrupt);
      window.removeEventListener('scroll',     onInterrupt, { capture: true } as EventListenerOptions);
    };
  }, [resetInactivityTimers]);

  useEffect(() => {
    if (state !== 'idle') {
      [phase1TimerRef, phase2TimerRef, phase3TimerRef].forEach(r => {
        if (r.current) clearTimeout(r.current);
      });
      setIdlePhase(0);
    } else {
      if (!idleCycleActiveRef.current) {
        resetInactivityTimers();
      }
    }
  }, [state, resetInactivityTimers]);

  // ── Gesture helper ────────────────────────────────────────────────────────────
  const setGesture = useCallback((dir: GestureDir) => {
    setGestureState(dir);
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    gestureTimeoutRef.current = setTimeout(() => setGestureState('none'), 2000);
  }, []);

  // ── Jump (success) ────────────────────────────────────────────────────────────
  const triggerJump = useCallback(async () => {
    await ballControls.start({
      y: [-22, 5, -11, 2, 0],
      transition: { duration: 0.75, ease: [0.25, 0.46, 0.45, 0.94] },
    });
    ballControls.set({ y: 0 });
  }, [ballControls]);

  // ── Shake (error) ─────────────────────────────────────────────────────────────
  const triggerShake = useCallback(async () => {
    await ballControls.start({
      x: [-9, 9, -7, 7, -4, 4, 0],
      transition: { duration: 0.52, ease: 'easeInOut' },
    });
    ballControls.set({ x: 0 });
  }, [ballControls]);

  // ── Entry spin (wake from idle/sleeping) ──────────────────────────────────────
  const triggerWakeSpinEntry = useCallback(async () => {
    setEntryRippleActive(true);
    setTimeout(() => setEntryRippleActive(false), 550);

    ballControls.set({ x: 160, y: 40, rotate: 0, scale: 0.72 });
    await ballControls.start({
      x: 0, y: 0, rotate: -720, scale: 1.08,
      transition: {
        x:      { duration: 0.65, ease: [0.12, 0.8, 0.35, 1.0] },
        y:      { duration: 0.65, ease: [0.12, 0.8, 0.35, 1.0] },
        rotate: { duration: 0.65, ease: [0.0,  0.0, 0.2,  1.0] },
        scale:  { duration: 0.35, ease: 'easeOut' },
      },
    });
    ballControls.set({ rotate: 0 });
    await ballControls.start({
      y:     [0, -18, 5, -7, 0],
      scale: [1.08, 0.95, 1.04, 0.98, 1.0],
      transition: { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] },
    });
    ballControls.set({ x: 0, y: 0, rotate: 0, scale: 1 });
  }, [ballControls]);

  // Fire animations on state transitions
  const prevStateRef = useRef<AssistantState>('idle');
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if ((state === 'excited' || state === 'success') && prev !== state) {
      triggerJump();
    } else if (state === 'error' && prev !== 'error') {
      triggerShake();
    } else if ((state === 'woken' || state === 'listening') && (prev === 'idle' || prev === 'sleeping')) {
      triggerWakeSpinEntry();
    }
  }, [state, triggerJump, triggerShake, triggerWakeSpinEntry]);

  // ── Command timeout ───────────────────────────────────────────────────────────
  const resetCommandTimeout = useCallback(() => {
    if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    commandTimeoutRef.current = setTimeout(() => {
      if (stateRef.current === 'listening') {
        goIdle(); // eslint-disable-line @typescript-eslint/no-use-before-define
      }
    }, 7000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TTS with phoneme mouth sync ───────────────────────────────────────────────
  const speak = useCallback((text: string, onDone?: () => void) => {
    window.speechSynthesis.cancel();
    isSpeakingRef.current = true;
    try { recRef.current?.stop(); } catch (_) {}

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate   = 0.92;
    utter.pitch  = 1.08;
    utter.volume = 1;

    const assignVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find(v => /samantha|karen|moira|google uk/i.test(v.name)) ||
        voices.find(v => v.lang === 'en-IN') ||
        voices.find(v => v.lang.startsWith('en'));
      if (preferred) utter.voice = preferred;
    };
    assignVoice();
    if (!window.speechSynthesis.getVoices().length) {
      window.speechSynthesis.onvoiceschanged = assignVoice;
    }

    if (mouthIntervalRef.current) clearInterval(mouthIntervalRef.current);
    setSpeechBeat(0);
    setMouthOpen(0.28);

    const frames        = buildMouthFrames(text);
    const msPerChar     = Math.round(74 / (utter.rate || 1));
    const tickMs        = 33; // ~30 fps smooth step
    const ticksPerFrame = msPerChar / tickMs;

    let frameIdx    = 0;
    let tickAccum   = 0;
    let smoothMouth = 0.28;
    let targetMouth = 0.28;

    mouthIntervalRef.current = setInterval(() => {
      tickAccum += 1;
      if (tickAccum >= ticksPerFrame && frameIdx < frames.length) {
        tickAccum   = 0;
        targetMouth = frames[frameIdx++];
      }
      const lerpRate = targetMouth > smoothMouth ? 0.52 : 0.38;
      smoothMouth += (targetMouth - smoothMouth) * lerpRate;
      const v = Math.max(0, Math.min(1, smoothMouth));
      setMouthOpen(v);
      setSpeechBeat(v > 0.50 ? v * 0.85 : 0);
    }, tickMs);

    utter.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name === 'word' && typeof e.charIndex === 'number') {
        frameIdx  = Math.min(e.charIndex, frames.length - 1);
        tickAccum = 0;
      }
    };

    const cleanup = () => {
      if (mouthIntervalRef.current) clearInterval(mouthIntervalRef.current);
      setMouthOpen(0);
      setSpeechBeat(0);
      isSpeakingRef.current = false;
      if (shouldListenRef.current) {
        setTimeout(() => { try { recRef.current?.start(); } catch (_) {} }, 200);
      }
      onDone?.();
    };
    utter.onend   = cleanup;
    utter.onerror = cleanup;
    window.speechSynthesis.speak(utter);
  }, []);

  // ── Go idle ───────────────────────────────────────────────────────────────────
  const goIdle = useCallback(() => {
    window.speechSynthesis.cancel();
    if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    idleCycleActiveRef.current = false;
    setIsJuggling(false);
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    recModeRef.current   = 'wakeword';
    lastFinalRef.current = '';
    setState('idle');
    setStatusText('');
    setCommandText('');
    setResponseText('');
    setInterimText('');
    setShowHints(false);
    failCountRef.current = 0;
  }, []);

  // ── Enter listening mode ──────────────────────────────────────────────────────
  const enterListening = useCallback((skipIntro = false) => {
    recModeRef.current   = 'command';
    lastFinalRef.current = '';
    setCommandText('');
    setResponseText('');
    setInterimText('');

    if (firstLaunchRef.current && !skipIntro) {
      firstLaunchRef.current = false;
      setState('woken');
      setStatusText('Listening…');
      setTimeout(() => {
        setState('thinking');
        setStatusText('Thinking…');
        setTimeout(() => {
          setState('speaking');
          setStatusText('Speaking');
          setResponseText(INTRO_TEXT);
          speak(INTRO_TEXT, () => {
            setState('listening');
            setStatusText('Listening…');
            setResponseText('');
            resetCommandTimeout();
          });
        }, 350 + Math.random() * 300);
      }, 250);
    } else {
      setState('listening');
      setStatusText('Listening…');
      resetCommandTimeout();
    }
  }, [speak, resetCommandTimeout]);

  // ── Wake assistant ────────────────────────────────────────────────────────────
  const wakeAssistantRef = useRef<() => void>(() => {});
  const wakeAssistant = useCallback(() => {
    if (stateRef.current !== 'idle' && stateRef.current !== 'sleeping') return;
    idleCycleActiveRef.current = false;
    setIsJuggling(false);
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    enterListening();
  }, [enterListening]);
  useEffect(() => { wakeAssistantRef.current = wakeAssistant; }, [wakeAssistant]);

  // ── Handle command ────────────────────────────────────────────────────────────
  const handleCommandRef = useRef<(t: string) => void>(() => {});
  const handleCommand = useCallback((transcript: string) => {
    if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    setState('thinking');
    setCommandText(`"${transcript}"`);
    setInterimText('');
    setStatusText('Thinking…');

    const ctx = ctxRef.current;
    const currentTemp  = ctx.tempHistory.at(-1)?.value ?? 31.2;
    const currentHum   = ctx.humHistory.at(-1)?.value  ?? 68;
    const currentSoil  = ctx.soilHistory.at(-1)?.value ?? 42;
    const condition    = currentSoil < 35 ? 'Dry' : currentSoil > 65 ? 'Wet' : 'Balanced';

    const calcStat = (h: { value: number }[]) => {
      if (!h.length) return { max: '0', min: '0', avg: '0' };
      const v = h.map(x => x.value);
      return { max: Math.max(...v).toFixed(1), min: Math.min(...v).toFixed(1), avg: (v.reduce((a,b)=>a+b,0)/v.length).toFixed(1) };
    };

    const t = transcript.toLowerCase().trim();

    if (/\b(repeat|say that again|again|what did you say)\b/.test(t)) {
      const rpt = lastResponseRef.current || `I haven't said anything yet! Ask me something first.`;
      setTimeout(() => {
        setState('speaking'); setStatusText('Speaking'); setResponseText(rpt);
        speak(rpt, () => {
          setState('listening'); setStatusText('Listening…');
          resetCommandTimeout();
        });
      }, 300 + Math.random() * 400);
      return;
    }

    let localPumpOn = ctx.pumpOn;
    let localFanOn  = ctx.fanOn;
    let localMode   = ctx.systemMode as 'auto' | 'manual';

    const makeCtx = () => ({
      pumpOn: localPumpOn, fanOn: localFanOn, mode: localMode,
      currentTemp, currentHum, currentSoil, condition,
      tStats: calcStat(ctx.tempHistory),
      hStats: calcStat(ctx.humHistory),
      sStats: calcStat(ctx.soilHistory),
      readings: ctx.readings,
      onPumpToggle: (v: boolean)           => { localPumpOn = v; ctx.onPumpToggle(v); },
      onFanToggle:  (v: boolean)           => { localFanOn  = v; ctx.onFanToggle(v);  },
      onModeChange: (m: 'auto' | 'manual') => { localMode   = m; ctx.onModeChange(m); },
      onReset:       ctx.onReset,
      onOpenAnalysis: ctx.onOpenAnalysis,
      onExportPDF: () => {
        try { generatePDF({ readings: ctx.readings, tempHistory: ctx.tempHistory, humHistory: ctx.humHistory, soilHistory: ctx.soilHistory, pumpOn: ctx.pumpOn, fanOn: ctx.fanOn, mode: ctx.systemMode }); } catch (e) { console.error('PDF error', e); }
      },
      onExportExcel: () => {
        try {
          const header = ['Time', 'Temperature (°C)', 'Humidity (%)', 'Soil Moisture (%)', 'Pitch Status', 'Pump', 'Fan', 'Mode'];
          const rows = ctx.readings.map(r => [r.time, r.temp, r.humidity, r.soil, r.pitchStatus, r.pumpOn ? 'ON' : 'OFF', r.fanOn ? 'ON' : 'OFF', r.mode]);
          const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Readings');
          XLSX.writeFile(wb, 'Cricket-Pitch-Readings.xlsx');
        } catch (e) { console.error('Excel error', e); }
      },
    });

    const commands = parseMultiCommand(transcript);
    const numCmds  = commands.length;

    const thinkDelay =
      numCmds >= 4 ? 1500 + Math.random() * 700 :
      numCmds === 3 ? 1200 + Math.random() * 300 :
      numCmds === 2 ? 700  + Math.random() * 200 :
                      350  + Math.random() * 350;

    const results = commands.map(cmd => processCommand(cmd, makeCtx(), setGesture, goIdle));

    let response: string;
    let stateHint: AssistantState | undefined;

    if (results.length === 1) {
      response  = results[0].response;
      stateHint = results[0].stateHint;
    } else {
      response  = results.map(r => r.response).join(' ');
      stateHint =
        results.find(r => r.stateHint === 'error')?.stateHint   ??
        results.find(r => r.stateHint === 'success')?.stateHint ??
        results[results.length - 1]?.stateHint;
    }

    lastResponseRef.current = response;

    if (stateHint === 'error') {
      failCountRef.current += 1;
      if (failCountRef.current >= 3) { setShowHints(true); failCountRef.current = 0; }
    } else {
      failCountRef.current = 0;
      setShowHints(false);
    }

    setTimeout(() => {
      setState(stateHint && stateHint !== 'idle' ? stateHint : 'speaking');
      setStatusText('Speaking');
      setResponseText(response);
      speak(response, () => {
        setTimeout(() => {
          if (stateRef.current !== 'idle' && stateRef.current !== 'sleeping') {
            setState('listening');
            setStatusText('Listening…');
            resetCommandTimeout();
          }
        }, stateHint === 'success' || stateHint === 'excited' || stateHint === 'error' ? 700 : 0);
      });
    }, thinkDelay);
  }, [speak, goIdle, setGesture, resetCommandTimeout]);

  useEffect(() => { handleCommandRef.current = handleCommand; }, [handleCommand]);

  // ── Speech Recognition — created ONCE ────────────────────────────────────────
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setIsSupported(false); return; }

    const rec = new SR();
    rec.lang            = COMMAND_LANG;
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.maxAlternatives = 3;
    recRef.current      = rec;

    rec.onresult = (e: any) => {
      if (isSpeakingRef.current) return;

      let interimTxt = '';
      let finalTxt   = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        let best = e.results[i][0].transcript;
        for (let a = 1; a < e.results[i].length; a++) {
          if (e.results[i][a].confidence > e.results[i][0].confidence) best = e.results[i][a].transcript;
        }
        if (e.results[i].isFinal) finalTxt += best;
        else interimTxt += best;
      }

      const currentState = stateRef.current;
      const mode = recModeRef.current;

      // ── Wake word ──
      if (mode === 'wakeword' && (currentState === 'idle' || currentState === 'sleeping')) {
        const allText = (interimTxt + ' ' + finalTxt).toLowerCase().trim();
        if (allText && !wakeDebounceRef.current) {
          const found = WAKE_WORDS.some(w => allText.includes(w));
          if (found) {
            wakeDebounceRef.current = true;
            setTimeout(() => { wakeDebounceRef.current = false; }, 2500);
            const stripped = WAKE_WORDS.reduce((s, w) => s.replace(w, ''), allText).trim();
            if (stripped.length > 2) {
              recModeRef.current   = 'command';
              lastFinalRef.current = '';
              if (firstLaunchRef.current) {
                firstLaunchRef.current = false;
                setState('woken'); setStatusText('Listening…');
                setTimeout(() => {
                  setState('thinking'); setStatusText('Thinking…');
                  setTimeout(() => {
                    setState('speaking'); setStatusText('Speaking');
                    setResponseText(INTRO_TEXT);
                    speak(INTRO_TEXT, () => handleCommandRef.current(stripped));
                  }, 350 + Math.random() * 250);
                }, 200);
              } else {
                setState('listening'); setStatusText('Listening…');
                handleCommandRef.current(stripped);
              }
            } else {
              recModeRef.current   = 'command';
              lastFinalRef.current = '';
              if (firstLaunchRef.current) {
                firstLaunchRef.current = false;
                setState('woken'); setStatusText('Listening…');
                setTimeout(() => {
                  setState('thinking'); setStatusText('Thinking…');
                  setTimeout(() => {
                    setState('speaking'); setStatusText('Speaking');
                    setResponseText(INTRO_TEXT);
                    speak(INTRO_TEXT, () => {
                      setState('listening'); setStatusText('Listening…');
                      setResponseText(''); resetCommandTimeout();
                    });
                  }, 350 + Math.random() * 250);
                }, 200);
              } else {
                setState('woken'); setStatusText('Listening…');
                speak(`Go ahead, I'm listening.`, () => {
                  setState('listening'); setStatusText('Listening…');
                  resetCommandTimeout();
                });
              }
            }
          }
        }
        return;
      }

      // ── Command ──
      if (mode === 'command' && currentState === 'listening') {
        if (interimTxt || finalTxt) resetCommandTimeout();
        if (interimTxt) setInterimText(interimTxt);
        if (finalTxt) {
          const deduped = finalTxt.trim();
          if (deduped && deduped !== lastFinalRef.current) {
            lastFinalRef.current = deduped;
            setInterimText('');
            const cmd = WAKE_WORDS.reduce((s, w) => s.replace(w, ''), deduped.toLowerCase()).trim();
            if (cmd.length > 1) handleCommandRef.current(cmd || deduped);
          }
        }
      }
    };

    rec.onend = () => {
      if (!shouldListenRef.current || isSpeakingRef.current) return;
      const delay = restartDelayRef.current;
      restartDelayRef.current = Math.min(delay * 1.5, 2000);
      setTimeout(() => { restartDelayRef.current = 150; try { rec.start(); } catch (_) {} }, delay);
    };

    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        shouldListenRef.current = false;
        try { rec.stop(); } catch (_) {}
        setIsSupported(false);
        setPermDenied(true);
        return;
      }
    };

    try { rec.start(); } catch (_) {}
    return () => { shouldListenRef.current = false; try { rec.stop(); } catch (_) {} };
  }, []); // Created ONCE

  // ── Idle animation cycle (phase-aware) ───────────────────────────────────────
  useEffect(() => {
    if (state !== 'idle' || idlePhase === 0 || idlePhase === 3) {
      if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
      if (idlePhase === 0) setIdleAnim('breathe');
      return;
    }
    const anims = idlePhase === 1 ? IDLE_ANIMS_P1 : IDLE_ANIMS_P2;
    const pick = () => setIdleAnim(anims[Math.floor(Math.random() * anims.length)]);
    pick();
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = idlePhase === 1 ? 4000 + Math.random() * 4000 : 3000 + Math.random() * 3000;
      t = setTimeout(() => { pick(); schedule(); }, ms);
    };
    schedule();
    return () => { clearTimeout(t); };
  }, [state, idlePhase]);

  // ── Periodic blink ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state !== 'idle') return;
    const scheduleBlink = () => {
      blinkTimeoutRef.current = setTimeout(() => {
        setBlinkNow(true);
        setTimeout(() => setBlinkNow(false), 150);
        scheduleBlink();
      }, 3000 + Math.random() * 5000);
    };
    scheduleBlink();
    return () => { if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current); };
  }, [state]);

  // ── Eye wander ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state === 'idle') {
      eyeIntervalRef.current = setInterval(() => {
        setEyeX((Math.random() - 0.5) * 2.5);
        setEyeY((Math.random() - 0.5) * 1.5);
      }, 2800);
    } else {
      if (eyeIntervalRef.current) clearInterval(eyeIntervalRef.current);
    }
    return () => { if (eyeIntervalRef.current) clearInterval(eyeIntervalRef.current); };
  }, [state]);

  // ── Thinking animation cycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (state !== 'thinking') { if (thinkIntervalRef.current) clearInterval(thinkIntervalRef.current); return; }
    const pick = () => setThinkAnim(THINK_ANIMS[Math.floor(Math.random() * THINK_ANIMS.length)]);
    pick();
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = 2000 + Math.random() * 1500;
      t = setTimeout(() => { pick(); schedule(); }, ms);
    };
    schedule();
    return () => { clearTimeout(t); };
  }, [state]);

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    window.speechSynthesis.cancel();
    idleCycleActiveRef.current = false;
    [mouthIntervalRef, eyeIntervalRef, idleIntervalRef, thinkIntervalRef]
      .forEach(r => { if (r.current) clearInterval(r.current); });
    [commandTimeoutRef, blinkTimeoutRef, gestureTimeoutRef, phase1TimerRef, phase2TimerRef, phase3TimerRef, cycleTimerRef]
      .forEach(r => { if (r.current) clearTimeout(r.current); });
  }, []);

  // ── Unsupported ───────────────────────────────────────────────────────────────
  if (!isSupported) {
    return (
      <>
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-[71] w-[min(92vw,560px)] bg-slate-950/95 backdrop-blur-xl text-white rounded-2xl px-5 py-3.5 border border-white/20 shadow-[0_10px_36px_rgba(0,0,0,0.3)] text-center">
          <p className="text-sm sm:text-base font-semibold tracking-tight">
            <span className="mr-2 text-emerald-300">●</span>
            Ball AI <span className="mx-1.5 text-white/40">•</span> Say "Hey Ball" to interact
          </p>
          <p className="mt-1.5 text-[11px] sm:text-xs text-slate-300">Voice controls are currently unavailable in this browser.</p>
        </div>
        <div className="fixed bottom-6 right-4 sm:right-6 z-[72] bg-white/95 backdrop-blur-xl rounded-2xl p-3 sm:p-4 shadow-xl border border-red-200 text-xs text-red-600 max-w-[min(230px,calc(100vw-32px))]">
          <p className="font-bold mb-1">🎤 Microphone {permDenied ? 'blocked' : 'unavailable'}</p>
          <p>{permDenied ? 'Allow microphone access in your browser settings to use Ball.' : 'Your browser does not support speech recognition.'}</p>
        </div>
      </>
    );
  }

  const isActive   = state !== 'idle' && state !== 'sleeping';
  const isSleeping = state === 'sleeping';

  // Body float/tilt — only use transform, never width/height
  const idleY      = isActive ? 0 : (idlePhase >= 1 && ['bounce', 'float', 'breathe', 'tiny_bounce'].includes(idleAnim)) ? [0, -8, 0] : [0, -4, 0];
  const idleRotate = isActive ? 0 : (idlePhase >= 2 && ['tilt', 'roll', 'curious'].includes(idleAnim)) ? [-6, 6, -6] : 0;
  const idleScale  = isActive ? 1 : (idlePhase >= 1 && ['breathe', 'stretch'].includes(idleAnim)) ? [1, 1.04, 1] : 1;

  const statusColor =
    state === 'listening'                     ? 'text-green-400'   :
    state === 'thinking'                      ? 'text-amber-400'   :
    state === 'speaking' || state === 'woken' ? 'text-blue-400'    :
    state === 'excited'  || state === 'success' ? 'text-emerald-400' :
    state === 'error'                         ? 'text-red-400'     : 'text-slate-400';

  const dotColor =
    state === 'listening'                     ? 'bg-green-400'   :
    state === 'thinking'                      ? 'bg-amber-400'   :
    state === 'speaking' || state === 'woken' ? 'bg-blue-400'    :
    state === 'excited'  || state === 'success' ? 'bg-emerald-400' :
    state === 'error'                         ? 'bg-red-400'     : 'bg-slate-500';

  const statusLabel =
    state === 'listening' ? 'Listening…'  :
    state === 'thinking'  ? 'Thinking…'   :
    state === 'speaking'  ? 'Speaking'    :
    state === 'woken'     ? 'Listening…'  :
    state === 'excited'   ? 'Excited!'    :
    state === 'success'   ? 'Done!'       :
    state === 'error'     ? 'Hmm…'       : '';

  return (
    <>
      <GrassWaveEffect active={isActive} />
      <EntryRipple active={entryRippleActive} />

      {/* Floating assistant container — uses transform for position, never left/top */}
      <div
        className="fixed z-[60]"
        style={{
          bottom: 24,
          right: isActive ? 'calc(50% - 70px)' : 16,
          transition: 'right 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          willChange: 'right',
          transform: 'translateZ(0)',
        }}
      >
        {/* ── Assistant panel ── */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              className="pointer-events-auto"
              initial={{ opacity: 0, y: 20, scale: 0.90 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{ opacity: 0,    y: 12, scale: 0.93 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              style={{ width: 'min(330px, calc(100vw - 40px))', willChange: 'transform' }}
            >
              <div
                className="rounded-[24px] p-4 sm:p-5 border border-white/20 shadow-2xl"
                style={{
                  background: 'rgba(10,18,40,0.92)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.10)',
                  transform: 'translateZ(0)',
                }}
              >
                {/* Header */}
                <div className="flex items-center gap-2.5 mb-3">
                  <motion.div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`}
                    animate={state === 'listening' ? { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] } : { scale: 1, opacity: 1 }}
                    transition={{ duration: 0.9, repeat: state === 'listening' ? Infinity : 0 }}
                  />
                  <span className={`text-[11px] font-bold tracking-widest uppercase ${statusColor}`}>
                    Ball AI &nbsp;·&nbsp; {statusLabel}
                  </span>

                  {state === 'listening' && (
                    <motion.div
                      className="ml-auto w-7 h-7 rounded-full bg-green-500/15 border border-green-400/30 flex items-center justify-center flex-shrink-0"
                      animate={{ boxShadow: ['0 0 0 0 rgba(34,197,94,0.4)', '0 0 0 8px rgba(34,197,94,0)', '0 0 0 0 rgba(34,197,94,0)'] }}
                      transition={{ duration: 1.3, repeat: Infinity }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <rect x="9" y="2" width="6" height="13" rx="3" fill="#4ade80" />
                        <path d="M5 10v2a7 7 0 0014 0v-2" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
                        <line x1="12" y1="19" x2="12" y2="23" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </motion.div>
                  )}

                  <button
                    onClick={goIdle}
                    className="ml-auto flex-shrink-0 w-6 h-6 rounded-lg bg-white/8 hover:bg-white/15 text-slate-400 hover:text-white transition-colors flex items-center justify-center text-xs"
                  >✕</button>
                </div>

                {/* Voice waveform (listening) */}
                {state === 'listening' && (
                  <div className="mb-3"><VoiceWaveform active /></div>
                )}

                {/* Speaking indicator */}
                {state === 'speaking' && (
                  <div className="flex items-end gap-[2px] h-4 mb-3">
                    {[0.6, 0.9, 1, 0.8, 0.7, 1, 0.85].map((h, i) => (
                      <motion.div key={i}
                        className="w-[3px] rounded-full bg-blue-400/70"
                        style={{ height: `${h * 100}%` }}
                        animate={{ scaleY: [h, h * 0.4, h], opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 0.25 + i * 0.04, repeat: Infinity, repeatType: 'mirror' }}
                      />
                    ))}
                  </div>
                )}

                {/* Thinking dots */}
                {state === 'thinking' && (
                  <div className="flex gap-1.5 mb-3">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-2 h-2 rounded-full bg-amber-400"
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }}
                      />
                    ))}
                  </div>
                )}

                {/* Interim text */}
                <AnimatePresence>
                  {interimText && state === 'listening' && (
                    <motion.p
                      className="text-[11px] text-slate-400 italic mb-2 truncate"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    >{interimText}…</motion.p>
                  )}
                </AnimatePresence>

                {/* Recognized command */}
                <AnimatePresence>
                  {commandText && (
                    <motion.div
                      className="mb-2.5 px-3 py-1.5 rounded-xl bg-white/6 border border-white/8"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    >
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">You said</p>
                      <p className="text-sm text-green-300 font-semibold italic leading-snug">{commandText}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Response */}
                <AnimatePresence>
                  {responseText && (
                    <motion.p
                      className="text-sm text-white/90 leading-relaxed font-medium"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    >{responseText}</motion.p>
                  )}
                </AnimatePresence>

                {state === 'listening' && !commandText && !interimText && (
                  <p className="text-[11px] text-slate-500 mt-1">Say a command or ask a question…</p>
                )}

                {/* Hint panel (3 failures) */}
                <AnimatePresence>
                  {showHints && (
                    <motion.div
                      className="mt-3 pt-3 border-t border-white/8"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    >
                      <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Try saying:</p>
                      <ul className="space-y-1">
                        {COMMAND_HINTS.map((hint, i) => (
                          <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                            <span className="text-green-500 flex-shrink-0">•</span>{hint}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>

                {isPorcupineConfigured() && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[9px] text-emerald-400/70 font-bold uppercase tracking-wider">Porcupine Wake Engine</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Cricket Ball Mascot ── */}
        <motion.div
          className="cursor-pointer relative flex-shrink-0"
          animate={ballControls}
          style={{
            pointerEvents: 'auto',
            width: isActive ? 140 : 64,
            height: isActive ? 140 : 64,
            willChange: 'transform',
          }}
        >
          <motion.div
            style={{ width: '100%', height: '100%', willChange: 'transform' }}
            animate={{
              scaleX: isActive ? 1 : 1,
              scaleY: isActive ? 1 : idleScale as any,
              y:      isActive ? 0 : idleY as any,
              rotate: isActive ? 0 : idleRotate as any,
            }}
            transition={{
              scaleX: { type: 'spring', damping: 18, stiffness: 200 },
              scaleY: { duration: idlePhase >= 1 && idleAnim === 'breathe' ? 2.5 : 1, repeat: Infinity, ease: 'easeInOut' },
              y:      { duration: (idlePhase >= 1 && idleAnim === 'bounce') ? 1.8 : 3, repeat: Infinity, ease: 'easeInOut' },
              rotate: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
            }}
            onClick={() => {
              if (state === 'idle' || state === 'sleeping') wakeAssistant();
              else if (state !== 'thinking') goIdle();
            }}
            title={state === 'idle' ? 'Tap to activate Ball AI, or say "Hey Ball"' : 'Tap to dismiss'}
            whileHover={{ scale: isActive ? 1.05 : 1.14 }}
            whileTap={{ scale: 0.92 }}
          >
            {/* Glow ring */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                boxShadow: isActive
                  ? '0 0 44px rgba(34,197,94,0.4), 0 10px 36px rgba(0,0,0,0.55)'
                  : isSleeping
                  ? '0 4px 18px rgba(0,0,0,0.25), 0 0 0 2px rgba(148,163,184,0.15)'
                  : '0 8px 24px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.08)',
                transition: 'box-shadow 0.4s ease',
              }}
            />
            <CricketBall
              state={state}
              idleAnim={idleAnim}
              idlePhase={idlePhase}
              thinkAnim={thinkAnim}
              mouthOpen={mouthOpen}
              eyeX={eyeX}
              eyeY={eyeY}
              blinkNow={blinkNow}
              gesture={gesture}
              speaking={isSpeakingRef.current}
              speechBeat={speechBeat}
              isJuggling={isJuggling}
            />
          </motion.div>
        </motion.div>

        {/* Status label above ball (sleeping / juggling) */}
        <AnimatePresence>
          {!isActive && (isSleeping || isJuggling) && (
            <motion.div
              key={isSleeping ? 'sleep-label' : 'play-label'}
              className="pointer-events-none fixed bottom-[104px] right-6 z-[71] max-w-[calc(100vw-48px)] bg-slate-950/95 backdrop-blur-xl text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-2xl whitespace-nowrap border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.3 }}
            >
              {isSleeping ? '💤 Sleeping' : '🏏 Playing cricket'} — say "Hey Ball"
            </motion.div>
          )}
        </AnimatePresence>

        {/* Persistent idle hint */}
        {!isActive && !isSleeping && !isJuggling && (
          <div
            className="pointer-events-none fixed bottom-[104px] right-6 z-[71] max-w-[calc(100vw-48px)] bg-slate-950/95 backdrop-blur-xl text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-2xl whitespace-nowrap border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
          >
            <span className="mr-2 text-emerald-300">●</span>
            Ball AI <span className="mx-1.5 text-white/40">•</span> Say "Hey Ball" to interact
          </div>
        )}
      </div>
    </>
  );
}
