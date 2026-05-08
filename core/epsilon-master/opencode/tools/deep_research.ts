import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";

interface DeepResearchCitation {
  title: string;
  url: string;
  snippet: string;
}

interface DeepResearchProxyResponse {
  query: string;
  answer: string;
  citations: DeepResearchCitation[];
  reasoning_effort: string;
  search_queries_count: number;
  cost: number;
}

export default tool({
  description:
    "Conduct deep, multi-source research using Perplexity Sonar Deep Research. " +
    "Returns synthesized answer with citations from authoritative sources. " +
    "Use for in-depth crypto research, protocol analysis, market intelligence. " +
    "Slower than web_search (10-30s) but more comprehensive. " +
    "Set reasoning_effort='low' for quick scans, 'high' for thorough analysis.",
  args: {
    query: tool.schema
      .string()
      .describe(
        "Research query. Be specific — e.g. 'Uniswap v4 hooks architecture and security model'",
      ),
    reasoning_effort: tool.schema
      .string()
      .optional()
      .describe(
        "'low', 'medium' (default), or 'high'. Higher = more searches and reasoning depth, more expensive.",
      ),
    max_tokens: tool.schema
      .number()
      .optional()
      .describe("Max output tokens (100-4000). Default: 2000."),
    search_recency_filter: tool.schema
      .string()
      .optional()
      .describe(
        "Filter sources by recency: 'hour', 'day', 'week', 'month', 'year'. Omit for no filter.",
      ),
  },
  async execute(args, _context) {
    const epsilonApiUrl = getEnv("EPSILON_API_URL");
    const epsilonToken = getEnv("EPSILON_TOKEN");

    if (!epsilonToken) return "Error: EPSILON_TOKEN not set.";
    if (!epsilonApiUrl) return "Error: EPSILON_API_URL not set.";
    if (!/^https?:\/\//.test(epsilonApiUrl)) {
      return "Error: EPSILON_API_URL must start with http:// or https://.";
    }

    const query = args.query?.trim();
    if (!query) return "Error: empty query.";

    const proxyEndpoint = `${epsilonApiUrl.replace(/\/+$/, "")}/v1/router/deep-research`;

    const body: Record<string, unknown> = {
      query,
      reasoning_effort: args.reasoning_effort ?? "medium",
    };
    if (args.max_tokens != null) body.max_tokens = args.max_tokens;
    if (args.search_recency_filter) body.search_recency_filter = args.search_recency_filter;

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
        signal: AbortSignal.timeout(220_000),
      });
    } catch (e) {
      return JSON.stringify(
        { query, success: false, error: `Network error: ${String(e)}` },
        null,
        2,
      );
    }

    if (response.status === 402) {
      return JSON.stringify(
        {
          query,
          success: false,
          error:
            "Insufficient credits. Please top up to use deep research.",
        },
        null,
        2,
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(unreadable)");
      return JSON.stringify(
        {
          query,
          success: false,
          error: `Proxy error ${response.status}: ${errorBody}`,
        },
        null,
        2,
      );
    }

    let data: DeepResearchProxyResponse;
    try {
      data = (await response.json()) as DeepResearchProxyResponse;
    } catch (e) {
      return JSON.stringify(
        {
          query,
          success: false,
          error: `Invalid JSON response from proxy: ${String(e)}`,
        },
        null,
        2,
      );
    }

    const response_time_ms = Date.now() - startTime;
    const answer = data.answer ?? "";
    const citations = data.citations ?? [];

    return JSON.stringify(
      {
        query: data.query ?? query,
        success: citations.length > 0 || answer.length > 0,
        answer,
        citations,
        reasoning_effort: data.reasoning_effort ?? args.reasoning_effort ?? "medium",
        search_queries_count: data.search_queries_count ?? 0,
        response_time_ms,
      },
      null,
      2,
    );
  },
});
