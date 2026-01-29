const PKCE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export function generateCodeVerifier(length = 64): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);

  let result = "";
  for (let i = 0; i < values.length; i += 1) {
    result += PKCE_CHARS[values[i] % PKCE_CHARS.length];
  }

  return result;
}

export async function generateCodeChallengeS256(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function generateRandomState(length = 32): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);

  let result = "";
  for (let i = 0; i < values.length; i += 1) {
    result += PKCE_CHARS[values[i] % PKCE_CHARS.length];
  }

  return result;
}
