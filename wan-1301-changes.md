# Wan2GP 13.01 MCP Server Changes

This document records the WanGP MCP contract observed and verified on September 14, 2026 against reported server version `1.30.0` (Wan2GP 13.01). It explains why Easy Media Generator reported **Connected** with **0 workflow mappings**, and separates confirmed protocol behavior from installation-specific observations.

## Investigation method

The endpoint was inspected read-only with `@modelcontextprotocol/sdk`:

1. Connected with `StreamableHTTPClientTransport` and read the negotiated server version.
2. Listed tools and inspected every advertised input schema.
3. Used the new progressive discovery pattern (omit `action` for an action list, pass `arguments: null` for a contract).
4. Executed only read-only actions: model search, capabilities, definition, defaults, LoRA listing, and IO root discovery.
5. Cross-checked observations against the official [WanGP API documentation](https://github.com/deepbeepmeep/Wan2GP/blob/main/docs/API.md).

No generation, cancellation, upload, post-processing, or other mutating operation was executed.

## Root cause

WanGP now serves **MCP API v2 by default**. V2 replaces the previous granular tools with nine consolidated toolboxes that use deferred action contracts. Every discovery tool Easy Media Generator called was removed, so `ping` still succeeded while model discovery returned nothing.

Removed tools that the app depended on:

- `wangp_list_models`
- `wangp_get_model_metadata`
- `wangp_get_model_schema`
- `wangp_get_default_settings`
- `wangp_get_model_availability`
- `wangp_list_loras`
- `wangp_get_job`
- `wangp_cancel_job`

## Current tool surface

The server now advertises exactly nine tools:

| Tool | Purpose |
| --- | --- |
| `wangp_models` | Model search and speciality discovery |
| `wangp_model` | One model's capabilities, definition, defaults, saved settings, LoRAs |
| `wangp_deepy_templates` | Deepy recipes and merged template settings |
| `wangp_list_gallery` | Gallery inventory and live selections |
| `wangp_io` | Authorized filesystem navigation, search, and text editing |
| `wangp_toolbox` | Media inspection and transformation utilities |
| `wangp_generate` | Generation |
| `wangp_postprocess` | Post-processing treatments |
| `wangp_session` | Job tracking, cancellation, notifications, Gallery transfers |

### Progressive discovery

Every toolbox follows the same three-step contract:

- omit `action` and `arguments` to list available actions;
- pass `action` with `arguments: null` to read that action's parameter contract;
- pass an `arguments` object to execute. `{}` executes with defaults.

Supplying `arguments` without an `action` is rejected. `wangp_model` additionally requires `model_type`, and `wangp_postprocess` requires `media`. V2 also rejects unknown top-level tool parameters instead of ignoring them.

## Capability mapping

| Historical tool | Current call |
| --- | --- |
| `wangp_list_models`, `wangp_search_models` | `wangp_models` action `search` |
| `wangp_get_model_schema` | `wangp_model` action `capabilities` |
| `wangp_get_model` (definition) | `wangp_model` action `definition` |
| `wangp_get_default_settings` | `wangp_model` action `defaults` |
| `wangp_model_settings` | `wangp_model` action `saved_settings` |
| `wangp_list_loras` | `wangp_model` action `loras` |
| `wangp_generate` | `wangp_generate` action `generate` |
| `wangp_get_job` | `wangp_session` action `get_job` |
| `wangp_cancel_job` | `wangp_session` action `cancel_job` |
| `wangp_get_model_availability` | **No replacement** |

## Breaking changes in detail

### 1. Model records changed shape

`wangp_models` action `search` returns records whose `capabilities` is now a **flat array of strings** rather than an object of booleans, and whose `media_inputs` uses **arrays of role names** rather than nested booleans:

```json
{
  "model_type": "krea2_raw_edit",
  "capabilities": ["text_to_image", "image_to_image", "reference_images", "lora"],
  "media_inputs": { "image": ["reference", "multiple_references", "background", "mask"] }
}
```

The previous nested form was:

```json
{
  "capabilities": { "text_to_image": true, "reference_images": true },
  "media_inputs": { "image": { "reference": true, "mask": true } }
}
```

Clients that read `media_inputs.image.start === true` silently lose every media role.

Search records also add `accelerated` (`native`, `profiles`, or `none`) and optional `specialities`.

### 2. Cursor pagination replaced offset pagination

V2 collections use `limit` (default 20, maximum 100) with an opaque `cursor`. Results report `count`, `has_more`, and `next_cursor`, plus a ready-to-send `next_call` recipe. The previous `offset` parameter is gone. Cursors expire after ten minutes and are evicted after newer searches.

This applies to model search and to the LoRA listing, so a single call returns only a partial catalog.

### 3. Availability is no longer exposed

There is no availability action, and search is **not** filtered by local availability. On the inspected installation, `main_output: "video"` returned **133 models**, including models that are not downloaded.

Because Easy Media Generator disabled anything not reported `available`, this alone kept every workflow mapping empty.

### 4. Asynchronous generation is disabled by default

The `generate` contract now declares:

```json
{ "wait": { "type": "boolean", "default": true, "const": true } }
```

with the description "Asynchronous execution is disabled; wait=false is rejected before submission."

V2 defaults to `wait=true` and rejects `wait=false` unless WanGP is launched with `--mcp-async`. The app's submit-then-poll flow therefore fails at submission. `timeout_s` bounds the wait without cancelling the job, and `event_limit` controls returned events.

### 5. Model capabilities and definition were split

`wangp_model` action `capabilities` returns a compact `{ metadata, input_guidance, prompt_guidance }` record **without** `setting_values`. The full declarations the app uses for generation controls — `setting_values`, `sample_solvers`, `guidance_max_phases`, `resolutions_categories`, frame limits — are only in action `definition`.

## Availability without an MCP tool

Because MCP no longer reports availability, availability must be derived locally from the WanGP installation.

A model definition lists its checkpoints in `URLs`. Two forms occur:

- a real download URL, whose basename is the checkpoint filename;
- a **model-type reference** to another model whose `URLs` must be resolved instead.

For example `krea2_turbo_edit` declares `URLs: ["krea2_turbo"]`, and `krea2_turbo` declares the actual `Krea2Turbo_*.safetensors` files.

A model counts as installed when at least one resolved checkpoint basename exists under the WanGP `ckpts` folder. Any quantization variant satisfies this, matching WanGP's own behavior. Verified against the inspected installation:

| Model | Result |
| --- | --- |
| `qwen_image_edit_plus2_20B` | installed |
| `flux2_klein_9b` | installed |
| `krea2_turbo_edit` | installed through its `krea2_turbo` reference |
| `ltx2_22B_distilled_1_1` | installed |
| `minimax_h3_fl2va_pruned` | installed |
| `alpha`, `bernini` | not installed |

`wangp_io` cannot substitute for this: its authorized roots exposed only the `outputs` folder.

## Unchanged behavior

- Streamable HTTP transport and the `/mcp` endpoint are unchanged.
- Generation still consumes ordinary WanGP settings objects containing `model_type`.
- `activated_loras` with space-separated `loras_multipliers` is unchanged.
- LoRA identifiers remain subfolder-relative and usable directly.
- Job state, cancellation, and results still exist, now under `wangp_session`.

## Compatibility options

WanGP still supports the previous contract with `--mcp-api-version 1`:

```bash
python wgp.py --mcp --mcp-api-version 1
```

Asynchronous generation, which restores live progress and cancellation, is enabled with:

```bash
python wgp.py --mcp --mcp-async
```

Easy Media Generator does not require either flag. It detects the served contract and adapts, using async submission when the server allows it and synchronous generation when it does not.

---

> Applies to: Easy Media Generator's WanGP MCP client. Observations were taken from one installation; model inventories and installed checkpoints vary per machine.
