import React from "react";
import {
  connect,
  dispatcherEventListener,
  getConnectEmbedUrl,
  type WorkspaceAPI,
} from "trimble-connect-workspace-api";

type Props = {
  onApiReady?: (api: WorkspaceAPI) => void;
  onViewerSelectionChanged?: (sel: unknown) => void;
};

export function TrimbleViewer({ onApiReady, onViewerSelectionChanged }: Props) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);

  React.useEffect(() => {
    window.addEventListener("message", dispatcherEventListener);
    return () => window.removeEventListener("message", dispatcherEventListener);
  }, []);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    (async () => {
      iframe.src = getConnectEmbedUrl("prod");

      const api = await connect(
        iframe,
        (event: string, data: unknown) => {
          if (event === "viewer.onSelectionChanged") {
            onViewerSelectionChanged?.(data);
          }
        }
      );

      if (!cancelled) {
        onApiReady?.(api);
      }
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
