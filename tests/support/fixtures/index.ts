import { test as base } from '@playwright/test';
import { UserFactory } from '../fixtures/factories/user-factory';

/**
 * Custom Test Fixtures
 * 
 * This file composes multiple fixtures using the mergeTests pattern.
 * Each fixture provides isolated capability (auth, API, factories).
 * 
 * Pattern: Pure function → Fixture → Composition via mergeTests
 * 
 * Reference: bmad/bmm/testarch/knowledge/fixture-architecture.md
 */

type TestFixtures = {
  userFactory: UserFactory;
};

export const test = base.extend<TestFixtures>({
  userFactory: async ({}, use) => {
    const factory = new UserFactory();
    await use(factory);
    await factory.cleanup(); // Auto-cleanup after test
  },
});

export { expect } from '@playwright/test';





