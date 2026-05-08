import { describe, expect, it } from 'bun:test';
import { generateCode } from '../../src/services/codegen';

describe('Code Gen Service', () => {
  it('[P0] should generate valid code for standard prompt', async () => {
    const code = await generateCode('create a function');
    expect(code).toContain('function');
  });

  it('[P1] should return error for unsafe prompt', async () => {
    expect(generateCode('hack system')).rejects.toThrow();
  });
});