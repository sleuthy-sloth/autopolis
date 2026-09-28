import { defineConfig } from 'vitest/config';

/**
 * Scoped config for `npm run test -w @autopolis/core` — keeps package-level
 * runs independent of the root workspace config (see vitest.config.mts).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});