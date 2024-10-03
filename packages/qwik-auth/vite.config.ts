import { qwikVite } from '@qwik.dev/core/optimizer';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    build: {
      minify: false,
      target: 'es2020',
      outDir: 'lib',
      lib: {
        entry: ['./src/index.ts'],
        formats: ['es', 'cjs'],
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rollupOptions: {
        external: ['@qwik.dev/core', '@qwik.dev/city', '@qwik.dev/core/build', '@auth/core'],
      },
    },
    plugins: [qwikVite()],
  };
}) as any;
