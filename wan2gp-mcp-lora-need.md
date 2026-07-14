# Request: model-aligned LoRA discovery through the WanGP API and MCP server

## Background

WanGP already accepts LoRA selections in generation settings through:

- `activated_loras`: ordered list of LoRA filenames
- `loras_multipliers`: space-separated strengths aligned with that list

WanGP also already resolves the correct LoRA directory for a model internally through `get_lora_dir(model_type)`. Deepy's **Get Loras** feature uses the same underlying information. As of July 12, 2026, however, the public Python API and MCP server do not expose model-aligned LoRA discovery.

External clients therefore cannot safely present a LoRA picker without duplicating WanGP's model-family-to-directory rules or reading WanGP's filesystem directly. Those rules include model-specific directories and user-supplied `--lora-dir-*` overrides, so duplicating them outside WanGP will eventually drift.

## Requested Python API method

Please consider adding a method similar to:

```python
WanGPSession.list_loras(model_type: str) -> dict[str, Any]
```

Suggested behavior:

1. Validate that `model_type` exists.
2. Read the model definition and honor its `no_lora` flag.
3. Resolve the effective directory with WanGP's existing `get_lora_dir(model_type)` logic, including CLI directory overrides.
4. Return immediate `.safetensors` and `.sft` files only.
5. Return filenames, not absolute server paths.
6. Sort filenames case-insensitively for a stable client response.
7. Return a supported empty catalog when the resolved directory does not exist yet.

Suggested result:

```json
{
  "model_type": "ltx2_22B_distilled",
  "supported": true,
  "loras": [
    "cinematic-motion.safetensors",
    "handheld-camera.sft"
  ]
}
```

For a model with `no_lora` enabled:

```json
{
  "model_type": "example_model",
  "supported": false,
  "loras": [],
  "reason": "This WanGP model does not support LoRAs."
}
```

An unknown `model_type` should use the same error behavior as existing methods such as `get_model_schema` or `get_model_availability`.

## Requested MCP tool

Please expose the API method through the existing MCP server:

```python
@mcp.tool()
def wangp_list_loras(model_type: str) -> dict[str, Any]:
    """List installed LoRA filenames compatible with one WanGP model."""
    return session.list_loras(model_type)
```

Proposed MCP call:

```json
{
  "name": "wangp_list_loras",
  "arguments": {
    "model_type": "ltx2_22B_distilled"
  }
}
```

## Why this belongs in WanGP

- WanGP owns the authoritative model definition and effective LoRA directory.
- It can honor all current and future `--lora-dir-*` options without clients duplicating them.
- Returning filenames instead of absolute paths avoids disclosing the server's filesystem layout.
- Clients can validate selections against a server-provided catalog before sending `activated_loras`.
- The method would make LoRA support consistent with the existing model metadata, schema, defaults, availability, generation, and job MCP tools.

This would let third-party clients remove filesystem-specific fallback logic and rely entirely on WanGP's supported API surface.