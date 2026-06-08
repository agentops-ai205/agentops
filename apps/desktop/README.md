# AgentOps Desktop IDE

AgentOps Desktop packages the existing React cockpit as a native macOS and Windows IDE through Tauri.

The desktop app reuses the same product surface and adds a guarded native runtime:

- React remains the shared product surface.
- Native Tauri commands provide project-scoped files, guarded saves, allowlisted terminal commands and patch apply.
- The local AgentOps API remains available for missions, evidence, audit, policy and cloud sync.
- PostgreSQL/Supabase remains the cloud production system of record.
- Local desktop execution stays project-scoped and policy-guarded.
- Set `AGENTOPS_DESKTOP_WORKSPACE` to pin the project root explicitly; otherwise the app discovers the AgentOps workspace.

## Runtime Boundary

- Files cannot escape the workspace root.
- Large files and binary files are blocked from the editor.
- Terminal commands are executed without a shell and must match the allowlist.
- Patch application runs `git apply --check` before mutating files.
- Runtime secrets such as `DATABASE_URL` and `AGENTOPS_OPERATOR_TOKEN` are removed from command environments.

## Commands

```bash
npm install
npm run desktop:dev
npm run desktop:build
```

`desktop:dev` starts the same local API/web stack used by the browser cockpit, then opens the Tauri shell with the native IDE runtime.
