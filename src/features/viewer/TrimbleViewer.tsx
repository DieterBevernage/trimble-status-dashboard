import React from "react";
import {
  connect,
  dispatcherEventListener,
  getConnectEmbedUrl,
  type WorkspaceAPI,
} from "trimble-connect-workspace-api";
import { listModels } from "../../api/tcModels";

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
  const lastInitKeyRef = React.useRef<string | null>(null);
  const inflightRef = React.useRef(false);

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
    if (inflightRef.current) return;
    if (lastInitKeyRef.current === initKey) return;

    inflightRef.current = true;
    lastInitKeyRef.current = initKey;

    const embedApi = (api as any).embed;
    if (!embedApi?.setTokens || !embedApi?.init3DViewer) {
      console.warn("[Viewer] embed.setTokens or embed.init3DViewer not available");
      inflightRef.current = false;
      return;
    }

    try {
      console.log("[Viewer] init3DViewer projectId=", nextProjectId);
      console.log(
        "[Viewer] project viewer url",
        `https://web.connect.trimble.com/projects/${encodeURIComponent(nextProjectId)}/viewer/3d/?projectId=${encodeURIComponent(nextProjectId)}`
      );

      await embedApi.setTokens({ accessToken });

      const models = await listModels(nextProjectId, accessToken);
      const modelIds = models.map((m) => m.id).filter(Boolean);
      const singleVersionId = models.length === 1 ? models[0].versionId ?? null : null;

      console.log("[Viewer] REST models found", modelIds.length);

      if (modelIds.length > 0) {
        await embedApi.init3DViewer({
          projectId: nextProjectId,
          modelId: modelIds.join(","),
          ...(singleVersionId ? { versionId: singleVersionId } : {}),
        });
      } else {
        await embedApi.init3DViewer({ projectId: nextProjectId });
      }

      console.log("[Viewer] init3DViewer ok for projectId", nextProjectId);

      const viewerApi = (api as any).viewer ?? {};
      if (viewerApi.getModels) {
        const loadedModels = await viewerApi.getModels();
        console.log("[Viewer] viewer.getModels after init", loadedModels);
      }

      if (viewerApi.fitToView) {
        await viewerApi.fitToView();
      }
    } catch (error) {
      console.error("[Viewer] init3DViewer failed for projectId", nextProjectId, error);
      lastInitKeyRef.current = null;
    } finally {
      inflightRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    const handleLoad = async () => {
      try {
        const api = await connect(
          iframe,
          (event: string, data: unknown) => {
            if (event === "viewer.onSelectionChanged") {
              onViewerSelectionChanged?.(data);
            }
          },
          CONNECT_TIMEOUT_MS
        );

        if (cancelled) return;

        apiRef.current = api;
        console.log("[Viewer] connect ok");

        if (projectId) {
          await initViewerForProject(api, projectId);
        }

        onApiReady?.(api);
      } catch (error) {
        console.error("[Viewer] connect/init failed", error);
      }
    };

    iframe.addEventListener("load", handleLoad);
    iframe.src = EMBED_URL || getConnectEmbedUrl("prod");

    return () => {
      cancelled = true;
      iframe.removeEventListener("load", handleLoad);
    };
  }, [initViewerForProject, onApiReady, onViewerSelectionChanged]);

  React.useEffect(() => {
    const api = apiRef.current;
    if (!api || !projectId) return;

    initViewerForProject(api, projectId).catch((error) => {
      console.error("[Viewer] init3DViewer failed", error);
    });
  }, [projectId, initViewerForProject]);

  return (
    <iframe
      ref={iframeRef}
      title="Trimble Connect Viewer"
      style={{ width: "100%", height: "100%", border: 0, borderRadius: 8 }}
      allow="clipboard-read; clipboard-write"
    />
  );
}
