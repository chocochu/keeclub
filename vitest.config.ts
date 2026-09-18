import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { AI_PROVIDER: 'typesafe', TYPESAFE_API_KEY: 'test-key' } },
    }),
  ],
  test: { setupFiles: ['./worker-tests/setup.ts'], include: ['worker-tests/**/*.test.ts'] },
});
