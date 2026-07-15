import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/uploads/[id]/content/route";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";
import { validateImageBuffer } from "@/lib/uploads/validate-image";

describe("image upload validation", () => {
  const createdFolders: string[] = [];
  afterEach(async () => {
    resetUploadsForTests();
    await Promise.all(createdFolders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
  });
  it("accepts an actually decoded PNG", async () => {
    const buffer = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#146c63" } }).png().toBuffer();
    await expect(validateImageBuffer(buffer)).resolves.toMatchObject({ mime: "image/png", width: 32, height: 24 });
  });
  it("rejects a spoofed image payload", async () => {
    await expect(validateImageBuffer(Buffer.from("not an image"))).rejects.toThrow(/valid JPEG, PNG, or WebP/);
  });
  it("serves a registered upload for session reuse", async () => {
    const buffer = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#146c63" } }).png().toBuffer();
    const metadata = await validateImageBuffer(buffer);
    const upload = await storeImageUpload(buffer, metadata);
    createdFolders.push(path.dirname(upload.path));

    const response = await GET(new Request(`http://localhost/api/uploads/${upload.id}/content`), { params: Promise.resolve({ id: upload.id }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(buffer);
  });
});