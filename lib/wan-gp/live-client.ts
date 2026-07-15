import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import type { WanGpClient } from "./client";
import { availabilitySchema, modelListSchema, parseLoraCatalogResponse, parseWanGpJobSnapshot, parseWanGpStructuredContent, parseWanGpTextContent, record } from "./schemas";
import { listLocalLoras } from "./local-lora-catalog";

const allowedTools = new Set([
  "wangp_list_models", "wangp_get_model_metadata", "wangp_get_model_availability", "wangp_get_default_settings",
  "wangp_get_model_schema", "wangp_generate", "wangp_get_job", "wangp_cancel_job",
  "wangp_list_lora_presets", "wangp_list_loras", "wangp_get_loras",
]);

const toolResultSchema = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.unknown().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

export class LiveWanGpClient implements WanGpClient {
  private client?: Client;
  private connecting?: Promise<Client>;
  private toolNames?: Set<string>;
  constructor(private readonly endpoint: string, private readonly loraRoot?: string) {}

  async ping() {
    const client = await this.connect();
    const server = client.getServerVersion();
    return { connected: true, version: server?.version };
  }
  async listModels(output?: "image" | "video") {
    const models = modelListSchema.parse(await this.call("wangp_list_models", { ...(output ? { main_output: output } : {}), include_availability: true }));
    return output ? models.map((model) => ({ ...model, output })) : models;
  }
  async getModelMetadata(modelType: string) { return record(await this.call("wangp_get_model_metadata", { model_type: modelType })); }
  async getModelAvailability(modelType: string) { return availabilitySchema.parse(await this.call("wangp_get_model_availability", { model_type: modelType })); }
  async getDefaultSettings(modelType: string) { return record(await this.call("wangp_get_default_settings", { model_type: modelType })); }
  async getModelSchema(modelType: string) { return record(await this.call("wangp_get_model_schema", { model_type: modelType })); }
  async listLoras(modelType: string) {
    const candidates = ["wangp_list_lora_presets", "wangp_list_loras", "wangp_get_loras"];
    const toolName = candidates.find((candidate) => this.toolNames?.has(candidate)) ?? await this.findTool(candidates);
    if (!toolName) {
      if (!this.loraRoot) return { supported: false, loras: [], reason: "WanGP does not expose LoRA discovery and WANGP_LORA_ROOT is not configured." };
      const metadata = record(await this.call("wangp_get_model_metadata", { model_type: modelType }));
      return listLocalLoras(this.loraRoot, { metadata });
    }
    const result = await this.call(toolName, { model_type: modelType });
    if (result && typeof result === "object" && "supported" in result && result.supported === false) {
      const reason = "reason" in result && typeof result.reason === "string" ? result.reason : "The selected WanGP model does not support LoRAs.";
      return { supported: false, loras: [], reason };
    }
    return parseLoraCatalogResponse(result, modelType);
  }
  async generate(modelType: string, settings: Record<string, unknown>) {
    const result = record(await this.call("wangp_generate", { source: { ...settings, model_type: modelType }, wait: false }));
    return { jobId: z.string().min(1).parse(result.job_id ?? result.jobId ?? result.id) };
  }
  async getJob(jobId: string) { return parseWanGpJobSnapshot(await this.call("wangp_get_job", { job_id: jobId })); }
  async cancelJob(jobId: string) { await this.call("wangp_cancel_job", { job_id: jobId }); }

  private async connect() {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const client = new Client({ name: "easy-media-generator", version: "0.1.0" });
        await client.connect(new StreamableHTTPClientTransport(new URL(this.endpoint)));
        this.client = client;
        return client;
      })().finally(() => { this.connecting = undefined; });
    }
    return this.connecting;
  }

  private async call(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!allowedTools.has(toolName)) throw new Error("WanGP tool is not allowed.");
    const result = toolResultSchema.parse(await (await this.connect()).callTool({ name: toolName, arguments: args }));
    if (result.isError) {
      const details = result.content.filter((item) => item.type === "text" && item.text).map((item) => item.text).join(" ");
      throw new Error(`WanGP tool ${toolName} failed${details ? `: ${details}` : "."}`);
    }
    if (result.structuredContent !== undefined) return parseWanGpStructuredContent(result.structuredContent);
    return parseWanGpTextContent(result.content);
  }

  private async findTool(candidates: string[]) {
    if (!this.toolNames) this.toolNames = new Set((await (await this.connect()).listTools()).tools.map((tool) => tool.name));
    return candidates.find((candidate) => this.toolNames?.has(candidate));
  }
}