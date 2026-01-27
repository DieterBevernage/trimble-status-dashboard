export interface IDossierResolver {
  resolve(projectId: string): Promise<string | null>;
}