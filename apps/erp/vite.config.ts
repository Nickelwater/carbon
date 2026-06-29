import {
  applyDotenvToProcessEnv,
  devServerLanServerConfig,
} from "@carbon/dev/vite";
import { lingui } from "@lingui/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig, PluginOption } from "vite";
import babelMacros from "vite-plugin-babel-macros";

export default defineConfig(({ isSsrBuild, mode }) => {
  applyDotenvToProcessEnv(mode, __dirname);

  return {
    build: {
      minify: true,
      rolldownOptions: {
        onwarn(warning, defaultHandler) {
          if (warning.code === "SOURCEMAP_ERROR") {
            return;
          }

          defaultHandler(warning);
        },
        ...(isSsrBuild && { input: "./server/app.ts" }),
      },
    },
    define: {
      global: "globalThis",
    },
    ssr: {
      external: ["@napi-rs/canvas", "pdfjs-dist"],
      noExternal: [
        "react-tweet",
        "react-dropzone",
        "react-icons",
        "react-phone-number-input",
        "tailwind-merge",
      ],
    },
    optimizeDeps: {
      exclude: ["@napi-rs/canvas", "pdfjs-dist"],
      // Wait for the first dependency crawl to finish before pre-bundling.
      // Avoids partial optimize passes + "file does not exist in .vite/deps"
      // when the browser loads while Vite is still rebundling (common on LAN).
      holdUntilCrawlEnd: true,
      // Pre-bundle transitive deps of react-phone-number-input / react-dropzone
      // so the first form page does not trigger a second optimize + full reload.
      include: [
        "attr-accept",
        "classnames",
        "country-flag-icons/react/3x2",
        "country-flag-icons/unicode",
        "file-selector",
        "input-format/react",
        "libphonenumber-js/core",
        "libphonenumber-js/min/metadata",
        "prop-types",
      ],
    },
    server: {
      port: 3000,
      strictPort: true,
      allowedHosts: [".ngrok-free.app", ".ngrok-free.dev", ".dev", ".localhost"],
      watch: {
        awaitWriteFinish: { stabilityThreshold: 250 },
      },
      ...devServerLanServerConfig(),
    },
    plugins: [
      tailwindcss(),
      babelMacros(),
      lingui(),
      reactRouter(),
    ] as PluginOption[],
    resolve: {
      tsconfigPaths: true,
      alias: {
        /**
         * Konva's Node entry (`index-node.js`) requires native `canvas`. Vite SSR
         * can still load that graph; alias `canvas` to a stub (do not alias the
         * whole `konva` package — react-konva imports `konva/lib/Core.js`, etc.).
         */
        canvas: path.resolve(__dirname, "app/ssr-shims/canvas-stub.cjs"),
        "@carbon/utils": path.resolve(
          __dirname,
          "../../packages/utils/src/index.ts",
        ),
        "@carbon/form": path.resolve(
          __dirname,
          "../../packages/form/src/index.tsx",
        ),
      },
    },
  };
});
