import type { IDossierResolver } from "./IDossierResolver";

export class MockDossierResolver implements IDossierResolver {
  private readonly mapping: Record<string, string>;

  constructor(mapping?: Record<string, string>) {
    this.mapping = mapping ?? {
      "project-123": "D-1000",
      "project-456": "D-2000",
      "project-789": "D-3000",
    };
  }

  async resolve(projectId: string): Promise<string | null> {
    return this.mapping[projectId] ?? null;
  }
}