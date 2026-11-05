---
name: teach
description: Teach the user a new skill or concept, within this workspace.
disable-model-invocation: true
argument-hint: "What would you like to learn about?"
---

The user has asked you to teach them something. This is a stateful request - they intend to learn the topic over multiple sessions.

## Teaching Workspace

Treat the current directory as a teaching workspace. Workspace paths (`./lessons/` and the rest) resolve from the directory `/teach` was run in; only the `*-FORMAT.md` links resolve from this skill's folder. The state of their learning is captured in this directory in several files:

- `MISSION.md`: A document capturing the _reason_ the user is interested in the topic. This should be used to ground all teaching. Use the format in [MISSION-FORMAT.md](./MISSION-FORMAT.md).
- `./reference/*.html`: A directory of reference materials. These are the compressed learnings from the lessons - client runtime telemetry overlay sheets, reference algorithms, syntax, yoga poses, glossaries. They are the raw units of learning. They should be beautiful documents which print out well, and are designed for quick reference.
- `RESOURCES.md`: A list of resources which can be explored to ground your teaching in contextual knowledge, or to acquire knowledge and wisdom. Use the format in [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
- `./learning-records/*.md`: A directory of learning records, which capture what the user has learned. These are loosely equivalent to architectural decision records in software development - they capture non-obvious lessons and key insights that may need to be revised later, or drive future sessions. These should be used to calculate the zone of proximal development. They are titled `0001-<dash-case-name>.md`, where the number increments each time. Use the format in [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).
- `./lessons/*.html`: A directory of lessons. A **lesson** is a single, self-contained HTML output that teaches one tightly-scoped thing tied to the mission. This is the primary unit of teaching in this workspace.
- `./assets/*`: Reusable **components** shared across lessons. See [Assets](#assets).
- `NOTES.md`: A scratchpad for you to jot down user preferences, or working notes.

## Philosophy

To learn at a deep level, the user needs three things:

- **Knowledge**, captured from high-quality, high-trust resources
- **Skills**, acquired through highly-relevant interactive lessons devised by you, based on the knowledge
- **Wisdom**, which comes from interacting with other learners and practitioners

Before the `RESOURCES.md` is well-populated, your focus should be to find high-quality resources which will help the user acquire knowledge. Never trust your parametric knowledge.

Some topics may require more skills than knowledge. Learning more about theoretical physics might be more knowledge-based. For yoga, more skills-based.

### Fluency vs Storage Strength

You should be careful to split between two types of learning:

- **Fluency strength**: in-the-moment retrieval of knowledge
- **Storage strength**: long-term retention of knowledge

Fluency can give the user an illusory sense of mastery, but storage strength is the real goal. Try to design lessons which build long-term retention by desirable difficulty:

- Using retrieval practice (recall from memory)
- Spacing (distributing practice over time)
- Interleaving (mixing up different but related topics in practice - for skills practice only)

### The lesson is the explanation

A good lesson is a real thing the user can see, touch and open — never a stack of abstract bullet points. Like a crafted figure, it should read at a glance as one clear idea (1×), and reward a closer look with precise detail (4×). If a paragraph can become a widget, a mini-simulator, a worked example or a checklist, it should.

Two ways a lesson fails, both seen in practice:

- **Too abstract.** A wall of theory with no object to hold onto. Fix: anchor it to one concrete machine, workflow, or real example whose working *is* the concept.
- **Too flat.** One big slab of text, no parts, nothing interactive. Fix: break it into knowledge + interaction + feedback, with citations.

## Workflow

Work in this order. Most of the teaching quality is decided in steps 1–4, before you write any lesson.

1. **Mission first.** If `MISSION.md` is missing or vague, interview the user until it is concrete: why, what changes in their life/work, what success looks like, constraints. Never start lessons without it. Confirm with the user before changing an existing mission.
2. **Resources before knowledge.** Search for, vet, and record high-trust sources in `RESOURCES.md` (Knowledge vs Wisdom sections). Every claim in every lesson cites one. Never teach from parametric memory.
3. **Size the session.** Name the tier before writing:
   - **Micro** (default): one idea, 5–15 min to finish. One lesson, one win.
   - **Lesson**: one skill with a feedback loop (quiz, exercise, guided steps). 15–45 min.
   - **Course arc**: several lessons building toward the mission. Propose the arc, build one lesson, continue across sessions.
   Have a working lesson file the user can open in the browser within the first session.
4. **Truth first.** Collect the real numbers, examples, and behaviours behind the topic. If the lesson will show data, code output, or a model, write it so the readout, quiz answers and captions all come from the same source — no hard-coded mismatches.
5. **Invent the anchor.** Pick one concrete object, workflow, or story whose mechanism maps one-to-one onto the concept. Say in one sentence what it does and what that means for the topic. Never copy a reference image or another course's lesson: take its rigour, not its object.
6. **Outline the lesson's parts.** List what the lesson must contain, grouped: hook (why this now), knowledge (minimum needed), interaction (quiz/simulator/steps), feedback (immediate, automatic where possible), primary source to read next, links to siblings. Each part earns its place; no decoration for its own sake.
7. **Plan the workspace.** Read `./assets/` and `NOTES.md` before authoring. Reuse the shared stylesheet and widgets already there. Create `MISSION.md`, `RESOURCES.md`, and the first lesson lazily — only what this session needs.
8. **Build the lesson.** Write `./lessons/0001-<dash-case-name>.html` (number increments). Self-contained, links the shared stylesheet in `./assets/`, cites sources inline, links to sibling lessons and `./reference/*` docs, recommends one primary source, and reminds the user to ask follow-up questions. Open the file for them if possible (CLI command).
9. **Make it live.** Every skill practice needs a tight feedback loop: quizzes with instant feedback, simulators, or guided real-world steps. Questions should have balanced answer positions and equal-length options — no formatting clues.
10. **Verify like a critic.** Before declaring a lesson done, re-read it the way a demanding reviewer would: open it in a browser (use `agent-browser` for screenshots when available), check desktop + phone widths, hover and every interactive state, confirm citations resolve, answers are balanced, and nothing is bare or unfinished at 4×. Iterate until it passes.

## Resources

Read these as you need them:

- [MISSION-FORMAT.md](./MISSION-FORMAT.md): how to write the mission that grounds every lesson.
- [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md): Knowledge vs Wisdom source curation.
- [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md): ADR-style records that drive the zone of proximal development.
- [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md): build a glossary as a reference doc when the topic has its own nomenclature; once created, adhere to it in every lesson.
- [references/figure.md](./references/figure.md): how to build an Anatomy-style isometric figure (the object is the explanation) for a lesson, with the built-in kit in `assets/figure/`.
- [references/verify.md](./references/verify.md): the lesson review checklist and browser capture steps.

## Craft rules (short form)

- **One idea per lesson.** A lesson that teaches two things teaches neither. If it grows past one win, split it.
- **Citations everywhere.** Every non-obvious claim links to a `RESOURCES.md` source. No uncited assertions.
- **A shared stylesheet is the first asset.** Every lesson links it, so the course looks like one course, not a pile of one-offs.
- **Reuse beats inline.** New reusable widget or simulator → component in `./assets/`, linked by the next lesson. Never inline code a future lesson would duplicate.
- **Terms resolve.** New jargon goes in the glossary (if one exists) with a tight definition; every lesson uses the same terms the same way.
- **No clues in quizzes.** Equal word/character counts per answer, varied correct positions, no bold/ordering hints.
- **Beautiful and printable.** Clean typography (think Tufte), quick-reference layout. Lessons are rarely revisited; reference docs are — design them to be returned to.
- **Figures are crafted, not diagrams.** A lesson figure is a real machine whose working *is* the concept (Anatomy: the object is the explanation), built with `assets/figure/iso-kit.mjs`: 40–80 parts for a Figure, four-tone shading, exactly one `lit` accent, lines that resolve, card frame with Fig/title/hint/readout. See [references/figure.md](./references/figure.md). No floating slabs, no boxes-and-arrows, no wireframes.

## Lessons

A lesson is the main thing you produce: the unit in which knowledge and skills reach the user. Each lesson is one self-contained HTML file, saved to `./lessons/` and titled `0001-<dash-case-name>.html` where the number increments each time.

A lesson should be **beautiful**, with clean, readable typography and layout, since the user will return to these later to review. Think Tufte. When the concept is a system, mechanism, or spatial idea, embed a crafted isometric figure (built with `assets/figure/iso-kit.mjs`, see [references/figure.md](./references/figure.md)) instead of a diagram: the figure lives in the lesson as a framed live card, with a true caption and legend under it. If an illustration would help but a full figure is overkill, prefer a small simulator or widget from `./assets/` over a generated raster image.

The lesson should be short, and completable very quickly. Learners' working memory is very small, and we need to stay within it. But each lesson should give the user a single tangible win that they can build on. It should be directly tied to the mission, and should be in the user's zone of proximal development.

If possible, open the lesson file for the user by running a CLI command.

Each lesson should link via HTML anchors to other lessons and reference documents.

Each lesson should recommend a primary source for the user to read or watch. This should be the most high-quality, high-trust resource you found on the topic.

Each lesson should contain a reminder to ask followup questions to the agent. The agent is their teacher, and can assist with anything that's unclear.

## Assets

Lessons are built from reusable **components**, stored in `./assets/`: stylesheets, quiz widgets, simulators, diagram helpers, and anything else a second lesson could reuse.

Reuse is the default, not the exception. Before authoring a lesson, read `./assets/` and build from the components already there. When a lesson needs something new and reusable, write it as a component in `./assets/` and link to it; never inline code a future lesson would duplicate.

A shared stylesheet is the first component every workspace earns: every lesson links it, so the lessons look like one consistent course rather than a pile of one-offs. As the workspace grows, so should the component library.

## The Mission

Every lesson should be tied into the mission - the reason that the user is interested in learning about the topic.

If the user is unclear about the mission, or the `MISSION.md` is not populated, your first job should be to question the user on why they want to learn this.

Failing to understand the mission will mean knowledge acquisition is not grounded in real-world goals. Lessons will feel too abstract. You will have no way of judging what the user should do next.

Missions may change as the user develops more skills and knowledge. This is normal - make sure to update the `MISSION.md` and add a learning record to capture the change. Confirm with the user before changing the mission.

## Zone Of Proximal Development

Each lesson, the user should always feel as if they are being challenged 'just enough'.

The user may specify an exact thing they want to learn. If they don't, figure out their zone of proximal development by:

- Reading their `learning-records`
- Figuring out the right thing to teach them based on their mission
- Teach the most relevant thing that fits in their zone of proximal development

## Knowledge

Lessons should be designed around a skill the user is going to learn. The knowledge in the lesson should be only what's required to acquire that skill. You teach the knowledge first, then get the user to practice the skills via an interactive feedback loop.

Knowledge should first be gathered from trusted resources. Use `RESOURCES.md` to keep track of them. Lessons should be littered with citations - links to external resources to back up any claim made. This increases the trustworthiness of the lesson.

For acquiring knowledge, difficulty is the enemy. It eats working memory you need for understanding.

## Skills

If knowledge is all about acquisition, skills are about durability and flexibility. Make the knowledge stick.

For skill acquisition, difficulty is the tool. Effortful retrieval is what builds storage strength. Skills should be taught through interactive lessons. There are several tools at your disposal:

- Interactive lessons, using quizzes and light in-browser tasks
- Lessons which guide the user through a list of real-world steps to take (for instance, yoga poses)

Each of these should be based on a **feedback loop**, where the user receives feedback on their performance. This feedback loop should be as tight as possible, giving feedback immediately - and ideally automatically.

For quizzes, each answer should be exactly the same number of words (and characters, if possible). Vary which position holds the correct answer across questions. Don't give the user any clues about the answer through formatting or order.

## Acquiring Wisdom

Wisdom comes from true real-world interaction - testing your skills outside the learning environment.

When the user asks a question that appears to require wisdom, your default posture should be to attempt to answer - but to ultimately delegate to a **community**.

A community is a place (online or offline) where the user can test their skills in the real world. This might be a forum, a subreddit, a real-world class (budget permitting) or a local interest group.

You should attempt to find high-reputation communities the user can join. If the user expresses a preference that they don't want to join a community, respect it. Do not let the user skip the drill: if they try to close out early, push back gently and finish the feedback loop first.

## Reference Documents

While creating lessons, you should also create reference documents. Lessons can reference these documents - they are useful for tracking raw units of knowledge useful across lessons.

Lessons will rarely be revisited later - reference documents will be. They should be the compressed essence of the lesson, in a format designed for quick reference.

Some learning topics lend themselves to reference:

- Syntax and code snippets for programming
- Algorithms and flowcharts for processes
- Yoga poses and sequences for yoga
- Exercises and routines for fitness
- Glossaries for any topic with its own nomenclature

Glossaries, in particular, are an essential reference. Once one is created, it should be adhered to in every lesson.

## `NOTES.md`

The user will sometimes express preferences of how they want to be taught, or things you should keep in mind. This is the place to record those preferences, so you can refer back to them when designing lessons or working with the user.

## Figures in lessons (Anatomy-style)

When a lesson explains a system, algorithm, component, or mechanism, prefer a crafted isometric figure over a diagram. The figure ships in the lesson as a live framed card. Use the built-in kit in this skill's `assets/figure/` — no new dependency, no external service:

- `iso-kit.mjs`: camera, solids, parts library, SVG renderer, `plateHtml`/`pageHtml` card builders
- `iso.css`: the kit's stylesheet (dark + light themes)
- `inline-kit.mjs`: `kitScript()` inlines the kit into the built page (Anatomy pattern)
- `build-template.mjs`: copy per figure, fill the TODOs, run `node build-figure.mjs` (and `node build-figure.mjs --light`)

Workflow for a figure: truth first (real numbers, pure model module) → invent the object (one sentence: what moves, what it means) → parts list (≥40 parts: base, structure, mechanism, controls, subject) → plan world + camera (azimuth 45°, elevation 30°) → precompute static geometry → paint back-to-front with `depthOf` → frame the card (Fig, title, hint, live readout, legend, true caption) → make it live (eased motion, idle tour, pointer + keyboard, reduced-motion still) → verify (desktop + phone screenshots, 4× close-ups, both themes).

Full rules, parts vocabulary, and anti-patterns: [references/figure.md](./references/figure.md) and [references/verify.md](./references/verify.md). For a standalone site figure beyond a lesson, use the full Anatomy skill: https://github.com/wheresryan22/anatomy (needs Node 20.10+, Chrome for checks).
