import React from "react";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";
import { TrimbleViewer } from "./features/viewer/TrimbleViewer";
import { ProjectPickerPanel } from "./features/projects/ProjectPickerPanel";

import { ElementsPanel } from "./features/elements/ElementsPanel";
import { TimelinePanel } from "./features/timeline/TimelinePanel";
import type { ElementRecord, Status, StatusChange } from "./core/types/domain";
import { makeDemoElements, makeDemoHistory } from "./data/demoData";

type TcProject = { id: string; name: string };

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const dossierId = params.get("dossierId") ?? "demo";

  // ---------------------------
  // DATA (demo)
  // ---------------------------
  const [elements, setElements] = React.useState<ElementRecord[]>(() => makeDemoElements(dossierId));
  const [historyById, setHistoryById] = React.useState<Record<string, StatusChange[]>>(() =>
    makeDemoHistory(makeDemoElements(dossierId))
  );

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // anchor voor shift-select ranges
  const [lastAnchorId, setLastAnchorId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const next = makeDemoElements(dossierId);
    setElements(next);
    setHistoryById(makeDemoHistory(next));
    setSelectedIds([]);
    setActiveId(null);
    setLastAnchorId(null);
  }, [dossierId]);

  // ---------------------------
  // TRIMBLE CONNECT (viewer + projects)
  // ---------------------------
  const [wsApi, setWsApi] = React.useState<WorkspaceAPI | null>(null);
  const [projects, setProjects] = React.useState<TcProject[]>([]);
  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(null);

  // UI toggle: project picker tonen of verbergen
  const [showProjectPicker, setShowProjectPicker] = React.useState(true);

  // Projecten ophalen zodra WorkspaceAPI klaar is
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
      }
    })();
  }, [wsApi]);

  // Project selecteren → modellen laden
  async function pickProject(projectId: string) {
    if (!wsApi) return;

    try {
      setActiveProjectId(projectId);

      const projectApi = (wsApi as any).project ?? (wsApi as any).projects;
      const setFn = projectApi?.setProject ?? projectApi?.selectProject;
      if (!setFn) throw new Error("Geen setProject functie gevonden.");

      await setFn.call(projectApi, projectId);

      const modelApi = (wsApi as any).model ?? (wsApi as any).models;
      const getModelsFn =
        modelApi?.getModels ??
        modelApi?.listModels ??
        modelApi?.getAllModels;

      if (!getModelsFn) throw new Error("Geen getModels functie gevonden.");

      const models = await getModelsFn.call(modelApi);

      const viewerApi = (wsApi as any).viewer ?? (wsApi as any).embed;
      const loadFn =
        viewerApi?.loadModels ??
        viewerApi?.openModels ??
        viewerApi?.setModels;

      if (!loadFn) {
        console.warn("Geen loadModels/openModels/setModels functie gevonden.");
        return;
      }

      // Sommige builds verwachten ids, andere volledige objects: eerst ids proberen
      const modelIds = (models ?? [])
        .map((m: any) => m.id ?? m.modelId)
        .filter(Boolean);

      await loadFn.call(viewerApi, modelIds.length ? modelIds : models);
    } catch (e) {
      console.error("Project kiezen / models laden faalde:", e);
    }
  }

  // ---------------------------
  // UI selection logic (multi-select zonder checkbox)
  // ---------------------------
  function handleRowMouseDown(id: string, ev: React.MouseEvent) {
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
  // LAYOUT
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
          {/* Viewer toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 600 }}>Viewer</div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              API: {wsApi ? "Connected ✅" : "Connecting…"}
            </div>

            {activeProjectId && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Project: {projects.find((p) => p.id === activeProjectId)?.name ?? activeProjectId}
              </div>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowProjectPicker((v) => !v)}
                style={{ padding: "6px 10px" }}
                disabled={!wsApi}
              >
                {showProjectPicker ? "Hide projects" : "Show projects"}
              </button>
            </div>
          </div>

          {/* Viewer content: (optioneel) project picker + viewer */}
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
              overflow: "auto",
            }}
          >
            <ElementsPanel
              elements={elements}
              selectedIds={selectedIds}
              activeId={activeId}
              onRowMouseDown={handleRowMouseDown}
              onApplyStatusBulk={applyStatusBulk}
            />
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
              overflow: "auto",
            }}
          >
            <TimelinePanel
              selectedIds={selectedIds}
              activeId={activeId}
              historyByElementId={historyById}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
