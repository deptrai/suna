import { faker } from '@faker-js/faker';

/**
 * Project Factory
 * 
 * Creates test projects with sensible defaults.
 * Uses API to create real projects or returns mock data for offline testing.
 * 
 * Pattern: Factory function with overrides + API seeding + auto-cleanup
 * 
 * Reference: bmad/bmm/testarch/knowledge/data-factories.md
 */

export type Project = {
  id: string;
  name: string;
  description?: string;
  account_id: string;
  created_at?: string;
  sandbox?: {
    id: string;
    pass: string;
    vnc_preview?: string;
    sandbox_url?: string;
    token?: string;
  };
};

export class ProjectFactory {
  private createdProjects: string[] = [];

  /**
   * Create a project with sensible defaults and optional overrides
   */
  async createProject(overrides: Partial<Project> = {}): Promise<Project> {
    const project: Project = {
      id: faker.string.uuid(),
      name: overrides.name || `Test Project ${faker.string.alphanumeric(6)}`,
      description: overrides.description || faker.lorem.sentence(),
      account_id: overrides.account_id || faker.string.uuid(),
      created_at: new Date().toISOString(),
      ...overrides,
    };

    // Try to create via API (if API_URL and auth token available)
    const apiUrl = process.env.API_URL || 'http://localhost:8000';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // If Supabase configured, try to use frontend API helper
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-test-project')) {
      try {
        // Import dynamically to avoid SSR issues
        const { createProject: createProjectAPI } = await import('@/lib/api');
        const created = await createProjectAPI(
          { name: project.name, description: project.description || '' },
          project.account_id
        );
        this.createdProjects.push(created.id);
        return {
          id: created.id,
          name: created.name,
          description: created.description,
          account_id: project.account_id,
          created_at: created.created_at,
          sandbox: created.sandbox,
        };
      } catch (error) {
        console.warn(`API project creation failed, using mock: ${error}`);
      }
    }

    // Fallback: return mock project (for offline testing)
    return project;
  }

  /**
   * Cleanup all created projects
   * Called automatically after test completion
   */
  async cleanup(): Promise<void> {
    const apiUrl = process.env.API_URL || 'http://localhost:8000/api';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    // Try to delete via API if configured
    if (supabaseUrl && !supabaseUrl.includes('your-test-project')) {
      for (const projectId of this.createdProjects) {
        try {
          // Try Supabase direct deletion
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(
            supabaseUrl,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
          );
          await supabase.from('projects').delete().eq('project_id', projectId);
        } catch (error) {
          // Ignore cleanup errors in development
          console.warn(`Cleanup failed for project ${projectId}: ${error}`);
        }
      }
    }
    this.createdProjects = [];
  }
}


