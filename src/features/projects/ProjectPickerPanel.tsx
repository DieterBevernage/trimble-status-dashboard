import React from "react";

export type TcProject = {
  id: string;
  name: string;
};

type Props = {
  projects: TcProject[];
  activeProjectId: string | null;
  onPick: (projectId: string) => void;
};

export function ProjectPickerPanel({ projects, activeProjectId, onPick }: Props) {
  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter(p => p.name.toLowerCase().includes(query));
  }, [projects, q]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>Projecten</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek project..."
          style={{ flex: 1, padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6 }}
        />
      </div>

      <div style={{ overflow: "auto", border: "1px solid #eee", borderRadius: 8 }}>
        {filtered.map(p => {
          const active = p.id === activeProjectId;
          return (
            <div
              key={p.id}
              onClick={() => onPick(p.id)}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                background: active ? "rgba(0,0,0,0.06)" : "transparent",
                borderBottom: "1px solid #f2f2f2",
                fontWeight: active ? 600 : 400
              }}
              title={p.name}
            >
              {p.name}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 10, opacity: 0.7 }}>Geen projecten gevonden.</div>
        )}
      </div>
    </div>
  );
}
