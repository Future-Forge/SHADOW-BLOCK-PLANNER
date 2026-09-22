import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true, // Listen on all local IPv4 and IPv6 addresses (127.0.0.1, LAN)
      port: 5173,
    },
    preview: {
      host: true,
      port: 5173,
    },
    define: {
      'import.meta.env.VITE_CARTO_API_KEY': JSON.stringify(
        env.VITE_CARTO_API_KEY || env.CARTO_API_KEY || '',
      ),
    },
  };
});
