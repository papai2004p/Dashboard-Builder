---
name: Artifact workflow ownership
description: Port conflicts caused by legacy duplicate workflows alongside artifact-managed services.
---

When an artifact-managed frontend or API workflow fails with `EADDRINUSE`, check for older duplicate workflows using the same configured ports before changing application code. Stop the legacy workflow, then restart the exact `artifacts/<slug>: <service>` workflow.

**Why:** The artifact services already own their injected ports and proxy routing; duplicate legacy workflows can occupy those ports and make a healthy app appear broken.

**How to apply:** Prefer the artifact-managed workflow names for verification and preview. Treat a clean Vite/API startup in the managed workflow as the source of truth.