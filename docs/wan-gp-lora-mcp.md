# WanGP LoRA discovery

WanGP's MCP server exposes model-aligned LoRA discovery through `wangp_list_loras`. Easy Media Generator also remains compatible with older WanGP servers that do not provide a native catalog and does not patch WanGP to add tools.

## Discovery order

The app checks MCP `tools/list` for:

- `wangp_list_loras(model_type)` (preferred)
- `wangp_get_loras(model_type)` (compatible alias)

If either tool is present, its result is authoritative. Otherwise, the app reads the local directory configured by `WANGP_LORA_ROOT`. Set this to WanGP's `loras` directory, for example:

```env
WANGP_LORA_ROOT=C:\Pinokio\api\wan2gp.git\app\loras
```

The fallback maps the model metadata returned by `wangp_get_model_schema` to WanGP's default directories:

| Model family | Directory under `WANGP_LORA_ROOT` |
| --- | --- |
| Qwen Image | `qwen` |
| Flux.2 Klein 9B | `flux2_klein_9b` |
| Flux.2 Klein 4B | `flux2_klein_4b` |
| Other Flux.2 | `flux2` |
| LTX-2 | `ltx2` |

The native tool may return recursive, subfolder-relative identifiers; the app accepts safe relative paths and rejects absolute or traversal paths. The filesystem fallback returns only immediate `.safetensors` and `.sft` files, and only their filenames leave the server-side discovery layer. Selected identifiers are validated against that catalog before generation.

## Custom WanGP directories

The fallback follows WanGP's default directory layout. It cannot observe custom `--lora-dir-*` command-line overrides because the current MCP schema does not expose their resolved values. When using custom directories, either point `WANGP_LORA_ROOT` at an equivalent default-layout root or wait for/use a native model-aligned MCP discovery tool.

The proposed native functionality is described in [wan2gp-mcp-lora-need.md](../wan2gp-mcp-lora-need.md).