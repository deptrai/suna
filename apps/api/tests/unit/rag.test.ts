import { describe, expect, it } from 'bun:test';
import { generateRagResponse } from '../../src/services/rag';

describe('RAG Service', () => {
  it('[P0] should generate response based on context', async () => {
    const res = await generateRagResponse('query', ['context 1']);
    expect(res).toBeDefined();
  });

  it('[P2] should handle empty context gracefully', async () => {
    const res = await generateRagResponse('query', []);
    expect(res).toBeDefined();
  });
});