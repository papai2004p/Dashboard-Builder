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
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
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

interface QuickActionsProps {
  readings: Reading[];
  tempHistory: { time: number; value: number }[];
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn: boolean;
  onReset: () => void;
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

// ── Card 2 : Download PDF ────────────────────────────────────────────────────

function DownloadPDFCard({
  readings,
  tempHistory,
  humHistory,
  soilHistory,
  pumpOn,
  fanOn,
}: Omit<QuickActionsProps, 'onReset'>) {
  const [busy, setBusy] = useState(false);

  function generatePDF() {
    setBusy(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210;
      const M = 15; // margin
      const now = new Date();

      const tStats = calcStats(tempHistory);
      const hStats = calcStats(humHistory);
      const sStats = calcStats(soilHistory);
      const lastSoil = soilHistory.length ? soilHistory[soilHistory.length - 1].value : 42;

      // ── HEADER ────────────────────────────────────────────────
      doc.setFillColor(29, 78, 216); // blue-700
      doc.rect(0, 0, W, 52, 'F');

      // green accent bar
      doc.setFillColor(21, 128, 61); // green-700
      doc.rect(0, 48, W, 4, 'F');

      // white left glow
      doc.setFillColor(255, 255, 255);
      doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
      doc.rect(0, 0, 80, 52, 'F');
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('AI Smart Cricket Pitch Report', M, 18);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(186, 230, 253);
      doc.text('School Project  ·  Class XII Informatics Practices', M, 28);

      doc.setFontSize(9);
      doc.setTextColor(147, 197, 253);
      doc.text(
        `Generated: ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}  at  ${now.toLocaleTimeString('en-US', { hour12: false })}`,
        M,
        38,
      );

      let y = 62;

      // ── SUMMARY SECTION ───────────────────────────────────────
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Dashboard Summary', M, y);
      y += 6;

      const summaryItems = [
        { label: 'Avg Temperature', value: `${tStats.avg} °C`, accent: [37, 99, 235] as [number, number, number] },
        { label: 'Avg Humidity', value: `${hStats.avg} %`, accent: [37, 99, 235] as [number, number, number] },
        { label: 'Avg Soil Moisture', value: `${sStats.avg} %`, accent: [22, 163, 74] as [number, number, number] },
        { label: 'Pitch Condition', value: pitchLabel(lastSoil), accent: [22, 163, 74] as [number, number, number] },
        { label: 'System Mode', value: 'Automatic', accent: [37, 99, 235] as [number, number, number] },
        { label: 'Water Pump', value: pumpOn ? 'ON' : 'OFF', accent: pumpOn ? ([37, 99, 235] as [number, number, number]) : ([100, 116, 139] as [number, number, number]) },
        { label: 'Drying Fan', value: fanOn ? 'ON' : 'OFF', accent: fanOn ? ([22, 163, 74] as [number, number, number]) : ([100, 116, 139] as [number, number, number]) },
      ];

      const cardW = (W - M * 2 - 10) / 4;
      const cardH = 22;
      const cardGap = 3;

      [0, 1].forEach((row) => {
        const rowItems = summaryItems.slice(row === 0 ? 0 : 4, row === 0 ? 4 : 7);
        const extraX = row === 1 ? (W - M * 2 - rowItems.length * (cardW + cardGap) + cardGap) / 2 : 0;
        rowItems.forEach((item, col) => {
          const cx = M + extraX + col * (cardW + cardGap);
          const cy = y + row * (cardH + cardGap);
          doc.setFillColor(239, 246, 255);
          doc.rect(cx, cy, cardW, cardH, 'F');
          doc.setDrawColor(219, 234, 254);
          doc.rect(cx, cy, cardW, cardH, 'S');
          // accent top bar
          doc.setFillColor(...item.accent);
          doc.rect(cx, cy, cardW, 2, 'F');
          doc.setTextColor(100, 116, 139);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text(item.label, cx + cardW / 2, cy + 9, { align: 'center' });
          doc.setTextColor(...item.accent);
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text(item.value, cx + cardW / 2, cy + 18, { align: 'center' });
        });
      });

      y += 2 * (cardH + cardGap) + 8;

      // ── READINGS TABLE ─────────────────────────────────────────
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Latest Sensor Readings', M, y);
      y += 6;

      const tableW = W - M * 2;
      const colW = [38, 35, 35, 35, 37];
      const headers = ['Time', 'Temp (°C)', 'Humidity (%)', 'Soil (%)', 'Pitch Status'];
      const rowH = 8;

      // header row
      doc.setFillColor(37, 99, 235);
      doc.rect(M, y, tableW, rowH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      let cx = M;
      headers.forEach((h, i) => {
        doc.text(h, cx + colW[i] / 2, y + 5.5, { align: 'center' });
        cx += colW[i];
      });
      y += rowH;

      // data rows
      const tableReadings = readings.slice(0, 15);
      tableReadings.forEach((r, idx) => {
        const even = idx % 2 === 0;
        doc.setFillColor(even ? 248 : 255, even ? 250 : 255, even ? 252 : 255);
        doc.rect(M, y, tableW, rowH, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.line(M, y + rowH, M + tableW, y + rowH);

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const cells = [r.time, `${r.temp}`, `${r.humidity}`, `${r.soil}`, r.pitchStatus];
        cx = M;
        cells.forEach((cell, i) => {
          doc.text(cell, cx + colW[i] / 2, y + 5.5, { align: 'center' });
          cx += colW[i];
        });
        y += rowH;
      });

      if (readings.length === 0) {
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(9);
        doc.text('No readings recorded yet.', M + tableW / 2, y + 6, { align: 'center' });
        y += 14;
      }

      // ── FOOTER ────────────────────────────────────────────────
      doc.setFillColor(241, 245, 249);
      doc.rect(0, 285, W, 12, 'F');
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('Generated automatically by AI Smart Cricket Pitch Dashboard  ·  Class XII IP Exhibition', W / 2, 293, { align: 'center' });

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
          <h3 className="font-bold text-slate-800 text-base">Download PDF</h3>
          <p className="text-xs text-slate-500 mt-0.5">Professional one-page report</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 mb-5">
        {[
          'Header with school details & date',
          '7 summary cards (averages, status, controls)',
          'Table of latest 15 readings',
          'Blue & green professional design',
        ].map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
            {item}
          </div>
        ))}
      </div>

      <button onClick={generatePDF} disabled={busy} className={BTN_BLUE}>
        <FileText size={16} />
        {busy ? 'Generating…' : 'Generate PDF'}
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

    // column widths
    ws['!cols'] = [16, 18, 14, 18, 14, 14, 12, 12].map((w) => ({ wch: w }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Readings');

    // metadata sheet
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

// ── Card 4 : View Analysis (modal) ────────────────────────────────────────────

function AnalysisModal({
  onClose,
  tempHistory,
  humHistory,
  soilHistory,
}: {
  onClose: () => void;
  tempHistory: { time: number; value: number }[];
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
}) {
  const tStats = calcStats(tempHistory);
  const hStats = calcStats(humHistory);
  const sStats = calcStats(soilHistory);
  const lastSoil = soilHistory.length ? soilHistory[soilHistory.length - 1].value : 42;

  const statBadge = (label: string, val: string | number, color: string) => (
    <div className={`rounded-xl px-4 py-3 text-center ${color}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-1">{label}</p>
      <p className="text-xl font-extrabold">{val}</p>
    </div>
  );

  const trendIcon = (max: number, min: number) => {
    const diff = max - min;
    if (diff > 4) return <TrendingUp size={14} className="text-orange-500" />;
    if (diff < 1) return <Minus size={14} className="text-slate-400" />;
    return <TrendingDown size={14} className="text-blue-500" />;
  };

  const pitchColors: Record<string, string> = {
    Dry: 'bg-orange-100 text-orange-700 border-orange-300',
    Balanced: 'bg-green-100 text-green-700 border-green-300',
    Wet: 'bg-blue-100 text-blue-700 border-blue-300',
  };
  const condition = pitchLabel(lastSoil);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* modal header */}
        <div className="sticky top-0 bg-white rounded-t-[24px] border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <BarChart2 size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Sensor Analysis</h2>
              <p className="text-xs text-slate-500">Last 30 data points · Updated every 2 s</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* overall pitch condition */}
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Overall Pitch Condition</h3>
            <span className={`px-4 py-1.5 rounded-full border font-bold text-sm ${pitchColors[condition]}`}>
              {condition}
            </span>
          </div>

          {/* Temperature */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Thermometer size={16} className="text-orange-500" />
              <h3 className="font-bold text-slate-800">Temperature Trend</h3>
              {trendIcon(tStats.max, tStats.min)}
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tempHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[27, 36]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: number) => [`${v}°C`, 'Temperature']}
                    labelFormatter={() => ''}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#2563EB"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={800}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {statBadge('Maximum', `${tStats.max}°C`, 'bg-orange-50 text-orange-700')}
              {statBadge('Average', `${tStats.avg}°C`, 'bg-blue-50 text-blue-700')}
              {statBadge('Minimum', `${tStats.min}°C`, 'bg-slate-50 text-slate-700')}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* Humidity */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Droplets size={16} className="text-blue-500" />
              <h3 className="font-bold text-slate-800">Humidity Trend</h3>
              {trendIcon(hStats.max, hStats.min)}
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={humHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[50, 85]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`, 'Humidity']}
                    labelFormatter={() => ''}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#16A34A"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, fill: '#16A34A', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={800}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {statBadge('Maximum', `${hStats.max}%`, 'bg-blue-50 text-blue-700')}
              {statBadge('Average', `${hStats.avg}%`, 'bg-green-50 text-green-700')}
              {statBadge('Minimum', `${hStats.min}%`, 'bg-slate-50 text-slate-700')}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* Soil Moisture */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Leaf size={16} className="text-green-600" />
              <h3 className="font-bold text-slate-800">Soil Moisture Trend</h3>
              {trendIcon(sStats.max, sStats.min)}
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={soilHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[15, 85]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`, 'Soil Moisture']}
                    labelFormatter={() => ''}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#D97706"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, fill: '#D97706', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={800}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {statBadge('Maximum', `${sStats.max}%`, 'bg-amber-50 text-amber-700')}
              {statBadge('Average', `${sStats.avg}%`, 'bg-green-50 text-green-700')}
              {statBadge('Minimum', `${sStats.min}%`, 'bg-slate-50 text-slate-700')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewAnalysisCard(props: Pick<QuickActionsProps, 'tempHistory' | 'humHistory' | 'soilHistory'>) {
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
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Reset All Data?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will clear all graphs, sensor history, and reading records.
              The dashboard will wait for the next ESP32 reading to start again.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-colors text-sm shadow-lg shadow-red-500/25"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function QuickActions(props: QuickActionsProps) {
  return (
    <section>
      {/* Section heading */}
      <div className="flex items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Quick Actions</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage data, export reports, and analyse sensor trends</p>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
      </div>

      {/* 5-card responsive grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* History card spans full width on xl so it has room for the table */}
        <div className="md:col-span-2 xl:col-span-3">
          <ReadingHistoryCard readings={props.readings} />
        </div>

        <DownloadPDFCard
          readings={props.readings}
          tempHistory={props.tempHistory}
          humHistory={props.humHistory}
          soilHistory={props.soilHistory}
          pumpOn={props.pumpOn}
          fanOn={props.fanOn}
        />

        <ExportExcelCard
          readings={props.readings}
          pumpOn={props.pumpOn}
          fanOn={props.fanOn}
        />

        <ViewAnalysisCard
          tempHistory={props.tempHistory}
          humHistory={props.humHistory}
          soilHistory={props.soilHistory}
        />

        <div className="md:col-span-2 xl:col-span-3">
          <ResetDashboardCard onReset={props.onReset} />
        </div>
      </div>
    </section>
  );
}
