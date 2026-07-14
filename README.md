# Easy Media Generator

Easy Media Generator is a private, mobile-friendly Next.js interface for a locally hosted WanGP installation. It creates images, edits images, and generates LTX-2 videos without sending prompts or media to a hosted generation service.

Powered by WanGP by DeepBeepMeep.

## Requirements

- Node.js 20 or newer and npm
- WanGP with its MCP server for real generation
- Tailscale on the WanGP computer and approved browser devices
- `ffmpeg` only for fake development video fixtures

No database or Python application backend is required.

## Local Development

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. The default `WANGP_CLIENT_MODE=fake` discovers fixture models and creates local outputs without a GPU.

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

## Connect WanGP

Start WanGP MCP on loopback from its installation directory:

```powershell
python wgp.py --mcp `
	--mcp-transport streamable-http `
	--mcp-host 127.0.0.1 `
	--mcp-port 7866
```

Set the real output directory in `.env.local`:

```env
WANGP_CLIENT_MODE=live
WANGP_MCP_URL=http://127.0.0.1:7866/mcp
WANGP_OUTPUT_ROOT=C:\path\to\WanGP\outputs
WANGP_LORA_ROOT=C:\path\to\WanGP\loras
```

Restart the app, open Settings, and select **Refresh models**. Unmatched or unavailable allow-listed models remain disabled. WanGP field names are isolated under `lib/wan-gp/adapters`; verify those mappings against the installed WanGP schema.

### LoRA discovery

Easy Media Generator supports multiple model-aligned LoRAs with individual strengths. If WanGP exposes `wangp_list_loras(model_type)` or `wangp_get_loras(model_type)`, the app uses that tool. Otherwise it reads model-aligned filenames from `WANGP_LORA_ROOT` without changing WanGP source code. The fallback supports this app's Qwen Image, Flux.2 Klein, and LTX-2 families using WanGP's default LoRA subdirectories.

Only immediate `.safetensors` and `.sft` filenames are exposed. Generation passes validated selections using WanGP's documented `activated_loras` and space-separated `loras_multipliers` settings. See [docs/wan-gp-lora-mcp.md](docs/wan-gp-lora-mcp.md) for behavior and custom-directory limitations.

## Private Production Deployment

```powershell
npm ci
npm run build
npm start
```

On Windows, double-click `run-easy-media-generator.bat` to install missing dependencies, build the current source, and start the production server. Keep its console window open while using the app; press `Ctrl+C` to stop it.

The `start` script binds to `127.0.0.1`. Do not add router port forwarding or bind the web app or MCP endpoint to `0.0.0.0`.

The Tailscale CLI installed on this host supports:

```powershell
tailscale serve --bg 3000
tailscale serve status
```

Serve publishes private HTTPS to the tailnet. Do not run `tailscale funnel`. Restrict the server with Tailscale grants/ACLs to the intended identity or devices; a useful server tag is `tag:wan-media-server`. Test from one approved and one unapproved identity after policy changes.

For unattended Windows operation, run `npm start` from Task Scheduler at sign-in or through the service manager already used on the host. Set this repository as the working directory. WanGP starts separately with its loopback MCP arguments.

## Security Model

- Browsers call only Next.js routes and never receive the MCP URL.
- Uploads are size limited, signature checked, decoded, and assigned opaque IDs.
- Output URLs resolve opaque in-memory IDs and cannot select filesystem paths.
- Original media is streamed with HTTP range and attachment download support.
- Jobs and handles are intentionally lost on restart; WanGP output files remain.
- Tailscale Serve is the primary access boundary. Keep inbound access to ports 3000 and 7866 blocked because both processes use loopback.

## Current Limitations

- Restarting clears jobs, prompts, upload handles, and current-session output handles.
- Outputs shows current-session media; filesystem rediscovery is not enabled because older files lack trusted prompt/model metadata.
- Local passcode settings are reserved for a later authentication increment and should remain disabled until middleware is configured.
