const BASE_URL = "https://app21.connect.trimble.com/tc/api/2.0";

export type TcFolder = {
  id: string;
  name: string;
};

export type TcFile = {
  id: string;
  name: string;
  versionId?: string;
  storageId?: string;
};

type ApiListResponse = {
  data?: unknown;
  items?: unknown;
  folders?: unknown;
  files?: unknown;
};

function normalizeList(payload: unknown): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const response = payload as ApiListResponse;
  return (
    response.data ??
    response.items ??
    response.folders ??
    response.files ??
    []
  ) as unknown[];
}

async function fetchJson(url: string, accessToken: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) ${url}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

export async function listRootFolders(projectId: string, accessToken: string): Promise<TcFolder[]> {
  const url = `${BASE_URL}/projects/${encodeURIComponent(projectId)}/folders`;
  const json = await fetchJson(url, accessToken);
  const list = normalizeList(json);

  return list
    .map((f: any) => ({
      id: f.id ?? f.folderId ?? f.uuid,
      name: f.name ?? f.title ?? "(no name)",
    }))
    .filter((f: TcFolder) => Boolean(f.id));
}

export async function listFolderChildren(
  projectId: string,
  folderId: string,
  accessToken: string
): Promise<TcFolder[]> {
  const url = `${BASE_URL}/projects/${encodeURIComponent(projectId)}/folders?parentFolderId=${encodeURIComponent(folderId)}`;
  const json = await fetchJson(url, accessToken);
  const list = normalizeList(json);

  return list
    .map((f: any) => ({
      id: f.id ?? f.folderId ?? f.uuid,
      name: f.name ?? f.title ?? "(no name)",
    }))
    .filter((f: TcFolder) => Boolean(f.id));
}

export async function listFolderFiles(
  projectId: string,
  folderId: string,
  accessToken: string
): Promise<TcFile[]> {
  const url = `${BASE_URL}/projects/${encodeURIComponent(projectId)}/files?parentFolderId=${encodeURIComponent(folderId)}`;
  const json = await fetchJson(url, accessToken);
  const list = normalizeList(json);

  const files = list
    .map((f: any) => ({
      id: f.id ?? f.fileId ?? f.uuid,
      name: f.name ?? f.title ?? "(no name)",
      versionId: f.versionId ?? f.latestVersionId ?? f.version,
      storageId: f.storageId ?? f.storageID ?? f.storage,
    }))
    .filter((f: TcFile) => Boolean(f.id));

  const IFC_EXTENSIONS = [".ifc", ".ifczip", ".ifczip", ".ifcxml"];
  return files.filter((f) =>
    IFC_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
  );
}

export async function resolveFolderPath(
  projectId: string,
  pathSegments: string[],
  accessToken: string
): Promise<string | null> {
  if (pathSegments.length === 0) return null;

  let currentFolders = await listRootFolders(projectId, accessToken);
  let currentId: string | null = null;

  for (const segment of pathSegments) {
    const lowered = segment.toLowerCase();
    const match = currentFolders.find((f) => f.name.toLowerCase() === lowered);
    if (!match) return null;

    currentId = match.id;
    currentFolders = await listFolderChildren(projectId, match.id, accessToken);
  }

  return currentId;
}

export function getTcFoldersBaseUrl(): string {
  return BASE_URL;
}