import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";

import { TrimbleViewer } from "../features/viewer/TrimbleViewer";
import { ProjectPickerPanel, type TcProject } from "../features/projects/ProjectPickerPanel";

import { ElementsPanel } from "../features/elements/ElementsPanel";
import { TimelinePanel } from "../features/timeline/TimelinePanel";

import type { ElementRecord, Status, StatusChange } from "../core/types/domain";
import { makeDemoElements, makeDemoHistory } from "../data/demoData";
import { fetchProjects } from "../api/tcProjects";
import { listFolderFiles, resolveFolderPath } from "../api/tcFolders";
import { listModels } from "../api/tcModels";

// TEMPORARILY DISABLED: deep IFC/model probing causes CORS errors
const ENABLE_DEEP_FETCH = false;

export function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const queryProjectId = params.get("projectId");
  const queryDossierNummer = params.get("dossierNummer");

  const storedProjectId = sessionStorage.getItem("activeProjectId");
  const storedDossierNummer = sessionStorage.getItem("activeDossierNummer");
  const accessToken = sessionStorage.getItem("tc_access_token");

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
  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(
    () => queryProjectId ?? storedProjectId ?? null
  );
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const [projectsError, setProjectsError] = React.useState<string | null>(null);
  const [viewerModels, setViewerModels] = React.useState<unknown[]>([]);

  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);
  const [modelsFoundCount, setModelsFoundCount] = React.useState(0);
  const [loadedCount, setLoadedCount] = React.useState(0);

  const lastLoadKeyRef = React.useRef<string | null>(null);
  const inflightRef = React.useRef(false);
  const folderProbeKeyRef = React.useRef<string | null>(null);
  const folderProbeInflightRef = React.useRef(false);
  const lastProjectIdRef = React.useRef<string | null>(null);

  // UI toggle: project picker tonen of verbergen
  const [showProjectPicker, setShowProjectPicker] = React.useState(false);

  // Embedded viewer context: skip Workspace project listing (not applicable)
  React.useEffect(() => {
    if (activeProjectId !== null) return;
    setActiveProjectId(queryProjectId ?? storedProjectId ?? null);
  }, [activeProjectId, queryProjectId, storedProjectId]);

  const effectiveProjectId = activeProjectId;

  React.useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    (async () => {
      setProjectsLoading(true);
      setProjectsError(null);

      try {
        const result = await fetchProjects(accessToken);
        if (!cancelled) {
          setProjects(result);
        }
      } catch (error) {
        if (!cancelled) {
          setProjectsError(error instanceof Error ? error.message : String(error));
          setProjects([]);
        }
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

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
    if (!wsApi || !effectiveProjectId) return;

    const loadKey = effectiveProjectId;
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
  }, [wsApi, effectiveProjectId]);

  // Debug: resolve Productie/IFC folder and log mapped models
  React.useEffect(() => {
    if (!ENABLE_DEEP_FETCH) return;
    if (!effectiveProjectId || !accessToken) return;

    const tokenPrefix = accessToken.slice(0, 12);
    const probeKey = `${effectiveProjectId}:${tokenPrefix}`;
    if (folderProbeInflightRef.current) return;
    if (folderProbeKeyRef.current === probeKey) return;

    folderProbeInflightRef.current = true;
    folderProbeKeyRef.current = probeKey;

    let cancelled = false;

    (async () => {
      console.log("[IFC] resolve folder Productie/IFC start", { projectId: effectiveProjectId });
      try {
        const folderId = await resolveFolderPath(
          effectiveProjectId,
          ["Productie", "IFC"],
          accessToken
        );
        if (!folderId) {
          console.warn("[IFC] folder Productie/IFC not found for projectId", effectiveProjectId);
          return;
        }

        console.log("[IFC] folder Productie/IFC found", folderId);

        const ifcFiles = await listFolderFiles(effectiveProjectId, folderId, accessToken);
        console.log("[IFC] IFC files found", ifcFiles.length, ifcFiles);

        const models = await listModels(effectiveProjectId, accessToken);
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
  }, [effectiveProjectId, accessToken]);

  React.useEffect(() => {
    if (!effectiveProjectId) return;
    setSelectedIds([]);
    setActiveId(null);
    setLastAnchorId(null);
    setViewerModels([]);
    if (lastProjectIdRef.current && lastProjectIdRef.current !== effectiveProjectId) {
      setShowProjectPicker(false);
    }
    lastProjectIdRef.current = effectiveProjectId;
  }, [effectiveProjectId]);

  // Project selecteren -> modellen laden
  async function pickProject(projectIdToPick: string) {
    setActiveProjectId(projectIdToPick);
    sessionStorage.setItem("activeProjectId", projectIdToPick);
    const dossierParam = dossierNummer ? `&dossierNummer=${encodeURIComponent(dossierNummer)}` : "";
    navigate(`/dashboard?projectId=${encodeURIComponent(projectIdToPick)}${dossierParam}`, {
      replace: true,
    });
    setShowProjectPicker(true);
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
    <div style={{ height: "100vh", width: "100vw", overflow: "hidden",}}>
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", // links | rechts
          gap: 8,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 8,
          paddingBottom: 8,
          boxSizing: "border-box",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {/* ================= LEFT COLUMN ================= */}
        <div
          style={{
            minHeight: 0,
            minWidth: 0,
            position: "relative",
            border: "1px solid #ccc",
            borderRadius: 8,
            overflow: "hidden",
            display: "grid",
            gridTemplateRows: "auto minmax(0, 3fr) minmax(0, 1fr)",
            background: "white",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: 8,
              borderBottom: "1px solid #eee",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>Projectpicker</div>

            <div style={{ marginLeft: "auto" }}>
              <button
                onClick={() => setShowProjectPicker(v => !v)}
                disabled={!wsApi}
                style={{ padding: "6px 10px" }}
              >
                {showProjectPicker ? "Hide projects" : "Show projects"}
              </button>
            </div>
          </div>

          {/* Elementenlijst */}
          <div style={{ minHeight: 0, overflow: "hidden", padding: 8 }}>
            {dossierNummer ? (
              <ElementsPanel
                elements={elements}
                selectedIds={selectedIds}
                activeId={activeId}
                onRowMouseDown={onRowMouseDown}
                onApplyStatusBulk={applyStatusBulk}
              />
            ) : (
              <div style={{ opacity: 0.7 }}>Geen dossier mapping</div>
            )}
          </div>

          {/* Tijdlijn */}
          <div
            style={{
              minHeight: 0,
              padding: 8,
              boxSizing: "border-box",
              overflow: "hidden",
              // belangrijk: kader blijft proper
            }}
          >
            <div
              style={{
                height: "100%",
                border: "1px solid #cac8c8",
                borderRadius: 8,

                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                background: "#f5f5f5"
              }}
            >
              {/* Scrollbare inhoud */}
              <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 8 }}>
                {dossierNummer ? (
                  <TimelinePanel
                    selectedIds={selectedIds}
                    activeId={activeId}
                    historyByElementId={historyById}
                  />
                ) : (
                  <div style={{ opacity: 0.7 }}>Geen dossier mapping, status blijft leeg.</div>
                )}
              </div>
            </div>
          </div>

          {/* ===== Projectpicker overlay ===== */}
          {showProjectPicker && (
            <>
              <div
                onClick={() => setShowProjectPicker(false)}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 40,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 60,
                  left: 8,
                  right: 8,
                  bottom: 5,
                  zIndex: 50,
                  background: "white",
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    padding: 8,
                    borderBottom: "1px solid #eee",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Projecten</div>
                  <button
                    onClick={() => setShowProjectPicker(false)}
                    style={{ marginLeft: "auto" }}
                  >
                    Sluiten
                  </button>
                </div>

                <div style={{ flex: 1, overflow: "auto" }}>
                  <ProjectPickerPanel
                    projects={projects}
                    activeProjectId={activeProjectId}
                    onPick={pickProject}
                    loading={projectsLoading}
                    error={projectsError}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ================= RIGHT COLUMN ================= */}
        <div
          style={{
            minHeight: 0,
            minWidth: 0,
            border: "1px solid #ccc",
            borderRadius: 8,
            overflow: "hidden",
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr) auto", // toolbar | viewer | footer
            background: "white",
          }}
        >
          {/* Viewer toolbar */}
          <div
            style={{
              padding: 8,
              borderBottom: "1px solid #eee",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: "#c00" }}>TRIMBLEVIEWER</div>



            <div style={{ fontWeight: 600 }}>
              Project: {effectiveProjectId ?? "-"} | dossier: {dossierNummer ?? "-"}
            </div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              API: {wsApi ? "Connected OK" : "Connecting..."}
            </div>

            <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>
              {modelsLoading && "Loading models..."}
              {modelsError && `Error: ${modelsError}`}
              {!modelsLoading && !modelsError && viewerModels.length > 0 && (
                <>Loaded models: {viewerModels.length}</>
              )}
            </div>
          </div>

          {/* Viewer */}
          <div style={{ minHeight: 0 }}>
            <TrimbleViewer
              projectId={effectiveProjectId}
              onApiReady={(api) => setWsApi((prev) => prev ?? api)}
              onViewerModelsChanged={(models) => setViewerModels(models)}
            />
          </div>
        </div>
      </div>
    </div>

  );
}
