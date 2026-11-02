import type { Presentation } from "@flowcam/domain";

/** Title of a duplicate. */
export const copyTitle = (title: string) => `${title} (copy)`;

export interface CloudEntry {
  id: string;
  version: number;
  updatedAt: string;
  data: Presentation;
}

/** Cloud Presentations not stored on this device, newest first. */
export const cloudOnly = (cloud: CloudEntry[], localIds: Iterable<string>) => {
  const have = new Set(localIds);
  return cloud.filter((c) => !have.has(c.id)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
};
