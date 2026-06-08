/**
 * @module aiPromptMode
 * Prompt-prefix injection for the "ai_prompt" gateway mode.
 *
 * Findings from Issue A extended research (docs/ADRs/0008-ai-only-meme-generation.md):
 * - Naming real public figures / copyrighted characters triggers OpenAI safety filters.
 *   Describing visual appearance instead avoids moderation blocks.
 * - Text legibility is a common failure point; explicit instruction improves caption
 *   readability scores across test runs.
 * - PG-13 guardrails are required to prevent content policy rejections.
 * - Constraining output to a single meme image avoids layout confusion.
 */

/**
 * Maximum length accepted in the raw user prompt for ai_prompt mode.
 *
 * Measured in JavaScript string units (UTF-16 code units), so astral
 * characters such as emoji count as 2. This caps only the user's text; the
 * AI_PROMPT_PREFIX is added afterward and is not counted toward this limit, so
 * the final prompt sent to OpenAI can exceed this value (well within the
 * model's own prompt limit).
 */
export const MAX_AI_PROMPT_LENGTH = 800;

/**
 * Safety and format guardrails prepended to every ai_prompt generation request.
 * Keeps the outbound prompt concise so it does not eat into the user's idea.
 */
export const AI_PROMPT_PREFIX =
  "Edit the attached meme image according to the instruction below. " +
  "Preserve the original template layout, characters, and composition. " +
  "Render any caption text clearly and legibly. " +
  "Do not depict real public figures or copyrighted characters by name; " +
  "describe their visual appearance instead. " +
  "Keep content PG-13: no violence, slurs, or explicit material. " +
  "Edit instruction: ";

/**
 * Prepends the safety/format prefix to a raw user prompt.
 *
 * @param {string} userPrompt - Raw prompt text from the frontend textarea.
 *   The caller is responsible for trimming and validating length first.
 * @returns {string} Prefixed prompt sent to OpenAI.
 */
export function buildAiPrompt(userPrompt) {
  return `${AI_PROMPT_PREFIX}${userPrompt}`;
}
