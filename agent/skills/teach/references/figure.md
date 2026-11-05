# Figure (Anatomy-style)

When a lesson needs to show how a system, algorithm or component works, build a crafted isometric SVG figure — the object is the explanation — not a boxes-and-arrows diagram.

## Kitchen

In `assets/figure/` of this skill:
- `iso-kit.mjs` — camera, solids, parts library, SVG renderer, card/page builders, `ISO_CSS`
- `iso.css` — the same CSS written out; import once, put `class="iso"` on `<body>` or wrapper
- `inline-kit.mjs` — `kitScript()` returns the kit as in-page source (Anatomy pattern)
- `build-template.mjs` — minimal Node build script; copy per lesson, fill the TODOs

```sh
node build-figure.mjs            # dark theme
node build-figure.mjs --light    # light theme (ships for every figure)
```

Use this skill's kit for lessons. For a standalone site figure, use the full Anatomy skill at https://github.com/wheresryan22/anatomy (needs Node 20.10+, Chrome for checks).

## The one idea

**The object is the explanation.** Invent a real, well-made physical thing whose working *is* the concept (a test rig, a dial gauge, a lock, a chest of drawers, a gantry plotter). Don't draw boxes, arrows and labels.

| Concept | Object |
|---|---|
| One shared resource serving many users | A gantry plotter: one print head visiting many wells |
| A cache key that skips work when nothing changed | A pin-tumbler lock: when every pin matches, the plug turns |
| Seven buffers of different sizes | A chest of seven drawers, each as deep as its bytes |
| A gauge / measurement | A dial indicator on a stand, needle one turn = known travel |

Failures: **too abstract** (floating slabs, labelled boxes) or **too flat** (one big slab, few lines). Fix both with a recognisable machine built from many small, precise parts.

## Workflow

1. **Size it.** Figure (one mechanism, 40–80 parts — default for lessons), Hero (80–150 parts). Never start an Epic; propose a Hero version instead. Have a working page within the first hour.
2. **Truth first.** Real numbers, sizes, thresholds. Write the model as a small pure module; every readout, caption number and moving part reads from it.
3. **Invent the object.** One sentence: what moves and what that motion means. Never copy a reference image — take its finish, not its object.
4. **Parts list.** ≥40 parts grouped: base (plate, feet, screws, label plate, ruler), structure (posts, rails, frame), mechanism (carriage, springs, plunger, needle), controls (knob, thumb screw), subject (the one lit part).
5. **Plan the world.** World units ≈ 1 px of the real thing. Plans as rounded rectangles `{x,y,w,d,r}` and circles. Camera: azimuth 45° default, elevation 30° (higher to look into something open). `fitProjection(points, w, h, { pad, azimuth })`.
6. **Build geometry once.** Precompute static paths with the kit (`slabOf`, `cylinder`, `extrude`, `topTicks`, `knurl`, `coil`, `radialTicks`). Moving parts built once at rest, moved with `translateAlong`.
7. **Paint back to front.** Sort with `depthOf`; split wrapping parts (springs around a rod, frame bars around a carriage). Moving parts drawn in the physical slot they sit in.
8. **Frame it.** Card corners: `Fig n` top-left, title top-right, hint bottom-left, live readout bottom-right. Legend keys + true caption under the card. At most one tiny engraved label inside the drawing.
9. **Make it live.** Calm eased motion, idle tour when untouched, pointer + keyboard response, still under `prefers-reduced-motion`, stop when offscreen.
10. **Verify like a critic.** Capture desktop + phone (390px), hover, several motion moments; 4× close-ups of every junction in both themes; read every PNG you make. See [verify.md](./verify.md).

## Craft rules (short form)

- **Solids, not wireframes.** Filled paper-colour parts, painted in order; no see-through edges, no dashed hidden lines.
- **Let the kit shade.** Four side tones by facing plus a lighter top. Tone hierarchy: base `lo`, structure `mid`, subject `hi`, exactly one accent `lit`. Colour only when colour is the subject.
- **Small precise detail.** Bevels 0.4–1.6, screws as 0.4–0.55 dots at plate corners, ruler ticks every 4–5 units with a major every 5th, label plate with three rule lines. Every detail belongs to a part.
- **Lines resolve.** Every line ends on a face, another line, or a terminal dot. No leader lines, balloons, dimension arrows or floating labels.
- **Volume + calm.** Real thickness, soft halo under the base, figure fills ~55–65% of the card, still reads at 390px.
