/* global process, URL */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function isLocalhostOrLoopback(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  try {
    const URLConstructor = typeof URL !== 'undefined' ? URL : globalThis.URL;
    const parsed = new URLConstructor(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    const lower = trimmed.toLowerCase();
    return (
      lower.includes('localhost') ||
      lower.includes('127.0.0.1') ||
      lower.includes('0.0.0.0') ||
      lower.includes('::1')
    );
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL;

  if (command === 'build' && mode === 'production') {
    if (!apiUrl || !apiUrl.trim()) {
      throw new Error(
        '[CommerceFlow Build Error] VITE_API_BASE_URL is required for production builds. ' +
        'Please supply a valid production API URL (e.g. VITE_API_BASE_URL=https://example.com/api/v1).'
      );
    }

    if (isLocalhostOrLoopback(apiUrl.trim())) {
      throw new Error(
        `[CommerceFlow Build Error] Invalid VITE_API_BASE_URL for production build: "${apiUrl.trim()}". ` +
        'Production builds must not point to localhost or loopback endpoints. ' +
        'Please supply a valid public production API URL (e.g. VITE_API_BASE_URL=https://example.com/api/v1).'
      );
    }
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
  };
});
