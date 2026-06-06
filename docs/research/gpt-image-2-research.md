# GPT Image 2 Research — MemeBro Model Upgrade

## Overview
This document compares `gpt-image-1` and `gpt-image-2` capabilities based on OpenAI's official documentation and our own testing data from the `gpt-image-1` evaluation (see `docs/ADRs/0008-ai-only-meme-generation.md`, Runs 1–22). The goal is to document the rationale for upgrading MemeBro's default image model.

## Model Family
OpenAI's GPT Image model lineup (as of June 2025):
- `gpt-image-1-mini` — Lightweight, lowest cost
- `gpt-image-1` — Original model (MemeBro's previous default)
- `gpt-image-1.5` — Incremental improvement over gpt-image-1
- `gpt-image-2` — Latest model (MemeBro's current default)

## Capability Comparison

### Text Rendering
| | gpt-image-1 | gpt-image-2 |
|---|---|---|
| Caption spelling accuracy | Frequent errors (e.g., "meeting" misspelled in Run 4) | "Significantly improved" per OpenAI docs |
| Font clarity | Often blurry, inconsistent sizing (Runs 10, 11, 17) | Better text placement and clarity |
| Multi-line captions | Poor alignment, overlapping with image elements | Improved composition control |

Our gpt-image-1 testing showed an average caption legibility score of ~3.2/5 across successful runs. Text rendering was the single biggest weakness — in Run 11, the reprompted "two buttons" meme scored 0/5 for legibility. In Run 17 (developer meme), top text was completely unreadable. gpt-image-2's improved text rendering directly addresses this core meme generation requirement.

### Prompt Adherence
| | gpt-image-1 | gpt-image-2 |
|---|---|---|
| Meme template fidelity | Often invented own layout (Runs 6, 9, 12, 13) | Better instruction following for structured compositions |
| Character accuracy | Recognizable but inconsistent (e.g., "kinda looks like the rock" in Run 18) | Improved visual consistency |
| Layout control | Limited control over element placement | More precise composition control, though still imperfect |

Our testing showed average meme recognizability of ~2.7/5 — the model frequently generated "a meme about X" rather than "the X meme template." gpt-image-2's improved prompt adherence should help with reproducing specific meme formats.

### Resolution & Output
| Feature | gpt-image-1 | gpt-image-2 |
|---|---|---|
| Supported sizes | 1024×1024, 1024×1536, 1536×1024 | Any resolution up to 3840px edge (multiples of 16px) |
| Aspect ratio limit | Fixed options | Up to 3:1 ratio |
| Max resolution | 1536×1024 | 3840×2160 (4K) — experimental above 2K |
| Output formats | PNG only | PNG, JPEG, WebP |
| Compression control | None | 0–100% for JPEG and WebP |
| Transparent backgrounds | Supported | Not currently supported |
| Streaming | Not available | Partial image streaming (0–3 partial images) |

For meme generation, the flexible resolution is useful for producing memes that match common social media aspect ratios (e.g., 1080×1080 for Instagram, 1200×628 for Twitter/X cards). JPEG output reduces payload size for caching.

### Quality Tiers
Both models support `low`, `medium`, and `high` quality. gpt-image-2 adds `auto` (model picks the best quality for the prompt).

Output token counts for gpt-image-1 (1024×1024):
- Low: 272 tokens
- Medium: 1,056 tokens
- High: 4,160 tokens

gpt-image-2 uses a different token calculation; the output token count at low/1024×1024 is 196 tokens — lower than gpt-image-1's 272.

### Content Moderation
| Feature | gpt-image-1 | gpt-image-2 |
|---|---|---|
| Moderation control | Default filtering only | `moderation` parameter: `auto` or `low` |
| Error details | Generic 400 status | Structured `moderation_details` with `categories` and `moderation_stage` |
| Filter strictness | Blocked Pikachu, Drake by name (Runs 1, 14–16) | `low` moderation option may allow more pop-culture references |

The structured error response is particularly valuable for meme apps. Instead of a generic "Error: Server responded with status 400" (as seen in our Runs 1, 14–16, 19–22), we now get:
```json
{
  "error": {
    "code": "moderation_blocked",
    "moderation_details": {
      "moderation_stage": "input",
      "categories": ["harassment"]
    }
  }
}
```
This lets us provide actionable user feedback (e.g., "Try describing the character's appearance instead of using their name").

### Image Editing
| Feature | gpt-image-1 | gpt-image-2 |
|---|---|---|
| Basic edits with mask | Yes | Yes |
| Multi-turn editing | Not available | Supported via Responses API |
| Image input fidelity | Configurable (low/high) | Always high fidelity |
| Multi-image input | Yes | Yes |

Multi-turn editing via the Responses API could enable a "refine your meme" workflow — users generate a meme, then iteratively adjust text, style, or elements through conversation.

## Pricing Comparison

### Per-Image Cost (1024×1024)
| Model | Low | Medium | High |
|---|---|---|---|
| gpt-image-1-mini | $0.005 | $0.011 | $0.036 |
| gpt-image-1 | $0.011 | $0.042 | $0.167 |
| gpt-image-1.5 | $0.009 | $0.034 | $0.133 |
| **gpt-image-2** | **$0.006** | **$0.053** | **$0.211** |

### Per-Image Cost (1024×1536 / Portrait)
| Model | Low | Medium | High |
|---|---|---|---|
| gpt-image-1-mini | $0.006 | $0.015 | $0.052 |
| gpt-image-1 | $0.016 | $0.063 | $0.250 |
| gpt-image-1.5 | $0.013 | $0.050 | $0.200 |
| **gpt-image-2** | **$0.005** | **$0.041** | **$0.165** |

### Cost Analysis for MemeBro
- **Low quality** (preview/draft): gpt-image-2 is **45% cheaper** than gpt-image-1 ($0.006 vs $0.011 at 1024×1024).
- **Medium quality** (standard generation): gpt-image-2 is **26% more expensive** ($0.053 vs $0.042).
- **High quality** (export/share): gpt-image-2 is **26% more expensive** ($0.211 vs $0.167).

**Recommended strategy**: Use `quality: "low"` for preview generation and `quality: "medium"` or `quality: "high"` only for the final image the user downloads/shares. With KV caching (see ADR 0008 caching plan), repeated requests for the same prompt cost nothing after the first generation.

At 10,000 meme generations/month using `low` quality:
- gpt-image-1: $110/month
- gpt-image-2: $60/month (45% savings)

## Model Upgrade Decision Rationale

### Why gpt-image-2 over gpt-image-1
1. **Text quality is the #1 meme requirement.** Our testing data shows text rendering was the weakest aspect of gpt-image-1 for meme generation. gpt-image-2's improved text rendering directly addresses this.
2. **Lower cost at low quality.** For a meme app where most generations are casual/fun, `low` quality at $0.006/image is a significant cost reduction.
3. **Better error handling.** Structured moderation errors let us build better UX around rejected prompts instead of showing generic failures.
4. **JPEG output.** Reduces response payload size, which matters for caching in Cloudflare Workers KV and for mobile clients on slow connections.
5. **Streaming support.** Partial image previews can make the generation feel faster, improving perceived latency even when actual generation time is similar.

### Trade-offs Accepted
- **No transparent backgrounds.** Not needed for meme generation (memes are always on opaque backgrounds).
- **Higher cost at high quality.** Mitigated by using low/medium quality for most generations and caching results.
- **Complex prompts may take up to 2 minutes.** Same limitation as gpt-image-1; mitigated by the existing loading affordance and streaming support.
- **Still imperfect text.** OpenAI docs note "the model can still struggle with precise text placement and clarity" — this is improved but not solved.

### Migration Path
The upgrade was implemented as a default-value change in `worker/src/openai/image.js`:
```js
const model = env.OPENAI_IMAGE_MODEL || "gpt-image-2";
```
This is backward-compatible — setting `OPENAI_IMAGE_MODEL=gpt-image-1` in the environment will revert to the previous model. No API contract changes were required since MemeBro uses the Image API directly (not the Responses API).

## References
- [OpenAI Image Generation Guide](https://platform.openai.com/docs/guides/image-generation)
- [OpenAI Pricing](https://platform.openai.com/docs/pricing)
- MemeBro gpt-image-1 test results: `docs/ADRs/0008-ai-only-meme-generation.md` (Runs 1–22)
- MemeBro gpt-image-1 face-swap tests: `docs/research/gptimg1/stats.md`
- Replicate comparison: `docs/research/replicate/stats.md`
