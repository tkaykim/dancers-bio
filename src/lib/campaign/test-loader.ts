import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const nodeRequire = createRequire(path.resolve("package.json"));
// All external side effects must be explicit mocks. No credentials or live DB.
export function loadModule<T>(
  file: string,
  mocks: Record<string, unknown> = {},
  globals: Record<string, unknown> = {},
): T {
  const filename = path.resolve(file);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiled = {
    exports: {},
  };
  vm.runInNewContext(
    code,
    {
      exports: compiled.exports,
      module: compiled,
      require(name: string) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === "server-only") return {};
        if (
          name.startsWith("@/") ||
          name.startsWith(".") ||
          name.startsWith("next/")
        )
          throw new Error(`Unmocked dependency: ${name}`);
        return nodeRequire(name);
      },
      process: {
        env: {},
      },
      URL,
      AbortController,
      AbortSignal,
      setTimeout,
      clearTimeout,
      Date,
      ...globals,
    },
    {
      filename,
    },
  );
  return compiled.exports as T;
}
