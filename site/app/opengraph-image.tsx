import { ImageResponse } from "next/og";

export const alt = "Wordcell: a knowledge base for coding agents";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#f8f7f4",
          color: "#1c1a18",
          display: "flex",
          flexDirection: "column",
          fontFamily: "serif",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px 80px",
          width: "100%",
        }}
      >
        <div style={{ color: "#8a857e", fontSize: 28, letterSpacing: 2, textTransform: "uppercase" }}>
          Wordcell
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
            A knowledge base for coding agents
          </div>
          <div style={{ color: "#4a463f", fontSize: 32, lineHeight: 1.35 }}>
            Markdown, backlinks, semantic search, and Git context — inspectable
            memory your agents can recover across sessions.
          </div>
        </div>
        <div style={{ color: "#8a857e", fontSize: 26 }}>wordcell.io</div>
      </div>
    ),
    size,
  );
}
