import { describe, expect, it } from "vitest";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { discoverModels, getWanGpCapabilities, matchModel } from "@/lib/wan-gp/discovery";

describe("model discovery", () => {
  it("maps configured logical models to compatible WanGP model types", async () => {
    const models = await discoverModels(new FakeWanGpClient());
    expect(models.find((model) => model.workflowType === "image-create" && model.key === "qwen-image")?.modelType).toBe("qwen_image_fixture");
    expect(models.find((model) => model.workflowType === "image-edit" && model.key === "qwen-image-edit")?.modelType).toBe("qwen_image_edit_fixture");
    expect(models.find((model) => model.workflowType === "video-create" && model.key === "ltx2_fixture")?.capabilities).toContain("end-frame");
  });

  it("exposes each available video model as an independent workflow option", async () => {
    const videoModels = (await discoverModels(new FakeWanGpClient())).filter((model) => model.workflowType === "video-create");

    expect(videoModels.map((model) => model.key)).toEqual(["ltx2_fixture", "minimax_video_fixture"]);
  });

  it("exposes every compatible image checkpoint instead of collapsing variants", async () => {
    const models = await discoverModels(new FakeWanGpClient());
    const createModels = models.filter((model) => model.workflowType === "image-create" && model.logicalKey === "krea-2");
    const editModels = models.filter((model) => model.workflowType === "image-edit" && model.logicalKey === "krea-2-edit");

    expect(createModels.map((model) => model.modelType)).toEqual(["krea2_raw_fixture", "krea2_turbo_fixture"]);
    expect(editModels.map((model) => model.modelType)).toEqual(["krea2_raw_edit_fixture", "krea2_turbo_edit_fixture"]);
    expect(createModels.every((model) => model.visible)).toBe(true);
  });

  it("applies model visibility independently to each workflow", async () => {
    const models = await discoverModels(new FakeWanGpClient(), {}, {
      "image-create": ["krea2_raw_fixture"],
      "image-edit": ["qwen_image_edit_fixture"],
      "video-create": ["ltx2_fixture"],
    });

    expect(models.filter((model) => model.workflowType === "image-create" && model.visible).map((model) => model.modelType)).toEqual(["krea2_raw_fixture"]);
    expect(models.filter((model) => model.workflowType === "image-edit" && model.visible).map((model) => model.modelType)).toEqual(["qwen_image_edit_fixture"]);
    expect(models.filter((model) => model.workflowType === "video-create" && model.visible).map((model) => model.modelType)).toEqual(["ltx2_fixture"]);
  });

  it("normalizes current capability and media-input metadata", () => {
    expect(getWanGpCapabilities({
      capabilities: { text_to_video: true, image_to_video: true, audio_output: false },
      media_inputs: { image: { start: true, end: true, reference: true } },
    })).toEqual(expect.arrayContaining(["text-to-video", "image-to-video", "start-frame", "end-frame"]));
  });

  it("reads MCP v2's capability array, which names the same things with underscores", () => {
    // Verbatim from a live `qwen_image_edit_plus2_20B`: v1 sent booleans, v2 an
    // array. Left underscored, every hyphenated capability check silently failed
    // and the Edit page lost its "Skip the source image" toggle.
    const capabilities = getWanGpCapabilities({
      capabilities: ["text_to_image", "image_to_image", "inpainting", "reference_images", "background_image", "lora"],
      media_inputs: { image: { reference: true, multiple_references: true, mask: true } },
    });
    expect(capabilities).toContain("text-to-image");
    expect(capabilities).toContain("reference-image");
    expect(capabilities).not.toContain("text_to_image");
  });

  it("keeps text-to-video readable on a v2 video model, so a clip needs no start frame", () => {
    const capabilities = getWanGpCapabilities({
      capabilities: ["text_to_video", "image_to_video", "sliding_window", "lora", "sliding_window"],
      media_inputs: { image: { start: true, end: true } },
    });
    expect(capabilities).toEqual(expect.arrayContaining(["text-to-video", "image-to-video", "start-frame", "end-frame"]));
  });

  it("recognizes Flux 2 and prefers an available matching model", () => {
    const models = [
      { modelType: "flux2_klein_9b", name: "Flux.2 Klein 9B", family: "flux2", output: "image" as const, inputs: ["text", "image"], availability: "missing" as const },
      { modelType: "flux2_klein_9b_nvfp4", name: "Flux.2 Klein 9B NVFP4", family: "flux2", output: "image" as const, inputs: ["text", "image"], availability: "available" as const },
    ];
    expect(matchModel({ key: "flux-klein-9b", displayName: "Flux", workflowType: "image-create", family: "flux", output: "image", namePattern: /klein.*9b/i }, models)?.modelType).toBe("flux2_klein_9b_nvfp4");
  });

  it("continues discovery when WanGP cannot serialize a full model schema", async () => {
    class SchemaErrorClient extends FakeWanGpClient {
      override getModelSchema(): ReturnType<FakeWanGpClient["getModelSchema"]> {
        return Promise.reject(new Error("Unable to serialize unknown type: function"));
      }
    }
    const models = await discoverModels(new SchemaErrorClient());
    expect(models.find((model) => model.workflowType === "video-create")).toMatchObject({ availability: "available", schema: { metadata: expect.any(Object) } });
  });

  it("keeps other checkpoints when one model's detail discovery fails", async () => {
    class ModelDetailErrorClient extends FakeWanGpClient {
      override listLoras(modelType: string) {
        if (modelType === "minimax_video_fixture") return Promise.reject(new Error("Invalid or expired cursor"));
        return super.listLoras(modelType);
      }
    }
    const models = await discoverModels(new ModelDetailErrorClient());

    expect(models.find((model) => model.modelType === "minimax_video_fixture")).toMatchObject({ availability: "partial", visible: false, reason: "Invalid or expired cursor" });
    expect(models.find((model) => model.modelType === "ltx2_fixture")).toMatchObject({ availability: "available", visible: true });
    expect(models.filter((model) => model.availability === "available").length).toBeGreaterThan(0);
  });

  it("bounds concurrent checkpoint discovery so WanGP is not flooded", async () => {
    class ConcurrencyClient extends FakeWanGpClient {
      active = 0;
      maximum = 0;
      override async getDefaultSettings(modelType: string) {
        this.active += 1;
        this.maximum = Math.max(this.maximum, this.active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        try {
          return await super.getDefaultSettings(modelType);
        } finally {
          this.active -= 1;
        }
      }
    }
    const client = new ConcurrencyClient();

    await discoverModels(client);

    expect(client.maximum).toBeGreaterThan(1);
    expect(client.maximum).toBeLessThanOrEqual(4);
  });

  it("honors an available exact model preference", () => {
    const models = [
      { modelType: "ltx2_22B_distilled", name: "LTX-2 Distilled 1.0", family: "ltx2", output: "video" as const, inputs: ["text", "image"], availability: "available" as const },
      { modelType: "ltx2_22B_distilled_1_1", name: "LTX-2 Distilled 1.1", family: "ltx2", output: "video" as const, inputs: ["text", "image"], availability: "available" as const },
    ];
    expect(matchModel({ key: "ltx-2", displayName: "LTX", workflowType: "video-create", family: "ltx2", output: "video", requiresImage: true }, models, "ltx2_22B_distilled_1_1")?.modelType).toBe("ltx2_22B_distilled_1_1");
  });
});