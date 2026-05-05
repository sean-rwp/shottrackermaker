# Security Policy

## Reporting a Vulnerability

If you discover a security issue in ShotTrackerMaker, please use GitHub's **"Report a vulnerability"** flow on the Security tab of this repository — *not* a public Issue. That keeps the report private until a fix is ready.

For non-sensitive bugs (crashes, weird behavior, etc.), regular [Issues](../../issues) are fine.

## Threat Model

ShotTrackerMaker is a **fully local** desktop tool:

- No network requests are made by the app.
- No telemetry, analytics, or crash reporting is collected.
- No video files are uploaded anywhere.
- The app reads only files you explicitly select (a folder of video clips, optionally a background image).
- Writes occur in two places: a `_thumbnails/` folder next to your videos, and the `.xlsx` save location you choose.

## Realistic Attack Surface

| Vector | Risk | Mitigation |
|---|---|---|
| Maliciously crafted video file exploiting an FFmpeg vulnerability | Low if you only feed clips from trusted sources (your own footage); higher if you process unknown files | Don't run untrusted video files through any tool, ours included. Keep FFmpeg up to date in our releases. |
| Maliciously crafted `.xlsx` template (Phase 2.5 — not yet implemented) | N/A currently | We will re-evaluate when adding "FILL existing template" mode |
| Locally compromised user account | Out of scope | Standard OS-level protections apply |

## Known Advisories

The bundled `exceljs` JavaScript library has a transitive dependency on a vulnerable version of `uuid` ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)). The vulnerability is **not exploitable in our usage** — see [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for the full reasoning. We will upgrade once an upstream fix is published.

## Distribution Integrity

Installers shipped from this repository are **not code-signed** (no paid certificate). Both Windows SmartScreen and macOS Gatekeeper will warn on first launch — this is expected and documented behavior. To independently verify integrity, build from source.
