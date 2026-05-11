import { expect, test, describe } from "bun:test";

// Since index.ts is a module, we can just extract the regex here for testing
// or export it from index.ts. For simplicity, we redefine the regex to test its logic.
const TOKEN_REGEX = /(?:\$([A-Za-z0-9]{2,10}))|\b(?:0x[a-fA-F0-9]{40})\b|\b(?:[1-9A-HJ-NP-Za-km-z]{43,44})\b/g;

describe("Extension Token Regex", () => {
  test("should match Ethereum addresses", () => {
    const text = "Check out this token at 0x1234567890123456789012345678901234567890!";
    const matches = [...text.matchAll(TOKEN_REGEX)];
    expect(matches.length).toBe(1);
    expect(matches[0][0]).toBe("0x1234567890123456789012345678901234567890");
  });

  test("should match Solana addresses", () => {
    const text = "Send SOL to HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH";
    const matches = [...text.matchAll(TOKEN_REGEX)];
    expect(matches.length).toBe(1);
    expect(matches[0][0]).toBe("HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH");
  });

  test("should match Token Tickers", () => {
    const text = "I am bullish on $BTC and $ETH.";
    const matches = [...text.matchAll(TOKEN_REGEX)];
    expect(matches.length).toBe(2);
    expect(matches[0][0]).toBe("$BTC");
    expect(matches[1][0]).toBe("$ETH");
  });

  test("should not match regular words", () => {
    const text = "This is a regular sentence with no tokens.";
    const matches = [...text.matchAll(TOKEN_REGEX)];
    expect(matches.length).toBe(0);
  });
});
