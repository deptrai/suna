import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { CodeValidatorRequestSchema } from '../../types';
import type { AppContext, CodeValidatorResponse } from '../../types';
import { validateCode, formatReport, DISCLAIMER } from '../services/code-validator';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';

const codeValidator = new Hono<{ Variables: AppContext }>();

codeValidator.post('/', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (!body) {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }

  const parsed = CodeValidatorRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: `Validation error: ${parsed.error.message}` });
  }

  const { code, language, session_id } = parsed.data;

  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) {
    throw new HTTPException(402, { message: 'Insufficient credits' });
  }

  const warnings = validateCode(code, language);
  const hasHigh = warnings.some(w => w.severity === 'HIGH');
  const sandboxRecommended = hasHigh;

  const cost = getToolCost('code_validator', 0);

  const response: CodeValidatorResponse = {
    language,
    warnings,
    warning_count: warnings.length,
    has_high_severity: hasHigh,
    sandbox_recommended: sandboxRecommended,
    report: formatReport(language, warnings, sandboxRecommended),
    disclaimer: DISCLAIMER,
    cost
  };

  const result = c.json(response);

  queueMicrotask(async () => {
    try {
      await deductToolCredits(accountId, 'code_validator', 0, `Code validation: ${language}`, session_id);
    } catch (err) {
      console.warn(`[EPSILON][billing-failure] tool=code_validator account=${accountId} err=${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return result;
});

export { codeValidator };
