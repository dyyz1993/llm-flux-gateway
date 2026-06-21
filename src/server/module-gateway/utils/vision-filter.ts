/**
 * Vision Capability Filter
 *
 * Filters image_url content blocks from requests destined for models
 * that do not support image inputs (e.g., DeepSeek).
 */

/**
 * Known model prefixes that do NOT support vision/image inputs.
 * These models will error if image_url content blocks are present.
 * Add to this list as needed.
 */
export const NON_VISION_MODEL_PREFIXES: string[] = [
  'deepseek-',
];

/**
 * Check if a model name supports vision/image inputs.
 * Returns false for known non-vision models (e.g., DeepSeek).
 */
export function isVisionModel(model: string): boolean {
  if (!model) return true;
  return !NON_VISION_MODEL_PREFIXES.some(prefix => model.startsWith(prefix));
}

/**
 * Strip image_url content blocks from an internal-format request in place.
 *
 * Handles every content shape we might see coming out of the transpiler:
 * - `content` is a string (no-op)
 * - `content` is a single object with `type === 'image_url'` → set to null
 * - `content` is an array → filter out image_url blocks; null if all removed
 * - `toolCalls[].function.arguments` JSON may contain an image_url block
 * - top-level `image_url` field on the message
 *
 * Mutates the request's messages array directly. Returns the number of
 * blocks removed.
 */
export function stripImagesFromInternalRequest(request: any): number {
  if (!request || !Array.isArray(request.messages)) return 0;

  let totalStripped = 0;
  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i];
    if (!msg) continue;

    const content = msg.content;

    // Case 1: content is a single object with image_url type
    if (
      content &&
      typeof content === 'object' &&
      !Array.isArray(content) &&
      (content as any).type === 'image_url'
    ) {
      msg.content = null;
      totalStripped++;
      continue;
    }

    // Case 2: content is an array of blocks
    if (Array.isArray(content)) {
      const before = content.length;
      const filtered = content.filter(
        (block: any) => !(block && typeof block === 'object' && block.type === 'image_url')
      );
      if (filtered.length !== before) {
        request.messages[i].content = filtered.length === 0 ? null : filtered;
        totalStripped += before - filtered.length;
      }
    }

    // Case 3: defensive — some tools return image_url blocks inside tool_calls
    if (Array.isArray(msg.toolCalls)) {
      for (const tc of msg.toolCalls) {
        if (tc?.function?.arguments) {
          try {
            const parsed = JSON.parse(tc.function.arguments);
            if (parsed && Array.isArray(parsed.content)) {
              const beforeLen = parsed.content.length;
              parsed.content = parsed.content.filter(
                (b: any) => !(b && typeof b === 'object' && b.type === 'image_url')
              );
              if (parsed.content.length !== beforeLen) {
                tc.function.arguments = JSON.stringify(parsed);
                totalStripped += beforeLen - parsed.content.length;
              }
            }
          } catch {
            // not JSON, leave alone
          }
        }
      }
    }

    // Case 4: defensive — strip any top-level image_url on the message
    if (msg.image_url) {
      delete msg.image_url;
      totalStripped++;
    }
  }

  if (totalStripped > 0) {
    console.warn(
      `[Gateway] stripImagesFromInternalRequest: removed ${totalStripped} image_url block(s) ` +
      `from request for model "${request.model}"`
    );
  }

  return totalStripped;
}
