import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";

const VALIDATOR_TOOL_TIMEOUT_MS = 5000;

type CodeValidatorProxyResponse = {
  language: 'solidity' | 'move';
  warnings: Array<{
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    rule: string;
    message: string;
    line: number | null;
  }>;
  warning_count: number;
  has_high_severity: boolean;
  sandbox_recommended: boolean;
  report: string;
  disclaimer: string;
  cost: number;
};

export default tool({
  description:
    "Validate AI-generated Solidity or Move smart contract code for common vulnerabilities. " +
    "Detects reentrancy, unchecked external calls, integer overflow risks, and other anti-patterns. " +
    "Always call this tool BEFORE presenting smart contract code to users. " +
    "Returns a markdown report with severity-tagged warnings and a mandatory safety disclaimer.",
  args: {
    code: tool.schema
      .string()
      .describe("Smart contract source code to validate"),
    language: tool.schema
      .enum(['solidity', 'move'])
      .describe("Programming language of the code snippet"),
    session_id: tool.schema
      .string()
      .optional()
      .describe("Session ID for billing tracking"),
  },
  async execute(args, _context) {
    const epsilonToken = getEnv("EPSILON_TOKEN");
    const epsilonApiUrl = getEnv("EPSILON_API_URL");

    if (!epsilonToken) return JSON.stringify({ success: false, error: "EPSILON_TOKEN not set." }, null, 2);
    if (!epsilonApiUrl) return JSON.stringify({ success: false, error: "EPSILON_API_URL not set." }, null, 2);
    if (!/^https?:\/\//.test(epsilonApiUrl)) {
      return JSON.stringify({ success: false, error: "EPSILON_API_URL must start with http:// or https://." }, null, 2);
    }

    if (!args.code || args.code.trim() === '') {
      return JSON.stringify({ success: false, error: "code is required" }, null, 2);
    }
    if (args.code.length > 50000) {
      return JSON.stringify({ success: false, error: "code exceeds 50000 characters limit" }, null, 2);
    }
    
    if (args.language !== 'solidity' && args.language !== 'move') {
      return JSON.stringify({ success: false, error: "language must be 'solidity' or 'move'" }, null, 2);
    }

    const proxyEndpoint = `${epsilonApiUrl.replace(/\/+$/, "")}/v1/router/code-validator`;

    const body: Record<string, unknown> = { 
      code: args.code,
      language: args.language
    };
    if (args.session_id && args.session_id.trim() !== '') body.session_id = args.session_id;

    const startTime = Date.now();

    let response: Response;
    try {
      response = await fetch(proxyEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${epsilonToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(VALIDATOR_TOOL_TIMEOUT_MS),
      });
    } catch (e) {
      return JSON.stringify(
        { success: false, error: `Network error: ${String(e)}` },
        null,
        2,
      );
    }

    if (response.status === 402) {
      return JSON.stringify(
        { success: false, error: "Insufficient credits. Please top up to use code validator." },
        null,
        2,
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(unreadable)");
      return JSON.stringify(
        { success: false, error: `Proxy error ${response.status}: ${errorBody.slice(0, 500)}` },
        null,
        2,
      );
    }

    let data: CodeValidatorProxyResponse;
    try {
      data = (await response.json()) as CodeValidatorProxyResponse;
    } catch (e) {
      return JSON.stringify(
        { success: false, error: `Invalid JSON response from proxy: ${String(e)}` },
        null,
        2,
      );
    }

    const response_time_ms = Date.now() - startTime;
    return JSON.stringify({ ...data, response_time_ms }, null, 2);
  },
});
