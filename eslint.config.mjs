import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compiled output, not source. `.worker-build` is CommonJS emitted by tsc for the Railway
    // worker and `.test-build` is the offline test build — linting either just reports on the
    // compiler's own output.
    ".worker-build/**",
    ".test-build/**",
  ]),
]);

export default eslintConfig;
