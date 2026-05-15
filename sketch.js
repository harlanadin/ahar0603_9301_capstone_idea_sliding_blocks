'use strict';

// ——— CONFIG ———
const COLS = 8, ROWS = 8, N = COLS * ROWS;

const LAYER_OVERLAY  = [
  'rgba(18,14,10,0.64)',  // L1 — front, deepest shadow
  'rgba(18,14,10,0.54)',  // L2
  'rgba(18,14,10,0.44)',  // L3
  'rgba(18,14,10,0.34)',  // L4
  'rgba(18,14,10,0.24)',  // L5
  'rgba(18,14,10,0.14)',  // L6
  'rgba(18,14,10,0.04)'   // L7 — back, nearest light
];
const LAYER_FALLBACK = ['#363028', '#3e3830', '#464038', '#504540', '#5a4f4a', '#645a54', '#706860'];
const EDGE_HIGHLIGHT = 'rgba(255,248,230,0.38)';
const LERP1 = 0.12;

// ——— STATE ———
const o1 = new Float32Array(N);
const o2 = new Float32Array(N);
const o3 = new Float32Array(N);
const o4 = new Float32Array(N);
const o5 = new Float32Array(N);
const o6 = new Float32Array(N);
const o7 = new Float32Array(N);
const t1 = new Float32Array(N);

let idleMode      = true;
let idlePhase     = 'waiting'; // 'waiting' | 'opening' | 'holding' | 'closing'
let idleBlocks    = []; // current cluster of auto-opening bricks
let idleTarget    = 0;
let idleTimestamp = Date.now() + 1200;
let dragState     = null;
let openCells     = []; // [{ index, openedAt }] — max 12 open, auto-close after 10 s
let allClosedSince = Date.now(); // tracks when openCells last became empty

// ——— CANVAS ———
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

// ——— TEXTURE ———
const texStone = new Image();
let   texLoaded = false;
texStone.onload = () => { texLoaded = true; };
texStone.src    = 'images/Texturelabs_Concrete_147S.jpg';

// ——— CAMERA ———
const video = document.createElement('video');
video.setAttribute('playsinline', '');
video.muted = true;
let cameraReady = false;

if (navigator.mediaDevices?.getUserMedia) {
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false })
    .then(stream => {
      video.srcObject = stream;
      video.play();
      video.addEventListener('canplay', () => { cameraReady = true; }, { once: true });
    })
    .catch(() => {});
}

// ——— AUDIO ———
const AC = new AudioContext();

// Brown-noise buffer — used for scraping and idle creak
const noiseBuffer = (() => {
  const buf  = AC.createBuffer(1, AC.sampleRate * 3, AC.sampleRate);
  const data = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    b = (b + (Math.random() * 2 - 1) * 0.02) / 1.02;
    data[i] = b * 4;
  }
  return buf;
})();

let scrapeSource = null, scrapeGain = null, lastDragX = 0;

function ensureAudio() { if (AC.state === 'suspended') AC.resume(); }

function startScrape(x) {
  ensureAudio();
  lastDragX = x;
  if (scrapeSource) return;
  scrapeSource = AC.createBufferSource();
  scrapeSource.buffer = noiseBuffer;
  scrapeSource.loop   = true;
  const filter = AC.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = 600; filter.Q.value = 1.2;
  scrapeGain = AC.createGain();
  scrapeGain.gain.value = 0;
  scrapeSource.connect(filter); filter.connect(scrapeGain); scrapeGain.connect(AC.destination);
  scrapeSource.start();
}

function updateScrape(x) {
  const vel = Math.abs(x - lastDragX); lastDragX = x;
  if (scrapeGain)
    scrapeGain.gain.setTargetAtTime(Math.min(0.28, vel * 0.013), AC.currentTime, 0.04);
}

function stopScrape() {
  if (scrapeGain) scrapeGain.gain.setTargetAtTime(0, AC.currentTime, 0.08);
  if (scrapeSource) {
    const s = scrapeSource; scrapeSource = null; scrapeGain = null;
    setTimeout(() => { try { s.stop(); } catch (_) {} }, 250);
  }
  // Low thud on release
  const osc = AC.createOscillator(), g = AC.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, AC.currentTime);
  osc.frequency.exponentialRampToValueAtTime(35, AC.currentTime + 0.18);
  g.gain.setValueAtTime(0.45, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.35);
  osc.connect(g); g.connect(AC.destination);
  osc.start(); osc.stop(AC.currentTime + 0.35);
}

function playIdleCreak() {
  ensureAudio();
  const src = AC.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = AC.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = 280; filter.Q.value = 2.5;
  const g = AC.createGain();
  g.gain.setValueAtTime(0, AC.currentTime);
  g.gain.linearRampToValueAtTime(0.07, AC.currentTime + 0.4);
  g.gain.linearRampToValueAtTime(0, AC.currentTime + 1.8);
  src.connect(filter); filter.connect(g); g.connect(AC.destination);
  src.start(); src.stop(AC.currentTime + 1.8);
}

// ——— GEOMETRY ———
const ci       = (col, row) => row * COLS + col;
const brickW   = ()         => Math.round(canvas.width / COLS);
const rowShift = row        => row % 2 === 1 ? Math.round(brickW() / 2) : 0;
const cellX    = (col, row) => col * brickW() + rowShift(row);
const cellY    = row        => Math.round(row * canvas.height / ROWS);
const cellH    = row        => cellY(row + 1) - cellY(row);

// ——— GEOMETRY HELPERS ———
function gridNeighbours(i) {
  const col = i % COLS, row = Math.floor(i / COLS);
  const nb = [];
  if (col > 0)        nb.push(i - 1);
  if (col < COLS - 1) nb.push(i + 1);
  if (row > 0)        nb.push(i - COLS);
  if (row < ROWS - 1) nb.push(i + COLS);
  return nb;
}

function pickCluster(size) {
  const seed    = Math.floor(Math.random() * N);
  const cluster = new Set([seed]);
  const frontier = gridNeighbours(seed).filter(n => !cluster.has(n));
  while (cluster.size < size && frontier.length > 0) {
    const pick = Math.floor(Math.random() * frontier.length);
    const next = frontier.splice(pick, 1)[0];
    cluster.add(next);
    for (const nb of gridNeighbours(next)) {
      if (!cluster.has(nb) && !frontier.includes(nb)) frontier.push(nb);
    }
  }
  return [...cluster];
}

// ——— UPDATE ———
function update() {
  const mx  = brickW();
  const tol = mx * 0.025;

  if (idleMode && !dragState) {
    const now = Date.now();
    if (idlePhase === 'waiting') {
      for (let i = 0; i < N; i++) t1[i] = 0;
      if (now > idleTimestamp) {
        idleBlocks = pickCluster(5);
        idleTarget = mx * (0.70 + Math.random() * 0.20);
        idlePhase  = 'opening';
        playIdleCreak();
      }
    } else if (idlePhase === 'opening') {
      for (let i = 0; i < N; i++) t1[i] = idleBlocks.includes(i) ? idleTarget : 0;
      if (Math.abs(o1[idleBlocks[0]] - idleTarget) < tol) {
        idlePhase     = 'holding';
        idleTimestamp = now + 1200 + Math.random() * 1500;
      }
    } else if (idlePhase === 'holding') {
      for (let i = 0; i < N; i++) t1[i] = idleBlocks.includes(i) ? idleTarget : 0;
      if (now > idleTimestamp) idlePhase = 'closing';
    } else {
      for (let i = 0; i < N; i++) t1[i] = 0;
      if (idleBlocks.every(b => Math.abs(o1[b]) < tol)) {
        idlePhase     = 'waiting';
        idleTimestamp = now + 800 + Math.random() * 1200;
      }
    }
  }

  for (let i = 0; i < N; i++) {
    if (dragState?.index === i) continue;
    o1[i] += (t1[i] - o1[i]) * LERP1;
  }
  for (let i = 0; i < N; i++) {
    o2[i] += (o1[i] * 0.9775 - o2[i]) * LERP1;
    o3[i] += (o1[i] * 0.9550 - o3[i]) * LERP1;
    o4[i] += (o1[i] * 0.9325 - o4[i]) * LERP1;
    o5[i] += (o1[i] * 0.9100 - o5[i]) * LERP1;
    o6[i] += (o1[i] * 0.8875 - o6[i]) * LERP1;
    o7[i] += (o1[i] * 0.8650 - o7[i]) * LERP1;
  }

  // Auto-close manually opened bricks after 10 s
  const nowMs = Date.now();
  for (let k = openCells.length - 1; k >= 0; k--) {
    if (nowMs - openCells[k].openedAt > 10000) {
      t1[openCells[k].index] = 0;
      openCells.splice(k, 1);
    }
  }

  // Track when all bricks are closed
  if (openCells.length > 0) allClosedSince = nowMs;

  // Auto-activate idle 5 s after all bricks have closed with no interaction
  if (!idleMode && !dragState && openCells.length === 0 && nowMs - allClosedSince > 5000) {
    idleMode      = true;
    idlePhase     = 'waiting';
    idleTimestamp = nowMs + 500;
  }
}

// ——— RENDER ———
function drawBackground() {
  if (cameraReady && video.videoWidth > 0) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const ta = canvas.width / canvas.height, sa = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (sa > ta) { sw = vh * ta; sx = (vw - sw) * 0.5; }
    else         { sh = vw / ta; sy = (vh - sh) * 0.5; }
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.fillStyle = '#16140f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gd = ctx.createRadialGradient(
      canvas.width * 0.5, canvas.height * 0.5, 0,
      canvas.width * 0.5, canvas.height * 0.5,
      Math.max(canvas.width, canvas.height) * 0.65
    );
    gd.addColorStop(0, 'rgba(160,90,18,0.28)');
    gd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawLayerBlock(px, cy, bw, bh, layer, cellIdx, offset) {
  if (texLoaded) {
    const iw = texStone.naturalWidth, ih = texStone.naturalHeight;
    const scale = Math.max(bw / iw, bh / ih);
    const sw = Math.floor(bw / scale), sh = Math.floor(bh / scale);
    const maxSx = Math.max(0, iw - sw), maxSy = Math.max(0, ih - sh);
    ctx.drawImage(texStone,
      maxSx > 0 ? Math.floor((cellIdx * 83) % (maxSx + 1)) : 0,
      maxSy > 0 ? Math.floor((cellIdx * 61) % (maxSy + 1)) : 0,
      sw, sh, px, cy, bw, bh);
    ctx.fillStyle = LAYER_OVERLAY[layer];
  } else {
    ctx.fillStyle = LAYER_FALLBACK[layer];
  }
  ctx.fillRect(px, cy, bw, bh);

  // Top-edge highlight — light catching the upper rim of the brick
  const bev = Math.max(4, Math.round(bh * 0.07));
  const tg  = ctx.createLinearGradient(0, cy, 0, cy + bev);
  tg.addColorStop(0, 'rgba(255,245,220,0.22)');
  tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(px, cy, bw, bev);

  // Bottom-edge shadow — shadow cast by the brick above
  const bg = ctx.createLinearGradient(0, cy + bh - bev, 0, cy + bh);
  bg.addColorStop(0, 'rgba(0,0,0,0)');
  bg.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = bg;
  ctx.fillRect(px, cy + bh - bev, bw, bev);

  // Mortar joint — 1 px dark line at top and right edges of front face
  if (layer === 0) {
    ctx.fillStyle = 'rgba(6,5,3,0.70)';
    ctx.fillRect(px, cy, bw, 1);              // top joint
    ctx.fillRect(px + bw - 1, cy, 1, bh);    // right joint
  }

  // Bright left/right edge — lit side facing the open gap
  if (Math.abs(offset) > 1) {
    ctx.fillStyle = EDGE_HIGHLIGHT;
    ctx.fillRect(offset > 0 ? px : px + bw - 2, cy, 2, bh);
  }
}

function drawBrick(cx, cy, bw, bh, cellIdx, a1, a2, a3, a4, a5, a6, a7) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, bw, bh);
  ctx.clip();
  drawLayerBlock(cx + a7, cy, bw, bh, 6, cellIdx, a7);
  drawLayerBlock(cx + a6, cy, bw, bh, 5, cellIdx, a6);
  drawLayerBlock(cx + a5, cy, bw, bh, 4, cellIdx, a5);
  drawLayerBlock(cx + a4, cy, bw, bh, 3, cellIdx, a4);
  drawLayerBlock(cx + a3, cy, bw, bh, 2, cellIdx, a3);
  drawLayerBlock(cx + a2, cy, bw, bh, 1, cellIdx, a2);
  drawLayerBlock(cx + a1, cy, bw, bh, 0, cellIdx, a1);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  const bw = brickW();
  for (let row = 0; row < ROWS; row++) {
    const bh = cellH(row), cy = cellY(row);
    // Decorative half-brick at left edge of offset rows (completes stretcher bond)
    if (row % 2 === 1) {
      const hw = Math.round(bw / 2), edgeIdx = N + row;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, cy, hw, bh);
      ctx.clip();
      drawLayerBlock(-hw, cy, bw, bh, 6, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 5, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 4, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 3, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 2, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 1, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 0, edgeIdx, 0);
      ctx.restore();
    }
    for (let col = 0; col < COLS; col++) {
      const i = ci(col, row);
      drawBrick(cellX(col, row), cy, bw, bh, i, o1[i], o2[i], o3[i], o4[i], o5[i], o6[i], o7[i]);
    }
  }

  // Pass 2 — front face of every moving brick rendered on top without a right/left clip,
  // so it overlaps the neighbouring brick instead of getting cut off at the cell edge.
  for (let row = 0; row < ROWS; row++) {
    const bh = cellH(row), cy = cellY(row);
    for (let col = 0; col < COLS; col++) {
      const i = ci(col, row);
      if (Math.abs(o1[i]) > 1) {
        drawLayerBlock(cellX(col, row) + o1[i], cy, bw, bh, 0, i, o1[i]);
      }
    }
  }
}

// ——— INPUT ———
function getXY(e) {
  if (e.touches?.length) {
    const r = canvas.getBoundingClientRect();
    return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
  }
  return { x: e.offsetX, y: e.offsetY };
}

function hitCell(px, py) {
  const row = Math.floor(py * ROWS / canvas.height);
  if (row < 0 || row >= ROWS) return -1;
  const col = Math.floor((px - rowShift(row)) / brickW());
  return col >= 0 && col < COLS ? ci(col, row) : -1;
}

function pressAt(px, py) {
  const idx = hitCell(px, py);
  if (idx < 0) return;
  if (idleMode) {
    idleMode  = false;
    idlePhase = 'waiting';
    for (const b of idleBlocks) t1[b] = 0;
  }
  const existing = openCells.find(c => c.index === idx);
  if (existing) {
    existing.openedAt = Date.now(); // reset the 3 s timer on re-touch
  } else {
    if (openCells.length >= 12) t1[openCells.shift().index] = 0; // evict oldest
    t1[idx] = o1[idx]; // freeze at current position (no snap)
    openCells.push({ index: idx, openedAt: Date.now() });
  }
  startScrape(px);
  dragState = { index: idx, startX: px, startOffset: o1[idx] };
}

function moveAt(px) {
  if (!dragState) return;
  const mx = brickW();
  const v  = Math.max(-mx, Math.min(mx, dragState.startOffset + px - dragState.startX));
  o1[dragState.index] = t1[dragState.index] = v;
  updateScrape(px);
}

function endDrag() { stopScrape(); dragState = null; }

canvas.addEventListener('mousedown',  e => { const { x, y } = getXY(e); pressAt(x, y); });
canvas.addEventListener('mousemove',  e => { if (dragState) moveAt(getXY(e).x); });
canvas.addEventListener('mouseup',    () => endDrag());
canvas.addEventListener('mouseleave', () => endDrag());
canvas.addEventListener('touchstart', e => { e.preventDefault(); const { x, y } = getXY(e); pressAt(x, y); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); moveAt(getXY(e).x); }, { passive: false });
canvas.addEventListener('touchend',   e => { e.preventDefault(); endDrag(); }, { passive: false });

// ——— LOOP ———
(function loop() { update(); draw(); requestAnimationFrame(loop); })();
