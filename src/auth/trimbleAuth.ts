import { generateCodeChallengeS256, generateCodeVerifier, generateRandomState } from "./pkce";

const CLIENT_ID = import.meta.env.VITE_TRIMBLE_CLIENT_ID as string | undefined;
const AUTHORIZE_ENDPOINT = import.meta.env.VITE_TRIMBLE_AUTHORIZE_URL as string | undefined;
const TOKEN_ENDPOINT = import.meta.env.VITE_TRIMBLE_TOKEN_URL as string | undefined;
const SCOPES = (import.meta.env.VITE_TRIMBLE_SCOPES as string | undefined)?.trim() ?? "";
const REDIRECT_URI = import.meta.env.VITE_TRIMBLE_REDIRECT_URI as string | undefined;

const PKCE_VERIFIER_KEY = "pkce_verifier";
const OAUTH_STATE_KEY = "oauth_state";
const ACCESS_TOKEN_KEY = "tc_access_token";

export type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
};

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getAuthConfig() {
  const redirectUri = resolveRedirectUri();

  return {
    clientId: requireEnv(CLIENT_ID, "VITE_TRIMBLE_CLIENT_ID"),
    authorizeEndpoint: requireEnv(AUTHORIZE_ENDPOINT, "VITE_TRIMBLE_AUTHORIZE_URL"),
    tokenEndpoint: requireEnv(TOKEN_ENDPOINT, "VITE_TRIMBLE_TOKEN_URL"),
    scopes: SCOPES,
    redirectUri,
  };
}

export function getStoredAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function storeAccessToken(token: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAuthStorage(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
}

export async function startOAuthLogin(): Promise<string> {
  const { clientId, authorizeEndpoint, scopes, redirectUri } = getAuthConfig();

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallengeS256(verifier);
  const state = generateRandomState();

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  return `${authorizeEndpoint}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, state?: string | null): Promise<TokenResponse> {
  const { clientId, tokenEndpoint, redirectUri } = getAuthConfig();

  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);

  if (!verifier) {
    throw new Error("Missing PKCE verifier in sessionStorage.");
  }

  console.log("[OAuth Callback] state matches:", Boolean(state && storedState && storedState === state));

  if (!state || !storedState || storedState !== state) {
    throw new Error("OAuth state mismatch.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    code,
  });

  console.log("[OAuth Token] redirect_uri:", redirectUri);

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const responseText = await response.text();
  console.log("[OAuth Token] status:", response.status);
  if (!response.ok) {
    console.warn("[OAuth Token] error body:", responseText);
  }
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${responseText}`);
  }

  return JSON.parse(responseText) as TokenResponse;
}

export function clearPkceStorage(): void {
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
}

function resolveRedirectUri(): string {
  if (REDIRECT_URI && REDIRECT_URI.trim().length > 0) {
    return REDIRECT_URI;
  }

  const hostname = window.location.hostname;
  const origin = window.location.origin;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${origin}/auth/callback`;
  }

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  let basePath = baseUrl === "/" ? "" : baseUrl;

  if (basePath.endsWith("/")) {
    basePath = basePath.slice(0, -1);
  }

  return `${origin}${basePath}/auth/callback`;
}
