import React from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthStorage, createLoginRedirectUrl, getStoredAccessToken } from "../auth/trimbleAuth";
import { MockDossierResolver } from "../dossier/MockDossierResolver";
import { ProjectListEmbed } from "../embed/ProjectListEmbed";

export function Home() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = React.useState<string | null>(getStoredAccessToken());
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [dossierNummer, setDossierNummer] = React.useState<string | null>(null);
  const [mappingError, setMappingError] = React.useState<string | null>(null);
  const [loginError, setLoginError] = React.useState<string | null>(null);

  const resolver = React.useMemo(() => new MockDossierResolver(), []);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      const url = await createLoginRedirectUrl();
      window.location.assign(url);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleLogout = () => {
    clearAuthStorage();
    setAccessToken(null);
    setSelectedProjectId(null);
    setDossierNummer(null);
    setMappingError(null);
  };

  const handleProjectSelected = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setMappingError(null);

    const resolved = await resolver.resolve(projectId);
    if (!resolved) {
      setMappingError(`Geen dossier mapping voor projectId ${projectId}.`);
      return;
    }

    setDossierNummer(resolved);
    navigate(`/dashboard?dossierNummer=${encodeURIComponent(resolved)}`);
  };

  React.useEffect(() => {
    const stored = getStoredAccessToken();
    if (stored !== accessToken) {
      setAccessToken(stored);
    }
  }, [accessToken]);

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
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>Ingelogd. Selecteer een project om de mapping te bepalen.</div>

          <div style={{ height: 520, border: "1px solid #ccc", borderRadius: 8, overflow: "hidden" }}>
            <ProjectListEmbed
              accessToken={accessToken}
              onProjectSelected={handleProjectSelected}
            />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Selected projectId: {selectedProjectId ?? "-"}
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