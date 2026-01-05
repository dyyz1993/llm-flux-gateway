/**
 * TDD Test for Issue c9d389: content_block_start event sent repeatedly
 *
 * This test reproduces the bug from the real log file:
 * logs/protocol-transformation/906dcc42-a5e3-4e84-8c12-f481d6c9d389-c9d389-1767530395307.log
 *
 * Bug: In convertStreamChunkFromInternal, content_block_start is sent
 *      before EVERY content_block_delta, instead of only once at the beginning.
 */

import { describe, it, expect, beforeEach } from 'vitest';
// import { expectSuccess } from '../../__tests__/test-helpers';
import { AnthropicConverter } from '../anthropic.converter';
import type { InternalStreamChunk } from '../../interfaces/internal-format';

describe('Anthropic Converter - Issue c9d389: content_block_start duplication', () => {
  let converter: AnthropicConverter;

  beforeEach(() => {
    // Create a fresh converter instance for each test
    converter = new AnthropicConverter();
  });

  // Test data extracted from the real log file
  // These chunks represent a streaming response from OpenAI format
  const createStreamChunk = (content: string, hasRole = false): InternalStreamChunk => ({
    id: 'msg_202601042039544831032dda86479c',
    object: 'chat.completion.chunk',
    created: 1767530395,
    model: 'glm-4.6',
    choices: [
      {
        index: 0,
        delta: hasRole ? { role: 'assistant', content } : { content },
        finishReason: null,
      },
    ],
  });

  describe('content_block_start should only be sent once per stream', () => {
    it('should send content_block_start only once for multiple content deltas', () => {
      // Simulate the real stream from the log file
      const chunks = [
        createStreamChunk('', true),  // First chunk with role
        createStreamChunk('"'),       // Chunk #002
        createStreamChunk('isNew'),   // Chunk #003
        createStreamChunk('Topic'),   // Chunk #004
        createStreamChunk('\\":'),     // Chunk #005
        createStreamChunk(' false'),  // Chunk #006
        createStreamChunk(',\\n'),    // Chunk #007
      ];

      const allEvents: string[] = [];

      // Process all chunks
      for (const chunk of chunks) {
        const result = converter.convertStreamChunkFromInternal(chunk);
        if (result.success) {
          const sseData = result.data!;
          // Split by event marker to count individual events
          const events = sseData.split(/\nevent:/).filter(e => e.trim());
          allEvents.push(...events);
        }
      }

      // Count content_block_start events
      const contentBlockStartCount = allEvents.filter(e =>
        e.includes('content_block_start')
      ).length;

      // Count content_block_delta events
      const contentBlockDeltaCount = allEvents.filter(e =>
        e.includes('content_block_delta')
      ).length;

      // Expected behavior: content_block_start should only be sent ONCE
      // at the beginning of the stream, not before every delta
      expect(contentBlockStartCount, `
        Expected content_block_start to be sent only once,
        but it was sent ${contentBlockStartCount} times.

        This is the bug from issue c9d389: content_block_start is being
        sent before EVERY content_block_delta instead of only once.

        Total deltas: ${contentBlockDeltaCount}
        Total block_start events: ${contentBlockStartCount}
      `).toBe(1);

      // All deltas should still be sent
      expect(contentBlockDeltaCount).toBe(chunks.length - 1); // -1 for first chunk with role
    });

    it('should correctly format the first chunk with content_block_start', () => {
      const firstChunk = createStreamChunk('"', true);
      const result = converter.convertStreamChunkFromInternal(firstChunk);

      expect(result.success).toBe(true);

      const sseData = result.data!;

      // Should contain message_start
      expect(sseData).toContain('event: message_start');

      // Should contain content_block_start (only once)
      expect(sseData).toContain('event: content_block_start');

      // Should contain content_block_delta
      expect(sseData).toContain('event: content_block_delta');
      expect(sseData).toContain('"');
    });

    it('should NOT send content_block_start for subsequent chunks', () => {
      // First, initialize the stream with a chunk that has role
      const firstChunk = createStreamChunk('"', true);
      converter.convertStreamChunkFromInternal(firstChunk);

      // Now send a subsequent chunk
      const subsequentChunk = createStreamChunk('isNew');
      const result = converter.convertStreamChunkFromInternal(subsequentChunk);

      expect(result.success).toBe(true);

      const sseData = result.data!;

      // Should NOT contain content_block_start
      expect(sseData, `
        Subsequent chunks should NOT contain content_block_start,
        but the output was:\n${sseData}
      `).not.toContain('event: content_block_start');

      // Should only contain content_block_delta
      expect(sseData).toContain('event: content_block_delta');
      expect(sseData).toContain('isNew');
    });

    it('should handle complete stream from the log file', () => {
      // Complete stream from the log file (Chunks #001-#014)
      const completeStream = [
        createStreamChunk('', true),  // #001: message_start
        createStreamChunk('"'),       // #002
        createStreamChunk('isNew'),   // #003
        createStreamChunk('Topic'),   // #004
        createStreamChunk('\\":'),     // #005
        createStreamChunk(' false'),  // #006
        createStreamChunk(',\\n'),    // #007
        createStreamChunk(' '),       // #008
        createStreamChunk(' "\\"'),    // #009
        createStreamChunk('title'),   // #010
        createStreamChunk('\\":'),     // #011
        createStreamChunk(' null'),   // #012
        createStreamChunk('\\n'),     // #013
        createStreamChunk('}'),       // #014
      ];

      let fullOutput = '';
      let contentBlockStartCount = 0;
      let contentBlockDeltaCount = 0;

      for (const chunk of completeStream) {
        const result = converter.convertStreamChunkFromInternal(chunk);
        if (result.success) {
          fullOutput += result.data! + '\n';

          // Count events
          if (result.data!.includes('content_block_start')) {
            contentBlockStartCount++;
          }
          if (result.data!.includes('content_block_delta')) {
            contentBlockDeltaCount++;
          }
        }
      }

      // Verify the bug is fixed
      expect(contentBlockStartCount, `
        Expected exactly 1 content_block_start event in the entire stream,
        but found ${contentBlockStartCount}.

        Full output:\n${fullOutput}
      `).toBe(1);

      // All content deltas should be present
      expect(contentBlockDeltaCount).toBe(completeStream.length - 1);

      // Verify message_start is sent only once
      const messageStartCount = (fullOutput.match(/event: message_start/g) || []).length;
      expect(messageStartCount).toBe(1);
    });
  });

  describe('tool_use blocks should follow the same pattern', () => {
    it('should send tool_use content_block_start only once', () => {
      const toolCallChunks = [
        {
          ...createStreamChunk('', true),
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                toolCalls: [
                  {
                    index: 0,
                    id: 'toolu_0123456789',
                    type: 'function',
                    function: {
                      name: 'test_function',
                      arguments: '',
                    },
                  },
                ],
              },
              finishReason: null,
            },
          ],
        } as InternalStreamChunk,
        {
          ...createStreamChunk(''),
          choices: [
            {
              index: 0,
              delta: {
                toolCalls: [
                  {
                    index: 0,
                    function: {
                      arguments: '{',
                    },
                  },
                ],
              },
              finishReason: null,
            },
          ],
        } as InternalStreamChunk,
        {
          ...createStreamChunk(''),
          choices: [
            {
              index: 0,
              delta: {
                toolCalls: [
                  {
                    index: 0,
                    function: {
                      arguments: '"arg"',
                    },
                  },
                ],
              },
              finishReason: null,
            },
          ],
        } as InternalStreamChunk,
      ];

      let toolBlockStartCount = 0;
      let toolDeltaCount = 0;

      for (const chunk of toolCallChunks) {
        const result = converter.convertStreamChunkFromInternal(chunk);
        if (result.success) {
          const sseData = result.data!;

          // Count tool_use content_block_start events
          if (sseData.includes('"type":"tool_use"')) {
            const blockStartMatches = sseData.match(/event: content_block_start/g);
            if (blockStartMatches) {
              toolBlockStartCount += blockStartMatches.length;
            }
          }

          // Count input_json_delta events
          if (sseData.includes('input_json_delta')) {
            toolDeltaCount++;
          }
        }
      }

      // Tool_use content_block_start should only be sent once
      expect(toolBlockStartCount, `
        Expected tool_use content_block_start to be sent only once,
        but it was sent ${toolBlockStartCount} times.
      `).toBe(1);

      // All deltas should be sent
      expect(toolDeltaCount).toBe(2); // Two argument chunks
    });
  });
});
