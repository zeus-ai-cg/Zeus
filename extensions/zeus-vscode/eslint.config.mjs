// Flat ESLint config (ESLint 9) for the Zeus AI VS Code extension.
// TypeScript + Node context. No React/browser globals here — this package
// runs in the VS Code extension host (Node), never in a browser.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "*.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // VS Code API types frequently have deliberate unused params in
      // callbacks — keep the rule but allow leading-underscore names.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
