# AI Smart Cricket Pitch Dashboard

A real-time IoT monitoring dashboard for cricket pitch conditions — temperature, humidity, and soil moisture — with automatic pump/fan control, live charts, sensor analytics, PDF/Excel export, and voice assistant. Built as a Class XII Informatics Practices project.

## Run & Operate

- `pnpm --filter @workspace/cricket-dashboard run dev` — run the frontend dashboard (workflow: `artifacts/cricket-dashboard: web`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- No database required — dashboard uses simulated ESP32 data

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Frontend: React 18 + Vite + Tailwind CSS v4
- Charts: Recharts
- Export: jsPDF (PDF reports), xlsx (Excel spreadsheets)
- UI components: Radix UI primitives + shadcn/ui patterns

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
