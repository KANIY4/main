import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    // The workflow suite boots a PostgreSQL cluster and walks the whole
    // commercial flow; it needs longer than a unit test.
    testTimeout: 120_000,
    hookTimeout: 240_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      // `defaults.ts` is starter configuration data, not logic; `types` is declarations only.
      exclude: [
        '**/index.ts',
        '**/*.test.ts',
        'packages/types/**',
        '**/defaults.ts',
        // Covered by the integration suite against a real database rather than
        // by unit coverage; counting them here would report a misleading number.
        'packages/database/**',
        'packages/workflow/**',
        'packages/auth/src/service.ts',
        'packages/email/**',
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
