import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { config } from "@/lib/config";
import type { WanGpClient, WanGpJobSnapshot } from "./client";
import { asyncGenerationAllowed, checkpointBasename, checkpointEntries, isCheckpointFile, isTerminalGenerationResult, loadCheckpointIndex, normalizeV2Metadata, normalizeV2ModelRecord, parseV2TerminalResult, type CheckpointIndex } from "./api-v2";
import { availabilitySchema, mergeWanGpModelDefinition, modelListSchema, parseLoraCatalog, parseLoraCatalogResponse, parseWanGpJobSnapshot, parseWanGpStructuredContent, parseWanGpTextContent, record } from "./schemas";
import { listLocalLoras } from "./local-lora-catalog";

const MODEL_PAGE_SIZE = 10;
const V2_PAGE_LIMIT = 100;
const V2_MAX_PAGES = 60;
const AVAILABILITY_CONCURRENCY = 8;

const allowedTools = new Set([
  "wangp_list_models", "wangp_get_model_metadata", "wangp_get_model_availability", "wangp_get_default_settings",
  "wangp_get_model_schema", "wangp_get_model", "wangp_model", "wangp_generate", "wangp_get_job", "wangp_cancel_job",
  "wangp_list_lora_presets", "wangp_list_loras", "wangp_get_loras",
  "wangp_models", "wangp_session",
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
  private toolInputProperties?: Map<string, Set<string>>;
  private definitions = new Map<string, Record<string, unknown>>();
  private availability = new Map<string, "available" | "missing">();
  private checkpoints?: Promise<CheckpointIndex | undefined>;
  private asyncGeneration?: Promise<boolean>;
  private terminalJobs = new Map<string, WanGpJobSnapshot>();
  constructor(private readonly endpoint: string, private readonly loraRoot?: string) {}

  async ping() {
    const client = await this.connect();
    const server = client.getServerVersion();
    return { connected: true, version: server?.version };
  }
  async listModels(output?: "image" | "video") {
    if (await this.usesApiV2()) return this.v2ListModels(output);
    const baseArguments = { ...(output ? { main_output: output } : {}), include_availability: true };
    const paginated = await this.toolSupportsArguments("wangp_list_models", ["limit", "offset"]);
    const models = paginated ? await this.listModelPages(baseArguments) : modelListSchema.parse(await this.call("wangp_list_models", baseArguments));
    return output ? models.map((model) => ({ ...model, output })) : models;
  }
  async getModelMetadata(modelType: string) {
    if (await this.usesApiV2()) {
      const capabilities = record(await this.callModelAction(modelType, "capabilities"));
      return normalizeV2Metadata(capabilities.metadata ?? capabilities);
    }
    return record(await this.call("wangp_get_model_metadata", { model_type: modelType }));
  }
  async getModelAvailability(modelType: string) {
    if (await this.usesApiV2()) return this.v2Availability(modelType);
    return availabilitySchema.parse(await this.call("wangp_get_model_availability", { model_type: modelType }));
  }
  async getDefaultSettings(modelType: string) {
    if (await this.usesApiV2()) return record(await this.callModelAction(modelType, "defaults"));
    return record(await this.call("wangp_get_default_settings", { model_type: modelType }));
  }
  async getModelSchema(modelType: string) {
    if (await this.usesApiV2()) {
      const definition = await this.v2Definition(modelType);
      const metadata = normalizeV2Metadata(definition.metadata);
      return mergeWanGpModelDefinition({ metadata }, { ...definition, metadata });
    }
    const schema = record(await this.call("wangp_get_model_schema", { model_type: modelType }));
    const definitionTool = await this.findTool(["wangp_get_model", "wangp_model"]);
    if (!definitionTool) return schema;
    const args = definitionTool === "wangp_model" ? { model_type: modelType, view: "definition" } : { model_type: modelType };
    try {
      return mergeWanGpModelDefinition(schema, record(await this.call(definitionTool, args)));
    } catch {
      return schema;
    }
  }
  async listLoras(modelType: string) {
    if (await this.usesApiV2()) return this.v2ListLoras(modelType);
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
    const source = { ...settings, model_type: modelType };
    if (!await this.usesApiV2()) {
      const result = record(await this.call("wangp_generate", { source, wait: false }));
      return { jobId: z.string().min(1).parse(result.job_id ?? result.jobId ?? result.id) };
    }
    if (await this.v2AsyncGeneration()) {
      const result = record(await this.call("wangp_generate", { action: "generate", arguments: { source, wait: false } }));
      return { jobId: z.string().min(1).parse(result.job_id ?? result.jobId ?? result.id) };
    }
    // Without `--mcp-async` the call blocks for the whole render and returns the terminal result.
    const fallbackId = crypto.randomUUID();
    const result = await this.call("wangp_generate", { action: "generate", arguments: { source, wait: true, event_limit: 0 } }, config.WANGP_GENERATION_TIMEOUT_MS);
    const resultRecord = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : {};
    const jobId = typeof resultRecord.job_id === "string" ? resultRecord.job_id : undefined;
    if (jobId && !isTerminalGenerationResult(result)) return { jobId };
    const snapshot = parseV2TerminalResult(result, fallbackId);
    this.terminalJobs.set(snapshot.id, snapshot);
    return { jobId: snapshot.id };
  }
  async getJob(jobId: string) {
    const terminal = this.terminalJobs.get(jobId);
    if (terminal) return terminal;
    if (await this.usesApiV2()) return parseWanGpJobSnapshot(await this.call("wangp_session", { action: "get_job", arguments: { job_id: jobId } }));
    return parseWanGpJobSnapshot(await this.call("wangp_get_job", { job_id: jobId }));
  }
  async cancelJob(jobId: string) {
    if (this.terminalJobs.has(jobId)) return;
    if (await this.usesApiV2()) { await this.call("wangp_session", { action: "cancel_job", arguments: { job_id: jobId } }); return; }
    await this.call("wangp_cancel_job", { job_id: jobId });
  }

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

  private async call(toolName: string, args: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    if (!allowedTools.has(toolName)) throw new Error("WanGP tool is not allowed.");
    const client = await this.connect();
    const response = timeoutMs
      ? await client.callTool({ name: toolName, arguments: args }, undefined, { timeout: timeoutMs, maxTotalTimeout: timeoutMs, resetTimeoutOnProgress: true })
      : await client.callTool({ name: toolName, arguments: args });
    const result = toolResultSchema.parse(response);
    if (result.isError) {
      const details = result.content.filter((item) => item.type === "text" && item.text).map((item) => item.text).join(" ");
      throw new Error(`WanGP tool ${toolName} failed${details ? `: ${details}` : "."}`);
    }
    if (result.structuredContent !== undefined) return parseWanGpStructuredContent(result.structuredContent);
    return parseWanGpTextContent(result.content);
  }

  private async usesApiV2() {
    await this.loadTools();
    return !this.toolNames?.has("wangp_list_models") && Boolean(this.toolNames?.has("wangp_models") && this.toolNames?.has("wangp_model"));
  }

  private async callModelAction(modelType: string, action: string, actionArguments: Record<string, unknown> = {}) {
    return this.call("wangp_model", { model_type: modelType, action, arguments: actionArguments });
  }

  /** v2 pages every collection with an opaque cursor and its own per-page size budget. */
  private async v2Pages<T>(read: (cursor?: string) => Promise<Record<string, unknown>>, collect: (page: Record<string, unknown>) => T[]) {
    const items: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < V2_MAX_PAGES; page += 1) {
      const result = record(await read(cursor));
      items.push(...collect(result));
      if (result.has_more !== true) break;
      cursor = typeof result.next_cursor === "string" ? result.next_cursor : undefined;
      if (!cursor) break;
    }
    return items;
  }

  private async v2ListModels(output?: "image" | "video") {
    const records = await this.v2Pages(
      (cursor) => this.call("wangp_models", { action: "search", arguments: { limit: V2_PAGE_LIMIT, ...(output ? { filters: { main_output: output } } : {}), ...(cursor ? { cursor } : {}) } }) as Promise<Record<string, unknown>>,
      (page) => (Array.isArray(page.models) ? page.models : []),
    );
    const unique = new Map<string, Record<string, unknown>>();
    for (const entry of records) {
      const model = normalizeV2ModelRecord(entry);
      if (model && typeof model === "object" && typeof (model as Record<string, unknown>).model_type === "string") unique.set(String((model as Record<string, unknown>).model_type), model as Record<string, unknown>);
    }
    const modelTypes = [...unique.keys()];
    await this.primeAvailability(modelTypes);
    const models = modelListSchema.parse(modelTypes.map((modelType) => ({ ...unique.get(modelType), availability: this.availability.get(modelType) ?? "available" })));
    return output ? models.map((model) => ({ ...model, output })) : models;
  }

  private async v2ListLoras(modelType: string) {
    const loras = await this.v2Pages(
      (cursor) => this.callModelAction(modelType, "loras", { limit: V2_PAGE_LIMIT, ...(cursor ? { cursor } : {}) }) as Promise<Record<string, unknown>>,
      (page) => (Array.isArray(page.loras) ? page.loras : []),
    );
    return { supported: true, loras: parseLoraCatalog(loras) };
  }

  private async v2Definition(modelType: string) {
    const cached = this.definitions.get(modelType);
    if (cached) return cached;
    const definition = record(await this.callModelAction(modelType, "definition"));
    this.definitions.set(modelType, definition);
    return definition;
  }

  private checkpointIndex() {
    this.checkpoints ??= config.WANGP_CKPTS_ROOT ? loadCheckpointIndex(config.WANGP_CKPTS_ROOT) : Promise.resolve(undefined);
    return this.checkpoints;
  }

  private async primeAvailability(modelTypes: string[]) {
    if (!await this.checkpointIndex()) return;
    const pending = modelTypes.filter((modelType) => !this.availability.has(modelType));
    let index = 0;
    const worker = async () => {
      while (index < pending.length) {
        const modelType = pending[index++];
        await this.v2Availability(modelType);
      }
    };
    await Promise.all(Array.from({ length: Math.min(AVAILABILITY_CONCURRENCY, pending.length) }, worker));
  }

  /** MCP API v2 dropped availability, so installed weights are matched against WanGP's `ckpts` folder. */
  private async v2Availability(modelType: string) {
    const cached = this.availability.get(modelType);
    if (cached) return { status: cached, ...(cached === "missing" ? { reason: "WanGP has not downloaded this model." } : {}) };
    const index = await this.checkpointIndex();
    if (!index) return { status: "available" as const };
    const installed = await this.hasCheckpoint(modelType, index, new Set());
    const status = installed ? "available" as const : "missing" as const;
    this.availability.set(modelType, status);
    return { status, ...(installed ? {} : { reason: "WanGP has not downloaded this model." }) };
  }

  private async hasCheckpoint(modelType: string, index: CheckpointIndex, seen: Set<string>): Promise<boolean> {
    if (seen.has(modelType) || seen.size > 8) return false;
    seen.add(modelType);
    let definition: Record<string, unknown>;
    try { definition = await this.v2Definition(modelType); } catch { return false; }
    for (const entry of checkpointEntries(definition)) {
      if (isCheckpointFile(entry)) { if (index.has(checkpointBasename(entry))) return true; }
      else if (await this.hasCheckpoint(entry, index, seen)) return true;
    }
    return false;
  }

  private async v2AsyncGeneration() {
    this.asyncGeneration ??= this.call("wangp_generate", { action: "generate", arguments: null })
      .then(asyncGenerationAllowed)
      .catch(() => false);
    return this.asyncGeneration;
  }

  private async listModelPages(baseArguments: Record<string, unknown>) {
    const models = new Map<string, z.infer<typeof modelListSchema>[number]>();
    for (let offset = 0; ; offset += MODEL_PAGE_SIZE) {
      const page = modelListSchema.parse(await this.call("wangp_list_models", { ...baseArguments, limit: MODEL_PAGE_SIZE, offset }));
      const previousSize = models.size;
      for (const model of page) models.set(model.modelType, model);
      if (page.length < MODEL_PAGE_SIZE || models.size === previousSize) break;
    }
    return [...models.values()];
  }

  private async loadTools() {
    if (this.toolNames && this.toolInputProperties) return;
    const tools = (await (await this.connect()).listTools()).tools;
    this.toolNames = new Set(tools.map((tool) => tool.name));
    this.toolInputProperties = new Map(tools.map((tool) => [tool.name, new Set(Object.keys(tool.inputSchema.properties ?? {}))]));
  }

  private async toolSupportsArguments(toolName: string, argumentsToCheck: string[]) {
    await this.loadTools();
    const properties = this.toolInputProperties?.get(toolName);
    return properties ? argumentsToCheck.every((argument) => properties.has(argument)) : false;
  }

  private async findTool(candidates: string[]) {
    await this.loadTools();
    return candidates.find((candidate) => this.toolNames?.has(candidate));
  }
}