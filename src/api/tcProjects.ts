import { TC_API_BASE } from "./tcConfig";

const PROJECTS_ENDPOINT = `${TC_API_BASE}/projects`;

export type TcProject = {
  id: string;
  name: string;
};

type ProjectApiResponse = {
  data?: unknown;
  projects?: unknown;
};

function normalizeProjects(payload: unknown): TcProject[] {
  if (!payload) return [];

  const list = Array.isArray(payload)
    ? payload
    : (payload as ProjectApiResponse).data ??
      (payload as ProjectApiResponse).projects ??
      [];

  if (!Array.isArray(list)) return [];

  return list
    .map((p: any) => ({
      id: p.id ?? p.projectId ?? p.uuid,
      name: p.name ?? p.projectName ?? p.title ?? "(no name)",
    }))
    .filter((p: TcProject) => Boolean(p.id));
}

export async function fetchProjects(accessToken: string): Promise<TcProject[]> {
  console.log("[TC API][projects] GET", PROJECTS_ENDPOINT);
  const response = await fetch(PROJECTS_ENDPOINT, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Projects fetch failed (${response.status}): ${responseText}`);
  }

  let json: unknown;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    throw new Error(`Projects fetch parse failed: ${(error as Error).message}`);
  }

  return normalizeProjects(json);
}
