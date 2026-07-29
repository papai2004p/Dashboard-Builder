# AI Smart Cricket Pitch Dashboard

A full-stack cricket pitch monitoring dashboard with an AI voice assistant ("Ball").

## Stack

- **Frontend**: React + Vite + Tailwind CSS v4 + shadcn/ui (`artifacts/cricket-dashboard`)
- **Backend**: Express v5 API server (`artifacts/api-server`)
- **Monorepo**: pnpm workspaces

## How to Run

Both services start automatically via configured workflows:

| Workflow | Command | Port |
|---|---|---|
| `Cricket Dashboard` | `PORT=25954 BASE_PATH=/ pnpm --filter @workspace/cricket-dashboard run dev` | 25954 |
| `API Server` | `PORT=8080 pnpm --filter @workspace/api-server run dev` | 8080 |

## Key Directories

```
artifacts/
  cricket-dashboard/   React frontend + Voice Assistant
  api-server/          Express REST API
lib/
  db/                  Drizzle ORM schema
  api-spec/            OpenAPI spec
  api-zod/             Zod validation schemas (generated)
  api-client-react/    React Query hooks (generated)
```

## Voice Assistant ("Ball")

Wake word: **"Hey Ball"** — say it to activate the assistant.

- Wake-word detection: Web Speech API with fuzzy/phonetic matching (`artifacts/cricket-dashboard/src/lib/wakeWordEngine.ts`)
- Command recognition: Web Speech API, language `en-IN`
- Detection strategy: exact substring match → phonetic regex → fuzzy edit-distance bigram → standalone "ball" trigger
- Can be upgraded to Picovoice Porcupine for offline <50 ms detection — see `wakeWordEngine.ts` for setup instructions

## User Preferences
