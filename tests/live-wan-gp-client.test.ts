import { beforeEach, describe, expect, it, vi } from "vitest";

const mcp = vi.hoisted(() => ({
  callTool: vi.fn(),
  connect: vi.fn(),
  listTools: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    callTool = mcp.callTool;
    connect = mcp.connect;
    listTools = mcp.listTools;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {},
}));

import { LiveWanGpClient } from "@/lib/wan-gp/live-client";

function model(modelType: string) {
  return { model_type: modelType, name: modelType, family: "fixture", main_output: ["image"], inputs: ["text"] };
}

function result(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: { result: value } };
}

describe("LiveWanGpClient", () => {
  beforeEach(() => {
    mcp.callTool.mockReset();
    mcp.connect.mockReset();
    mcp.listTools.mockReset();
  });

  it("collects every bounded model page advertised by current Wan2GP", async () => {
    mcp.listTools.mockResolvedValue({ tools: [{ name: "wangp_list_models", inputSchema: { type: "object", properties: { limit: {}, offset: {} } } }] });
    mcp.callTool.mockImplementation(({ arguments: args }) => Promise.resolve(result(args.offset === 0
      ? Array.from({ length: 10 }, (_, index) => model(`page-one-${index}`))
      : [model("target-on-page-two")])));

    const models = await new LiveWanGpClient("http://wan-gp.test/mcp").listModels("image");

    expect(models.map((item) => item.modelType)).toContain("target-on-page-two");
    expect(mcp.callTool).toHaveBeenNthCalledWith(2, { name: "wangp_list_models", arguments: { main_output: "image", include_availability: true, limit: 10, offset: 10 } });
  });

  it("keeps the legacy single-call contract when pagination is not advertised", async () => {
    mcp.listTools.mockResolvedValue({ tools: [{ name: "wangp_list_models", inputSchema: { type: "object", properties: {} } }] });
    mcp.callTool.mockResolvedValue(result([model("legacy-model")]));

    await new LiveWanGpClient("http://wan-gp.test/mcp").listModels("image");

    expect(mcp.callTool).toHaveBeenCalledOnce();
    expect(mcp.callTool).toHaveBeenCalledWith({ name: "wangp_list_models", arguments: { main_output: "image", include_availability: true } });
  });

  it("merges controls from the current full model definition", async () => {
    mcp.listTools.mockResolvedValue({ tools: [
      { name: "wangp_get_model_schema", inputSchema: { type: "object", properties: { model_type: {} } } },
      { name: "wangp_get_model", inputSchema: { type: "object", properties: { model_type: {} } } },
    ] });
    mcp.callTool
      .mockResolvedValueOnce(result({ metadata: { capabilities: { lora: true } } }))
      .mockResolvedValueOnce(result({ sample_solvers: [["Default", "default"]], metadata: { setting_values: { sample_solver: { choices: [["Default", "default"]] } } } }));

    const schema = await new LiveWanGpClient("http://wan-gp.test/mcp").getModelSchema("qwen-edit");

    expect(schema).toMatchObject({ model_def: { sample_solvers: [["Default", "default"]] }, metadata: { capabilities: { lora: true }, setting_values: { sample_solver: { choices: [["Default", "default"]] } } } });
  });

  it("keeps the compact schema when optional definition discovery fails", async () => {
    mcp.listTools.mockResolvedValue({ tools: [
      { name: "wangp_get_model_schema", inputSchema: { type: "object", properties: { model_type: {} } } },
      { name: "wangp_get_model", inputSchema: { type: "object", properties: { model_type: {} } } },
    ] });
    mcp.callTool
      .mockResolvedValueOnce(result({ metadata: { model_type: "legacy-model" } }))
      .mockRejectedValueOnce(new Error("Definition is unavailable"));

    await expect(new LiveWanGpClient("http://wan-gp.test/mcp").getModelSchema("legacy-model"))
      .resolves.toEqual({ metadata: { model_type: "legacy-model" } });
  });
});