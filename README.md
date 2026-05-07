# Sliding Concrete — Interaction Capstone Experiment
**Adinata Harlan · ahar0603 · Graduation Studio 2025**

---

## Concept

A full-screen grid of sliding concrete blocks. The gaps between them are not empty — they are windows. When the front camera is active, the empty spaces reveal a live reflection of the viewer, making absence the most meaningful part of the composition.

The piece explores a tension between **mass and void**, **control and constraint**. Each block can only move in one direction — it slides along its own axis, displaced by the viewer's gesture. Nothing is freely placed. Everything negotiates with what surrounds it.

---

## Interaction

| Action | Result |
|---|---|
| Drag a block | Slides it one step in the allowed direction |
| Allow camera access | Empty spaces become mirrors of the viewer |
| Press `R` | Resets the puzzle to a new random arrangement |

Horizontal blocks slide left or right. Vertical blocks slide up or down. A block only moves if the adjacent space is clear.

---

## Aesthetics

- **Material:** Concrete texture, cropped uniquely per block using a deterministic seed
- **Palette:** Warm amber-brown gradient background, against a near-black ground
- **Light:** Movable blocks carry a soft white glow; locked blocks cast a heavier shadow
- **Accent:** One block per reset is marked — slightly brighter border, subtly distinguished

---

## Technical Notes

Built with [p5.js](https://p5js.org/).

- Grid dimensions adapt to window size, targeting 80px cells with 5px gaps
- Animation uses cubic ease-in-out over 220ms
- Camera feed is mirrored horizontally and cropped to fill the board (object-fit: cover behaviour)
- Touch and mouse input are both supported

---

## Running Locally

Open `index.html` in a browser. Camera access is requested on load — allow it to activate the mirror effect. No build step required.

---

*Part of A5 Final Design Poster & Artefact — Graduation Studio, Semester 3.*