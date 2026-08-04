# AI Smart Cricket Pitch Dashboard

A real-time cricket pitch monitoring dashboard with sensor data visualization and an AI voice assistant.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (`artifacts/cricket-dashboard`)
- **Backend**: Express API server with Drizzle ORM + PostgreSQL (`artifacts/api-server`)
- **Shared libraries**: `lib/db` (database schema), `lib/api-zod` (Zod validators), `lib/api-client-react` (React Query hooks), `lib/api-spec` (OpenAPI spec)
- **Package manager**: pnpm (monorepo)

## Running the project

Two workflows run automatically:

| Workflow | Command | Port |
|---|---|---|
| Cricket Dashboard | `pnpm --filter @workspace/cricket-dashboard run dev` | 25954 |
| API Server | `pnpm --filter @workspace/api-server run dev` | 8080 |

The dashboard is served at `/` and the API at `/api`.

## Database

Uses Replit's built-in PostgreSQL. `DATABASE_URL` is injected automatically at runtime — no manual setup needed.

To push schema changes to the database:

```bash
pnpm --filter @workspace/db run push
```

## User preferences

- Keep existing project structure and stack — do not restructure or migrate.
