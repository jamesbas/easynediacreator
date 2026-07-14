import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { config } from "@/lib/config";

const accepted = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function validateImageBuffer(buffer: Buffer) {
  if (!buffer.length || buffer.length > config.MAX_IMAGE_UPLOAD_MB * 1024 * 1024) throw new Error(`Image must be smaller than ${config.MAX_IMAGE_UPLOAD_MB} MB.`);
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !accepted.has(detected.mime)) throw new Error("Upload a valid JPEG, PNG, or WebP image.");
  try {
    const metadata = await sharp(buffer, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Missing image dimensions.");
    if (metadata.width > 16384 || metadata.height > 16384 || metadata.width * metadata.height > 100_000_000) throw new Error("Image dimensions are too large.");
    return { mime: detected.mime, extension: detected.ext === "jpg" ? "jpg" : detected.ext, width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof Error && error.message.includes("dimensions are too large")) throw error;
    throw new Error("Source image could not be decoded.");
  }
}