import React from "react";
import { ElementsPanel } from "./features/elements/ElementsPanel";
import { TimelinePanel } from "./features/timeline/TimelinePanel";
import type { ElementRecord, Status, StatusChange } from "./core/types/domain";
import { makeDemoElements, makeDemoHistory } from "./data/demoData";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";
import { TrimbleViewer } from "./features/viewer/TrimbleViewer";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const dossierId = params.get("dossierId") ?? "demo";

  const [elements, setElements] = React.useState<ElementRecord[]>(() => makeDemoElements(dossierId));
  const [historyById, setHistoryById] = React.useState<Record<string, StatusChange[]>>(() =>
    makeDemoHistory(makeDemoElements(dossierId))
  );

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // anchor voor shift-select ranges
  const [lastAnchorId, setLastAnchorId] = React.useState<string | null>(null);

  const [wsApi, setWsApi] = React.useState<WorkspaceAPI | null>(null);

  // Als dossierId wijzigt (andere page), reset demo data
  React.useEffect(() => {
    const next = makeDemoElements(dossierId);
    setElements(next);
    setHistoryById(makeDemoHistory(next));
    setSelectedIds([]);
    setActiveId(null);
    setLastAnchorId(null);
  }, [dossierId]);


  function clearViewerSelection() {
    // best-effort: in sommige builds heet het clearSelection, in andere setSelection([])
    const v: any = wsApi?.viewer;
    v?.clearSelection?.();
    v?.setSelection?.([]);
  }

  function applyStatusBulk(newStatus: Status) {
    const now = new Date().toISOString();

    // Update current status voor geselecteerden
    setElements((prev) =>
      prev.map((e) => {
        if (!selectedIds.includes(e.elementId)) return e;
        return { ...e, currentStatus: newStatus };
      })
    );

    // Append history events
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

  function handleRowMouseDown(id: string, ev: React.MouseEvent) {
    ev.preventDefault(); // voorkomt tekst-selectie bij shift-click etc.

    const isCtrl = ev.ctrlKey || ev.metaKey; // metaKey voor Mac
    const isShift = ev.shiftKey;

    setActiveId(id);

    setSelectedIds((prev) => {
      const ids = elements.map((x) => x.elementId);

      // SHIFT: range select vanaf anchor
      if (isShift && lastAnchorId) {
        const a = ids.indexOf(lastAnchorId);
        const b = ids.indexOf(id);
        if (a === -1 || b === -1) {
          // fallback: enkel deze
          setLastAnchorId(id);
          return [id];
        }

        const [start, end] = a < b ? [a, b] : [b, a];
        const range = ids.slice(start, end + 1);

        // SHIFT + CTRL: range toevoegen aan bestaande selectie
        if (isCtrl) {
          const set = new Set(prev);
          for (const r of range) set.add(r);
          setLastAnchorId(id);
          return Array.from(set);
        }

        // SHIFT zonder CTRL: range vervangt selectie
        setLastAnchorId(id);
        return range;
      }

      // CTRL: toggle
      if (isCtrl) {
        const set = new Set(prev);
        if (set.has(id)) set.delete(id);
        else set.add(id);

        setLastAnchorId(id);
        return Array.from(set);
      }

      // gewone click: enkel deze
      setLastAnchorId(id);
      return [id];
    });
  }

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
        {/* TOP: Viewer – 50% */}
        <div
          style={{
            flex: "0 0 50%",
            minHeight: 0,
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 8,
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 600 }}>Viewer</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Status: {wsApi ? "Connected ✅" : "Connecting…"}
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button onClick={clearViewerSelection} disabled={!wsApi} style={{ padding: "6px 10px" }}>
                Clear selection
              </button>
            </div>
          </div>

          <div style={{ height: "calc(100% - 36px)", marginTop: 8 }}>
            <TrimbleViewer
              onApiReady={setWsApi}
              onViewerSelectionChanged={(arg) => {
                // arg.data bevat de selection (later mappen naar jouw elementIds)
                console.log("Viewer selection changed:", arg);
              }} />
          </div>

          {/*<div style={{ fontWeight: 600 }}>Viewer (Trimble komt hier)</div>*/}
          <div style={{ opacity: 0.7, marginTop: 6 }}>Dossier: {dossierId}</div>
        </div>

        {/* BOTTOM: 50% */}
        <div
          style={{
            flex: "0 0 50%",
            minHeight: 0,
            display: "flex",
            gap: 8,
          }}
        >
          {/* Elementenlijst (intern scroll) */}
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

          {/* Tijdlijn (intern scroll) */}
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
            <TimelinePanel selectedIds={selectedIds} activeId={activeId} historyByElementId={historyById} />
          </div>
        </div>
      </div>
    </div >
  );
}