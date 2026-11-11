import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// El backend real toma el puerto de .env (PORT=3001 por defecto del repo).
// Se puede forzar con VITE_BACKEND_URL al levantar el dev server.
const BACKEND = process.env.VITE_BACKEND_URL ?? `http://localhost:${process.env.PORT ?? '3001'}`;

// La app nueva se sirve bajo /app para convivir con la UI legacy (strangler).
// En dev usamos la raíz del dev-server (5173) y proxeamos la API al Express.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/app/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // Permitir importar los tokens compartidos desde ../public/css
      allow: ['..'],
    },
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/uploads': { target: BACKEND, changeOrigin: true },
      '/screenshots': { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}));
