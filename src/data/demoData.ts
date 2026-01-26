import type { ElementRecord, Status, StatusChange } from "../core/types/domain";

export const STATUSES: Status[] = ["Nieuw", "In uitvoering", "Klaar", "Geblokkeerd"];

export function makeDemoElements(dossierId: string): ElementRecord[] {
  const items: ElementRecord[] = [];
  for (let i = 1; i <= 25; i++) {
    items.push({
      dossierId,
      modelId: i <= 12 ? "Model-A" : "Model-B",
      elementId: `EL-${String(i).padStart(4, "0")}`,
      name: `Element ${i}`,
      currentStatus: i % 5 === 0 ? "In uitvoering" : "Nieuw",
    });
  }
  return items;
}

export function makeDemoHistory(elements: ElementRecord[]): Record<string, StatusChange[]> {
  const map: Record<string, StatusChange[]> = {};
  for (const e of elements) {
    map[e.elementId] = [
      {
        elementId: e.elementId,
        oldStatus: null,
        newStatus: "Nieuw",
        changedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
        changedBy: "system",
      },
    ];
    if (e.currentStatus !== "Nieuw") {
      map[e.elementId].push({
        elementId: e.elementId,
        oldStatus: "Nieuw",
        newStatus: e.currentStatus,
        changedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        changedBy: "demo",
      });
    }
  }
  return map;
}