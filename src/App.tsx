import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function testFfmpeg() {
    setLoading(true);
    setError("");
    setOutput("");
    try {
      const result = await invoke<string>("test_ffmpeg");
      setOutput(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const panelStyle: React.CSSProperties = {
    textAlign: "left",
    whiteSpace: "pre-wrap",
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
      <p>Phase 1 — FFmpeg sidecar test</p>

      <button onClick={testFfmpeg} disabled={loading}>
        {loading ? "Running..." : "Test FFmpeg"}
      </button>

      {output && (
        <pre style={{ ...panelStyle, background: "#e8f5e9", color: "#1b5e20" }}>
          {output}
        </pre>
      )}

      {error && (
        <pre style={{ ...panelStyle, background: "#ffebee", color: "#b71c1c" }}>
          ERROR: {error}
        </pre>
      )}
    </main>
  );
}

export default App;
