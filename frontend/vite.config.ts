import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Porta fixa: o Django só confia na origem localhost:5173 (CSRF). Com a 5173 ocupada, o Vite deve FALHAR
    // em vez de subir em silêncio em outra porta (5174...), onde o login e o salvar tratativa não funcionam.
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
      '/static': 'http://localhost:8000',
    },
  },
});
