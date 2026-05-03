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
  errorDetails?: string;
  errorCategory?: string;
};

type Stage = "idle" | "scanning" | "extracting" | "saving";

type ParsedError = {
  short: string;
  category: string;
  details: string;
};

function parseInvokeError(e: unknown): ParsedError {
  if (e === null || e === undefined) {
    return { short: "Unknown error", category: "unknown", details: "" };
  }
  if (typeof e === "string") {
    return { short: e, category: "unknown", details: "" };
  }
  if (typeof e === "object" && "short" in e) {
    const obj = e as Partial<ParsedError>;
    return {
      short: obj.short ?? "Unknown error",
      category: obj.category ?? "unknown",
      details: obj.details ?? "",
    };
  }
  return { short: String(e), category: "unknown", details: "" };
}

function App() {
  const [folder, setFolder] = useState<string>("");
  const [entries, setEntries] = useState<VideoEntry[]>([]);
  const [error, setError] = useState<string>("");
  const [savedPath, setSavedPath] = useState<string>("");
  const [stage, setStage] = useState<Stage>("idle");
  const [progressIdx, setProgressIdx] = useState<number>(0);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

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
    setStage("idle");
    setProgressIdx(0);
    setExpandedErrors(new Set());
  }

  function toggleErrorDetails(path: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

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
          text: e.error || "Error",
          color: "#b71c1c",
        };
    }
  }

  async function generateTracker() {
    setError("");
    setSavedPath("");
    setEntries([]);
    setFolder("");
    setProgressIdx(0);
    setExpandedErrors(new Set());

    const selected = await open({
      directory: true,
      multiple: false,
      title: "Pick a folder of video clips",
    });
    if (selected === null) return;
    const folderPath = selected as string;
    setFolder(folderPath);

    setStage("scanning");

    try {
      const videoPaths = await invoke<string[]>("list_video_files", {
        folder: folderPath,
      });
      if (videoPaths.length === 0) {
        setError("No video files found in this folder.");
        setStage("idle");
        return;
      }

      setStage("extracting");
      const items: VideoEntry[] = videoPaths.map((p) => ({
        path: p,
        status: "pending" as EntryStatus,
      }));
      setEntries([...items]);

      for (let i = 0; i < items.length; i++) {
        setProgressIdx(i + 1);
        const lower = items[i].path.toLowerCase();
        if (lower.endsWith(".r3d")) {
          items[i] = {
            ...items[i],
            status: "skipped",
            error: "R3D format not supported (Phase 4)",
          };
          setEntries([...items]);
          continue;
        }
        items[i] = { ...items[i], status: "extracting" };
        setEntries([...items]);
        try {
          const pngPath = await invoke<string>("extract_frame", {
            videoPath: items[i].path,
          });
          items[i] = { ...items[i], status: "done", pngPath };
        } catch (e) {
          const err = parseInvokeError(e);
          items[i] = {
            ...items[i],
            status: "error",
            error: err.short,
            errorDetails: err.details,
            errorCategory: err.category,
          };
        }
        setEntries([...items]);
      }

      const successful = items.filter((e) => e.status === "done" && e.pngPath);
      if (successful.length === 0) {
        setError("No frames could be extracted from this folder.");
        setStage("idle");
        return;
      }

      setStage("saving");
      const folderName =
        folderPath.split(/[/\\]/).filter(Boolean).pop() || "tracker";
      const defaultName = `${folderName}_tracker.xlsx`;
      const filePath = await save({
        title: "Save shot tracker",
        defaultPath: defaultName,
        filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
      });
      if (filePath === null) {
        setStage("idle");
        return;
      }

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
      setStage("idle");
    } catch (e) {
      const err = parseInvokeError(e);
      setError(err.short + (err.details ? `\n\nDetails:\n${err.details}` : ""));
      setStage("idle");
    }
  }

  const summary = {
    done: entries.filter((e) => e.status === "done").length,
    skipped: entries.filter((e) => e.status === "skipped").length,
    errored: entries.filter((e) => e.status === "error").length,
    total: entries.length,
  };

  const isWorking = stage !== "idle";
  const showSummary =
    stage === "extracting" ||
    stage === "saving" ||
    summary.done > 0 ||
    summary.skipped > 0 ||
    summary.errored > 0;

  function buttonLabel(): string {
    if (stage === "scanning") return "Scanning...";
    if (stage === "extracting")
      return `Extracting (${progressIdx}/${entries.length})...`;
    if (stage === "saving") return "Saving tracker...";
    return "Generate Tracker";
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

  const detailsBtnStyle: React.CSSProperties = {
    marginLeft: "0.5em",
    fontSize: "0.85em",
    padding: "0.1em 0.5em",
    background: "transparent",
    border: "1px solid #b71c1c",
    color: "#b71c1c",
    borderRadius: "3px",
    cursor: "pointer",
  };

  const detailsBlockStyle: React.CSSProperties = {
    marginTop: "0.4em",
    marginLeft: "1.5em",
    padding: "0.6em 0.8em",
    background: "#fff",
    border: "1px solid #ffcdd2",
    borderRadius: "4px",
    fontSize: "0.8em",
    color: "#333",
    whiteSpace: "pre-wrap",
    maxHeight: "200px",
    overflowY: "auto",
  };

  return (
    <main className="container">
      <h1>ShotTrackerMaker</h1>
      <p>Phase 4 Gate A — Error visibility</p>

      <button onClick={generateTracker} disabled={isWorking}>
        {buttonLabel()}
      </button>

      {folder && (
        <p style={{ marginTop: "1em", fontSize: "0.85em", color: "#555" }}>
          Folder: <code>{folder}</code>
        </p>
      )}

      {entries.length > 0 && (
        <div style={{ ...panelStyle, background: "#f5f5f5", color: "#000" }}>
          <button
            onClick={clearAll}
            aria-label="Clear"
            style={closeBtnStyle}
            disabled={isWorking}
          >
            ×
          </button>
          <strong>
            {entries.length} video file{entries.length === 1 ? "" : "s"}
            {showSummary && (
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
              maxHeight: "400px",
              overflowY: "auto",
              fontFamily: "monospace",
            }}
          >
            {entries.map((e) => {
              const s = statusLabel(e);
              const expanded = expandedErrors.has(e.path);
              const hasDetails = e.status === "error" && e.errorDetails;
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
                  {hasDetails && (
                    <button
                      onClick={() => toggleErrorDetails(e.path)}
                      style={detailsBtnStyle}
                    >
                      {expanded ? "hide" : "details"}
                    </button>
                  )}
                  {hasDetails && expanded && (
                    <pre style={detailsBlockStyle}>{e.errorDetails}</pre>
                  )}
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
