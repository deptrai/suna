import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import { z } from 'zod';

export const docs: any = defineDocs({
  dir: 'content/docs',
});

export default defineConfig();
