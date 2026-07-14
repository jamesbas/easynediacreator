# WAN Media Studio — Web Application Build Specification

## 1. Purpose

Build a small, private, mobile-friendly web application that provides a simplified front end for selected WanGP image and video generation capabilities.

The application is intentionally **not** a storyboard, multi-agent, or production-planning system. It has only three primary workflows:

1. **Create Image** — enter a prompt and generate a new image.
2. **Edit Image** — upload or select an image, enter an edit prompt, and generate an edited image.
3. **Create Video** — upload or select a starting image, optionally provide an ending image, enter a video prompt, and generate a video.

The app connects to the existing WanGP environment through WanGP's MCP server. It must be accessible only from approved devices connected to the same Tailscale tailnet.

Working product name used in this specification: **WAN Media Studio**.

---

## 2. Product Goals

### 2.1 Primary goals

- Provide a much simpler interface than the full WanGP UI.
- Work well from an iPhone, iPad, laptop, or desktop browser.
- Support image creation, image editing, and image-to-video generation.
- Accept prompts written by the user without requiring an internal prompt-generation agent.
- Restrict the available models to an administrator-defined allow-list.
- Make model changes possible through configuration rather than code changes.
- Show generation progress and allow the user to cancel a running job.
- Let the user preview and directly download/save every generated image or video to the browser device.
- Keep generated media only in WanGP's local output folders unless the user downloads a copy.
- Keep WanGP and its MCP endpoint private and inaccessible from the public internet.

### 2.2 Non-goals for the first release

- Storyboards, scenes, scripts, or timeline editing.
- Multi-agent orchestration.
- Automatic prompt writing or prompt enhancement.
- Audio generation or audio editing.
- Video-to-video generation.
- Control-video workflows.
- LoRA management or model installation.
- Advanced WanGP configuration screens.
- Multi-user collaboration.
- Public sharing links.
- Cloud deployment.
- Billing, credits, quotas, or subscriptions.

---

## 3. Current Model Scope

The UI must initially expose only the following logical model choices.

### 3.1 Image generation and editing

- **Qwen Image**
- **Qwen Image Edit**
- **Flux.2 Klein 9B**

> Note: The user referred to “Quin” and “Cline 9B.” This specification uses the WanGP model-family names **Qwen Image** and **Flux.2 Klein 9B**. The implementation must not hard-code WanGP model IDs until it discovers the exact installed IDs from the MCP server.

### 3.2 Video generation

- **LTX-2**, restricted to the installed LTX-2 model or finetune selected in configuration.

WanGP currently exposes model-discovery metadata, schemas, defaults, capabilities, and local availability through its MCP server. The application must use these discovery functions during startup and must map human-friendly logical names to the exact WanGP `model_type` identifiers found on the local server.

### 3.3 Configuration-driven model allow-list

Model choices must be controlled in one configuration file or environment-backed configuration module.

Example:

```ts
export const enabledModels = {
  imageCreate: [
    { key: "qwen-image", modelType: "AUTO_DISCOVER", family: "qwen" },
    { key: "flux-klein-9b", modelType: "AUTO_DISCOVER", family: "flux" },
  ],
  imageEdit: [
    { key: "qwen-image-edit", modelType: "AUTO_DISCOVER", family: "qwen" },
    { key: "flux-klein-9b", modelType: "AUTO_DISCOVER", family: "flux" },
  ],
  videoCreate: [
    { key: "ltx-2", modelType: "ltx2_22B_distilled", family: "ltx2" },
  ],
} as const;
```

The final implementation should support either:

- an explicit `modelType`, or
- a discovery rule using family, output modality, inputs, finetune status, and an optional name pattern.

If an enabled model cannot be found or is reported as missing locally, disable it in the UI and show a concise explanation rather than failing the entire app.

---

## 4. Recommended Architecture

### 4.1 Architecture summary

Use a **TypeScript-first modular monolith** for the web application, with WanGP running as a separate Python process and exposing an MCP server.

```text
Approved iPhone / iPad / Computer
            |
            | Tailscale tailnet only
            v
Tailscale Serve HTTPS endpoint
            |
            v
Next.js TypeScript Web Application
  - Responsive UI
  - Route handlers
  - Validation
  - Job tracking
  - In-memory job and output state
  - WanGP MCP client adapter
            |
            | localhost or Tailscale-private connection
            v
WanGP MCP Server
            |
            v
WanGP Python Runtime + GPU
  - Qwen Image / Edit
  - Flux.2 Klein 9B
  - LTX-2
            |
            v
WanGP Output Folders
```

### 4.2 Local-only execution and connectivity

All model inference and media generation occur on the user's personal GPU computer running WanGP. No prompts, source images, ending images, generated images, or generated videos are sent to a hosted application backend or cloud generation service by this app.

The iPhone, iPad, or computer acts only as a browser client. It reaches the personal WanGP computer over the private Tailscale tailnet. Tailscale provides encrypted private connectivity; it does not move generation to a centralized server.

Expected path:

```text
Browser on approved device
  -> encrypted Tailscale connection
  -> Next.js app on personal GPU computer
  -> localhost WanGP MCP server
  -> local WanGP models and GPU
  -> local WanGP output folder
  -> browser download/share to the requesting device
```

### 4.2 Critical boundary

The browser must **never connect directly to the MCP server**.

All MCP calls must be made server-side by the Next.js application. The MCP endpoint should bind to `127.0.0.1` whenever the web app and WanGP run on the same machine.

Recommended WanGP MCP startup pattern:

```powershell
python wgp.py --mcp `
  --mcp-transport streamable-http `
  --mcp-host 127.0.0.1 `
  --mcp-port 7866
```

The app connects internally to:

```text
http://127.0.0.1:7866/mcp
```

Do not bind the MCP server to `0.0.0.0` unless the app and WanGP are separated across trusted tailnet machines and access is explicitly restricted.

---

## 5. Technology Stack

### 5.1 Required stack

| Layer | Technology |
|---|---|
| Language | TypeScript with strict mode |
| Web framework | Next.js App Router |
| UI | React |
| Styling | Tailwind CSS |
| Component primitives | shadcn/ui or lightweight custom components |
| Validation | Zod |
| MCP client | `@modelcontextprotocol/sdk` |
| Persistence | No database required; use in-memory job state and filesystem discovery |
| Testing | Vitest + Testing Library |
| End-to-end testing | Playwright |
| Logging | Pino structured logging |
| Package manager | npm or pnpm; choose one and use it consistently |
| Deployment | Local Node.js process or Docker container on the WanGP server |
| Private access | Tailscale Serve |

### 5.2 No database requirement

The first release must not require Prisma, SQLite, PostgreSQL, or any other database. The application is a lightweight local front end for WanGP, not a media catalog or durable job-management system.

Use:

- in-memory state for active and recently completed jobs;
- WanGP job IDs while the app process is running;
- WanGP output paths returned by MCP;
- optional filesystem scanning of the configured WanGP output folder for a simple current-session/recent-output view.

It is acceptable for job history, prompts, and UI state to disappear when the app restarts. Generated media remains on the WanGP computer in its normal output folder. A database may be added later only as an optional feature.

### 5.3 No Python application backend

Do not add FastAPI for the first release. WanGP already owns the Python generation runtime and exposes MCP. The Next.js server is the application backend.

Add a custom Python sidecar only if a required WanGP capability is not available through MCP.

---

## 6. User Experience

### 6.1 Application shell

The app must have a minimal navigation structure:

- **Create Image**
- **Edit Image**
- **Create Video**
- **Outputs**
- **Jobs**
- **Settings**

On mobile, use a bottom navigation bar or compact menu. On tablet and desktop, use a left sidebar or top navigation.

### 6.2 Create Image page

Required fields:

- Prompt — large multiline text area.
- Model — Qwen Image or Flux.2 Klein 9B, based on configured availability.
- Aspect ratio or resolution — populated from the selected model schema/defaults.
- Number of outputs — default 1, maximum configurable.
- Seed — optional; blank means random.
- Advanced options — collapsed by default.

Primary action:

- **Generate Image**

Output behavior:

- Create a job record.
- Submit the generation through MCP.
- Show queued/running progress.
- Display completed image cards.
- Allow download, reuse as edit input, reuse as video start frame, and download/save to the connected device.

### 6.3 Edit Image page

Required fields:

- Source image — upload, paste, drag-and-drop, camera/photo-library selection on iOS, or choose from Gallery.
- Edit prompt — multiline text area.
- Model — Qwen Image Edit or Flux.2 Klein 9B, based on configured availability.
- Aspect ratio/resolution behavior:
  - Preserve source dimensions by default where supported.
  - Allow supported output resolution overrides.
- Seed — optional.
- Advanced options — collapsed by default.

Optional mask support:

- Masking/inpainting is **Phase 2**, unless the selected WanGP schema exposes a simple image-mask input that can be implemented without recreating the WanGP editor.
- Phase 1 supports whole-image prompt-based editing.

Primary action:

- **Edit Image**

Output actions:

- Download.
- Edit again.
- Use as video start frame.
- Compare source and output with a slider or side-by-side view.

### 6.4 Create Video page

Required fields:

- Start image — required for the first release.
- End image — optional; show only when the selected LTX-2 schema reports end-frame support.
- Prompt — multiline text area.
- LTX-2 model choice — normally one configured default; allow future additional LTX-2 variants.
- Duration — use supported values discovered from the model schema or configured presets.
- Resolution/aspect ratio — supported values only.
- Frames per second — default from WanGP model settings; advanced field.
- Seed — optional.
- Advanced options — collapsed by default.

Primary action:

- **Generate Video**

Output behavior:

- Display an inline HTML5 video player.
- Provide download.
- Show the start and end image used.
- Allow reuse of the generated video metadata and settings.
- Do not implement video editing in Phase 1.

### 6.5 Save and export behavior

Saving/exporting generated media is a primary requirement. Every completed image and video must expose:

- **Download** — streams the original generated file to the connected browser device with a meaningful filename and `Content-Disposition: attachment`;
- **Open / Preview** — opens the image or video in a full-screen viewer;
- **Share** — use the Web Share API with files when supported, especially on iPhone and iPad;
- **Save guidance** — on iOS/iPadOS, make it easy to use the system Share sheet to save an image/video to Photos or Files.

The downloaded copy is saved on the device running the browser—not in a central cloud service. The original output also remains on the personal WanGP computer in its configured local output directory.

Downloads must preserve full resolution and original encoding. Thumbnails or preview renditions must never be substituted for the downloaded original.

### 6.5 Jobs page

Display current and recent jobs with:

- job type;
- selected model;
- status;
- submission time;
- elapsed time;
- current progress/status text;
- thumbnail when available;
- cancel action for active jobs;
- retry action for failed jobs;
- error details in an expandable panel.

Statuses:

```ts
type JobStatus =
  | "draft"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled";
```

### 6.6 Outputs page

Provide a simple current-session and recent-files output view. It may scan the configured WanGP output folder and does not require a database. Suggested filters:

- Images
- Videos
- Created
- Edited
- Model
- Date

Each asset card should show:

- thumbnail;
- asset type;
- model;
- prompt excerpt;
- creation date;
- actions: view, download/save, reuse, copy prompt when available, and inspect settings from the current session.

Do not require catalog records. Do not delete physical WanGP files in Phase 1. Filesystem deletion can be added later as an explicit administrator-only option.

### 6.7 Settings page

Provide read-only operational status plus a few safe preferences:

- WanGP MCP connection status.
- WanGP version if exposed.
- Enabled model list.
- Model availability: available, partial, or missing.
- Default image model.
- Default image-edit model.
- Default LTX-2 model.
- Default resolution.
- Default duration.
- Output/gallery root.
- App version.

Do not expose arbitrary MCP URLs, filesystem paths, or model IDs to normal users unless an advanced administrator mode is enabled.

---

## 7. WanGP MCP Integration

### 7.1 Required MCP tools

The adapter must support these WanGP tools:

- `wangp_list_models`
- `wangp_get_model_metadata`
- `wangp_get_model_availability`
- `wangp_get_default_settings`
- `wangp_get_model_schema`
- `wangp_generate`
- `wangp_get_job`
- `wangp_cancel_job`

### 7.2 Startup discovery flow

At application startup, and on manual refresh:

1. Connect to the configured MCP endpoint.
2. Call `wangp_list_models` for image and video outputs.
3. Filter models using the configured allow-list.
4. Fetch schema, defaults, metadata, and availability for each matched model.
5. Validate discovery responses with Zod.
6. Store discovery data in memory; optionally persist a small non-sensitive JSON cache file if startup performance requires it.
7. Disable unmatched or unavailable models in the UI.
8. Log discovery changes, such as a model ID changing after a WanGP update.

Do not assume names or settings remain stable between WanGP releases.

### 7.3 Generation submission flow

1. Browser uploads any media to the Next.js server.
2. Server validates file type, size, dimensions, and MIME signature.
3. Server saves it to a private staging folder.
4. The selected workflow service builds a WanGP settings dictionary using:
   - discovered model defaults;
   - allowed user overrides;
   - normalized absolute media paths;
   - configured output settings.
5. Server calls `wangp_generate` with `wait: false`.
6. Keep the returned WanGP job ID in the server-side in-memory job registry.
7. Poll `wangp_get_job` server-side.
8. Push progress to the UI through Server-Sent Events, or allow lightweight client polling.
9. On completion, capture generated file paths from the result.
10. Return safe output handles to the UI and optionally create temporary thumbnails in the app cache.

### 7.4 Thin model adapters

Implement one adapter per logical workflow, not one large generic function:

```text
lib/wan-gp/
  client.ts
  discovery.ts
  model-registry.ts
  schemas.ts
  settings-builder.ts
  adapters/
    qwen-image.ts
    qwen-image-edit.ts
    flux-klein-image.ts
    ltx2-video.ts
```

Each adapter must:

- consume a typed application request;
- merge it with the current WanGP defaults;
- produce the exact WanGP settings object;
- reject unsupported fields;
- keep model-specific field names out of UI components.

### 7.5 No arbitrary tool execution

The app must not provide a generic “call any MCP tool” endpoint. Only call allow-listed WanGP tools with validated arguments.

---

## 8. Media Uploads and File Handling

### 8.1 Accepted formats

Initial input support:

- JPEG
- PNG
- WebP

Optional later support:

- HEIC/HEIF from iPhone, converted server-side to PNG or JPEG.

Generated outputs:

- Image formats returned by WanGP.
- MP4 for browser-compatible video playback whenever the selected WanGP settings allow it.

### 8.2 Upload limits

Make limits configurable:

```env
MAX_IMAGE_UPLOAD_MB=25
MAX_VIDEO_OUTPUT_MB=1000
```

Validate:

- MIME type;
- magic bytes/file signature;
- image dimensions;
- decoded image validity;
- filename sanitization.

Never trust the uploaded filename or browser-supplied MIME type.

### 8.3 Storage folders

```text
data/
  uploads/
    <job-id>/
  thumbnails/
  temp/
```

WanGP outputs remain in the WanGP-configured output folder. Keep their canonical paths only in the server-side runtime state or derive them from WanGP job results.

### 8.4 Serving generated files

Do not expose arbitrary filesystem paths.

Use an authenticated/authorized route handler that:

- accepts an opaque, signed output token or current-session output ID;
- resolves the path from the server-side runtime registry;
- verifies the canonical path is inside an approved WanGP output root;
- sets the correct content type;
- supports HTTP range requests for video playback;
- prevents path traversal.

---

## 9. Tailscale-Only Security Design

### 9.1 Primary deployment model

Run the Next.js app on the same server as WanGP and bind it only to localhost:

```text
127.0.0.1:3000
```

Use Tailscale Serve to provide private HTTPS access to tailnet devices.

Conceptual command:

```powershell
tailscale serve --bg http://127.0.0.1:3000
```

Use the exact syntax supported by the installed Tailscale version.

### 9.2 No public ingress

- Do not configure router port forwarding.
- Do not use Tailscale Funnel.
- Do not expose port 3000 publicly.
- Do not expose WanGP port 7866 publicly.
- Configure the Windows firewall to block inbound LAN/public access to application and MCP ports where appropriate.
- Prefer loopback-only bindings for both services.

### 9.3 Tailnet access policy

Use Tailscale grants or ACLs to restrict the app to the intended account/devices. Tag the WanGP server, for example:

```text
tag:wan-media-server
```

Restrict access to HTTPS or the selected Serve endpoint. The exact policy depends on the user's tailnet identity and plan, but the intended rule is:

```text
Only Jaime's approved tailnet identity or approved devices
may access the WAN Media Studio service on the WanGP server.
```

Add policy tests where possible so a future tailnet policy edit does not accidentally grant broader access.

### 9.4 Defense in depth

Tailscale is the primary access boundary. Add optional application authentication through a feature flag:

- single-user passkey;
- local PIN plus secure cookie;
- or Tailscale identity headers if a supported identity-aware proxy arrangement is used.

For Phase 1, a local passcode is acceptable as secondary protection, but it must:

- be stored as an Argon2id hash;
- use secure, HTTP-only, SameSite cookies;
- rate-limit failed attempts;
- never be logged.

Do not make the app reachable from the public internet merely to simplify authentication.

### 9.5 CSRF and request security

Even on a tailnet:

- enforce same-origin checks for state-changing requests;
- use CSRF tokens where appropriate;
- set a restrictive Content Security Policy;
- set `X-Content-Type-Options: nosniff`;
- use secure cookies;
- reject oversized bodies early;
- rate-limit job submissions;
- allow only one or a configurable small number of active GPU jobs.

---

## 10. Runtime State and File Model

No relational database or ORM is required.

### 10.1 In-memory job registry

Maintain a server-side in-memory registry containing only what is needed while the app is running:

```ts
type RuntimeJob = {
  id: string;
  wanGpJobId?: string;
  workflowType: "image-create" | "image-edit" | "video-create";
  modelKey: string;
  status: JobStatus;
  prompt: string;
  submittedAt: string;
  progressPercent?: number;
  statusMessage?: string;
  outputPaths?: string[];
  error?: unknown;
};
```

### 10.2 Output handles

Never send local filesystem paths to the browser. For each completed output, create an opaque current-session ID or short-lived signed token that maps server-side to a validated path inside `WANGP_OUTPUT_ROOT`.

### 10.3 Restart behavior

After an app restart:

- active in-memory job history may be lost;
- previously generated files remain in WanGP's local output folders;
- the optional Outputs page may rediscover recent files by scanning approved output folders;
- no database migration, recovery, or durable prompt history is required.

## 11. API Design

Use thin Next.js route handlers with Zod validation.

### 11.1 Suggested routes

```text
GET    /api/health
GET    /api/models
POST   /api/models/refresh

POST   /api/uploads/image

POST   /api/jobs/image-create
POST   /api/jobs/image-edit
POST   /api/jobs/video-create
GET    /api/jobs
GET    /api/jobs/:id
POST   /api/jobs/:id/cancel
POST   /api/jobs/:id/retry
GET    /api/jobs/:id/events

GET    /api/assets
GET    /api/assets/:id
GET    /api/assets/:id/content
DELETE /api/assets/:id
POST   /api/assets/:id/delete-file

GET    /api/settings
PATCH  /api/settings
```

### 11.2 Request schemas

#### ImageCreateRequest

```ts
{
  prompt: string;
  modelKey: string;
  resolution?: string;
  aspectRatio?: string;
  seed?: number;
  count?: number;
  advanced?: Record<string, unknown>;
}
```

#### ImageEditRequest

```ts
{
  sourceUploadId?: string;
  sourceAssetId?: string;
  prompt: string;
  modelKey: string;
  resolution?: string;
  seed?: number;
  advanced?: Record<string, unknown>;
}
```

#### VideoCreateRequest

```ts
{
  startUploadId?: string;
  startAssetId?: string;
  endUploadId?: string;
  endAssetId?: string;
  prompt: string;
  modelKey: string;
  durationSeconds?: number;
  resolution?: string;
  fps?: number;
  seed?: number;
  advanced?: Record<string, unknown>;
}
```

The `advanced` object may contain only fields explicitly allow-listed for the selected model adapter.

---

## 12. Job Execution and Concurrency

### 12.1 GPU queue

The app must assume the WanGP server has limited GPU capacity.

Default policy:

- one active generation job at a time;
- additional submissions remain queued in the app;
- app submits the next job only when the current WanGP job finishes or is cancelled.

Make concurrency configurable:

```env
MAX_ACTIVE_GENERATION_JOBS=1
MAX_QUEUED_JOBS=20
```

### 12.2 Restart recovery

On app startup:

1. Find jobs marked queued or running.
2. Start with an empty runtime job registry.
3. Optionally scan the WanGP output folder to repopulate a recent-output view.
4. Do not attempt durable queue recovery in Phase 1.

### 12.3 Polling

Use an adaptive polling interval:

- 1–2 seconds while actively progressing;
- 3–5 seconds during long steady phases;
- stop polling on terminal status.

Avoid polling directly from every browser session. Use one server-side poller per active job and distribute updates to clients.

---

## 13. Folder Structure

```text
app/
  layout.tsx
  page.tsx
  create-image/page.tsx
  edit-image/page.tsx
  create-video/page.tsx
  outputs/page.tsx
  jobs/page.tsx
  settings/page.tsx
  api/
    health/route.ts
    models/route.ts
    models/refresh/route.ts
    uploads/image/route.ts
    jobs/
      image-create/route.ts
      image-edit/route.ts
      video-create/route.ts
      [id]/route.ts
      [id]/cancel/route.ts
      [id]/retry/route.ts
      [id]/events/route.ts
    assets/
      route.ts
      [id]/route.ts
      [id]/content/route.ts
    settings/route.ts

components/
  app-shell/
  forms/
  media/
  jobs/
  outputs/
  ui/

lib/
  config.ts
  types.ts
  auth/
  runtime/
    job-registry.ts
    output-registry.ts
    model-cache.ts
  services/
    image-create-service.ts
    image-edit-service.ts
    video-create-service.ts
    job-runner.ts
    outputs-service.ts
  wan-gp/
    client.ts
    discovery.ts
    model-registry.ts
    schemas.ts
    settings-builder.ts
    adapters/
      qwen-image.ts
      qwen-image-edit.ts
      flux-klein-image.ts
      ltx2-video.ts
  uploads/
    validate-image.ts
    image-metadata.ts
    storage.ts
  security/
    path-policy.ts
    rate-limit.ts
    csrf.ts
  telemetry/
    index.ts

data/
  uploads/
  thumbnails/
  temp/

tests/
e2e/
scripts/
docs/
```

---

## 14. Configuration

Provide `.env.example`:

```env
NODE_ENV=development
APP_BASE_URL=https://<tailscale-hostname>
WANGP_MCP_URL=http://127.0.0.1:7866/mcp
WANGP_OUTPUT_ROOT=C:\WanGP\outputs
WANGP_DISCOVERY_CACHE_MINUTES=30

ENABLED_IMAGE_CREATE_MODELS=qwen-image,flux-klein-9b
ENABLED_IMAGE_EDIT_MODELS=qwen-image-edit,flux-klein-9b
ENABLED_VIDEO_MODELS=ltx-2
DEFAULT_IMAGE_CREATE_MODEL=qwen-image
DEFAULT_IMAGE_EDIT_MODEL=qwen-image-edit
DEFAULT_VIDEO_MODEL=ltx-2

MAX_ACTIVE_GENERATION_JOBS=1
MAX_QUEUED_JOBS=20
MAX_IMAGE_UPLOAD_MB=25

ENABLE_LOCAL_PASSCODE=false
LOCAL_PASSCODE_HASH=

LOG_LEVEL=info
```

Use one typed `lib/config.ts` module. No scattered `process.env` access.

---

## 15. Error Handling

User-facing errors must be understandable and must not expose stack traces or local paths.

Examples:

- WanGP is offline.
- MCP connection failed.
- Selected model is not installed.
- Model is only partially available.
- Unsupported resolution.
- Source image could not be decoded.
- End frame is not supported by this LTX-2 configuration.
- Job queue is full.
- WanGP generation failed.
- GPU memory was insufficient; try a lower resolution or shorter duration.
- Output file could not be found.

Store detailed technical errors in structured logs and the job's internal error JSON.

---

## 16. Observability

Emit structured events:

```text
app.started
wangp.mcp.connected
wangp.mcp.connection_failed
wangp.models.discovered
wangp.model.unavailable
job.created
job.submitted
job.progress
job.completed
job.failed
job.cancel_requested
job.cancelled
upload.accepted
upload.rejected
asset.created
asset.deleted
security.access_denied
```

Never log:

- passcodes;
- cookies;
- complete private prompts at info level;
- uploaded file contents;
- raw MCP secrets if authentication is later added.

Prompts may be stored in the local database because prompt history is a product feature, but allow the user to delete records.

---

## 17. Testing Requirements

### 17.1 Unit tests

- Model discovery matching and allow-list filtering.
- Qwen create settings builder.
- Qwen edit settings builder.
- Flux Klein settings builder.
- LTX-2 start/end-frame settings builder.
- Zod request validation.
- Canonical-path enforcement.
- Job state transitions.
- Restart reconciliation.

### 17.2 Integration tests

Use a fake MCP client that simulates:

- discovery;
- available/missing models;
- successful image generation;
- successful video generation;
- progress events;
- cancellation;
- failure;
- missing output file.

No automated test should require the GPU or a live WanGP server.

### 17.3 End-to-end tests

- Create an image from a prompt.
- Upload and edit an image.
- Upload a start image and generate a video.
- Add an optional end image when supported.
- Observe a queued job.
- Cancel an active job.
- Reuse a gallery image as a video start frame.
- Confirm an unavailable model is disabled.
- Confirm arbitrary filesystem paths cannot be accessed.

---

## 18. Implementation Phases

### Phase 1 — Foundation

- Scaffold Next.js TypeScript app.
- Configure Tailwind, Zod, Prisma, SQLite, Pino, Vitest, and Playwright.
- Create responsive app shell.
- Implement health endpoint.
- Implement typed configuration.
- Implement fake MCP adapter.

### Phase 2 — WanGP discovery

- Connect to WanGP streamable HTTP MCP.
- Discover models, schemas, defaults, capabilities, and availability.
- Implement model allow-list and mapping.
- Build Settings status page.

### Phase 3 — Image creation

- Create-image form.
- Qwen Image adapter.
- Flux.2 Klein 9B adapter.
- Job queue and progress.
- Gallery record and download.

### Phase 4 — Image editing

- Upload and gallery selection.
- Qwen Image Edit adapter.
- Flux Klein edit adapter where supported by the installed schema.
- Source/output comparison.

### Phase 5 — Video creation

- Start-image and optional end-image workflow.
- LTX-2 adapter.
- Duration and resolution schema controls.
- Video player with HTTP range support.

### Phase 6 — Private deployment

- Production build.
- Run as a Windows service, scheduled process, or container.
- Bind app and MCP to loopback.
- Configure Tailscale Serve.
- Add tailnet grants/ACL restrictions.
- Validate access from iPhone and iPad.
- Validate inability to access from the public internet or unapproved network paths.

### Phase 7 — Hardening

- Optional app passcode/passkey.
- Upload signature validation.
- Rate limiting.
- CSRF and security headers.
- Restart recovery.
- Storage cleanup policy.
- Backup documentation.

---

## 19. Acceptance Criteria

The initial release is complete when:

1. The app can be opened from an approved iPhone and iPad while connected to Tailscale.
2. The app cannot be reached through the public internet.
3. WanGP MCP is bound privately and cannot be called directly from the browser.
4. The app discovers local WanGP model IDs rather than assuming them.
5. Only configured Qwen, Flux.2 Klein 9B, and LTX-2 choices appear.
6. The user can create an image from a prompt.
7. The user can edit an uploaded or previously generated image with a prompt.
8. The user can generate an LTX-2 video from a start image.
9. The user can optionally supply an end image when the discovered model supports it.
10. The user can see progress and cancel an active generation.
11. Completed outputs appear in a local gallery.
12. Images and videos can be downloaded to the client device.
13. Model settings and defaults are schema-driven and configuration-controlled.
14. A WanGP outage produces a clear error without crashing the app.
15. Automated tests work without a live WanGP installation.

---

## 20. Future Enhancements

Keep the architecture ready for, but do not implement initially:

- additional WanGP image or video models;
- model presets;
- HEIC upload conversion;
- mask/inpainting editor;
- image outpainting;
- multiple reference images;
- video continuation;
- generated audio from LTX-2;
- prompt favorites and templates;
- before/after history chains;
- automatic thumbnail and contact-sheet generation;
- configurable postprocessing/upscaling;
- passkey authentication;
- separate WanGP GPU server and web-app server over Tailscale;
- export/import of generation settings;
- PWA installation on iPhone/iPad.

---

## 21. GitHub Copilot Build Prompt

Use the following prompt in Visual Studio Code with GitHub Copilot Agent mode after placing this specification in the repository as `docs/wan-media-studio-spec.md`.

```text
Build the WAN Media Studio application described in docs/wan-media-studio-spec.md.

Follow the specification closely. This is a small private media-generation utility, not a storyboard application and not a general MCP client.

Architecture requirements:
- TypeScript strict mode.
- Next.js App Router with React and Tailwind CSS.
- Zod validation at every trust boundary.
- Prisma with SQLite for local metadata.
- Server-side WanGP MCP client using @modelcontextprotocol/sdk.
- Never connect to WanGP MCP from browser code.
- Keep business logic in lib/services and WanGP-specific mapping in lib/wan-gp adapters.
- Implement a fake MCP client first so development and automated tests work without WanGP.
- Use configuration-driven model allow-lists and discover exact WanGP model IDs, schemas, defaults, capabilities, and availability from MCP.
- Initially expose only Qwen Image, Qwen Image Edit, Flux.2 Klein 9B, and one configured LTX-2 model.
- Bind the production web app to localhost and document Tailscale Serve deployment.
- Do not introduce FastAPI or another Python web backend.

Required workflows:
1. Create image from a user-supplied prompt.
2. Edit an uploaded or gallery image with a user-supplied prompt.
3. Generate an LTX-2 video from a required start image and optional end image.

Required surfaces:
- Create Image
- Edit Image
- Create Video
- Gallery
- Jobs
- Settings

Implementation procedure:
1. Read the full specification before changing files.
2. Produce a short implementation plan and checklist.
3. Scaffold the application and dependencies.
4. Implement typed config, Prisma schema, migrations, and seed data.
5. Implement the fake MCP client and tests.
6. Implement WanGP MCP discovery and model mapping.
7. Implement a single-concurrency durable job queue and progress polling.
8. Implement upload validation and safe local file serving with path-boundary checks and HTTP range support.
9. Implement the three workflows in order: image create, image edit, video create.
10. Add responsive mobile/tablet UI and accessible controls.
11. Add unit, integration, and Playwright E2E tests.
12. Add health checks, structured logging, security headers, and clear error handling.
13. Add README instructions for local development, WanGP MCP startup, production build, and Tailscale Serve.
14. Run typecheck, lint, unit tests, build, and E2E tests. Fix failures rather than skipping gates.
15. Finish with a concise report of what was built, what remains stubbed, and how to connect the real WanGP MCP server.

Do not hard-code unverified WanGP setting names in React components. Retrieve the model schema/defaults and isolate any model-specific settings in adapter classes. Where the live WanGP schema is unavailable during development, create clearly labeled fixtures and TODOs rather than guessing silently.
```

---

## 22. Implementation Notes Based on Current WanGP Capabilities

WanGP currently provides a reusable MCP server over stdio or Streamable HTTP. Its MCP surface includes model discovery, schema/default retrieval, generation submission, job polling, and cancellation. It keeps one warm WanGP session, which is appropriate for repeated requests from this application.

LTX-2 model metadata can advertise text, image, video, and audio inputs as well as start-frame, end-frame, and reference-image support. The application must inspect the installed model's actual metadata before rendering optional fields.

WanGP saves generated outputs to its normal output locations and returns generated file paths in job results. This application should store those returned paths as asset metadata while serving files only through controlled app routes.

WanGP's integration terms require products using its API to disclose WanGP usage in the user interface and documentation. Add a small footer and About/Settings notice such as:

> Powered by WanGP by DeepBeepMeep. This application provides a private simplified interface to a locally hosted WanGP installation.

