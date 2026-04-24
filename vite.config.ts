import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" &&
      import("lovable-tagger").then((m) => m.componentTagger()).catch(() => null),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // We intentionally do NOT define manualChunks here. Earlier we tried to
    // pre-group "vendor-canvas / vendor-charts / vendor-radix", but rollup
    // ended up hoisting React (and the JSX runtime) into the first vendor
    // chunk that happened to import it — the Sales Report bundle then tried
    // to resolve React out of `vendor-charts`, which crashed in production.
    // Vite's default per-route splitting (combined with our React.lazy()
    // route boundaries) already keeps the initial bundle small without the
    // fragile cross-chunk references.
  },
}));
