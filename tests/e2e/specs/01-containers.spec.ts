import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function containerRunning(name: string): boolean {
  try {
    const out = execSync(`docker ps --format '{{.Names}}' --filter name=${name}`, {
      encoding: 'utf8',
      timeout: 10_000,
    });
    return out.trim().includes(name);
  } catch {
    return false;
  }
}

test.describe('01 — Docker containers are running', () => {
  test('frontend container is up', () => {
    expect(containerRunning('epsilon-frontend')).toBe(true);
  });

  test('API container is up', () => {
    expect(containerRunning('epsilon-epsilon-api')).toBe(true);
  });

  test('Supabase Auth container is up', () => {
    expect(containerRunning('epsilon-supabase-auth')).toBe(true);
  });

  test('Supabase Kong container is up', () => {
    expect(containerRunning('epsilon-supabase-kong')).toBe(true);
  });

  test('Supabase DB container is up', () => {
    expect(containerRunning('epsilon-supabase-db')).toBe(true);
  });

  test('Sandbox container is up', () => {
    expect(containerRunning('epsilon-sandbox')).toBe(true);
  });
});
