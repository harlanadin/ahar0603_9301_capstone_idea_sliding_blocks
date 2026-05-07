let cameraFeed;
let concreteTexture;
let pieces = [];
let activeMove = null;
let boardCols = 12;
let boardRows = 8;
let dragSelection = null;

const BOARD_MARGIN = 0;
const CELL_GAP = 5;
const MOVE_DURATION_MS = 220;
const TARGET_CELL_SIZE = 80;
const REMOVED_BLOCK_COUNT = 20;
const DRAG_THRESHOLD = 18;
const BLOCK_RADIUS = 5;

function preload() {
  concreteTexture = loadImage("images/Texturelabs_Concrete_147S.jpg");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(min(2, displayDensity()));
  setupCamera();
  resetPuzzle();
}

function setupCamera() {
  cameraFeed = createCapture(
    {
      video: {
        facingMode: {
          ideal: "user"
        }
      },
      audio: false
    },
    () => {
      if (cameraFeed) {
        cameraFeed.hide();
      }
    }
  );

  cameraFeed.size(640, 480);
  cameraFeed.attribute("playsinline", "");
  cameraFeed.hide();
}

function draw() {
  updateAnimation();
  drawBackground();
  drawBoard();
  drawHud();
}

function resetPuzzle() {
  initializeBoardDimensions();
  pieces = generatePieces();
  activeMove = null;
}

function initializeBoardDimensions() {
  boardCols = max(12, floor((width - BOARD_MARGIN * 2 + CELL_GAP) / (TARGET_CELL_SIZE + CELL_GAP)));
  boardRows = max(8, floor((height - BOARD_MARGIN * 2 + CELL_GAP) / (TARGET_CELL_SIZE + CELL_GAP)));
}

function generatePieces() {
  const occupied = Array.from({ length: boardRows }, () => Array(boardCols).fill(false));
  const generated = [];
  let nextId = 0;

  for (let row = 0; row < boardRows; row++) {
    for (let col = 0; col < boardCols; col++) {
      if (occupied[row][col]) {
        continue;
      }

      const candidates = shuffle(getShapePreferences(row)).filter((shape) =>
        canPlaceGeneratedPiece(col, row, shape.w, shape.h, occupied)
      );
      const shape = candidates[0];

      if (!shape) {
        continue;
      }

      const piece = {
        id: `piece-${nextId}`,
        x: col,
        y: row,
        w: shape.w,
        h: shape.h,
        accent: false
      };

      generated.push(piece);
      markGeneratedPiece(occupied, piece, true);
      nextId += 1;
    }
  }

  const removalCount = min(REMOVED_BLOCK_COUNT, generated.length);

  for (let i = 0; i < removalCount; i++) {
    const piece = random(generated);
    generated.splice(generated.indexOf(piece), 1);
  }

  const accentCandidates = generated.filter((piece) => piece.w > 1 || piece.h > 1);

  if (accentCandidates.length > 0) {
    random(accentCandidates).accent = true;
  }

  return generated;
}

function getShapePreferences(row) {
  const middleStart = floor(boardRows * 0.3);
  const middleEnd = ceil(boardRows * 0.75);

  if (row >= middleStart && row <= middleEnd) {
    return [
      { w: 2, h: 1 },
      { w: 2, h: 1 },
      { w: 2, h: 1 },
      { w: 2, h: 1 },
      { w: 2, h: 1 },
      { w: 1, h: 2 },
      { w: 1, h: 2 },
      { w: 1, h: 2 }
    ];
  }

  return [
    { w: 2, h: 1 },
    { w: 2, h: 1 },
    { w: 2, h: 1 },
    { w: 2, h: 1 },
    { w: 1, h: 2 },
    { w: 1, h: 2 },
    { w: 1, h: 2 }
  ];
}

function canPlaceGeneratedPiece(x, y, w, h, occupied) {
  if (x + w > boardCols || y + h > boardRows) {
    return false;
  }

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (occupied[y + dy][x + dx]) {
        return false;
      }
    }
  }

  return true;
}

function markGeneratedPiece(occupied, piece, value) {
  for (let dy = 0; dy < piece.h; dy++) {
    for (let dx = 0; dx < piece.w; dx++) {
      occupied[piece.y + dy][piece.x + dx] = value;
    }
  }
}

function updateAnimation() {
  if (!activeMove) {
    return;
  }

  const elapsed = millis() - activeMove.startTime;

  if (elapsed < MOVE_DURATION_MS) {
    return;
  }

  activeMove.piece.x = activeMove.toX;
  activeMove.piece.y = activeMove.toY;
  activeMove = null;
}

function drawBackground() {
  background(22, 18, 13);

  const topColor = color(113, 79, 41);
  const bottomColor = color(66, 45, 22);

  for (let y = 0; y < height; y++) {
    const t = y / max(height - 1, 1);
    stroke(lerpColor(topColor, bottomColor, t));
    line(0, y, width, y);
  }
}

function drawBoard() {
  const board = getBoardMetrics();

  drawBoardBackground(board);

  for (const piece of pieces) {
    if (activeMove && piece.id === activeMove.piece.id) {
      continue;
    }

    drawPiece(piece, board, piece.x, piece.y);
  }

  if (activeMove) {
    const t = easeInOutCubic(constrain((millis() - activeMove.startTime) / MOVE_DURATION_MS, 0, 1));
    const x = lerp(activeMove.fromX, activeMove.toX, t);
    const y = lerp(activeMove.fromY, activeMove.toY, t);
    drawPiece(activeMove.piece, board, x, y);
  }
}

function drawBoardBackground(board) {
  if (hasCameraFrame()) {
    drawContinuousCamera(board);
  } else {
    noStroke();
    fill(83, 55, 24);
    rect(board.x, board.y, board.width, board.height);
    
    noStroke();
    fill(18, 12, 8, 28);
    rect(board.x, board.y, board.width, board.height);
  }
}

function drawPiece(piece, board, gridX, gridY) {
  const rectData = getRectForCells(board, gridX, gridY, piece.w, piece.h);
  const movable = !activeMove && getMoveOptions(piece).length > 0;

  drawingContext.save();
  drawingContext.shadowColor = movable
    ? "rgba(255, 255, 255, 0.18)"
    : "rgba(0, 0, 0, 0.28)";
  drawingContext.shadowBlur = movable ? 24 : 16;
  drawingContext.shadowOffsetY = 7;

  drawTextureCrop(
    concreteTexture,
    rectData.x,
    rectData.y,
    rectData.w,
    rectData.h,
    piece.x,
    piece.y
  );

  drawingContext.restore();

  noStroke();
  fill(piece.accent ? color(120, 120, 120, 24) : color(255, 255, 255, 12));
  rect(rectData.x, rectData.y, rectData.w, rectData.h, BLOCK_RADIUS);

  fill(255, 255, 255, 34);
  rect(rectData.x + 3, rectData.y + 3, rectData.w - 6, rectData.h * 0.16, BLOCK_RADIUS - 1);

  noFill();
  stroke(piece.accent ? color(235, 235, 235, 190) : color(255, 255, 255, 120));
  strokeWeight(1.2);
  rect(rectData.x, rectData.y, rectData.w, rectData.h, BLOCK_RADIUS);
}

function drawHud() {
  fill(255, 247, 232);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(min(width, height) * 0.016);
  text("Sliding blocks. Drag to move. Press R to reset.", 12, 10);

  if (!hasCameraFrame()) {
    textAlign(RIGHT, TOP);
    text("Allow front camera access to reveal the empty spaces.", width - 12, 10);
  }
}

function getBoardMetrics() {
  const usableWidth = width - BOARD_MARGIN * 2;
  const usableHeight = height - BOARD_MARGIN * 2;
  const cellWidth = (usableWidth - CELL_GAP * (boardCols - 1)) / boardCols;
  const cellHeight = (usableHeight - CELL_GAP * (boardRows - 1)) / boardRows;

  return {
    x: BOARD_MARGIN,
    y: BOARD_MARGIN,
    cellWidth,
    cellHeight,
    width: usableWidth,
    height: usableHeight
  };
}

function getRectForCells(board, gridX, gridY, w, h) {
  return {
    x: board.x + gridX * (board.cellWidth + CELL_GAP),
    y: board.y + gridY * (board.cellHeight + CELL_GAP),
    w: board.cellWidth * w + CELL_GAP * (w - 1),
    h: board.cellHeight * h + CELL_GAP * (h - 1)
  };
}

function drawTextureCrop(source, dx, dy, dw, dh, seedX, seedY) {
  const scale = max(dw / source.width, dh / source.height);
  const sw = dw / scale;
  const sh = dh / scale;
  const maxSx = max(0, source.width - sw);
  const maxSy = max(0, source.height - sh);
  const sx = maxSx === 0 ? 0 : ((seedX * 97 + seedY * 53) % floor(maxSx + 1));
  const sy = maxSy === 0 ? 0 : ((seedY * 89 + seedX * 41) % floor(maxSy + 1));

  image(source, dx, dy, dw, dh, sx, sy, sw, sh);
}

function hasCameraFrame() {
  return (
    cameraFeed &&
    cameraFeed.elt &&
    cameraFeed.elt.readyState >= 2 &&
    cameraFeed.elt.videoWidth > 0 &&
    cameraFeed.elt.videoHeight > 0
  );
}

function drawContinuousCamera(board) {
  const crop = getMediaCoverCrop(cameraFeed, board.width, board.height);
  const video = cameraFeed.elt;

  drawingContext.save();
  drawingContext.translate(board.x + board.width, board.y);
  drawingContext.scale(-1, 1);
  drawingContext.drawImage(
    video,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    board.width,
    board.height
  );
  drawingContext.restore();
}

function getMediaCoverCrop(media, targetWidth, targetHeight) {
  const mediaWidth =
    (media.elt && media.elt.videoWidth) ||
    media.width ||
    1;
  const mediaHeight =
    (media.elt && media.elt.videoHeight) ||
    media.height ||
    1;
  const sourceAspect = mediaWidth / mediaHeight;
  const targetAspect = targetWidth / targetHeight;

  let sx = 0;
  let sy = 0;
  let sw = mediaWidth;
  let sh = mediaHeight;

  if (sourceAspect > targetAspect) {
    sw = mediaHeight * targetAspect;
    sx = (mediaWidth - sw) * 0.5;
  } else {
    sh = mediaWidth / targetAspect;
    sy = (mediaHeight - sh) * 0.5;
  }

  return { sx, sy, sw, sh };
}

function buildOccupancy(excludeId) {
  const grid = Array.from({ length: boardRows }, () => Array(boardCols).fill(null));

  for (const piece of pieces) {
    if (piece.id === excludeId) {
      continue;
    }

    for (let dy = 0; dy < piece.h; dy++) {
      for (let dx = 0; dx < piece.w; dx++) {
        grid[piece.y + dy][piece.x + dx] = piece.id;
      }
    }
  }

  return grid;
}

function getMoveOptions(piece) {
  const occupied = buildOccupancy(piece.id);
  const options = [];

  if (piece.w > piece.h) {
    if (canSlide(piece, -1, 0, occupied)) {
      options.push({ dx: -1, dy: 0 });
    }
    if (canSlide(piece, 1, 0, occupied)) {
      options.push({ dx: 1, dy: 0 });
    }
  } else if (piece.h > piece.w) {
    if (canSlide(piece, 0, -1, occupied)) {
      options.push({ dx: 0, dy: -1 });
    }
    if (canSlide(piece, 0, 1, occupied)) {
      options.push({ dx: 0, dy: 1 });
    }
  } else {
    if (canSlide(piece, -1, 0, occupied)) {
      options.push({ dx: -1, dy: 0 });
    }
    if (canSlide(piece, 1, 0, occupied)) {
      options.push({ dx: 1, dy: 0 });
    }
    if (canSlide(piece, 0, -1, occupied)) {
      options.push({ dx: 0, dy: -1 });
    }
    if (canSlide(piece, 0, 1, occupied)) {
      options.push({ dx: 0, dy: 1 });
    }
  }

  return options;
}

function canSlide(piece, dx, dy, occupied) {
  const nextX = piece.x + dx;
  const nextY = piece.y + dy;

  if (nextX < 0 || nextY < 0 || nextX + piece.w > boardCols || nextY + piece.h > boardRows) {
    return false;
  }

  for (let y = 0; y < piece.h; y++) {
    for (let x = 0; x < piece.w; x++) {
      const cellX = nextX + x;
      const cellY = nextY + y;

      if (occupied[cellY][cellX]) {
        return false;
      }
    }
  }

  return true;
}

function getPieceAtPoint(x, y) {
  const board = getBoardMetrics();

  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i];
    const rectData = getRectForCells(board, piece.x, piece.y, piece.w, piece.h);

    if (
      x >= rectData.x &&
      x <= rectData.x + rectData.w &&
      y >= rectData.y &&
      y <= rectData.y + rectData.h
    ) {
      return { piece, rectData };
    }
  }

  return null;
}

function chooseMoveForDrag(piece, dx, dy) {
  const options = getMoveOptions(piece);

  if (options.length === 0) {
    return null;
  }

  if (options.length === 1) {
    return options[0];
  }

  if (piece.w > piece.h) {
    const leftOption = options.find((option) => option.dx < 0);
    const rightOption = options.find((option) => option.dx > 0);

    if (abs(dx) < DRAG_THRESHOLD || abs(dx) < abs(dy)) {
      return null;
    }

    if (dx < 0 && leftOption) {
      return leftOption;
    }

    if (dx > 0 && rightOption) {
      return rightOption;
    }

    return leftOption || options[0];
  }

  const upOption = options.find((option) => option.dy < 0);
  const downOption = options.find((option) => option.dy > 0);

  if (abs(dy) < DRAG_THRESHOLD || abs(dy) < abs(dx)) {
    return null;
  }

  if (dy < 0 && upOption) {
    return upOption;
  }

  if (dy > 0 && downOption) {
    return downOption;
  }

  return upOption || options[0];
}

function startMove(piece, move) {
  activeMove = {
    piece,
    fromX: piece.x,
    fromY: piece.y,
    toX: piece.x + move.dx,
    toY: piece.y + move.dy,
    startTime: millis()
  };
}

function handlePointerPress(x, y) {
  if (activeMove) {
    return false;
  }

  const hit = getPieceAtPoint(x, y);

  if (!hit) {
    dragSelection = null;
    return false;
  }

  dragSelection = {
    piece: hit.piece,
    startX: x,
    startY: y
  };
  return true;
}

function mousePressed() {
  return handlePointerPress(mouseX, mouseY);
}

function mouseReleased() {
  return handlePointerRelease(mouseX, mouseY);
}

function touchStarted() {
  return handlePointerPress(mouseX, mouseY);
}

function touchEnded() {
  return handlePointerRelease(mouseX, mouseY);
}

function handlePointerRelease(x, y) {
  if (!dragSelection || activeMove) {
    dragSelection = null;
    return false;
  }

  const dx = x - dragSelection.startX;
  const dy = y - dragSelection.startY;
  const move = chooseMoveForDrag(dragSelection.piece, dx, dy);

  if (move) {
    startMove(dragSelection.piece, move);
  }

  dragSelection = null;
  return !!move;
}

function keyPressed() {
  if (key === "r" || key === "R") {
    resetPuzzle();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  activeMove = null;
  dragSelection = null;
}

function easeInOutCubic(t) {
  if (t < 0.5) {
    return 4 * t * t * t;
  }

  return 1 - pow(-2 * t + 2, 3) / 2;
}
