# Sliding Metal — Interaction Capstone Experiment
**Adinata Harlan · ahar0603 · Graduation Studio 2025**

---

## Concept

A full-screen grid of sliding metal blocks. The gaps between them are not empty — they are windows. When the front camera is active, the empty spaces reveal a live reflection of the viewer, making absence the most meaningful part of the composition.

The piece explores a tension between **mass and void**, **control and constraint**. Each block negotiates with what surrounds it — it can only move into an adjacent empty slot, displaced by the viewer's gesture. Nothing is freely placed. Everything is in relation.

---

## Interaction

| Action | Result |
|---|---|
| Drag a block | Slides it one step in any open direction |
| Allow camera access | Empty spaces become mirrors of the viewer |
| Press `R` | Resets the puzzle to a new random arrangement |

Square blocks can slide in all four directions — whichever adjacent slot is free. A block only moves if the space it is moving into is clear.

---

## Aesthetics

- **Material:** Two metal textures, each cropped uniquely per block using a deterministic seed — creating a mosaic of distinct surface readings from a shared material
- **Palette:** Dark steel-blue gradient background against a near-black ground
- **Light:** Movable blocks carry a soft cool glow; locked blocks cast a heavier shadow
- **Accent:** One block per reset is marked — gold-tinted border, subtly distinguished from the rest

---

## Technical Notes

Built with [p5.js](https://p5js.org/).

- Grid fills the full window; cell dimensions adapt independently to width and height
- Blocks are large square tiles (~160px) with a 2px gap, giving a tight, dense composition
- Only 4 cells are left empty per reset, maximising the sense of mass
- Animation uses cubic ease-in-out over 220ms
- Camera feed is mirrored horizontally and cropped to fill the board (object-fit: cover behaviour)
- Touch and mouse input are both supported

---

## Running Locally

Open `index.html` in a browser. Camera access is requested on load — allow it to activate the mirror effect. No build step required.

---

*Part of A5 Final Design Poster & Artefact — Graduation Studio, Semester 3.*
