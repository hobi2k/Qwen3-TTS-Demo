import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendPort = process.env.BACKEND_PORT || "8190";
const apiTarget = process.env.VITE_API_TARGET || `http://127.0.0.1:${backendPort}`;
const proxy = {
  "/api": {
    target: apiTarget,
    changeOrigin: true,
  },
  "/files": {
    target: apiTarget,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy,
  },
});
