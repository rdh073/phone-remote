import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/**/tests/**/*.test.{ts,tsx}', 'packages/**/tests/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['apps/web/**', 'happy-dom']],
  },
});
