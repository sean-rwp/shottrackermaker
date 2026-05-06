# Known Limitations

An honest list of things ShotTrackerMaker doesn't yet do well, the reasons why, and any workarounds.

---

## File format support

### Camera-original RAW formats are not supported

Several proprietary RAW formats from cinema cameras require their vendor's SDK to decode. ShotTrackerMaker recognizes these files (they appear in the file list) but skips them during extraction with a marker showing which vendor SDK would be needed.

| Extension | Camera family | Vendor SDK needed |
|---|---|---|
| `.r3d` | RED (Komodo, V-Raptor, Epic, Helium, etc.) | RED SDK / REDline |
| `.ari` / `.arx` | ARRI Alexa Mini, LF, 35 (ARRIRAW) | ARRI SDK |
| `.braw` | Blackmagic URSA, Pocket Cinema 4K / 6K | Blackmagic BRAW SDK |
| `.crm` | Canon C300, C500 II, C700 (Cinema RAW Light) | Canon SDK |
| `.rmf` | Canon C500 (older Raw Movie format) | Canon SDK |

**Why we don't bundle the SDKs:** Each requires separate redistribution rights from the camera vendor (often gated by a written agreement). Even with permission, bundling all of them would add 200–500 MB to the installer for codecs most users will never need.

**Workaround for all the above:** Transcode camera-original RAW to ProRes, DNxHD/DNxHR, or H.264/H.265 before running ShotTrackerMaker. Most NLEs (DaVinci Resolve, Premiere Pro, Final Cut Pro) do this for free as part of proxy generation. Run ShotTrackerMaker on the proxies.

**Possible future support:** RED via detection of an installed REDCINE-X PRO (which includes REDline) is the most likely first add — see repository issues for status.

### Some MXF / MOV files with proprietary codec streams may fail

`.mxf` and `.mov` are containers that can hold many different codecs. ShotTrackerMaker can extract from any clip whose video codec stream is supported by the bundled FFmpeg (ProRes, DNxHD/HR, XAVC, AVC-Intra, H.264/H.265, Cineform, etc.). It can't extract from files whose codec stream is itself proprietary — Sony X-OCN inside an `.mxf` wrapper is the most common example.

- **What you'll see:** The file appears in the list and is processed normally (not pre-skipped), but extraction errors out with a "Codec parameters unreadable" or similar message. Click "details" on the red row to see FFmpeg's full error.
- **Workaround:** Same as above — transcode to a standard codec before tracker generation.

### Some uncommon codecs may fail

- **What happens:** Clips in unusual formats (rare camera codecs, very old containers) may show a red error.
- **Why:** The bundled FFmpeg covers the vast majority of professional video codecs (ProRes, DNxHD/HR, H.264, H.265, MXF wrappers, AVI variants, MKV, etc.) but not 100% of every camera-original format.
- **Workaround:** Click "details" on the failed row to see FFmpeg's specific error. Convert the problem file to a common format and re-run, or use the **Retry Failed** button after fixing the source file.

---

## Spreadsheet output

### Thumbnails are floating images, not in-cell images

- **What happens:** When you copy the "Shot Thumbnail" column from the generated `.xlsx` to another spreadsheet (Excel, Google Sheets, Numbers), **the images do not transfer** — only the empty cell value is copied.
- **Why:** ExcelJS (the library that writes the `.xlsx`) creates "floating" images anchored to cell positions. Visually they appear inside cells, but they're technically overlay objects. Microsoft introduced true "in-cell images" with a new XML format in 2023, but ExcelJS doesn't yet support that format. Google Sheets has the same limitation when importing.
- **Workaround:** Use the generated `.xlsx` as your *working* tracker rather than copy-pasting columns out of it. To use it in Google Sheets: drag the file into Google Drive, then right-click → Open with → Google Sheets. The floating images come through as floating images.

### "FILL existing template" mode is not implemented

- **What happens:** ShotTrackerMaker only creates new tracker files. It cannot read an existing `.xlsx` template and inject thumbnail rows into it.
- **Why:** Deferred to a later release. The feature involves design decisions (column mapping, header detection, merged cell handling) significant enough to warrant focused work of its own.
- **Workaround:** Generate the `.xlsx` normally, then copy/paste the *data* rows into your template. (Note: the floating-image limitation above means thumbnails won't carry over with the rows — you'd need to add them by hand or use the generated `.xlsx` directly.)

---

## Performance

### Sequential frame extraction

- **What happens:** A 200-clip folder takes roughly 200× as long as a 1-clip folder. Each clip is processed one at a time.
- **Why:** Parallel extraction is feasible but introduces complexity around CPU/memory management and progress reporting. Sequential was chosen for clarity in the initial release.
- **Workaround:** None. Use the **Cancel** button if you need to stop a long job.

### Large libraries can feel slow during the save step

- **What happens:** Folders of 500+ clips may take a notable amount of time during the final `.xlsx` write step.
- **Why:** PNG thumbnails are transferred from the Rust backend to the JS frontend as JSON arrays of bytes. Functional but inefficient for very large outputs.
- **Workaround:** None for now. A future release may use a binary IPC channel to remove this bottleneck.

---

## User interface

### Cancel waits for the current frame to finish

- **What happens:** When you click **Cancel** mid-extraction, the current clip continues processing for 1–3 more seconds before the loop stops and remaining clips are marked `Cancelled`.
- **Why:** Tauri's sidecar API doesn't currently expose a way to forcibly kill an in-flight subprocess from inside an `await output()` call. We poll a cancellation flag between iterations instead.
- **Workaround:** None — just wait the few seconds.

### Windows SmartScreen warning on first launch

- **What happens:** When you run the ShotTrackerMaker installer for the first time, Windows may show a SmartScreen warning ("Windows protected your PC").
- **Why:** ShotTrackerMaker is distributed without a paid code-signing certificate. Microsoft uses code signing as one trust signal; without it, brand-new downloads are flagged as unrecognized until enough users run them.
- **Workaround:** Click "More info" → "Run anyway." This is safe — the source is fully open and you can inspect or build it yourself.

---

## Security and dependencies

### 2 moderate-severity npm advisories (`uuid` via `exceljs`)

- **What:** `npm audit` reports two moderate-severity advisories from the `uuid` package, pulled in transitively through `exceljs`. The advisory: "Missing buffer bounds check in v3/v5/v6 when `buf` is provided" — [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
- **Practical risk for ShotTrackerMaker users:** Effectively zero. The vulnerability is only exploitable if an attacker-controlled value is passed as the `buf` parameter to a vulnerable `uuid.v3/5/6` call. ExcelJS uses `uuid` internally for generating worksheet and image IDs; it does not expose `uuid` to user input. ShotTrackerMaker is fully local — no untrusted file ingestion over the network in normal use.
- **Why we don't apply the auto-fix:** `npm audit fix --force` would downgrade `exceljs` from 4.x to 3.4.0, losing the image-embedding features the app depends on.
- **Plan:** Upgrade when ExcelJS releases a version with an updated `uuid` dependency, or if a clean fix becomes available without the breaking change.
