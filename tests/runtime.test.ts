import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearFinishedJobs, createJob, getJob, resetJobsForTests, updateJob } from "@/lib/runtime/job-registry";
import { clearOutputs, getOutput, registerOutput, removeOutput, resetOutputsForTests } from "@/lib/runtime/output-registry";
import { config } from "@/lib/config";
import { isPathInsideRoot } from "@/lib/security/path-policy";

describe("runtime policies", () => {
  const testFiles = ["kept-on-disk.png", "also-kept.png"].map((filename) => path.join(config.WANGP_OUTPUT_ROOT, filename));
  beforeEach(() => { resetJobsForTests(); resetOutputsForTests(); });
  afterEach(async () => Promise.all(testFiles.map((file) => fs.rm(file, { force: true }))));
  it("enforces valid job state transitions", () => {
    const job = createJob({ workflowType: "image-create", modelKey: "qwen-image", prompt: "A lighthouse" });
    expect(updateJob(job.id, { status: "running" }).status).toBe("running");
    expect(() => updateJob(job.id, { status: "queued" })).toThrow(/Invalid job transition/);
  });
  it("rejects traversal outside the output root", () => {
    const root = path.resolve("data", "outputs");
    expect(isPathInsideRoot(path.join(root, "image.png"), root)).toBe(true);
    expect(isPathInsideRoot(path.resolve(root, "..", "private.txt"), root)).toBe(false);
  });
  it("clears only finished jobs", () => {
    const active = createJob({ workflowType: "image-create", modelKey: "qwen-image", prompt: "Active" });
    const completed = createJob({ workflowType: "image-create", modelKey: "qwen-image", prompt: "Done" });
    updateJob(completed.id, { status: "running" }); updateJob(completed.id, { status: "completed" });
    expect(clearFinishedJobs()).toEqual([completed.id]);
    expect(getJob(active.id)).toBeDefined(); expect(getJob(completed.id)).toBeUndefined();
  });
  it("removes output records without deleting files", async () => {
    await fs.mkdir(config.WANGP_OUTPUT_ROOT, { recursive: true }); await Promise.all(testFiles.map((file) => fs.writeFile(file, "fixture")));
    const output = registerOutput({ path: testFiles[0], workflowType: "image-create", modelKey: "qwen-image", prompt: "Keep file" });
    expect(removeOutput(output.id)).toBe(true); expect(getOutput(output.id)).toBeUndefined(); await expect(fs.access(testFiles[0])).resolves.toBeUndefined();
    registerOutput({ path: testFiles[1], workflowType: "image-create", modelKey: "qwen-image", prompt: "Keep file" });
    expect(clearOutputs()).toBe(1); await expect(fs.access(testFiles[1])).resolves.toBeUndefined();
  });
});