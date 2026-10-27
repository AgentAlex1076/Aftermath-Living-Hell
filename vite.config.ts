import { defineConfig } from 'vite';

// Relative base so the build works from /Aftermath-Living-Hell/site/ (main) or gh-pages root.
const base = process.env.GITHUB_PAGES === 'true' ? './' : '/';

export default defineConfig({
  base,
  server: {
    // Bind IPv4 explicitly — Chrome often resolves localhost → 127.0.0.1 first,
    // while Node/Vite default can listen only on ::1 and look "broken" in Chrome.
    host: '127.0.0.1',
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
