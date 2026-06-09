# AgentOps Desktop IDE

AgentOps Desktop packages the existing React cockpit as a native macOS and Windows IDE through Tauri.

## macOS release signing

Public macOS `.dmg` releases must be signed with a Developer ID Application certificate and notarized by Apple. Otherwise Gatekeeper can report that `AgentOps IDE` is damaged after the browser downloads the image.

GitHub Actions signs and notarizes macOS release builds when these repository secrets are present:

- `APPLE_CERTIFICATE`: base64 encoded `.p12` Developer ID Application certificate.
- `APPLE_CERTIFICATE_PASSWORD`: password used when exporting the `.p12`.
- `APPLE_ID`: Apple ID email used for notarization.
- `APPLE_PASSWORD`: app-specific password for that Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.
- `KEYCHAIN_PASSWORD`: temporary CI keychain password.

Tagged releases fail on macOS when these secrets are missing, so an unsigned public DMG is not attached by accident.

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
