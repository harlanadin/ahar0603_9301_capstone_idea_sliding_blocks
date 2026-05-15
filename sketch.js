'use strict';

// ——— CONFIG ———
const COLS = 4, ROWS = 4, N = COLS * ROWS;

const LAYER_OVERLAY  = [
  'rgba(18,14,10,0.64)',  // L1 — front, deepest shadow
  'rgba(18,14,10,0.50)',  // L2
  'rgba(18,14,10,0.36)',  // L3
  'rgba(18,14,10,0.22)',  // L4
  'rgba(18,14,10,0.08)'   // L5 — back, nearest light
];
const LAYER_FALLBACK = ['#363028', '#443c32', '#504540', '#5e534c', '#706860'];
const EDGE_HIGHLIGHT = 'rgba(255,248,230,0.38)';
const LERP1 = 0.12;

// ——— STATE ———
const o1 = new Float32Array(N);
const o2 = new Float32Array(N);
const o3 = new Float32Array(N);
const o4 = new Float32Array(N);
const o5 = new Float32Array(N);
const t1 = new Float32Array(N);

let idleMode      = true;
let idlePhase     = 'waiting'; // 'waiting' | 'opening' | 'holding' | 'closing'
let idleBlock     = -1;
let idleTarget    = 0;
let idleTimestamp = Date.now() + 1200;
let dragState     = null;
let openCells     = []; // FIFO queue — max 2 blocks open at once

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

// ——— UPDATE ———
function update() {
  const mx  = brickW();
  const tol = mx * 0.025;

  if (idleMode && !dragState) {
    const now = Date.now();
    if (idlePhase === 'waiting') {
      for (let i = 0; i < N; i++) t1[i] = 0;
      if (now > idleTimestamp) {
        let next;
        do { next = Math.floor(Math.random() * N); } while (next === idleBlock && N > 1);
        idleBlock  = next;
        idleTarget = mx * (0.70 + Math.random() * 0.20);
        idlePhase  = 'opening';
        playIdleCreak();
      }
    } else if (idlePhase === 'opening') {
      for (let i = 0; i < N; i++) t1[i] = i === idleBlock ? idleTarget : 0;
      if (Math.abs(o1[idleBlock] - idleTarget) < tol) {
        idlePhase     = 'holding';
        idleTimestamp = now + 1200 + Math.random() * 1500;
      }
    } else if (idlePhase === 'holding') {
      for (let i = 0; i < N; i++) t1[i] = i === idleBlock ? idleTarget : 0;
      if (now > idleTimestamp) idlePhase = 'closing';
    } else {
      for (let i = 0; i < N; i++) t1[i] = 0;
      if (Math.abs(o1[idleBlock]) < tol) {
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
    o2[i] += (o1[i] * 0.955 - o2[i]) * LERP1;
    o3[i] += (o1[i] * 0.910 - o3[i]) * LERP1;
    o4[i] += (o1[i] * 0.865 - o4[i]) * LERP1;
    o5[i] += (o1[i] * 0.820 - o5[i]) * LERP1;
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

function drawBrick(cx, cy, bw, bh, cellIdx, a1, a2, a3, a4, a5) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, bw, bh);
  ctx.clip();
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
      drawLayerBlock(-hw, cy, bw, bh, 4, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 3, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 2, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 1, edgeIdx, 0);
      drawLayerBlock(-hw, cy, bw, bh, 0, edgeIdx, 0);
      ctx.restore();
    }
    for (let col = 0; col < COLS; col++) {
      const i = ci(col, row);
      drawBrick(cellX(col, row), cy, bw, bh, i, o1[i], o2[i], o3[i], o4[i], o5[i]);
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
    if (idleBlock >= 0) t1[idleBlock] = 0; // close whatever idle had open
    document.getElementById('btn-idle').textContent = 'Idle: OFF';
  }
  // If already one of the open blocks, just drag it — no queue change
  if (!openCells.includes(idx)) {
    if (openCells.length >= 2) t1[openCells.shift()] = 0; // evict oldest
    t1[idx] = o1[idx]; // freeze at current position (no snap)
    openCells.push(idx);
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

// ——— CONTROLS ———
document.getElementById('btn-idle').addEventListener('click', () => {
  idleMode = !idleMode;
  document.getElementById('btn-idle').textContent = idleMode ? 'Idle: ON' : 'Idle: OFF';
  if (idleMode) {
    for (const j of openCells) t1[j] = 0; // close manual blocks before idle takes over
    openCells.length = 0;
    idlePhase = 'waiting';
    idleTimestamp = Date.now() + 800;
  } else {
    for (let j = 0; j < N; j++) t1[j] = o1[j];
  }
});

document.getElementById('btn-reset').addEventListener('click', () => {
  o1.fill(0); o2.fill(0); o3.fill(0); o4.fill(0); o5.fill(0); t1.fill(0);
  dragState        = null;
  openCells.length = 0;
  idleMode         = true;
  idlePhase     = 'waiting';
  idleBlock     = -1;
  idleTimestamp = Date.now() + 1200;
  document.getElementById('btn-idle').textContent = 'Idle: ON';
});

// ——— LOOP ———
(function loop() { update(); draw(); requestAnimationFrame(loop); })();
