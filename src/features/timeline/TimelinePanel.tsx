import type { StatusChange } from "../../core/types/domain";

type Props = {
  selectedIds: string[];
  activeId: string | null;
  historyByElementId: Record<string, StatusChange[]>;
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function TimelinePanel({ selectedIds, activeId, historyByElementId }: Props) {
  const showIds = selectedIds.length > 0 ? selectedIds : activeId ? [activeId] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%"  }}>
      <div style={{ fontWeight: 600 }}>Tijdlijn</div>

      {showIds.length === 0 ? (
        <div style={{ opacity: 0.7 }}>Selecteer een element om de historiek te zien.</div>
      ) : (
        <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {showIds.map((id) => {
            const items = (historyByElementId[id] ?? []).slice().sort((a, b) => a.changedAt.localeCompare(b.changedAt));
            return (
              <div key={id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, background: "white",  }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{id}</div>
                {items.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Geen historiek.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, }}>
                    {items.map((h, idx) => (
                      <li key={idx}>
                        <div>
                          <b>{h.newStatus}</b>{" "}
                          <span style={{ opacity: 0.75 }}>
                            ({h.oldStatus ?? "—"} → {h.newStatus})
                          </span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {fmt(h.changedAt)} {h.changedBy ? `• ${h.changedBy}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}