import { describe, expect, it } from 'bun:test';
import { validateInput } from '../../src/utils/validation';

describe('Validation Utils', () => {
  it('[P0] should return true for valid input', () => {
    expect(validateInput({ name: 'test' })).toBe(true);
  });

  it('[P1] should throw error for invalid input', () => {
    expect(() => validateInput({})).toThrow('Invalid input');
  });
});