# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

ShotTrackerMaker — a free, 100%-local desktop app for commercial post producers. It scans folders of video clips, extracts the first frame of each as a PNG thumbnail, and generates a 5-column shot-tracker `.xlsx` with embedded thumbnails (Shot Thumbnail / Shot Name / Shot Notes / Status / Plate Name). No cloud, no telemetry.

- **GitHub repo:** https://github.com/sean-rwp/shottrackermaker (branch: `master`)
- **Distribution:** free via GitHub Releases, unsigned installers (SmartScreen/Gatekeeper warnings are expected and documented in README)

## Working with the project owner — REQUIRED ground rules

The owner (Sean) is a commercial producer with **no coding background**. Claude is the sole developer.

1. Explain in plain English what you're doing BEFORE each major action; explain WHY before HOW.
2. Pause for approval before: installing new packages, modifying more than one file at a time, or anything destructive.
3. When something errors, explain the fix in producer terms — no untranslated jargon.
4. Use PowerShell/Windows-friendly commands (development happens on Windows 11).
5. Commit after each working sub-step so work can be rolled back.
6. **Update this file after every milestone** — it is the project bible and the recovery point if a conversation is lost.

## Project status: all 5 build phases COMPLETE (as of May 2026)

1. **Phase 1 — Scaffold:** Tauri v2 project + FFmpeg sidecar wired up and callable from Rust (`597c3b2`)
2. **Phase 2 — Core logic:** folder picker, video scan, frame-extraction loop, end-to-end one-click `.xlsx` generation with embedded thumbnails (gates A–D, ending `6d1d871`)
3. **Phase 3 — UI:** dark theme, compact 760×490 window, custom background-image skinning via gear icon (`d2c1a6c`, `f749885`)
4. **Phase 4 — Edge cases:** structured errors with friendly messages, cancel mid-flow, retry-failed-rows (`5295a3b`, `41fcd3d`, `b1d0b9b`)
5. **Phase 5 — CI/CD:** GitHub Actions release workflow for Windows x64 + macOS Apple Silicon (`.github/workflows/release.yml`); last test tag `v0.3.0-test3`

Post-phase additions: multi-folder selection, 640px-wide thumbnails, camera-RAW detection (listed but skipped — see `KNOWN_LIMITATIONS.md`), MIT license + third-party attribution + security policy.

Sanity check June 10, 2026: dev build compiles, app launches, full end-to-end extraction + xlsx verified working.

## Key file locations

| What | Where |
|---|---|
| FFmpeg sidecar binary (Windows) | `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` (~96 MB, **gitignored** — gyan.dev essentials build; CI downloads its own copy; if missing locally, re-download per README "Building from source") |
| Last successful build artifacts (May 6, 2026) | `src-tauri/target/release/bundle/nsis/ShotTrackerMaker_0.1.0_x64-setup.exe` (28 MB) and `src-tauri/target/release/bundle/msi/ShotTrackerMaker_0.1.0_x64_en-US.msi` (39 MB) |
| All frontend logic | `src/App.tsx` (single-component app) + `src/App.css` |
| All backend logic | `src-tauri/src/lib.rs` |
| Release pipeline | `.github/workflows/release.yml` |
| Honest limitations list | `KNOWN_LIMITATIONS.md` |

## Commands

```powershell
npm run tauri dev      # run app in dev mode with hot reload
npm run tauri build    # production build → installers under src-tauri\target\release\bundle\
```

No test suite and no linter are configured. Verification is manual: run the app against a folder of clips (small test .mp4s can be generated with the bundled FFmpeg's `color=` lavfi source).

Releases are produced by pushing a version tag (see `release.yml`); CI builds Windows + macOS and attaches installers to a GitHub Release.

## Architecture

Tauri v2 two-process design:

- **Rust backend** (`src-tauri/src/lib.rs`) exposes 7 commands invoked from the frontend: `list_video_files` (extension-filtered folder scan), `extract_frame` (runs the FFmpeg sidecar: first frame → `_thumbnails/<stem>.png` next to the videos, scaled to 640px wide), `read_file_bytes` / `write_file_bytes` (generic file IO the frontend uses for xlsx + images), and three background-image persistence commands (`set_background_from_path` / `get_background` / `clear_background`, stored in the app-data dir).
- **React frontend** (`src/App.tsx`) owns ALL workflow state and the extraction loop: it iterates clips, calls `extract_frame` per clip, builds the workbook **with ExcelJS in the webview** (not Rust), embeds thumbnails, and saves via `write_file_bytes` + the dialog plugin. Cancel/retry logic, error categorization display, and RAW-format "skipped" marking all live here.
- **FFmpeg ships as a Tauri sidecar** (`bundle.externalBin: binaries/ffmpeg` in `tauri.conf.json`), named per target triple. Errors from FFmpeg stderr are pattern-matched in Rust (`categorize_ffmpeg_stderr`) into categories (codec/permission/io/ffmpeg) and surfaced as structured `ExtractError { short, category, details }` for friendly frontend messages.

Camera-RAW extensions (`.r3d`, `.ari`, `.arx`, `.braw`, `.crm`, `.rmf`) are intentionally listed by the backend scan but never decoded — the frontend marks them "Skipped — vendor SDK required."

## Milestone log (append here after every milestone)

- **2026-05-06** — last production build (v0.1.0 installers, paths above)
- **2026-05-08** — last code work: README install-instruction overhaul; CI release pipeline tested through tag `v0.3.0-test3`
- **2026-06-10** — post-rename sanity check passed (dev build + end-to-end test); CLAUDE.md created
