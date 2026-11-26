import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Standalone harness: its own root (this directory), the repo's src imported
// from above it, no backend. Port 4391 so it can run beside `npm run dev`.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: here,
    plugins: [react()],
    server: {
        port: 4391,
        strictPort: true,
        // The scenarios import ../src, which is outside this root.
        fs: { allow: [path.resolve(here, '..'), here] }
    }
});
