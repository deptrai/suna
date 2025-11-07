import { faker } from '@faker-js/faker';
import { ProjectFactory, Project } from './project-factory';

/**
 * Thread Factory
 * 
 * Creates test threads with sensible defaults.
 * Automatically creates a project if not provided.
 * 
 * Pattern: Factory function with overrides + API seeding + auto-cleanup
 * 
 * Reference: bmad/bmm/testarch/knowledge/data-factories.md
 */

export type Thread = {
  thread_id: string;
  project_id: string;
  account_id: string;
  created_at?: string;
};

export class ThreadFactory {
  private createdThreads: string[] = [];
  private createdProjects: string[] = [];
  private projectFactory: ProjectFactory;

  constructor() {
    this.projectFactory = new ProjectFactory();
  }

  /**
   * Create a thread with sensible defaults
   * Automatically creates a project if not provided
   */
  async createThread(overrides: Partial<Thread & { project?: Project }> = {}): Promise<Thread & { project: Project }> {
    let project: Project;

    // If project provided, use it; otherwise create new project
    if (overrides.project) {
      project = overrides.project;
    } else if (overrides.project_id) {
      // Project ID provided but no project object - fetch or create
      project = {
        id: overrides.project_id,
        name: `Test Project ${faker.string.alphanumeric(6)}`,
        account_id: overrides.account_id || faker.string.uuid(),
      };
    } else {
      // Create new project
      project = await this.projectFactory.createProject({
        account_id: overrides.account_id || faker.string.uuid(),
      });
      this.createdProjects.push(project.id);
    }

    const thread: Thread = {
      thread_id: overrides.thread_id || faker.string.uuid(),
      project_id: project.id,
      account_id: project.account_id,
      created_at: new Date().toISOString(),
      ...overrides,
    };

    // Try to create via API (POST /threads endpoint)
    const apiUrl = process.env.API_URL || 'http://localhost:8000';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    // If API configured, try to create real thread
    if (supabaseUrl && !supabaseUrl.includes('your-test-project')) {
      try {
        // Use backend API to create thread (which also creates project if needed)
        // For now, we'll use mock data and let the test handle real API calls if needed
        const response = await fetch(`${apiUrl}/threads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Note: Auth token should be set by test context
          },
          body: JSON.stringify({ name: project.name }),
        });

        if (response.ok) {
          const created = await response.json();
          this.createdThreads.push(created.thread_id);
          return {
            thread_id: created.thread_id,
            project_id: created.project_id,
            account_id: project.account_id,
            created_at: new Date().toISOString(),
            project,
          };
        }
      } catch (error) {
        console.warn(`API thread creation failed, using mock: ${error}`);
      }
    }

    // Fallback: return mock thread (for offline testing)
    this.createdThreads.push(thread.thread_id);
    return {
      ...thread,
      project,
    };
  }

  /**
   * Cleanup all created threads and projects
   */
  async cleanup(): Promise<void> {
    // Cleanup threads
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl && !supabaseUrl.includes('your-test-project')) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          supabaseUrl,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        );
        
        for (const threadId of this.createdThreads) {
          try {
            await supabase.from('threads').delete().eq('thread_id', threadId);
          } catch (error) {
            console.warn(`Cleanup failed for thread ${threadId}: ${error}`);
          }
        }
      } catch (error) {
        console.warn(`Thread cleanup error: ${error}`);
      }
    }

    // Cleanup projects via factory
    await this.projectFactory.cleanup();
    
    this.createdThreads = [];
    this.createdProjects = [];
  }
}


