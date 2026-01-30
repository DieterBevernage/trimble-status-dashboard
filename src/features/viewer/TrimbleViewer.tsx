import React from "react";
import {
  connect,
  dispatcherEventListener,
  getConnectEmbedUrl,
  type WorkspaceAPI,
} from "trimble-connect-workspace-api";

type Props = {
  projectId?: string | null;
  onApiReady?: (api: WorkspaceAPI) => void;
  onViewerSelectionChanged?: (sel: unknown) => void;
};

const EMBED_URL = "https://web.connect.trimble.com/?isEmbedded=true";
const CONNECT_TIMEOUT_MS = 60000;

export function TrimbleViewer({ projectId, onApiReady, onViewerSelectionChanged }: Props) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);

  const apiRef = React.useRef<WorkspaceAPI | null>(null);
  const didSetSrcRef = React.useRef(false);
  const didConnectRef = React.useRef(false);

  // refs om “stale callbacks” te vermijden zonder effect-deps
  const onApiReadyRef = React.useRef<Props["onApiReady"]>(onApiReady);
  const onSelRef = React.useRef<Props["onViewerSelectionChanged"]>(onViewerSelectionChanged);

  React.useEffect(() => {
    onApiReadyRef.current = onApiReady;
  }, [onApiReady]);

  React.useEffect(() => {
    onSelRef.current = onViewerSelectionChanged;
  }, [onViewerSelectionChanged]);

  // init guard
  const lastInitKeyRef = React.useRef<string | null>(null);
  const initInflightRef = React.useRef(false);

  React.useEffect(() => {
    window.addEventListener("message", dispatcherEventListener);
    return () => window.removeEventListener("message", dispatcherEventListener);
  }, []);

  const initViewerForProject = React.useCallback(async (api: WorkspaceAPI, nextProjectId: string) => {
    const accessToken = sessionStorage.getItem("tc_access_token");
    if (!accessToken) {
      console.warn("[Viewer] Missing access token in sessionStorage");
      return;
    }

    const tokenPrefix = accessToken.slice(0, 12);
    const initKey = `${nextProjectId}:${tokenPrefix}`;
    if (initInflightRef.current) return;
    if (lastInitKeyRef.current === initKey) {
      console.log("[Viewer] init skipped (same project/token)");
      return;
    }

    const embedApi = (api as any).embed;
    if (!embedApi?.setTokens || !embedApi?.init3DViewer) {
      console.warn("[Viewer] embed.setTokens or embed.init3DViewer not available");
      return;
    }

    initInflightRef.current = true;
    lastInitKeyRef.current = initKey;

    try {
      console.log("[Viewer] init3DViewer projectId=", nextProjectId);
      await embedApi.setTokens({ accessToken });
      await embedApi.init3DViewer({ projectId: nextProjectId });
      console.log("[Viewer] init3DViewer ok for projectId", nextProjectId);
    } catch (e) {
      console.error("[Viewer] init3DViewer failed", e);
      lastInitKeyRef.current = null; // allow retry after failure
    } finally {
      initInflightRef.current = false;
    }
  }, []);

  // 1) iframe src zetten: één keer
  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (didSetSrcRef.current) return;

    didSetSrcRef.current = true;

    const url = EMBED_URL || getConnectEmbedUrl("prod");
    iframe.src = url;
    console.log("[Viewer] iframe src set", url);
  }, []);

  // 2) connect() één keer na load
  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    const handleLoad = async () => {
      if (didConnectRef.current) return; // prevent double connect
      didConnectRef.current = true;

      try {
        const api = await connect(
          iframe,
          (event: string, data: unknown) => {
            if (event === "viewer.onSelectionChanged") {
              onSelRef.current?.(data);
            }
          },
          CONNECT_TIMEOUT_MS
        );

        if (cancelled) return;

        apiRef.current = api;
        console.log("[Viewer] connect ok");

        onApiReadyRef.current?.(api);

        // init meteen als we al een projectId hebben
        if (projectId) {
          await initViewerForProject(api, projectId);
        }
      } catch (e) {
        console.error("[Viewer] connect failed", e);
        didConnectRef.current = false; // allow retry on reload
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => {
      cancelled = true;
      iframe.removeEventListener("load", handleLoad);
    };
    // LET OP: geen dependencies -> we willen dit niet opnieuw door re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3) projectId changes => init3DViewer zonder iframe reload
  React.useEffect(() => {
    const api = apiRef.current;
    if (!api || !projectId) return;

    initViewerForProject(api, projectId).catch((e) => {
      console.error("[Viewer] init3DViewer failed", e);
    });
  }, [projectId, initViewerForProject]);

  return (
    <iframe
      ref={iframeRef}
      title="Trimble Connect Viewer"
      style={{ width: "100%", height: "100%", border: 0, borderRadius: 8 }}
      allow="clipboard-read; clipboard-write; fullscreen; xr-spatial-tracking"
    />
  );
}
