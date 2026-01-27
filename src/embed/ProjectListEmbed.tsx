import React from "react";
import {
  connect,
  dispatcherEventListener,
  getConnectEmbedUrl,
  type WorkspaceAPI,
} from "trimble-connect-workspace-api";

const CONNECT_TIMEOUT_MS = 60000;

type Props = {
  accessToken: string;
  onProjectSelected: (projectId: string, raw: unknown) => void;
  onEvent?: (event: string, data: unknown) => void;
};

function extractProjectId(data: any): string | null {
  if (!data) return null;

  if (typeof data === "string") {
    return data;
  }

  const direct = data.id ?? data.projectId ?? data.identifier;
  if (direct) return String(direct);

  const nested = data.data ?? data.project ?? data.payload;
  if (nested) {
    return (
      nested.id ??
      nested.projectId ??
      nested.identifier ??
      null
    );
  }

  return null;
}

export function ProjectListEmbed({ accessToken, onProjectSelected, onEvent }: Props) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [api, setApi] = React.useState<WorkspaceAPI | null>(null);

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

      const connectedApi = await connect(
        iframe,
        (event: string, data: unknown) => {
          console.log("[Connect Embed]", event, data);
          onEvent?.(event, data);

          if (event === "extension.sessionInvalid") {
            console.warn("[Connect Embed] Session invalid. Please login again.");
          }

          if (event === "embed.onAction") {
            const action = (data as any)?.action ?? (data as any)?.data?.action;
            const projectId = extractProjectId((data as any)?.data ?? data);
            console.log("[Connect Embed] action", action, "projectId", projectId, "data", data);

            if (projectId) {
              onProjectSelected(projectId, data);
            }
          }
        },
        CONNECT_TIMEOUT_MS
      );

      if (!cancelled) {
        setApi(connectedApi);
      }
    })().catch((error) => {
      console.error("Failed to connect to Trimble Connect embed:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [onEvent, onProjectSelected]);

  React.useEffect(() => {
    if (!api) return;

    (async () => {
      try {
        await (api as any).embed?.setTokens?.({ accessToken });
        const projectEmbedFeatures: Record<string, unknown> = {};
        await (api as any).embed?.initProjectList?.({ projectEmbedFeatures });
      } catch (error) {
        console.error("Failed to init Project List embed:", error);
      }
    })();
  }, [api, accessToken]);

  return (
    <iframe
      ref={iframeRef}
      title="Trimble Connect Project List"
      style={{ width: "100%", height: "100%", border: 0, borderRadius: 8 }}
      allow="clipboard-read; clipboard-write"
    />
  );
}