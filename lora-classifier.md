# LoRA Classifier Investigation and Build Specification

## Status

- **Document date:** July 15, 2026
- **Implementation status:** Implemented July 15, 2026
- **Delivered scope:** Profile-first classification, evidence/confidence, private overrides, grouped UI, server-owned recipe application, cache invalidation, and native MCP forward compatibility
- **Primary goal:** Separate inference-acceleration LoRAs from ordinary content LoRAs in Easy Media Generator without misclassifying ambiguous files

### Implementation Result

The implemented feature follows the profile-first recommendation in this document:

- high-confidence WanGP profile matches appear as complete **Acceleration presets**;
- content, unclassified, and uncertain candidates remain under **Other LoRAs**;
- medium/low-confidence filename or metadata candidates are marked as possible accelerators but are not promoted automatically;
- preset IDs are resolved against the current server-owned catalog;
- controlled CFG, steps, solver, phases, thresholds, LoRA order, and multipliers are applied server-side;
- acceleration presets may be combined with other validated character, style, motion, or content LoRAs; preset-required LoRAs remain protected from duplicate manual selection;
- profile, metadata, override, and LoRA filesystem changes invalidate discovery automatically;
- a future `wangp_list_lora_presets` MCP tool is preferred automatically when available.

Full semantic classification into character, style, motion, pose, and camera categories remains intentionally out of scope.

## 1. Problem Statement

Easy Media Generator can discover many LoRAs compatible with a selected WanGP image or video model. Most installed LoRAs affect generated content, such as a character, style, pose, camera treatment, motion, or concept. A smaller set changes the inference process itself and is used to reduce step count or select a distilled generation path.

Examples of inference acceleration families include:

- Lightning
- Distilled or DistilledLoRA
- LightX2V
- CausVid
- FastWan
- Turbo
- Some FusionX or FusioniX recipes

A single undifferentiated LoRA list makes these accelerators difficult to find. It also treats them as ordinary optional LoRAs even though many require coordinated settings such as CFG, step count, solver, multiplier, guidance phases, or paired high-noise and low-noise files.

The proposed feature should distinguish **acceleration recipes** from **other LoRAs**. “Acceleration” is a more accurate UI label than “distilled,” because not every inference accelerator uses the word `distilled`.

## 2. User Goal

For the currently selected WanGP model and workflow, present LoRAs in two primary classes:

1. **Acceleration presets**
   - High-confidence Lightning, distilled, LightX2V, CausVid, FastWan, Turbo, and equivalent inference recipes.
   - Apply the complete WanGP-compatible recipe rather than only selecting one filename.

2. **Other LoRAs**
   - Character, style, motion, pose, camera, clothing, concept, enhancement, and unclassified LoRAs.

The UI must not state that an unrecognized LoRA is definitely a character or motion LoRA. An item without reliable evidence is only **unclassified**.

## 3. Investigation Findings

### 3.1 Current MCP capability

The inspected WanGP MCP server, version `1.10.1`, does not expose a LoRA inventory or LoRA metadata tool.

Relevant existing MCP tools cover:

- model lists and model definitions;
- model metadata and schemas;
- model availability;
- default settings;
- generation and job polling.

There is no current tool equivalent to:

- `wangp_list_loras(model_type)`;
- `wangp_get_lora_metadata(model_type, filename)`;
- `wangp_list_lora_presets(model_type)`.

Therefore, MCP alone cannot authoritatively classify installed LoRAs.

Easy Media Generator currently falls back to local filesystem discovery through `WANGP_LORA_ROOT`. That discovery returns safe filenames only and does not classify their purpose.

### 3.2 WanGP profile files

WanGP stores generation profiles under its local `profiles` directory. These are the strongest available local classification source because a profile may provide the complete inference recipe:

- one or more values for `activated_loras`;
- `loras_multipliers`;
- `num_inference_steps`;
- `guidance_scale` and secondary guidance values;
- `sample_solver`;
- guidance phases and switch thresholds;
- other accelerator-specific settings.

Examples observed during the investigation:

| Profile | Accelerator LoRA | Steps | CFG | Additional behavior |
| --- | --- | ---: | ---: | --- |
| Lightning Qwen 2512 - 4 Steps | `Qwen-Image-2512-Lightning-4steps-V1.0-bf16.safetensors` | 4 | 1 | Multiplier 1 |
| Lightning Qwen Edit 2511 - 4 Steps | `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | 4 | 1 | Multiplier 1 |
| Single-Stage Dev DistilledLoRA | `ltx-2.3-22b-distilled-lora-384-1.1.safetensors` | 8 | 1 | Distilled solver, multiplier 0.5 |
| Wan 2.2 Lightning T2V | Paired high-noise and low-noise LoRAs | 4 | 1 | Phase-specific multipliers |
| FastWan | `Wan2_2_5B_FastWanFullAttn_lora_rank_128_bf16.safetensors` | 3 or 6 | 1 | Model-specific recipe |

The local profile inventory referenced 63 profile-to-LoRA entries and 42 unique LoRA basenames. Only 16 of those basenames matched currently installed files exactly. Profiles may reference downloadable URLs or files that are not installed.

A profile reference alone does not prove that every referenced LoRA is an accelerator. Some profiles combine accelerators with detail, reward, enhancement, or content LoRAs. Classification must consider the profile name and settings, not only membership in `activated_loras`.

### 3.3 LoRA Manager metadata

WanGP’s LoRA Manager stores local JSON records under `loras_metadata`.

The inspected installation contained 277 records. Most records are Civitai model-version responses with fields such as:

- `name`;
- `baseModel` and `baseModelType`;
- `description`;
- `trainedWords`;
- nested model title and type;
- downloaded filenames and hashes;
- image examples and prompts.

There is no stable semantic field such as:

- `classification: accelerator`;
- `distilled: true`;
- `category: lightning`;
- reliable purpose-oriented `tags`.

Most records identify only that an asset is a LoRA. Accelerator identity may appear indirectly in a filename, title, description, or base-model name.

This metadata is useful supporting evidence but is not authoritative.

### 3.4 Safetensor headers

Safetensor header metadata is not a reliable classifier.

Observed examples:

- A known Qwen Lightning LoRA had no `__metadata__` object.
- A Flux content LoRA included training software, training step, output name, and base-model information, but no purpose classification.

Tensor key layouts may help identify architecture compatibility, but they do not reliably distinguish an accelerator from a content LoRA.

Reading full tensor data is unnecessary and must not be part of classification. If headers are inspected, read only the bounded safetensor JSON header.

### 3.5 Filename and text heuristics

Strong accelerator-related tokens include:

- `lightning`;
- `distill`, `distilled`, or `distillation`;
- `lightx2v` and common spelling variants;
- `causvid`;
- `fastwan`;
- `fusionx` or `fusionix` when tied to known WanGP profiles;
- `accelerator`;
- `turbo` when evidence indicates an accelerator rather than a Turbo base model.

Filename matching alone produces false positives. For example, a content LoRA trained for a Turbo base model can include `Turbo` without being an inference accelerator.

In the inspected installation, 15 installed filenames strongly resembled accelerators. Two accelerator-looking installed files were not referenced by available profiles. This confirms that profile parsing should be the primary source and heuristics should be a fallback.

## 4. Classification Model

### 4.1 Terminology

Use these internal categories:

```ts
type LoraPurpose =
  | "accelerator"
  | "content"
  | "unclassified";
```

For UI grouping, merge `content` and `unclassified` into **Other LoRAs** unless a later feature introduces reviewed content subcategories.

Do not automatically classify an unmatched file as `content`. Absence of accelerator evidence is not proof of content purpose.

### 4.2 Confidence levels

```ts
type ClassificationConfidence =
  | "authoritative"
  | "high"
  | "medium"
  | "low";
```

Suggested interpretation:

| Confidence | Evidence |
| --- | --- |
| Authoritative | A future WanGP MCP response explicitly classifies the LoRA or supplies a typed accelerator recipe |
| High | Exact basename appears in a recognized WanGP acceleration profile whose settings and name indicate accelerated inference |
| Medium | Strong filename plus LoRA Manager title/description evidence, compatible base model, and expected low-step/CFG behavior |
| Low | Filename-only heuristic or incomplete metadata |

Only `authoritative` and `high` confidence items should be promoted automatically to **Acceleration presets** by default.

Medium-confidence items may appear under **Possible accelerators** or remain under **Other LoRAs** with a badge. Low-confidence items should remain unclassified.

### 4.3 Evidence record

Every classification must remain explainable:

```ts
type LoraClassificationEvidence = {
  source:
    | "mcp"
    | "wan-gp-profile"
    | "lora-manager-metadata"
    | "safetensor-header"
    | "filename"
    | "user-override";
  detail: string;
};
```

Example:

```json
{
  "purpose": "accelerator",
  "confidence": "high",
  "evidence": [
    {
      "source": "wan-gp-profile",
      "detail": "Exact basename in 'Lightning Qwen 2512 - 4 Steps'"
    }
  ]
}
```

## 5. Acceleration Presets, Not Individual Toggles

An accelerator should generally be represented as a complete preset:

```ts
type LoraAccelerationPreset = {
  id: string;
  label: string;
  modelTypes: string[];
  workflowTypes: Array<"image-create" | "image-edit" | "video-create">;
  loras: Array<{
    filename: string;
    multiplier: string | number;
    required: boolean;
    role?: "high-noise" | "low-noise" | "single";
  }>;
  settings: {
    numInferenceSteps?: number;
    guidanceScale?: number;
    sampleSolver?: string;
    guidancePhases?: number;
    switchThreshold?: number;
    additional?: Record<string, unknown>;
  };
  source: "mcp" | "wan-gp-profile" | "user-override";
  confidence: ClassificationConfidence;
};
```

This avoids dangerous partial selection. For example, a Wan 2.2 accelerator can require both high-noise and low-noise LoRAs with aligned phase multipliers. Presenting each file as an independent checkbox would allow an invalid recipe.

When an acceleration preset is selected, the UI should update and lock settings that the recipe controls. The server adapter must enforce the same values independently.

## 6. Model Compatibility Rules

Classification and compatibility are separate concerns.

A LoRA may be an accelerator but incompatible with the selected model or workflow. Compatibility evaluation should consider:

1. Exact `model_type` from a future authoritative MCP response.
2. WanGP profile directory and model fields.
3. LoRA Manager `baseModel` and `baseModelType`.
4. The model-aligned LoRA directory.
5. Known architecture aliases maintained in one tested mapping module.

Examples:

- A Qwen Image Edit Lightning LoRA must not appear as compatible with Qwen Image generation unless the profile explicitly supports it.
- An LTX Dev distilled LoRA must not automatically appear for an already-distilled LTX model.
- Wan high-noise and low-noise accelerator files must remain paired and phase-aware.
- A Flux content LoRA trained for a Turbo base model must not be classified as an accelerator merely because its metadata contains `Turbo`.

Unknown compatibility must result in disabled or unclassified presentation, not optimistic selection.

## 7. Proposed Discovery Pipeline

Use sources in this order:

1. **Native WanGP MCP classification**, when available.
2. **WanGP profile parser** for complete local recipes.
3. **User-maintained overrides** for known local files and corrections.
4. **LoRA Manager metadata** as supporting evidence.
5. **Conservative filename heuristic** as a last resort.
6. **Safetensor header metadata** only when already available and bounded; never load tensors for classification.

### 7.1 Profile parser

The parser should:

1. Read JSON files only from configured, trusted WanGP profile roots.
2. Reject files outside those roots after path resolution.
3. Validate JSON with Zod.
4. Normalize `activated_loras` entries to URL-decoded basenames.
5. Preserve ordered multipliers and phase syntax.
6. Identify candidate acceleration profiles using both:
   - recognized profile-name/solver markers; and
   - inference behavior such as low steps, CFG 1, distilled solver, or CausVid solver.
7. Exclude ordinary presets that only happen to include content or reward LoRAs.
8. Match candidates against the selected model and installed LoRA catalog.
9. Emit complete recipes with evidence and confidence.

Do not expose absolute filesystem paths to browser responses.

### 7.2 Metadata parser

For a LoRA basename, locate its adjacent metadata record when available and extract only bounded fields:

- model/version title;
- description text;
- trained words;
- base model and base model type;
- nested model type;
- primary downloaded filename.

Sanitize rich HTML descriptions before displaying them. Do not render remote metadata as raw HTML.

### 7.3 Heuristic rules

Heuristics should be model-specific and tested. A starting rule may require:

- at least one strong accelerator token; and
- compatible base-model evidence or expected profile behavior.

`Turbo` and `Fast` alone should not be sufficient.

Store the exact matched rules in the evidence record.

### 7.4 User overrides

Allow a local override file to correct ambiguous classifications without changing code:

```json
{
  "qwen/Qwen-Custom-Fast.safetensors": {
    "purpose": "accelerator",
    "label": "Custom Qwen Fast",
    "confidence": "authoritative",
    "settings": {
      "numInferenceSteps": 6,
      "guidanceScale": 1
    }
  },
  "flux2_klein_9b/example-turbo-style.safetensors": {
    "purpose": "content"
  }
}
```

The override file should be private runtime data and excluded from Git by default.

## 8. Proposed Application Data Contracts

Extend the current filename-only catalog without breaking generation validation:

```ts
type ClassifiedLora = {
  filename: string;
  purpose: LoraPurpose;
  confidence: ClassificationConfidence;
  compatible: boolean;
  reason?: string;
  evidence: LoraClassificationEvidence[];
};

type ClassifiedLoraCatalog = {
  supported: boolean;
  modelType: string;
  accelerationPresets: LoraAccelerationPreset[];
  otherLoras: ClassifiedLora[];
  reason?: string;
  refreshedAt: string;
};
```

The server must continue validating every selected filename against the model-aligned installed catalog. Classification must never bypass existing filename validation.

## 9. Proposed UI

### 9.1 LoRA selector structure

Replace the single flat selector with two sections:

- **Acceleration presets**
  - Compact preset selector.
  - Show steps, CFG, solver, and required LoRA count.
  - Selecting a preset applies the complete recipe.
  - Include an evidence tooltip such as “Matched WanGP profile.”

- **Other LoRAs**
  - Preserve the current multi-LoRA and strength controls.
  - Include both content and unclassified LoRAs.
  - Optional filter/search for large catalogs.

Do not use a text-only badge as the sole signal. Use section placement plus a concise label.

### 9.2 Selection behavior

When an accelerator preset is enabled:

1. Add all required LoRAs in profile order.
2. Apply exact multipliers.
3. Apply required steps, CFG, solver, phases, and thresholds.
4. Disable conflicting controls or clearly mark them as preset-controlled.
5. Allow validated content LoRAs alongside the recipe, applying preset LoRAs first and content LoRAs afterward.
6. Restore prior manual values when the preset is disabled, where safe.

### 9.3 Ambiguous items

A medium-confidence candidate should not silently modify generation settings. Options:

- keep it in **Other LoRAs** with a “Possible accelerator” badge;
- provide a review action that explains evidence;
- allow the user to create an explicit override/preset.

## 10. Server-Side Enforcement

Client-side control changes are not sufficient. Each model adapter must:

1. Resolve the selected preset ID against a server-owned discovered catalog.
2. Reject unknown, stale, or incompatible preset IDs.
3. Rebuild controlled WanGP settings from the preset.
4. Validate every LoRA filename against the current installed catalog.
5. Reject partial paired accelerators.
6. Override unsafe conflicting values from the browser.
7. Log the selected preset and evidence source without logging prompt text.

Do not accept an arbitrary browser-provided settings object.

## 11. Caching and Refresh

Classification should build on the existing model/LoRA discovery cache.

The cache fingerprint should include:

- installed model-aligned LoRA filenames;
- relevant profile filenames and modification times or content hashes;
- metadata filenames and modification times;
- override-file modification time;
- WanGP server version and selected model type.

Adding or removing a LoRA/profile must invalidate classification automatically. The existing **Refresh models** action should also force a classification refresh.

Do not hash complete multi-hundred-megabyte LoRA files. Filename, size, and modification time are sufficient for cache invalidation; metadata/profile JSON may be content-hashed because it is small.

## 12. Proposed Upstream MCP Contract

The best long-term implementation belongs in WanGP because WanGP owns effective LoRA directories, profiles, model compatibility, and command-line overrides.

A possible tool:

```python
@mcp.tool()
def wangp_list_lora_presets(model_type: str) -> dict[str, Any]:
    """List installed model-compatible LoRAs and typed acceleration recipes."""
```

Suggested response:

```json
{
  "model_type": "qwen_image_2512_20B",
  "loras": [
    {
      "filename": "character.safetensors",
      "purpose": "unclassified"
    }
  ],
  "acceleration_presets": [
    {
      "id": "qwen-2512-lightning-4",
      "label": "Lightning 4 Steps",
      "loras": [
        {
          "filename": "Qwen-Image-2512-Lightning-4steps-V1.0-bf16.safetensors",
          "multiplier": 1
        }
      ],
      "settings": {
        "num_inference_steps": 4,
        "guidance_scale": 1
      }
    }
  ]
}
```

WanGP should return filenames and typed settings, never absolute paths.

## 13. Suggested Project Structure

```text
lib/wan-gp/
  lora-classifier/
    classify.ts
    profile-parser.ts
    metadata-parser.ts
    heuristics.ts
    compatibility.ts
    overrides.ts
    schemas.ts
    types.ts
components/forms/
  acceleration-preset-selector.tsx
  lora-selector.tsx
data/
  lora-classifier-overrides.json   # ignored runtime file
```

Keep classification independent from React and model adapters. Adapters should consume a resolved, validated preset rather than run classification during submission.

## 14. Implementation Phases

### Phase 1: Read-only classifier

- Define classification, evidence, confidence, and preset types.
- Parse WanGP acceleration profiles.
- Match installed LoRA basenames.
- Add conservative metadata and filename evidence.
- Add local override support.
- Expose classification in a development-only diagnostic or test fixture.
- Do not change generation behavior yet.

### Phase 2: UI grouping

- Add **Acceleration presets** and **Other LoRAs** sections.
- Add evidence/confidence tooltips.
- Keep generation behavior unchanged for ordinary LoRAs.
- Show only high-confidence presets in the primary acceleration section.

### Phase 3: Recipe application

- Add preset IDs to typed application requests.
- Resolve preset IDs server-side.
- Apply CFG, steps, solver, multipliers, phases, and thresholds.
- Lock preset-controlled UI fields.
- Reject partial or incompatible accelerator combinations.

### Phase 4: Upstream MCP integration

- Prefer native WanGP LoRA/preset classification when available.
- Retain local parsing as a compatibility fallback.
- Compare native and local classifications during migration.
- Remove heuristics only after upstream coverage is verified.

## 15. Test Plan

### 15.1 Unit tests

- Parse a Qwen Lightning profile into one complete preset.
- Parse an LTX distilled profile with solver and multiplier.
- Parse a Wan paired high/low-noise profile while preserving order and phases.
- Reject malformed or path-escaping profile entries.
- Do not classify an ordinary profile LoRA as an accelerator solely because it appears in `activated_loras`.
- Classify strong profile matches as high confidence.
- Keep filename-only candidates medium or low confidence.
- Avoid false classification for content LoRAs trained on Turbo base models.
- Apply user overrides deterministically.
- Enforce model and workflow compatibility.

### 15.2 Integration tests

- Build a classified catalog from temporary LoRA, profile, metadata, and override roots.
- Invalidate cache after adding/removing a profile or LoRA.
- Resolve a preset ID into exact WanGP settings.
- Reject stale preset IDs after catalog refresh.
- Reject partial paired accelerators.
- Preserve existing ordinary LoRA validation.

### 15.3 Browser tests

- Show separate acceleration and other sections.
- Selecting Qwen Lightning locks CFG at 1 and changes steps.
- Disabling a preset restores safe prior values.
- A paired Wan accelerator appears as one preset, not two independent LoRAs.
- Search/filter remains usable with large catalogs.
- Mobile layout does not truncate required recipe details or controls.

### 15.4 Live manual tests

For each enabled model family:

1. Compare discovered presets with WanGP’s profile UI.
2. Confirm all required files are installed.
3. Submit a low-cost generation with the exact recipe.
4. Confirm CFG, steps, solver, and multipliers in the final MCP payload.
5. Confirm compatible content LoRAs can be combined only where supported.

## 16. Acceptance Criteria

The feature is complete when:

- acceleration presets are separated from ordinary/unclassified LoRAs;
- every automatically promoted accelerator has authoritative or high-confidence evidence;
- profile-controlled settings are visible and enforced server-side;
- paired/multiphase accelerators cannot be partially selected;
- model compatibility is validated;
- ambiguous files are not falsely labeled as content or accelerator;
- cache refresh responds to local LoRA/profile changes;
- existing LoRA filename security checks remain intact;
- unit, integration, browser, and selected live tests pass.

## 17. Non-Goals

The initial feature should not:

- attempt full semantic classification into character, style, motion, pose, and camera categories;
- infer purpose by loading tensor weights;
- scrape remote services during normal generation;
- expose arbitrary filesystem paths;
- automatically trust Civitai descriptions or filenames;
- patch WanGP source from Easy Media Generator;
- accept arbitrary profile settings from the browser.

## 18. Risks and Open Questions

1. **Profile coverage:** Not every installed accelerator has a bundled WanGP profile.
2. **Profile ambiguity:** Some profiles contain content/reward LoRAs in addition to accelerators.
3. **Filename drift:** Downloaded names may differ from profile URL basenames.
4. **Model aliases:** Compatibility mappings may drift with WanGP releases.
5. **Combined LoRAs:** Some accelerators may not tolerate arbitrary content LoRAs.
6. **Multiplier syntax:** Wan multiphase multipliers are more complex than a single numeric strength.
7. **Metadata quality:** Civitai metadata can be missing, stale, or descriptive rather than machine-readable.
8. **User overrides:** The override UX and conflict precedence need a product decision.
9. **Profiles versus presets:** Some profile files are quality or content presets, not acceleration recipes.
10. **Upstream direction:** A future WanGP MCP contract may make local profile parsing temporary.

## 19. Recommended Decision

Proceed later with a **profile-first acceleration preset classifier**, not a generic filename classifier.

Recommended classification policy:

1. Promote only recognized WanGP acceleration-profile matches automatically.
2. Use metadata and filename heuristics to flag possible accelerators, not to silently apply them.
3. Keep all uncertain files under **Other LoRAs** or **Unclassified**.
4. Support private user overrides for local exceptions.
5. Treat each accelerator as a complete model-specific recipe with server-side enforcement.
6. Prefer a future native WanGP MCP classification contract whenever it becomes available.
