# AI Smart Cricket Pitch Dashboard

A real-time IoT monitoring dashboard for cricket pitch conditions — temperature, humidity, and soil moisture — with automatic pump/fan control, live charts, sensor analytics, PDF/Excel export, and a voice assistant (Ball AI). Built as a Class XII Informatics Practices project.

## Run & Operate

- **Dashboard** (primary artifact): workflow `artifacts/cricket-dashboard: web` — runs on port 25954
- `pnpm install` — install all dependencies (run after cloning or merging)
- `pnpm run typecheck:libs` — build shared lib type declarations first (required before api-server typecheck)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- No database required — dashboard uses simulated ESP32 sensor data (2s interval)

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Frontend: React 18 + Vite 7 + Tailwind CSS v4
- Charts: Recharts
- Animations: Framer Motion (Voice Assistant Ball mascot)
- Export: jsPDF (PDF reports), xlsx (Excel spreadsheets)
- UI components: Radix UI primitives + shadcn/ui patterns
- Voice: Web Speech API (wake word "Hey Ball", recognition language en-IN)

## Where things live

- `artifacts/cricket-dashboard/src/App.tsx` — main dashboard, all sensor simulation logic
- `artifacts/cricket-dashboard/src/components/VoiceAssistant.tsx` — Ball AI floating assistant (2277 lines)
- `artifacts/cricket-dashboard/src/components/QuickActions.tsx` — Export PDF/Excel, Sensor Analysis modal, Reset
- `artifacts/cricket-dashboard/src/lib/generatePDF.ts` — full PDF report generation with charts
- `artifacts/cricket-dashboard/src/lib/types.ts` — shared `Reading` and `TimelineEvent` types
- `artifacts/cricket-dashboard/src/lib/wakeWordEngine.ts` — wake word config (Picovoice Porcupine optional upgrade)
- `artifacts/api-server/src/` — Express API server (unused by dashboard; scaffold for future real ESP32 data)
- `lib/` — shared workspace libraries (api-spec, api-zod, api-client-react, db)

## Architecture decisions

- Sensor data is fully simulated in the browser (no backend needed for demo/exhibition) — soil moisture responds to pump/fan state for realistic behaviour.
- VoiceAssistant uses Web Speech API (recognition + synthesis) with a fallback banner when mic is blocked. Picovoice Porcupine integration is commented-out but fully scaffolded in `wakeWordEngine.ts` for offline wake-word upgrade.
- PDF is generated entirely client-side with jsPDF — no server round-trip needed.
- `shouldListenRef` must be set `false` before calling `setIsSupported(false)` to prevent the SpeechRecognition restart loop from firing endlessly when mic permission is denied.

## Product

A Class XII school project dashboard for an AI-connected cricket pitch. Monitors temperature (°C), humidity (%), and soil moisture (%) live. Automatically activates the water pump (dry soil) or drying fan (wet soil) in Auto mode, or lets the user control both manually. Exports full PDF reports and Excel spreadsheets. Ball AI voice assistant responds to spoken commands like "turn on the pump", "export PDF", "what's the temperature?".

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` — the api-server imports `@workspace/api-zod` whose `.d.ts` files must be built first.
- `shouldListenRef.current = false` must be set in `rec.onerror` before setting React state, or the onend restart loop will run endlessly in sandboxed environments where mic is blocked.
- The old standalone "Cricket Dashboard" workflow (port 5173) and the artifact-managed "artifacts/cricket-dashboard: web" workflow (port 25954) both exist; the artifact-managed one is the canonical preview target.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
