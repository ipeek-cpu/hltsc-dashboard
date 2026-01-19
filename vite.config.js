import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

// In dev/browser mode, alias Tauri packages to stubs
const tauriStubs = path.resolve('./src/lib/stubs/tauri-stubs.ts');

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5555
  },
  resolve: {
    alias: {
      '@tauri-apps/plugin-updater': tauriStubs,
      '@tauri-apps/plugin-dialog': tauriStubs,
      '@tauri-apps/plugin-process': tauriStubs,
      '@tauri-apps/plugin-shell': tauriStubs,
      '@tauri-apps/plugin-notification': tauriStubs,
      '@tauri-apps/plugin-opener': tauriStubs,
      '@tauri-apps/api/event': tauriStubs,
      '@tauri-apps/api': tauriStubs
    }
  }
});
