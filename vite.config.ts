import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The deployed commit, so an old tab can tell a new deploy is out.
  define: {
    __OW_BUILD__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 12).toLowerCase()),
  },
});
