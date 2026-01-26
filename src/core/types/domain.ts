export type Status = "Nieuw" | "In uitvoering" | "Klaar" | "Geblokkeerd";

export type ElementRecord = {
  dossierId: string;
  modelId: string;
  elementId: string;
  name: string;
  currentStatus: Status;
};

export type StatusChange = {
  elementId: string;
  oldStatus: Status | null;
  newStatus: Status;
  changedAt: string; // ISO string
  changedBy?: string;
};