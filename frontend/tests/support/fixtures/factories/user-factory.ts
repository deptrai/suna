import { faker } from '@faker-js/faker';

/**
 * User Factory
 * 
 * Creates test users with sensible defaults and explicit overrides.
 * Uses faker for dynamic values to prevent collisions in parallel execution.
 * 
 * Pattern: Factory function with overrides + API seeding + auto-cleanup
 * 
 * Reference: bmad/bmm/testarch/knowledge/data-factories.md
 */

export type User = {
  id: string;
  email: string;
  name: string;
  password: string;
  role?: 'user' | 'admin' | 'moderator';
  createdAt?: Date;
  isActive?: boolean;
};

export class UserFactory {
  private createdUsers: string[] = [];

  /**
   * Create a user with sensible defaults and optional overrides
   */
  async createUser(overrides: Partial<User> = {}): Promise<User> {
    const user: User = {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      password: faker.internet.password({ length: 12 }),
      role: 'user',
      createdAt: new Date(),
      isActive: true,
      ...overrides,
    };

    // API call to create user (if API_URL is configured)
    const apiUrl = process.env.API_URL || 'http://localhost:8000/api';
    try {
      const response = await fetch(`${apiUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });

      if (response.ok) {
        const created = await response.json();
        this.createdUsers.push(created.id || user.id);
        return created;
      } else {
        // If API fails, return the user object anyway (for offline testing)
        console.warn(`API user creation failed: ${response.statusText}`);
        return user;
      }
    } catch (error) {
      // If API is not available, return user object (for development)
      console.warn(`API not available, using mock user: ${error}`);
      return user;
    }
  }

  /**
   * Cleanup all created users
   * Called automatically after test completion
   */
  async cleanup(): Promise<void> {
    const apiUrl = process.env.API_URL || 'http://localhost:8000/api';
    for (const userId of this.createdUsers) {
      try {
        await fetch(`${apiUrl}/users/${userId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        // Ignore cleanup errors in development
        console.warn(`Cleanup failed for user ${userId}: ${error}`);
      }
    }
    this.createdUsers = [];
  }
}

