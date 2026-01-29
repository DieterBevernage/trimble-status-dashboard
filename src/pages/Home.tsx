import React from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthStorage, getAuthConfig, getStoredAccessToken, startOAuthLogin } from "../auth/trimbleAuth";
import { MockDossierResolver, parseDossierNummerFromProjectName } from "../dossier/MockDossierResolver";
import { ProjectListEmbed } from "../embed/ProjectListEmbed";
import { fetchProjects, type TcProject } from "../api/tcProjects";

export function Home() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = React.useState<string | null>(getStoredAccessToken());
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = React.useState<string | null>(null);
  const [dossierNummer, setDossierNummer] = React.useState<string | null>(null);
  const [mappingError, setMappingError] = React.useState<string | null>(null);
  const [loginError, setLoginError] = React.useState<string | null>(null);

  const [projects, setProjects] = React.useState<TcProject[]>([]);
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const [projectsError, setProjectsError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  const resolver = React.useMemo(() => new MockDossierResolver(), []);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      console.log("[OAuth Login] VITE_TRIMBLE_REDIRECT_URI:", import.meta.env.VITE_TRIMBLE_REDIRECT_URI);
      const authConfig = getAuthConfig();
      console.log("[OAuth Login] redirect_uri:", authConfig.redirectUri);
      const url = await startOAuthLogin();
      window.location.assign(url);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleLogout = () => {
    clearAuthStorage();
    setAccessToken(null);
    setSelectedProjectId(null);
    setSelectedProjectName(null);
    setDossierNummer(null);
    setMappingError(null);
    setProjects([]);
    setProjectsError(null);
    setProjectsLoading(false);
    setQ("");
  };

  const handleProjectSelected = async (projectId: string, projectName?: string | null) => {
    const resolvedName = projectName ?? projects.find((p) => p.id === projectId)?.name ?? null;

    console.log("[Project] selected", { projectId, projectName: resolvedName });

    setSelectedProjectId(projectId);
    setSelectedProjectName(resolvedName ?? null);
    setMappingError(null);

    let resolvedDossier = await resolver.resolve(projectId);
    if (!resolvedDossier && resolvedName) {
      resolvedDossier = parseDossierNummerFromProjectName(resolvedName);
    }

    if (!resolvedDossier) {
      setMappingError(`Geen dossier mapping voor projectId ${projectId}.`);
    }

    setDossierNummer(resolvedDossier ?? null);

    sessionStorage.setItem("activeProjectId", projectId);
    if (resolvedDossier) {
      sessionStorage.setItem("activeDossierNummer", resolvedDossier);
    } else {
      sessionStorage.removeItem("activeDossierNummer");
    }

    const dossierParam = resolvedDossier
      ? `&dossierNummer=${encodeURIComponent(resolvedDossier)}`
      : "";
    navigate(`/dashboard?projectId=${encodeURIComponent(projectId)}${dossierParam}`);
  };

  React.useEffect(() => {
    const stored = getStoredAccessToken();
    if (stored !== accessToken) {
      setAccessToken(stored);
    }
  }, [accessToken]);

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

  const trimmedQuery = q.trim();
  const filteredProjects = React.useMemo(() => {
    if (trimmedQuery.length < 3) return [];
    const lowered = trimmedQuery.toLowerCase();
    return projects
      .filter((p) => p.name.toLowerCase().includes(lowered))
      .slice(0, 20);
  }, [projects, trimmedQuery]);

  const showEmbeddedList = false;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Trimble Status Dashboard</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {!accessToken ? (
            <button onClick={handleLogin} style={{ padding: "6px 12px" }}>
              Login met Trimble
            </button>
          ) : (
            <button onClick={handleLogout} style={{ padding: "6px 12px" }}>
              Logout
            </button>
          )}
        </div>
      </div>

      {loginError && (
        <div style={{ color: "#b00020" }}>Login fout: {loginError}</div>
      )}

      {!accessToken ? (
        <div>
          Je bent niet ingelogd. Klik "Login met Trimble" om verder te gaan.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
          <div>Logged in. Token aanwezig in sessionStorage.</div>
          <div>Ingelogd. Selecteer een project om de mapping te bepalen.</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
            <div style={{ fontWeight: 600 }}>Zoek project</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Typ minstens 3 tekens..."
              style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6 }}
            />

            <div style={{ minHeight: 20 }}>
              {projectsLoading && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>Projecten laden...</div>
              )}
              {projectsError && (
                <div style={{ color: "#b00020" }}>Projecten ophalen faalde: {projectsError}</div>
              )}
              {!projectsLoading && !projectsError && trimmedQuery.length < 3 && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>Typ min. 3 tekens...</div>
              )}
            </div>

            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 8,
                overflow: "auto",
                height: 240,
              }}
            >
              {trimmedQuery.length < 3 ? (
                <div style={{ padding: 10, opacity: 0.7 }}>Nog geen resultaten.</div>
              ) : (
                <>
                  {filteredProjects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleProjectSelected(p.id, p.name)}
                      style={{
                        padding: "8px 10px",
                        cursor: "pointer",
                        borderBottom: "1px solid #f2f2f2",
                      }}
                      title={p.name}
                    >
                      {p.name}
                    </div>
                  ))}
                  {filteredProjects.length === 0 && (
                    <div style={{ padding: 10, opacity: 0.7 }}>Geen projecten gevonden.</div>
                  )}
                </>
              )}
            </div>
          </div>

          {showEmbeddedList && (
            <div style={{ height: 520, border: "1px solid #ccc", borderRadius: 8, overflow: "hidden" }}>
              <ProjectListEmbed
                accessToken={accessToken}
                onProjectSelected={(projectId) => handleProjectSelected(projectId)}
              />
            </div>
          )}

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Selected projectId: {selectedProjectId ?? "-"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Selected project name: {selectedProjectName ?? "-"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Dossier nummer: {dossierNummer ?? "-"}
          </div>

          {mappingError && (
            <div style={{ color: "#b00020" }}>{mappingError}</div>
          )}
        </div>
      )}
    </div>
  );
}