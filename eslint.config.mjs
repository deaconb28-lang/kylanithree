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
    // Vendored third-party skills (see .claude/skills/README.md). Not this project's source, and
    // not this project's style to enforce — its CommonJS helper scripts trip `no-require-imports`
    // for no benefit, since nothing here ships to a browser or gets edited by hand.
    ".claude/skills/**",
  ]),
]);

export default eslintConfig;
