import { config } from '../../config';
import type { DeepResearchCitation, DeepResearchResponse } from '../../types';

interface PerplexityMessage {
  role: string;
  content: string;
}

interface PerplexityChoice {
  message: PerplexityMessage;
}

interface PerplexityUsage {
  prompt_tokens: number;
  completion_tokens: number;
  num_search_queries?: number;
  reasoning_tokens?: number;
}

interface PerplexityCitationObject {
  title?: string;
  url: string;
  snippet?: string;
}

interface PerplexityApiResponse {
  id: string;
  choices: PerplexityChoice[];
  citations?: string[] | PerplexityCitationObject[];
  usage?: PerplexityUsage;
}

export async function deepResearchPerplexity(
  query: string,
  options: {
    reasoning_effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    search_recency_filter?: string;
  } = {}
): Promise<Omit<DeepResearchResponse, 'cost'>> {
  if (!config.PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY not configured');
  }

  const { reasoning_effort = 'medium', max_tokens = 2000, search_recency_filter } = options;

  const requestBody: Record<string, unknown> = {
    model: 'sonar-deep-research',
    messages: [{ role: 'user', content: query }],
    max_tokens,
    reasoning_effort,
  };

  if (search_recency_filter) {
    requestBody.search_recency_filter = search_recency_filter;
  }

  const baseUrl = config.PERPLEXITY_API_URL.replace(/\/+$/, '');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(200_000),
    });
  } catch (e) {
    throw new Error(
      `Perplexity API request failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!response.ok) {
    const error = await response.text().catch(() => '');
    throw new Error(`Perplexity API error: ${response.status} - ${error || response.statusText}`);
  }

  const data: PerplexityApiResponse = await response.json();

  const answer = data.choices?.[0]?.message?.content ?? '';
  const search_queries_count = data.usage?.num_search_queries ?? 0;

  const safeHostname = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const citations: DeepResearchCitation[] = (data.citations ?? [])
    .map<DeepResearchCitation | null>((c) => {
      if (typeof c === 'string') {
        if (!c) return null;
        return { title: safeHostname(c), url: c, snippet: '' };
      }
      if (!c?.url) return null;
      return {
        title: c.title ?? safeHostname(c.url),
        url: c.url,
        snippet: c.snippet ?? '',
      };
    })
    .filter((c): c is DeepResearchCitation => c !== null);

  console.log(
    `[EPSILON] Deep research for '${query.slice(0, 50)}' returned ${citations.length} citations`
  );

  return { query, answer, citations, reasoning_effort, search_queries_count };
}
