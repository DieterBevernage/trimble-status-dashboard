import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearPkceStorage, exchangeCodeForToken, storeAccessToken } from "../auth/trimbleAuth";

export function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = React.useState("Bezig met inloggen...");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get("code");
      const state = params.get("state");
      const errorParam = params.get("error");

      if (errorParam) {
        setError(`OAuth error: ${errorParam}`);
        setStatus("Login mislukt.");
        return;
      }

      if (!code) {
        setError("Geen authorization code gevonden in callback.");
        setStatus("Login mislukt.");
        return;
      }

      try {
        const tokenResponse = await exchangeCodeForToken(code, state);
        storeAccessToken(tokenResponse.access_token);
        clearPkceStorage();
        setStatus("Login geslaagd. Je wordt doorgestuurd...");
        navigate("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("Login mislukt.");
      }
    })();
  }, [location.search, navigate]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Trimble Login</h2>
      <div>{status}</div>
      {error && <div style={{ color: "#b00020" }}>Fout: {error}</div>}
    </div>
  );
}