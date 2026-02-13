(() => {
  const PIECES = /** @type {const} */ (["I", "O", "T", "S", "Z", "J", "L"]);

  const SHAPES = {
    I: [
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1]
      ],
      [
        [2, 0],
        [2, 1],
        [2, 2],
        [2, 3]
      ],
      [
        [0, 2],
        [1, 2],
        [2, 2],
        [3, 2]
      ],
      [
        [1, 0],
        [1, 1],
        [1, 2],
        [1, 3]
      ]
    ],
    O: [
      [
        [1, 0],
        [2, 0],
        [1, 1],
        [2, 1]
      ],
      [
        [1, 0],
        [2, 0],
        [1, 1],
        [2, 1]
      ],
      [
        [1, 0],
        [2, 0],
        [1, 1],
        [2, 1]
      ],
      [
        [1, 0],
        [2, 0],
        [1, 1],
        [2, 1]
      ]
    ],
    T: [
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1]
      ],
      [
        [1, 0],
        [1, 1],
        [2, 1],
        [1, 2]
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2]
      ],
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 2]
      ]
    ],
    S: [
      [
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1]
      ],
      [
        [1, 0],
        [1, 1],
        [2, 1],
        [2, 2]
      ],
      [
        [1, 1],
        [2, 1],
        [0, 2],
        [1, 2]
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 2]
      ]
    ],
    Z: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1]
      ],
      [
        [2, 0],
        [1, 1],
        [2, 1],
        [1, 2]
      ],
      [
        [0, 1],
        [1, 1],
        [1, 2],
        [2, 2]
      ],
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [0, 2]
      ]
    ],
    J: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1]
      ],
      [
        [1, 0],
        [2, 0],
        [1, 1],
        [1, 2]
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [2, 2]
      ],
      [
        [1, 0],
        [1, 1],
        [0, 2],
        [1, 2]
      ]
    ],
    L: [
      [
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1]
      ],
      [
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 2]
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [0, 2]
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [1, 2]
      ]
    ]
  };

  function normalizePieceId(value) {
    if (!value) return null;
    if (typeof value === "string") {
      const upper = value.trim().toUpperCase();
      if (PIECES.includes(upper)) return upper;
      if (upper.length === 1 && PIECES.includes(upper)) return upper;
      return null;
    }
    return null;
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function emptyBoard(height, width) {
    const board = [];
    for (let y = 0; y < height; y++) board.push(new Array(width).fill(0));
    return board;
  }

  function canPlace(board, piece, rotation, x, y) {
    const shape = SHAPES[piece]?.[rotation];
    if (!shape) return false;
    const height = board.length;
    const width = board[0]?.length || 0;
    for (const [dx, dy] of shape) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || px >= width) return false;
      if (py >= height) return false;
      if (py >= 0 && board[py][px]) return false;
    }
    return true;
  }

  function getCells(piece, rotation, x, y) {
    const shape = SHAPES[piece]?.[rotation] || [];
    return shape.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
  }

  function hardDropY(board, piece, rotation, x, startY = -4) {
    let y = startY;
    while (canPlace(board, piece, rotation, x, y + 1)) y += 1;
    return y;
  }

  function place(board, piece, rotation, x, y) {
    const next = cloneBoard(board);
    const height = next.length;
    for (const cell of getCells(piece, rotation, x, y)) {
      if (cell.y >= 0 && cell.y < height) next[cell.y][cell.x] = 1;
    }
    return next;
  }

  function clearLines(board) {
    const width = board[0]?.length || 0;
    const height = board.length;
    const remaining = [];
    let cleared = 0;
    for (let y = 0; y < height; y++) {
      const full = board[y].every((v) => v);
      if (full) cleared += 1;
      else remaining.push(board[y]);
    }
    while (remaining.length < height) remaining.unshift(new Array(width).fill(0));
    return { board: remaining, cleared };
  }

  function columnHeights(board) {
    const height = board.length;
    const width = board[0]?.length || 0;
    const heights = new Array(width).fill(0);
    for (let x = 0; x < width; x++) {
      let h = 0;
      for (let y = 0; y < height; y++) {
        if (board[y][x]) {
          h = height - y;
          break;
        }
      }
      heights[x] = h;
    }
    return heights;
  }

  function countHoles(board) {
    const height = board.length;
    const width = board[0]?.length || 0;
    let holes = 0;
    for (let x = 0; x < width; x++) {
      let foundBlock = false;
      for (let y = 0; y < height; y++) {
        if (board[y][x]) foundBlock = true;
        else if (foundBlock) holes += 1;
      }
    }
    return holes;
  }

  function bumpiness(heights) {
    let b = 0;
    for (let i = 0; i < heights.length - 1; i++) b += Math.abs(heights[i] - heights[i + 1]);
    return b;
  }

  function aggregateHeight(heights) {
    return heights.reduce((a, v) => a + v, 0);
  }

  function scoreBoard(board, cleared, preset) {
    const heights = columnHeights(board);
    const agg = aggregateHeight(heights);
    const holes = countHoles(board);
    const bump = bumpiness(heights);
    const maxH = Math.max(...heights);

    const weights =
      preset === "vs"
        ? { cleared: 1.0, agg: -0.35, holes: -0.9, bump: -0.18, maxH: -0.25 }
        : { cleared: 1.1, agg: -0.4, holes: -1.0, bump: -0.22, maxH: -0.3 };

    return (
      cleared * 10 * weights.cleared +
      agg * weights.agg +
      holes * weights.holes +
      bump * weights.bump +
      maxH * weights.maxH
    );
  }

  function enumeratePlacements(board, piece) {
    const width = board[0]?.length || 0;
    const placements = [];
    for (let r = 0; r < 4; r++) {
      const shape = SHAPES[piece]?.[r];
      if (!shape) continue;
      const minDx = Math.min(...shape.map(([dx]) => dx));
      const maxDx = Math.max(...shape.map(([dx]) => dx));
      const minX = -minDx;
      const maxX = width - 1 - maxDx;
      for (let x = minX; x <= maxX; x++) {
        const y = hardDropY(board, piece, r, x, -4);
        if (!canPlace(board, piece, r, x, y)) continue;
        placements.push({ piece, rotation: r, x, y, cells: getCells(piece, r, x, y) });
      }
    }
    return placements;
  }

  function applyPlacement(board, placement) {
    const placed = place(board, placement.piece, placement.rotation, placement.x, placement.y);
    const { board: clearedBoard, cleared } = clearLines(placed);
    return { board: clearedBoard, cleared };
  }

  function pickBestMove(board, piece, preset) {
    const candidates = enumeratePlacements(board, piece);
    let best = null;
    let bestScore = -Infinity;
    for (const move of candidates) {
      const { board: nextBoard, cleared } = applyPlacement(board, move);
      const s = scoreBoard(nextBoard, cleared, preset);
      if (s > bestScore) {
        bestScore = s;
        best = { ...move, cleared, score: s };
      }
    }
    return best;
  }

  function beamSearchPlan(board, pieces, preset, beamWidth = 20) {
    let beam = [{ board, score: 0, moves: [] }];
    for (let depth = 0; depth < pieces.length; depth++) {
      const piece = pieces[depth];
      if (!piece) break;
      const nextBeam = [];
      for (const node of beam) {
        const moves = enumeratePlacements(node.board, piece);
        for (const move of moves) {
          const { board: nextBoard, cleared } = applyPlacement(node.board, move);
          const delta = scoreBoard(nextBoard, cleared, preset);
          nextBeam.push({
            board: nextBoard,
            score: node.score + delta,
            moves: node.moves.concat([{ ...move, cleared }])
          });
        }
      }
      nextBeam.sort((a, b) => b.score - a.score);
      beam = nextBeam.slice(0, beamWidth);
      if (!beam.length) break;
    }
    return beam[0]?.moves || [];
  }

  const api = {
    normalizePieceId,
    emptyBoard,
    cloneBoard,
    canPlace,
    hardDropY,
    getCells,
    clearLines,
    enumeratePlacements,
    applyPlacement,
    pickBestMove,
    beamSearchPlan
  };

  const root = typeof self !== "undefined" ? self : window;
  root.tbpTetrisSim = api;
})();

