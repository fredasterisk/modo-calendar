import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'demo/**'],
      outDir: 'dist',
      tsconfigPath: './tsconfig.json',
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ModoCalendar',
      fileName: (format) => `modo-calendar.${format}.js`,
    },
    rollupOptions: {
      output: {
        assetFileNames: 'modo-calendar.[ext]',
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
  },
});
