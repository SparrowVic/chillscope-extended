import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue({ customElement: true })],
  // Vite leaves these to the consuming bundler in library mode, but Angular imports the built
  // file as an opaque module and never substitutes them, so the bundle has to resolve them itself.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    target: 'es2022',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'chillscope-chart.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
