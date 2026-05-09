import { test, expect } from "bun:test";
import { validateCode, formatReport } from "../../../apps/api/src/router/services/code-validator";

test("[P0] should detect reentrancy in solidity code", () => {
    const code = `contract X { function withdraw() public { msg.sender.call{value:1}(""); } }`;
    const warnings = validateCode(code, "solidity");
    expect(warnings.some(w => w.rule === "reentrancy")).toBe(true);
});

test("[P0] should detect unguarded borrow in move code", () => {
    const code = `borrow_global_mut<T>(addr)`;
    const warnings = validateCode(code, "move");
    expect(warnings.some(w => w.rule === "unguarded-borrow")).toBe(true);
});
