import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Deliberately not extending vite.config.ts: the library build settings there are irrelevant here.
// The Vue plugin is still required for the focused custom-element behaviour spec.
export default defineConfig({
  plugins: [vue({ customElement: true })],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
