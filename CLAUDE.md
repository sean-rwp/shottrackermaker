# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It is the **project bible**: readable in plain English by a non-coder, read automatically at the start of every session, and updated after every milestone.

## Project Overview

- **Name:** ShotTrackerMaker
- **Purpose:** Desktop app that automates the data-entry step of building a shot tracker. Reads a folder of video clips, extracts frame 1 from each, generates a populated `.xlsx` with embedded thumbnails (5 columns: Shot Thumbnail / Shot Name / Shot Notes / Status / Plate Name). 100% local — no cloud, no telemetry.
- **User:** Commercial producer (Sean), no coding background, needs plain-English explanations before any technical action. Claude is the sole developer.
- **Project folder:** `C:\Users\User\Projects\shottrackermaker` (moved from `Documents\` on 2026-06-10)
- **GitHub repo:** https://github.com/sean-rwp/shottrackermaker (branch: `master`)
- **Distribution:** free via GitHub Releases, unsigned installers (SmartScreen/Gatekeeper warnings expected and documented in README)

## Tech Stack

- Tauri v2 (app shell, cross-platform)
- Bundled FFmpeg sidecar (Windows x64 + macOS Apple Silicon)
- ExcelJS (xlsx write with embedded images — runs in the webview, not Rust)
- React 19 + TypeScript + Vite (UI)
- Styling: plain hand-written CSS in `src/App.css` (Tailwind was in the original plan but was never adopted — do not add it without asking)

## Build Phases

All 5 phases are **COMPLETE** (as of May 2026):

- **Phase 1 — Scaffold:** Tauri v2 project + FFmpeg sidecar callable from Rust ✅ (`597c3b2`)
- **Phase 2 — Core logic:** folder pick, frame-extraction loop, xlsx write with embedded thumbnails ✅ (gates A–D, ending `6d1d871`)
- **Phase 3 — UI:** ✅ (`d2c1a6c`, `f749885`) — built as button + folder-picker dialogs with live progress in the button label, dark theme, custom background skinning. *Deviations from the original plan:* no drag-and-drop zones, and no new-vs-existing toggle (see fill-mode note under Current Status).
- **Phase 4 — Edge cases:** structured friendly errors, cancel mid-flow, retry-failed-rows ✅ (`5295a3b`, `41fcd3d`, `b1d0b9b`)
- **Phase 5 — CI/CD:** GitHub Actions release workflow for Win x64 + macOS Apple Silicon ✅ (`.github/workflows/release.yml`)

Post-phase additions: multi-folder selection, 640px thumbnails, camera-RAW detection (listed but skipped — see `KNOWN_LIMITATIONS.md`), MIT license, third-party attribution, security policy.

## Current Status

- **Shipped:** two public GitHub releases — v0.2.1 (first public) and v0.3.0 (first fully-CI, Windows + Mac installers).
- **Just finished (2026-06-10):** post-folder-rename sanity check (dev build + end-to-end test passed); version sync 0.1.0 → 0.3.0 across all config files; project moved to `C:\Users\User\Projects\shottrackermaker`.
- **Next sub-step (open decision for Sean):** the one unbuilt item from the original spec — **"FILL an existing .xlsx template" mode**. The app currently only generates NEW trackers (deferred by design; see `KNOWN_LIMITATIONS.md`). Either build it as the next feature or officially drop it from the roadmap.
- **Known rough edges:** see `KNOWN_LIMITATIONS.md` (floating thumbnails don't survive copy-paste, sequential extraction speed, 2 accepted moderate npm advisories via exceljs/uuid, no Intel Mac binary).

## Ground Rules

1. Explain in plain English BEFORE each major action.
2. Pause for approval before installing packages or touching multiple files.
3. Windows-friendly commands (PowerShell, not bash).
4. Commit to git after each working sub-step.
5. When errors happen, translate jargon into producer terms.
6. Briefly explain WHY before HOW for anything unfamiliar.

## Milestone Update Protocol

At the end of each completed sub-step, update the **Current Status** section of this file to reflect:

- What was just finished
- What the next sub-step is
- Any decisions made or files created that future sessions need to know

Also append a dated line to the **Milestone Log** at the bottom of this file, then commit and push.

## Key File Locations

| What | Where |
|---|---|
| FFmpeg sidecar binary (Windows) | `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` (~96 MB, **gitignored** — gyan.dev essentials build; CI downloads its own copy; if missing locally, re-download per README "Building from source") |
| Last successful local build artifacts (May 6, 2026) | `src-tauri/target/release/bundle/nsis/ShotTrackerMaker_0.1.0_x64-setup.exe` (28 MB) and `src-tauri/target/release/bundle/msi/ShotTrackerMaker_0.1.0_x64_en-US.msi` (39 MB) |
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

**Release checklist — BEFORE pushing a new tag:** bump the version to match the tag in all three of `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, then run `cargo update -w` in `src-tauri/` to sync `Cargo.lock`, and commit. The installer filenames come from `tauri.conf.json`, not the tag — v0.2.1/v0.3.0 shipped installers mislabeled `0.1.0` because this was missed. Pushing a `v*` tag triggers CI, which attaches installers to a **draft** GitHub Release (publish manually).

## Architecture

Tauri v2 two-process design:

- **Rust backend** (`src-tauri/src/lib.rs`) exposes 7 commands invoked from the frontend: `list_video_files` (extension-filtered folder scan), `extract_frame` (runs the FFmpeg sidecar: first frame → `_thumbnails/<stem>.png` next to the videos, scaled to 640px wide), `read_file_bytes` / `write_file_bytes` (generic file IO the frontend uses for xlsx + images), and three background-image persistence commands (`set_background_from_path` / `get_background` / `clear_background`, stored in the app-data dir).
- **React frontend** (`src/App.tsx`) owns ALL workflow state and the extraction loop: it iterates clips, calls `extract_frame` per clip, builds the workbook **with ExcelJS in the webview** (not Rust), embeds thumbnails, and saves via `write_file_bytes` + the dialog plugin. Cancel/retry logic, error categorization display, and RAW-format "skipped" marking all live here.
- **FFmpeg ships as a Tauri sidecar** (`bundle.externalBin: binaries/ffmpeg` in `tauri.conf.json`), named per target triple. Errors from FFmpeg stderr are pattern-matched in Rust (`categorize_ffmpeg_stderr`) into categories (codec/permission/io/ffmpeg) and surfaced as structured `ExtractError { short, category, details }` for friendly frontend messages.

Camera-RAW extensions (`.r3d`, `.ari`, `.arx`, `.braw`, `.crm`, `.rmf`) are intentionally listed by the backend scan but never decoded — the frontend marks them "Skipped — vendor SDK required."

## Milestone Log (append here after every milestone)

- **2026-05-06** — last local production build (v0.1.0-labeled installers, paths above); v0.2.1 published as first public release
- **2026-05-08** — last code work: README install-instruction overhaul; v0.3.0 published as first fully-CI release
- **2026-06-10** — post-rename sanity check passed (dev build + end-to-end test); CLAUDE.md created
- **2026-06-10** — version sync: internal version 0.1.0 → 0.3.0 across package.json / tauri.conf.json / Cargo.toml; release checklist added
- **2026-06-10** — project moved to `C:\Users\User\Projects\shottrackermaker`; CLAUDE.md restructured to match the original project-bible template (Tech Stack correction: plain CSS, not Tailwind)
