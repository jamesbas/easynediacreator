import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getOutput } from "@/lib/runtime/output-registry";

const contentTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getOutput(id);
  if (!asset) return new Response("Asset was not found.", { status: 404 });
  try {
    const stats = await fs.stat(asset.path);
    const contentType = contentTypes[path.extname(asset.path).toLowerCase()] ?? "application/octet-stream";
    const range = request.headers.get("range");
    const download = new URL(request.url).searchParams.get("download") === "1";
    const baseHeaders = { "Accept-Ranges": "bytes", "Content-Type": contentType, "X-Content-Type-Options": "nosniff", ...(download ? { "Content-Disposition": `attachment; filename="${asset.filename.replace(/["\r\n]/g, "_")}"` } : {}) };
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stats.size}` } });
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), stats.size - 1) : stats.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stats.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stats.size}` } });
      const stream = Readable.toWeb(createReadStream(asset.path, { start, end })) as ReadableStream<Uint8Array>;
      return new Response(stream, { status: 206, headers: { ...baseHeaders, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${stats.size}` } });
    }
    const stream = Readable.toWeb(createReadStream(asset.path)) as ReadableStream<Uint8Array>;
    return new Response(stream, { headers: { ...baseHeaders, "Content-Length": String(stats.size) } });
  } catch { return new Response("Output file could not be found.", { status: 404 }); }
}