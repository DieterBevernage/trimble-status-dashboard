import React from "react";

export type TcProject = {
  id: string;
  name: string;
};

type Props = {
  projects: TcProject[];
  activeProjectId: string | null;
  onPick: (projectId: string) => void;
  loading?: boolean;
  error?: string | null;
};

export function ProjectPickerPanel({ projects, activeProjectId, onPick, loading, error }: Props) {
  const [q, setQ] = React.useState("");

  const trimmedQuery = q.trim();
  const filtered = React.useMemo(() => {
    if (trimmedQuery.length < 3) return [];
    const lowered = trimmedQuery.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(lowered)).slice(0, 20);
  }, [projects, trimmedQuery]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", padding: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

        <input 
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Typ minstens 3 tekens..."
          style={{ flex: 1, padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 16 }}
        />
      </div>

      <div style={{ minHeight: 20 }}>
        {loading && <div style={{ fontSize: 12, opacity: 0.7 }}>Projecten laden...</div>}
        {error && <div style={{ color: "#b00020" }}>Projecten ophalen faalde: {error}</div>}
        {!loading && !error && trimmedQuery.length < 3 && (
          <div style={{ fontSize: 12, opacity: 0.7 }}>Typ min. 3 tekens...</div>
        )}
      </div>

      <div style={{ overflow: "auto", border: "1px solid #eee", borderRadius: 8 }}>
        {trimmedQuery.length < 3 ? (
          <div style={{ padding: 10, opacity: 0.7 }}>Nog geen resultaten.</div>
        ) : (
          <>
            {filtered.map((p) => {
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
          </>
        )}
      </div>
    </div>
  );
}
