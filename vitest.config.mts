import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Root vitest workspace (Phase 2 test lanes). Run with `vitest run` at the
 * repo root.
 *
 * Projects:
 *   - core    packages/core  — simulation core (node)
 *   - server  apps/server    — engine + agent pipeline (node)
 *   - client  apps/client    — React viewport smoke tests (jsdom)
 *
 * Client tests live in `apps/client/src` (files ending `.test.ts` / `.test.tsx`)
 * and in `apps/client/test`. jsdom is a devDependency of @autopolis/client.
 *
 * Each package also ships its own small vitest config so `npm run test -w
 * <pkg>` stays scoped to that package (vitest picks the nearest config).
 */
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        root: path.join(here, 'packages/core'),
        test: {
          name: 'core',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        root: path.join(here, 'apps/server'),
        test: {
          name: 'server',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        root: path.join(here, 'apps/client'),
        test: {
          name: 'client',
          environment: 'jsdom',
          setupFiles: ['test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});