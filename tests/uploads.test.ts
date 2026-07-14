import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateImageBuffer } from "@/lib/uploads/validate-image";

describe("image upload validation", () => {
  it("accepts an actually decoded PNG", async () => {
    const buffer = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#146c63" } }).png().toBuffer();
    await expect(validateImageBuffer(buffer)).resolves.toMatchObject({ mime: "image/png", width: 32, height: 24 });
  });
  it("rejects a spoofed image payload", async () => {
    await expect(validateImageBuffer(Buffer.from("not an image"))).rejects.toThrow(/valid JPEG, PNG, or WebP/);
  });
});