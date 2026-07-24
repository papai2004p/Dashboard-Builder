import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Thermometer,
  Droplets,
  Leaf,
  Wifi,
  Fan,
  Droplet
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Switch } from '@/components/ui/switch';
import QuickActions, { type Reading } from '@/components/QuickActions';

// --- Simulation Logic ---

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

function AnimatedNumber({ value, fractionDigits = 1 }: { value: number, fractionDigits?: number }) {
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
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setIsInitial(false);
      }
    };
    window.requestAnimationFrame(step);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only

  useEffect(() => {
    if (!isInitial) {
       setDisplayValue(value);
    }
  }, [value, isInitial]);

  return <>{displayValue.toFixed(fractionDigits)}</>;
}

const SensorCard = ({ title, icon: Icon, value, unit, status, statusColor, iconColor, fractionDigits = 1, trend }: any) => {
  return (
    <div className="relative overflow-hidden group bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 rounded-2xl p-6">
      <div className="flex justify-between items-start mb-2">
         <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl bg-white shadow-sm ${iconColor} ring-1 ring-slate-100/50`}>
               <Icon size={22} strokeWidth={2.5} />
            </div>
            <h3 className="font-semibold text-slate-600">{title}</h3>
         </div>
         <span className={`px-3 py-1 text-xs font-bold rounded-full ${statusColor} border shadow-sm`}>
           {status}
         </span>
      </div>
      <div className="flex items-end justify-between mt-6">
        <div className="flex items-baseline gap-1">
           <span className="text-5xl font-extrabold text-slate-800 tracking-tighter">
              <AnimatedNumber value={value} fractionDigits={fractionDigits} />
           </span>
           <span className="text-xl font-bold text-slate-500">{unit}</span>
        </div>
        {trend !== 0 && (
          <div className={`text-sm font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg ${trend > 0 ? 'text-green-700 bg-green-50/80' : 'text-orange-700 bg-orange-50/80'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
}

const ChartCard = ({ title, data, dataKey, stroke, domain }: any) => {
  const [isInitial, setIsInitial] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setIsInitial(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 rounded-2xl p-6">
       <h3 className="font-semibold text-slate-700 mb-6 flex items-center gap-2">
         <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: stroke }} />
         {title}
       </h3>
       <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
             <LineChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="time" hide />
                <YAxis domain={domain} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 500}} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgb(0 0 0 / 0.1)', fontWeight: 600 }}
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
}

const StatusCard = ({ title, children }: any) => {
   return (
     <div className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-300 rounded-2xl p-5 flex flex-col justify-center min-h-[120px]">
        <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{title}</h4>
        <div className="mt-2">
           {children}
        </div>
     </div>
   );
}

const ControlCard = ({ title, icon: Icon, isOn, onToggle, activeColor, activeText, inactiveText }: any) => {
   const isBlue = activeColor === 'blue';
   return (
     <div className={`bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-300 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden ${isOn ? (isBlue ? 'shadow-[0_8px_30px_rgba(37,99,235,0.15)] ring-1 ring-blue-500/20' : 'shadow-[0_8px_30px_rgba(22,163,74,0.15)] ring-1 ring-green-500/20') : ''}`}>
       {isOn && (
         <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${isBlue ? 'from-blue-400 to-transparent' : 'from-green-400 to-transparent'} pointer-events-none`} />
       )}
       <div className={`p-5 rounded-2xl ${isOn ? (isBlue ? 'bg-blue-100 text-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.4)]' : 'bg-green-100 text-green-600 shadow-[0_0_20px_rgba(22,163,74,0.4)]') : 'bg-slate-100 text-slate-400'} transition-all duration-500 relative z-10`}>
          <Icon size={36} className={isOn && !isBlue ? 'animate-[spin_2s_linear_infinite]' : ''} />
       </div>
       <div className="text-center relative z-10">
          <h3 className="font-bold text-slate-800 text-xl">{title}</h3>
          <p className={`font-semibold mt-1 ${isOn ? (isBlue ? 'text-blue-600' : 'text-green-600') : 'text-slate-500'}`}>
            {isOn ? activeText : inactiveText}
          </p>
       </div>
       <div className="mt-2 relative z-10">
         <Switch 
           checked={isOn} 
           onCheckedChange={onToggle} 
           className={isOn && !isBlue ? 'data-[state=checked]:bg-green-600' : ''}
         />
       </div>
       <p className="text-xs text-slate-400 font-medium relative z-10 uppercase tracking-wider">Manual Override</p>
     </div>
   );
}


// --- Main App Component ---

export default function App() {
  const [tempHistory, setTempHistory] = useState(() => generateHistory(31.2, 0.3, 30, 28, 35));
  const [humHistory, setHumHistory] = useState(() => generateHistory(68, 0.5, 30, 55, 80));
  const [soilHistory, setSoilHistory] = useState(() => generateHistory(42, 0.5, 30, 20, 80));

  const [pumpOn, setPumpOn] = useState(false);
  const [fanOn, setFanOn] = useState(false);
  const [now, setNow] = useState(new Date());

  // Reading history — latest 15 readings, newest first
  const [readings, setReadings] = useState<Reading[]>([]);
  const readingIdRef = useRef(0);

  // Real-time clock tick
  useEffect(() => {
    const timeInterval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timeInterval);
  }, []);

  // Sensor data simulation tick
  useEffect(() => {
    let tick = 0;
    const dataInterval = setInterval(() => {
      tick++;

      let nextTemp = 31.2, nextHum = 68, nextSoil = 42;

      setTempHistory(prev => {
        const last = prev.length ? prev[prev.length - 1].value : 31.2;
        nextTemp = Number(Math.max(28, Math.min(35, last + (Math.random() * 0.6 - 0.3))).toFixed(1));
        const arr = [...prev.slice(Math.max(prev.length - 29, 0)), { time: tick, value: nextTemp }];
        return arr;
      });
      setHumHistory(prev => {
        const last = prev.length ? prev[prev.length - 1].value : 68;
        nextHum = Number(Math.max(55, Math.min(80, last + (Math.random() * 1.0 - 0.5))).toFixed(1));
        return [...prev.slice(Math.max(prev.length - 29, 0)), { time: tick, value: nextHum }];
      });
      setSoilHistory(prev => {
        const last = prev.length ? prev[prev.length - 1].value : 42;
        let delta = Math.random() * 1.0 - 0.5;
        if (pumpOn) delta += 1.8;
        if (fanOn) delta -= 1.2;
        nextSoil = Number(Math.max(20, Math.min(80, last + delta)).toFixed(1));
        return [...prev.slice(Math.max(prev.length - 29, 0)), { time: tick, value: nextSoil }];
      });

      // Push new reading to history (newest at top, max 15)
      setReadings(prev => {
        const pitchStatus = nextSoil < 35 ? 'Dry' : nextSoil > 65 ? 'Wet' : 'Balanced';
        const newEntry: Reading = {
          id: ++readingIdRef.current,
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          temp: nextTemp,
          humidity: nextHum,
          soil: nextSoil,
          pitchStatus,
        };
        return [newEntry, ...prev].slice(0, 15);
      });
    }, 2000);

    return () => clearInterval(dataInterval);
  }, [pumpOn, fanOn]);

  // Reset all dashboard data
  const handleReset = () => {
    setTempHistory([]);
    setHumHistory([]);
    setSoilHistory([]);
    setReadings([]);
  };

  // Derived states (safe for empty arrays)
  const currentTemp = tempHistory.length ? tempHistory[tempHistory.length - 1].value : 0;
  const currentHum = humHistory.length ? humHistory[humHistory.length - 1].value : 0;
  const currentSoil = soilHistory.length ? soilHistory[soilHistory.length - 1].value : 42;

  const getSoilStatus = (val: number) => {
    if (val < 35) return { label: 'Dry', color: 'text-orange-700 bg-orange-100 border-orange-200', dot: 'bg-orange-500' };
    if (val > 65) return { label: 'Wet', color: 'text-blue-700 bg-blue-100 border-blue-200', dot: 'bg-blue-500' };
    return { label: 'Balanced', color: 'text-green-700 bg-green-100 border-green-200', dot: 'bg-green-500' };
  };

  const soilStatus = getSoilStatus(currentSoil);
  const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="min-h-screen w-full font-sans text-slate-900 pb-12 selection:bg-blue-200 selection:text-blue-900 relative overflow-hidden bg-slate-50">
      {/* Ambient background blobs for subtle glassmorphism effect */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-400/10 rounded-full mix-blend-multiply filter blur-[80px] opacity-70 pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-green-400/10 rounded-full mix-blend-multiply filter blur-[80px] opacity-70 pointer-events-none animate-pulse" style={{ animationDuration: '10s' }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-6 space-y-8">
        
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden">
           <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-600" />
           <div className="flex items-center gap-4 pl-2">
             <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 text-white">
                <Activity size={24} />
             </div>
             <div>
               <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">AI Smart Cricket Pitch Dashboard</h1>
               <p className="text-sm text-slate-500 font-medium">Real-Time Monitoring & Automation</p>
             </div>
           </div>
           <div className="flex items-center gap-6 bg-slate-100/50 rounded-xl p-3 border border-slate-200/60">
             <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.7)]" />
                <span className="text-sm font-bold text-green-700 flex items-center gap-1.5">
                  ESP32 Connected <Wifi size={14} />
                </span>
             </div>
             <div className="w-px h-6 bg-slate-300" />
             <div className="text-sm font-bold text-slate-700 font-mono tracking-tight flex gap-2">
               <span>{now.toLocaleDateString()}</span>
               <span className="text-slate-400">|</span>
               <span className="text-blue-600">{timeString}</span>
             </div>
           </div>
        </header>

        {/* 3 Sensor Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <SensorCard
             title="Temperature"
             icon={Thermometer}
             value={currentTemp}
             unit="°C"
             status={currentTemp > 34 ? "High" : currentTemp < 29 ? "Low" : "Normal"}
             statusColor={currentTemp > 34 ? "text-orange-700 bg-orange-100 border-orange-200" : currentTemp < 29 ? "text-blue-700 bg-blue-100 border-blue-200" : "text-green-700 bg-green-100 border-green-200"}
             iconColor="text-orange-500"
             trend={getTrend(tempHistory)}
           />
           <SensorCard
             title="Humidity"
             icon={Droplets}
             value={currentHum}
             unit="%"
             status={currentHum > 75 ? "High" : currentHum < 60 ? "Low" : "Optimal"}
             statusColor={currentHum > 75 ? "text-orange-700 bg-orange-100 border-orange-200" : currentHum < 60 ? "text-orange-700 bg-orange-100 border-orange-200" : "text-blue-700 bg-blue-100 border-blue-200"}
             iconColor="text-blue-500"
             trend={getTrend(humHistory)}
           />
           <SensorCard
             title="Soil Moisture"
             icon={Leaf}
             value={currentSoil}
             unit="%"
             status={soilStatus.label}
             statusColor={soilStatus.color}
             iconColor="text-green-500"
             trend={getTrend(soilHistory)}
           />
        </div>

        {/* 2 Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <ChartCard
             title="Temperature Trend"
             data={tempHistory}
             dataKey="value"
             stroke="#2563EB"
             domain={[27, 36]}
           />
           <ChartCard
             title="Humidity Trend"
             data={humHistory}
             dataKey="value"
             stroke="#16A34A"
             domain={[50, 85]}
           />
        </div>

        {/* 4 Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <StatusCard title="Pitch Status">
             <div className="flex items-center gap-2 mt-1">
               <div className={`w-3.5 h-3.5 rounded-full ${soilStatus.dot} animate-pulse shadow-md`} />
               <div className={`text-2xl font-bold tracking-tight ${soilStatus.color.split(' ')[0]}`}>{soilStatus.label}</div>
             </div>
             <div className="text-xs text-slate-400 mt-2 font-medium">Driven by soil moisture</div>
           </StatusCard>

           <StatusCard title="System Mode">
             <div className="mt-1 flex items-center">
               <span className="px-3.5 py-1.5 bg-blue-100 text-blue-700 rounded-xl text-lg font-bold border border-blue-200 shadow-sm">
                 Automatic
               </span>
             </div>
             <div className="text-xs text-slate-400 mt-3 font-medium">AI controlling logic</div>
           </StatusCard>

           <StatusCard title="Last Updated">
             <div className="text-2xl font-bold text-slate-800 mt-1 font-mono tracking-tight">{timeString}</div>
             <div className="text-xs text-slate-400 mt-2 font-medium">Auto Refresh: Every 2 Seconds</div>
           </StatusCard>

           <StatusCard title="ESP32 Connection">
             <div className="flex items-center gap-2 mt-1">
                <div className="w-3.5 h-3.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.8)]" />
                <span className="text-2xl font-bold text-green-600 tracking-tight">Connected</span>
             </div>
             <div className="text-xs text-slate-400 mt-2 font-medium flex items-center gap-1.5">
               <Wifi size={14} className="text-green-500" /> Signal Strength: Excellent
             </div>
           </StatusCard>
        </div>

        {/* 2 Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <ControlCard
             title="Water Pump"
             icon={Droplet}
             isOn={pumpOn}
             onToggle={setPumpOn}
             activeColor="blue"
             activeText="Pump ON"
             inactiveText="Pump OFF"
           />
           <ControlCard
             title="Drying Fan"
             icon={Fan}
             isOn={fanOn}
             onToggle={setFanOn}
             activeColor="green"
             activeText="Fan ON"
             inactiveText="Fan OFF"
           />
        </div>

        {/* ── Quick Actions ── */}
        <QuickActions
          readings={readings}
          tempHistory={tempHistory}
          humHistory={humHistory}
          soilHistory={soilHistory}
          pumpOn={pumpOn}
          fanOn={fanOn}
          onReset={handleReset}
        />

        {/* Footer */}
        <footer className="pt-8 pb-4 text-center">
           <p className="text-sm font-medium text-slate-400">
             Built for Class 12 IP Exhibition · AI Smart Cricket Pitch Dashboard · Modern IoT Dashboard
           </p>
        </footer>
        
      </div>
    </div>
  );
}
