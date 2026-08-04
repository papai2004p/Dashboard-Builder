/**
 * generatePDF.ts
 *
 * Produces a professional A4 PDF report for the AI Smart Cricket Pitch Dashboard.
 *
 * Layout (all measurements in mm, A4 = 210 × 297):
 *
 *  y=  0 – 42   HEADER           (cricket theme illustrations + branding)
 *  y= 42 – 54   INFO BAR         (pitch location / date)
 *  y= 56 – 98   EXECUTIVE SUMMARY (5 metric cards)
 *  y=100 – 126  SENSOR OVERVIEW  (3 sensor cards)
 *  y=128 – 186  TRENDS & ANALYTICS (two line charts)
 *  y=188 – 258  RECENT READINGS + SYSTEM STATUS (table + status panel)
 *  y=259 – 279  DATA SUMMARY     (max / min / avg for each sensor)
 *  y=281 – 297  FOOTER
 */

import jsPDF from 'jspdf';
import type { Reading } from './types';

// ─── Public types ────────────────────────────────────────────────────────────

export interface PDFData {
  readings: Reading[];
  tempHistory: { time: number; value: number }[];
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn: boolean;
  mode: 'auto' | 'manual';
}

// ─── Internal types ──────────────────────────────────────────────────────────

type RGB = [number, number, number];

// ─── Utility helpers ─────────────────────────────────────────────────────────

function calcStats(history: { value: number }[]) {
  if (!history.length) return { max: '0.0', min: '0.0', avg: '0.0' };
  const vals = history.map((h) => h.value);
  return {
    max: Math.max(...vals).toFixed(1),
    min: Math.min(...vals).toFixed(1),
    avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
  };
}

function pitchLabel(soil: number) {
  if (soil < 35) return 'Dry';
  if (soil > 65) return 'Wet';
  return 'Balanced';
}

/** Rounded-rect shorthand (jsPDF typings omit this method). */
function rr(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  radius: number,
  style: 'F' | 'S' | 'FD' = 'F',
) {
  (doc as any).roundedRect(x, y, w, h, radius, radius, style);
}

// ─── Arc helper (jsPDF has no native arc-stroke; use polyline) ───────────────

/** Draws a circular arc as a polyline from fromDeg → toDeg (standard math angles). */
function arcLine(
  doc: jsPDF,
  cx: number, cy: number, r: number,
  fromDeg: number, toDeg: number,
  segments = 12,
) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (fromDeg + (toDeg - fromDeg) * (i / segments)) * (Math.PI / 180);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  for (let i = 1; i < pts.length; i++) {
    doc.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  }
}

// ─── Per-card icon drawing ────────────────────────────────────────────────────

type IconType = 'temp' | 'hum' | 'fan' | 'pump' | 'health' | 'wifi';

/**
 * Draws a vector icon centred at (cx, cy) scaled to radius r.
 * All shapes stay within the r-radius bounding circle.
 */
function drawIcon(
  doc: jsPDF,
  type: IconType,
  cx: number, cy: number,
  color: RGB,
  r: number,
) {
  const [cr, cg, cb] = color;
  const s = r / 4;   // design unit: r=4 → s=1; r=5.5 → s=1.375; r=3.5 → s=0.875

  if (type === 'temp') {
    // ── Thermometer: tube + mercury + tick marks ──────────────────────────
    // Shift drawing centre upward so bulb sits at lower 40% of circle
    const icy = cy + 0.8 * s;
    const tw = 1.6 * s, th = 3.6 * s, br = 1.9 * s;
    const ty = icy - th - br * 0.35;
    // White bg: tube + bulb
    doc.setFillColor(255, 255, 255);
    rr(doc, cx - tw / 2, ty, tw, th + br * 0.35 + 0.3, tw / 2, 'F');
    doc.circle(cx, icy, br, 'F');
    // Coloured mercury fill
    doc.setFillColor(cr, cg, cb);
    rr(doc, cx - tw * 0.36, ty + th * 0.28, tw * 0.72, th * 0.72 + br * 0.35 + 0.3, tw * 0.36, 'F');
    doc.circle(cx, icy, br * 0.68, 'F');
    // Tube outline
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(0.28);
    rr(doc, cx - tw / 2, ty, tw, th + br * 0.35 + 0.3, tw / 2, 'S');
    // 3 tick marks on right side
    doc.setLineWidth(0.28);
    [0.28, 0.52, 0.76].forEach((frac) => {
      const yt = ty + frac * th;
      doc.line(cx + tw / 2, yt, cx + tw / 2 + 1.1 * s, yt);
    });

  } else if (type === 'hum') {
    // ── Water drop: pointed top + round bottom + shine ────────────────────
    const icy = cy + 0.5 * s;
    const dr = 2.05 * s;
    const tipY = icy - 4.0 * s;
    const baseY = icy + dr * 0.55;
    // White bg
    doc.setFillColor(255, 255, 255);
    (doc as any).triangle(cx - dr * 1.1, baseY, cx + dr * 1.1, baseY, cx, tipY, 'F');
    doc.circle(cx, icy, dr, 'F');
    // Coloured fill (slightly inset)
    doc.setFillColor(cr, cg, cb);
    (doc as any).triangle(cx - dr * 0.88, baseY - 0.25, cx + dr * 0.88, baseY - 0.25, cx, tipY + 0.9 * s, 'F');
    doc.circle(cx, icy, dr * 0.8, 'F');
    // White shine ellipse
    doc.setFillColor(255, 255, 255);
    (doc as any).ellipse(cx - dr * 0.32, icy - dr * 0.28, dr * 0.22, dr * 0.34, 'F');

  } else if (type === 'fan') {
    // ── Fan: 4 offset blades + hub ────────────────────────────────────────
    const bd = 2.0 * s;
    const brx = 2.0 * s, bry = 1.0 * s;
    doc.setFillColor(cr, cg, cb);
    // Blades at quasi-45° positions with alternating radii for spin effect
    ;(doc as any).ellipse(cx - bd * 0.55, cy - bd * 0.78, brx, bry, 'F');
    ;(doc as any).ellipse(cx + bd * 0.78, cy - bd * 0.55, bry, brx, 'F');
    ;(doc as any).ellipse(cx + bd * 0.55, cy + bd * 0.78, brx, bry, 'F');
    ;(doc as any).ellipse(cx - bd * 0.78, cy + bd * 0.55, bry, brx, 'F');
    // Hub: white ring + accent centre
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, 1.35 * s, 'F');
    doc.setFillColor(cr, cg, cb);
    doc.circle(cx, cy, 0.68 * s, 'F');

  } else if (type === 'pump') {
    // ── Faucet: horizontal pipe + valve knob + spout + drop ──────────────
    const pipeY = cy - 1.2 * s;
    const pw = 6.0 * s, ph = 1.5 * s;
    const sw2 = 1.4 * s, sh2 = 2.4 * s;
    // White bg
    doc.setFillColor(255, 255, 255);
    rr(doc, cx - pw / 2, pipeY, pw, ph, ph / 2, 'F');               // pipe
    doc.circle(cx, pipeY - 1.05 * s, 1.3 * s, 'F');                 // valve knob
    doc.setLineWidth(0.35);
    doc.setDrawColor(255, 255, 255);
    doc.line(cx, pipeY - 0.5 * s, cx, pipeY);                        // stem
    rr(doc, cx - sw2 / 2, pipeY + ph, sw2, sh2, sw2 / 2, 'F');     // spout
    // Drop
    doc.circle(cx, pipeY + ph + sh2 + 0.85 * s, 0.9 * s, 'F');
    (doc as any).triangle(
      cx - 0.7 * s, pipeY + ph + sh2,
      cx + 0.7 * s, pipeY + ph + sh2,
      cx, pipeY + ph + sh2 - 0.9 * s, 'F',
    );
    // Coloured fill over bg
    doc.setFillColor(cr, cg, cb);
    rr(doc, cx - pw / 2 + 0.35, pipeY + 0.35, pw - 0.7, ph - 0.35, (ph - 0.35) / 2, 'F');
    doc.circle(cx, pipeY - 1.05 * s, 0.95 * s, 'F');
    rr(doc, cx - sw2 / 2 + 0.3, pipeY + ph + 0.3, sw2 - 0.6, sh2 - 0.3, (sw2 - 0.6) / 2, 'F');

  } else if (type === 'health') {
    // ── Shield + checkmark ────────────────────────────────────────────────
    const icy = cy + 0.3 * s;
    const sw = 5.0 * s, she = 5.8 * s;
    const sy = icy - she * 0.5;
    // White bg shield
    doc.setFillColor(255, 255, 255);
    rr(doc, cx - sw / 2, sy, sw, she * 0.68, 1.2, 'F');
    (doc as any).triangle(cx - sw / 2, sy + she * 0.68, cx + sw / 2, sy + she * 0.68, cx, sy + she, 'F');
    // Coloured fill (inset)
    doc.setFillColor(cr, cg, cb);
    rr(doc, cx - sw / 2 + 0.4, sy + 0.4, sw - 0.8, she * 0.68 - 0.4, 0.9, 'F');
    (doc as any).triangle(
      cx - sw / 2 + 0.5, sy + she * 0.68 - 0.1,
      cx + sw / 2 - 0.5, sy + she * 0.68 - 0.1,
      cx, sy + she - 0.55, 'F',
    );
    // White checkmark
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.65 * s);
    const ckY = sy + she * 0.38;
    doc.line(cx - 1.55 * s, ckY, cx - 0.35 * s, ckY + 1.5 * s);
    doc.line(cx - 0.35 * s, ckY + 1.5 * s, cx + 1.85 * s, ckY - 1.15 * s);

  } else if (type === 'wifi') {
    // ── WiFi: dot + 3 arcs opening upward ────────────────────────────────
    // Dot sits at bottom of circle; arcs sweep upward
    const dotY = cy + 3.0 * s;
    doc.setFillColor(cr, cg, cb);
    doc.circle(cx, dotY, 0.72 * s, 'F');
    doc.setDrawColor(cr, cg, cb);
    [1.65 * s, 2.7 * s, 3.75 * s].forEach((ar, idx) => {
      doc.setLineWidth(0.55 + idx * 0.12);
      arcLine(doc, cx, dotY, ar, 210, 330);
    });
  }
}

/** Draws a green accent bar + bold section title. */
function sectionTitle(doc: jsPDF, x: number, y: number, title: string) {
  doc.setFillColor(10, 100, 45);
  doc.rect(x, y, 3, 7, 'F');
  doc.setTextColor(10, 35, 15);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(title, x + 5.5, y + 5.3);
  doc.setDrawColor(200, 235, 210);
  doc.setLineWidth(0.25);
  doc.line(x, y + 7.8, x + 194, y + 7.8);
}

// ─── Line chart helper ───────────────────────────────────────────────────────

/**
 * Draws a self-contained line chart card.
 * All coordinates are calculated from the supplied (x, y, w, h) bounding box.
 * Nothing is drawn outside that box.
 */
function lineChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  data: { value: number }[],
  color: RGB,
  domain: [number, number],
  title: string,
  unit: string,
  xLabels: string[],
) {
  const [minV, maxV] = domain;
  const range = maxV - minV || 1;
  const PL = 18, PR = 5, PT = 13, PB = 11;
  const iW = w - PL - PR;
  const iH = h - PT - PB;
  const pts = data.slice(-14);

  // Card background + border
  doc.setFillColor(255, 255, 255);
  rr(doc, x, y, w, h, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  rr(doc, x, y, w, h, 2, 'S');

  // Colored top accent bar (fully contained in card)
  doc.setFillColor(color[0], color[1], color[2]);
  rr(doc, x, y, w, 2.5, 2, 'F');
  doc.rect(x, y + 1.3, w, 1.2, 'F');

  // Chart title
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text(title, x + PL, y + 10);

  // Y-unit (top-left, above grid)
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(unit, x + 1.5, y + PT + 1.5);

  // Grid lines + Y-axis labels
  for (let i = 0; i <= 4; i++) {
    const gy = y + PT + (iH / 4) * i;
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.18);
    doc.line(x + PL, gy, x + PL + iW, gy);
    const val = (maxV - (range / 4) * i).toFixed(0);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(4);
    doc.setFont('helvetica', 'normal');
    doc.text(val, x + PL - 1.5, gy + 1.2, { align: 'right' });
  }

  // X-axis baseline
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(x + PL, y + PT + iH, x + PL + iW, y + PT + iH);

  if (pts.length < 2) return;

  // Chart points
  const cpts = pts.map((d, i) => ({
    px: x + PL + (i / (pts.length - 1)) * iW,
    py:
      y + PT + iH -
      ((Math.min(Math.max(d.value, minV), maxV) - minV) / range) * iH,
  }));

  const botY = y + PT + iH;
  const lightC: RGB = [
    Math.min(255, color[0] + 175),
    Math.min(255, color[1] + 175),
    Math.min(255, color[2] + 175),
  ];

  // Area fill
  for (let i = 0; i < cpts.length - 1; i++) {
    const topY = Math.min(cpts[i].py, cpts[i + 1].py);
    doc.setFillColor(lightC[0], lightC[1], lightC[2]);
    doc.rect(cpts[i].px, topY, cpts[i + 1].px - cpts[i].px, botY - topY, 'F');
  }

  // Line
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.85);
  for (let i = 1; i < cpts.length; i++) {
    doc.line(cpts[i - 1].px, cpts[i - 1].py, cpts[i].px, cpts[i].py);
  }

  // Dots
  cpts.forEach((p) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.5);
    doc.circle(p.px, p.py, 1.1, 'FD');
  });

  // X-axis labels: start, middle, end
  [0, Math.floor((pts.length - 1) / 2), pts.length - 1].forEach((idx) => {
    if (idx >= cpts.length) return;
    const lbl = xLabels[idx] ?? `t${idx + 1}`;
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(3.8);
    doc.setFont('helvetica', 'normal');
    doc.text(lbl, cpts[idx].px, y + PT + iH + 6.5, { align: 'center' });
  });
}

// ─── Main PDF generator ──────────────────────────────────────────────────────

export function generatePDF(data: PDFData): void {
  const { readings, tempHistory, humHistory, soilHistory, pumpOn, fanOn, mode } = data;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 8;            // left / right margin
  const CW = W - M * 2;  // 194 mm content width

  const now = new Date();
  const tStats = calcStats(tempHistory);
  const hStats = calcStats(humHistory);
  const sStats = calcStats(soilHistory);

  const currentTemp = tempHistory.length ? tempHistory[tempHistory.length - 1].value : 31.2;
  const currentHum  = humHistory.length  ? humHistory[humHistory.length - 1].value  : 68;
  const currentSoil = soilHistory.length ? soilHistory[soilHistory.length - 1].value : 42;
  const condition   = pitchLabel(currentSoil);

  const reportId = `PSAI-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 900000 + 100000))}`;
  const dateStr  = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr  = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. HEADER  y = 0 … 42
  // ═════════════════════════════════════════════════════════════════════════════

  // Dark-green left panel
  doc.setFillColor(10, 50, 22);
  doc.rect(0, 0, W, 42, 'F');
  // Slightly lighter right zone
  doc.setFillColor(14, 70, 32);
  doc.rect(100, 0, W - 100, 42, 'F');
  // Diagonal stripe overlay (purely decorative)
  doc.setFillColor(16, 82, 38);
  for (let i = 0; i < 8; i++) doc.rect(130 + i * 9, 0, 4, 42, 'F');

  // ── Cricket field illustration (right half of header) ──────────────────────
  // Outer oval
  doc.setFillColor(18, 90, 38);
  ;(doc as any).ellipse(W - 32, 21, 22, 16, 'F');
  // Inner oval
  doc.setFillColor(25, 118, 52);
  ;(doc as any).ellipse(W - 32, 21, 16, 11, 'F');
  // Pitch strip (brown)
  doc.setFillColor(155, 110, 55);
  doc.rect(W - 38, 14, 12, 14, 'F');
  // Crease lines
  doc.setDrawColor(220, 200, 170);
  doc.setLineWidth(0.35);
  doc.line(W - 38, 17.5, W - 26, 17.5);
  doc.line(W - 38, 24.5, W - 26, 24.5);
  // Stumps – top end
  doc.setDrawColor(245, 240, 230);
  doc.setLineWidth(0.6);
  const stumpXs = [W - 36, W - 32, W - 28];
  stumpXs.forEach((sx) => doc.line(sx, 14, sx, 17.5));
  // Bails – top
  doc.setLineWidth(0.4);
  doc.line(W - 37, 14, W - 35, 14);
  doc.line(W - 33, 14, W - 31, 14);
  doc.line(W - 29, 14, W - 27, 14);
  // Stumps – bottom end
  doc.setLineWidth(0.6);
  stumpXs.forEach((sx) => doc.line(sx, 24.5, sx, 28));
  // Bails – bottom
  doc.setLineWidth(0.4);
  doc.line(W - 37, 28, W - 35, 28);
  doc.line(W - 33, 28, W - 31, 28);
  doc.line(W - 29, 28, W - 27, 28);

  // ── Cricket ball ───────────────────────────────────────────────────────────
  doc.setFillColor(5, 28, 12);      // shadow
  doc.circle(W - 54, 14.5, 7.8, 'F');
  doc.setFillColor(188, 28, 28);    // body
  doc.circle(W - 55, 13.5, 7.8, 'F');
  doc.setFillColor(220, 75, 75);    // shine
  doc.circle(W - 58, 10, 3, 'F');
  doc.setFillColor(245, 145, 145);  // specular
  doc.circle(W - 59.5, 8.5, 1.3, 'F');
  // Seam
  doc.setDrawColor(250, 250, 250);
  doc.setLineWidth(0.55);
  doc.line(W - 55, 6, W - 55, 21);
  doc.setLineWidth(0.38);
  for (let i = 0; i < 5; i++) {
    const sy = 7.5 + i * 2.8;
    doc.line(W - 55, sy, W - 52, sy + 0.9);
    doc.line(W - 55, sy, W - 58, sy + 0.9);
  }

  // ── Batsman silhouette ─────────────────────────────────────────────────────
  doc.setFillColor(195, 230, 200);
  doc.setDrawColor(195, 230, 200);
  doc.circle(W - 70, 9, 2.5, 'F');
  doc.setLineWidth(0.7);
  doc.line(W - 70, 11.5, W - 70, 24);    // body
  doc.setLineWidth(0.5);
  doc.line(W - 70, 15, W - 64, 12);      // front arm
  doc.line(W - 70, 15, W - 75, 18);      // back arm
  doc.setLineWidth(1.6);
  doc.line(W - 64, 12, W - 60, 27);      // bat
  doc.setLineWidth(0.5);
  doc.line(W - 70, 24, W - 65, 35);      // front leg
  doc.line(W - 70, 24, W - 75, 35);      // back leg

  // ── Vertical divider ───────────────────────────────────────────────────────
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(92, 6, 92, 36);

  // ── Left: Shield logo ──────────────────────────────────────────────────────
  const shX = M + 1, shY = 7, shW = 16, shH = 18;
  doc.setFillColor(255, 255, 255);
  doc.rect(shX, shY, shW, shH - 4, 'F');
  ;(doc as any).triangle(shX, shY + shH - 4, shX + shW / 2, shY + shH, shX + shW, shY + shH - 4, 'F');
  // Bat inside shield
  doc.setDrawColor(10, 100, 45);
  doc.setLineWidth(1.3);
  doc.line(shX + 5, shY + 3, shX + 11, shY + 11);
  // Ball inside shield
  doc.setFillColor(188, 28, 28);
  doc.circle(shX + 12, shY + 4, 2.5, 'F');

  // Brand name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('PitchSense AI', shX + shW + 3, shY + 8);
  doc.setTextColor(144, 238, 144);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.text('AI Smart Cricket Pitch Monitoring System', shX + shW + 3, shY + 14);

  // ── Centre: title ──────────────────────────────────────────────────────────
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORT SUMMARY', 96, 17, { align: 'center' });
  doc.setTextColor(144, 238, 144);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('Intelligent Cricket Pitch Monitoring & Analytics', 96, 23, { align: 'center' });

  // ── Right: Report info box ─────────────────────────────────────────────────
  // Dark box: x=W-74, y=4, w=66, h=34
  doc.setFillColor(5, 28, 13);
  rr(doc, W - 74, 4, 66, 34, 2, 'F');
  doc.setDrawColor(45, 145, 75);
  doc.setLineWidth(0.4);
  rr(doc, W - 74, 4, 66, 34, 2, 'S');

  // PDF icon badge: x=W-72, y=6, w=12, h=14
  doc.setFillColor(220, 50, 50);
  rr(doc, W - 72, 6, 12, 14, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('PDF', W - 66, 14, { align: 'center' });

  // "REPORT GENERATED" label
  doc.setTextColor(200, 240, 200);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORT GENERATED', W - 57, 10);

  // Info rows: Date / Time / Report ID
  // Each row: label at fixed x, colon, value — no overlap
  const INFO_LABEL_X = W - 57;
  const INFO_COLON_X = W - 42;
  const INFO_VALUE_X = W - 40;
  const infoRows: [string, string][] = [
    ['Date', dateStr],
    ['Time', timeStr],
    ['Report ID', reportId],
  ];
  infoRows.forEach(([label, value], i) => {
    const iy = 16 + i * 6.8;
    doc.setTextColor(180, 220, 180);
    doc.setFontSize(5.2);
    doc.setFont('helvetica', 'normal');
    doc.text(label, INFO_LABEL_X, iy);
    doc.text(':', INFO_COLON_X, iy);
    doc.setTextColor(255, 255, 255);
    doc.text(value, INFO_VALUE_X, iy);
  });

  // Green accent bottom line of header
  doc.setFillColor(34, 197, 94);
  doc.rect(0, 41.5, W, 1, 'F');

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. PITCH INFO BAR  y = 42 … 54
  // ═════════════════════════════════════════════════════════════════════════════
  doc.setFillColor(245, 250, 246);
  doc.rect(0, 42, W, 12, 'F');
  doc.setDrawColor(205, 235, 212);
  doc.setLineWidth(0.25);
  doc.line(0, 54, W, 54);

  // Location dot
  doc.setFillColor(34, 197, 94);
  doc.circle(M + 2.2, 47.8, 1.8, 'F');

  // Row 1 (y=47.5): Pitch Location label + value
  doc.setTextColor(80, 110, 88);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('Pitch Location:', M + 5.5, 47.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 60, 28);
  doc.text('Central Ground, Sports Complex', M + 32, 47.5);

  // Row 2 (y=52): Pitch ID | Report Type
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 110, 88);
  doc.text('Pitch ID:', M + 5.5, 52);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 60, 28);
  doc.text('PITCH-001', M + 19, 52);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 110, 88);
  doc.text('|', M + 32, 52);
  doc.text('Report Type:', M + 35, 52);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 60, 28);
  doc.text('Daily Summary', M + 56, 52);

  // Reporting date badge (right, both rows vertically centred in bar)
  doc.setFillColor(210, 240, 218);
  rr(doc, W - 62, 43.5, 54, 9.5, 1.5, 'F');
  doc.setTextColor(10, 100, 45);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporting Date:', W - 59, 47.5);
  doc.setFont('helvetica', 'bold');
  doc.text(dateStr, W - 59, 51.5);

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. EXECUTIVE SUMMARY  y = 56 … 98
  // ═════════════════════════════════════════════════════════════════════════════
  sectionTitle(doc, M, 56, 'EXECUTIVE SUMMARY');

  // 5 cards: fixed width (CW − 4 gaps × 3.5) / 5 ≈ 35.7 mm
  const N = 5, GAP = 3.5;
  const CW5 = (CW - GAP * (N - 1)) / N;  // ≈ 35.7 mm
  const CH  = 32;
  const CY  = 66;                          // title + 7.8 line + 2.2 pad

  type ECard = { label: string; value: string; status: string; ok: boolean; accent: RGB; light: RGB; icon: IconType };
  const ecards: ECard[] = [
    { label: 'TEMPERATURE', value: `${currentTemp.toFixed(1)}°C`,
      status: currentTemp > 34 ? 'High' : currentTemp < 29 ? 'Low' : 'Normal',
      ok: currentTemp >= 29 && currentTemp <= 34, accent: [215, 55, 45], light: [255, 232, 230], icon: 'temp' },
    { label: 'HUMIDITY', value: `${currentHum.toFixed(1)}%`,
      status: currentHum > 75 ? 'High' : currentHum < 60 ? 'Low' : 'Normal',
      ok: currentHum >= 60 && currentHum <= 75, accent: [35, 125, 205], light: [222, 240, 255], icon: 'hum' },
    { label: 'FAN STATUS', value: fanOn ? 'ON' : 'OFF',
      status: `Mode: ${mode === 'auto' ? 'Auto' : 'Manual'}`,
      ok: true, accent: [125, 65, 190], light: [242, 232, 255], icon: 'fan' },
    { label: 'PUMP STATUS', value: pumpOn ? 'ON' : 'OFF',
      status: `Mode: ${mode === 'auto' ? 'Auto' : 'Manual'}`,
      ok: true, accent: [12, 150, 128], light: [218, 248, 242], icon: 'pump' },
    { label: 'SYSTEM HEALTH', value: '100%',
      status: 'Excellent', ok: true, accent: [28, 168, 88], light: [218, 248, 228], icon: 'health' },
  ];

  ecards.forEach((card, i) => {
    const cx = M + i * (CW5 + GAP);

    // Card bg + border
    doc.setFillColor(255, 255, 255);
    rr(doc, cx, CY, CW5, CH, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.28);
    rr(doc, cx, CY, CW5, CH, 2, 'S');

    // Top accent bar (2.5 mm, rounded at top)
    doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
    rr(doc, cx, CY, CW5, 2.5, 2, 'F');
    doc.rect(cx, CY + 1.3, CW5, 1.2, 'F');

    // Icon circle — light bg, then detailed vector icon
    const icx = cx + CW5 / 2, icy = CY + 10;
    doc.setFillColor(card.light[0], card.light[1], card.light[2]);
    doc.circle(icx, icy, 5.5, 'F');
    drawIcon(doc, card.icon, icx, icy, card.accent, 5.5);

    // Label  (CY + 18.5)
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(4.8);
    doc.setFont('helvetica', 'bold');
    doc.text(card.label, cx + CW5 / 2, CY + 18.5, { align: 'center' });

    // Value  (CY + 26)
    doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, cx + CW5 / 2, CY + 26, { align: 'center' });

    // Status badge  (CY + 28 … CY + 33)
    doc.setFillColor(card.light[0], card.light[1], card.light[2]);
    rr(doc, cx + 4, CY + 28, CW5 - 8, 5, 1, 'F');
    const sc: RGB = card.ok ? [22, 163, 74] : [215, 38, 38];
    doc.setTextColor(sc[0], sc[1], sc[2]);
    doc.setFontSize(4.6);
    doc.setFont('helvetica', 'bold');
    doc.text(card.status, cx + CW5 / 2, CY + 31.5, { align: 'center' });
  });
  // CY + CH = 66 + 32 = 98 ✓

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. SENSOR OVERVIEW  y = 100 … 126
  // ═════════════════════════════════════════════════════════════════════════════
  sectionTitle(doc, M, 100, 'SENSOR OVERVIEW');

  const SY = 110, SH = 16, SG = 5;
  const SW = (CW - SG * 2) / 3;   // ≈ 61.3 mm

  type SCard = { name: string; status: string; detail: string; color: RGB; icon: IconType };
  const scards: SCard[] = [
    { name: 'DHT11 — Temperature', status: 'Working Normal', detail: 'Last Calibrated: 20 May 2024', color: [215, 55, 45],  icon: 'temp' },
    { name: 'DHT11 — Humidity',    status: 'Working Normal', detail: 'Last Calibrated: 20 May 2024', color: [35, 125, 205], icon: 'hum'  },
    { name: 'ESP32 Controller',    status: 'Connected',      detail: 'Signal Strength: -62 dBm',     color: [28, 168, 88],  icon: 'wifi' },
  ];

  scards.forEach((s, i) => {
    const sx = M + i * (SW + SG);

    doc.setFillColor(255, 255, 255);
    rr(doc, sx, SY, SW, SH, 1.5, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.28);
    rr(doc, sx, SY, SW, SH, 1.5, 'S');

    // Left accent bar
    doc.setFillColor(s.color[0], s.color[1], s.color[2]);
    doc.rect(sx, SY, 3, SH, 'F');

    // Icon circle — light bg, then detailed vector icon
    const sIcx = sx + 10, sIcy = SY + 8;
    const lC: RGB = [Math.min(255, s.color[0] + 172), Math.min(255, s.color[1] + 172), Math.min(255, s.color[2] + 172)];
    doc.setFillColor(lC[0], lC[1], lC[2]);
    doc.circle(sIcx, sIcy, 4.5, 'F');
    drawIcon(doc, s.icon, sIcx, sIcy, s.color, 3.5);

    // Sensor name  (SY + 5.5)
    doc.setTextColor(12, 40, 22);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(s.name, sx + 18, SY + 5.5);

    // Status badge  (SY + 7.5 … SY + 12)
    doc.setFillColor(218, 252, 228);
    rr(doc, sx + 18, SY + 7.5, 33, 4.5, 1, 'F');
    doc.setTextColor(22, 163, 74);
    doc.setFontSize(4.8);
    doc.setFont('helvetica', 'bold');
    doc.text(s.status, sx + 34.5, SY + 10.8, { align: 'center' });

    // Detail text  (SY + 14)
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.text(s.detail, sx + 18, SY + 14.5);
  });
  // SY + SH = 110 + 16 = 126 ✓

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. TRENDS & ANALYTICS  y = 128 … 186
  // ═════════════════════════════════════════════════════════════════════════════
  sectionTitle(doc, M, 128, 'TRENDS & ANALYTICS');

  const CHY = 138, CHH = 48, CHW = (CW - 4) / 2;  // ≈ 95 mm each

  const xLabels = readings.slice(0, 14).map((r) => r.time).reverse();

  lineChart(doc, M,           CHY, CHW, CHH, tempHistory, [215, 55, 45],  [24, 40], 'Temperature Trend (°C)', '°C', xLabels);
  lineChart(doc, M + CHW + 4, CHY, CHW, CHH, humHistory,  [35, 125, 205], [48, 90], 'Humidity Trend (%)',      '%',  xLabels);
  // CHY + CHH = 138 + 48 = 186 ✓

  // ═════════════════════════════════════════════════════════════════════════════
  // 6. RECENT READINGS + SYSTEM STATUS  y = 188 … 258
  // ═════════════════════════════════════════════════════════════════════════════
  const TBLW = 116;                 // table panel width
  const SYSX = M + TBLW + 5;       // system panel x  = 129
  const SYSW = CW - TBLW - 5;      // system panel width ≈ 73 mm

  sectionTitle(doc, M,    188, 'RECENT READINGS');
  sectionTitle(doc, SYSX, 188, 'SYSTEM STATUS');

  const PY = 200, PH = 58;         // panel top, panel height

  // ── Table ─────────────────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  rr(doc, M, PY, TBLW, PH, 1.5, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.28);
  rr(doc, M, PY, TBLW, PH, 1.5, 'S');

  // Columns: widths must sum to TBLW − 2 = 114
  type Col = { label: string; w: number };
  const cols: Col[] = [
    { label: 'Timestamp',   w: 29 },
    { label: 'Temp (°C)',   w: 21 },
    { label: 'Hum (%)',     w: 20 },
    { label: 'Fan',         w: 15 },
    { label: 'Pump',        w: 15 },
    { label: 'Condition',   w: 14 },
  ]; // sum = 114 ✓

  const TBLX  = M + 1;
  const ROWH  = 6.2;
  const HDRY  = PY + 1.5;

  // Header row
  doc.setFillColor(10, 60, 28);
  doc.rect(TBLX, HDRY, TBLW - 2, ROWH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(4.8);
  doc.setFont('helvetica', 'bold');
  let hxp = TBLX;
  cols.forEach((c) => {
    doc.text(c.label, hxp + c.w / 2, HDRY + ROWH - 1.8, { align: 'center' });
    hxp += c.w;
  });

  const maxRows = Math.floor((PH - ROWH - 3) / ROWH);
  readings.slice(0, maxRows).forEach((r, idx) => {
    const ry = HDRY + ROWH + idx * ROWH;
    if (ry + ROWH > PY + PH - 1) return;

    doc.setFillColor(idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252, idx % 2 === 0 ? 255 : 253);
    doc.rect(TBLX, ry, TBLW - 2, ROWH, 'F');

    const cells = [r.time, `${r.temp}`, `${r.humidity}`, r.fanOn ? 'ON' : 'OFF', r.pumpOn ? 'ON' : 'OFF', r.pitchStatus];
    let rxp = TBLX;
    cells.forEach((cell, ci) => {
      const cw   = cols[ci].w;
      const midY = ry + ROWH - 2;

      if (ci === 3) {
        const c: RGB = r.fanOn  ? [34, 197, 94] : [100, 116, 139];
        doc.setFillColor(c[0], c[1], c[2]);
        rr(doc, rxp + 2, ry + 1, cw - 4, ROWH - 2.5, 0.8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(4.2); doc.setFont('helvetica', 'bold');
        doc.text(cell, rxp + cw / 2, midY - 0.4, { align: 'center' });
      } else if (ci === 4) {
        const c: RGB = r.pumpOn ? [35, 125, 205] : [100, 116, 139];
        doc.setFillColor(c[0], c[1], c[2]);
        rr(doc, rxp + 2, ry + 1, cw - 4, ROWH - 2.5, 0.8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(4.2); doc.setFont('helvetica', 'bold');
        doc.text(cell, rxp + cw / 2, midY - 0.4, { align: 'center' });
      } else if (ci === 5) {
        const sc: RGB = r.pitchStatus === 'Balanced' ? [34, 197, 94] : r.pitchStatus === 'Dry' ? [210, 95, 25] : [35, 125, 205];
        const sl: RGB = [Math.min(255, sc[0] + 155), Math.min(255, sc[1] + 155), Math.min(255, sc[2] + 155)];
        doc.setFillColor(sl[0], sl[1], sl[2]);
        rr(doc, rxp + 1, ry + 1, cw - 2, ROWH - 2.5, 0.8, 'F');
        doc.setTextColor(sc[0], sc[1], sc[2]);
        doc.setFontSize(3.6); doc.setFont('helvetica', 'bold');
        doc.text(cell, rxp + cw / 2, midY - 0.4, { align: 'center' });
      } else {
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(4.5);
        doc.setFont('helvetica', ci === 0 ? 'normal' : 'bold');
        doc.text(cell, rxp + cw / 2, midY, { align: 'center' });
      }
      rxp += cw;
    });

    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.1);
    doc.line(TBLX, ry + ROWH, TBLX + TBLW - 2, ry + ROWH);
  });

  // ── System status ──────────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  rr(doc, SYSX, PY, SYSW, PH, 1.5, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.28);
  rr(doc, SYSX, PY, SYSW, PH, 1.5, 'S');

  type SysItem = { label: string; value: string; ok: boolean | null };
  const sysItems: SysItem[] = [
    { label: 'WiFi Connection',    value: 'Connected',                       ok: true  },
    { label: 'Database',           value: 'Online',                          ok: true  },
    { label: 'Last Update',        value: timeStr,                           ok: true  },
    { label: 'Uptime',             value: '2d 14h 35m',                     ok: null  },
    { label: 'Firmware',           value: 'v1.2.3',                         ok: null  },
    { label: 'Pitch Condition',    value: condition,                         ok: condition === 'Balanced' },
    { label: 'Control Mode',       value: mode === 'auto' ? 'Auto' : 'Manual', ok: null },
  ];

  sysItems.forEach((item, idx) => {
    const iy = PY + 5 + idx * 7.4;
    if (iy + 6 > PY + PH) return;

    const dc: RGB = item.ok === true ? [34, 197, 94] : item.ok === false ? [220, 38, 38] : [148, 163, 184];
    doc.setFillColor(dc[0], dc[1], dc[2]);
    doc.circle(SYSX + 5, iy + 2.5, 2, 'F');

    doc.setTextColor(65, 85, 100);
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, SYSX + 10, iy + 4);

    const vc: RGB = item.ok === true ? [22, 163, 74] : item.ok === false ? [215, 38, 38] : [20, 40, 30];
    doc.setTextColor(vc[0], vc[1], vc[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, SYSX + SYSW - 3, iy + 4, { align: 'right' });

    if (idx < sysItems.length - 1) {
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.15);
      doc.line(SYSX + 3, iy + 6.5, SYSX + SYSW - 3, iy + 6.5);
    }
  });
  // PY + PH = 200 + 58 = 258 ✓

  // ═════════════════════════════════════════════════════════════════════════════
  // 7. DATA SUMMARY  y = 259 … 279
  // ═════════════════════════════════════════════════════════════════════════════
  sectionTitle(doc, M, 259, 'DATA SUMMARY');

  const DSY = 269, DSH = 10;
  const DSW = (CW - 8) / 3;   // ≈ 60 mm per group

  type DSGroup = { label: string; max: string; min: string; avg: string; accent: RGB; light: RGB };
  const dsGroups: DSGroup[] = [
    { label: 'Temperature', max: `${tStats.max}°C`, min: `${tStats.min}°C`, avg: `${tStats.avg}°C`, accent: [215, 55, 45], light: [255, 232, 230] },
    { label: 'Humidity',    max: `${hStats.max}%`,  min: `${hStats.min}%`,  avg: `${hStats.avg}%`,  accent: [35, 125, 205], light: [222, 240, 255] },
    { label: 'Soil Moist.', max: `${sStats.max}%`,  min: `${sStats.min}%`,  avg: `${sStats.avg}%`,  accent: [28, 168, 88], light: [218, 248, 228] },
  ];

  dsGroups.forEach((g, i) => {
    const gx = M + i * (DSW + 4);

    doc.setFillColor(255, 255, 255);
    rr(doc, gx, DSY, DSW, DSH, 1.5, 'F');
    doc.setDrawColor(g.light[0], g.light[1], g.light[2]);
    doc.setLineWidth(0.4);
    rr(doc, gx, DSY, DSW, DSH, 1.5, 'S');

    // Accent left bar
    doc.setFillColor(g.accent[0], g.accent[1], g.accent[2]);
    doc.rect(gx, DSY, 3, DSH, 'F');

    // Group label
    doc.setTextColor(g.accent[0], g.accent[1], g.accent[2]);
    doc.setFontSize(5.8);
    doc.setFont('helvetica', 'bold');
    doc.text(g.label, gx + 7, DSY + 4.5);

    // Max / Min / Avg — three sub-columns within the card
    const iW = (DSW - 7) / 3;
    [['Max', g.max], ['Min', g.min], ['Avg', g.avg]].forEach(([k, v], si) => {
      const sx = gx + 7 + si * iW;
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(4.2);
      doc.setFont('helvetica', 'normal');
      doc.text(k, sx + iW / 2, DSY + 5.5, { align: 'center' });
      doc.setTextColor(20, 40, 25);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5);
      doc.text(v, sx + iW / 2, DSY + 9, { align: 'center' });
    });
  });
  // DSY + DSH = 269 + 10 = 279 ✓

  // ═════════════════════════════════════════════════════════════════════════════
  // 8. FOOTER  y = 281 … 297
  // ═════════════════════════════════════════════════════════════════════════════
  doc.setFillColor(10, 50, 22);
  doc.rect(0, 281, W, 16, 'F');

  // Green top accent
  doc.setFillColor(34, 197, 94);
  doc.rect(0, 281, W, 1.2, 'F');

  // Left column
  doc.setTextColor(144, 238, 144);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('PitchSense AI', M, 288);
  doc.setTextColor(100, 195, 120);
  doc.setFontSize(4.8);
  doc.setFont('helvetica', 'normal');
  doc.text('AI Smart Cricket Pitch Monitoring System', M, 293.5);

  // Centre column
  doc.setTextColor(144, 238, 144);
  doc.setFontSize(5);
  doc.text('AI Powered  •  IoT Enabled  •  Smart Monitoring', W / 2, 287.5, { align: 'center' });
  doc.setTextColor(100, 175, 120);
  doc.setFontSize(4.5);
  doc.text('Thank you for using PitchSense AI', W / 2, 293.5, { align: 'center' });

  // Right column
  doc.setTextColor(144, 238, 144);
  doc.setFontSize(5);
  doc.text(`Generated: ${dateStr}`, W - M, 287.5, { align: 'right' });
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text('Page 1 of 1', W - M, 293.5, { align: 'right' });

  // ─── Save ─────────────────────────────────────────────────────────────────
  doc.save(`PitchSense-AI-Report-${now.toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`);
}
