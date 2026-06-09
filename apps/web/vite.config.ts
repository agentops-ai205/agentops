import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    modulePreload: {
      polyfill: false
    }
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173)
  },
  preview: {
    port: 4173
  }
});
