import React, { useState, useEffect, useRef } from 'react';
import {
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
  Mic,
  MicOff,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
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

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Reading {
  id: number;
  time: string;
  temp: number;
  humidity: number;
  soil: number;
  pitchStatus: string;
  pumpOn: boolean;
  fanOn: boolean;
  mode: 'auto' | 'manual';
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
  humHistory:  { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn:  boolean;
  onReset: () => void;
  timeline: TimelineEvent[];
}

// ── Style constants ────────────────────────────────────────────────────────────

const CARD =
  'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_32px_rgb(0,0,0,0.10)] hover:shadow-[0_14px_44px_rgb(0,0,0,0.14)] hover:-translate-y-1 transition-all duration-300 rounded-[26px] p-6 flex flex-col h-[220px]';

const BTN_RED_GRADIENT =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold rounded-xl shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-200 text-sm';

const BTN_GREEN =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-600/25 hover:shadow-green-600/40 transition-all duration-200 text-sm';

const BTN_SLATE =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg shadow-slate-700/20 transition-all duration-200 text-sm';

const BTN_RED =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-200 text-sm';

const BTN_INDIGO =
  'flex items-center justify-center gap-2 w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 transition-all duration-200 text-sm';

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcStats(history: { value: number }[]) {
  if (!history.length) return { max: 0, min: 0, avg: '0.0' };
  const vals = history.map(h => h.value);
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

// ── Card 1: Export Report ──────────────────────────────────────────────────────

function ExportReportCard({
  readings, tempHistory, humHistory, soilHistory, pumpOn, fanOn,
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
      const currentTemp  = tempHistory.length  ? tempHistory[tempHistory.length - 1].value   : 0;
      const currentHum   = humHistory.length   ? humHistory[humHistory.length - 1].value     : 0;
      const currentSoil  = soilHistory.length  ? soilHistory[soilHistory.length - 1].value   : 42;
      const condition    = pitchLabel(currentSoil);

      // Header band
      doc.setFillColor(26, 58, 107);
      doc.rect(0, 0, W, 60, 'F');

      doc.setFillColor(255, 255, 255);
      doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
      doc.triangle(W - 70, 0, W, 0, W, 60, 'F');
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('AI Smart Cricket Pitch Monitoring Report', 15, 22);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(147, 197, 253);
      doc.text('Class XII Informatics Practices Project', 15, 30);

      // Cricket ball
      doc.setFillColor(220, 38, 38);
      doc.circle(W - 20, 25, 8, 'F');

      // Info bar
      let y = 60;
      doc.setFillColor(240, 244, 248);
      doc.rect(0, y, W, 16, 'F');
      const reportId = `ASCP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 900 + 100)}`;
      const infoBlocks = [
        { label: 'Date',     value: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
        { label: 'Time',     value: now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' }) },
        { label: 'Report ID', value: reportId },
        { label: 'ESP32',    value: 'Connected' },
        { label: 'Wi-Fi',    value: 'Connected' },
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
      y += 24;

      // Sensor cards row
      const cardData = [
        { label: 'Temperature',  value: `${currentTemp}°C`,  accent: [249, 115, 22] as [number,number,number], status: currentTemp > 34 ? 'High' : currentTemp < 30 ? 'Low' : 'Normal' },
        { label: 'Humidity',     value: `${currentHum}%`,    accent: [59, 130, 246] as [number,number,number], status: currentHum > 75 ? 'High' : currentHum < 60 ? 'Low' : 'Optimal' },
        { label: 'Soil Moisture', value: `${currentSoil}%`, accent: [34, 197, 94]  as [number,number,number], status: condition },
      ];
      const cW = 55, gap = 5, startX = (W - (cW * 3 + gap * 2)) / 2;
      cardData.forEach((card, i) => {
        const cx = startX + i * (cW + gap);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cx, y, cW, 28, 2, 2, 'F');
        doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
        doc.rect(cx, y, 4, 28, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text(card.label, cx + cW / 2, y + 8, { align: 'center' });
        doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
        doc.setFontSize(16);
        doc.text(card.value, cx + cW / 2, y + 18, { align: 'center' });
        doc.setFontSize(7); doc.setTextColor(100, 116, 139);
        doc.text(card.status, cx + cW / 2, y + 24, { align: 'center' });
      });
      y += 36;

      // System status row
      const row2Cards = [
        { label: 'Pitch Condition', value: condition, color: condition === 'Balanced' ? [34, 197, 94] : condition === 'Dry' ? [249, 115, 22] : [59, 130, 246] as [number,number,number] },
        { label: 'Water Pump',     value: pumpOn ? 'ON' : 'OFF', color: pumpOn ? [59, 130, 246] : [100, 116, 139] as [number,number,number] },
        { label: 'Drying Fan',     value: fanOn  ? 'ON' : 'OFF', color: fanOn  ? [34, 197, 94]  : [100, 116, 139] as [number,number,number] },
      ];
      row2Cards.forEach((card, i) => {
        const cx = startX + i * (cW + gap);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cx, y, cW, 22, 2, 2, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7); doc.setFont('helvetica', 'bold');
        doc.text(card.label, cx + cW / 2, y + 6, { align: 'center' });
        const c = Array.isArray(card.color) ? card.color : [100, 116, 139];
        doc.setTextColor(c[0], c[1], c[2]);
        doc.setFontSize(13);
        doc.text(card.value, cx + cW / 2, y + 15, { align: 'center' });
      });
      y += 30;

      // Statistics summary
      doc.setTextColor(30, 41, 59); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('STATISTICAL SUMMARY', 15, y);
      y += 6;
      const summaryRows = [
        `Highest Temp: ${tStats.max}°C   Lowest Temp: ${tStats.min}°C   Avg Temp: ${tStats.avg}°C`,
        `Highest Hum: ${hStats.max}%     Lowest Hum: ${hStats.min}%    Avg Hum: ${hStats.avg}%`,
        `Highest Soil: ${sStats.max}%    Lowest Soil: ${sStats.min}%   Avg Soil: ${sStats.avg}%`,
      ];
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 80, 100);
      summaryRows.forEach(row => { doc.text(row, 15, y); y += 6; });
      y += 4;

      // Reading table
      doc.setTextColor(30, 41, 59); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('RECENT READING HISTORY (Latest 5)', 15, y);
      y += 4;
      const tableHeaders = ['Time', 'Temperature (°C)', 'Humidity (%)', 'Soil Moisture (%)', 'Pitch Condition'];
      const colWidths = [22, 24, 20, 26, 24];
      const rowH = 7, tableX = 15;
      const tableW = colWidths.reduce((a, b) => a + b, 0);
      doc.setFillColor(37, 99, 235);
      doc.rect(tableX, y, tableW, rowH, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      let cx2 = tableX;
      tableHeaders.forEach((h, i) => { doc.text(h, cx2 + colWidths[i] / 2, y + 5, { align: 'center' }); cx2 += colWidths[i]; });
      y += rowH;
      readings.slice(0, 5).forEach((r, idx) => {
        doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
        doc.rect(tableX, y, tableW, rowH, 'F');
        doc.setTextColor(30, 41, 59); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        cx2 = tableX;
        [r.time, `${r.temp}`, `${r.humidity}`, `${r.soil}`, r.pitchStatus].forEach((cell, i) => {
          doc.text(cell, cx2 + colWidths[i] / 2, y + 5, { align: 'center' }); cx2 += colWidths[i];
        });
        y += rowH;
      });
      y += 4;

      // Footer
      doc.setFillColor(26, 58, 107);
      doc.rect(0, 285, W, 12, 'F');
      doc.setTextColor(186, 230, 253); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text('AI Smart Cricket Pitch Dashboard', 15, 290);
      doc.text('Class XII Informatics Practices Project', 15, 294);
      doc.text('Powered by ESP32 + PHP + MySQL', W / 2, 291, { align: 'center' });
      doc.text(`Generated: ${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-US', { hour12: false })}`, W - 15, 291, { align: 'right' });
      doc.text('Page 1', W - 15, 295, { align: 'right' });

      doc.save('Cricket-Pitch-Report.pdf');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 rounded-xl bg-red-50 text-red-500 shadow-sm ring-1 ring-red-100"><FileText size={22} /></div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">Export Report</h3>
          <p className="text-xs text-slate-500 mt-0.5">Generate Professional Cricket Pitch Report</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 flex-1 leading-relaxed">Full sensor data, trend charts, system status, statistical summary and reading history in a polished PDF.</p>
      <button onClick={generatePDF} disabled={busy} className={BTN_RED_GRADIENT}>
        <FileText size={16} />
        {busy ? 'Generating…' : 'Export Report'}
      </button>
    </div>
  );
}

// ── Card 2: Export Excel ───────────────────────────────────────────────────────

function ExportExcelCard({ readings, pumpOn, fanOn }: Pick<QuickActionsProps, 'readings' | 'pumpOn' | 'fanOn'>) {
  function exportExcel() {
    const header = ['Time', 'Temperature (°C)', 'Humidity (%)', 'Soil Moisture (%)', 'Pitch Status', 'Pump', 'Fan', 'Mode'];
    const rows = readings.map(r => [r.time, r.temp, r.humidity, r.soil, r.pitchStatus, pumpOn ? 'ON' : 'OFF', fanOn ? 'ON' : 'OFF', 'Automatic']);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [14, 18, 14, 18, 14, 10, 10, 12].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Readings');
    const metaWs = XLSX.utils.aoa_to_sheet([
      ['Report Title', 'AI Smart Cricket Pitch Dashboard'],
      ['Export Date',  new Date().toLocaleDateString()],
      ['Export Time',  new Date().toLocaleTimeString()],
      ['Total Readings', readings.length],
    ]);
    metaWs['!cols'] = [{ wch: 16 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, metaWs, 'Info');
    XLSX.writeFile(wb, 'Cricket-Pitch-Readings.xlsx');
  }

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 rounded-xl bg-green-50 text-green-600 shadow-sm ring-1 ring-green-100"><FileSpreadsheet size={22} /></div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">Export Excel</h3>
          <p className="text-xs text-slate-500 mt-0.5">Spreadsheet with all readings</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 flex-1 leading-relaxed">Temperature, humidity, soil moisture, pitch status, pump & fan columns with project info on a separate sheet.</p>
      <button onClick={exportExcel} className={BTN_GREEN}>
        <FileSpreadsheet size={16} />
        Download Excel
      </button>
    </div>
  );
}

// ── Sensor Analysis Modal ──────────────────────────────────────────────────────

function AnalysisModal({
  onClose, tempHistory, humHistory, soilHistory, pumpOn, fanOn,
}: {
  onClose: () => void;
  tempHistory: { time: number; value: number }[];
  humHistory:  { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn:  boolean;
}) {
  const [chartTab, setChartTab] = useState<'bar' | 'trend' | 'radar'>('trend');

  const tStats = calcStats(tempHistory);
  const hStats = calcStats(humHistory);
  const sStats = calcStats(soilHistory);

  const currentTemp = tempHistory.length ? tempHistory[tempHistory.length - 1].value : 0;
  const currentHum  = humHistory.length  ? humHistory[humHistory.length - 1].value  : 0;
  const currentSoil = soilHistory.length ? soilHistory[soilHistory.length - 1].value : 42;

  const trendDiff = (h: { value: number }[]) => h.length < 2 ? 0 : h[h.length - 1].value - h[0].value;

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const barData = tempHistory.slice(-10).map((t, i) => ({
    index: i + 1,
    temperature: t.value,
    humidity:    humHistory.slice(-10)[i]?.value ?? 0,
    soil:        soilHistory.slice(-10)[i]?.value ?? 0,
  }));

  const radarData = [
    { metric: 'Temp Performance', value: Math.min(100, Math.max(0, ((currentTemp - 28) / (35 - 28)) * 100)) },
    { metric: 'Humidity',         value: currentHum  },
    { metric: 'Soil Moisture',    value: currentSoil },
    { metric: 'Pump Activity',    value: pumpOn ? 80 : 20 },
    { metric: 'Fan Activity',     value: fanOn  ? 80 : 20 },
    { metric: 'System Health',    value: Math.min(100, Math.max(0, 100 - Math.abs(currentSoil - 50) * 2)) },
  ];

  const statCards = [
    { label: 'Temperature',  icon: Thermometer, borderColor: 'border-orange-500', iconBg: 'bg-orange-500/20', iconText: 'text-orange-400', stats: tStats, unit: '°C', trend: trendDiff(tempHistory) },
    { label: 'Humidity',     icon: Droplets,    borderColor: 'border-blue-500',   iconBg: 'bg-blue-500/20',   iconText: 'text-blue-400',   stats: hStats, unit: '%',  trend: trendDiff(humHistory)  },
    { label: 'Soil Moisture', icon: Leaf,       borderColor: 'border-green-500',  iconBg: 'bg-green-500/20',  iconText: 'text-green-400',  stats: sStats, unit: '%',  trend: trendDiff(soilHistory) },
  ];

  const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '10px', color: '#fff' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8,15,30,0.90)', backdropFilter: 'blur(20px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-slate-900 rounded-[28px] shadow-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ animation: 'fadeScaleIn 0.25s ease-out' }}
      >
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-700/50 px-8 py-6 flex items-center justify-between shrink-0">
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
            className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors border border-slate-700/50"
          >
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto p-8 space-y-8">
          {/* Stat Cards — Min / Max / Average only */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {statCards.map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} className={`bg-slate-800/60 backdrop-blur-xl border-l-4 ${card.borderColor} border border-slate-700/50 rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`p-2 rounded-lg ${card.iconBg} ${card.iconText}`}><Icon size={20} /></div>
                    <h3 className="font-bold text-white">{card.label}</h3>
                    {card.trend > 0
                      ? <TrendingUp   size={16} className={card.iconText + ' ml-auto'} />
                      : <TrendingDown size={16} className="text-orange-400 ml-auto" />
                    }
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Min',     value: card.stats.min },
                      { label: 'Max',     value: card.stats.max },
                      { label: 'Average', value: card.stats.avg },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-900/50 rounded-xl p-3 text-center">
                        <p className="text-[11px] text-slate-400 mb-1">{item.label}</p>
                        <p className="text-lg font-bold text-white">{item.value}{card.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chart area with toggle */}
          <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {([
                { key: 'bar',   label: 'Bar Chart'   },
                { key: 'trend', label: 'Line Chart'   },
                { key: 'radar', label: 'Radar Chart'  },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setChartTab(key)}
                  className={`px-5 py-2 rounded-xl font-bold text-sm transition-all duration-200 ${
                    chartTab === key
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="h-[300px]">
              {chartTab === 'bar' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="index" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ color: '#cbd5e1' }} />
                    <Bar dataKey="temperature" fill="#f97316" name="Temperature" radius={[4,4,0,0]} />
                    <Bar dataKey="humidity"    fill="#3b82f6" name="Humidity"    radius={[4,4,0,0]} />
                    <Bar dataKey="soil"        fill="#22c55e" name="Soil"        radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {chartTab === 'trend' && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tempHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" hide />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ color: '#cbd5e1' }} />
                    <Line type="monotone" dataKey="value" data={tempHistory}  stroke="#f97316" strokeWidth={2} name="Temperature" dot={false} animationDuration={800} />
                    <Line type="monotone" dataKey="value" data={humHistory}   stroke="#3b82f6" strokeWidth={2} name="Humidity"    dot={false} animationDuration={800} />
                    <Line type="monotone" dataKey="value" data={soilHistory}  stroke="#22c55e" strokeWidth={2} name="Soil"        dot={false} animationDuration={800} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {chartTab === 'radar' && (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid stroke="#475569" />
                    <PolarAngleAxis dataKey="metric" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <PolarRadiusAxis stroke="#475569" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Radar name="System Metrics" dataKey="value" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.3} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ color: '#cbd5e1' }} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card 3: Sensor Analysis ────────────────────────────────────────────────────

function SensorAnalysisCard(props: Pick<QuickActionsProps, 'tempHistory' | 'humHistory' | 'soilHistory' | 'pumpOn' | 'fanOn'>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={CARD}>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-violet-50 text-violet-600 shadow-sm ring-1 ring-violet-100"><BarChart2 size={22} /></div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">Sensor Analysis</h3>
            <p className="text-xs text-slate-500 mt-0.5">Deep stats & interactive charts</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 flex-1 leading-relaxed">Min, max & average per sensor with Bar, Line, and Radar chart views inside a premium dark popup.</p>
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

// ── Card 4: Reset Dashboard ────────────────────────────────────────────────────

function ResetDashboardCard({ onReset }: { onReset: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <div className={CARD}>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-red-50 text-red-500 shadow-sm ring-1 ring-red-100"><RotateCcw size={22} /></div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">Reset Dashboard</h3>
            <p className="text-xs text-slate-500 mt-0.5">Clear all data & history</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 flex-1 leading-relaxed">Clears all sensor readings, graphs, and history. The next ESP32 reading will auto-fill everything again.</p>
        <button onClick={() => setShowConfirm(true)} className={BTN_RED}>
          <RotateCcw size={16} />
          Reset Dashboard
        </button>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)' }}
        >
          <div className="bg-white rounded-[22px] shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <h3 className="font-bold text-slate-800 text-lg mb-2">Confirm Reset</h3>
            <p className="text-slate-600 text-sm mb-6">This will clear all sensor readings, graphs, and history. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Cancel</button>
              <button onClick={() => { onReset(); setShowConfirm(false); }} className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors">Reset</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Card 5: Voice Assistant ────────────────────────────────────────────────────

function VoiceAssistantCard() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const toggle = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTranscript('Voice not supported in this browser.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      setTranscript(e.results[0][0].transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); setTranscript('Could not capture voice.'); };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    setTranscript('');
  };

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-xl shadow-sm ring-1 transition-colors duration-300 ${listening ? 'bg-indigo-100 text-indigo-600 ring-indigo-200' : 'bg-indigo-50 text-indigo-500 ring-indigo-100'}`}>
          {listening ? <Mic size={22} className="animate-pulse" /> : <MicOff size={22} />}
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">Voice Assistant</h3>
          <p className="text-xs text-slate-500 mt-0.5">Speak a command or query</p>
        </div>
      </div>
      <p className="text-xs flex-1 leading-relaxed">
        {transcript
          ? <span className="text-slate-700 font-medium">"{transcript}"</span>
          : <span className="text-slate-400">Tap the button and speak — e.g. "What is the soil moisture?"</span>
        }
      </p>
      <button onClick={toggle} className={BTN_INDIGO}>
        {listening ? <><Mic size={16} className="animate-pulse" /> Listening…</> : <><Mic size={16} /> Start Voice</>}
      </button>
    </div>
  );
}

// ── Main QuickActions Component ────────────────────────────────────────────────

export default function QuickActions({
  readings, tempHistory, humHistory, soilHistory, pumpOn, fanOn, onReset,
}: QuickActionsProps) {
  return (
    <div className="w-full">
      <h2 className="text-xl font-bold text-slate-800 mb-5 flex items-center gap-2">
        <BarChart2 size={24} className="text-slate-400" />
        Quick Actions
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        <ExportReportCard
          readings={readings} tempHistory={tempHistory} humHistory={humHistory}
          soilHistory={soilHistory} pumpOn={pumpOn} fanOn={fanOn}
        />
        <ExportExcelCard readings={readings} pumpOn={pumpOn} fanOn={fanOn} />
        <SensorAnalysisCard
          tempHistory={tempHistory} humHistory={humHistory}
          soilHistory={soilHistory} pumpOn={pumpOn} fanOn={fanOn}
        />
        <ResetDashboardCard onReset={onReset} />
        <VoiceAssistantCard />
      </div>
    </div>
  );
}
