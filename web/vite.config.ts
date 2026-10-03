import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@smg/shared': path.resolve(dirname, '..', 'shared', 'src', 'index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5178', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:5178', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:5178', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
  },
});
