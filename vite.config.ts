import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// App identity surfaced on the Settings > About tab. Bumping package.json's
// version here keeps the About screen honest without pulling in node typings.
const APP_VERSION = "0.1.0";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD__: JSON.stringify("local"),
  },
});
