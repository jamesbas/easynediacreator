# Wan2GP MCP Server Changes

This document records the Wan2GP MCP contract observed and verified on August 24, 2026 against WanGP server version `1.10.1`. It focuses on differences that affected Easy Media Generator and separates confirmed protocol behavior from model-specific observations.

## Investigation method

The configured `/mcp` URL is a Streamable HTTP MCP endpoint, not a documentation web page. A normal browser-style request returns HTTP `406 Not Acceptable`. The endpoint was therefore inspected with `@modelcontextprotocol/sdk` by:

1. Connecting with `StreamableHTTPClientTransport`.
2. Reading the negotiated server version and `tools/list` response.
3. Inspecting each advertised input and output schema.
4. Calling read-only model, schema, availability, defaults, and LoRA tools.
5. Running the repository's read-only live integration suite against the server.

No generation, cancellation, upload, post-processing, file, or other mutating operation was used during the investigation.

## Summary of breaking changes

| Area | Previous client assumption | Current server contract | Impact |
| --- | --- | --- | --- |
| Model listing | `wangp_list_models` returned the complete matching catalog. | The tool returns at most 10 records and exposes `limit` and `offset`. | Models after the first page disappeared from discovery. |
| Model schema | `wangp_get_model_schema` contained detailed parameter declarations. | The compact schema is primarily metadata; detailed declarations are available from `wangp_get_model` or `wangp_model` with `view: "definition"`. | Solver choices and other model controls could disappear. |
| Qwen edit references | The source used `image_guide`; additional references used `image_refs` with `video_prompt_type: "IV"`. | Current Qwen definitions describe ordered `image_refs`, where `"KI"` means the first image is the main subject or landscape and later images are people or objects. | Source-plus-reference editing and face swap could fail or lose inputs. |
| Qwen reference budget | The source was separate from the reference list. | Under the ordered-reference contract, the source is the first reference and consumes one slot. | The UI must reduce the remaining reference allowance when a source is present. |
| LoRA discovery | Native model-aligned LoRA discovery was absent on the previously documented server. | `wangp_list_loras` is available and recursively returns identifiers relative to the model's LoRA directory. | Rejecting every identifier containing a path separator can hide valid nested LoRAs. |
| LTX duration | Some older defaults included `duration_seconds`. | The selected current LTX model uses aligned `video_length` frames and does not publish `duration_seconds`. | Tests or clients requiring `duration_seconds` fail despite a valid frame count. |
| Video model scope | The application treated Create Video as one configured LTX-2 mapping. | The MCP catalog contains independently available video models from multiple families, each with its own exact `model_type`, schema, defaults, and capabilities. | A family-specific rule hides usable non-LTX models and other installed checkpoints. |
| Video inputs | The application always required a start image and assumed an optional end image. | Video metadata independently advertises `text_to_video`, `image_to_video`, and `media_inputs.image.start`/`end`. | Text-to-video must work without an image, and image controls must follow the selected model's capabilities. |
| Video settings | The application required LTX-oriented fields such as `negative_prompt` and `input_video_strength`. | Setting availability differs by model; current MiniMax defaults omit both fields while still exposing valid video generation controls. | Requiring or submitting unsupported optional settings breaks otherwise usable models. |
| Image mode | Shared image creation required `image_mode`. | Current Flux Klein and current Qwen contracts can omit `image_mode` while exposing prompt/reference behavior through other fields and capabilities. | Requiring `image_mode` prevents valid text-to-image generation before submission. |
| Image guidance | Image workflows always displayed and submitted a fallback CFG value. | Current distilled Flux Klein omits CFG; Flux Klein Base publishes it. Krea 2 Turbo Edit reports `guidance_max_phases: 0` and omits `guidance_scale`. | A fallback CFG control can turn an intentionally disabled setting into a schema error. |
| Multiline prompts | A user-entered prompt could contain paragraphs and line feeds. | With `multi_prompts_gen_type: "PG"`, Wan2GP parses prompt lines as separate generation requests, while this app submits one generation task. | A multiline prompt fails unless line breaks are joined or the mode is changed to `FG`. |
| Mask tuning | The Qwen face-swap preset required `masking_strength` and `mask_expand`. | Current Qwen edit checkpoints omit `mask_expand`, and `qwen_image_edit_20B` also omits `masking_strength`. | Face swap fails before submission even though it sends no mask. |

## Model discovery

### Bounded `wangp_list_models`

The current tool description states that `wangp_list_models` returns at most 10 compact model records. Its input schema includes:

- model filters such as `family`, `base_model_type`, `finetune`, `model_type`, `main_output`, `inputs`, `name`, and `query`;
- `limit`, defaulting to 10;
- `offset`, defaulting to 0;
- `include_availability`, defaulting to `false`.

The old client made one call for image models and one for video models. Because the catalog is ordered and larger than 10 records, relevant Qwen, Krea, Flux, or LTX models could be outside the first page and appear missing.

Easy Media Generator now checks the advertised input schema. When both `limit` and `offset` are supported, it requests pages of 10 until it receives a short page or a page containing no new model IDs. Older servers that do not advertise pagination retain the original single-call behavior.

### Current model-list result envelope

`wangp_list_models` currently returns:

- one text content block per model; and
- `structuredContent` shaped as `{ "result": [...] }`.

The client prefers structured content and unwraps the single `result` property. It still supports older JSON text results.

### Additional discovery tools

The current server advertises several model tools beyond the original client requirements:

- `wangp_models`
- `wangp_model`
- `wangp_search_models`
- `wangp_list_model_defs`
- `wangp_get_model`
- `wangp_list_model_availability`
- `wangp_model_settings`

Easy Media Generator continues to use its allow-listed image workflows rather than exposing arbitrary MCP execution. For video, it exposes each MCP model not explicitly reported missing as an independent option keyed by its exact `model_type`.

## Model schema split

### Compact schema

`wangp_get_model_schema(model_type)` now returns a compact capability and usage summary. For the selected current models, the response primarily contained `metadata`, including:

- model identity and family;
- outputs and accepted inputs;
- media-input capabilities;
- capability flags;
- frame and FPS metadata where applicable.

Detailed setting declarations that the app previously expected under the compact schema may not be present.

### Full definition

The current server exposes the complete model definition through:

```json
{
  "name": "wangp_get_model",
  "arguments": {
    "model_type": "<model_type>"
  }
}
```

It also advertises `wangp_model(model_type, view)`, where `view` can be `schema`, `definition`, or `defaults`.

The full definition contains useful declarations such as:

- `metadata.setting_values`;
- `sample_solvers`;
- resolution declarations or categories;
- numeric slider descriptions;
- guidance-phase limits;
- frame and FPS limits.

The full definition can also be large and contain descriptions, URLs, and implementation details that are unnecessary for the application UI. Easy Media Generator therefore merges only a compact projection of consumed control fields into its normalized schema. If the optional definition call fails, the compact schema remains usable.

## Video model contracts

### Multiple locally available model families

A later read-only inventory of the same server found nine locally available video models: seven LTX-2 variants and two MiniMax H3 variants. This count and inventory are installation-specific and can change as models are installed, removed, or updated. The contract finding is that Wan2GP reports each checkpoint as an independent model record with its own:

- exact `model_type`;
- name and family;
- availability;
- accepted inputs;
- capability flags;
- media-input details;
- defaults and full definition.

The MCP server does not imply that clients should collapse those records into one family-level video choice. Easy Media Generator now preserves the exact `model_type` as the stable video option key and no longer restricts video discovery with an application `ENABLED_VIDEO_MODELS` allow-list.

### Capability-driven text and image inputs

All nine video models available during this inspection advertised `text_to_video: true`. Most also advertised start- and end-image support, but those image capabilities are independent and must not be inferred only from the broad `inputs` array.

Clients should inspect both:

```json
{
  "capabilities": {
    "text_to_video": true,
    "image_to_video": true
  },
  "media_inputs": {
    "image": {
      "start": true,
      "end": true
    }
  }
}
```

Observed implications:

- omit the start image when `text_to_video` is supported;
- require a start image only when text-to-video is unavailable;
- accept a supplied start image only when `media_inputs.image.start` is true;
- expose an end image only when `media_inputs.image.end` is true;
- do not assume every model that lists `image` as an input uses it as a start frame.

One observed LTX reference-oriented variant reported reference-image support and an end image while reporting no start-image support, demonstrating why these flags must be evaluated independently.

### Model-specific optional settings

The current LTX defaults expose fields such as `negative_prompt` and `input_video_strength`. The available MiniMax H3 defaults omit those fields while exposing other normal video settings, including `video_length`, `force_fps`, `num_inference_steps`, and `sample_solver`.

The generic video client therefore treats these settings as schema-driven:

- `negative_prompt` is submitted only when advertised;
- source strength is shown and submitted only when a supported field such as `input_video_strength`, `source_strength`, or `denoising_strength` is present;
- start/end fields are emitted only for supported media inputs;
- frame-based models receive a calculated frame count;
- a model that exposes only `duration_seconds` receives seconds directly;
- solver, scheduler, guidance, FPS, resolution, and LoRA controls remain conditional on the selected model's contract.

These observations are model-specific examples of a broader MCP requirement: a client must not use one model family's defaults as the required schema for every video model.

## Qwen image-edit references

### Current ordered-reference contract

The current Qwen Image Edit definition publishes reference choices with these meanings:

- `"I"`: all conditional images are people or objects;
- `"KI"`: the first conditional image is the main subject or landscape, followed by people or objects.

For a source image plus additional references, the current payload is therefore:

```json
{
  "image_refs": [
    "<source-image>",
    "<additional-reference-1>",
    "<additional-reference-2>"
  ],
  "video_prompt_type": "KI"
}
```

Despite producing still images, Wan2GP activates these references through `video_prompt_type`, not `image_prompt_type`.

### Legacy compatibility

Older schemas may explicitly advertise `image_guide`. For those servers, Easy Media Generator retains the previous payload:

```json
{
  "image_mode": 1,
  "image_guide": "<source-image>",
  "image_refs": ["<additional-reference>"],
  "image_prompt_type": "",
  "video_prompt_type": "IV"
}
```

The adapter chooses this path only when `image_guide` is explicitly present in defaults or setting declarations. A generic control-image capability is not sufficient evidence because the current Qwen model can advertise control support without exposing the legacy field.

Current Qwen defaults also omit `image_mode`, `image_guide`, `image_refs_relative_size`, and `remove_background_images_ref`. The latter two are now best-effort optional settings rather than required fields.

## Optional image settings

### Flux Klein `image_mode`

The locally available `flux2_klein_9b` contract does not expose `image_mode` in defaults, setting declarations, or its full definition. It does expose the fields needed by the current image workflow, including prompt fields, `image_prompt_type`, `video_prompt_type`, resolution, inference steps, memory profile, and LoRA settings. Its metadata separately advertises text-to-image, reference-image, control-image, and mask capabilities.

The absence of `image_mode` is therefore not evidence that Flux image creation is unsupported. Clients should clear or set `image_mode` only when it is advertised, rather than treating it as a universal image-generation discriminator.

This also applies to current Qwen paths that omit `image_mode`. Legacy schemas that explicitly publish `image_mode` continue to receive it.

### Distilled models with no CFG field

The same live inspection found different guidance contracts among related checkpoints:

- `flux2_klein_9b` omits `guidance_scale`, `cfg_scale`, and guidance phases;
- `flux2_klein_base_9b` publishes `guidance_scale` and `guidance_phases`;
- `krea2_turbo_edit` publishes `guidance_max_phases: 0` and omits both `guidance_scale` and `cfg_scale`.

For Krea Turbo, `guidance_max_phases: 0` means CFG is disabled; it does not mean the client must serialize `guidance_scale: 0`. A UI fallback of zero still causes a schema error when the field itself is absent.

Easy Media Generator now derives CFG visibility from actual setting presence. It omits `guidanceScale` from requests and generated settings when the selected model does not expose a CFG field. RAW/Base checkpoints that publish guidance retain their discovered control and value.

## Multiline prompt handling

Wan2GP can interpret line breaks as generation boundaries. In the observed failure, the inherited setting `multi_prompts_gen_type: "PG"` parsed a four-paragraph prompt into four generation requests, but Easy Media Generator had submitted one task. Wan2GP rejected that mismatch and suggested separate tasks or `FG` when the lines belong to one prompt.

Easy Media Generator treats the prompt textarea as one prompt regardless of visual paragraphs. Before validation and again at the outbound queue boundary, it replaces CRLF/LF sequences and surrounding indentation with one space. For example:

```text
First paragraph.

Second paragraph.
```

is sent as:

```text
First paragraph. Second paragraph.
```

The queue-level normalization also covers retries created before the request-schema normalization and direct internal service calls. Negative prompts are left unchanged because the observed Wan2GP task splitting applies to the primary prompt.

## Face-swap mask settings

The Qwen face-swap preset previously required `masking_strength` and `mask_expand`. The current contracts show:

- `qwen_image_edit_plus2_20B` publishes `masking_strength` but not `mask_expand`;
- `qwen_image_edit_20B` publishes neither.

Both checkpoints still publish `sample_solver`, `guidance_scale`, `guidance_phases`, `model_mode`, and the LoRA settings the preset depends on. Because the preset supplies a reference face rather than an inpainting mask, these mask-tuning values are refinements rather than requirements. Easy Media Generator now sends them only when the selected checkpoint exposes them.

## LoRA discovery

### Native tool now available

The current server advertises:

```json
{
  "name": "wangp_list_loras",
  "arguments": {
    "model_type": "<model_type>",
    "name": "<optional case-insensitive glob>"
  }
}
```

The result includes fields equivalent to:

```json
{
  "model_type": "<model_type>",
  "supported": true,
  "loras": [],
  "count": 0
}
```

The tool description states that discovery is recursive. Returned identifiers are relative to the model's effective LoRA directory and can be passed directly in `activated_loras` with aligned `loras_multipliers`.

### Safe relative identifiers

The client previously rejected all `/` and `\` characters because the local fallback returned immediate filenames only. It now accepts nested relative identifiers while rejecting:

- absolute Unix or Windows paths;
- drive-qualified paths;
- empty path segments;
- `.` and `..` segments;
- NUL characters.

The filesystem fallback configured through `WANGP_LORA_ROOT` remains non-recursive and exposes immediate `.safetensors` and `.sft` filenames only.

## Defaults and duration

The current `wangp_get_default_settings` tool returns pristine model defaults generated by Wan2GP and the model handler. Its description explicitly excludes user-saved UI defaults.

For the selected current LTX model:

- `video_length` is present;
- `force_fps` is present;
- `duration_seconds` is absent.

Easy Media Generator already maps requested video duration to Wan2GP's aligned frame rule:

$$
\operatorname{video\_length} = 8\left\lceil\frac{\operatorname{seconds}\cdot\operatorname{fps}}{8}\right\rceil + 1
$$

The client now treats `duration_seconds` as optional and does not require it when `video_length` is valid. The later video inventory also showed `video_length` and `force_fps` on the available MiniMax H3 models, so frame-based duration is not unique to LTX. The generic adapter still supports seconds-only models for compatibility with other schemas.

## Generation and jobs

The core generation and job tools remain available:

- `wangp_generate`
- `wangp_get_job`
- `wangp_cancel_job`

`wangp_generate` still accepts `source` and optional `wait`, `timeout_s`, and `event_limit` fields. `wangp_get_job` and `wangp_cancel_job` still require `job_id` and now advertise optional `event_limit` fields. No incompatible change was found in the application paths currently used for generation, polling, or cancellation.

## Other currently advertised tools

The server also advertises gallery, file, template, post-processing, and utility tools:

- `wangp_list_gallery`
- `wangp_get_media_settings`
- `wangp_list_files`
- `wangp_query_file`
- `wangp_create_gallery_upload`
- `wangp_create_gallery_download`
- `wangp_list_deepy_templates`
- `wangp_get_deepy_template_settings`
- `wangp_postprocess`
- `wangp_toolbox`

These tools were documented during contract inspection but are not used by Easy Media Generator's current allow-listed client surface.

## Implemented compatibility changes

The fixes are implemented in:

- `lib/wan-gp/live-client.ts`: model pagination, tool-schema inspection, full-definition fallback, and allow-list updates;
- `lib/wan-gp/schemas.ts`: structured-result normalization, compact model-definition projection, and safe relative LoRA identifiers;
- `lib/wan-gp/adapters/qwen-image-edit.ts`: current ordered references plus legacy `image_guide` compatibility;
- `lib/wan-gp/adapters/video.ts`: schema-driven video payloads for text-to-video and optional start/end images across model families;
- `lib/wan-gp/settings-builder.ts`: separation of explicitly advertised settings from capability-inferred attachment keys and optional shared `image_mode` handling;
- `lib/wan-gp/generation-controls.ts`: CFG controls only when the selected model publishes a guidance setting;
- `lib/wan-gp/adapters/krea2-image.ts` and `lib/wan-gp/adapters/krea2-image-edit.ts`: omit CFG when Krea Turbo disables guidance phases;
- `lib/wan-gp/prompt.ts`, `lib/requests.ts`, and `lib/services/job-runner.ts`: normalize user prompt line breaks at request and outbound retry boundaries;
- `lib/wan-gp/discovery.ts`: schema-dependent source-image reference-slot accounting and independent discovery of every locally usable video model;
- `lib/services/video-create-service.ts`: capability validation and exact video-model routing;
- image and video form components: submit only controls exposed by the selected model contract.

Regression coverage was added for:

- bounded model pagination;
- legacy unpaginated model listing;
- full-definition control merging and failure fallback;
- current and legacy Qwen reference payloads;
- nested safe and unsafe LoRA identifiers;
- independent LTX and MiniMax fixture discovery;
- text-to-video submission without a start image;
- rejection of image inputs unsupported by the selected model;
- current Flux Klein creation without `image_mode` or CFG;
- current Krea Turbo Edit without CFG serialization;
- multiline prompts normalized to one outbound generation prompt;
- face swap built against schemas without mask-tuning settings;
- live Qwen, Flux, Krea, LTX, and non-LTX video settings against the current server.

## Validation results

The completed changes were validated with:

- read-only live Wan2GP MCP suite: 8 passed;
- normal unit and integration suite: 120 passed, 8 skipped;
- Playwright desktop and mobile suite: 20 passed;
- TypeScript typecheck: passed;
- ESLint: passed;
- Next.js production build: passed.

The live validation confirmed that configured image and video models are discoverable beyond the old first page, current LoRA catalogs are readable, LTX settings use frame-based duration, Qwen source-plus-reference settings use the current ordered-reference contract, a non-LTX video model can be independently adapted for text-to-video, Flux Klein can be built without `image_mode` or CFG, and Krea Turbo Edit can be built without a CFG field.
