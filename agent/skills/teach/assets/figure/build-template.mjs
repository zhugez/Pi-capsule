import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./iso-kit.mjs";
import { kitScript } from "./inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 600, HEIGHT = 380;

// TODO: truth first — real numbers for your topic
const PLATE = { x: -128, y: -64, w: 262, d: 128, r: 8 };

// TODO: invent the object — a machine whose working IS the concept
// Parts list: base, structure, mechanism, controls, subject (40-80 parts for a Figure)

const P = k.fitProjection(k.boxCorners(PLATE, -12, 0), WIDTH, HEIGHT, { pad: 30, azimuth: 42 });

function draw() {
  const parts = [];
  parts.push(k.solidSvg(k.slabOf(PLATE, -12, 12, P, 8, 1.6), { tone: "mid", halo: true }));
  return parts.join("");
}

const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: "TODO: accessible label", body: draw() });
const body = k.plateHtml({
  fig: "Fig 1", title: "TODO: title", hint: "Hover / drag to interact",
  readout: "TODO: live value",
  keys: [{ mark: "lit", label: "TODO: what moves" }],
  caption: "TODO: true caption explaining the concept.",
  body: `<div class="iso-stage" tabindex="0">${svg}</div>`,
});
writeFileSync(join(HERE, theme === "light" ? "figure-light.html" : "figure.html"),
  k.pageHtml({ title: "TODO", theme, body, script: kitScript() }));
console.log("wrote figure" + (theme === "light" ? "-light" : "") + ".html");
