import React, { useState } from 'react';
import {
  Clock,
  FileText,
  FileSpreadsheet,
  BarChart2,
  RotateCcw,
  X,
  AlertTriangle,
  Thermometer,
  Droplets,
  Leaf,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Activity,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

export interface Reading {
  id: number;
  time: string;
  temp: number;
  humidity: number;
  soil: number;
  pitchStatus: string;
}

export interface TimelineEvent {
  id: number;
  time: string;
  type: 'sensor' | 'pump' | 'fan' | 'mode' | 'export';
  message: string;
}

interface QuickActionsProps {
  readings: Reading[];
  tempHistory: { time: number; value: number }[];
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn: boolean;
  onReset: () => void;
  timeline: TimelineEvent[];
}

const CARD =
  'bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.10)] hover:-translate-y-1 transition-all duration-300 rounded-[20px] p-6 flex flex-col';

const BTN_BLUE =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-200 text-sm';

const BTN_GREEN =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold rounded-xl shadow-lg shadow-green-600/25 hover:shadow-green-600/40 transition-all duration-200 text-sm';

const BTN_SLATE =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white font-bold rounded-xl shadow-lg shadow-slate-600/20 transition-all duration-200 text-sm';

const BTN_RED =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-200 text-sm';

const BTN_RED_GRADIENT =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold rounded-xl shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-200 text-sm';

// ── helpers ──────────────────────────────────────────────────────────────────

function calcStats(history: { value: number }[]) {
  if (!history.length) return { max: 0, min: 0, avg: '0.0' };
  const vals = history.map((h) => h.value);
  return {
    max: Math.max(...vals),
    min: Math.min(...vals),
    avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
  };
}

function pitchLabel(soil: number) {
  if (soil < 35) return 'Dry';
  if (soil > 65) return 'Wet';
  return 'Balanced';
}

// ── Card 1 : Reading History ──────────────────────────────────────────────────

function ReadingHistoryCard({ readings }: { readings: Reading[] }) {
  const statusColor: Record<string, string> = {
    Dry: 'bg-orange-100 text-orange-700 border-orange-200',
    Balanced: 'bg-green-100 text-green-700 border-green-200',
    Wet: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  return (
    <div className={CARD}>
      {/* header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100">
          <Clock size={20} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">Recent Reading History</h3>
          <p className="text-xs text-slate-500 mt-0.5">Latest 15 sensor readings — newest first</p>
        </div>
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-100">
        {readings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <Clock size={32} strokeWidth={1.5} />
            <p className="font-semibold text-sm">No Data Available</p>
            <p className="text-xs">Readings appear every 2 seconds</p>
          </div>
        ) : (
          <table className="w-full text-xs min-w-[380px]">
            <thead>
              <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                {['Time', 'Temp (°C)', 'Humidity (%)', 'Soil (%)'].map((h) => (
                  <th key={h} className="py-2.5 px-3 font-semibold text-left first:rounded-tl-xl last:rounded-tr-xl">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {readings.map((r, idx) => (
                <tr
                  key={r.id}
                  className={`border-b border-slate-50 transition-all duration-500 ${
                    idx === 0
                      ? 'bg-blue-50/60 animate-[fadeInRow_0.4s_ease-out]'
                      : idx % 2 === 0
                      ? 'bg-white'
                      : 'bg-slate-50/50'
                  }`}
                >
                  <td className="py-2 px-3 font-mono text-slate-600">{r.time}</td>
                  <td className="py-2 px-3 font-bold text-orange-600">{r.temp}</td>
                  <td className="py-2 px-3 font-bold text-blue-600">{r.humidity}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded-full border font-semibold ${statusColor[r.pitchStatus] ?? ''}`}>
                      {r.soil}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* footer */}
      <p className="text-xs text-slate-400 mt-3 font-medium text-center">
        {readings.length} / 15 readings stored · Auto-updates every 2 s
      </p>
    </div>
  );
}

// ── Card 2 : Export Report (redesigned PDF) ──────────────────────────────────

function ExportReportCard({
  readings,
  tempHistory,
  humHistory,
  soilHistory,
  pumpOn,
  fanOn,
}: Omit<QuickActionsProps, 'onReset' | 'timeline'>) {
  const [busy, setBusy] = useState(false);

  function generatePDF() {
    setBusy(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210;
      const now = new Date();

      const tStats = calcStats(tempHistory);
      const hStats = calcStats(humHistory);
      const sStats = calcStats(soilHistory);
      
      const currentTemp = tempHistory.length ? tempHistory[tempHistory.length - 1].value : 0;
      const currentHum = humHistory.length ? humHistory[humHistory.length - 1].value : 0;
      const currentSoil = soilHistory.length ? soilHistory[soilHistory.length - 1].value : 42;
      const condition = pitchLabel(currentSoil);

      // ── PAGE HEADER (dark blue band) ──────────────────────────
      doc.setFillColor(26, 58, 107); // #1a3a6b
      doc.rect(0, 0, W, 60, 'F');

      // White diagonal accent (right side polygon)
      doc.setFillColor(255, 255, 255);
      doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
      doc.triangle(W - 70, 0, W, 0, W, 60, 'F');
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      // Cricket bat + stumps (simple stick figure on left)
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.rect(15, 12, 3, 12, 'S'); // bat
      // stumps (3 vertical lines)
      doc.line(15, 26, 15, 32);
      doc.line(16.5, 26, 16.5, 32);
      doc.line(18, 26, 18, 32);

      // Large title text
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('AI Smart Cricket Pitch Monitoring Report', 25, 20);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(147, 197, 253);
      doc.text('Class XII Informatics Practices Project', 25, 28);

      // Cricket ball on right (red circle with seam lines)
      doc.setFillColor(220, 38, 38);
      doc.circle(W - 20, 25, 8, 'F');
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.8);
      doc.arc(W - 20, 25, 8, 8, 60, 120, null);
      doc.arc(W - 20, 25, 8, 8, 240, 300, null);

      // ── INFO BAR (light gray bg) ──────────────────────────────
      let y = 60;
      doc.setFillColor(240, 244, 248);
      doc.rect(0, y, W, 16, 'F');

      const reportId = `ASCP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 900 + 100)}`;

      const infoBlocks = [
        { label: 'Date', value: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
        { label: 'Time', value: now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' }) },
        { label: 'Report ID', value: reportId },
        { label: 'ESP32', value: 'Connected' },
        { label: 'Wi-Fi', value: 'Connected' },
        { label: 'Database', value: 'Connected' },
      ];

      const blockW = W / 6;
      infoBlocks.forEach((block, i) => {
        const bx = i * blockW + 5;
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(block.label, bx + blockW / 2, y + 6, { align: 'center' });
        
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(block.value, bx + blockW / 2, y + 12, { align: 'center' });
      });

      y += 16 + 8;

      // ── SENSOR CARDS ROW (three cards) ────────────────────────
      const cardData = [
        {
          label: 'Temperature',
          value: `${currentTemp}°C`,
          accent: [249, 115, 22],
          status: currentTemp > 34 ? 'High' : currentTemp < 30 ? 'Low' : 'Normal',
        },
        {
          label: 'Humidity',
          value: `${currentHum}%`,
          accent: [59, 130, 246],
          status: currentHum > 75 ? 'High' : currentHum < 60 ? 'Low' : 'Optimal',
        },
        {
          label: 'Soil Moisture',
          value: `${currentSoil}%`,
          accent: [34, 197, 94],
          status: condition,
        },
      ];

      const cW = 55;
      const gap = 5;
      const startX = (W - (cW * 3 + gap * 2)) / 2;

      cardData.forEach((card, i) => {
        const cx = startX + i * (cW + gap);
        const cy = y;

        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cx, cy, cW, 28, 2, 2, 'F');

        // Left accent bar
        doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
        doc.rect(cx, cy, 4, 28, 'F');

        // Label
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(card.label, cx + cW / 2, cy + 8, { align: 'center' });

        // Value
        doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(card.value, cx + cW / 2, cy + 18, { align: 'center' });

        // Status badge
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(card.status, cx + cW / 2, cy + 24, { align: 'center' });
      });

      y += 28 + 8;

      // ── PITCH + PUMP + FAN ROW ────────────────────────────────
      const row2Cards = [
        {
          label: 'Pitch Condition',
          value: condition,
          color: condition === 'Balanced' ? [34, 197, 94] : condition === 'Dry' ? [249, 115, 22] : [59, 130, 246],
          description:
            condition === 'Balanced'
              ? 'The pitch has optimal moisture levels and is in good condition'
              : condition === 'Dry'
              ? 'The pitch is dry and requires watering'
              : 'The pitch has excess moisture and needs drying',
        },
        { label: 'Water Pump', value: pumpOn ? 'ON' : 'OFF', color: pumpOn ? [59, 130, 246] : [100, 116, 139] },
        { label: 'Drying Fan', value: fanOn ? 'ON' : 'OFF', color: fanOn ? [34, 197, 94] : [100, 116, 139] },
      ];

      row2Cards.forEach((card, i) => {
        const cx = startX + i * (cW + gap);
        const cy = y;

        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cx, cy, cW, 24, 2, 2, 'F');

        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(card.label, cx + cW / 2, cy + 6, { align: 'center' });

        doc.setTextColor(card.color[0], card.color[1], card.color[2]);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(card.value, cx + cW / 2, cy + 16, { align: 'center' });

        if (i === 0 && 'description' in card) {
          doc.setTextColor(100, 116, 139);
          doc.setFontSize(6);
          doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(card.description, cW - 4);
          doc.text(lines, cx + cW / 2, cy + 20, { align: 'center' });
        }
      });

      y += 24 + 8;

      // ── TREND CHARTS ROW (two mini charts) ────────────────────
      const chartW = 80;
      const chartH = 35;
      const chartX1 = 15;
      const chartX2 = W - chartW - 15;

      // Chart 1: Temperature Trend
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(chartX1, y, chartW, chartH, 2, 2, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Temperature Trend (Last 15)', chartX1 + 2, y + 5);

      const tempData = tempHistory.slice(-15);
      if (tempData.length > 1) {
        const chartY = y + 10;
        const chartPlotW = chartW - 10;
        const chartPlotH = chartH - 15;
        const xStep = chartPlotW / (tempData.length - 1);
        const yMin = 27;
        const yMax = 36;

        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(0.5);
        tempData.forEach((pt, i) => {
          if (i === 0) return;
          const x1 = chartX1 + 5 + (i - 1) * xStep;
          const x2 = chartX1 + 5 + i * xStep;
          const y1Val = tempData[i - 1].value;
          const y2Val = pt.value;
          const y1 = chartY + chartPlotH - ((y1Val - yMin) / (yMax - yMin)) * chartPlotH;
          const y2 = chartY + chartPlotH - ((y2Val - yMin) / (yMax - yMin)) * chartPlotH;
          doc.line(x1, y1, x2, y2);
        });
      }

      // Chart 2: Humidity Trend
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(chartX2, y, chartW, chartH, 2, 2, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Humidity Trend (Last 15)', chartX2 + 2, y + 5);

      const humData = humHistory.slice(-15);
      if (humData.length > 1) {
        const chartY = y + 10;
        const chartPlotW = chartW - 10;
        const chartPlotH = chartH - 15;
        const xStep = chartPlotW / (humData.length - 1);
        const yMin = 50;
        const yMax = 85;

        doc.setDrawColor(22, 163, 74);
        doc.setLineWidth(0.5);
        humData.forEach((pt, i) => {
          if (i === 0) return;
          const x1 = chartX2 + 5 + (i - 1) * xStep;
          const x2 = chartX2 + 5 + i * xStep;
          const y1Val = humData[i - 1].value;
          const y2Val = pt.value;
          const y1 = chartY + chartPlotH - ((y1Val - yMin) / (yMax - yMin)) * chartPlotH;
          const y2 = chartY + chartPlotH - ((y2Val - yMin) / (yMax - yMin)) * chartPlotH;
          doc.line(x1, y1, x2, y2);
        });
      }

      y += chartH + 8;

      // ── RECENT READING HISTORY TABLE ──────────────────────────
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('RECENT READING HISTORY (Latest 5)', 15, y);

      // Data Summary box (right side)
      const summaryX = W - 50;
      const summaryY = y + 2;
      doc.setFillColor(240, 249, 255);
      doc.roundedRect(summaryX, summaryY, 45, 30, 2, 2, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('DATA SUMMARY', summaryX + 22.5, summaryY + 4, { align: 'center' });

      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      let summaryTextY = summaryY + 8;
      const summaryStats = [
        `Highest Temp: ${tStats.max}°C`,
        `Lowest Temp: ${tStats.min}°C`,
        `Avg Temp: ${tStats.avg}°C`,
        `Highest Hum: ${hStats.max}%`,
        `Lowest Hum: ${hStats.min}%`,
        `Avg Hum: ${hStats.avg}%`,
      ];
      summaryStats.forEach((stat) => {
        doc.text(stat, summaryX + 2, summaryTextY);
        summaryTextY += 3.5;
      });

      y += 5;

      // Table
      const tableHeaders = ['Time', 'Temperature (°C)', 'Humidity (%)', 'Soil Moisture (%)', 'Pitch Condition'];
      const colWidths = [22, 24, 20, 26, 24];
      const rowHeight = 7;
      const tableX = 15;
      const tableW = colWidths.reduce((a, b) => a + b, 0);

      // Header row
      doc.setFillColor(37, 99, 235);
      doc.rect(tableX, y, tableW, rowHeight, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      let cx = tableX;
      tableHeaders.forEach((h, i) => {
        doc.text(h, cx + colWidths[i] / 2, y + 5, { align: 'center' });
        cx += colWidths[i];
      });
      y += rowHeight;

      // Data rows
      const tableReadings = readings.slice(0, 5);
      tableReadings.forEach((r, idx) => {
        const isEven = idx % 2 === 0;
        doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
        doc.rect(tableX, y, tableW, rowHeight, 'F');

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');

        const cells = [r.time, `${r.temp}`, `${r.humidity}`, `${r.soil}`, r.pitchStatus];
        cx = tableX;
        cells.forEach((cell, i) => {
          doc.text(cell, cx + colWidths[i] / 2, y + 5, { align: 'center' });
          cx += colWidths[i];
        });

        y += rowHeight;
      });

      if (readings.length === 0) {
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(8);
        doc.text('No readings available', tableX + tableW / 2, y + 5, { align: 'center' });
        y += 12;
      } else {
        y += 2;
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'italic');
        doc.text(`Showing latest 5 of ${readings.length} readings`, tableX, y);
        y += 6;
      }

      // ── PDF FOOTER ────────────────────────────────────────────
      doc.setFillColor(26, 58, 107);
      doc.rect(0, 285, W, 12, 'F');

      doc.setTextColor(186, 230, 253);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('AI Smart Cricket Pitch Dashboard', 15, 290);
      doc.setFontSize(6);
      doc.text('Class XII Informatics Practices Project', 15, 294);

      doc.text('Auto Refresh Every 2 Seconds', W / 2, 291, { align: 'center' });
      doc.text('Powered by ESP32 + PHP + MySQL', W / 2 + 30, 291, { align: 'center' });

      doc.text(
        `Report Generated: ${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-US', { hour12: false })}`,
        W - 15,
         291,
        { align: 'right' }
      );

      doc.setFontSize(7);
      doc.text('Page 1', W - 15, 295, { align: 'right' });

      doc.save('Cricket-Pitch-Report.pdf');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-red-50 text-red-500 shadow-sm ring-1 ring-red-100">
          <FileText size={20} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">Export Report</h3>
          <p className="text-xs text-slate-500 mt-0.5">Generate Professional Cricket Pitch Report</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 mb-5">
        {[
          'Full report inspired by professional layout',
          'Sensor cards, trend charts & readings table',
          'System status, pump & fan info',
          'Statistical summary & system analysis',
        ].map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
            {item}
          </div>
        ))}
      </div>

      <button onClick={generatePDF} disabled={busy} className={BTN_RED_GRADIENT}>
        <FileText size={16} />
        {busy ? 'Generating…' : 'Export Report'}
      </button>
    </div>
  );
}

// ── Card 3 : Export Excel ─────────────────────────────────────────────────────

function ExportExcelCard({
  readings,
  pumpOn,
  fanOn,
}: Pick<QuickActionsProps, 'readings' | 'pumpOn' | 'fanOn'>) {
  function exportExcel() {
    const header = [
      'Time',
      'Temperature (°C)',
      'Humidity (%)',
      'Soil Moisture (%)',
      'Pitch Status',
      'System Mode',
      'Pump Status',
      'Fan Status',
    ];
    const rows = readings.map((r) => [
      r.time,
      r.temp,
      r.humidity,
      r.soil,
      r.pitchStatus,
      'Automatic',
      pumpOn ? 'ON' : 'OFF',
      fanOn ? 'ON' : 'OFF',
    ]);

    const wsData = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [16, 18, 14, 18, 14, 14, 12, 12].map((w) => ({ wch: w }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Readings');

    const metaData = [
      ['Report Title', 'AI Smart Cricket Pitch Dashboard'],
      ['Export Date', new Date().toLocaleDateString()],
      ['Export Time', new Date().toLocaleTimeString()],
      ['Total Readings', readings.length],
      ['School Project', 'Class XII Informatics Practices'],
    ];
    const metaWs = XLSX.utils.aoa_to_sheet(metaData);
    metaWs['!cols'] = [{ wch: 16 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, metaWs, 'Info');

    XLSX.writeFile(wb, 'Cricket-Pitch-Readings.xlsx');
  }

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-green-50 text-green-600 shadow-sm ring-1 ring-green-100">
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">Export Excel</h3>
          <p className="text-xs text-slate-500 mt-0.5">Spreadsheet with all readings</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 mb-5">
        {[
          'Time, Temperature, Humidity, Soil Moisture',
          'Pitch Status, System Mode',
          'Pump & Fan Status columns',
          'Project info on a separate sheet',
        ].map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
            {item}
          </div>
        ))}
      </div>

      <button onClick={exportExcel} className={BTN_GREEN}>
        <FileSpreadsheet size={16} />
        Download Excel
      </button>
    </div>
  );
}

// ── Card 4 : View Analysis (completely redesigned modal) ──────────────────────

function AnalysisModal({
  onClose,
  tempHistory,
  humHistory,
  soilHistory,
  pumpOn,
  fanOn,
}: {
  onClose: () => void;
  tempHistory: { time: number; value: number }[];
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn: boolean;
}) {
  const [selectedTab, setSelectedTab] = useState<'bar' | 'trend' | 'distribution' | 'radar'>('trend');

  const tStats = calcStats(tempHistory);
  const hStats = calcStats(humHistory);
  const sStats = calcStats(soilHistory);

  const currentTemp = tempHistory.length ? tempHistory[tempHistory.length - 1].value : 0;
  const currentHum = humHistory.length ? humHistory[humHistory.length - 1].value : 0;
  const currentSoil = soilHistory.length ? soilHistory[soilHistory.length - 1].value : 42;

  const trendDiff = (history: { value: number }[]) => {
    if (history.length < 2) return 0;
    return history[history.length - 1].value - history[0].value;
  };

  // Bar Chart data (last 10 readings)
  const barData = tempHistory.slice(-10).map((t, i) => ({
    index: i + 1,
    temperature: t.value,
    humidity: humHistory.slice(-10)[i]?.value || 0,
    soil: soilHistory.slice(-10)[i]?.value || 0,
  }));

  // Distribution Pie data
  const dryCount = soilHistory.filter((s) => s.value < 35).length;
  const wetCount = soilHistory.filter((s) => s.value > 65).length;
  const balancedCount = soilHistory.length - dryCount - wetCount;
  const total = soilHistory.length || 1;

  const pieData = [
    { name: 'Dry', value: (dryCount / total) * 100, color: '#f97316' },
    { name: 'Balanced', value: (balancedCount / total) * 100, color: '#22c55e' },
    { name: 'Wet', value: (wetCount / total) * 100, color: '#3b82f6' },
  ];

  // Radar Chart data
  const radarData = [
    {
      metric: 'Temp Performance',
      value: Math.min(100, Math.max(0, ((currentTemp - 28) / (35 - 28)) * 100)),
    },
    { metric: 'Humidity', value: currentHum },
    { metric: 'Soil Moisture', value: currentSoil },
    { metric: 'Pump Activity', value: pumpOn ? 80 : 20 },
    { metric: 'Fan Activity', value: fanOn ? 80 : 20 },
    { metric: 'System Health', value: Math.min(100, Math.max(0, 100 - Math.abs(currentSoil - 50) * 2)) },
  ];

  // AI Insights computations
  const overallHealth = currentSoil >= 35 && currentSoil <= 65 ? 'Good' : 'Needs Attention';
  const sensorStability = Math.max(tStats.max - tStats.min, hStats.max - hStats.min) < 3 ? 'Stable' : 'Fluctuating';
  
  const recentSoil = soilHistory.slice(-5);
  const moistureTrend =
    recentSoil.length < 2
      ? 'Stable'
      : recentSoil[recentSoil.length - 1].value > recentSoil[0].value + 2
      ? 'Rising'
      : recentSoil[recentSoil.length - 1].value < recentSoil[0].value - 2
      ? 'Falling'
      : 'Stable';

  const tempStability = tStats.max - tStats.min < 3 ? 'Stable' : 'Fluctuating';
  const humStability = hStats.max - hStats.min < 3 ? 'Stable' : 'Fluctuating';

  const systemScore = Math.round(
    Math.min(100, Math.max(0, 100 - Math.abs(currentSoil - 50) * 0.8 - Math.abs(currentTemp - 31) * 2 - Math.abs(currentHum - 68) * 0.3))
  );

  // Smart Recommendations
  const recommendations: Array<{ type: 'error' | 'warning' | 'info' | 'success'; message: string }> = [];
  if (currentSoil < 30) recommendations.push({ type: 'error', message: 'Urgent: Water Required' });
  else if (currentSoil >= 30 && currentSoil < 35) recommendations.push({ type: 'warning', message: 'Water Required Soon' });
  if (currentSoil > 72) recommendations.push({ type: 'error', message: 'Pitch Too Wet — Reduce Moisture' });
  else if (currentSoil >= 65 && currentSoil <= 72) recommendations.push({ type: 'info', message: 'Moisture Slightly High' });
  if (currentTemp > 33) recommendations.push({ type: 'warning', message: 'Temperature Increasing' });
  if (currentTemp < 29) recommendations.push({ type: 'info', message: 'Temperature Below Normal' });
  if (currentHum < 58) recommendations.push({ type: 'warning', message: 'Humidity Decreasing' });
  if (currentHum > 78) recommendations.push({ type: 'info', message: 'Humidity High' });
  if (recommendations.length === 0) recommendations.push({ type: 'success', message: 'All Systems Normal' });

  const recColors = {
    error: 'bg-red-100 text-red-700 border-red-300',
    warning: 'bg-orange-100 text-orange-700 border-orange-300',
    info: 'bg-blue-100 text-blue-700 border-blue-300',
    success: 'bg-green-100 text-green-700 border-green-300',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8,15,30,0.92)', backdropFilter: 'blur(20px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 rounded-[28px] shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 rounded-t-[28px] border-b border-slate-700/50 px-8 py-6 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-white text-2xl bg-gradient-to-r from-blue-400 to-violet-500 bg-clip-text text-transparent">
              Sensor Analytics
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Live Snapshot · {tempHistory.length} total readings evaluated
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          {/* Section 1: Three stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Temperature Card */}
            <div className="bg-slate-800/60 backdrop-blur-xl border-l-4 border-orange-500 border border-slate-700/50 rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400">
                  <Thermometer size={20} />
                </div>
                <h3 className="font-bold text-white">Temperature</h3>
                {trendDiff(tempHistory) > 0 ? (
                  <TrendingUp size={16} className="text-orange-400 ml-auto" />
                ) : (
                  <TrendingDown size={16} className="text-blue-400 ml-auto" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Min</p>
                  <p className="text-lg font-bold text-white">{tStats.min}°C</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Max</p>
                  <p className="text-lg font-bold text-white">{tStats.max}°C</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Average</p>
                  <p className="text-lg font-bold text-white">{tStats.avg}°C</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Current</p>
                  <p className="text-lg font-bold text-orange-400">{currentTemp}°C</p>
                </div>
              </div>
            </div>

            {/* Humidity Card */}
            <div className="bg-slate-800/60 backdrop-blur-xl border-l-4 border-blue-500 border border-slate-700/50 rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                  <Droplets size={20} />
                </div>
                <h3 className="font-bold text-white">Humidity</h3>
                {trendDiff(humHistory) > 0 ? (
                  <TrendingUp size={16} className="text-blue-400 ml-auto" />
                ) : (
                  <TrendingDown size={16} className="text-orange-400 ml-auto" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Min</p>
                  <p className="text-lg font-bold text-white">{hStats.min}%</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Max</p>
                  <p className="text-lg font-bold text-white">{hStats.max}%</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Average</p>
                  <p className="text-lg font-bold text-white">{hStats.avg}%</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Current</p>
                  <p className="text-lg font-bold text-blue-400">{currentHum}%</p>
                </div>
              </div>
            </div>

            {/* Soil Moisture Card */}
            <div className="bg-slate-800/60 backdrop-blur-xl border-l-4 border-green-500 border border-slate-700/50 rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-green-500/20 text-green-400">
                  <Leaf size={20} />
                </div>
                <h3 className="font-bold text-white">Soil Moisture</h3>
                {trendDiff(soilHistory) > 0 ? (
                  <TrendingUp size={16} className="text-green-400 ml-auto" />
                ) : (
                  <TrendingDown size={16} className="text-orange-400 ml-auto" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Min</p>
                  <p className="text-lg font-bold text-white">{sStats.min}%</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Max</p>
                  <p className="text-lg font-bold text-white">{sStats.max}%</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Average</p>
                  <p className="text-lg font-bold text-white">{sStats.avg}%</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Current</p>
                  <p className="text-lg font-bold text-green-400">{currentSoil}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Charts with tabs */}
          <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {(['bar', 'trend', 'distribution', 'radar'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 ${
                    selectedTab === tab
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {tab === 'bar' ? 'Bar Chart' : tab === 'trend' ? 'Trend Lines' : tab === 'distribution' ? 'Distribution' : 'Radar'}
                </button>
              ))}
            </div>

            <div className="h-[350px]">
              {selectedTab === 'bar' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="index" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Legend wrapperStyle={{ color: '#fff' }} />
                    <Bar dataKey="temperature" fill="#f97316" name="Temperature" />
                    <Bar dataKey="humidity" fill="#3b82f6" name="Humidity" />
                    <Bar dataKey="soil" fill="#22c55e" name="Soil" />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {selectedTab === 'trend' && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tempHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" hide />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Legend wrapperStyle={{ color: '#fff' }} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      data={tempHistory}
                      stroke="#f97316"
                      strokeWidth={2}
                      name="Temperature"
                      animationDuration={1000}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      data={humHistory}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Humidity"
                      animationDuration={1000}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      data={soilHistory}
                      stroke="#22c55e"
                      strokeWidth={2}
                      name="Soil"
                      animationDuration={1000}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {selectedTab === 'distribution' && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value.toFixed(1)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Legend wrapperStyle={{ color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}

              {selectedTab === 'radar' && (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#475569" />
                    <PolarAngleAxis dataKey="metric" stroke="#94a3b8" />
                    <PolarRadiusAxis stroke="#94a3b8" />
                    <Radar
                      name="System Metrics"
                      dataKey="value"
                      stroke="#7c3aed"
                      fill="#7c3aed"
                      fillOpacity={0.3}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Section 3: Analysis Tools */}
          <div>
            <h3 className="text-white font-bold text-lg mb-4">Analysis Tools</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { icon: Thermometer, label: 'Temperature Analysis', desc: 'Detailed heat index tracking', color: 'orange' },
                { icon: Droplets, label: 'Humidity Analysis', desc: 'Atmospheric moisture patterns', color: 'blue' },
                { icon: Leaf, label: 'Moisture Analysis', desc: 'Soil saturation monitoring', color: 'green' },
                {
                  icon: Activity,
                  label: 'Predict Pitch Condition',
                  desc:
                    moistureTrend === 'Falling' ? 'Drying expected' : moistureTrend === 'Rising' ? 'Wetness risk' : 'Stable condition',
                  color: 'violet',
                },
                { icon: FileText, label: 'Export Analysis', desc: 'Generate comprehensive report', color: 'red' },
                { icon: BarChart2, label: 'Compare Readings', desc: 'Min vs Max comparison across all sensors', color: 'slate' },
              ].map((tool, i) => {
                const Icon = tool.icon;
                return (
                  <div
                    key={i}
                    className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                  >
                    <div className={`p-2 rounded-lg bg-${tool.color}-500/20 text-${tool.color}-400 w-fit mb-3`}>
                      <Icon size={20} />
                    </div>
                    <h4 className="text-white font-bold text-sm mb-1">{tool.label}</h4>
                    <p className="text-slate-400 text-xs">{tool.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: AI Insights */}
          <div>
            <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-2">
              <span className="bg-gradient-to-r from-blue-400 to-violet-500 bg-clip-text text-transparent flex items-center gap-2">
                AI Insights
                <Sparkles size={20} className="text-violet-400" />
              </span>
            </h3>
            <p className="text-slate-400 text-sm mb-4">Intelligent analysis generated from live sensor data</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Overall Pitch Health', value: overallHealth, color: overallHealth === 'Good' ? 'green' : 'orange' },
                { label: 'Sensor Stability', value: sensorStability, color: sensorStability === 'Stable' ? 'blue' : 'orange' },
                { label: 'Moisture Trend', value: moistureTrend, color: 'violet' },
                { label: 'Temperature Stability', value: tempStability, color: tempStability === 'Stable' ? 'blue' : 'orange' },
                { label: 'Humidity Stability', value: humStability, color: humStability === 'Stable' ? 'blue' : 'orange' },
                { label: 'Pump Usage', value: pumpOn ? 'Active' : 'Inactive', color: pumpOn ? 'blue' : 'slate' },
                { label: 'Fan Usage', value: fanOn ? 'Active' : 'Inactive', color: fanOn ? 'green' : 'slate' },
                {
                  label: 'Overall System Score',
                  value: `${systemScore}/100`,
                  color: systemScore > 75 ? 'green' : systemScore > 50 ? 'blue' : 'orange',
                },
              ].map((insight, i) => (
                <div key={i} className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4">
                  <div className={`w-2 h-2 rounded-full bg-${insight.color}-500 mb-2`} />
                  <p className="text-slate-400 text-xs mb-1">{insight.label}</p>
                  <p className="text-white font-bold text-lg">{insight.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5: Smart Recommendations */}
          <div>
            <h3 className="text-white font-bold text-lg mb-4">Smart Recommendations</h3>
            <div className="flex flex-wrap gap-3">
              {recommendations.map((rec, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border font-semibold text-sm ${recColors[rec.type]}`}
                >
                  {rec.type === 'error' && <AlertTriangle size={16} />}
                  {rec.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewAnalysisCard(props: Pick<QuickActionsProps, 'tempHistory' | 'humHistory' | 'soilHistory' | 'pumpOn' | 'fanOn'>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={CARD}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-violet-50 text-violet-600 shadow-sm ring-1 ring-violet-100">
            <BarChart2 size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">Sensor Analysis</h3>
            <p className="text-xs text-slate-500 mt-0.5">Deep stats & trend charts</p>
          </div>
        </div>

        <div className="flex-1 space-y-3 mb-5">
          {[
            'Temperature, Humidity & Soil Moisture charts',
            'Max, Min & Average per sensor',
            'Overall pitch condition assessment',
            'Smooth animated charts',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>

        <button onClick={() => setOpen(true)} className={BTN_SLATE}>
          <BarChart2 size={16} />
          Open Analysis
        </button>
      </div>

      {open && (
        <AnalysisModal
          onClose={() => setOpen(false)}
          tempHistory={props.tempHistory}
          humHistory={props.humHistory}
          soilHistory={props.soilHistory}
          pumpOn={props.pumpOn}
          fanOn={props.fanOn}
        />
      )}
    </>
  );
}

// ── Card 5 : Reset Dashboard ──────────────────────────────────────────────────

function ResetDashboardCard({ onReset }: { onReset: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false);

  function handleConfirm() {
    onReset();
    setShowConfirm(false);
  }

  return (
    <>
      <div className={CARD}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-red-50 text-red-500 shadow-sm ring-1 ring-red-100">
            <RotateCcw size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">Reset Dashboard</h3>
            <p className="text-xs text-slate-500 mt-0.5">Clear all data &amp; wait for fresh readings</p>
          </div>
        </div>

        <div className="flex-1 space-y-3 mb-5">
          {[
            'Clears all sensor cards to zero',
            'Wipes graphs and reading history',
            'Clears analysis data',
            'Next ESP32 reading auto-fills everything',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>

        <button onClick={() => setShowConfirm(true)} className={BTN_RED}>
          <RotateCcw size={16} />
          Reset Dashboard
        </button>
      </div>

      {/* confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)' }}
        >
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <h3 className="font-bold text-slate-800 text-lg mb-2">Confirm Reset</h3>
            <p className="text-slate-600 text-sm mb-6">
              This will clear all sensor readings, graphs, and history. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handleConfirm} className="flex-1 py-2 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors">
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Card 6 : Activity Timeline ────────────────────────────────────────────────

function ActivityTimelineCard({ timeline }: { timeline: TimelineEvent[] }) {
  const typeColors = {
    sensor: 'bg-blue-500',
    pump: 'bg-indigo-500',
    fan: 'bg-green-500',
    mode: 'bg-violet-500',
    export: 'bg-red-500',
  };

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100">
          <Activity size={20} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">Activity Timeline</h3>
          <p className="text-xs text-slate-500 mt-0.5">Latest 20 system events — newest first</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto max-h-[400px]">
        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <Activity size={32} strokeWidth={1.5} />
            <p className="font-semibold text-sm">No activity yet</p>
            <p className="text-xs">Events appear every 2 seconds</p>
          </div>
        ) : (
          <div className="space-y-3">
            {timeline.map((event, idx) => (
              <div key={event.id} className="flex items-start gap-3 relative">
                {idx !== timeline.length - 1 && (
                  <div className="absolute left-[9px] top-6 bottom-0 w-0.5 bg-slate-200" />
                )}
                <div className={`w-5 h-5 rounded-full ${typeColors[event.type]} flex-shrink-0 relative z-10`} />
                <div className="flex-1 pb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-mono text-slate-500">{event.time}</span>
                    <span className="text-sm text-slate-700 font-medium">{event.message}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3 font-medium text-center">
        {timeline.length} / 20 events stored · Real-time activity log
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function QuickActions({
  readings,
  tempHistory,
  humHistory,
  soilHistory,
  pumpOn,
  fanOn,
  onReset,
  timeline = [],
}: QuickActionsProps) {
  return (
    <div className="w-full">
      <h2 className="text-xl font-bold text-slate-800 mb-5 flex items-center gap-2">
        <BarChart2 size={24} className="text-slate-400" />
        Quick Actions
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ReadingHistoryCard readings={readings} />
        <ExportReportCard
          readings={readings}
          tempHistory={tempHistory}
          humHistory={humHistory}
          soilHistory={soilHistory}
          pumpOn={pumpOn}
          fanOn={fanOn}
        />
        <ExportExcelCard readings={readings} pumpOn={pumpOn} fanOn={fanOn} />
        <ViewAnalysisCard
          tempHistory={tempHistory}
          humHistory={humHistory}
          soilHistory={soilHistory}
          pumpOn={pumpOn}
          fanOn={fanOn}
        />
        <ResetDashboardCard onReset={onReset} />
        <ActivityTimelineCard timeline={timeline} />
      </div>
    </div>
  );
}
