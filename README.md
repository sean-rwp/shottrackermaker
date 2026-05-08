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

## Install on Windows

1. Go to the [**Releases**](https://github.com/sean-rwp/shottrackermaker/releases) page → from the latest version, click the `.exe` file under "Assets" to download (about 28 MB).
2. Double-click the downloaded `.exe`.
3. **Windows SmartScreen will warn** with "Windows protected your PC" → click **More info** → **Run anyway**. *One-time, expected — the installer isn't code-signed, but is safe.*
4. Step through the installer prompts (**Next** → **Install** → **Finish**). Optionally tick "Create desktop shortcut."
5. Launch from the **Start menu** → search "ShotTrackerMaker."

Installed. Skip ahead to ["Using the app"](#using-the-app).

---

## Install on macOS (Apple Silicon — M1 / M2 / M3 / M4)

> **Intel Mac users:** No pre-built binary for Intel yet. Build from source — see ["Building from source"](#building-from-source).

1. Go to the [**Releases**](https://github.com/sean-rwp/shottrackermaker/releases) page → from the latest version, click the `.dmg` file under "Assets" to download (about 23 MB).
2. Double-click the downloaded `.dmg` to open the installer window.
3. **Drag the ShotTrackerMaker app into the Applications folder.**
4. **Strip the download quarantine flag.** Open **Terminal** (⌘+Space → type "Terminal" → Enter), then paste this command and press Enter:

   ```bash
   xattr -cr /Applications/ShotTrackerMaker.app
   ```

   *Without this step, macOS may say "ShotTrackerMaker is damaged."* This is a one-time command per install.

5. **First launch — Gatekeeper bypass:**
   - Open Finder → **Applications**
   - **Right-click** (or Control-click) **ShotTrackerMaker** → click **Open**
   - A dialog will say *"can't be opened because Apple cannot check it for malicious software"* → click **Open**

   *This is one-time per install — the app isn't signed with a paid Apple Developer ID, so macOS warns the first time. Subsequent launches work normally from Launchpad / Dock / Applications.*

Installed. Skip ahead to ["Using the app"](#using-the-app).

---

## Using the app

Once installed (either platform):

1. Launch ShotTrackerMaker (Start menu / Launchpad / Dock).
2. Click **Generate Tracker**.
3. **Pick a folder of video clips** in the dialog that opens.
4. Optionally click **Add Folder** to include clips from additional folders (useful when shoot footage is split across days, cameras, or scenes — supports any number).
5. Click **Extract All** when ready. Live progress shows in the button label.
6. When the **Save As** dialog appears, choose where to save the `.xlsx`. Default filename: `shot_tracker_v01.xlsx`.

A `_thumbnails/` subfolder is created next to your videos containing all the PNGs, so you have keepable thumbnails in addition to those embedded in the `.xlsx`.

**Other features:**
- **Gear icon, top-right:** set a custom background image (purely cosmetic, persists across launches)
- **Cancel button** during extraction: stops the loop after the current frame finishes
- **Retry Failed** button after extraction: re-runs only the failed/cancelled clips, leaves the successful ones alone
- **× on any panel:** close that panel without resetting the rest of your work

---

## How it works under the hood

- **Shell:** [Tauri 2](https://tauri.app/) — Rust backend, web frontend; small bundle, native windowing, locked-down permission model.
- **Frame extraction:** Bundled [FFmpeg](https://ffmpeg.org/) invoked as a Tauri sidecar (gyan.dev essentials build on Windows, ffmpeg-static darwin-arm64 on macOS).
- **Spreadsheet output:** [ExcelJS](https://github.com/exceljs/exceljs) writing `.xlsx` with embedded images, in the browser-runtime context inside the app.
- **Frontend:** React 19 + TypeScript + Vite.

---

## Building from source

For developers, contributors, and Intel Mac users (since no pre-built Intel binary exists yet).

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20
- [Rust](https://rustup.rs/) ≥ 1.80
- Git
- **Windows:** a static FFmpeg binary from https://www.gyan.dev/ffmpeg/builds/ (download "release essentials").
- **macOS:** Homebrew (`brew install ffmpeg`) for Apple Silicon — gives a native ARM build.

### Clone and build

```sh
git clone https://github.com/sean-rwp/shottrackermaker.git
cd shottrackermaker
npm install
```

Place an FFmpeg binary in `src-tauri/binaries/` named for your platform's target triple:

| Platform | Path |
|---|---|
| Windows x64 | `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` |
| macOS Apple Silicon | `src-tauri/binaries/ffmpeg-aarch64-apple-darwin` |
| macOS Intel | `src-tauri/binaries/ffmpeg-x86_64-apple-darwin` |

**macOS Apple Silicon example** (after `brew install ffmpeg`):

```sh
mkdir -p src-tauri/binaries
cp /opt/homebrew/bin/ffmpeg src-tauri/binaries/ffmpeg-aarch64-apple-darwin
chmod +x src-tauri/binaries/ffmpeg-aarch64-apple-darwin
```

Then build:

```sh
npm run tauri dev      # development with hot-reload
npm run tauri build    # production build (~5–10 min first time)
```

The FFmpeg binary is intentionally gitignored (too large for the repo). CI/CD fetches the appropriate build per platform automatically during release builds; local builds need it placed manually as above.

### Install your local Windows build

After `npm run tauri build` completes, run:

```
src-tauri\target\release\bundle\nsis\ShotTrackerMaker_*_x64-setup.exe
```

Standard Windows install (SmartScreen → Run anyway → Next → Install). Same as the pre-built release.

### Install your local Mac build

After `npm run tauri build` completes, the `.app` is at:

```
src-tauri/target/release/bundle/macos/ShotTrackerMaker.app
```

> **Note on the `.dmg`:** Tauri's DMG packaging step (`bundle_dmg.sh`) often fails during local builds. **Harmless** — the `.app` you actually need is already built. Just skip the DMG and use the `.app` directly.

In Terminal:

```sh
open src-tauri/target/release/bundle/macos
```

Drag `ShotTrackerMaker.app` from Finder to **/Applications** (replacing any existing version).

Then complete the Gatekeeper bypass steps from the [macOS install guide above](#install-on-macos-apple-silicon--m1--m2--m3--m4) (`xattr -cr ...` plus right-click → Open). Same as the pre-built release.

### Updating from source

When new commits land on `master`:

```sh
cd /path/to/shottrackermaker
git pull
npm install
npm run tauri build
```

Then re-run the new installer (Windows) or drag the new `.app` (Mac), replacing the previous version.

---

## Known limitations

Read [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for the honest list — including edge cases around RED RAW files, copy-paste of embedded thumbnails, and SmartScreen / Gatekeeper warnings on first launch.

---

## License

**MIT License** — see [`LICENSE`](./LICENSE).

The bundled FFmpeg binary is GPL-licensed, separate from this project's code. See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for full third-party attribution.

## Security

See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting and threat model.
