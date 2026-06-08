# Desktop Production Runbook

AgentOps Desktop is the native IDE surface for macOS and Windows. The web app remains the cloud cockpit; the desktop app owns local project work: files, terminal, patch review, agent runs, evidence and audit capture.

## Architecture

- UI: shared React cockpit from `apps/web`.
- Shell: Tauri v2 in `apps/desktop/src-tauri`.
- Local runtime: `@agentops/api` local server on `127.0.0.1:3000`.
- Cloud state: Supabase/PostgreSQL through the production API.
- Web distribution: Netlify for `agentops.ai`.
- Desktop distribution: signed macOS and Windows installers from CI release artifacts.

## Build Targets

- macOS: Apple Silicon and Intel where CI runners are available.
- Windows: x64 first, ARM64 later if usage justifies it.

## Required Release Gates

Run before desktop release:

```bash
npm install
npm run build
npm test
npm audit
npm run preflight:prod -- --env deploy/production.env.example --allow-placeholders
npm run desktop:check
npm run desktop:build
```

`desktop:check` and `desktop:build` require access to crates.io and the native Tauri toolchain. In restricted/offline environments these steps stop at dependency resolution.

## Signing And Updates

- macOS requires Apple Developer ID signing and notarization before public distribution.
- Windows requires Authenticode signing before broad release.
- Auto-update should be served from signed GitHub Releases or a controlled release endpoint.
- Desktop update metadata must be generated only after all web/API tests and desktop builds pass.

## Security Boundary

The Tauri shell is intentionally thin. Filesystem, terminal and patch operations are routed through the governed local API so policy, evidence and audit stay consistent across web and desktop surfaces.

Protected local paths include `.env*`, `node_modules`, `target`, `dist`, `.agentops/local-store.json` and `.agentops/sandboxes`.
