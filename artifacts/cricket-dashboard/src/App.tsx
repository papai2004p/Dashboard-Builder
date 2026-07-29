import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Thermometer,
  Droplets,
  Leaf,
  Wifi,
  Fan,
  Droplet,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  X,
  Clock,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Switch } from '@/components/ui/switch';
import QuickActions from '@/components/QuickActions';
import type { Reading, TimelineEvent } from '@/lib/types';
import VoiceAssistant from '@/components/VoiceAssistant';

// --- Types & Generators ---

type Notification = {
  id: number;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: string;
};

const generateHistory = (base: number, variance: number, count: number, min: number, max: number) => {
  let current = base;
  const history = [];
  for (let i = -count + 1; i <= 0; i++) {
    current = Math.max(min, Math.min(max, current + (Math.random() * variance * 2 - variance)));
    history.push({ time: i, value: Number(current.toFixed(1)) });
  }
  return history;
};

const getTrend = (history: any[]) => {
  if (history.length < 5) return 0;
  const current = history[history.length - 1].value;
  const old = history[history.length - 5].value;
  return Number((current - old).toFixed(1));
};

// --- Sub-components ---

function AnimatedNumber({ value, fractionDigits = 1 }: { value: number; fractionDigits?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isInitial, setIsInitial] = useState(true);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1500;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(easeOut * value);
      if (progress < 1) window.requestAnimationFrame(step);
      else setIsInitial(false);
    };
    window.requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    if (!isInitial) setDisplayValue(value);
  }, [value, isInitial]);

  return <>{displayValue.toFixed(fractionDigits)}</>;
}

const CARD = 'bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgb(0,0,0,0.06)] hover:shadow-[0_14px_44px_rgb(0,0,0,0.10)] hover:-translate-y-1 transition-all duration-300 rounded-[26px]';

const SensorCard = ({ title, icon: Icon, value, unit, status, statusColor, iconColor, fractionDigits = 1, trend }: any) => (
  <div className={`${CARD} p-8`}>
    <div className="flex justify-between items-start mb-5">
      <div className="flex items-center gap-3">
        <div className={`p-3.5 rounded-[18px] bg-white shadow-sm ${iconColor} ring-1 ring-slate-100/80`}>
          <Icon size={26} strokeWidth={2.5} />
        </div>
        <h3 className="font-bold text-slate-600 text-lg">{title}</h3>
      </div>
      <span className={`px-3.5 py-1.5 text-xs font-bold rounded-full ${statusColor} border shadow-sm`}>
        {status}
      </span>
    </div>
    <div className="flex items-end justify-between mt-8">
      <div className="flex items-baseline gap-1">
        <span className="text-[58px] leading-none font-extrabold text-slate-800 tracking-tighter">
          <AnimatedNumber value={value} fractionDigits={fractionDigits} />
        </span>
        <span className="text-2xl font-bold text-slate-400">{unit}</span>
      </div>
      {trend !== 0 && (
        <div className={`text-sm font-bold flex items-center gap-1 px-3 py-1.5 rounded-xl ${trend > 0 ? 'text-green-700 bg-green-50 border border-green-100' : 'text-orange-700 bg-orange-50 border border-orange-100'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
  </div>
);

const ChartCard = ({ title, data, dataKey, stroke, domain }: any) => {
  const [isInitial, setIsInitial] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setIsInitial(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`${CARD} p-7`}>
      <h3 className="font-semibold text-slate-700 mb-6 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: stroke }} />
        {title}
      </h3>
      <div className="h-[260px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="time" hide />
            <YAxis domain={domain} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} />
            <Tooltip
              contentStyle={{ borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgb(0 0 0 / 0.1)', fontWeight: 600 }}
              labelStyle={{ display: 'none' }}
              itemStyle={{ color: stroke }}
              cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={4}
              dot={false}
              activeDot={{ r: 6, fill: stroke, stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={isInitial}
              animationDuration={1500}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const ControlCard = ({ title, type, icon: Icon, isOn, onToggle, activeColor, mode }: any) => {
  const isBlue = activeColor === 'blue';
  const activeGlow = isBlue ? 'shadow-[0_8px_30px_rgba(37,99,235,0.2)] ring-1 ring-blue-500/30' : 'shadow-[0_8px_30px_rgba(22,163,74,0.2)] ring-1 ring-green-500/30';
  const activeBg = isBlue ? 'bg-blue-100 text-blue-600 shadow-[0_0_25px_rgba(37,99,235,0.4)]' : 'bg-green-100 text-green-600 shadow-[0_0_25px_rgba(22,163,74,0.4)]';
  const activeText = isBlue ? 'text-blue-600' : 'text-green-600';
  const grad = isBlue ? 'from-blue-400 to-transparent' : 'from-green-400 to-transparent';
  const pulseClass = type === 'pump' && isOn ? 'animate-[pumpPulse_2s_ease-in-out_infinite]' : '';
  const spinClass  = type === 'fan'  && isOn ? 'animate-[spin_2s_linear_infinite]' : '';

  return (
    <div className={`${CARD} p-6 sm:p-10 flex flex-col items-center justify-center gap-4 sm:gap-6 relative overflow-hidden ${isOn ? activeGlow : ''}`}>
      {isOn && (
        <div className={`absolute inset-0 opacity-[0.15] bg-gradient-to-br ${grad} pointer-events-none transition-opacity duration-700`} />
      )}
      <div className={`p-5 sm:p-7 rounded-[22px] transition-all duration-500 relative z-10 ${isOn ? activeBg : 'bg-slate-100 text-slate-400'}`}>
        <Icon size={40} className={`${pulseClass} ${spinClass} sm:!w-[50px] sm:!h-[50px]`} strokeWidth={2} />
      </div>
      <div className="text-center relative z-10">
        <h3 className="font-extrabold text-slate-800 text-xl sm:text-2xl">{title}</h3>
        <p className={`font-bold mt-1 sm:mt-1.5 text-base sm:text-lg uppercase tracking-wider ${isOn ? activeText : 'text-slate-400'}`}>
          {isOn ? `${type === 'pump' ? 'Pump' : 'Fan'} ON` : `${type === 'pump' ? 'Pump' : 'Fan'} OFF`}
        </p>
      </div>
      <div className="mt-1 sm:mt-2 relative z-10">
        <div className={mode === 'auto' ? 'pointer-events-none opacity-60' : ''}>
          <Switch
            checked={isOn}
            onCheckedChange={onToggle}
            className={isOn && !isBlue ? 'data-[state=checked]:bg-green-600' : ''}
          />
        </div>
      </div>
      <div className="h-7 flex items-center justify-center relative z-10">
        {mode === 'auto' ? (
          <span className="text-[11px] font-bold px-3 sm:px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wider">
            Controlled Automatically
          </span>
        ) : (
          <span className={`text-[11px] font-bold px-3 sm:px-3.5 py-1.5 rounded-full uppercase tracking-wider transition-opacity duration-300 ${isOn ? 'opacity-100 bg-slate-100 text-slate-500 border border-slate-200 shadow-sm' : 'opacity-0'}`}>
            Controlled Manually
          </span>
        )}
      </div>
    </div>
  );
};

// --- Reading History Section (standalone, below Smart Notifications) ---

function ReadingHistorySection({ readings, pumpOn, fanOn, mode }: { readings: Reading[]; pumpOn: boolean; fanOn: boolean; mode: string }) {
  const statusColor: Record<string, string> = {
    Dry:      'bg-orange-100 text-orange-700 border-orange-200',
    Balanced: 'bg-green-100  text-green-700  border-green-200',
    Wet:      'bg-blue-100   text-blue-700   border-blue-200',
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-bold text-slate-800 mb-5 flex items-center gap-2">
        <Clock size={24} className="text-slate-400" />
        Recent Reading History
      </h2>
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-6 pt-5 pb-2 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-800 text-base">Last 15 Sensor Readings</p>
            <p className="text-xs text-slate-500 mt-0.5">Newest first · Auto-updates every 2 s</p>
          </div>
          <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full">
            {readings.length} / 15
          </span>
        </div>

        <div className="overflow-auto" style={{ height: '296px' }}>
          {readings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <Clock size={32} strokeWidth={1.5} />
              <p className="font-semibold text-sm">No Data Yet</p>
              <p className="text-xs">Readings appear every 2 seconds</p>
            </div>
          ) : (
            <table className="w-full text-xs min-w-[700px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                  {['Time', 'Temp (°C)', 'Humidity (%)', 'Soil (%)', 'Pitch Status', 'Fan', 'Pump', 'Mode'].map((h) => (
                    <th key={h} className="py-3 px-4 font-semibold text-left first:rounded-tl-none last:rounded-tr-none whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readings.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-50 transition-all duration-300 ${
                      idx === 0
                        ? 'bg-blue-50/60 animate-[fadeInRow_0.4s_ease-out]'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-slate-50/40'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">{r.time}</td>
                    <td className="py-2.5 px-4 font-bold text-orange-600">{r.temp}</td>
                    <td className="py-2.5 px-4 font-bold text-blue-600">{r.humidity}</td>
                    <td className="py-2.5 px-4 font-bold text-green-700">{r.soil}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full border font-semibold ${statusColor[r.pitchStatus] ?? ''}`}>
                        {r.pitchStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${r.fanOn ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {r.fanOn ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${r.pumpOn ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {r.pumpOn ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${r.mode === 'auto' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {r.mode === 'auto' ? 'Auto' : 'Manual'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main App Component ---

export default function App() {
  const [systemMode, setSystemMode] = useState<'auto' | 'manual'>('auto');

  const [tempHistory, setTempHistory] = useState(() => generateHistory(31.2, 0.3, 30, 28, 35));
  const [humHistory,  setHumHistory]  = useState(() => generateHistory(68, 0.5, 30, 55, 80));
  const [soilHistory, setSoilHistory] = useState(() => generateHistory(42, 0.5, 30, 20, 80));

  const [pumpOn, setPumpOn] = useState(false);
  const [fanOn,  setFanOn]  = useState(false);
  const [manualPump, setManualPump] = useState(false);
  const [manualFan,  setManualFan]  = useState(false);

  const [readings,      setReadings]      = useState<Reading[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [now,           setNow]           = useState(new Date());
  const [timeline,      setTimeline]      = useState<TimelineEvent[]>([]);

  // Refs for setInterval closures
  const systemModeRef  = useRef(systemMode);
  const pumpOnRef      = useRef(pumpOn);
  const fanOnRef       = useRef(fanOn);
  const manualPumpRef  = useRef(manualPump);
  const manualFanRef   = useRef(manualFan);
  const readingIdRef   = useRef(0);
  const timelineIdRef  = useRef(0);
  const addNotifRef    = useRef<any>(null);
  const addEventRef    = useRef<(type: TimelineEvent['type'], message: string) => void>(() => {});

  useEffect(() => { systemModeRef.current = systemMode; }, [systemMode]);
  useEffect(() => { pumpOnRef.current = pumpOn; },       [pumpOn]);
  useEffect(() => { fanOnRef.current  = fanOn; },        [fanOn]);
  useEffect(() => { manualPumpRef.current = manualPump; }, [manualPump]);
  useEffect(() => { manualFanRef.current  = manualFan; },  [manualFan]);

  // Real-time clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Notifications setup
  useEffect(() => {
    let notifId = 0;
    const addNotif = (type: Notification['type'], title: string, message: string) => {
      const id = ++notifId;
      setNotifications(prev => {
        const n: Notification = { id, type, title, message, timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }) };
        return [n, ...prev].slice(0, 4);
      });
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
    };
    addNotifRef.current = addNotif;
    addNotif('success', 'Arduino Connected', 'Connection established successfully');
  }, []);

  // Timeline setup
  useEffect(() => {
    const addEvent = (type: TimelineEvent['type'], message: string) => {
      setTimeline(prev => [{
        id: ++timelineIdRef.current,
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        type,
        message,
      }, ...prev].slice(0, 20));
    };
    addEventRef.current = addEvent;
  }, []);

  // Simulation Interval
  useEffect(() => {
    let tick = 0;
    let prevCondition = 'Balanced';
    let prevPumpOn = false;
    let prevFanOn  = false;

    const id = setInterval(() => {
      tick++;
      let nextTemp = 31.2, nextHum = 68, nextSoil = 42;

      setTempHistory(prev => {
        const last = prev.length ? prev[prev.length - 1].value : 31.2;
        nextTemp = +(Math.max(28, Math.min(35, last + Math.random() * 0.6 - 0.3))).toFixed(1);
        return [...prev.slice(-29), { time: tick, value: nextTemp }];
      });
      setHumHistory(prev => {
        const last = prev.length ? prev[prev.length - 1].value : 68;
        nextHum = +(Math.max(55, Math.min(80, last + Math.random() - 0.5))).toFixed(1);
        return [...prev.slice(-29), { time: tick, value: nextHum }];
      });
      setSoilHistory(prev => {
        const last = prev.length ? prev[prev.length - 1].value : 42;
        let d = Math.random() - 0.5;
        if (pumpOnRef.current) d += 1.8;
        if (fanOnRef.current)  d -= 1.2;
        nextSoil = +(Math.max(20, Math.min(80, last + d))).toFixed(1);
        return [...prev.slice(-29), { time: tick, value: nextSoil }];
      });

      addEventRef.current('sensor', `Sensor updated — Temp:${nextTemp}°C H:${nextHum}% Soil:${nextSoil}%`);

      if (systemModeRef.current === 'auto') {
        const newCondition = nextSoil < 35 ? 'Dry' : nextSoil > 65 ? 'Wet' : 'Balanced';
        const nextPumpOn = nextSoil < 35;
        const nextFanOn  = nextSoil > 65;

        if (nextPumpOn !== prevPumpOn) {
          addEventRef.current('pump', nextPumpOn ? 'Water Pump turned ON' : 'Water Pump turned OFF');
          prevPumpOn = nextPumpOn;
        }
        if (nextFanOn !== prevFanOn) {
          addEventRef.current('fan', nextFanOn ? 'Drying Fan turned ON' : 'Drying Fan turned OFF');
          prevFanOn = nextFanOn;
        }

        setPumpOn(nextPumpOn);
        setFanOn(nextFanOn);

        if (newCondition !== prevCondition) {
          if (newCondition === 'Dry')      addNotifRef.current?.('warning', 'Dry Soil Detected',   'Water Pump activated automatically');
          else if (newCondition === 'Wet') addNotifRef.current?.('info',    'Wet Soil Detected',    'Drying Fan activated automatically');
          else                             addNotifRef.current?.('success', 'Balanced Moisture',    'No action required — system stable');
          prevCondition = newCondition;
        }
      } else {
        setPumpOn(manualPumpRef.current);
        setFanOn(manualFanRef.current);
      }

      setReadings(prev => {
        const pitchStatus = nextSoil < 35 ? 'Dry' : nextSoil > 65 ? 'Wet' : 'Balanced';
        const reading: Reading = {
          id:          ++readingIdRef.current,
          time:        new Date().toLocaleTimeString('en-US', { hour12: false }),
          temp:        nextTemp,
          humidity:    nextHum,
          soil:        nextSoil,
          pitchStatus,
          pumpOn:      systemModeRef.current === 'auto' ? nextSoil < 35 : manualPumpRef.current,
          fanOn:       systemModeRef.current === 'auto' ? nextSoil > 65  : manualFanRef.current,
          mode:        systemModeRef.current,
        };
        return [reading, ...prev].slice(0, 15);
      });
    }, 2000);

    return () => clearInterval(id);
  }, []);

  // Handlers
  const handleModeChange = (mode: 'auto' | 'manual') => {
    if (mode === systemMode) return;
    setSystemMode(mode);
    if (mode === 'manual') {
      addNotifRef.current?.('info',    'Manual Mode Enabled',    'Automatic control paused');
      addEventRef.current('mode', 'Manual Mode Enabled');
    } else {
      addNotifRef.current?.('success', 'Automatic Mode Enabled', 'Arduino is now controlling the system');
      addEventRef.current('mode', 'Automatic Mode Enabled');
    }
  };

  const handlePumpToggle = (val: boolean) => {
    if (systemMode === 'auto') return;
    setManualPump(val);
    setPumpOn(val);
    addEventRef.current('pump', val ? 'Water Pump turned ON' : 'Water Pump turned OFF');
  };

  const handleFanToggle = (val: boolean) => {
    if (systemMode === 'auto') return;
    setManualFan(val);
    setFanOn(val);
    addEventRef.current('fan', val ? 'Drying Fan turned ON' : 'Drying Fan turned OFF');
  };

  const handleReset = () => {
    setTempHistory([]);
    setHumHistory([]);
    setSoilHistory([]);
    setReadings([]);
    addEventRef.current('sensor', 'Dashboard Reset — Data Cleared');
  };

  const removeNotif = (id: number) => setNotifications(prev => prev.filter(n => n.id !== id));

  const [analysisOpen, setAnalysisOpen] = useState(false);

  // Derived values
  const currentTemp  = tempHistory.length  ? tempHistory[tempHistory.length - 1].value   : 0;
  const currentHum   = humHistory.length   ? humHistory[humHistory.length - 1].value     : 0;
  const currentSoil  = soilHistory.length  ? soilHistory[soilHistory.length - 1].value   : 42;
  const currentCondition = currentSoil < 35 ? 'Dry' : currentSoil > 65 ? 'Wet' : 'Balanced';

  const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const conditions = ['Dry', 'Balanced', 'Wet'] as const;
  const conditionColors = {
    Dry:      { active: 'bg-orange-100 text-orange-700 border-orange-200 shadow-md', inactive: 'bg-slate-50 text-slate-400 border-transparent', dot: 'bg-orange-500' },
    Balanced: { active: 'bg-green-100  text-green-700  border-green-200  shadow-md', inactive: 'bg-slate-50 text-slate-400 border-transparent', dot: 'bg-green-500'  },
    Wet:      { active: 'bg-blue-100   text-blue-700   border-blue-200   shadow-md', inactive: 'bg-slate-50 text-slate-400 border-transparent', dot: 'bg-blue-500'   },
  };
  const glowColors = {
    Dry:      'from-orange-400 to-transparent',
    Balanced: 'from-green-400  to-transparent',
    Wet:      'from-blue-400   to-transparent',
  };

  const notifStyles = {
    warning: { border: 'border-l-orange-500', icon: AlertTriangle, iconColor: 'text-orange-500', bg: 'bg-orange-50' },
    info:    { border: 'border-l-blue-500',   icon: Info,          iconColor: 'text-blue-500',   bg: 'bg-blue-50'   },
    success: { border: 'border-l-green-500',  icon: CheckCircle,   iconColor: 'text-green-500',  bg: 'bg-green-50'  },
    error:   { border: 'border-l-red-500',    icon: XCircle,       iconColor: 'text-red-500',    bg: 'bg-red-50'    },
  };

  return (
    <>
    <div
      className="min-h-[100dvh] w-full pb-16 selection:bg-blue-200 selection:text-blue-900 relative overflow-hidden"
      style={{
        backgroundImage: 'url(/cricket-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-12 relative z-10 pt-4 sm:pt-6 space-y-4 sm:space-y-5">

        {/* ── 1. HEADER ── */}
        <header className={`${CARD} px-4 sm:px-8 py-4 sm:py-5 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 relative`}>
          <div className="flex items-center gap-3 sm:gap-4 w-full md:w-auto">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 text-white p-2 sm:p-2.5 flex-shrink-0">
              <Activity size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight leading-tight">AI Smart Cricket Pitch Dashboard</h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">Real-Time Monitoring & Automation</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 bg-slate-50/80 rounded-2xl p-2 sm:p-3 border border-slate-200/50 w-full md:w-auto">
            <div className="flex items-center gap-2 px-1 sm:px-2">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.7)]" />
              <span className="text-xs sm:text-sm font-bold text-green-700 flex items-center gap-1">
                Arduino Connected <Wifi size={13} strokeWidth={2.5} />
              </span>
            </div>
            <div className="hidden sm:block w-px h-6 bg-slate-300" />
            <div className="text-xs sm:text-sm font-bold text-slate-700 font-mono tracking-tight flex gap-1.5 sm:gap-2 px-1 sm:px-2">
              <span>{dateString}</span>
              <span className="text-slate-300">|</span>
              <span className="text-blue-600">{timeString}</span>
            </div>
          </div>
        </header>

        {/* ── 2. SENSOR CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SensorCard
            title="Temperature" icon={Thermometer} value={currentTemp} unit="°C"
            status={currentTemp > 34 ? 'High' : currentTemp < 29 ? 'Low' : 'Normal'}
            statusColor={currentTemp > 34 ? 'text-orange-700 bg-orange-100 border-orange-200' : currentTemp < 29 ? 'text-blue-700 bg-blue-100 border-blue-200' : 'text-green-700 bg-green-100 border-green-200'}
            iconColor="text-orange-500" trend={getTrend(tempHistory)}
          />
          <SensorCard
            title="Humidity" icon={Droplets} value={currentHum} unit="%"
            status={currentHum > 75 ? 'High' : currentHum < 60 ? 'Low' : 'Optimal'}
            statusColor={currentHum > 75 ? 'text-orange-700 bg-orange-100 border-orange-200' : currentHum < 60 ? 'text-orange-700 bg-orange-100 border-orange-200' : 'text-blue-700 bg-blue-100 border-blue-200'}
            iconColor="text-blue-500" trend={getTrend(humHistory)}
          />
          <SensorCard
            title="Soil Moisture" icon={Leaf} value={currentSoil} unit="%"
            status={currentCondition}
            statusColor={currentCondition === 'Dry' ? 'text-orange-700 bg-orange-100 border-orange-200' : currentCondition === 'Wet' ? 'text-blue-700 bg-blue-100 border-blue-200' : 'text-green-700 bg-green-100 border-green-200'}
            iconColor="text-green-500" trend={getTrend(soilHistory)}
          />
        </div>

        {/* ── 3. TREND CHARTS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ChartCard title="Temperature Trend"  data={tempHistory}  dataKey="value" stroke="#2563EB" domain={[27, 36]} />
          <ChartCard title="Humidity Trend"     data={humHistory}   dataKey="value" stroke="#16A34A" domain={[50, 85]} />
          <ChartCard title="Soil Moisture Trend" data={soilHistory} dataKey="value" stroke="#D97706" domain={[15, 85]} />
        </div>

        {/* ── 4. PITCH STATUS + SYSTEM MODE + LIVE STATUS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Pitch Condition */}
          <div className={`${CARD} p-7 relative overflow-hidden flex flex-col items-center justify-center min-h-[190px]`}>
            <div className={`absolute inset-0 opacity-[0.15] bg-gradient-to-br ${glowColors[currentCondition]} pointer-events-none transition-colors duration-1000`} />
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6 relative z-10">Pitch Condition</h4>
            <div className="flex gap-1.5 sm:gap-2 justify-center w-full relative z-10">
              {conditions.map(c => {
                const isActive = currentCondition === c;
                const style = isActive ? conditionColors[c].active : conditionColors[c].inactive;
                return (
                  <div key={c} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full border transition-all duration-500 ${style}`}>
                    {isActive && <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse ${conditionColors[c].dot}`} />}
                    <span className="text-xs sm:text-sm font-bold">{c}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-6 font-medium relative z-10">Driven by Arduino soil moisture sensor</p>
          </div>

          {/* System Mode */}
          <div className={`${CARD} p-7 flex flex-col justify-center items-center text-center min-h-[190px]`}>
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">System Mode</h4>
            <div className="relative flex p-1.5 bg-slate-100/80 border border-slate-200/60 rounded-2xl w-full max-w-[260px]">
              <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${systemMode === 'auto' ? 'left-1.5' : 'left-[calc(50%+4.5px)]'}`} />
              <button className={`flex-1 relative z-10 py-2.5 text-sm font-bold transition-colors ${systemMode === 'auto' ? 'text-blue-700' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => handleModeChange('auto')}>Automatic</button>
              <button className={`flex-1 relative z-10 py-2.5 text-sm font-bold transition-colors ${systemMode === 'manual' ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => handleModeChange('manual')}>Manual</button>
            </div>
            <p className="text-xs text-slate-400 mt-5 font-medium">
              {systemMode === 'auto' ? 'Arduino controlling pump & fan' : 'User controlling pump & fan'}
            </p>
          </div>

          {/* Live System Status */}
          <div className={`${CARD} p-7 flex flex-col justify-between min-h-[190px]`}>
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 text-center">Live System Status</h4>
            <div className="space-y-2.5">
              {[
                { label: 'Arduino',    color: 'bg-green-500', status: 'Connected', statusColor: 'text-green-600' },
                { label: 'USB Serial', color: 'bg-green-500', status: 'Connected', statusColor: 'text-green-600' },
                { label: 'Database',               color: 'bg-green-500', status: 'Connected', statusColor: 'text-green-600' },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 ${item.color} rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]`} />
                    <span className="text-xs font-semibold text-slate-600">{item.label}</span>
                  </div>
                  <span className={`text-xs font-bold ${item.statusColor}`}>{item.status}</span>
                </div>
              ))}
              <div className="flex justify-between items-center bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <span className="text-xs font-semibold text-slate-600">Last Update</span>
                </div>
                <span className="text-xs font-bold text-blue-700 font-mono tracking-tight">{timeString}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-4 font-bold text-center uppercase tracking-wider">
              Data Refresh: Every 2 Seconds
            </p>
          </div>
        </div>

        {/* ── 5. CONTROL CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ControlCard title="Water Pump" type="pump" icon={Droplet} isOn={pumpOn} onToggle={handlePumpToggle} activeColor="blue"  mode={systemMode} />
          <ControlCard title="Drying Fan"  type="fan"  icon={Fan}    isOn={fanOn}  onToggle={handleFanToggle}  activeColor="green" mode={systemMode} />
        </div>

        {/* ── 6. SMART NOTIFICATIONS ── */}
        <div className="w-full">
          <h2 className="text-xl font-bold text-slate-800 mb-5 flex items-center gap-2">
            <Info size={24} className="text-slate-400" />
            Smart Notifications
          </h2>
          <div className="flex flex-col gap-3">
            {notifications.length === 0 ? (
              <div className={`${CARD} p-8 flex flex-col items-center justify-center text-slate-400 gap-3 min-h-[140px]`}>
                <CheckCircle size={32} className="text-green-400/60" strokeWidth={1.5} />
                <span className="font-semibold text-sm tracking-wide uppercase">All systems normal</span>
              </div>
            ) : notifications.map(notif => {
              const s = notifStyles[notif.type];
              const Icon = s.icon;
              return (
                <div key={notif.id} className={`bg-white/90 backdrop-blur-xl border-l-4 ${s.border} border-y border-y-white/60 border-r border-r-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] rounded-xl p-3 sm:p-4 flex items-start justify-between gap-3 animate-[slideInNotif_0.35s_ease-out]`}>
                  <div className="flex gap-3 sm:gap-4 items-start min-w-0">
                    <div className={`p-2 rounded-lg ${s.bg} ${s.iconColor} shrink-0`}><Icon size={18} /></div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-800 text-sm">{notif.title}</h4>
                      <p className="text-slate-500 text-xs sm:text-sm mt-0.5 leading-snug">{notif.message}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className="hidden sm:block text-xs font-semibold text-slate-400 font-mono">{notif.timestamp}</span>
                    <button onClick={() => removeNotif(notif.id)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 bg-slate-50 hover:bg-slate-100 rounded-md">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 7. RECENT READING HISTORY (standalone section) ── */}
        <ReadingHistorySection readings={readings} pumpOn={pumpOn} fanOn={fanOn} mode={systemMode} />

        {/* ── 8. QUICK ACTIONS ── */}
        <QuickActions
          readings={readings}
          tempHistory={tempHistory}
          humHistory={humHistory}
          soilHistory={soilHistory}
          pumpOn={pumpOn}
          fanOn={fanOn}
          mode={systemMode}
          onReset={handleReset}
          timeline={timeline}
          onOpenAnalysis={() => setAnalysisOpen(true)}
          analysisOpen={analysisOpen}
          onAnalysisClose={() => setAnalysisOpen(false)}
        />

        {/* ── 9. FOOTER ── */}
        <footer className="pt-8 pb-4 text-center flex flex-col gap-1.5">
          <p className="text-base font-extrabold text-slate-700">AI Smart Cricket Pitch Dashboard</p>
          <p className="text-sm font-semibold text-slate-500">Class XII Informatics Practices Project</p>
          <p className="text-xs font-semibold text-slate-800 mt-2">Auto Refresh Every 2 Seconds &nbsp;·&nbsp; Built for Exhibition</p>
        </footer>

      </div>
    </div>

    {/* ── AI Voice Assistant (global, floating) ── */}
    <VoiceAssistant
      readings={readings}
      tempHistory={tempHistory}
      humHistory={humHistory}
      soilHistory={soilHistory}
      pumpOn={pumpOn}
      fanOn={fanOn}
      systemMode={systemMode}
      onPumpToggle={handlePumpToggle}
      onFanToggle={handleFanToggle}
      onModeChange={handleModeChange}
      onReset={handleReset}
      onOpenAnalysis={() => setAnalysisOpen(true)}
      onExportExcel={() => {
        // VoiceAssistant handles excel export internally via its own xlsx import
      }}
    />
    </>
  );
}
