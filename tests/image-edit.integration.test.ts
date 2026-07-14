import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { getJob, resetJobsForTests } from "@/lib/runtime/job-registry";
import { resetOutputsForTests } from "@/lib/runtime/output-registry";
import { editImage } from "@/lib/services/image-edit-service";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";
import { validateImageBuffer } from "@/lib/uploads/validate-image";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { setWanGpClientForTests } from "@/lib/wan-gp";

describe("image editing", () => {
  beforeEach(() => { resetJobsForTests(); resetOutputsForTests(); resetUploadsForTests(); setWanGpClientForTests(new FakeWanGpClient()); });
  it("edits a validated uploaded image through the GPU queue", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#e3482d" } }).png().toBuffer();
    const upload = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    const created = await editImage({ sourceUploadId: upload.id, prompt: "Turn the sky teal", negativePrompt: "blurry, malformed hands", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} });
    const deadline = Date.now() + 4000;
    while (getJob(created.id)?.status !== "completed" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getJob(created.id)).toMatchObject({ status: "completed", workflowType: "image-edit" });
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({ negative_prompt: "blurry, malformed hands", num_inference_steps: 20, video_prompt_type: "KI", image_refs: [upload.path] });
  }, 5000);
});