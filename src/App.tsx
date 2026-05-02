import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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

  function basename(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  }

  async function pickFolder() {
    setError("");
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
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
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

  const summary = {
    done: entries.filter((e) => e.status === "done").length,
    skipped: entries.filter((e) => e.status === "skipped").length,
    errored: entries.filter((e) => e.status === "error").length,
    total: entries.length,
  };

  const allDone =
    entries.length > 0 &&
    entries.every(
      (e) => e.status === "done" || e.status === "skipped" || e.status === "error"
    );

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
  };

  return (
    <main className="container">
      <h1>ShotTrackerMaker</h1>
      <p>Phase 2 Gate B — Frame extraction</p>

      <div style={{ display: "flex", gap: "0.5em", justifyContent: "center" }}>
        <button onClick={pickFolder} disabled={scanning || extracting}>
          {scanning ? "Scanning..." : "Pick Folder"}
        </button>
        {entries.length > 0 && (
          <button onClick={extractAll} disabled={extracting || allDone}>
            {extracting
              ? "Extracting..."
              : allDone
                ? "Done"
                : `Extract Frames (${entries.length})`}
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
          <strong>
            {entries.length} video file{entries.length === 1 ? "" : "s"}
            {(extracting || allDone) && (
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
