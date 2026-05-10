let cameraFeed;
let metalTextures = [];
let pieces = [];
let activeMove = null;
let boardCols = 12;
let boardRows = 8;
let dragSelection = null;

const CELL_GAP = 5;
const MOVE_DURATION_MS = 220;
const TARGET_CELL_SIZE = 160;
const REMOVED_BLOCK_COUNT = 4;
const DRAG_THRESHOLD = 18;
const BLOCK_RADIUS = 5;

function preload() {
  metalTextures[0] = loadImage("images/metal texture 00.jpg");
  metalTextures[1] = loadImage("images/metal texture 01.jpg");
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
  dragSelection = null;
}

function initializeBoardDimensions() {
  boardCols = max(6, floor((width + CELL_GAP) / (TARGET_CELL_SIZE + CELL_GAP)));
  boardRows = max(4, floor((height + CELL_GAP) / (TARGET_CELL_SIZE + CELL_GAP)));
}

function generatePieces() {
  const generated = [];
  let nextId = 0;

  for (let row = 0; row < boardRows; row++) {
    for (let col = 0; col < boardCols; col++) {
      const piece = {
        id: `piece-${nextId}`,
        x: col,
        y: row,
        w: 1,
        h: 1,
        accent: false,
        textureIndex: floor(random(metalTextures.length))
      };

      generated.push(piece);
      nextId += 1;
    }
  }

  const removalCount = min(REMOVED_BLOCK_COUNT, generated.length);

  for (let i = 0; i < removalCount; i++) {
    generated.splice(floor(random(generated.length)), 1);
  }

  if (generated.length > 0) {
    random(generated).accent = true;
  }

  return generated;
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
  background(12, 14, 18);

  const topColor = color(55, 60, 70);
  const bottomColor = color(20, 22, 28);

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
  noStroke();

  if (hasCameraFrame()) {
    drawContinuousCamera(board);
  } else {
    fill(30, 33, 40);
    rect(board.x, board.y, board.width, board.height);
    fill(10, 12, 16, 40);
    rect(board.x, board.y, board.width, board.height);
  }
}

function drawPiece(piece, board, gridX, gridY) {
  const rectData = getRectForCells(board, gridX, gridY, piece.w, piece.h);
  const movable = !activeMove && getMoveOptions(piece).length > 0;

  drawingContext.save();
  drawingContext.shadowColor = movable
    ? "rgba(180, 200, 220, 0.22)"
    : "rgba(0, 0, 0, 0.35)";
  drawingContext.shadowBlur = movable ? 20 : 14;
  drawingContext.shadowOffsetY = 5;

  drawTextureCrop(
    metalTextures[piece.textureIndex],
    rectData.x,
    rectData.y,
    rectData.w,
    rectData.h,
    piece.x,
    piece.y
  );

  drawingContext.restore();

  // Metallic tint overlay
  noStroke();
  fill(piece.accent ? color(200, 170, 80, 30) : color(180, 190, 210, 18));
  rect(rectData.x, rectData.y, rectData.w, rectData.h, BLOCK_RADIUS);

  // Specular highlight strip at top
  fill(255, 255, 255, 50);
  rect(rectData.x + 3, rectData.y + 2, rectData.w - 6, rectData.h * 0.18, BLOCK_RADIUS - 1);

  // Metallic border
  noFill();
  stroke(piece.accent ? color(220, 190, 100, 200) : color(200, 210, 230, 130));
  strokeWeight(1.2);
  rect(rectData.x, rectData.y, rectData.w, rectData.h, BLOCK_RADIUS);
}

function drawHud() {
  fill(210, 220, 235);
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
  // Use equal cell size on both axes so pieces are visually square
  const cellSize = min(
    (width - CELL_GAP * (boardCols - 1)) / boardCols,
    (height - CELL_GAP * (boardRows - 1)) / boardRows
  );
  const boardWidth = cellSize * boardCols + CELL_GAP * (boardCols - 1);
  const boardHeight = cellSize * boardRows + CELL_GAP * (boardRows - 1);

  return {
    x: (width - boardWidth) / 2,
    y: (height - boardHeight) / 2,
    cellWidth: cellSize,
    cellHeight: cellSize,
    width: boardWidth,
    height: boardHeight
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
    // Horizontal rectangle: left/right only
    if (canSlide(piece, -1, 0, occupied)) options.push({ dx: -1, dy: 0 });
    if (canSlide(piece, 1, 0, occupied)) options.push({ dx: 1, dy: 0 });
  } else if (piece.h > piece.w) {
    // Vertical rectangle: up/down only
    if (canSlide(piece, 0, -1, occupied)) options.push({ dx: 0, dy: -1 });
    if (canSlide(piece, 0, 1, occupied)) options.push({ dx: 0, dy: 1 });
  } else {
    // Square: all four directions
    if (canSlide(piece, -1, 0, occupied)) options.push({ dx: -1, dy: 0 });
    if (canSlide(piece, 1, 0, occupied)) options.push({ dx: 1, dy: 0 });
    if (canSlide(piece, 0, -1, occupied)) options.push({ dx: 0, dy: -1 });
    if (canSlide(piece, 0, 1, occupied)) options.push({ dx: 0, dy: 1 });
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
      return piece;
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

  if (piece.w === piece.h) {
    // Square: pick direction from dominant drag axis
    if (abs(dx) < DRAG_THRESHOLD && abs(dy) < DRAG_THRESHOLD) {
      return null;
    }

    if (abs(dx) >= abs(dy)) {
      if (dx < 0) return options.find(o => o.dx < 0) || null;
      return options.find(o => o.dx > 0) || null;
    } else {
      if (dy < 0) return options.find(o => o.dy < 0) || null;
      return options.find(o => o.dy > 0) || null;
    }
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

  const piece = getPieceAtPoint(x, y);

  if (!piece) {
    dragSelection = null;
    return false;
  }

  dragSelection = {
    piece,
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
