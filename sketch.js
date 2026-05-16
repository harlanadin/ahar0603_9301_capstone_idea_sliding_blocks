'use strict';

// ——— CONFIG ———
const COLS = 8, ROWS = 8, N = COLS * ROWS;

// Fixed 3-brick vertical strip at centre — idle teaser
const IDLE_BRICKS = (() => {
  const col = Math.floor(COLS / 2) - 1;
  const r0  = Math.floor((ROWS - 3) / 2);
  return [0, 1, 2].map(r => (r0 + r) * COLS + col);
})();

const LAYER_OVERLAY  = [
  'rgba(18,14,10,0.64)', 'rgba(18,14,10,0.54)', 'rgba(18,14,10,0.44)',
  'rgba(18,14,10,0.34)', 'rgba(18,14,10,0.24)', 'rgba(18,14,10,0.14)',
  'rgba(18,14,10,0.04)'
];
const LAYER_FALLBACK = ['#363028','#3e3830','#464038','#504540','#5a4f4a','#645a54','#706860'];
const EDGE_HIGHLIGHT = 'rgba(255,248,230,0.38)';
const LERP1 = 0.12;

// ——— STATE ———
const o1 = new Float32Array(N), o2 = new Float32Array(N), o3 = new Float32Array(N);
const o4 = new Float32Array(N), o5 = new Float32Array(N), o6 = new Float32Array(N);
const o7 = new Float32Array(N), t1 = new Float32Array(N);

let idleMode      = true;
let idlePhase     = 'waiting';
let idleTarget    = 0;
let idleTimestamp = Date.now() + 1200;
let dragState     = null;
let openCells     = []; // [{ index, openedAt }] — max 15, auto-close 12 s
let allClosedSince = Date.now();

// ——— NETWORK STATE ———
let socket         = null;
let peer           = null;
let myRole         = null;
let remoteVideoEl  = null;
let peerConnected  = false;
let cameraStream   = null;
let peerInitPending = null;
let pendingSignals = [];
let lastDragEmitX  = null;

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

// ——— SLIDE ICON ———
const iconSlide = new Image();
let   iconLoaded = false;
iconSlide.onload = () => { iconLoaded = true; };
iconSlide.src    = 'images/slide-left-right-icon.png';

// ——— CAMERA ———
const video = document.createElement('video');
video.setAttribute('playsinline', ''); video.muted = true;
let cameraReady = false;

function setupCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false })
    .then(stream => {
      cameraStream = stream;
      video.srcObject = stream; video.play();
      video.addEventListener('canplay', () => { cameraReady = true; }, { once: true });
      if (peerInitPending !== null) {
        const initiator = peerInitPending;
        peerInitPending = null;
        initWebRTCPeer(initiator);
      }
    }).catch(() => {});
}

// ——— AUDIO ———
const AC = new AudioContext();
const noiseBuffer = (() => {
  const buf = AC.createBuffer(1, AC.sampleRate * 3, AC.sampleRate);
  const d   = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < d.length; i++) { b = (b + (Math.random() * 2 - 1) * 0.02) / 1.02; d[i] = b * 4; }
  return buf;
})();

let scrapeSource = null, scrapeGain = null, lastDragX = 0;
function ensureAudio() { if (AC.state === 'suspended') AC.resume(); }

function startScrape(x) {
  ensureAudio(); lastDragX = x;
  if (scrapeSource) return;
  scrapeSource = AC.createBufferSource();
  scrapeSource.buffer = noiseBuffer; scrapeSource.loop = true;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 1.2;
  scrapeGain = AC.createGain(); scrapeGain.gain.value = 0;
  scrapeSource.connect(f); f.connect(scrapeGain); scrapeGain.connect(AC.destination);
  scrapeSource.start();
}

function updateScrape(x) {
  const vel = Math.abs(x - lastDragX); lastDragX = x;
  if (scrapeGain) scrapeGain.gain.setTargetAtTime(Math.min(0.28, vel * 0.013), AC.currentTime, 0.04);
}

function stopScrape() {
  if (scrapeGain) scrapeGain.gain.setTargetAtTime(0, AC.currentTime, 0.08);
  if (scrapeSource) {
    const s = scrapeSource; scrapeSource = null; scrapeGain = null;
    setTimeout(() => { try { s.stop(); } catch (_) {} }, 250);
  }
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
  const src = AC.createBufferSource(); src.buffer = noiseBuffer;
  const f   = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 280; f.Q.value = 2.5;
  const g   = AC.createGain();
  g.gain.setValueAtTime(0, AC.currentTime);
  g.gain.linearRampToValueAtTime(0.07, AC.currentTime + 0.4);
  g.gain.linearRampToValueAtTime(0,    AC.currentTime + 1.8);
  src.connect(f); f.connect(g); g.connect(AC.destination);
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
  const now = Date.now();

  if (idleMode && !dragState) {
    if (idlePhase === 'waiting') {
      for (let i = 0; i < N; i++) t1[i] = 0;
      if (now > idleTimestamp) {
        idleTarget = mx * (0.70 + Math.random() * 0.20);
        idlePhase  = 'opening';
        playIdleCreak();
      }
    } else if (idlePhase === 'opening') {
      for (let i = 0; i < N; i++) t1[i] = IDLE_BRICKS.includes(i) ? idleTarget : 0;
      if (Math.abs(o1[IDLE_BRICKS[0]] - idleTarget) < tol) {
        idlePhase     = 'holding';
        idleTimestamp = now + 1200 + Math.random() * 1500;
      }
    } else if (idlePhase === 'holding') {
      for (let i = 0; i < N; i++) t1[i] = IDLE_BRICKS.includes(i) ? idleTarget : 0;
      if (now > idleTimestamp) idlePhase = 'closing';
    } else {
      for (let i = 0; i < N; i++) t1[i] = 0;
      if (IDLE_BRICKS.every(b => Math.abs(o1[b]) < tol)) {
        idlePhase     = 'waiting';
        idleTimestamp = now + 800 + Math.random() * 1200;
      }
    }
  }

  // Lerp + cascade in a single pass
  for (let i = 0; i < N; i++) {
    if (dragState?.index !== i) o1[i] += (t1[i] - o1[i]) * LERP1;
    if (dragState?.index === i) {
      o2[i] = o1[i] * 0.9775; o3[i] = o1[i] * 0.9550; o4[i] = o1[i] * 0.9325;
      o5[i] = o1[i] * 0.9100; o6[i] = o1[i] * 0.8875; o7[i] = o1[i] * 0.8650;
    } else {
      o2[i] += (o1[i] * 0.9775 - o2[i]) * LERP1; o3[i] += (o1[i] * 0.9550 - o3[i]) * LERP1;
      o4[i] += (o1[i] * 0.9325 - o4[i]) * LERP1; o5[i] += (o1[i] * 0.9100 - o5[i]) * LERP1;
      o6[i] += (o1[i] * 0.8875 - o6[i]) * LERP1; o7[i] += (o1[i] * 0.8650 - o7[i]) * LERP1;
    }
  }

  // Auto-close bricks after 12 s
  for (let k = openCells.length - 1; k >= 0; k--) {
    if (now - openCells[k].openedAt > 12000) {
      if (socket) socket.emit('brick-close', { index: openCells[k].index });
      t1[openCells[k].index] = 0;
      openCells.splice(k, 1);
    }
  }
  if (openCells.length > 0) allClosedSince = now;

  // Auto-activate idle 5 s after all bricks closed
  if (!idleMode && !dragState && openCells.length === 0 && now - allClosedSince > 5000) {
    idleMode = true; idlePhase = 'waiting'; idleTimestamp = now + 500;
  }
}

// ——— RENDER ———
function drawBackground() {
  const remoteReady = peerConnected && remoteVideoEl &&
    remoteVideoEl.videoWidth > 0 && remoteVideoEl.readyState >= 2;
  const activeVideo = remoteReady ? remoteVideoEl : video;
  const activeReady = remoteReady ? true : cameraReady;

  if (activeReady && activeVideo.videoWidth > 0) {
    const vw = activeVideo.videoWidth, vh = activeVideo.videoHeight;
    const ta = canvas.width / canvas.height, sa = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (sa > ta) { sw = vh * ta; sx = (vw - sw) * 0.5; }
    else         { sh = vw / ta; sy = (vh - sh) * 0.5; }
    ctx.save();
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(activeVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.fillStyle = '#16140f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gd = ctx.createRadialGradient(
      canvas.width * 0.5, canvas.height * 0.5, 0,
      canvas.width * 0.5, canvas.height * 0.5, Math.max(canvas.width, canvas.height) * 0.65
    );
    gd.addColorStop(0, 'rgba(160,90,18,0.28)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gd; ctx.fillRect(0, 0, canvas.width, canvas.height);
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

  const bev = Math.max(4, Math.round(bh * 0.07));
  const tg  = ctx.createLinearGradient(0, cy, 0, cy + bev);
  tg.addColorStop(0, 'rgba(255,245,220,0.22)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg; ctx.fillRect(px, cy, bw, bev);

  const bg = ctx.createLinearGradient(0, cy + bh - bev, 0, cy + bh);
  bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = bg; ctx.fillRect(px, cy + bh - bev, bw, bev);

  if (layer === 0) {
    ctx.fillStyle = 'rgba(6,5,3,0.70)';
    ctx.fillRect(px, cy, bw, 1); ctx.fillRect(px + bw - 1, cy, 1, bh);
  }
  if (Math.abs(offset) > 1) {
    ctx.fillStyle = EDGE_HIGHLIGHT;
    ctx.fillRect(offset > 0 ? px : px + bw - 2, cy, 2, bh);
  }
}

function drawBrick(cx, cy, bw, bh, idx, a1, a2, a3, a4, a5, a6, a7) {
  ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, bw, bh); ctx.clip();
  drawLayerBlock(cx+a7,cy,bw,bh,6,idx,a7); drawLayerBlock(cx+a6,cy,bw,bh,5,idx,a6);
  drawLayerBlock(cx+a5,cy,bw,bh,4,idx,a5); drawLayerBlock(cx+a4,cy,bw,bh,3,idx,a4);
  drawLayerBlock(cx+a3,cy,bw,bh,2,idx,a3); drawLayerBlock(cx+a2,cy,bw,bh,1,idx,a2);
  drawLayerBlock(cx+a1,cy,bw,bh,0,idx,a1);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  const bw = brickW();

  // Pass 1 — all bricks clipped to their cells
  for (let row = 0; row < ROWS; row++) {
    const bh = cellH(row), cy = cellY(row);
    if (row % 2 === 1) {
      const hw = Math.round(bw / 2), ei = N + row;
      ctx.save(); ctx.beginPath(); ctx.rect(0, cy, hw, bh); ctx.clip();
      for (let l = 6; l >= 0; l--) drawLayerBlock(-hw, cy, bw, bh, l, ei, 0);
      ctx.restore();
    }
    for (let col = 0; col < COLS; col++) {
      const i = ci(col, row);
      drawBrick(cellX(col,row), cy, bw, bh, i, o1[i],o2[i],o3[i],o4[i],o5[i],o6[i],o7[i]);
    }
  }

  // Pass 2 — sliding front faces rendered on top, overlap neighbours
  for (let row = 0; row < ROWS; row++) {
    const bh = cellH(row), cy = cellY(row);
    for (let col = 0; col < COLS; col++) {
      const i = ci(col, row);
      if (Math.abs(o1[i]) > 1) drawLayerBlock(cellX(col,row)+o1[i], cy, bw, bh, 0, i, o1[i]);
    }
  }

  drawIdleIcon();
}

function drawIdleIcon() {
  if (!iconLoaded || !idleMode || idleTarget <= 0) return;
  const alpha = Math.min(1, o1[IDLE_BRICKS[0]] / idleTarget);
  if (alpha < 0.02) return;

  const t    = Date.now() / 1000;
  const bw   = brickW();
  const mid  = IDLE_BRICKS[1];
  const mRow = Math.floor(mid / COLS);
  const mCol = mid % COLS;
  const bh   = cellH(mRow);

  const botRow  = Math.floor(IDLE_BRICKS[2] / COLS);
  const bottomY = cellY(botRow) + cellH(botRow);
  const iconH   = bh * 0.85;
  const iconW   = iconH * (iconSlide.naturalWidth / Math.max(1, iconSlide.naturalHeight));
  const iconX   = cellX(mCol, mRow) + bw / 2 - iconW / 2;
  const iconY   = bottomY + 14 + Math.sin(t * 1.8) * 5;

  const pulse = 0.80 + 0.20 * Math.sin(t * 2.2);

  ctx.save();
  ctx.globalAlpha = alpha * pulse;
  ctx.shadowColor = 'rgba(255,225,150,1.0)';
  ctx.shadowBlur  = 35 + 15 * Math.sin(t * 1.5);
  ctx.drawImage(iconSlide, iconX, iconY, iconW, iconH);
  ctx.shadowBlur  = 20;
  ctx.drawImage(iconSlide, iconX, iconY, iconW, iconH);
  ctx.restore();
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
  const bw = brickW();
  for (let col = 0; col < COLS; col++) {
    const i = ci(col, row);
    if (Math.abs(o1[i]) > 1) {
      const fx = cellX(col, row) + o1[i];
      if (px >= fx && px < fx + bw) return i;
    }
  }
  const col = Math.floor((px - rowShift(row)) / bw);
  return col >= 0 && col < COLS ? ci(col, row) : -1;
}

function pressAt(px, py) {
  const idx = hitCell(px, py);
  if (idx < 0) return;
  if (idleMode) { idleMode = false; idlePhase = 'waiting'; for (const b of IDLE_BRICKS) t1[b] = 0; }
  const existing = openCells.find(c => c.index === idx);
  if (existing) {
    existing.openedAt = Date.now();
  } else {
    if (openCells.length >= 15) t1[openCells.shift().index] = 0;
    t1[idx] = o1[idx];
    openCells.push({ index: idx, openedAt: Date.now() });
  }
  startScrape(px);
  dragState = { index: idx, startX: px, startOffset: o1[idx] };
  if (socket) socket.emit('brick-open', { index: idx, target: t1[idx] });
}

function moveAt(px) {
  if (!dragState) return;
  const mx = brickW();
  const v  = Math.max(-mx, Math.min(mx, dragState.startOffset + px - dragState.startX));
  o1[dragState.index] = t1[dragState.index] = v;
  updateScrape(px);
  if (socket && Math.abs(px - (lastDragEmitX ?? px)) > 2) {
    lastDragEmitX = px;
    socket.emit('brick-drag', { index: dragState.index, offset: v });
  }
}

function endDrag() {
  if (socket && dragState) {
    socket.emit('brick-release', { index: dragState.index, target: t1[dragState.index] });
  }
  lastDragEmitX = null;
  stopScrape();
  dragState = null;
}

canvas.addEventListener('mousedown',  e => { const {x,y} = getXY(e); pressAt(x,y); });
canvas.addEventListener('mousemove',  e => { if (dragState) moveAt(getXY(e).x); });
canvas.addEventListener('mouseup',    () => endDrag());
canvas.addEventListener('mouseleave', () => endDrag());
canvas.addEventListener('touchstart', e => { e.preventDefault(); const {x,y} = getXY(e); pressAt(x,y); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); moveAt(getXY(e).x); }, { passive: false });
canvas.addEventListener('touchend',   e => { e.preventDefault(); endDrag(); }, { passive: false });

// ——— WEBRTC ———
function initWebRTCPeer(initiator) {
  remoteVideoEl = document.createElement('video');
  remoteVideoEl.setAttribute('autoplay', '');
  remoteVideoEl.setAttribute('playsinline', '');
  remoteVideoEl.muted = true;
  remoteVideoEl.style.display = 'none';
  document.body.appendChild(remoteVideoEl);

  peer = new SimplePeer({ initiator, trickle: true, stream: cameraStream });

  peer.on('signal', (data) => socket.emit('signal', { data }));

  peer.on('stream', (remoteStream) => {
    peerConnected = true;
    remoteVideoEl.srcObject = remoteStream;
    remoteVideoEl.play().catch(e => console.error('Remote video play error:', e));
  });

  peer.on('error', (err) => console.error('SimplePeer error:', err));

  pendingSignals.forEach(d => peer.signal(d));
  pendingSignals = [];
}

// ——— NETWORK ———
function setupNetwork() {
  socket = io();

  socket.on('role-assigned', ({ role }) => {
    myRole = role;
    console.log('Role assigned:', role);
  });

  socket.on('peer-joined', () => {
    const isInitiator = myRole === 'mac';
    if (cameraStream) {
      initWebRTCPeer(isInitiator);
    } else {
      peerInitPending = isInitiator;
    }
  });

  socket.on('signal', ({ data }) => {
    if (!peer) {
      pendingSignals.push(data);
      if (cameraStream) {
        initWebRTCPeer(false);
      } else {
        peerInitPending = false;
      }
    } else {
      peer.signal(data);
    }
  });

  socket.on('remote-brick-open', ({ index, target }) => {
    const existing = openCells.find(c => c.index === index);
    if (existing) {
      existing.openedAt = Date.now();
    } else {
      if (openCells.length >= 15) t1[openCells.shift().index] = 0;
      openCells.push({ index, openedAt: Date.now() });
    }
    t1[index] = target;
    if (idleMode) { idleMode = false; idlePhase = 'waiting'; for (const b of IDLE_BRICKS) t1[b] = 0; }
  });

  socket.on('remote-brick-drag', ({ index, offset }) => {
    o1[index] = offset;
  });

  socket.on('remote-brick-release', ({ index, target }) => {
    t1[index] = target;
  });

  socket.on('remote-brick-close', ({ index }) => {
    t1[index] = 0;
    const k = openCells.findIndex(c => c.index === index);
    if (k !== -1) openCells.splice(k, 1);
  });

  socket.on('peer-left', () => {
    peerConnected = false;
    remoteVideoEl = null;
    if (peer) { peer.destroy(); peer = null; }
    console.log('Other device disconnected');
  });

  socket.emit('join');
}

// ——— BOOTSTRAP ———
setupCamera();
setupNetwork();
(function loop() { update(); draw(); requestAnimationFrame(loop); })();
