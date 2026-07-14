import { NextResponse } from "next/server";
import { publicUpload, storeImageUpload } from "@/lib/uploads/storage";
import { validateImageBuffer } from "@/lib/uploads/validate-image";
import { logger } from "@/lib/telemetry";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    if (file.size > config.MAX_IMAGE_UPLOAD_MB * 1024 * 1024) return NextResponse.json({ error: `Image must be smaller than ${config.MAX_IMAGE_UPLOAD_MB} MB.` }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await validateImageBuffer(buffer);
    const upload = await storeImageUpload(buffer, metadata);
    logger.info({ event: "upload.accepted", uploadId: upload.id, mime: upload.mime, width: upload.width, height: upload.height }, "Image upload accepted");
    return NextResponse.json({ upload: publicUpload(upload) }, { status: 201 });
  } catch (error) {
    logger.warn({ event: "upload.rejected", error }, "Image upload rejected");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image upload failed." }, { status: 400 });
  }
}