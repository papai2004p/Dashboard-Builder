import React, { useState, useEffect } from 'react';
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
import * as XLSX from 'xlsx';
import { generatePDF } from '@/lib/generatePDF';
import type { Reading, TimelineEvent } from '@/lib/types';

// Re-export for App.tsx consumers
export type { Reading, TimelineEvent };

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

// ── Props ──────────────────────────────────────────────────────────────────────

interface QuickActionsProps {
  readings: Reading[];
  tempHistory: { time: number; value: number }[];
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn: boolean;
  mode: 'auto' | 'manual';
  onReset: () => void;
  timeline: TimelineEvent[];
  onOpenAnalysis?: () => void;
  analysisOpen?: boolean;
  onAnalysisClose?: () => void;
}

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

// ── Card 1: Export Report ──────────────────────────────────────────────────────

function ExportReportCard({
  readings, tempHistory, humHistory, soilHistory, pumpOn, fanOn, mode,
}: {
  readings: Reading[];
  tempHistory: { time: number; value: number }[];
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn: boolean;
  mode: 'auto' | 'manual';
}) {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      generatePDF({ readings, tempHistory, humHistory, soilHistory, pumpOn, fanOn, mode });
    } catch (e) {
      console.error('PDF generation error:', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 rounded-xl bg-red-50 text-red-500 shadow-sm ring-1 ring-red-100">
          <FileText size={22} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">Export Report</h3>
          <p className="text-xs text-slate-500 mt-0.5">Generate Professional PDF Report</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 flex-1 leading-relaxed">
        Full sensor data, trend charts, system status, statistics, history table and system analysis in a polished PDF matching the reference design.
      </p>
      <button onClick={handleExport} disabled={busy} className={BTN_RED_GRADIENT}>
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
    const rows = readings.map(r => [
      r.time, r.temp, r.humidity, r.soil, r.pitchStatus,
      r.pumpOn ? 'ON' : 'OFF', r.fanOn ? 'ON' : 'OFF', r.mode,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [14, 18, 14, 18, 14, 10, 10, 12].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Readings');
    const metaWs = XLSX.utils.aoa_to_sheet([
      ['Report Title', 'AI Smart Cricket Pitch Dashboard'],
      ['Export Date', new Date().toLocaleDateString()],
      ['Export Time', new Date().toLocaleTimeString()],
      ['Total Readings', readings.length],
    ]);
    metaWs['!cols'] = [{ wch: 16 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, metaWs, 'Info');
    XLSX.writeFile(wb, 'Cricket-Pitch-Readings.xlsx');
  }

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 rounded-xl bg-green-50 text-green-600 shadow-sm ring-1 ring-green-100">
          <FileSpreadsheet size={22} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">Export Excel</h3>
          <p className="text-xs text-slate-500 mt-0.5">Spreadsheet with all readings</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 flex-1 leading-relaxed">
        Temperature, humidity, soil moisture, pitch status, pump & fan columns with project info on a separate sheet.
      </p>
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
  humHistory: { time: number; value: number }[];
  soilHistory: { time: number; value: number }[];
  pumpOn: boolean;
  fanOn: boolean;
}) {
  const [chartTab, setChartTab] = useState<'bar' | 'trend' | 'radar'>('trend');

  const tStats = calcStats(tempHistory);
  const hStats = calcStats(humHistory);
  const sStats = calcStats(soilHistory);

  const currentTemp = tempHistory.length ? tempHistory[tempHistory.length - 1].value : 0;
  const currentHum  = humHistory.length  ? humHistory[humHistory.length - 1].value  : 0;
  const currentSoil = soilHistory.length ? soilHistory[soilHistory.length - 1].value : 42;

  const trendDiff = (h: { value: number }[]) => h.length < 2 ? 0 : h[h.length - 1].value - h[0].value;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const barData = tempHistory.slice(-10).map((t, i) => ({
    index: i + 1,
    temperature: t.value,
    humidity: humHistory.slice(-10)[i]?.value ?? 0,
    soil: soilHistory.slice(-10)[i]?.value ?? 0,
  }));

  const radarData = [
    { metric: 'Temp Performance', value: Math.min(100, Math.max(0, ((currentTemp - 28) / (35 - 28)) * 100)) },
    { metric: 'Humidity',         value: currentHum },
    { metric: 'Soil Moisture',    value: currentSoil },
    { metric: 'Pump Activity',    value: pumpOn ? 80 : 20 },
    { metric: 'Fan Activity',     value: fanOn  ? 80 : 20 },
    { metric: 'System Health',    value: Math.min(100, Math.max(0, 100 - Math.abs(currentSoil - 50) * 2)) },
  ];

  const statCards = [
    { label: 'Temperature',   icon: Thermometer, borderColor: 'border-orange-500', iconBg: 'bg-orange-500/20', iconText: 'text-orange-400', stats: tStats, unit: '°C', trend: trendDiff(tempHistory) },
    { label: 'Humidity',      icon: Droplets,    borderColor: 'border-blue-500',   iconBg: 'bg-blue-500/20',   iconText: 'text-blue-400',   stats: hStats, unit: '%',  trend: trendDiff(humHistory)  },
    { label: 'Soil Moisture', icon: Leaf,        borderColor: 'border-green-500',  iconBg: 'bg-green-500/20',  iconText: 'text-green-400',  stats: sStats, unit: '%',  trend: trendDiff(soilHistory) },
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

          <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {([
                { key: 'bar',   label: 'Bar Chart'  },
                { key: 'trend', label: 'Line Chart'  },
                { key: 'radar', label: 'Radar Chart' },
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

function SensorAnalysisCard(props: Pick<QuickActionsProps, 'tempHistory' | 'humHistory' | 'soilHistory' | 'pumpOn' | 'fanOn' | 'analysisOpen' | 'onAnalysisClose' | 'onOpenAnalysis'>) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.analysisOpen ?? internalOpen;
  const handleOpen = () => { props.onOpenAnalysis?.(); setInternalOpen(true); };
  const handleClose = () => { props.onAnalysisClose?.(); setInternalOpen(false); };

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
        <p className="text-xs text-slate-500 flex-1 leading-relaxed">
          Min, max & average per sensor with Bar, Line, and Radar chart views inside a premium dark popup.
        </p>
        <button onClick={handleOpen} className={BTN_SLATE}>
          <BarChart2 size={16} />
          Open Analysis
        </button>
      </div>

      {open && (
        <AnalysisModal
          onClose={handleClose}
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
        <p className="text-xs text-slate-500 flex-1 leading-relaxed">
          Clears all sensor readings, graphs, and history. The next ESP32 reading will auto-fill everything again.
        </p>
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

// ── Main QuickActions Component ────────────────────────────────────────────────

export default function QuickActions({
  readings, tempHistory, humHistory, soilHistory, pumpOn, fanOn, mode,
  onReset, onOpenAnalysis, analysisOpen, onAnalysisClose,
}: QuickActionsProps) {
  return (
    <div className="w-full">
      <h2 className="text-xl font-bold text-slate-800 mb-5 flex items-center gap-2">
        <BarChart2 size={24} className="text-slate-400" />
        Quick Actions
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <ExportReportCard
          readings={readings}
          tempHistory={tempHistory}
          humHistory={humHistory}
          soilHistory={soilHistory}
          pumpOn={pumpOn}
          fanOn={fanOn}
          mode={mode}
        />
        <ExportExcelCard readings={readings} pumpOn={pumpOn} fanOn={fanOn} />
        <SensorAnalysisCard
          tempHistory={tempHistory}
          humHistory={humHistory}
          soilHistory={soilHistory}
          pumpOn={pumpOn}
          fanOn={fanOn}
          onOpenAnalysis={onOpenAnalysis}
          analysisOpen={analysisOpen}
          onAnalysisClose={onAnalysisClose}
        />
        <ResetDashboardCard onReset={onReset} />
      </div>
    </div>
  );
}
