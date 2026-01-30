import { TC_API_BASE } from "./tcConfig";

type ModelResponse = {
  data?: unknown;
  items?: unknown;
  models?: unknown;
};

export type TcModel = {
  id: string;
  name: string;
  sourceFileId?: string | null;
  versionId?: string | null;
};

async function fetchJson(url: string, accessToken: string): Promise<{ ok: boolean; status: number; text: string; json: unknown | null; }> {
  console.log("[TC API][models] GET", url);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  let json: unknown | null = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      console.warn("[Models] Failed to parse JSON from", url, error);
    }
  }

  if (!response.ok) {
    console.warn("[Models] Request failed", response.status, url, text);
  }

  return { ok: response.ok, status: response.status, text, json };
}

function normalizeModels(payload: unknown): TcModel[] {
  if (!payload) return [];
  const response = payload as ModelResponse;
  const list = (response.data ?? response.items ?? response.models ?? payload) as unknown;
  if (!Array.isArray(list)) return [];

  return list
    .map((m: any) => ({
      id: m.id ?? m.modelId ?? m.uuid,
      name: m.name ?? m.title ?? "(no name)",
      sourceFileId: m.sourceFileId ?? m.fileId ?? m.sourceFile?.id ?? null,
      versionId: m.versionId ?? m.latestVersionId ?? m.version ?? null,
    }))
    .filter((m: TcModel) => Boolean(m.id));
}

export async function listModels(projectId: string, accessToken: string): Promise<TcModel[]> {
  const url1 = `${TC_API_BASE}/projects/${encodeURIComponent(projectId)}/models`;
  const res1 = await fetchJson(url1, accessToken);
  console.log("[Models] GET", url1, "status", res1.status);

  if (res1.ok) {
    const models = normalizeModels(res1.json ?? res1.text);
    if (models.length > 0) return models;
  }

  const url2 = `${TC_API_BASE}/models?projectId=${encodeURIComponent(projectId)}`;
  const res2 = await fetchJson(url2, accessToken);
  console.log("[Models] GET", url2, "status", res2.status);

  if (!res2.ok) {
    return [];
  }

  return normalizeModels(res2.json ?? res2.text);
}
