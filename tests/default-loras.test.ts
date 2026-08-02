import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/settings/default-loras/route";
import { getAppPreferences } from "@/lib/runtime/app-preferences";
import { clearModelCache } from "@/lib/runtime/model-cache";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { setWanGpClientForTests } from "@/lib/wan-gp";

/**
 * Default LoRAs are preselected on the generation forms, so the settings API is
 * the only place that guarantees the saved names still belong to the model.
 */
function post(body: unknown) {
  return POST(new Request("http://localhost/api/settings/default-loras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

describe("default LoRA settings", () => {
  beforeEach(() => { clearModelCache(); setWanGpClientForTests(new FakeWanGpClient()); });

  it("saves model-aligned defaults under the workflow selection key", async () => {
    const response = await post({ selectionKey: "image-create:krea-2", loras: [{ name: "krea2-portrait.safetensors", strength: 0.6 }] });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ defaultLoras: [{ name: "krea2-portrait.safetensors", strength: 0.6 }] });
    expect((await getAppPreferences()).defaultLoras["image-create:krea-2"]).toEqual([{ name: "krea2-portrait.safetensors", strength: 0.6 }]);
  });

  it("rejects LoRAs that belong to another model, duplicates, and unknown models", async () => {
    await expect(post({ selectionKey: "image-create:krea-2", loras: [{ name: "cinematic-motion.safetensors", strength: 1 }] }).then((response) => response.json())).resolves.toMatchObject({ error: expect.stringMatching(/not available/) });
    await expect(post({ selectionKey: "image-create:krea-2", loras: [{ name: "krea2-portrait.safetensors", strength: 1 }, { name: "krea2-portrait.safetensors", strength: 0.5 }] }).then((response) => response.json())).resolves.toMatchObject({ error: expect.stringMatching(/only be selected once/) });
    await expect(post({ selectionKey: "image-create:not-a-model", loras: [] }).then((response) => response.json())).resolves.toMatchObject({ error: expect.stringMatching(/installed model/) });
  });

  it("clears the defaults for a model when an empty list is saved", async () => {
    await post({ selectionKey: "image-create:krea-2", loras: [{ name: "krea2-portrait.safetensors", strength: 1 }] });
    await post({ selectionKey: "image-create:krea-2", loras: [] });
    expect((await getAppPreferences()).defaultLoras["image-create:krea-2"]).toEqual([]);
  });
});
