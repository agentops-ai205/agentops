# AgentOps Desktop IDE

AgentOps Desktop packages the existing React cockpit as a native macOS and Windows IDE through Tauri.

The desktop app is intentionally thin:

- React remains the shared product surface.
- The local AgentOps API provides governed files, terminal, patch, evidence and audit.
- PostgreSQL/Supabase remains the cloud production system of record.
- Local desktop execution stays project-scoped and policy-guarded.

## Commands

```bash
npm install
npm run desktop:dev
npm run desktop:build
```

`desktop:dev` starts the same local API/web stack used by the browser cockpit, then opens the Tauri shell.
