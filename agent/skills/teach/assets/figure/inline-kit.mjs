import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (f) => readFileSync(join(HERE, f), "utf8").replace(/^export /gm, "");
// For lessons: kitScript() returns the iso kit as in-page source (Anatomy pattern).
export function kitScript(){ return strip("iso-kit.mjs"); }
