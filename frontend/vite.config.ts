import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3210',
      '/ws': {
        target: 'ws://localhost:3210',
        ws: true,
      },
      '/healthz': 'http://localhost:3210',
      '/readyz': 'http://localhost:3210',
    },
  },
});
