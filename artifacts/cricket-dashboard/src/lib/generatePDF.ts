import jsPDF from 'jspdf';
import type { Reading } from './types';

export interface PDFData {
  readings: Reading[];
  tempHistory: { time: number; value: number }[];
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn: boolean;
  mode: 'auto' | 'manual';
}

function calcStats(history: { value: number }[]) {
  if (!history.length) return { max: '0.0', min: '0.0', avg: '0.0' };
  const vals = history.map(h => h.value);
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

type RGB = [number, number, number];

function drawLineChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  data: { value: number }[],
  color: RGB,
  domain: [number, number],
  title: string,
  yUnit: string,
) {
  const [minV, maxV] = domain;
  const range = maxV - minV || 1;
  const PAD_L = 14, PAD_R = 4, PAD_T = 14, PAD_B = 10;
  const innerW = w - PAD_L - PAD_R;
  const innerH = h - PAD_T - PAD_B;
  const pts = data.slice(-15);

  // Card bg
  doc.setFillColor(255, 255, 255);
  (doc as any).roundedRect(x, y, w, h, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  (doc as any).roundedRect(x, y, w, h, 2, 2, 'S');

  // Color top bar
  doc.setFillColor(color[0], color[1], color[2]);
  (doc as any).roundedRect(x, y, w, 3, 2, 2, 'F');
  doc.rect(x, y + 1.5, w, 1.5, 'F');

  // Title
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(title, x + PAD_L, y + 10);

  // Subtitle
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Last 15 Readings', x + w - PAD_R, y + 10, { align: 'right' });

  // Y-unit
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(4.5);
  doc.text(yUnit, x + 3, y + PAD_T + 1);

  // Grid lines
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.15);
  for (let i = 0; i <= 4; i++) {
    const gy = y + PAD_T + (innerH / 4) * i;
    doc.line(x + PAD_L, gy, x + PAD_L + innerW, gy);
    const val = (maxV - (range / 4) * i).toFixed(0);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(4);
    doc.text(val, x + PAD_L - 1, gy + 1.2, { align: 'right' });
  }

  // Data line
  if (pts.length >= 2) {
    const chartPts = pts.map((d, i) => ({
      px: x + PAD_L + (i / (pts.length - 1)) * innerW,
      py: y + PAD_T + innerH - ((Math.min(Math.max(d.value, minV), maxV) - minV) / range) * innerH,
    }));

    // Area fill (light)
    doc.setFillColor(color[0], color[1], color[2]);
    // Draw filled polygon using lines approach: fill between line and bottom
    // Use a light version of the color
    const lightColor: RGB = [
      Math.min(255, color[0] + 160),
      Math.min(255, color[1] + 160),
      Math.min(255, color[2] + 160),
    ];
    doc.setFillColor(lightColor[0], lightColor[1], lightColor[2]);
    // Build polygon points string
    const polyX: number[] = [];
    const polyY: number[] = [];
    chartPts.forEach(p => { polyX.push(p.px); polyY.push(p.py); });
    polyX.push(chartPts[chartPts.length - 1].px);
    polyY.push(y + PAD_T + innerH);
    polyX.push(chartPts[0].px);
    polyY.push(y + PAD_T + innerH);
    // Fill the area by drawing narrow vertical rects at each point
    for (let i = 0; i < chartPts.length - 1; i++) {
      const segW = chartPts[i + 1].px - chartPts[i].px;
      const topY = Math.min(chartPts[i].py, chartPts[i + 1].py);
      const botY = y + PAD_T + innerH;
      doc.setFillColor(lightColor[0], lightColor[1], lightColor[2]);
      doc.rect(chartPts[i].px, topY, segW, botY - topY, 'F');
    }

    // Main line
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.9);
    for (let i = 1; i < chartPts.length; i++) {
      doc.line(chartPts[i - 1].px, chartPts[i - 1].py, chartPts[i].px, chartPts[i].py);
    }

    // Dots
    chartPts.forEach((p, i) => {
      doc.setFillColor(color[0], color[1], color[2]);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.circle(p.px, p.py, 0.9, 'FD');
    });

    // X-axis time labels from readings (if available)
    const labelIdxs = [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
    labelIdxs.forEach(idx => {
      if (idx < chartPts.length) {
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(3.8);
        const t = `t${idx + 1}`;
        doc.text(t, chartPts[idx].px, y + PAD_T + innerH + 4, { align: 'center' });
      }
    });
  }
}

function drawMiniSparkline(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  data: { value: number }[],
  color: RGB,
  domain: [number, number],
) {
  const [minV, maxV] = domain;
  const range = maxV - minV || 1;
  const pts = data.slice(-15);
  if (pts.length < 2) return;

  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.5);

  const chartPts = pts.map((d, i) => ({
    px: x + (i / (pts.length - 1)) * w,
    py: y + h - ((Math.min(Math.max(d.value, minV), maxV) - minV) / range) * h,
  }));

  for (let i = 1; i < chartPts.length; i++) {
    doc.line(chartPts[i - 1].px, chartPts[i - 1].py, chartPts[i].px, chartPts[i].py);
  }
}

export function generatePDF(data: PDFData): void {
  const { readings, tempHistory, humHistory, soilHistory, pumpOn, fanOn, mode } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const now = new Date();

  const tStats = calcStats(tempHistory);
  const hStats = calcStats(humHistory);
  const sStats = calcStats(soilHistory);
  const currentTemp = tempHistory.length ? tempHistory[tempHistory.length - 1].value : 31.2;
  const currentHum = humHistory.length ? humHistory[humHistory.length - 1].value : 68;
  const currentSoil = soilHistory.length ? soilHistory[soilHistory.length - 1].value : 42;
  const condition = pitchLabel(currentSoil);

  const reportId = `ASCP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 900 + 100)).padStart(3, '0')}`;
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let y = 0;

  // ─── HEADER ──────────────────────────────────────────────────────────────────
  // Main navy background
  doc.setFillColor(12, 32, 82);
  doc.rect(0, 0, W, 50, 'F');
  // Lighter blue overlay left half for gradient effect
  doc.setFillColor(22, 70, 150);
  doc.rect(0, 0, 105, 50, 'F');
  // Fade band in center
  doc.setFillColor(17, 51, 116);
  doc.rect(80, 0, 50, 50, 'F');

  // Decorative white triangle top-right
  doc.setFillColor(255, 255, 255);
  // Using lines to simulate triangle (semi-transparent look with light color)
  doc.setFillColor(40, 90, 175);
  // draw overlapping rects to simulate angled cut
  for (let i = 0; i < 30; i++) {
    const alpha = 1 - i / 30;
    const r = Math.round(40 + (200 - 40) * (1 - alpha));
    const g = Math.round(90 + (220 - 90) * (1 - alpha));
    const b = Math.round(175 + (255 - 175) * (1 - alpha));
    doc.setFillColor(r, g, b);
    doc.rect(W - i * 3.5, 0, 3.5, 50, 'F');
  }

  // Cricket ball (red)
  doc.setFillColor(185, 28, 28);
  doc.circle(W - 18, 20, 11, 'F');
  doc.setFillColor(220, 38, 38);
  doc.circle(W - 19, 19, 11, 'F');
  // Highlight
  doc.setFillColor(239, 100, 100);
  doc.circle(W - 22, 15, 4, 'F');
  // Seam lines
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.line(W - 19, 9, W - 24, 29); // main vertical seam
  doc.line(W - 15, 11, W - 17, 14); // stitch 1
  doc.line(W - 15.5, 16, W - 17.5, 19); // stitch 2
  doc.line(W - 16, 21, W - 18, 24); // stitch 3
  doc.line(W - 16.5, 26, W - 18.5, 29); // stitch 4

  // Cricket player silhouette (simplified stick figure) - subtle white
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.setFillColor(255, 255, 255);
  // Head
  doc.circle(W - 50, 10, 3, 'F');
  // Body
  doc.line(W - 50, 13, W - 50, 28);
  // Arms in batting position
  doc.line(W - 50, 17, W - 44, 14);
  doc.line(W - 50, 17, W - 56, 20);
  // Bat
  doc.setLineWidth(1.2);
  doc.line(W - 44, 14, W - 40, 30);
  doc.setLineWidth(0.4);
  // Legs
  doc.line(W - 50, 28, W - 44, 38);
  doc.line(W - 50, 28, W - 56, 38);

  // Title text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('AI Smart Cricket Pitch Monitoring Report', 10, 18);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(147, 197, 253);
  doc.text('Class XII Informatics Practices Project', 10, 26);

  // Decorative line
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.2);
  doc.line(10, 44, 130, 44);

  y = 50;

  // ─── INFO ROW ────────────────────────────────────────────────────────────────
  doc.setFillColor(241, 245, 249);
  doc.rect(0, y, W, 17, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(0, y + 17, W, y + 17);

  const infoItems = [
    { label: 'Date', value: dateStr, green: false },
    { label: 'Time', value: timeStr, green: false },
    { label: 'Report ID', value: reportId, green: false },
    { label: 'Arduino Status', value: 'Connected', green: true },
    { label: 'Wi-Fi Status', value: 'Connected', green: true },
    { label: 'Database Status', value: 'Connected', green: true },
  ];
  const colW = W / infoItems.length;
  infoItems.forEach((item, i) => {
    const ix = i * colW + colW / 2;
    if (i > 0) {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(i * colW, y + 3, i * colW, y + 14);
    }
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, ix, y + 6, { align: 'center' });

    if (item.green) {
      // Green dot
      doc.setFillColor(34, 197, 94);
      doc.circle(ix - 10, y + 11.5, 1, 'F');
      doc.setTextColor(22, 163, 74);
    } else {
      doc.setTextColor(30, 41, 59);
    }
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, ix + (item.green ? 2 : 0), y + 13, { align: 'center' });
  });

  y += 20;

  // ─── SENSOR CARDS ────────────────────────────────────────────────────────────
  const CARD_W = 60, CARD_H = 30, CARD_GAP = 5;
  const sensorStartX = (W - CARD_W * 3 - CARD_GAP * 2) / 2;

  const sensorCards = [
    {
      label: 'TEMPERATURE', value: `${currentTemp}`, unit: '°C',
      status: currentTemp > 34 ? 'High' : currentTemp < 29 ? 'Low' : 'Normal',
      accent: [239, 68, 68] as RGB,
      statusColor: [22, 163, 74] as RGB,
      history: tempHistory,
      domain: [26, 38] as [number, number],
    },
    {
      label: 'HUMIDITY', value: `${currentHum}`, unit: '%',
      status: currentHum > 75 ? 'High' : currentHum < 60 ? 'Low' : 'Normal',
      accent: [59, 130, 246] as RGB,
      statusColor: currentHum > 75 ? [239, 68, 68] as RGB : currentHum < 60 ? [234, 88, 12] as RGB : [22, 163, 74] as RGB,
      history: humHistory,
      domain: [50, 85] as [number, number],
    },
    {
      label: 'SOIL MOISTURE', value: `${currentSoil}`, unit: '%',
      status: condition,
      accent: [34, 197, 94] as RGB,
      statusColor: condition === 'Balanced' ? [22, 163, 74] as RGB : condition === 'Dry' ? [234, 88, 12] as RGB : [59, 130, 246] as RGB,
      history: soilHistory,
      domain: [15, 85] as [number, number],
    },
  ];

  sensorCards.forEach((card, i) => {
    const cx = sensorStartX + i * (CARD_W + CARD_GAP);

    // Card bg
    doc.setFillColor(255, 255, 255);
    (doc as any).roundedRect(cx, y, CARD_W, CARD_H, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    (doc as any).roundedRect(cx, y, CARD_W, CARD_H, 2, 2, 'S');

    // Top accent bar
    doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
    (doc as any).roundedRect(cx, y, CARD_W, 3, 2, 2, 'F');
    doc.rect(cx, y + 1.5, CARD_W, 1.5, 'F');

    // Icon bg circle (light)
    const lightA: RGB = [Math.min(255, card.accent[0] + 155), Math.min(255, card.accent[1] + 155), Math.min(255, card.accent[2] + 155)];
    doc.setFillColor(lightA[0], lightA[1], lightA[2]);
    doc.circle(cx + 8, y + 11, 4.5, 'F');
    // Icon color dot
    doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.circle(cx + 8, y + 11, 2, 'F');

    // Label
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(card.label, cx + CARD_W / 2 + 3, y + 8, { align: 'center' });

    // Value
    doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, cx + 20, y + 20, { align: 'center' });

    // Unit
    doc.setFontSize(7);
    doc.text(card.unit, cx + 32, y + 20);

    // Status badge
    doc.setFillColor(lightA[0], lightA[1], lightA[2]);
    (doc as any).roundedRect(cx + 14, y + 22, 22, 5, 1, 1, 'F');
    doc.setTextColor(card.statusColor[0], card.statusColor[1], card.statusColor[2]);
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.text(`✓ ${card.status}`, cx + 25, y + 25.5, { align: 'center' });

    // Mini sparkline
    drawMiniSparkline(doc, cx + 3, y + 22.5, CARD_W - 6, 5, card.history, card.accent, card.domain);
  });

  y += CARD_H + 5;

  // ─── PITCH / PUMP / FAN ROW ──────────────────────────────────────────────────
  const SYS_W = (W - 24) / 3;
  const SYS_H = 32;
  const sysCards = [
    {
      label: 'PITCH CONDITION',
      value: condition,
      color: condition === 'Balanced' ? [34, 197, 94] as RGB : condition === 'Dry' ? [234, 88, 12] as RGB : [59, 130, 246] as RGB,
      sub: condition === 'Balanced'
        ? 'The pitch has optimal moisture levels and is in good condition.'
        : condition === 'Dry'
        ? 'Soil moisture is low. Water pump is activated.'
        : 'Soil moisture is high. Drying fan is activated.',
      icon: '🌱',
    },
    {
      label: 'WATER PUMP',
      value: pumpOn ? 'ON' : 'OFF',
      color: pumpOn ? [59, 130, 246] as RGB : [100, 116, 139] as RGB,
      sub: mode === 'auto' ? 'Automatic Mode\nPump is ' + (pumpOn ? 'ON' : 'OFF') : 'Manual Mode\nPump is ' + (pumpOn ? 'ON' : 'OFF'),
      icon: '💧',
    },
    {
      label: 'DRYING FAN',
      value: fanOn ? 'ON' : 'OFF',
      color: fanOn ? [34, 197, 94] as RGB : [100, 116, 139] as RGB,
      sub: mode === 'auto' ? 'Automatic Mode\nFan is ' + (fanOn ? 'ON' : 'OFF') : 'Manual Mode\nFan is ' + (fanOn ? 'ON' : 'OFF'),
      icon: '🌀',
    },
  ];

  sysCards.forEach((card, i) => {
    const cx = 8 + i * (SYS_W + 4);
    doc.setFillColor(255, 255, 255);
    (doc as any).roundedRect(cx, y, SYS_W, SYS_H, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    (doc as any).roundedRect(cx, y, SYS_W, SYS_H, 2, 2, 'S');

    // Label
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(card.label, cx + SYS_W / 2, y + 6, { align: 'center' });

    // Icon circle
    const lightC: RGB = [Math.min(255, card.color[0] + 155), Math.min(255, card.color[1] + 155), Math.min(255, card.color[2] + 155)];
    doc.setFillColor(lightC[0], lightC[1], lightC[2]);
    doc.circle(cx + SYS_W / 2, y + 15, 7, 'F');

    // Value badge (ON/OFF or BALANCED)
    if (i === 0) {
      // Pitch condition - big text
      doc.setTextColor(card.color[0], card.color[1], card.color[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(card.value, cx + SYS_W / 2, y + 17, { align: 'center' });
    } else {
      // Toggle-style badge
      doc.setFillColor(card.color[0], card.color[1], card.color[2]);
      (doc as any).roundedRect(cx + SYS_W / 2 - 8, y + 10, 16, 8, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(card.value, cx + SYS_W / 2, y + 15.5, { align: 'center' });
    }

    // Sub text
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    const subLines = card.sub.split('\n');
    subLines.forEach((line, li) => {
      doc.text(line, cx + SYS_W / 2, y + 24 + li * 5, { align: 'center' });
    });
  });

  y += SYS_H + 5;

  // ─── TREND CHARTS ────────────────────────────────────────────────────────────
  const CHART_H = 50;
  const CHART_W = (W - 20) / 2 - 2;
  drawLineChart(doc, 8, y, CHART_W, CHART_H, tempHistory, [239, 68, 68], [26, 38], 'TEMPERATURE TREND', '°C');
  drawLineChart(doc, 8 + CHART_W + 4, y, CHART_W, CHART_H, humHistory, [59, 130, 246], [50, 85], 'HUMIDITY TREND', '%');

  y += CHART_H + 5;

  // ─── QUICK ACTIONS STRIP ─────────────────────────────────────────────────────
  const qaItems = [
    { label: 'Recent Reading\nHistory', color: [99, 102, 241] as RGB },
    { label: 'Download PDF', color: [239, 68, 68] as RGB },
    { label: 'Export Excel', color: [34, 197, 94] as RGB },
    { label: 'View Analysis', color: [245, 158, 11] as RGB },
    { label: 'Refresh Data', color: [249, 115, 22] as RGB },
  ];
  const QA_W = (W - 20) / qaItems.length - 2;
  const QA_H = 14;
  // Section label
  doc.setFillColor(241, 245, 249);
  doc.rect(0, y, W, 5, 'F');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text('QUICK ACTIONS', W / 2, y + 3.5, { align: 'center' });
  y += 7;

  qaItems.forEach((qa, i) => {
    const qx = 8 + i * (QA_W + 2);
    doc.setFillColor(255, 255, 255);
    (doc as any).roundedRect(qx, y, QA_W, QA_H, 1.5, 1.5, 'F');
    doc.setDrawColor(qa.color[0], qa.color[1], qa.color[2]);
    doc.setLineWidth(0.5);
    (doc as any).roundedRect(qx, y, QA_W, QA_H, 1.5, 1.5, 'S');
    // Color dot icon
    doc.setFillColor(qa.color[0], qa.color[1], qa.color[2]);
    doc.circle(qx + 4, y + QA_H / 2, 2.5, 'F');
    // Label
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    const lines = qa.label.split('\n');
    lines.forEach((ln, li) => {
      doc.text(ln, qx + QA_W / 2 + 2, y + (QA_H / 2) - 1 + li * 4, { align: 'center' });
    });
  });

  y += QA_H + 5;

  // ─── READING HISTORY + DATA SUMMARY (side by side) ───────────────────────────
  const HIST_W = 118;
  const SUMM_W = W - 20 - HIST_W - 4;
  const HIST_H = 52;

  // Reading History
  doc.setFillColor(255, 255, 255);
  (doc as any).roundedRect(8, y, HIST_W, HIST_H, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  (doc as any).roundedRect(8, y, HIST_W, HIST_H, 2, 2, 'S');

  // History header
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('RECENT READING HISTORY', 12, y + 5);
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(5);
  doc.setFont('helvetica', 'normal');
  doc.text('(Latest 15)', 12 + 48, y + 5);

  // Table header
  const cols = [
    { label: 'Time', w: 22 },
    { label: 'Temp (°C)', w: 18 },
    { label: 'Humidity (%)', w: 20 },
    { label: 'Soil Moist. (%)', w: 23 },
    { label: 'Pitch Condition', w: 23 },
  ];
  const tableX = 10;
  const tableY = y + 8;
  const rowH = 5.5;

  // Table header bg
  doc.setFillColor(37, 99, 235);
  doc.rect(tableX, tableY, HIST_W - 4, rowH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(5);
  doc.setFont('helvetica', 'bold');
  let hx = tableX;
  cols.forEach(col => {
    doc.text(col.label, hx + col.w / 2, tableY + 3.8, { align: 'center' });
    hx += col.w;
  });

  // Table rows (up to 15)
  const tableReadings = readings.slice(0, 15);
  tableReadings.forEach((r, idx) => {
    const ry = tableY + rowH + idx * rowH;
    if (ry + rowH > y + HIST_H - 2) return; // clip if overflow
    doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
    doc.rect(tableX, ry, HIST_W - 4, rowH, 'F');

    const cells = [r.time, `${r.temp}`, `${r.humidity}`, `${r.soil}`, r.pitchStatus];
    let rx = tableX;
    cells.forEach((cell, ci) => {
      const cw = cols[ci].w;
      if (ci === 4) {
        // Status badge
        const sc: RGB = r.pitchStatus === 'Balanced' ? [34, 197, 94] : r.pitchStatus === 'Dry' ? [234, 88, 12] : [59, 130, 246];
        const sl: RGB = [Math.min(255, sc[0] + 155), Math.min(255, sc[1] + 155), Math.min(255, sc[2] + 155)];
        doc.setFillColor(sl[0], sl[1], sl[2]);
        (doc as any).roundedRect(rx + 2, ry + 0.8, cw - 4, rowH - 1.6, 1, 1, 'F');
        doc.setTextColor(sc[0], sc[1], sc[2]);
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', ci === 0 ? 'normal' : 'bold');
      }
      doc.setFontSize(5);
      doc.text(cell, rx + cw / 2, ry + 3.8, { align: 'center' });
      rx += cw;
    });

    // Row separator
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.15);
    doc.line(tableX, ry + rowH, tableX + HIST_W - 4, ry + rowH);
  });

  const visibleRows = Math.min(tableReadings.length, Math.floor((HIST_H - 16) / rowH));
  if (tableReadings.length > visibleRows) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'italic');
    doc.text(`Showing latest ${visibleRows} of ${readings.length} readings`, tableX + (HIST_W - 4) / 2, y + HIST_H - 2, { align: 'center' });
  }

  // DATA SUMMARY
  const summX = 8 + HIST_W + 4;
  doc.setFillColor(255, 255, 255);
  (doc as any).roundedRect(summX, y, SUMM_W, HIST_H, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  (doc as any).roundedRect(summX, y, SUMM_W, HIST_H, 2, 2, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('DATA SUMMARY', summX + SUMM_W / 2, y + 5, { align: 'center' });

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(summX + 3, y + 7, summX + SUMM_W - 3, y + 7);

  const summRows = [
    { label: '🌡 Highest Temperature', value: `${tStats.max} °C`, color: [239, 68, 68] as RGB },
    { label: '🌡 Lowest Temperature', value: `${tStats.min} °C`, color: [239, 68, 68] as RGB },
    { label: '🌡 Average Temperature', value: `${tStats.avg} °C`, color: [239, 68, 68] as RGB },
    { label: '💧 Highest Humidity', value: `${hStats.max} %`, color: [59, 130, 246] as RGB },
    { label: '💧 Lowest Humidity', value: `${hStats.min} %`, color: [59, 130, 246] as RGB },
    { label: '💧 Average Humidity', value: `${hStats.avg} %`, color: [59, 130, 246] as RGB },
    { label: '🌱 Highest Soil Moisture', value: `${sStats.max} %`, color: [34, 197, 94] as RGB },
    { label: '🌱 Lowest Soil Moisture', value: `${sStats.min} %`, color: [34, 197, 94] as RGB },
    { label: '🌱 Average Soil Moisture', value: `${sStats.avg} %`, color: [34, 197, 94] as RGB },
  ];

  summRows.forEach((row, idx) => {
    const sy = y + 10 + idx * 4.5;
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.text(row.label, summX + 4, sy);
    doc.setTextColor(row.color[0], row.color[1], row.color[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(row.value, summX + SUMM_W - 4, sy, { align: 'right' });
    // dotted separator
    if (idx < summRows.length - 1) {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.1);
      doc.line(summX + 3, sy + 1.5, summX + SUMM_W - 3, sy + 1.5);
    }
  });

  y += HIST_H + 4;

  // ─── SYSTEM ANALYSIS ─────────────────────────────────────────────────────────
  const ANAL_H = 24;
  doc.setFillColor(255, 255, 255);
  (doc as any).roundedRect(8, y, W - 16, ANAL_H, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  (doc as any).roundedRect(8, y, W - 16, ANAL_H, 2, 2, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('SYSTEM ANALYSIS', 12, y + 5);

  // Overall status badge
  const overallGood = condition === 'Balanced';
  const badgeColor: RGB = overallGood ? [34, 197, 94] : [234, 88, 12];
  const badgeLight: RGB = [Math.min(255, badgeColor[0] + 155), Math.min(255, badgeColor[1] + 155), Math.min(255, badgeColor[2] + 155)];
  doc.setFillColor(badgeLight[0], badgeLight[1], badgeLight[2]);
  doc.circle(22, y + 15, 7, 'F');
  doc.setTextColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'bold');
  doc.text(overallGood ? 'GOOD' : 'WARN', 22, y + 16, { align: 'center' });

  // Analysis text
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Overall Pitch Health', 35, y + 12);
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  const analysisText = overallGood
    ? `The collected data indicates the pitch is in a balanced and healthy condition. Temperature ${currentTemp}°C is stable.`
    : `The pitch requires attention. Soil moisture at ${currentSoil}% indicates ${condition.toLowerCase()} conditions. Action recommended.`;
  const analysisLines = doc.splitTextToSize(analysisText, W - 60);
  doc.text(analysisLines.slice(0, 2), 35, y + 17);

  // Right side stats
  const analRight = [
    { label: 'Temp Stability', value: Math.abs(parseFloat(tStats.max) - parseFloat(tStats.min)) < 3 ? 'Stable' : 'Variable' },
    { label: 'Humidity Stability', value: Math.abs(parseFloat(hStats.max) - parseFloat(hStats.min)) < 8 ? 'Stable' : 'Variable' },
    { label: 'Current Mode', value: mode === 'auto' ? 'Automatic' : 'Manual' },
  ];
  analRight.forEach((item, idx) => {
    const ax = W - 80 + idx * 24;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, ax, y + 10, { align: 'center' });
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text(item.value, ax, y + 15, { align: 'center' });
  });

  y += ANAL_H + 4;

  // ─── FOOTER ──────────────────────────────────────────────────────────────────
  const footerY = 280;
  doc.setFillColor(12, 32, 82);
  doc.rect(0, footerY, W, 17, 'F');

  // Left
  doc.setTextColor(147, 197, 253);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text('🏏 AI Smart Cricket Pitch Dashboard', 8, footerY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.text('Class XII Informatics Practices Project', 8, footerY + 11);

  // Center
  doc.setTextColor(147, 197, 253);
  doc.setFontSize(5);
  doc.text('Auto Refresh Every 2 Seconds', W / 2, footerY + 6, { align: 'center' });
  doc.text('Powered by Arduino + PHP + MySQL', W / 2, footerY + 11, { align: 'center' });

  // Right
  doc.setFontSize(5);
  doc.text(`Report Generated: ${dateStr} ${timeStr}`, W - 8, footerY + 6, { align: 'right' });
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text('Page 1', W - 8, footerY + 12, { align: 'right' });

  doc.save(`Cricket-Pitch-Report-${now.toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`);
}
