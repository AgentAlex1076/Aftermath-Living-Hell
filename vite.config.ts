import { defineConfig } from 'vite';

// Relative base so the build works from /Aftermath-Living-Hell/site/ (main) or gh-pages root.
const base = process.env.GITHUB_PAGES === 'true' ? './' : '/';

export default defineConfig({
  base,
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
