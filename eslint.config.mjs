import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const unusedVariables = {
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_",
  caughtErrorsIgnorePattern: "^_",
  ignoreRestSiblings: true,
};

export default defineConfig(
  globalIgnores([
    "**/node_modules/**",
    "dist/**",
    "build/**",
    "server/public/**",
    ".superpowers/**",
    ".worktrees/**",
    ".agents/**",
    ".codex/**",
    ".local/**",
    "attached_assets/**",
    "artifacts/**",
    "graphify-out/**",
  ]),
  {
    files: ["**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}"],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: "latest" },
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    files: ["**/*.{ts,cts,mts,tsx}"],
    extends: [tseslint.configs.recommended],
    rules: { "@typescript-eslint/no-unused-vars": ["error", unusedVariables] },
  },
  {
    files: ["**/*.{js,cjs,mjs,jsx}"],
    rules: { "no-unused-vars": ["error", unusedVariables] },
  },
  {
    files: [
      "*.{js,cjs,mjs,ts}",
      "server/**",
      "scripts/**",
      "sandbox/**",
      "**/*.test.{js,mjs,ts,tsx}",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["client/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    // This Node worker also contains the callback executed inside Playwright.
    files: ["scripts/collector/worker.mjs"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
