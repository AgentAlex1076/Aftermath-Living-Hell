import { defineConfig } from 'vite';

// Project site: https://AgentAlex1076.github.io/Aftermath-Living-Hell/
const base = process.env.GITHUB_PAGES === 'true' ? '/Aftermath-Living-Hell/' : '/';

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
