# ShotTrackerMaker

A free, local desktop app that turns a folder of video clips into a shot-tracker spreadsheet — automatically.

Built for commercial post producers that are tired of wasting time copy/paste plate names and screenshot/inserting thumbnails for each shot. Auto take thumbnails of each shot. Get a basic shot tracker with thumbnails inserted to build on. 

---

## What it does

Point ShotTrackerMaker at a folder of video clips. It will:

1. Extract the first frame of every clip as a thumbnail (PNG).
2. Build a 5-column Excel `.xlsx` with embedded thumbnails:

   | Column | Content |
   |---|---|
   | **Shot Thumbnail** | First-frame image, embedded inline |
   | **Shot Name** | Clip name without extension (e.g., `A001_C002`) |
   | **Shot Notes** | Blank, for your team to fill in |
   | **Status** | Defaults to `Pending` |
   | **Plate Name** | Original filename (e.g., `A001_C002.mov`) |

3. Save it wherever you want via a standard Save As dialog.

One click. **No cloud uploads. No telemetry. 100% local processing.**

---

## Supported video formats

`.mov`, `.mp4`, `.mxf`, `.avi`, `.mkv`.

RED `.r3d` files are detected but skipped — see [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).

---

## Quick start (end users)

*Pre-built installers will be available on the Releases page after CI/CD setup is complete.*

1. Download the installer for your OS (Windows `.msi`/`.exe`, macOS `.dmg`).
2. Install and launch.
3. Click **Generate Tracker**.
4. Pick a folder of video clips.
5. Wait while it extracts (live progress shown in the button label).
6. When the Save As dialog appears, choose where to save the `.xlsx`.

A `_thumbnails/` subfolder is created next to your videos containing all the PNGs, so you have keepable thumbnails in addition to those embedded in the `.xlsx`.

---

## How it works under the hood

- **Shell:** [Tauri 2](https://tauri.app/) — Rust backend, web frontend; small bundle, native windowing, locked-down permission model.
- **Frame extraction:** Bundled [FFmpeg 8.1](https://ffmpeg.org/) (gyan.dev essentials build) invoked as a Tauri sidecar.
- **Spreadsheet output:** [ExcelJS](https://github.com/exceljs/exceljs) writing `.xlsx` with embedded images, in the browser-runtime context inside the app.
- **Frontend:** React 19 + TypeScript + Vite.

---

## Building from source

Requirements:
- [Node.js](https://nodejs.org/) ≥ 20
- [Rust](https://rustup.rs/) ≥ 1.80
- Git

```sh
git clone <this-repo>
cd shottrackermaker
npm install

# Place an FFmpeg binary at:
#   src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe       (Windows)
#   src-tauri/binaries/ffmpeg-x86_64-apple-darwin              (macOS Intel)
#   src-tauri/binaries/ffmpeg-aarch64-apple-darwin             (macOS Apple Silicon)
#
# Windows: download a static build from https://www.gyan.dev/ffmpeg/builds/
# macOS:   `brew install ffmpeg` then
#          `cp /opt/homebrew/bin/ffmpeg src-tauri/binaries/ffmpeg-aarch64-apple-darwin`
#          (evermeet.cx provides Intel-only builds; Homebrew gives native ARM.)

npm run tauri dev      # development with hot-reload
npm run tauri build    # production build
```

The FFmpeg binary is intentionally gitignored — it's too large for the repo. CI/CD will fetch it automatically per platform during release builds.

---

## Known limitations

Read [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for the honest list — including edge cases around RED RAW files, copy-paste of embedded thumbnails, and SmartScreen warnings on first launch.

---

## License

**MIT License** — see [`LICENSE`](./LICENSE).

The bundled FFmpeg binary is GPL-licensed, separate from this project's code. See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for full third-party attribution.

## Security

See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting and threat model.
