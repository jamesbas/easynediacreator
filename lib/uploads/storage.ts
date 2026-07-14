import fs from "node:fs/promises";
import path from "node:path";
import type { validateImageBuffer } from "./validate-image";

type UploadMetadata = Awaited<ReturnType<typeof validateImageBuffer>>;
export type StoredUpload = UploadMetadata & { id: string; path: string; createdAt: string };
const globalUploads = globalThis as unknown as { easyMediaUploads?: Map<string, StoredUpload> };
function store() { globalUploads.easyMediaUploads ??= new Map(); return globalUploads.easyMediaUploads; }

export async function storeImageUpload(buffer: Buffer, metadata: UploadMetadata) {
  const id = crypto.randomUUID();
  const folder = path.resolve(process.cwd(), "data", "uploads", id);
  await fs.mkdir(folder, { recursive: true });
  const filePath = path.join(folder, `source.${metadata.extension}`);
  await fs.writeFile(filePath, buffer, { flag: "wx" });
  const upload: StoredUpload = { id, path: filePath, createdAt: new Date().toISOString(), ...metadata };
  store().set(id, upload);
  return upload;
}

export function getUpload(id: string) { return store().get(id); }
export function publicUpload(upload: StoredUpload) { const { path: _path, ...safe } = upload; void _path; return safe; }
export function resetUploadsForTests() { store().clear(); }