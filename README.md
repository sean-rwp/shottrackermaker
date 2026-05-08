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

The generated `.xlsx` is intentionally minimal — treat it as a **starting framework**. Open in Excel/Numbers, add your studio's specific columns (Camera, Director, Day, Lens, etc.), apply your branding and styling, then save the customized version as your reusable template.

---

## Supported video formats

**Container formats:** `.mov`, `.mp4`, `.mxf`, `.avi`, `.mkv`

**Codec coverage inside those containers:**
- ProRes (all flavors)
- DNxHD / DNxHR (Avid)
- H.264 / H.265 (HEVC)
- XAVC (Sony)
- AVC-Intra (Panasonic)
- Cineform
- Most standard consumer and prosumer codecs

**Camera-RAW formats** detected and listed, but **skipped during extraction** (vendor SDK required to decode):

| Extension | Camera | Vendor SDK |
|---|---|---|
| `.r3d` | RED (Komodo, V-Raptor, Epic, Helium) | RED SDK / REDline |
| `.ari` / `.arx` | ARRI Alexa (Mini, LF, 35) — ARRIRAW | ARRI SDK |
| `.braw` | Blackmagic URSA, Pocket Cinema | Blackmagic BRAW SDK |
| `.crm` / `.rmf` | Canon C300 / C500 / C700 | Canon SDK |

These files appear in the file list with a "Skipped — vendor SDK required" marker so you can see them in the list, but no decode is attempted. **Workaround for all of these: transcode to ProRes / DNxHR / H.264 first** (free in DaVinci Resolve, Premiere Pro, Final Cut). See [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for full details.

---

## Quick start (Windows users)

1. Go to **[Releases](https://github.com/sean-rwp/shottrackermaker/releases)** → download `ShotTrackerMaker_0.1.0_x64-setup.exe` from the latest version.
2. Run the installer. **Windows SmartScreen will warn** ("Windows protected your PC") — click **More info → Run anyway** (one-time, expected — see [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md)).
3. Launch from the Start menu.
4. Click **Generate Tracker** → pick a folder of video clips.
5. Optionally click **Add Folder** to include clips from additional folders (useful when shoot footage is split across days, cameras, or scenes).
6. Click **Extract All** when ready. Live progress shown in the button label.
7. When the Save As dialog appears, choose where to save the `.xlsx`. Default filename: `shot_tracker_v01.xlsx`.

A `_thumbnails/` subfolder is created next to your videos containing all the PNGs, so you have keepable thumbnails in addition to those embedded in the `.xlsx`.

> **macOS users:** No pre-built installer yet — build from source. See [Building from source](#building-from-source) and [Running on macOS](#running-on-macos) below.

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

## Running on macOS

After `npm run tauri build` completes, the macOS app bundle is at:

```
src-tauri/target/release/bundle/macos/ShotTrackerMaker.app
```

> ⚠️ **Note on the `.dmg`:** Tauri's DMG packaging step (`bundle_dmg.sh`) frequently fails on local Mac builds — you may see `Error failed to bundle project error running bundle_dmg.sh` at the end of the build. **This is harmless** — the `.app` you actually need is already built; you just don't get a DMG wrapper.

### Install

1. Open Finder to the bundle folder:

   ```sh
   open src-tauri/target/release/bundle/macos
   ```

2. **Drag `ShotTrackerMaker.app` to your `/Applications` folder.** macOS will ask if you want to **Replace** any existing version → click Replace.

### First launch (Gatekeeper bypass)

ShotTrackerMaker is not code-signed, so macOS will block the first launch:

> *"ShotTrackerMaker can't be opened because Apple cannot check it for malicious software."*

**To bypass — once per install:**

1. Open Finder → `/Applications`.
2. **Right-click** (or Control-click) **ShotTrackerMaker** → **Open**.
3. In the dialog that appears, click **Open** again.

After this one-time accept, you can launch normally from Launchpad / Dock / Applications.

### Updating

When new commits land on `master`:

```sh
cd ~/Documents/shottrackermaker
git pull
npm install
npm run tauri build
```

Then drag the new `.app` to `/Applications`, replacing the old one (Gatekeeper warning may re-appear once after a major change — same right-click → Open trick).

---

## Known limitations

Read [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for the honest list — including edge cases around RED RAW files, copy-paste of embedded thumbnails, and SmartScreen warnings on first launch.

---

## License

**MIT License** — see [`LICENSE`](./LICENSE).

The bundled FFmpeg binary is GPL-licensed, separate from this project's code. See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for full third-party attribution.

## Security

See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting and threat model.
