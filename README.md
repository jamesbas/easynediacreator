# Easy Media Generator

Easy Media Generator is a private, mobile-friendly Next.js interface for a locally hosted WanGP installation. It creates images, edits images, and generates LTX-2 videos without sending prompts or media to a hosted generation service.

Powered by WanGP by DeepBeepMeep.

## Features

- Create images with Qwen Image or Flux.2 Klein 9B.
- Control image-generation Guidance (CFG); Qwen Lightning/distilled recipes enforce CFG 1.
- Edit a source image with Qwen Image Edit or Flux.2 Klein.
- Add separate reference images to Qwen edits.
- Apply the Qwen face-swap preset with its prompt, Lightning accelerator, face LoRA, strengths, and inference settings configured automatically.
- Generate LTX-2 videos from a required start image and optional end image.
- Select multiple model-aligned LoRAs with individual strengths.
- Select classifier-backed acceleration presets separately from character, style, motion, and other LoRAs.
- Combine acceleration presets with additional validated content LoRAs; preset LoRAs are applied first.
- Save a private default character prompt and insert it into image prompts at the cursor.
- Follow, cancel, retry, and clear in-memory generation jobs.
- Browse, download, reuse, and remove current-session outputs.

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
WANGP_PROFILES_ROOT=C:\path\to\WanGP\profiles
WANGP_LORA_METADATA_ROOT=C:\path\to\WanGP\loras_metadata
WANGP_LORA_CLASSIFIER_OVERRIDES=C:\path\to\EasyMediaGen\data\lora-classifier-overrides.json
```

When `WANGP_PROFILES_ROOT` and `WANGP_LORA_METADATA_ROOT` are omitted, the app derives them as siblings of `WANGP_LORA_ROOT`. The private classifier override path defaults to `data/lora-classifier-overrides.json` in this project.

Restart the app, open Settings, and select **Refresh models**. Unmatched or unavailable allow-listed models remain disabled. WanGP field names are isolated under `lib/wan-gp/adapters`; verify those mappings against the installed WanGP schema.

### LoRA discovery

Easy Media Generator supports multiple model-aligned LoRAs with individual strengths. If WanGP exposes `wangp_list_lora_presets(model_type)`, `wangp_list_loras(model_type)`, or `wangp_get_loras(model_type)`, the app uses the available native tool. Otherwise it reads model-aligned filenames from `WANGP_LORA_ROOT` without changing WanGP source code. The fallback supports this app's Qwen Image, Flux.2 Klein, and LTX-2 families using WanGP's default LoRA subdirectories.

Only immediate `.safetensors` and `.sft` filenames are exposed. Generation passes validated selections using WanGP's documented `activated_loras` and space-separated `loras_multipliers` settings. See [docs/wan-gp-lora-mcp.md](docs/wan-gp-lora-mcp.md) for behavior and custom-directory limitations.

LoRA, profile, metadata, and private override changes invalidate the discovery cache automatically. **Refresh models** also forces immediate rediscovery.

### Acceleration presets

The LoRA classifier separates high-confidence inference recipes from **Other LoRAs**. It prefers these evidence sources in order:

1. Typed presets returned by a future/native WanGP MCP tool.
2. Exact installed-file matches in trusted WanGP acceleration profiles.
3. Private user overrides.
4. Conservative local metadata and filename evidence.

Only authoritative and high-confidence recipes are promoted to **Acceleration presets**. Uncertain files remain under **Other LoRAs** and may be marked as possible accelerators.

Selecting a preset applies its complete server-owned recipe, including required LoRA order, multipliers, CFG, step count, solver, guidance phases, thresholds, and other allow-listed inference settings. Preset-controlled fields are locked in the UI and enforced again on the server.

Additional character, style, motion, or content LoRAs remain selectable with a preset. The app sends required accelerator LoRAs first, followed by additional LoRAs and their strengths. It rejects manually selecting an accelerator file already owned by a preset.

See [lora-classifier.md](lora-classifier.md) for the investigation, confidence model, implementation details, and test plan.

### Image workflow defaults

- Standard Qwen Image uses its discovered Guidance default and submits CFG explicitly.
- Qwen Lightning/distilled recipes force CFG 1.
- Flux.2 Klein image creation defaults to a verified low-memory recipe: `1024x1024`, 4 steps, and WanGP memory profile 4.5. Portrait and landscape options are also available.
- WanGP control/reference state inherited from its UI is cleared for text-to-image creation.

### Local application settings

The Settings page stores an editable default character prompt in `data/app-preferences.json`. The Create Image page can insert it at the current cursor without replacing unrelated prompt text. This file and `data/lora-classifier-overrides.json` are private runtime data and are excluded from Git.

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
- Model-aligned LoRA filenames and preset IDs are validated server-side; browsers cannot submit arbitrary WanGP settings.
- Classifier profile and metadata reads are constrained to configured local roots, and absolute paths are not exposed to browsers.
- Tailscale Serve is the primary access boundary. Keep inbound access to ports 3000 and 7866 blocked because both processes use loopback.

## Current Limitations

- Restarting clears jobs, job prompts, upload handles, and current-session output handles. The saved character prompt and model preferences persist locally.
- Outputs shows current-session media; filesystem rediscovery is not enabled because older files lack trusted prompt/model metadata.
- Acceleration classification is profile-first and intentionally conservative. Ambiguous LoRAs remain unclassified unless a private override is supplied.
- The current WanGP MCP server may not expose LoRA discovery or typed acceleration recipes, so local filesystem/profile access is required for full catalog classification.
- Preset compatibility is enforced per selected model and workflow; incompatible acceleration recipes are not shown.
- Local passcode settings are reserved for a later authentication increment and should remain disabled until middleware is configured.
