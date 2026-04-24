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
    // Split very heavy/rarely-used libraries into their own chunks so they
    // are cached independently and never block the initial app render.
    // Chunks only download the first time a page that needs them is opened.
    rollupOptions: {
      output: {
        manualChunks: {
          // Canvas + PDF: only used inside report pages and the merged-PDF export
          "vendor-canvas": ["fabric", "html2canvas", "jspdf"],
          // Charts: only used by recharts-backed dashboards
          "vendor-charts": ["recharts"],
          // Radix UI primitives ship a lot of small files — group them
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
}));
