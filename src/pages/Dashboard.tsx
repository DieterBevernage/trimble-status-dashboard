import React from "react";
import { useLocation } from "react-router-dom";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";

import { TrimbleViewer } from "../features/viewer/TrimbleViewer";
import { ProjectPickerPanel, type TcProject } from "../features/projects/ProjectPickerPanel";

import { ElementsPanel } from "../features/elements/ElementsPanel";
import { TimelinePanel } from "../features/timeline/TimelinePanel";

import type { ElementRecord, Status, StatusChange } from "../core/types/domain";
import { makeDemoElements, makeDemoHistory } from "../data/demoData";
import { listFolderFiles, resolveFolderPath } from "../api/tcFolders";
import { listModels } from "../api/tcModels";

export function Dashboard() {
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const queryProjectId = params.get("projectId");
  const queryDossierNummer = params.get("dossierNummer");

  const storedProjectId = sessionStorage.getItem("activeProjectId");
  const storedDossierNummer = sessionStorage.getItem("activeDossierNummer");
  const accessToken = sessionStorage.getItem("tc_access_token");

  const projectId = queryProjectId ?? storedProjectId ?? null;
  const dossierNummer = queryDossierNummer ?? storedDossierNummer ?? null;

  // ---------------------------
  // DATA (demo)
  // ---------------------------
  const [elements, setElements] = React.useState<ElementRecord[]>(() =>
    dossierNummer ? makeDemoElements(dossierNummer) : []
  );
  const [historyById, setHistoryById] = React.useState<Record<string, StatusChange[]>>(() =>
    dossierNummer ? makeDemoHistory(makeDemoElements(dossierNummer)) : {}
  );

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [lastAnchorId, setLastAnchorId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dossierNummer) {
      setElements([]);
      setHistoryById({});
      setSelectedIds([]);
      setActiveId(null);
      setLastAnchorId(null);
      return;
    }

    const next = makeDemoElements(dossierNummer);
    setElements(next);
    setHistoryById(makeDemoHistory(next));
    setSelectedIds([]);
    setActiveId(null);
    setLastAnchorId(null);
  }, [dossierNummer]);

  // ---------------------------
  // TRIMBLE CONNECT
  // ---------------------------
  const [wsApi, setWsApi] = React.useState<WorkspaceAPI | null>(null);
  const [projects, setProjects] = React.useState<TcProject[]>([]);
  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(null);

  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);
  const [modelsFoundCount, setModelsFoundCount] = React.useState(0);
  const [loadedCount, setLoadedCount] = React.useState(0);

  const lastLoadKeyRef = React.useRef<string | null>(null);
  const inflightRef = React.useRef(false);
  const folderProbeKeyRef = React.useRef<string | null>(null);
  const folderProbeInflightRef = React.useRef(false);

  // UI toggle: project picker tonen of verbergen
  const [showProjectPicker, setShowProjectPicker] = React.useState(true);

  // Embedded viewer context: skip Workspace project listing (not applicable)

  // Tijdelijke debug: auth + projectcontext checken zodra API klaar is
  React.useEffect(() => {
    if (!wsApi) return;

    (async () => {
      const api = wsApi as any;
      console.log("API ready?", !!api);

      try {
        // 1) wie ben ik? (als dit faalt: auth/context probleem)
        const me = await api.user?.getUserDetails?.();
        console.log("Me:", me);
      } catch (e) {
        console.error("User details failed (not logged in / not in TC context):", e);
      }
    })();
  }, [wsApi]);

  React.useEffect(() => {
    if (!wsApi) return;

    const api = wsApi as any;

    const debug = {
      api: Object.keys(api),
      project: Object.keys(api.project ?? {}),
      projects: Object.keys(api.projects ?? {}),
      viewer: Object.keys(api.viewer ?? {}),
      embed: Object.keys(api.embed ?? {}),
    };

    console.log("WORKSPACE_API_DEBUG_JSON");
    console.log(JSON.stringify(debug, null, 2));
  }, [wsApi]);

  // Auto-load models via viewer API
  React.useEffect(() => {
    if (!wsApi || !projectId) return;

    const loadKey = projectId;
    if (inflightRef.current) return;
    if (lastLoadKeyRef.current === loadKey) return;

    inflightRef.current = true;
    lastLoadKeyRef.current = loadKey;

    let cancelled = false;

    (async () => {
      setModelsLoading(true);
      setModelsError(null);
      setModelsFoundCount(0);
      setLoadedCount(0);

      try {
        const api = wsApi as any;

        console.log("[Viewer] capability probe", {
          viewer: Object.keys(api.viewer ?? {}),
          models: Object.keys(api.models ?? {}),
          embed: Object.keys(api.embed ?? {}),
        });

        const viewerApi = api.viewer ?? {};
        if (!viewerApi.getModels) {
          throw new Error("viewer.getModels not available");
        }

        const models = await viewerApi.getModels();
        const modelIds = (models ?? [])
          .map((m: any) => m.id ?? m.modelId)
          .filter(Boolean);

        console.log("[Viewer] models found", modelIds.length);
        setModelsFoundCount(modelIds.length);

        if (!modelIds.length) {
          throw new Error("No models found for project in viewer.");
        }

        if (!viewerApi.toggleModel) {
          throw new Error("viewer.toggleModel not available");
        }

        await viewerApi.toggleModel(modelIds, true, true);
        console.log("[Viewer] toggled models", modelIds.length);
        setLoadedCount(modelIds.length);
      } catch (error) {
        if (!cancelled) {
          setModelsError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
        inflightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wsApi, projectId]);

  // Debug: resolve Productie/IFC folder and log mapped models
  React.useEffect(() => {
    if (!projectId || !accessToken) return;

    const tokenPrefix = accessToken.slice(0, 12);
    const probeKey = `${projectId}:${tokenPrefix}`;
    if (folderProbeInflightRef.current) return;
    if (folderProbeKeyRef.current === probeKey) return;

    folderProbeInflightRef.current = true;
    folderProbeKeyRef.current = probeKey;

    let cancelled = false;

    (async () => {
      console.log("[IFC] resolve folder Productie/IFC start", { projectId });
      try {
        const folderId = await resolveFolderPath(projectId, ["Productie", "IFC"], accessToken);
        if (!folderId) {
          console.warn("[IFC] folder Productie/IFC not found for projectId", projectId);
          return;
        }

        console.log("[IFC] folder Productie/IFC found", folderId);

        const ifcFiles = await listFolderFiles(projectId, folderId, accessToken);
        console.log("[IFC] IFC files found", ifcFiles.length, ifcFiles);

        const models = await listModels(projectId, accessToken);
        const fileIds = new Set(ifcFiles.map((f) => f.id));
        const fileNames = new Set(ifcFiles.map((f) => f.name.toLowerCase()));

        const mappedModels = models.filter((m) => {
          const sourceMatch = m.sourceFileId && fileIds.has(m.sourceFileId);
          const nameMatch = fileNames.has(m.name.toLowerCase());
          return Boolean(sourceMatch || nameMatch);
        });

        console.log("[IFC] mapped models for IFC files", mappedModels.length, mappedModels);
      } catch (error) {
        if (!cancelled) {
          console.error("[IFC] folder/model probe failed", error);
        }
      } finally {
        if (!cancelled) {
          folderProbeInflightRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, accessToken]);

  // Project selecteren -> modellen laden
  async function pickProject(projectIdToPick: string) {
    if (!wsApi) return;
    setActiveProjectId(projectIdToPick);
  }

  // ---------------------------
  // MULTISELECT (geen checkbox)
  // ---------------------------
  function onRowMouseDown(id: string, ev: React.MouseEvent) {
    ev.preventDefault();

    const isCtrl = ev.ctrlKey || ev.metaKey;
    const isShift = ev.shiftKey;

    setActiveId(id);

    setSelectedIds((prev) => {
      const ids = elements.map((x) => x.elementId);

      if (isShift && lastAnchorId) {
        const a = ids.indexOf(lastAnchorId);
        const b = ids.indexOf(id);
        if (a === -1 || b === -1) {
          setLastAnchorId(id);
          return [id];
        }
        const [start, end] = a < b ? [a, b] : [b, a];
        const range = ids.slice(start, end + 1);

        if (isCtrl) {
          const set = new Set(prev);
          for (const r of range) set.add(r);
          setLastAnchorId(id);
          return Array.from(set);
        }

        setLastAnchorId(id);
        return range;
      }

      if (isCtrl) {
        const set = new Set(prev);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        setLastAnchorId(id);
        return Array.from(set);
      }

      setLastAnchorId(id);
      return [id];
    });
  }

  function applyStatusBulk(newStatus: Status) {
    const now = new Date().toISOString();

    setElements((prev) =>
      prev.map((e) => (selectedIds.includes(e.elementId) ? { ...e, currentStatus: newStatus } : e))
    );

    setHistoryById((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        const old = elements.find((x) => x.elementId === id)?.currentStatus ?? null;
        const arr = next[id] ? [...next[id]] : [];
        arr.push({
          elementId: id,
          oldStatus: old,
          newStatus,
          changedAt: now,
          changedBy: "you",
        });
        next[id] = arr;
      }
      return next;
    });
  }

  // ---------------------------
  // LAYOUT (geen globale scrollbars)
  // ---------------------------
  return (
    <div style={{ height: "100vh", width: "100vw", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 8,
          boxSizing: "border-box",
          minHeight: 0,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Active projectId: {projectId ?? "-"} | dossier: {dossierNummer ?? "-"}
        </div>

        {/* TOP: Viewer (50%) */}
        <div
          style={{
            flex: "0 0 50%",
            minHeight: 0,
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 8,
            boxSizing: "border-box",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {modelsLoading && `Loading models... (Found ${modelsFoundCount} models)`}
            {!modelsLoading && !modelsError && loadedCount > 0 && `Loaded ${loadedCount} models`}
            {modelsError && `Model load error: ${modelsError}`}
          </div>

          {/* Viewer toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 600 }}>Viewer</div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              API: {wsApi ? "Connected OK" : "Connecting..."}
            </div>

            {activeProjectId && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Project: {projects.find((p) => p.id === activeProjectId)?.name ?? activeProjectId}
              </div>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowProjectPicker((v) => !v)}
                disabled={!wsApi}
                style={{ padding: "6px 10px" }}
              >
                {showProjectPicker ? "Hide projects" : "Show projects"}
              </button>
            </div>
          </div>

          {/* Viewer content */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 8 }}>
            {showProjectPicker && (
              <div style={{ width: 320, flexShrink: 0, minHeight: 0 }}>
                <ProjectPickerPanel
                  projects={projects}
                  activeProjectId={activeProjectId}
                  onPick={pickProject}
                />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <TrimbleViewer
                projectId={projectId}
                onApiReady={(api) => setWsApi((prev) => prev ?? api)}
                onViewerSelectionChanged={(data) => {
                  // later: map viewer selection -> selectedIds
                  console.log("Viewer selection changed:", data);
                }}
              />
            </div>
          </div>
        </div>

        {/* BOTTOM: List + Timeline (50%) */}
        <div style={{ flex: "0 0 50%", minHeight: 0, display: "flex", gap: 8 }}>
          {/* Elementenlijst */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 8,
              boxSizing: "border-box",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {dossierNummer ? (
              <ElementsPanel
                elements={elements}
                selectedIds={selectedIds}
                activeId={activeId}
                onRowMouseDown={onRowMouseDown}
                onApplyStatusBulk={applyStatusBulk}
              />
            ) : (
              <div style={{ padding: 10, opacity: 0.7 }}>Geen dossier mapping, status blijft leeg.</div>
            )}
          </div>

          {/* Tijdlijn */}
          <div
            style={{
              width: 360,
              flexShrink: 0,
              minHeight: 0,
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 8,
              boxSizing: "border-box",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {dossierNummer ? (
              <TimelinePanel
                selectedIds={selectedIds}
                activeId={activeId}
                historyByElementId={historyById}
              />
            ) : (
              <div style={{ padding: 10, opacity: 0.7 }}>Geen dossier mapping, status blijft leeg.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
