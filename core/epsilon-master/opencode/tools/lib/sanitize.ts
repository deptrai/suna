/**
 * Strip an upstream HTTP error body of any LLM-influenceable content. Adversarial
 * upstreams (or attacker-controlled WAF pages) could inject prompt-injection text
 * via error responses; we only forward the first 200 chars and remove non-printable
 * characters that LLMs treat as control sequences.
 */
export function sanitizeUpstreamErr(body: string): string {
  return body
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
