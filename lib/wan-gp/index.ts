import type { WanGpClient } from "./client";
import { FakeWanGpClient } from "./fake-client";
import { LiveWanGpClient } from "./live-client";
import { config } from "@/lib/config";

const globalForWanGp = globalThis as unknown as { wanGpClient?: WanGpClient };
export function getWanGpClient(): WanGpClient {
	globalForWanGp.wanGpClient ??= config.WANGP_CLIENT_MODE === "live" ? new LiveWanGpClient(config.WANGP_MCP_URL, config.WANGP_LORA_ROOT) : new FakeWanGpClient();
	return globalForWanGp.wanGpClient;
}
export function setWanGpClientForTests(client?: WanGpClient) { globalForWanGp.wanGpClient = client; }