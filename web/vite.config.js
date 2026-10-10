import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite builds and serves the React site.
// In development, requests to /api/... are forwarded to the Python server
// (api.py), so the browser only ever talks to one address and the API key
// never goes near the browser.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
