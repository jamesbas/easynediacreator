import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Whether the pictures actually go out.
 *
 * Sending an image to a text-only checkpoint fails the whole rewrite, so the
 * decision is made twice: from what LM Studio says the model is, and again from
 * what it says when it refuses. Neither may cost the user the rewrite.
 *
 * `lib/config.ts` reads the environment once at module load, so the client is
 * imported fresh after the environment is set.
 */
async function loadClient() {
  vi.resetModules();
  vi.stubEnv("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1");
  vi.stubEnv("LM_STUDIO_MODEL", "");
  const client = await import("@/lib/prompt-enhancer/lm-studio");
  client.resetResponseFormatNegotiation();
  return client;
}

type Body = { messages: { role: string; content: unknown }[] };

/** Answers every chat call, and records the message bodies that reached it. */
function lmStudio({ type, refuseImages = false }: { type: string; refuseImages?: boolean }) {
  const bodies: Body[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/api/v0/models")) return Response.json({ data: [{ id: "local-model", state: "loaded", type }] });
    const body = JSON.parse(String(init?.body)) as Body;
    bodies.push(body);
    const hasImage = body.messages.some((message) => Array.isArray(message.content));
    if (refuseImages && hasImage) return new Response("model does not support image input", { status: 400 });
    return Response.json({ choices: [{ message: { content: '{"prompt":"a rewritten prompt"}' } }] });
  }));
  return bodies;
}

const options = {
  system: "system",
  user: "user",
  schema: z.object({ prompt: z.string() }),
  schemaName: "test",
  jsonSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] },
  images: [{ label: "Image 1 is the start frame.", dataUrl: "data:image/jpeg;base64,AAAA" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sending pictures to LM Studio", () => {
  it("interleaves each image with the label that says what it is", async () => {
    const { completeJson } = await loadClient();
    const bodies = lmStudio({ type: "vlm" });

    await expect(completeJson(options)).resolves.toMatchObject({ ok: true });

    const content = bodies[0].messages[1].content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(content.map((part) => part.type)).toEqual(["text", "text", "image_url"]);
    expect(content[1].text).toContain("start frame");
    expect(content[2].image_url?.url).toBe("data:image/jpeg;base64,AAAA");
  });

  it("keeps the plain string body when there is nothing to look at", async () => {
    const { completeJson } = await loadClient();
    const bodies = lmStudio({ type: "vlm" });

    await completeJson({ ...options, images: [] });

    expect(bodies[0].messages[1].content).toBe("user");
  });

  it("does not send them to a model LM Studio calls text-only", async () => {
    const { completeJson } = await loadClient();
    const bodies = lmStudio({ type: "llm" });

    await expect(completeJson(options)).resolves.toMatchObject({ ok: true });

    expect(bodies[0].messages[1].content).toBe("user");
  });

  it("drops them and still returns a rewrite when the server refuses them", async () => {
    const { completeJson } = await loadClient();
    // Typed `vlm`, so the refusal is only discovered by being told.
    const bodies = lmStudio({ type: "vlm", refuseImages: true });

    await expect(completeJson(options)).resolves.toMatchObject({ ok: true, value: { prompt: "a rewritten prompt" } });

    expect(Array.isArray(bodies[0].messages[1].content)).toBe(true);
    expect(bodies[1].messages[1].content).toBe("user");
  });
});
