import { expect, type Page } from '@playwright/test';

export const ownerEmail = process.env.E2E_OWNER_EMAIL || 'test@epsilon.ai';
export const ownerPassword = process.env.E2E_OWNER_PASSWORD || 'testpass123';
export const apiBase = process.env.E2E_API_URL || 'http://localhost:13738/v1';
export const supabaseUrl = process.env.E2E_SUPABASE_URL || 'http://localhost:13740';

function readWebEnvVar(key: string): string | null {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.resolve(__dirname, '../../../apps/web/.env');
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) return null;
  return match[1].trim().replace(/^"|"$/g, '');
}

export function getResolvedSupabaseUrl(): string {
  return process.env.E2E_SUPABASE_URL || readWebEnvVar('NEXT_PUBLIC_SUPABASE_URL') || supabaseUrl;
}

export function getSupabaseCookieName(baseUrl?: string): string {
  // Mirror the same resolution order as apps/web/src/lib/supabase/constants.ts
  // so the cookie name the test sets matches what the app reads.
  const appUrl =
    process.env.EPSILON_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    process.env.PUBLIC_URL ||
    baseUrl ||
    process.env.E2E_BASE_URL ||
    'http://localhost:3000';
  try {
    const url = new URL(appUrl);
    const isLocalhost = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (isLocalhost && url.port) return `sb-epsilon-auth-token-${url.port}`;
  } catch {
    // fall through
  }
  return 'sb-epsilon-auth-token';
}

export function getSupabaseAnonKeyFromWebEnv(): string {
  const key = readWebEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY not found in apps/web/.env');
  }
  return key;
}

/**
 * Read the anon key from the Epsilon .env file.
 */
export function getAnonKey(): string {
  const fs = require('fs');
  const envPath = `${process.env.HOME}/.epsilon/.env`;
  if (!fs.existsSync(envPath)) {
    throw new Error(`Epsilon .env not found at ${envPath} — is it installed?`);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^SUPABASE_ANON_KEY=(.+)$/m);
  if (!match) throw new Error('SUPABASE_ANON_KEY not found in .env');
  return match[1].trim();
}

/**
 * Sign in via Supabase Auth API and return an access token.
 */
export async function getAccessToken(
  email = ownerEmail,
  password = ownerPassword,
): Promise<string> {
  const anonKey = getAnonKey();
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Extract an access token from the browser's auth state.
 */
export async function getAccessTokenFromPage(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    // Check localStorage first
    for (const key of Object.keys(localStorage)) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '');
        if (parsed?.access_token) return parsed.access_token as string;
      } catch {
        // skip
      }
    }
    // Check cookies
    const cookie = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => /^sb-.*-auth-token/.test(c));
    if (!cookie) return null;
    const encoded = decodeURIComponent(cookie.split('=')[1] || '');
    if (encoded.startsWith('base64-')) {
      try {
        const decoded = atob(encoded.slice('base64-'.length));
        return JSON.parse(decoded)?.access_token || null;
      } catch {
        return null;
      }
    }
    return null;
  });
  if (!token) throw new Error('Could not extract access token from browser');
  return token;
}

export async function loginToDashboard(
  page: Page,
  credentials: { email?: string; password?: string } = {},
): Promise<void> {
  const email = credentials.email || ownerEmail;
  const password = credentials.password || ownerPassword;

  await page.goto('/auth/password?redirect=%2Finstances', {
    waitUntil: 'commit',
    timeout: 120_000,
  });
  await page.waitForTimeout(1_500);

  const signInHeading = page.getByRole('heading', { name: /^Sign in$/i });
  await expect(signInHeading).toBeVisible({ timeout: 15_000 });

  const form = page.locator('form').filter({ has: page.locator('input[name="email"]') }).first();
  const emailInput = form.locator('input[name="email"]').first();
  const passwordInput = form.locator('input[name="password"]').first();
  await expect(emailInput).toBeVisible({ timeout: 15_000 });
  await expect(passwordInput).toBeVisible({ timeout: 15_000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submitBtn = form.getByRole('button', { name: /^Sign in$/i }).first();
  await expect(submitBtn).toBeVisible({ timeout: 15_000 });
  await submitBtn.click();

  // Wait for auth route to resolve (either success redirect, or explicit failure state).
  await page.waitForTimeout(1_500);
  if (/\/auth(\/|$)/.test(page.url())) {
    const passwordModeLink = page.getByRole('link', { name: /sign in with password/i });
    if (await passwordModeLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await passwordModeLink.click();
      await expect(signInHeading).toBeVisible({ timeout: 15_000 });
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await submitBtn.click();
      await page.waitForTimeout(1_500);
    }
  }

  const providerStep = page.getByRole('heading', { name: /Connect a provider/i });
  if (await providerStep.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await page.goto('/onboarding?skip_onboarding=1');
  }

  // If we're still on /auth, fail fast with useful context.
  if (/\/auth(\/|$)/.test(page.url())) {
    const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 500);
    throw new Error(`Login did not leave /auth route. Current URL: ${page.url()}. Body excerpt: ${bodyText}`);
  }

  await page.goto('/instances', { waitUntil: 'commit', timeout: 120_000 });
}

export async function loginBySessionCookie(
  page: Page,
  credentials: { email?: string; password?: string } = {},
): Promise<void> {
  const email = credentials.email || ownerEmail;
  const password = credentials.password || ownerPassword;
  const anonKey = getSupabaseAnonKeyFromWebEnv();
  const resolvedSupabaseUrl = getResolvedSupabaseUrl();

  const authRes = await page.request.post(`${resolvedSupabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    data: { email, password },
  });
  expect(authRes.status()).toBe(200);
  const session = await authRes.json();

  // Use the app's own URL (NEXT_PUBLIC_APP_URL) as the cookie domain source so
  // the domain matches what the browser sees when navigating to the app.
  // E2E_BASE_URL may use 127.0.0.1 while the app runs on localhost — those are
  // different cookie domains and the browser will not send the cookie.
  const appUrlStr =
    process.env.E2E_BASE_URL ||
    process.env.EPSILON_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    readWebEnvVar('NEXT_PUBLIC_APP_URL') ||
    'http://localhost:3000';
  const appUrl = new URL(appUrlStr);
  const cookieName = getSupabaseCookieName(appUrlStr);
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: cookieName,
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
      domain: appUrl.hostname,
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
}

export async function ensureServicesHealthy(page: Page): Promise<void> {
  const apiHealth = await page.request.get((process.env.E2E_API_URL || 'http://localhost:13738/v1').replace(/\/v1$/, '/health'));
  expect(apiHealth.ok()).toBeTruthy();
  // Use HEAD to avoid waiting for the full streaming HTML body from Next.js dev server.
  const webHealth = await page.request.fetch(
    (process.env.E2E_BASE_URL || 'http://localhost:13737') + '/auth',
    { method: 'HEAD', timeout: 30_000 },
  );
  expect(webHealth.ok()).toBeTruthy();
}
