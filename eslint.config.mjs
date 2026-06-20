import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/.next/",
      "**/coverage/",
      "packages/frontend/next-env.d.ts",
    ],
  },

  // Base config for all TS/JS files
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Allow underscore-prefixed unused vars
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Node.js files (api, scripts, config files)
  {
    files: ["packages/api/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Shared package
  {
    files: ["packages/shared/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Frontend package
  {
    files: ["packages/frontend/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    languageOptions: {
      globals: globals.browser,
    },
  },

  // Config files (CommonJS)
  {
    files: ["**/*.config.{js,mjs}", "**/jest.config.js", "**/postcss.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Relax rules for test files
  {
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
