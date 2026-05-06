import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // react-hooks 7.x flags any function called from an effect that calls setState
      // internally — this blocks the established useEffect+async-fetch pattern.
      // The pattern is valid; disable until the project migrates to React Query / Suspense.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
