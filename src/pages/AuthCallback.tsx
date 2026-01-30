import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  clearPkceStorage,
  exchangeCodeForToken,
  getAuthConfig,
  storeAccessToken,
} from "../auth/trimbleAuth";

export function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = React.useState("Bezig met inloggen...");
  const [error, setError] = React.useState<string | null>(null);

  // Guard tegen dubbele effect runs (StrictMode, re-renders, etc.)
  const didRunRef = React.useRef(false);

  React.useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    (async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get("code");
      const state = params.get("state");
      const errorParam = params.get("error");
      const errorDescription = params.get("error_description");

      console.count("[OAuth Callback] effect runs");
      console.log("[OAuth Callback] code present:", Boolean(code));
      console.log("[OAuth Callback] state present:", Boolean(state));

      if (errorParam) {
        setError(
          `OAuth error: ${errorParam}${errorDescription ? ` (${errorDescription})` : ""}`
        );
        setStatus("Login mislukt.");
        return;
      }

      if (!code) {
        setError("Geen authorization code gevonden in callback.");
        setStatus("Login mislukt.");
        return;
      }

      try {
        const authConfig = getAuthConfig();
        console.log("[OAuth Callback] redirect_uri:", authConfig.redirectUri);

        const tokenResponse = await exchangeCodeForToken(code, state);
        storeAccessToken(tokenResponse.access_token);
        clearPkceStorage();

        // Belangrijk: code/state uit de URL halen (voorkomt hergebruik bij refresh/back)
        const url = new URL(window.location.href);
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        url.searchParams.delete("error");
        url.searchParams.delete("error_description");
        window.history.replaceState({}, "", url.pathname + url.hash); // of url.toString()

        setStatus("Login geslaagd. Je wordt doorgestuurd...");

        // Belangrijk: replace zodat callback niet in history blijft
        navigate("/", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("Login mislukt.");
      }
    })();
    // bewust geen dependencies: we willen 1x runnen per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Trimble Login</h2>
      <div>{status}</div>
      {error && <div style={{ color: "#b00020" }}>Fout: {error}</div>}
    </div>
  );
}
