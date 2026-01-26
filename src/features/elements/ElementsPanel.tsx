import React from "react";
import type { ElementRecord, Status } from "../../core/types/domain";
import { STATUSES } from "../../data/demoData";

type Props = {
  elements: ElementRecord[];
  selectedIds: string[];
  activeId: string | null;

  // NEW: multiselect handler met muis-event
  onRowMouseDown: (id: string, ev: React.MouseEvent) => void;

  onApplyStatusBulk: (newStatus: Status) => void;
};

export function ElementsPanel({
  elements,
  selectedIds,
  activeId,
  onRowMouseDown,
  onApplyStatusBulk,
}: Props) {
  const [bulkStatus, setBulkStatus] = React.useState<Status>("In uitvoering");
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>Elementenlijst</div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.8 }}>Selectie: {selectedIds.length}</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => onApplyStatusBulk(bulkStatus)}
            disabled={selectedIds.length === 0}
            style={{ padding: "6px 10px" }}
          >
            Apply to selected
          </button>
        </div>
      </div>

      <div style={{ overflow: "auto", border: "1px solid #eee", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#fafafa" }}>
              <th style={{ padding: 8 }}>Element</th>
              <th style={{ padding: 8 }}>Model</th>
              <th style={{ padding: 8 }}>Status</th>
            </tr>
          </thead>

          <tbody>
            {elements.map((e) => {
              const isSelected = selectedSet.has(e.elementId);
              const isActive = activeId === e.elementId;

              return (
                <tr
                  key={e.elementId}
                  onMouseDown={(ev) => onRowMouseDown(e.elementId, ev)}
                  onMouseEnter={() => setHoveredId(e.elementId)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    cursor: "pointer",
                    userSelect: "none",
                    background: isActive ? "#d1e8fc" : isSelected ? "#d1e8fc" : hoveredId === e.elementId ? "#f0f8ff" : "transparent",
                    borderTop: "1px solid #eee",
                  }}
                  title="Click = select • Ctrl+Click = toggle • Shift+Click = range"
                >
                  <td style={{ padding: 8 }}>
                    <div style={{ fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{e.elementId}</div>
                  </td>
                  <td style={{ padding: 8 }}>{e.modelId}</td>
                  <td style={{ padding: 8 }}>{e.currentStatus}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Tip: Click = 1 select, Ctrl+Click = toggle, Shift+Click = range
      </div>
    </div>
  );
}