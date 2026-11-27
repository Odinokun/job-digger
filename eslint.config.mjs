import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tailwindcss from "eslint-plugin-tailwindcss";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Version 4.x exports only configs.recommended, and it is already a flat config.
  tailwindcss.configs.recommended,
  {
    settings: {
      // Required for Tailwind v4: the plugin reads tokens and utilities from this file.
      tailwindcss: { cssConfigPath: "./src/app/globals.css" },
    },
    rules: {
      // prettier-plugin-tailwindcss sets the class order - two tools for one job
      // would only fight each other.
      "tailwindcss/classnames-order": "off",
    },
  },
  // Last: turns off the ESLint rules that would fight Prettier.
  prettier,
  // Default ignores of eslint-config-next, restated because defineConfig replaces them.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
  ]),
]);

export default eslintConfig;
