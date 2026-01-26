import React from "react";
import {
  connect,
  dispatcherEventListener,
  getConnectEmbedUrl,
  type WorkspaceAPI,
} from "trimble-connect-workspace-api";

type Props = {
  onApiReady?: (api: WorkspaceAPI) => void;
  onViewerSelectionChanged?: (sel: any) => void; // later typ je dit strikter
};

export function TrimbleViewer({ onApiReady, onViewerSelectionChanged }: Props) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);

  React.useEffect(() => {
    // nodig om messages van/naar de iframe te ontvangen
    window.addEventListener("message", dispatcherEventListener);
    return () => window.removeEventListener("message", dispatcherEventListener);
  }, []); // :contentReference[oaicite:1]{index=1}

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    (async () => {
      // Embed URL voor de Connect viewer
      const src = getConnectEmbedUrl("prod"); // int/qa/stage/prod :contentReference[oaicite:2]{index=2}
      iframe.src = src;

      // Connect naar de viewer in de iframe
const api = await connect(
  iframe,
  (event: string, data: unknown) => {
    if (event === "viewer.onSelectionChanged") {
      onViewerSelectionChanged?.(data);
    }
  }
);

      if (cancelled) return;
      onApiReady?.(api);
    })().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [onApiReady, onViewerSelectionChanged]);

  return (
    <iframe
      ref={iframeRef}
      title="Trimble Connect Viewer"
      style={{ width: "100%", height: "100%", border: 0, borderRadius: 8 }}
      allow="clipboard-read; clipboard-write"
    />
  );
}
