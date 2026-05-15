# Wall — Sliding Stone Blocks
**Adinata Harlan · ahar0603 · Graduation Studio 2025**

---

## Concept

A full-screen stone wall (8×8 running bond) where each brick can be slid horizontally to open a hole. When the front camera is active, the hole becomes a live window to whoever stands on the other side — connection through obstruction.

---

## Interaction

| Action | Result |
|---|---|
| Drag a brick | Slides it open, revealing the camera behind |
| Release | Brick stays open, auto-closes after 12 s |
| Open more bricks | Up to 15 open simultaneously; oldest closes when a 16th is opened |
| Leave it alone | Idle animation peeks 3 centre bricks; auto-reactivates 5 s after all bricks close |

---

## Depth Effect

Each brick has 7 stone layers with fixed parallax ratios (100% → 86.5% in 2.25% steps). All layers move in sync when dragged; the cascade wave plays on release. A sliding brick's front face renders over its neighbour rather than clipping at the cell edge.

---

## Sound

Synthesised with Web Audio API — no external files.

| Sound | Trigger |
|---|---|
| Stone scrape | While dragging, scales with speed |
| Low thud | On release |
| Soft creak | When idle auto-opens |

---

## Technical

- Vanilla Canvas 2D + Web Audio API, no frameworks
- Running bond: odd rows offset by half a brick width
- Textures: `Texturelabs_Concrete_147S.jpg` — unique crop per cell via deterministic seed
- Camera: cover-cropped, horizontally mirrored (selfie orientation)

---

## Running

Open `index.html` in any modern browser. Allow camera access when prompted.

---

*Graduation Studio — Semester 3.*
