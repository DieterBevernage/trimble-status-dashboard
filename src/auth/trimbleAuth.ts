import { generateCodeChallenge, generateCodeVerifier, generateRandomState } from "./pkce";

const CLIENT_ID = "3989aeb5-b69f-4ce4-b0c6-94f59858cf66";
const BASE_URL = import.meta.env.BASE_URL ?? "/";
const AUTHORIZE_ENDPOINT = "https://id.trimble.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://id.trimble.com/oauth/token";
const SCOPES = ["openid", "profile"];

const PKCE_VERIFIER_KEY = "pkce_verifier";
const PKCE_STATE_KEY = "pkce_state";
const ACCESS_TOKEN_KEY = "tc_access_token";

export type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
};

function normalizeBaseUrl(value: string): string {
  let base = value;
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (!base.endsWith("/")) {
    base += "/";
  }
  return base;
}

export function getRedirectUri(): string {
  const base = normalizeBaseUrl(BASE_URL);
  return new URL(`${base}auth/callback`, window.location.origin).toString();
}

export async function createLoginRedirectUrl(): Promise<string> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateRandomState();
  const redirectUri = getRedirectUri();

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: SCOPES.join(" "),
    state,
  });

  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, state?: string | null): Promise<TokenResponse> {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const storedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const redirectUri = getRedirectUri();

  if (!verifier) {
    throw new Error("Missing PKCE verifier in sessionStorage.");
  }

  if (storedState && state && storedState !== state) {
    throw new Error("OAuth state mismatch.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    code,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as TokenResponse;
  return data;
}

export function storeAccessToken(token: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function getStoredAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearPkceStorage(): void {
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
}

export function clearAuthStorage(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  clearPkceStorage();
}

export function getAuthConfig() {
  return {
    clientId: CLIENT_ID,
    redirectUri: getRedirectUri(),
    authorizeEndpoint: AUTHORIZE_ENDPOINT,
    tokenEndpoint: TOKEN_ENDPOINT,
    scopes: [...SCOPES],
  };
}
