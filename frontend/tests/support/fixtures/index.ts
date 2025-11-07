import { test as base, mergeTests } from '@playwright/test';
import { UserFactory } from '../fixtures/factories/user-factory';
import { ProjectFactory } from '../fixtures/factories/project-factory';
import { ThreadFactory } from '../fixtures/factories/thread-factory';
import { test as authFixture } from './auth.fixture';

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

type BaseTestFixtures = {
  userFactory: UserFactory;
  projectFactory: ProjectFactory;
  threadFactory: ThreadFactory;
};

const baseTest = base.extend<BaseTestFixtures>({
  userFactory: async ({}, use) => {
    const factory = new UserFactory();
    await use(factory);
    await factory.cleanup(); // Auto-cleanup after test
  },
  projectFactory: async ({}, use) => {
    const factory = new ProjectFactory();
    await use(factory);
    await factory.cleanup(); // Auto-cleanup after test
  },
  threadFactory: async ({}, use) => {
    const factory = new ThreadFactory();
    await use(factory);
    await factory.cleanup(); // Auto-cleanup after test
  },
});

// Compose all fixtures for comprehensive capabilities
export const test = mergeTests(baseTest, authFixture);

export { expect } from '@playwright/test';

