import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

function App() {
  const [folder, setFolder] = useState<string>("");
  const [videos, setVideos] = useState<string[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

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
      setLoading(true);
      const list = await invoke<string[]>("list_video_files", {
        folder: folderPath,
      });
      setVideos(list);
    } catch (e) {
      setError(String(e));
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }

  function basename(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  }

  const panelStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "1em",
    borderRadius: "6px",
    fontFamily: "monospace",
    fontSize: "0.85em",
    maxWidth: "700px",
    margin: "1.5em auto 0",
  };

  return (
    <main className="container">
      <h1>ShotTrackerMaker</h1>
      <p>Phase 2 Gate A — Folder picker + video file scan</p>

      <button onClick={pickFolder} disabled={loading}>
        {loading ? "Scanning..." : "Pick Folder"}
      </button>

      {folder && (
        <p style={{ marginTop: "1em", fontSize: "0.85em", color: "#555" }}>
          Folder: <code>{folder}</code>
        </p>
      )}

      {videos.length > 0 && (
        <div style={{ ...panelStyle, background: "#f5f5f5", color: "#000" }}>
          <strong>
            {videos.length} video file{videos.length === 1 ? "" : "s"} found:
          </strong>
          <ul
            style={{
              margin: "0.5em 0 0 0",
              paddingLeft: "1.2em",
              maxHeight: "300px",
              overflowY: "auto",
            }}
          >
            {videos.map((v) => (
              <li key={v} style={{ wordBreak: "break-all" }}>
                {basename(v)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {folder && !loading && videos.length === 0 && !error && (
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
          }}
        >
          ERROR: {error}
        </pre>
      )}
    </main>
  );
}

export default App;
