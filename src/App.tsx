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
  sourceFolder: string;
  status: EntryStatus;
  pngPath?: string;
  error?: string;
  errorDetails?: string;
  errorCategory?: string;
};

type Stage =
  | "idle"
  | "selecting"
  | "scanning"
  | "extracting"
  | "awaitingDecision"
  | "saving";

type ParsedError = {
  short: string;
  category: string;
  details: string;
};

// Camera-RAW formats we recognize but cannot decode without the
// camera vendor's SDK. Frontend skips these with a friendly note.
const UNSUPPORTED_RAW_REASONS: Record<string, string> = {
  r3d: "RED RAW — vendor SDK required",
  ari: "ARRIRAW — vendor SDK required",
  arx: "ARRIRAW — vendor SDK required",
  braw: "Blackmagic RAW — vendor SDK required",
  crm: "Canon Cinema RAW Light — vendor SDK required",
  rmf: "Canon RAW Movie — vendor SDK required",
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
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
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

  const selectedFoldersRef = useRef<string[]>([]);
  useEffect(() => {
    selectedFoldersRef.current = selectedFolders;
  }, [selectedFolders]);

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
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || path;
  }

  function clearAll() {
    setEntries([]);
    setSelectedFolders([]);
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

  // Open the folder picker and append results.
  // isFirst controls cancel behavior: if first pick is cancelled, return to idle.
  async function pickAndAddFolder(isFirst: boolean) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Pick a folder of video clips",
    });
    if (selected === null) {
      if (isFirst) setStage("idle");
      return;
    }
    const folderPath = selected as string;

    if (selectedFoldersRef.current.includes(folderPath)) {
      setError(`Folder already added: ${basename(folderPath)}`);
      return;
    }

    setStage("scanning");
    setError("");

    try {
      const videoPaths = await invoke<string[]>("list_video_files", {
        folder: folderPath,
      });

      if (videoPaths.length === 0) {
        setError(`No video files found in: ${basename(folderPath)}`);
        setStage(
          selectedFoldersRef.current.length > 0 ? "selecting" : "idle"
        );
        return;
      }

      const existingPaths = new Set(entriesRef.current.map((e) => e.path));
      const newPaths = videoPaths.filter((p) => !existingPaths.has(p));

      setSelectedFolders([...selectedFoldersRef.current, folderPath]);

      const newEntries: VideoEntry[] = newPaths.map((p) => ({
        path: p,
        sourceFolder: folderPath,
        status: "pending" as EntryStatus,
      }));
      setEntries([...entriesRef.current, ...newEntries]);

      if (newPaths.length === 0) {
        setError(
          `All ${videoPaths.length} videos in "${basename(folderPath)}" were already in the list (duplicates skipped).`
        );
      }

      setStage("selecting");
    } catch (e) {
      const err = parseInvokeError(e);
      setError(err.short);
      setStage(
        selectedFoldersRef.current.length > 0 ? "selecting" : "idle"
      );
    }
  }

  async function startGeneration() {
    setError("");
    setSavedPath("");
    setEntries([]);
    setSelectedFolders([]);
    setProgressIdx(0);
    setProgressTotal(0);
    setExpandedErrors(new Set());
    cancelRequestedRef.current = false;

    await pickAndAddFolder(true);
  }

  async function addAnotherFolder() {
    setError("");
    await pickAndAddFolder(false);
  }

  function removeFolder(folderPath: string) {
    const updatedFolders = selectedFoldersRef.current.filter(
      (f) => f !== folderPath
    );
    const updatedEntries = entriesRef.current.filter(
      (e) => e.sourceFolder !== folderPath
    );
    setSelectedFolders(updatedFolders);
    setEntries(updatedEntries);
    setError("");
    if (updatedFolders.length === 0) {
      setStage("idle");
    }
  }

  async function extractIndices(
    items: VideoEntry[],
    indices: number[]
  ): Promise<VideoEntry[]> {
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
      const ext = lower.split(".").pop() || "";
      const skipReason = UNSUPPORTED_RAW_REASONS[ext];
      if (skipReason) {
        items[i] = {
          ...items[i],
          status: "skipped",
          error: skipReason,
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

  function decideNextStep(items: VideoEntry[], firstFolder: string) {
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
      void doSave(items, firstFolder);
      return;
    }

    setStage("awaitingDecision");
  }

  async function doSave(items: VideoEntry[], firstFolder: string) {
    const successful = items.filter((e) => e.status === "done" && e.pngPath);
    if (successful.length === 0) {
      setError("No frames to save.");
      setStage("idle");
      return;
    }

    setStage("saving");

    void firstFolder;
    const defaultName = "shot_tracker_v01.xlsx";

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

  async function extractAll() {
    if (selectedFoldersRef.current.length === 0) return;
    const items = entriesRef.current.map((e) => ({ ...e }));
    if (items.length === 0) {
      setError("No videos to extract.");
      return;
    }
    const indices = items.map((_, i) => i);
    try {
      const finalItems = await extractIndices(items, indices);
      const firstFolder = selectedFoldersRef.current[0];
      decideNextStep(finalItems, firstFolder);
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
    if (selectedFoldersRef.current.length === 0) return;

    try {
      const finalItems = await extractIndices(items, indices);
      const firstFolder = selectedFoldersRef.current[0];
      decideNextStep(finalItems, firstFolder);
    } catch (e) {
      const err = parseInvokeError(e);
      setError(err.short + (err.details ? `\n\nDetails:\n${err.details}` : ""));
      setStage("idle");
    }
  }

  function saveFromDecision() {
    const items = entriesRef.current.map((e) => ({ ...e }));
    const firstFolder = selectedFoldersRef.current[0] || "";
    void doSave(items, firstFolder);
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

  const isWorking =
    stage === "scanning" || stage === "extracting" || stage === "saving";
  const showSummary =
    stage === "extracting" ||
    stage === "saving" ||
    stage === "awaitingDecision" ||
    summary.done > 0 ||
    summary.skipped > 0 ||
    summary.errored > 0 ||
    summary.cancelled > 0;
  const failedCount = summary.errored + summary.cancelled;
  const isMultiFolder = selectedFolders.length > 1;

  function primaryButtonLabel(): string {
    if (stage === "scanning") return "Scanning...";
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
        <p className="tagline">
          Folders of clips → shot tracker. One click flow.
        </p>

        <div className="button-row">
          {stage === "idle" && (
            <button onClick={startGeneration}>Generate Tracker</button>
          )}
          {stage === "selecting" && (
            <>
              <button onClick={addAnotherFolder}>Add Folder…</button>
              <button onClick={extractAll} disabled={entries.length === 0}>
                Extract All ({entries.length})
              </button>
            </>
          )}
          {stage === "scanning" && (
            <button disabled>{primaryButtonLabel()}</button>
          )}
          {stage === "extracting" && (
            <button onClick={cancelExtraction} className="btn-cancel">
              Cancel ({progressIdx}/{progressTotal})
            </button>
          )}
          {stage === "awaitingDecision" && (
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
          )}
          {stage === "saving" && (
            <button disabled>{primaryButtonLabel()}</button>
          )}
        </div>

        {selectedFolders.length > 0 && (
          <div className="folder-chips">
            {selectedFolders.map((f) => (
              <span key={f} className="folder-chip" title={f}>
                <span className="folder-chip-icon">📁</span>
                <span className="folder-chip-name">{basename(f)}</span>
                <button
                  className="folder-chip-remove"
                  onClick={() => removeFolder(f)}
                  disabled={isWorking}
                  aria-label={`Remove ${basename(f)}`}
                  title="Remove folder"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
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
              {selectedFolders.length > 1 &&
                ` from ${selectedFolders.length} folders`}
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
                    {isMultiFolder && (
                      <span className="entry-folder-badge" title={e.sourceFolder}>
                        {basename(e.sourceFolder)}
                      </span>
                    )}
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

        {error && (
          <div className="panel panel--error">
            <button
              onClick={() => setError("")}
              aria-label="Clear"
              className="panel-close-btn"
            >
              ×
            </button>
            <span className="panel-title">⚠ Error</span>
            <div className="error-body">{error}</div>
          </div>
        )}
      </main>
    </>
  );
}

export default App;
