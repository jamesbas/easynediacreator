import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { characterReferencePath, listCharacterReferences } from "@/lib/character-references/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reference = (await listCharacterReferences()).find((candidate) => candidate.id === id);
  if (!reference) return new Response("Character reference image was not found.", { status: 404 });

  const filePath = characterReferencePath(reference);
  try {
    const stats = await fs.stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(stats.size),
        "Content-Type": reference.mime,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Character reference file could not be found.", { status: 404 });
  }
}
