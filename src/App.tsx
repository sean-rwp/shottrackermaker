import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import ExcelJS from "exceljs";
import "./App.css";

type EntryStatus =
  | "pending"
  | "extracting"
  | "done"
  | "skipped"
  | "error"
  | "cancelled";

type VideoEntry = {
  path: string;
  status: EntryStatus;
  pngPath?: string;
  error?: string;
  errorDetails?: string;
  errorCategory?: string;
};

type Stage =
  | "idle"
  | "scanning"
  | "extracting"
  | "awaitingDecision"
  | "saving";

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
  const [progressTotal, setProgressTotal] = useState<number>(0);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const entriesRef = useRef<VideoEntry[]>([]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const cancelRequestedRef = useRef<boolean>(false);
  const backgroundUrlRef = useRef<string>("");

  // Load saved background on mount
  useEffect(() => {
    (async () => {
      try {
        const bytes = await invoke<number[] | null>("get_background");
        if (bytes && bytes.length > 0) {
          const blob = new Blob([new Uint8Array(bytes)]);
          const url = URL.createObjectURL(blob);
          backgroundUrlRef.current = url;
          setBackgroundUrl(url);
        }
      } catch (e) {
        console.error("Failed to load saved background:", e);
      }
    })();
    return () => {
      if (backgroundUrlRef.current) {
        URL.revokeObjectURL(backgroundUrlRef.current);
      }
    };
  }, []);

  // Apply background to body + toggle overlay class
  useEffect(() => {
    if (backgroundUrl) {
      document.body.style.backgroundImage = `url("${backgroundUrl}")`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center center";
      document.body.style.backgroundRepeat = "no-repeat";
      document.body.style.backgroundAttachment = "fixed";
      document.body.classList.add("has-bg");
    } else {
      document.body.style.backgroundImage = "";
      document.body.classList.remove("has-bg");
    }
  }, [backgroundUrl]);

  // Close gear menu on outside click
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest(".gear-container")) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettings]);

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
    setProgressTotal(0);
    setExpandedErrors(new Set());
    cancelRequestedRef.current = false;
  }

  function toggleErrorDetails(path: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function pickBackgroundImage() {
    setShowSettings(false);
    try {
      const selected = await open({
        multiple: false,
        title: "Choose a background image",
        filters: [
          { name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] },
        ],
      });
      if (selected === null) return;
      const sourcePath = selected as string;

      await invoke("set_background_from_path", { sourcePath });

      const bytes = await invoke<number[] | null>("get_background");
      if (bytes && bytes.length > 0) {
        if (backgroundUrlRef.current) {
          URL.revokeObjectURL(backgroundUrlRef.current);
        }
        const blob = new Blob([new Uint8Array(bytes)]);
        const url = URL.createObjectURL(blob);
        backgroundUrlRef.current = url;
        setBackgroundUrl(url);
      }
    } catch (e) {
      const err = parseInvokeError(e);
      setError(err.short);
    }
  }

  async function resetBackground() {
    setShowSettings(false);
    try {
      await invoke("clear_background");
      if (backgroundUrlRef.current) {
        URL.revokeObjectURL(backgroundUrlRef.current);
        backgroundUrlRef.current = "";
      }
      setBackgroundUrl("");
    } catch (e) {
      const err = parseInvokeError(e);
      setError(err.short);
    }
  }

  function statusLabel(e: VideoEntry): { icon: string; text: string } {
    switch (e.status) {
      case "pending":
        return { icon: "·", text: "Pending" };
      case "extracting":
        return { icon: "⏳", text: "Extracting..." };
      case "done":
        return { icon: "✓", text: "Done" };
      case "skipped":
        return { icon: "⊘", text: `Skipped (${e.error || "unknown"})` };
      case "error":
        return { icon: "✗", text: e.error || "Error" };
      case "cancelled":
        return { icon: "⊘", text: "Cancelled" };
    }
  }

  async function extractIndices(items: VideoEntry[], indices: number[]): Promise<VideoEntry[]> {
    cancelRequestedRef.current = false;
    setStage("extracting");
    setProgressTotal(indices.length);
    setProgressIdx(0);

    let processed = 0;

    for (const i of indices) {
      if (cancelRequestedRef.current) {
        for (let k = indices.indexOf(i); k < indices.length; k++) {
          const idx = indices[k];
          items[idx] = { ...items[idx], status: "cancelled" };
        }
        setEntries([...items]);
        break;
      }

      processed++;
      setProgressIdx(processed);

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

      items[i] = {
        ...items[i],
        status: "extracting",
        error: undefined,
        errorDetails: undefined,
        errorCategory: undefined,
      };
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

    return items;
  }

  function decideNextStep(items: VideoEntry[], folderPath: string) {
    const done = items.filter((e) => e.status === "done").length;
    const errored = items.filter((e) => e.status === "error").length;
    const cancelled = items.filter((e) => e.status === "cancelled").length;

    if (done === 0) {
      if (cancelled > 0 && errored === 0) {
        setStage("idle");
      } else {
        setError("No frames could be extracted from this folder.");
        setStage("idle");
      }
      return;
    }

    if (errored === 0 && cancelled === 0) {
      void doSave(items, folderPath);
      return;
    }

    setStage("awaitingDecision");
  }

  async function doSave(items: VideoEntry[], folderPath: string) {
    const successful = items.filter((e) => e.status === "done" && e.pngPath);
    if (successful.length === 0) {
      setError("No frames to save.");
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
      const hasFailures = items.some(
        (e) => e.status === "error" || e.status === "cancelled"
      );
      setStage(hasFailures ? "awaitingDecision" : "idle");
      return;
    }

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
      setStage("idle");
    } catch (e) {
      const err = parseInvokeError(e);
      setError(err.short + (err.details ? `\n\nDetails:\n${err.details}` : ""));
      setStage("idle");
    }
  }

  async function generateTracker() {
    setError("");
    setSavedPath("");
    setEntries([]);
    setFolder("");
    setProgressIdx(0);
    setProgressTotal(0);
    setExpandedErrors(new Set());
    cancelRequestedRef.current = false;

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

      const items: VideoEntry[] = videoPaths.map((p) => ({
        path: p,
        status: "pending" as EntryStatus,
      }));
      setEntries([...items]);

      const indices = items.map((_, i) => i);
      const finalItems = await extractIndices(items, indices);
      decideNextStep(finalItems, folderPath);
    } catch (e) {
      const err = parseInvokeError(e);
      setError(err.short + (err.details ? `\n\nDetails:\n${err.details}` : ""));
      setStage("idle");
    }
  }

  async function retryFailed() {
    const current = entriesRef.current;
    const items: VideoEntry[] = current.map((e) => ({ ...e }));
    const indices: number[] = items
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.status === "error" || e.status === "cancelled")
      .map(({ i }) => i);

    if (indices.length === 0) return;
    if (!folder) return;

    try {
      const finalItems = await extractIndices(items, indices);
      decideNextStep(finalItems, folder);
    } catch (e) {
      const err = parseInvokeError(e);
      setError(err.short + (err.details ? `\n\nDetails:\n${err.details}` : ""));
      setStage("idle");
    }
  }

  function saveFromDecision() {
    const items = entriesRef.current.map((e) => ({ ...e }));
    void doSave(items, folder);
  }

  function cancelExtraction() {
    cancelRequestedRef.current = true;
  }

  const summary = {
    done: entries.filter((e) => e.status === "done").length,
    skipped: entries.filter((e) => e.status === "skipped").length,
    errored: entries.filter((e) => e.status === "error").length,
    cancelled: entries.filter((e) => e.status === "cancelled").length,
    total: entries.length,
  };

  const isWorking = stage !== "idle" && stage !== "awaitingDecision";
  const showSummary =
    stage === "extracting" ||
    stage === "saving" ||
    stage === "awaitingDecision" ||
    summary.done > 0 ||
    summary.skipped > 0 ||
    summary.errored > 0 ||
    summary.cancelled > 0;
  const failedCount = summary.errored + summary.cancelled;

  function primaryButtonLabel(): string {
    if (stage === "scanning") return "Scanning...";
    if (stage === "extracting")
      return `Extracting (${progressIdx}/${progressTotal})...`;
    if (stage === "saving") return "Saving tracker...";
    return "Generate Tracker";
  }

  return (
    <>
      <div className="gear-container">
        <button
          className="gear-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings((s) => !s);
          }}
          aria-label="Settings"
          title="Background"
        >
          ⚙
        </button>
        {showSettings && (
          <div className="gear-menu">
            <button onClick={pickBackgroundImage}>Set background…</button>
            {backgroundUrl && (
              <button onClick={resetBackground}>Reset background</button>
            )}
          </div>
        )}
      </div>

      <main className="container">
        <h1>ShotTrackerMaker</h1>
        <p className="tagline">Folder of clips → shot tracker. One click.</p>

        <div className="button-row">
          {stage === "extracting" ? (
            <button onClick={cancelExtraction} className="btn-cancel">
              Cancel ({progressIdx}/{progressTotal})
            </button>
          ) : stage === "awaitingDecision" ? (
            <>
              <button onClick={saveFromDecision}>
                Save Tracker ({summary.done} done)
              </button>
              {failedCount > 0 && (
                <button onClick={retryFailed}>
                  Retry Failed ({failedCount})
                </button>
              )}
            </>
          ) : (
            <button onClick={generateTracker} disabled={isWorking}>
              {primaryButtonLabel()}
            </button>
          )}
        </div>

        {folder && (
          <p className="folder-path">
            Folder: <code>{folder}</code>
          </p>
        )}

        {entries.length > 0 && (
          <div className="panel panel--neutral">
            <button
              onClick={clearAll}
              aria-label="Clear"
              className="panel-close-btn"
              disabled={isWorking}
            >
              ×
            </button>
            <span className="panel-title">
              {entries.length} video file{entries.length === 1 ? "" : "s"}
              {showSummary && (
                <span className="summary-detail">
                  — {summary.done} done
                  {summary.skipped > 0 && `, ${summary.skipped} skipped`}
                  {summary.errored > 0 && `, ${summary.errored} errored`}
                  {summary.cancelled > 0 && `, ${summary.cancelled} cancelled`}
                </span>
              )}
            </span>
            <ul className="entries-list">
              {entries.map((e) => {
                const s = statusLabel(e);
                const expanded = expandedErrors.has(e.path);
                const hasDetails = e.status === "error" && !!e.errorDetails;
                return (
                  <li key={e.path} className="entry-row">
                    <span className={`entry-icon status-${e.status}`}>
                      {s.icon}
                    </span>
                    <span className="entry-name">{basename(e.path)}</span>
                    <span className={`entry-status status-${e.status}`}>
                      — {s.text}
                    </span>
                    {hasDetails && (
                      <button
                        onClick={() => toggleErrorDetails(e.path)}
                        className="entry-details-btn"
                      >
                        {expanded ? "hide" : "details"}
                      </button>
                    )}
                    {hasDetails && expanded && (
                      <pre className="entry-details-block">{e.errorDetails}</pre>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {savedPath && (
          <div className="panel panel--success">
            <button
              onClick={() => setSavedPath("")}
              aria-label="Clear"
              className="panel-close-btn"
            >
              ×
            </button>
            <span className="panel-title">✓ Tracker saved</span>
            <div className="saved-path">{savedPath}</div>
          </div>
        )}

        {error && <pre className="panel panel--error">ERROR: {error}</pre>}
      </main>
    </>
  );
}

export default App;
