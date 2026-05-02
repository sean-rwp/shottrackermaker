import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import ExcelJS from "exceljs";
import "./App.css";

type EntryStatus = "pending" | "extracting" | "done" | "skipped" | "error";

type VideoEntry = {
  path: string;
  status: EntryStatus;
  pngPath?: string;
  error?: string;
};

function App() {
  const [folder, setFolder] = useState<string>("");
  const [entries, setEntries] = useState<VideoEntry[]>([]);
  const [error, setError] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savedPath, setSavedPath] = useState<string>("");

  const entriesRef = useRef<VideoEntry[]>([]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  function basename(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  }

  function clearAll() {
    setEntries([]);
    setFolder("");
    setSavedPath("");
    setError("");
  }

  async function pickFolder() {
    setError("");
    setSavedPath("");
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Pick a folder of video clips",
      });
      if (selected === null) return;
      const folderPath = selected as string;
      setFolder(folderPath);
      setScanning(true);
      const list = await invoke<string[]>("list_video_files", {
        folder: folderPath,
      });
      setEntries(list.map((p) => ({ path: p, status: "pending" as EntryStatus })));
    } catch (e) {
      setError(String(e));
      setEntries([]);
    } finally {
      setScanning(false);
    }
  }

  function updateEntry(idx: number, patch: Partial<VideoEntry>) {
    setEntries((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  async function extractAll() {
    setExtracting(true);
    setError("");
    setSavedPath("");
    const items = entriesRef.current;
    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      const lower = entry.path.toLowerCase();
      if (lower.endsWith(".r3d")) {
        updateEntry(i, {
          status: "skipped",
          error: "R3D format not supported (Phase 4)",
        });
        continue;
      }
      updateEntry(i, { status: "extracting" });
      try {
        const pngPath = await invoke<string>("extract_frame", {
          videoPath: entry.path,
        });
        updateEntry(i, { status: "done", pngPath });
      } catch (e) {
        updateEntry(i, { status: "error", error: String(e) });
      }
    }
    setExtracting(false);
  }

  async function generateTracker() {
    setError("");
    setSavedPath("");

    const successful = entriesRef.current.filter((e) => e.status === "done" && e.pngPath);
    if (successful.length === 0) {
      setError("No extracted frames to write into a tracker.");
      return;
    }

    const folderName =
      folder.split(/[/\\]/).filter(Boolean).pop() || "tracker";
    const defaultName = `${folderName}_tracker.xlsx`;

    const filePath = await save({
      title: "Save shot tracker",
      defaultPath: defaultName,
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });
    if (filePath === null) return;

    setGenerating(true);

    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Shots");

      sheet.columns = [
        { header: "Shot Thumbnail", key: "thumb", width: 29 },
        { header: "Shot Name", key: "shotName", width: 30 },
        { header: "Shot Notes", key: "notes", width: 40 },
        { header: "Status", key: "status", width: 12 },
        { header: "Plate Name", key: "plateName", width: 30 },
      ];

      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).height = 20;
      sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

      for (let i = 0; i < successful.length; i++) {
        const entry = successful[i];
        const fileBase = basename(entry.path);
        const fileStem = fileBase.replace(/\.[^.]+$/, "");
        const rowNum = i + 2;

        const row = sheet.getRow(rowNum);
        row.values = {
          thumb: "",
          shotName: fileStem,
          notes: "",
          status: "Pending",
          plateName: fileBase,
        };
        row.height = 85;
        row.alignment = { vertical: "middle", horizontal: "center" };

        const pngBytes = await invoke<number[]>("read_file_bytes", {
          path: entry.pngPath!,
        });
        const arrayBuffer = new Uint8Array(pngBytes).buffer;

        const imageId = workbook.addImage({
          buffer: arrayBuffer,
          extension: "png",
        });
        sheet.addImage(imageId, {
          tl: { col: 0, row: rowNum - 1 },
          ext: { width: 192, height: 108 },
        });
      }

      const xlsxBuffer = await workbook.xlsx.writeBuffer();
      const xlsxBytes = Array.from(new Uint8Array(xlsxBuffer));

      await invoke("write_file_bytes", {
        path: filePath,
        bytes: xlsxBytes,
      });

      setSavedPath(filePath);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  const summary = {
    done: entries.filter((e) => e.status === "done").length,
    skipped: entries.filter((e) => e.status === "skipped").length,
    errored: entries.filter((e) => e.status === "error").length,
    total: entries.length,
  };

  const allExtractDone =
    entries.length > 0 &&
    entries.every(
      (e) =>
        e.status === "done" || e.status === "skipped" || e.status === "error"
    );

  const canGenerate = allExtractDone && summary.done > 0;

  function statusLabel(e: VideoEntry): { icon: string; text: string; color: string } {
    switch (e.status) {
      case "pending":
        return { icon: "·", text: "Pending", color: "#888" };
      case "extracting":
        return { icon: "⏳", text: "Extracting...", color: "#1976d2" };
      case "done":
        return { icon: "✓", text: "Done", color: "#2e7d32" };
      case "skipped":
        return {
          icon: "⊘",
          text: `Skipped (${e.error || "unknown"})`,
          color: "#e65100",
        };
      case "error":
        return {
          icon: "✗",
          text: `Error: ${e.error || "unknown"}`,
          color: "#b71c1c",
        };
    }
  }

  const panelStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "1em",
    borderRadius: "6px",
    fontSize: "0.85em",
    maxWidth: "750px",
    margin: "1.5em auto 0",
    position: "relative",
  };

  const closeBtnStyle: React.CSSProperties = {
    position: "absolute",
    top: "0.4em",
    right: "0.6em",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "1.3em",
    fontWeight: "bold",
    color: "inherit",
    opacity: 0.5,
    padding: "0 0.4em",
    lineHeight: 1,
  };

  const busy = scanning || extracting || generating;

  return (
    <main className="container">
      <h1>ShotTrackerMaker</h1>
      <p>Phase 2 Gate C — Tracker generation</p>

      <div style={{ display: "flex", gap: "0.5em", justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={pickFolder} disabled={busy}>
          {scanning ? "Scanning..." : "Pick Folder"}
        </button>
        {entries.length > 0 && (
          <button onClick={extractAll} disabled={busy || allExtractDone}>
            {extracting
              ? "Extracting..."
              : allExtractDone
                ? "Frames Extracted"
                : `Extract Frames (${entries.length})`}
          </button>
        )}
        {canGenerate && (
          <button onClick={generateTracker} disabled={busy}>
            {generating ? "Generating..." : "Generate Tracker"}
          </button>
        )}
      </div>

      {folder && (
        <p style={{ marginTop: "1em", fontSize: "0.85em", color: "#555" }}>
          Folder: <code>{folder}</code>
        </p>
      )}

      {entries.length > 0 && (
        <div style={{ ...panelStyle, background: "#f5f5f5", color: "#000" }}>
          <button onClick={clearAll} aria-label="Clear" style={closeBtnStyle}>
            ×
          </button>
          <strong>
            {entries.length} video file{entries.length === 1 ? "" : "s"}
            {(extracting || allExtractDone) && (
              <span style={{ fontWeight: "normal" }}>
                {" — "}
                {summary.done} done
                {summary.skipped > 0 && `, ${summary.skipped} skipped`}
                {summary.errored > 0 && `, ${summary.errored} errored`}
              </span>
            )}
          </strong>
          <ul
            style={{
              margin: "0.5em 0 0 0",
              paddingLeft: "1.2em",
              maxHeight: "350px",
              overflowY: "auto",
              fontFamily: "monospace",
            }}
          >
            {entries.map((e) => {
              const s = statusLabel(e);
              return (
                <li
                  key={e.path}
                  style={{ wordBreak: "break-all", marginBottom: "0.25em" }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "1.5em",
                      color: s.color,
                    }}
                  >
                    {s.icon}
                  </span>
                  <span>{basename(e.path)}</span>
                  <span style={{ marginLeft: "0.5em", color: s.color }}>
                    — {s.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {savedPath && (
        <div
          style={{
            ...panelStyle,
            background: "#e8f5e9",
            color: "#1b5e20",
            fontFamily: "monospace",
          }}
        >
          <button
            onClick={() => setSavedPath("")}
            aria-label="Clear"
            style={closeBtnStyle}
          >
            ×
          </button>
          <strong>✓ Tracker saved:</strong>
          <div style={{ marginTop: "0.5em", wordBreak: "break-all" }}>
            {savedPath}
          </div>
        </div>
      )}

      {folder && !scanning && entries.length === 0 && !error && (
        <p style={{ ...panelStyle, background: "#fff3e0", color: "#e65100" }}>
          No video files found. Looking for: .mov, .mp4, .mxf, .r3d, .avi, .mkv
        </p>
      )}

      {error && (
        <pre
          style={{
            ...panelStyle,
            background: "#ffebee",
            color: "#b71c1c",
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
          }}
        >
          ERROR: {error}
        </pre>
      )}
    </main>
  );
}

export default App;
