import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { getUpload } from "@/lib/uploads/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upload = getUpload(id);
  if (!upload) return new Response("Upload was not found.", { status: 404 });

  try {
    const stats = await fs.stat(upload.path);
    const stream = Readable.toWeb(createReadStream(upload.path)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(stats.size),
        "Content-Type": upload.mime,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Upload file could not be found.", { status: 404 });
  }
}
