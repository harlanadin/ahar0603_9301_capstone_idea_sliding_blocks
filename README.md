# Wall — Sliding Stone Blocks
**Adinata Harlan · ahar0603 · Graduation Studio 2025**

---

## Concept

A full-screen stone wall rendered as a 4 × 4 running-bond grid. Each brick is a thick slab — five layers deep — and can be slid horizontally to open a hole through the wall. When the front camera is active, the hole becomes a window: the viewer on one side sees live footage of whoever stands on the other.

The piece is about **connection through obstruction**. The wall is not a barrier to be broken — it is a surface to be negotiated. A single gesture reveals a passage; releasing it allows the stone to slowly close again.

---

## Interaction

| Action | Result |
|---|---|
| Drag a brick left or right | Slides it open, revealing the camera feed behind |
| Release | Brick stays open; drag again to reposition or push it back |
| Touch a third brick | The oldest open brick closes; the new one opens |
| Idle (no touch) | One random brick opens and closes on its own, then another |

Up to **two bricks** can be open simultaneously. Opening a third automatically closes the first.

---

## Depth Effect

Each brick is composed of **five stone layers** rendered back-to-front with parallax offsets:

| Layer | Parallax | Overlay |
|---|---|---|
| L1 — front face | 100 % | darkest |
| L2 | 95.5 % | ↓ |
| L3 | 91.0 % | ↓ |
| L4 | 86.5 % | ↓ |
| L5 — back face | 82.0 % | lightest |

Because each layer moves a fixed fraction of L1's offset — never the same distance — the wall reads as a thick physical slab rather than layered paper. The visible strip between each layer is narrow (~4.5 % of brick width), giving a tight, receding cross-section when a brick is open.

Each face is also given a top-edge highlight, a bottom-edge shadow, and a mortar joint line to reinforce the sense of volume.

---

## Sound

All audio is synthesised with the Web Audio API — no external files.

| Sound | Trigger |
|---|---|
| Stone scrape | While dragging; amplitude scales with drag speed |
| Low thud | On release |
| Soft creak | When idle auto-opens a brick |

---

## Aesthetics

- **Pattern:** Stretcher / running bond — odd rows offset by half a brick width, with decorative half-bricks completing both edges
- **Texture:** Single concrete texture (`Texturelabs_Concrete_147S.jpg`) cropped uniquely per cell via deterministic seed — every brick reads as a distinct piece of the same stone
- **Background:** Dark warm tone with radial amber glow; replaced by live mirrored camera feed when access is granted
- **Camera:** Cover-cropped and horizontally mirrored (selfie orientation)

---

## Technical Notes

Built with vanilla Canvas 2D API and Web Audio API. No frameworks or build step.

- Grid: 4 columns × 4 rows, stretcher bond arrangement
- Brick size fills the full viewport; dimensions recalculate on resize
- Layer physics: all five layers lerp at the same speed (`LERP = 0.12`); depth is purely from fixed parallax ratios, not time-lag
- Idle state machine: `waiting → opening → holding → closing → waiting`; one brick at a time, no two bricks cycle simultaneously
- Touch and mouse input both supported

---

## Running Locally

Open `index.html` in any modern browser. Allow camera access when prompted to activate the live window effect. No installation required.

---

*Part of A5 Final Design Poster & Artefact — Graduation Studio, Semester 3.*
