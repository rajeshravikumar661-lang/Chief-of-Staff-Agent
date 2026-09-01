import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * Flat config for Next.js 15 + TypeScript.
 *
 * `next/core-web-vitals` + `next/typescript` via the compat layer. A few rules
 * that would otherwise produce hundreds of findings across this codebase are
 * dialled down to `warn` so `npm run lint` stays useful signal, not noise.
 */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "**/*.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
