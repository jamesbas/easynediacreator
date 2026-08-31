# Easy Media Generator

Easy Media Generator is a private, mobile-friendly Next.js interface for a locally hosted WanGP installation. It creates images, edits images, and generates videos without sending prompts or media to a hosted generation service.

Powered by WanGP by DeepBeepMeep.

## Features

- Create images with Qwen Image or Flux.2 Klein 9B.
- Use model-discovered resolutions, step and guidance ranges, solvers, schedulers, FPS, and duration constraints across generation workflows.
- Control image-generation Guidance (CFG); Qwen Lightning/distilled recipes enforce CFG 1.
- Edit a source image with Qwen Image Edit or Flux.2 Klein.
- Add separate reference images to Qwen edits.
- Apply the Qwen face-swap preset with its prompt, Lightning accelerator, face LoRA, strengths, and inference settings configured automatically.
- Apply the exclusive Qwen Sharpen and Unblur preset using `Qwen-Image-Edit-Unblur-Upscale_20.safetensors` at strength 1.
- Batch Face Swap or Sharpen and Unblur across up to 10 uploaded source images, creating one job per source with shared preset settings.
- Generate videos with any locally available WanGP video model, using text and optional start/end images according to each model's capabilities.
- Choose video duration within the selected model's discovered constraints; the app converts seconds to WanGP's required aligned frame count.
- Adjust start-image/source strength when the selected model exposes it and use the model's discovered inference-step default.
- Select multiple model-aligned LoRAs with individual strengths.
- Select classifier-backed acceleration presets separately from character, style, motion, and other LoRAs.
- Combine acceleration presets with additional validated content LoRAs; preset LoRAs are applied first.
- Save a private default character prompt and insert it into image prompts at the cursor.
- Enhance any generation prompt through a language model running in LM Studio, written for the checkpoint that will render it.
- Follow, cancel, retry, clear, and reuse the settings of in-memory generation jobs.
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

Restart the app, open Settings, and select **Refresh models**. Unmatched or unavailable allow-listed image models remain disabled. Every video model that WanGP reports as locally available is exposed as a separate Create Video option. WanGP field names are isolated under `lib/wan-gp/adapters`; verify those mappings against the installed WanGP schema.

### Schema-driven generation controls

Create Image, Edit Image, and Create Video derive supported resolutions, step and guidance bounds, solver choices, scheduler choices, FPS, and duration constraints from `wangp_get_model_schema` and `wangp_get_default_settings`. On current WanGP servers, the app also reads a compact projection from `wangp_get_model` because detailed parameter declarations moved out of the compact schema response.

- Resolution, steps, guidance, and duration are displayed in the main generation settings rail.
- FPS, solver, scheduler, and seed are displayed under **Advanced**.
- Solver and scheduler selectors appear only when WanGP publishes concrete choices for the selected model.
- Labeled WanGP choices retain their display label while submitting the corresponding setting value.
- The server validates every submitted value against the same normalized model contract before calling `wangp_generate`.
- Prompt textareas accept paragraphs; CRLF/LF breaks are joined with spaces before submission so Wan2GP receives one generation prompt even when `multi_prompts_gen_type` is `PG`.

Older or partially serializable WanGP schemas fall back to the app's existing conservative ranges and selected-model defaults. A missing solver or scheduler catalog hides that selector rather than guessing unsupported values. Use **Refresh models** after changing models or WanGP configuration.

### LoRA discovery

Easy Media Generator supports multiple model-aligned LoRAs with individual strengths. If WanGP exposes `wangp_list_lora_presets(model_type)`, `wangp_list_loras(model_type)`, or `wangp_get_loras(model_type)`, the app uses the available native tool. Otherwise it reads model-aligned filenames from `WANGP_LORA_ROOT` without changing WanGP source code. The fallback supports this app's Qwen Image, Flux.2 Klein, and LTX-2 families using WanGP's default LoRA subdirectories.

Native WanGP catalogs may expose safe subfolder-relative LoRA identifiers. The local fallback exposes only immediate `.safetensors` and `.sft` filenames. Generation passes validated selections using WanGP's documented `activated_loras` and space-separated `loras_multipliers` settings. See [docs/wan-gp-lora-mcp.md](docs/wan-gp-lora-mcp.md) for behavior and custom-directory limitations.

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
- Image Edit offers a **Sharpen and Unblur** toggle for Qwen. It defaults the editable prompt to `unblur and upscale`, preserves the prior prompt for restoration when disabled, keeps the current step count, applies only `Qwen-Image-Edit-Unblur-Upscale_20.safetensors` at strength 1, and disallows Face Swap, acceleration presets, and all other LoRAs for that job.
- Face Swap and Sharpen and Unblur accept up to 10 uploaded, dropped, or pasted source images. Each source is submitted as a separate job using the same selected preset, prompt, references, and inference settings. Standard image edits continue to accept one source image.

### Job setting reuse

Completed, failed, and cancelled jobs provide **Reuse settings** on the Jobs page. It reopens the matching Create Image, Edit Image, or Create Video form with the saved prompt, model, generation controls, LoRAs, preset, and available source/reference uploads restored. If the saved model is no longer available, the form keeps the reusable values but requires another model before submission.

Job request snapshots and upload handles are stored in memory, so setting reuse is available only until the app restarts or the finished job is cleared. Retry remains available for failed and cancelled jobs and immediately resubmits the saved request.

### Video workflow controls

- **Model discovery** lists every locally available MCP video model by its exact `model_type`; it is not restricted by an application video allow-list. `DEFAULT_VIDEO_MODEL` may name an exact model type and defaults to `minimax_h3_fl2va_pruned_pdd`. The legacy `ltx-2` value preserves the saved preferred LTX checkpoint when available.
- **Text or image input** follows model capabilities. Text-to-video models can submit without an image. Start and end pickers are enabled only when the selected model advertises those frame inputs, and a start image is required only when text-to-video is unavailable.
- **Duration** uses the selected model's discovered minimum, maximum, increment, and default, falling back to 1–20 seconds with a 15-second default. Frame-based models receive an aligned frame count; seconds-based models receive `duration_seconds`.
- **Frames per second** uses the discovered model range under **Advanced** and maps to WanGP's available `force_fps`, `fps`, or `frame_rate` setting.
- **Start image / source strength** appears only when the selected model publishes a compatible strength setting, such as `input_video_strength`, `source_strength`, or `denoising_strength`.
- **Steps** and **Guidance (CFG)** use discovered model bounds when published. Steps map to `num_inference_steps`; guidance maps to `guidance_scale` or `cfg_scale`.

### Prompt enhancement

Every prompt box on Create Image, Edit Image, and Create Video carries an **Enhance prompt** button. It sends the current prompt to a language model running locally in LM Studio (or any OpenAI-compatible server), replaces the prompt with the rewrite, and offers **Undo** to put the original back. The button is hidden entirely until a server is named:

```env
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1
# Empty asks LM Studio which model is currently loaded.
LM_STUDIO_MODEL=
LM_STUDIO_MAX_TOKENS=8000
LM_STUDIO_TIMEOUT_MS=240000
```

Nothing leaves the machine: the rewrite is another local model call, and the prompt is never logged.

The rewrite is written for the checkpoint that will render it, because the families disagree about what a good prompt is. FLUX and Krea have no dependable negative prompt, so exclusions are rewritten as the thing to render instead; Qwen is literal about structure and quoted lettering; Wan wants motion plus camera and little else; LTX wants one flowing present-tense paragraph and writes its own soundtrack from it. MiniMax H3 takes a labelled envelope rather than prose, so an H3 rewrite comes back as its published `integrated_multimodal_description` / `overall_soundscape` / `non_diegetic_music` structure with the alignment line that says where each supplied keyframe lands in time. Speech is tagged the way H3's guide requires, since an untagged quotation inside that format is description rather than a line to perform. An unrecognised checkpoint gets no family guidance at all — a prompt written for one model and rendered by another is worse than a neutral one.

A reasoning model spends `LM_STUDIO_MAX_TOKENS` on thinking before it emits any content, so a budget that looks generous for the answer can still truncate it. Response format is negotiated once per process down `json_schema` → `json_object` → plain text; LM Studio accepts the first and last and refuses the middle one.

#### Freeing the GPU before a render

Enhancement and generation want the same card, and LM Studio keeps its model resident long after a rewrite finishes — its default idle TTL is an hour — so the next WanGP render can find no VRAM and fail with an out-of-memory hint. Every job therefore evicts the language model immediately before it is submitted, using LM Studio's `lms` CLI, which is the only interface that exposes unloading.

It runs at submission rather than at queue time, because a queued job may wait minutes and the VRAM has to be free at the moment WanGP loads its checkpoint. It is skipped entirely when nothing is resident, so no process is spawned when LM Studio is closed. It can never fail a job: an unreachable server, a missing CLI or a failing one are logged and the render is attempted anyway.

```env
LM_STUDIO_UNLOAD_BEFORE_GENERATION=true
# LM Studio puts `lms` on PATH; override for unusual installs.
LM_STUDIO_CLI_PATH=lms
LM_STUDIO_CLI_TIMEOUT_MS=60000
```

Set `LM_STUDIO_UNLOAD_BEFORE_GENERATION=false` on a machine with headroom for both, or one where the language model runs on different hardware. LM Studio reloads the model on the next enhancement by itself.

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

- Restarting clears jobs, reusable job settings, upload handles, and current-session output handles. The saved character prompt and model preferences persist locally.
- Outputs shows current-session media; filesystem rediscovery is not enabled because older files lack trusted prompt/model metadata.
- Acceleration classification is profile-first and intentionally conservative. Ambiguous LoRAs remain unclassified unless a private override is supplied.
- The current WanGP MCP server may not expose LoRA discovery or typed acceleration recipes, so local filesystem/profile access is required for full catalog classification.
- Preset compatibility is enforced per selected model and workflow; incompatible acceleration recipes are not shown.
- Local passcode settings are reserved for a later authentication increment and should remain disabled until middleware is configured.
