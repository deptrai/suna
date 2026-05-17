import { describe, expect, it } from 'bun:test';

import { resolveTabFromPathname } from '@/lib/tab-route-resolver';

describe('resolveTabFromPathname', () => {
  it('resolves known static routes', () => {
    expect(resolveTabFromPathname('/dashboard')).toEqual({
      id: 'page:/dashboard',
      title: 'Dashboard',
      type: 'dashboard',
      href: '/dashboard',
    });

    expect(resolveTabFromPathname('/services/running')).toEqual({
      id: 'service-manager',
      title: 'Service Manager',
      type: 'services',
      href: '/service-manager',
    });
  });

  it('resolves dynamic session and terminal routes', () => {
    expect(resolveTabFromPathname('/sessions/abc-123')).toEqual({
      id: 'abc-123',
      title: 'Session',
      type: 'session',
      href: '/sessions/abc-123',
    });

    expect(resolveTabFromPathname('/terminal/pty-001')).toEqual({
      id: 'terminal:pty-001',
      title: 'Terminal',
      type: 'terminal',
      href: '/terminal/pty-001',
    });
  });

  it('resolves preview and tunnel routes', () => {
    expect(resolveTabFromPathname('/p/3001')).toEqual({
      id: 'preview:3001',
      title: 'Port 3001',
      type: 'preview',
      href: '/p/3001',
      metadata: { port: '3001' },
    });

    expect(resolveTabFromPathname('/tunnel/tun-42')).toEqual({
      id: 'page:/tunnel/tun-42',
      title: 'Tunnel',
      type: 'page',
      href: '/tunnel/tun-42',
    });
  });

  it('resolves files route and decodes path for title/id', () => {
    expect(resolveTabFromPathname('/files/folder%2Fmy%20file.ts')).toEqual({
      id: 'file:folder/my file.ts',
      title: 'my file.ts',
      type: 'file',
      href: '/files/folder%2Fmy%20file.ts',
    });
  });

  it('resolves task/project routes with decoded ids', () => {
    expect(resolveTabFromPathname('/tasks/task%201')).toEqual({
      id: 'task:task 1',
      title: 'Task',
      type: 'page',
      href: '/tasks/task%201',
    });

    expect(resolveTabFromPathname('/projects/my%20project')).toEqual({
      id: 'project:my project',
      title: 'my project',
      type: 'project',
      href: '/projects/my%20project',
    });
  });

  it('returns null for unknown or unsupported pathnames', () => {
    expect(resolveTabFromPathname('/unknown-route')).toBeNull();
    expect(resolveTabFromPathname('/sessions/abc/extra')).toBeNull();
  });
});
