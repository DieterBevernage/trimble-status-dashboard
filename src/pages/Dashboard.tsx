import React from "react";
import { useLocation } from "react-router-dom";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";

import { TrimbleViewer } from "../features/viewer/TrimbleViewer";
import { ProjectPickerPanel, type TcProject } from "../features/projects/ProjectPickerPanel";

import { ElementsPanel } from "../features/elements/ElementsPanel";
import { TimelinePanel } from "../features/timeline/TimelinePanel";

import type { ElementRecord, Status, StatusChange } from "../core/types/domain";
import { makeDemoElements, makeDemoHistory } from "../data/demoData";
import { resolveFolderPath, listFolderFiles } from "../api/tcFolders";
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
  const [filesCount, setFilesCount] = React.useState(0);
  const [mappedCount, setMappedCount] = React.useState(0);
  const [loadedCount, setLoadedCount] = React.useState(0);

  // UI toggle: project picker tonen of verbergen
  const [showProjectPicker, setShowProjectPicker] = React.useState(true);

  // Projecten ophalen wanneer api klaar is
  React.useEffect(() => {
    if (!wsApi) return;

    (async () => {
      try {
        const projApi = (wsApi as any).project ?? (wsApi as any).projects;
        const listFn =
          projApi?.getProjects ??
          projApi?.listProjects ??
          projApi?.getAllProjects;

        if (!listFn) {
          console.warn("Geen project listing functie gevonden op api.project");
          setProjects([]);
          return;
        }

        const result = await listFn.call(projApi);

        const normalized: TcProject[] = (result ?? [])
          .map((p: any) => ({
            id: p.id ?? p.projectId ?? p.uuid,
            name: p.name ?? p.projectName ?? p.title ?? "(no name)",
          }))
          .filter((p: TcProject) => !!p.id);

        setProjects(normalized);
      } catch (e) {
        console.error("Projects ophalen faalde:", e);
        setProjects([]);
      }
    })();
  }, [wsApi]);

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

      try {
        // 2) heb ik een actieve projectcontext?
        const p = await api.project?.getProject?.();
        console.log("Active project:", p);
      } catch (e) {
        console.warn("No active project context (ok for picker app):", e);
      }
    })();
  }, [wsApi]);

  // Auto-load IFC models from Productie/IFC
  React.useEffect(() => {
    if (!wsApi || !projectId || !accessToken) return;

    let cancelled = false;

    (async () => {
      setModelsLoading(true);
      setModelsError(null);
      setFilesCount(0);
      setMappedCount(0);
      setLoadedCount(0);

      try {
        const api = wsApi as any;

        console.log("[Viewer] capability probe", {
          viewer: Object.keys(api.viewer ?? {}),
          models: Object.keys(api.models ?? {}),
          embed: Object.keys(api.embed ?? {}),
        });

        const projectApi = api.project ?? api.projects;
        const setFn = projectApi?.setProject ?? projectApi?.selectProject;
        if (setFn) {
          try {
            await setFn.call(projectApi, projectId);
          } catch (error) {
            console.warn("[Viewer] setProject not applicable", error);
          }
        }

        const folderId = await resolveFolderPath(projectId, ["Productie", "IFC"], accessToken);
        if (!folderId) {
          throw new Error("Folder Productie/IFC niet gevonden.");
        }

        const ifcFiles = await listFolderFiles(projectId, folderId, accessToken);
        console.log("[Viewer] Productie/IFC files", ifcFiles);
        setFilesCount(ifcFiles.length);

        if (!ifcFiles.length) {
          throw new Error("Geen IFC bestanden gevonden in Productie/IFC.");
        }

        const models = await listModels(projectId, accessToken);
        console.log("[Viewer] Models response", models);

        const fileIds = new Set(ifcFiles.map((f) => f.id));
        const fileNames = new Set(ifcFiles.map((f) => f.name.toLowerCase()));

        const mappedModels = models.filter((m) => {
          const sourceMatch = m.sourceFileId && fileIds.has(m.sourceFileId);
          const nameMatch = fileNames.has(m.name.toLowerCase());
          return Boolean(sourceMatch || nameMatch);
        });

        setMappedCount(mappedModels.length);
        if (mappedModels.length === 0) {
          throw new Error("Geen models gevonden voor IFC files; check model endpoint response in console.");
        }

        const viewerApi = api.viewer ?? api.embed ?? api.models;
        const loadFn =
          viewerApi?.loadModels ??
          viewerApi?.openModels ??
          viewerApi?.setModels ??
          viewerApi?.addModels ??
          api.models?.load;

        if (!loadFn) {
          throw new Error("No model loading method found on viewer API.");
        }

        const modelIds = mappedModels.map((m) => m.id);
        await loadFn.call(viewerApi, modelIds);
        setLoadedCount(modelIds.length);
      } catch (error) {
        if (!cancelled) {
          setModelsError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wsApi, projectId, accessToken]);

  // Project selecteren -> modellen laden
  async function pickProject(projectIdToPick: string) {
    if (!wsApi) return;

    try {
      setActiveProjectId(projectIdToPick);

      const projectApi = (wsApi as any).project ?? (wsApi as any).projects;
      const setFn = projectApi?.setProject ?? projectApi?.selectProject;
      if (!setFn) throw new Error("Geen setProject functie gevonden.");

      await setFn.call(projectApi, projectIdToPick);

      const modelApi = (wsApi as any).model ?? (wsApi as any).models;
      const getModelsFn =
        modelApi?.getModels ??
        modelApi?.listModels ??
        modelApi?.getAllModels;

      if (!getModelsFn) throw new Error("Geen getModels functie gevonden.");

      const models = await getModelsFn.call(modelApi);
      console.log("Models:", models);

      const viewerApi = (wsApi as any).viewer ?? (wsApi as any).embed;
      const loadFn =
        viewerApi?.loadModels ??
        viewerApi?.openModels ??
        viewerApi?.setModels;

      if (!loadFn) {
        console.warn("Geen loadModels/openModels/setModels functie gevonden.");
        return;
      }

      const modelIds = (models ?? [])
        .map((m: any) => m.id ?? m.modelId)
        .filter(Boolean);

      await loadFn.call(viewerApi, modelIds.length ? modelIds : models);
    } catch (e) {
      console.error("Project kiezen / models laden faalde:", e);
    }
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
            {modelsLoading && `Loading models... (Found ${filesCount} IFC files)`}
            {!modelsLoading && !modelsError && loadedCount > 0 &&
              `Loaded ${loadedCount} models (mapped ${mappedCount})`}
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
                onApiReady={setWsApi}
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