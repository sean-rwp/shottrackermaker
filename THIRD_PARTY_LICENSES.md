# Third-Party Software

ShotTrackerMaker bundles or depends on the following third-party software, each under its own license.

## FFmpeg (bundled binary)

- **Project:** https://ffmpeg.org/
- **License:** GNU General Public License v2 or later ([GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt))
- **Source code:** https://ffmpeg.org/download.html
- **Windows build used:** gyan.dev "essentials" static build (https://www.gyan.dev/ffmpeg/builds/)

The Windows installer ships a copy of `ffmpeg.exe` from the gyan.dev essentials build. As required by the GPL, the FFmpeg source code is freely available at the project URL above. macOS builds typically use a Homebrew-installed ARM64 binary, which is also GPL-licensed.

ShotTrackerMaker invokes FFmpeg as a separate subprocess via Tauri's sidecar mechanism (not statically linked), so the rest of this project's code is licensed independently under MIT (see [`LICENSE`](./LICENSE)).

## Notable runtime dependencies

| Library | License |
|---|---|
| [Tauri 2](https://tauri.app/) | MIT or Apache-2.0 |
| [React 19](https://react.dev/) | MIT |
| [Vite](https://vitejs.dev/) | MIT |
| [TypeScript](https://www.typescriptlang.org/) | Apache-2.0 |
| [ExcelJS](https://github.com/exceljs/exceljs) | MIT |

For the complete transitive dependency tree and license info, see `package-lock.json` (npm) and `src-tauri/Cargo.lock` (Rust).
