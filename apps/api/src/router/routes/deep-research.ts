import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DeepResearchRequestSchema } from '../../types';
import type { DeepResearchResponse, AppContext } from '../../types';
import { deepResearchPerplexity } from '../services/perplexity';
import { checkCredits, deductToolCredits } from '../services/billing';

const deepResearch = new Hono<{ Variables: AppContext }>();

/**
 * POST /deep-research
 *
 * Conduct deep multi-source research using Perplexity Sonar Deep Research.
 * Requires authentication via EPSILON_TOKEN.
 * Credits are deducted based on reasoning_effort tier (low/medium/high).
 */
deepResearch.post('/', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (body === null) {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }
  const parseResult = DeepResearchRequestSchema.safeParse(body);

  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: `Validation error: ${parseResult.error.message}`,
    });
  }

  const request = parseResult.data;
  const toolName = `deep_research_${request.reasoning_effort}`;

  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) {
    throw new HTTPException(402, { message: creditCheck.message });
  }

  try {
    const result = await deepResearchPerplexity(request.query, {
      reasoning_effort: request.reasoning_effort,
      max_tokens: request.max_tokens,
      search_recency_filter: request.search_recency_filter,
    });

    const billingResult = await deductToolCredits(
      accountId,
      toolName,
      0,
      `Deep research: ${request.query.slice(0, 50)}`,
      request.session_id
    );

    if (!billingResult.success && !billingResult.skipped) {
      console.warn(
        `[EPSILON] Billing failed for ${accountId} but returning results anyway`
      );
    }

    const response: DeepResearchResponse = {
      ...result,
      cost: billingResult.cost,
    };

    return c.json(response);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not configured')) {
      console.error(`[EPSILON] Deep research config error: ${error.message}`);
      throw new HTTPException(500, { message: error.message });
    }

    console.error(`[EPSILON] Deep research error: ${error}`);
    throw new HTTPException(500, {
      message: `Deep research failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

export { deepResearch };
