import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

let packageJson;
try {
  packageJson = require.resolve("pdfjs-dist/package.json");
} catch {
  process.exit(0);
}

const source = join(dirname(packageJson), "build", "pdf.worker.min.mjs");
if (!existsSync(source)) process.exit(0);

const destinationDir = join(process.cwd(), "public");
mkdirSync(destinationDir, { recursive: true });
copyFileSync(source, join(destinationDir, "pdf.worker.min.mjs"));
