import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tailwindcss from "eslint-plugin-tailwindcss";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Пакет 4.x експортує лише configs.recommended, і це вже flat-конфіг.
  tailwindcss.configs.recommended,
  {
    settings: {
      // Обовʼязковий для Tailwind v4: плагін читає токени й утиліти з цього файлу.
      tailwindcss: { cssConfigPath: "./src/app/globals.css" },
    },
    rules: {
      // Порядок класів задає prettier-plugin-tailwindcss - два інструменти на
      // одну роботу тільки воювали б між собою.
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
