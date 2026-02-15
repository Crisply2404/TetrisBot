(() => {
  const DEFAULT_TIMEOUT_MS = 2200;
  const START_TIMEOUT_MS = 15000;
  const ADVANCE_TIMEOUT_MS = 900;
  const SEVEN_BAG_MOD = 7;

  function normalizePiece(p) {
    if (!p) return null;
    const s = String(p).trim().toUpperCase();
    return ["I", "O", "T", "S", "Z", "J", "L"].includes(s) ? s : null;
  }

  function allowedMovePiecesForState(state, settings) {
    const current = normalizePiece(state?.current);
    const hold = normalizePiece(state?.hold);
    const next1 = Array.isArray(state?.next) ? normalizePiece(state.next[0]) : null;
    if (!current) return { current: null, hold: null, next1: null, allowed: [] };

    // tetr.io 规则：每个块最多 hold 一次（hold 以后直到落地前，不能再次 hold）。
    // 我们用 state.canHold（由 content 脚本推断）来避免“刚 hold 完又建议再 hold 一次”。
    const canHoldNow = state?.canHold !== false;

    // 不允许 Hold：只能放当前块
    if (!settings?.useHold || !canHoldNow) return { current, hold, next1, allowed: [current] };

    // 允许 Hold：
    // - hold 有块：可放 current 或 hold
    // - hold 空：可放 current 或 next1（相当于“先 hold 再放 next1”）
    if (hold) return { current, hold, next1, allowed: [current, hold] };
    if (next1) return { current, hold: null, next1, allowed: [current, next1] };
    return { current, hold: null, next1: null, allowed: [current] };
  }

  function isMovePlausible(state, settings, move) {
    const piece = normalizePiece(move?.piece);
    const { allowed } = allowedMovePiecesForState(state, settings);
    if (!piece || !allowed?.length) return false;
    return allowed.includes(piece);
  }

  function boardTopToTbpBoard(board01Top) {
    const h = Array.isArray(board01Top) ? board01Top.length : 0;
    if (h <= 0) return null;
    const w = Array.isArray(board01Top[0]) ? board01Top[0].length : 0;
    if (w !== 10) return null;
    const H = 40;
    const out = [];
    for (let yBottom = 0; yBottom < H; yBottom++) {
      const yTop = H - 1 - yBottom;
      const srcRow = board01Top[yTop];
      const row = new Array(10);
      for (let x = 0; x < 10; x++) row[x] = srcRow?.[x] ? "G" : null;
      out.push(row);
    }
    return out;
  }

  function safeMod(n, mod) {
    const x = Number(n);
    const m = Number(mod);
    if (!Number.isFinite(x) || !Number.isFinite(m) || m <= 0) return 0;
    return ((x % m) + m) % m;
  }

  function tbpPieceCellsNorth(piece) {
    // TBP 里 y 正向=向上；y=0 是底部。
    // 注意：TBP spec 里 I / O 的“中心点”会随朝向变化，所以 I/O 不能只靠“北向 + 旋转”来推导。
    // 这里只保留 “JLTSZ” 的北向定义（它们的中心点是 SRS 的旋转中心，不随朝向变化）。
    switch (piece) {
      case "T":
        return [
          [-1, 0],
          [0, 0],
          [1, 0],
          [0, 1]
        ];
      case "L":
        return [
          [-1, 0],
          [0, 0],
          [1, 0],
          [1, 1]
        ];
      case "J":
        return [
          [-1, 0],
          [0, 0],
          [1, 0],
          [-1, 1]
        ];
      case "S":
        return [
          [-1, 0],
          [0, 0],
          [0, 1],
          [1, 1]
        ];
      case "Z":
        return [
          [-1, 1],
          [0, 1],
          [0, 0],
          [1, 0]
        ];
      default:
        return null;
    }
  }

  function rotateCell(orientation, x, y) {
    // TBP rotation：east=(y,-x) south=(-x,-y) west=(-y,x)
    switch (orientation) {
      case "east":
        return [y, -x];
      case "south":
        return [-x, -y];
      case "west":
        return [-y, x];
      case "north":
      default:
        return [x, y];
    }
  }

  function tbpPieceCellsRelativeToCenter(piece, orientation) {
    // 返回相对 TBP location (x,y) 的 4 个 mino 偏移（坐标系：x 向右，y 向上；y=0 是底部）
    const o = String(orientation || "north").toLowerCase();

    // TBP spec：O / I 的中心点会随朝向变化（定义为某个特定 mino）。
    if (piece === "O") {
      switch (o) {
        case "east":
          return [
            [0, 0],
            [1, 0],
            [0, -1],
            [1, -1]
          ];
        case "south":
          return [
            [0, 0],
            [-1, 0],
            [0, -1],
            [-1, -1]
          ];
        case "west":
          return [
            [0, 0],
            [-1, 0],
            [0, 1],
            [-1, 1]
          ];
        case "north":
        default:
          return [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1]
          ];
      }
    }

    if (piece === "I") {
      switch (o) {
        case "east":
          // center = middle-top mino
          return [
            [0, -2],
            [0, -1],
            [0, 0],
            [0, 1]
          ];
        case "south":
          // center = middle-right mino
          return [
            [-2, 0],
            [-1, 0],
            [0, 0],
            [1, 0]
          ];
        case "west":
          // center = middle-bottom mino
          return [
            [0, -1],
            [0, 0],
            [0, 1],
            [0, 2]
          ];
        case "north":
        default:
          // center = middle-left mino
          return [
            [-1, 0],
            [0, 0],
            [1, 0],
            [2, 0]
          ];
      }
    }

    // JLTSZ：中心点不随朝向变化，可以用“北向 + 旋转”推导
    const base = tbpPieceCellsNorth(piece);
    if (!base) return null;
    const out = [];
    for (const [dx0, dy0] of base) out.push(rotateCell(o, dx0, dy0));
    return out;
  }

  function tbpMoveToBottomCells(move, boardHeight = 40) {
    const piece = normalizePiece(move?.piece);
    if (!piece) return [];
    const orientation = String(move?.orientation || "north").toLowerCase();
    const rel = tbpPieceCellsRelativeToCenter(piece, orientation);
    if (!rel) return [];
    const cx = Number(move?.x);
    const cy = Number(move?.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return [];

    const out = [];
    for (const [dx, dy] of rel) {
      const x = cx + dx;
      const y = cy + dy;
      out.push({ x, y });
    }
    return out;
  }

  function tbpBoardToBool(board) {
    if (!Array.isArray(board) || board.length !== 40) return null;
    const out = new Array(40);
    for (let y = 0; y < 40; y++) {
      const row = board[y];
      const r = new Array(10);
      for (let x = 0; x < 10; x++) r[x] = !!row?.[x];
      out[y] = r;
    }
    return out;
  }

  function simulateTbpPlacement(boardBool, cellsBottom) {
    const height = 40;
    const width = 10;
    if (!boardBool) return { ok: false, reason: "no-board" };
    const grid = boardBool.map((r) => r.slice());

    // 放置：允许 y>=40（上边界之外）存在，但不参与碰撞/消行统计（更贴近 tetr.io 的“上方缓冲区”体验）
    for (const c of Array.isArray(cellsBottom) ? cellsBottom : []) {
      const x = Number(c?.x);
      const y = Number(c?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: "nan" };
      if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: "non-int" };
      if (x < 0 || x >= width) return { ok: false, reason: "x-oob" };
      if (y < 0) return { ok: false, reason: "y-oob" };
      if (y >= height) continue;
      if (grid[y][x]) return { ok: false, reason: "collision" };
      grid[y][x] = true;
    }

    // 消行
    let cleared = 0;
    const kept = [];
    for (let y = 0; y < height; y++) {
      const row = grid[y];
      let full = true;
      for (let x = 0; x < width; x++) {
        if (!row[x]) {
          full = false;
          break;
        }
      }
      if (full) cleared++;
      else kept.push(row);
    }
    while (kept.length < height) kept.push(new Array(width).fill(false));

    let filledCount = 0;
    for (const row of kept) for (const v of row) if (v) filledCount++;
    const allClear = filledCount === 0 && cleared > 0;

    return { ok: true, cleared, allClear };
  }

  function estimateVsAttack(move, state, settings) {
    // 备注：这是实验功能（可开关）。它只做“当前一步”的粗略伤害估算，未必和 tetr.io 完全一致。
    // 伤害规则参考（用于后续校对/更新）：tetris.wiki/TETR.IO、tetris.johnbeak.cz
    try {
      const board = boardTopToTbpBoard(state?.board);
      const boardBool = tbpBoardToBool(board);
      const cells = tbpMoveToBottomCells(move, 40);
      const sim = simulateTbpPlacement(boardBool, cells);
      if (!sim.ok) return { ok: false, score: -Infinity, reason: sim.reason };

      const cleared = Number(sim.cleared || 0);
      const allClear = !!sim.allClear;
      const piece = normalizePiece(move?.piece);
      const spin = String(move?.spin || "none").toLowerCase();
      const isSpin = spin !== "none";

      const allowedSpins = String(settings?.allowedSpins || "tspins");
      const allowAll = allowedSpins === "allspins";
      const allowT = allowedSpins !== "allspins";

      const isTSpin = piece === "T" && isSpin && cleared > 0;
      const isAnySpin = isSpin && cleared > 0 && (allowAll || (allowT && piece === "T"));

      // 基础伤害（粗略）：优先让“立刻有伤害”的走法靠前
      let base = 0;
      if (isTSpin) {
        const mini = spin === "mini";
        if (cleared === 1) base = mini ? 1 : 2;
        else if (cleared === 2) base = mini ? 2 : 4;
        else if (cleared === 3) base = 6;
        else base = 0;
      } else {
        if (cleared === 4) base = 4;
        else if (cleared === 3) base = 2;
        else if (cleared === 2) base = 1;
        else base = 0;
        // 非 T 的 all-spin 先只给一点点加成（实验）
        if (!isTSpin && isAnySpin && piece !== "T") base += 1;
      }

      const comboNow = Number.isFinite(Number(state?.combo)) ? Math.max(0, Math.floor(Number(state.combo))) : 0;
      const b2bNow = state?.backToBack === true;

      // B2B 资格：T-spin（含 mini）或 Tetris
      const b2bClear = (cleared === 4) || isTSpin;
      const b2bBonus = b2bNow && b2bClear && cleared > 0 ? 1 : 0;

      // 连击：这里只做一个简单的“越高越加分”的近似（实验）
      const nextCombo = cleared > 0 ? comboNow + 1 : 0;
      const comboBonus = cleared > 0 ? Math.max(0, Math.min(6, Math.floor(nextCombo / 2))) : 0;

      const allClearBonus = allClear ? 10 : 0;

      const score = base + b2bBonus + comboBonus + allClearBonus;
      return { ok: true, score, detail: { base, b2bBonus, comboBonus, allClearBonus, cleared, spin } };
    } catch {
      return { ok: false, score: -Infinity, reason: "exception" };
    }
  }

  // CC2 默认权重（来自 ref/cold-clear-2/src/default.json 的 freestyle_weights）
  // 说明：CC1（WASM）本身的内部评分我们改不了；这里做的是“拿 CC1 返回的候选落点，再用 CC2 的权重思路重排一遍”。
  const CC2_FREESTYLE_WEIGHTS = {
    cell_coveredness: -0.2,
    max_cell_covered_height: 6,
    holes: -1.5,
    row_transitions: -0.2,
    height: -0.4,
    height_upper_half: -1.5,
    height_upper_quarter: -5.0,
    tetris_well_depth: 0.3,

    has_back_to_back: 0.5,
    wasted_t: -1.5,

    normal_clears: [0.0, -2.0, -1.5, -1.0, 3.5],
    mini_spin_clears: [0.0, -1.5, -1.0],
    spin_clears: [0.0, 1.0, 4.0, 6.0],
    back_to_back_clear: 1.0,
    combo_attack: 1.5,
    perfect_clear: 15.0,
    perfect_clear_override: true
  };

  function clampIndex(i, n) {
    const x = Number(i);
    if (!Number.isFinite(x)) return 0;
    const r = Math.floor(x);
    if (r < 0) return 0;
    if (r >= n) return n - 1;
    return r;
  }

  function colHeightsFromBottomGrid(grid) {
    const height = Array.isArray(grid) ? grid.length : 0;
    const width = 10;
    const heights = new Array(width).fill(0);
    if (!height) return heights;
    for (let x = 0; x < width; x++) {
      let h = 0;
      for (let y = height - 1; y >= 0; y--) {
        if (grid[y]?.[x]) {
          h = y + 1;
          break;
        }
      }
      heights[x] = h;
    }
    return heights;
  }

  function countHolesAndCoveredness(grid, maxCoverHeight) {
    const height = Array.isArray(grid) ? grid.length : 0;
    const width = 10;
    let holes = 0;
    let coveredness = 0;
    if (!height) return { holes, coveredness };

    for (let x = 0; x < width; x++) {
      let colHeight = 0;
      for (let y = height - 1; y >= 0; y--) {
        if (grid[y]?.[x]) {
          colHeight = y + 1;
          break;
        }
      }
      for (let y = 0; y < colHeight; y++) {
        if (!grid[y]?.[x]) {
          holes += 1;
          coveredness += Math.min(colHeight - y, maxCoverHeight);
        }
      }
    }

    return { holes, coveredness };
  }

  function rowTransitionsHeuristic(grid) {
    const height = Array.isArray(grid) ? grid.length : 0;
    const width = 10;
    let t = 0;
    if (!height) return 0;
    for (let y = 0; y < height; y++) {
      let prev = 1; // 左墙视为满
      for (let x = 0; x < width; x++) {
        const cur = grid[y]?.[x] ? 1 : 0;
        if (cur !== prev) t += 1;
        prev = cur;
      }
      if (prev !== 1) t += 1; // 右墙
    }
    return t;
  }

  function tetrisWellDepthHeuristic(grid, heights) {
    const height = Array.isArray(grid) ? grid.length : 0;
    const width = 10;
    if (!height) return 0;
    const hs = Array.isArray(heights) ? heights : colHeightsFromBottomGrid(grid);
    let wellCol = 0;
    for (let x = 1; x < width; x++) {
      if (hs[x] < hs[wellCol]) wellCol = x;
    }
    const wellH = hs[wellCol] || 0;
    let depth = 0;
    for (let y = wellH; y < height; y++) {
      let ok = true;
      for (let x = 0; x < width; x++) {
        if (x === wellCol) continue;
        if (!grid[y]?.[x]) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      depth += 1;
    }
    return depth;
  }

  function applyTbpPlacementReturnGrid(boardBool, cellsBottom) {
    const height = 40;
    const width = 10;
    if (!boardBool) return { ok: false, reason: "no-board" };
    const grid = boardBool.map((r) => r.slice());

    for (const c of Array.isArray(cellsBottom) ? cellsBottom : []) {
      const x = Number(c?.x);
      const y = Number(c?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: "nan" };
      if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: "non-int" };
      if (x < 0 || x >= width) return { ok: false, reason: "x-oob" };
      if (y < 0) return { ok: false, reason: "y-oob" };
      if (y >= height) continue; // 上边界之外不参与碰撞/消行
      if (grid[y][x]) return { ok: false, reason: "collision" };
      grid[y][x] = true;
    }

    let cleared = 0;
    const kept = [];
    for (let y = 0; y < height; y++) {
      const row = grid[y];
      let full = true;
      for (let x = 0; x < width; x++) {
        if (!row[x]) {
          full = false;
          break;
        }
      }
      if (full) cleared++;
      else kept.push(row);
    }
    while (kept.length < height) kept.push(new Array(width).fill(false));

    let filledCount = 0;
    for (const row of kept) for (const v of row) if (v) filledCount++;
    const allClear = filledCount === 0 && cleared > 0;

    return { ok: true, grid: kept, cleared, allClear };
  }

  function scoreMoveByCc2Weights(candidate, state, weights) {
    const board = boardTopToTbpBoard(state?.board);
    const boardBool = tbpBoardToBool(board);
    const cells = tbpMoveToBottomCells(candidate, 40);
    const sim = applyTbpPlacementReturnGrid(boardBool, cells);
    if (!sim.ok) return { ok: false, score: -Infinity, reason: sim.reason };

    const cleared = Number(sim.cleared || 0);
    const allClear = !!sim.allClear;
    const grid = sim.grid;

    const piece = normalizePiece(candidate?.piece);
    const spin = String(candidate?.spin || "none").toLowerCase();
    const isSpin = spin !== "none";
    const isTSpinFull = piece === "T" && spin === "full" && cleared > 0;
    const b2bClear = (cleared === 4) || isTSpinFull;

    const comboNow = Number.isFinite(Number(state?.combo)) ? Math.max(0, Math.floor(Number(state.combo))) : 0;
    const b2bNow = state?.backToBack === true;
    const nextCombo = cleared > 0 ? comboNow + 1 : 0;

    let reward = 0.0;
    let evalv = 0.0;

    if (allClear) reward += weights.perfect_clear;

    if (!allClear || !weights.perfect_clear_override) {
      if (b2bNow && b2bClear && cleared > 0) reward += weights.back_to_back_clear;

      if (!isSpin) {
        reward += weights.normal_clears[clampIndex(cleared, weights.normal_clears.length)];
      } else if (spin === "mini") {
        reward += weights.mini_spin_clears[clampIndex(cleared, weights.mini_spin_clears.length)];
      } else {
        reward += weights.spin_clears[clampIndex(cleared, weights.spin_clears.length)];
      }

      const comboAttack = Math.floor(Math.max(0, nextCombo - 1) / 2);
      reward += weights.combo_attack * comboAttack;
    }

    // checklist：浪费 T（更像 cc2 的“别随便丢 T”）
    if (piece === "T" && (cleared < 2 || spin !== "full")) reward += weights.wasted_t;
    if (b2bNow) evalv += weights.has_back_to_back;

    // 结构特征
    const heights = colHeightsFromBottomGrid(grid);
    const highest = Math.max(...heights);
    evalv += weights.height * highest;
    if (highest > 10) evalv += weights.height_upper_half * (highest - 10);
    if (highest > 15) evalv += weights.height_upper_quarter * (highest - 15);

    const { holes, coveredness } = countHolesAndCoveredness(grid, Number(weights.max_cell_covered_height) || 6);
    evalv += weights.holes * holes;
    evalv += weights.cell_coveredness * coveredness;

    const rt = rowTransitionsHeuristic(grid);
    evalv += weights.row_transitions * rt;

    const wellDepth = tetrisWellDepthHeuristic(grid, heights);
    evalv += weights.tetris_well_depth * wellDepth;

    const score = reward + evalv;
    return {
      ok: true,
      score,
      detail: { cleared, allClear, spin, holes, coveredness, rowTransitions: rt, wellDepth, highest, nextCombo }
    };
  }

  function extractSuggestionMove(msg, settings, state) {
    if (!msg || msg.type !== "suggestion") return null;
    const moves = Array.isArray(msg.moves) ? msg.moves : Array.isArray(msg.mvs) ? msg.mvs : Array.isArray(msg.payload?.moves) ? msg.payload.moves : null;
    if (!Array.isArray(moves) || !moves.length) return null;

    // 解析出可用落点
    const parsed = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (!m?.location) continue;
      const loc = m.location;
      const piece = normalizePiece(loc.type || loc.piece || loc.kind || loc.name || loc?.["type"]);
      const orientation = String(loc.orientation || loc.rotation || "north").toLowerCase();
      const x = Number(loc.x);
      const y = Number(loc.y);
      const spin = String(m.spin || "none").toLowerCase();
      if (!piece || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      parsed.push({ i, piece, orientation, x, y, spin });
    }
    if (!parsed.length) return null;

    const pickFirstByIndex = (arr) => {
      if (!Array.isArray(arr) || !arr.length) return null;
      let b = arr[0];
      for (const x of arr) if (x.i < b.i) b = x;
      return b;
    };

    const allowedNow = allowedMovePiecesForState(state, settings)?.allowed || [];
    const allowedCandidates = parsed.filter((p) => allowedNow.includes(p.piece)).filter((p) => p.i >= 0);
    const baseCandidates = allowedCandidates.length ? allowedCandidates : parsed;

    // 选择策略（让“为啥不是选最优解”变成可控选项）
    const strategy = String(settings?.pickStrategy || "strict");
    const isVs = settings?.modePreset === "vs";

    // 默认：严格选第 1 名（TBP 规范也是这么建议的）
    let best = pickFirstByIndex(baseCandidates) || parsed[0];
    let pickStrategy = "strict:first";

    if (strategy === "preferSpins" && isVs) {
      const allowedSpins = String(settings?.allowedSpins || "tspins");
      const preferAll = allowedSpins === "allspins";
      const preferT = allowedSpins !== "allspins";
      // 只在“前几名”里偏好旋转，避免硬打旋导致策略变蠢
      const maxRankT = 24;
      const maxRankSpin = 12;

      const spinMoves = baseCandidates.filter((p) => p.spin !== "none");
      const tSpinMoves = spinMoves.filter((p) => p.piece === "T");
      const within = (arr, maxRank) => arr.filter((p) => p.i < maxRank);

      const preferredT = preferT ? pickFirstByIndex(within(tSpinMoves, maxRankT)) : null;
      const preferredAny = preferAll ? pickFirstByIndex(within(spinMoves, maxRankSpin)) : null;
      const preferred = preferredT || preferredAny || null;
      if (preferred) {
        best = preferred;
        pickStrategy = preferred === preferredT ? `vs:preferT@${maxRankT}` : `vs:preferSpin@${maxRankSpin}`;
      } else {
        pickStrategy = "vs:preferSpins:fallbackFirst";
      }
    } else if (strategy === "damage" && isVs) {
      const N = 30;
      const topN = baseCandidates.slice().sort((a, b) => a.i - b.i).slice(0, Math.min(N, baseCandidates.length));
      let bestByScore = null;
      let bestScore = -Infinity;
      for (const c of topN) {
        const est = estimateVsAttack(c, state, settings);
        const score = Number(est?.score);
        if (!Number.isFinite(score)) continue;
        if (score > bestScore) {
          bestScore = score;
          bestByScore = c;
        } else if (score === bestScore && bestByScore && c.i < bestByScore.i) {
          bestByScore = c;
        }
      }
      if (bestByScore) {
        best = bestByScore;
        pickStrategy = `vs:damage@${topN.length}`;
      } else {
        pickStrategy = "vs:damage:fallbackFirst";
      }
    }

    if (strategy === "cc2Weights") {
      // 只对 cc1 做重排：cc2 自己内部就有权重/策略了
      const N = 40;
      const topN = baseCandidates.slice().sort((a, b) => a.i - b.i).slice(0, Math.min(N, baseCandidates.length));
      let bestByScore = null;
      let bestScore = -Infinity;
      for (const c of topN) {
        const est = scoreMoveByCc2Weights(c, state, CC2_FREESTYLE_WEIGHTS);
        const score = Number(est?.score);
        if (!Number.isFinite(score)) continue;
        if (score > bestScore) {
          bestScore = score;
          bestByScore = c;
        } else if (score === bestScore && bestByScore && c.i < bestByScore.i) {
          bestByScore = c;
        }
      }
      if (bestByScore) {
        best = bestByScore;
        pickStrategy = `cc1:cc2Weights@${topN.length}`;
      } else {
        pickStrategy = "cc1:cc2Weights:fallbackFirst";
      }
    }

    return {
      piece: best.piece,
      orientation: best.orientation,
      x: best.x,
      y: best.y,
      spin: best.spin,
      moveIndex: best.i,
      moveCount: moves.length,
      pickStrategy
    };
  }

  class TbpColdClearClient {
    constructor(opts) {
      this._opts = opts || {};
      this._worker = null;
      this._ready = null;
      this._queue = Promise.resolve();
      this._waiters = [];
      this._lastKey = "";
      this._lastResp = null;
      this._lastWorkerError = null;
      this._started = false;
      this._queueLen = 0;
      this._bagStartIndex = null; // next[] 里“新袋开始”的下标（0..6）；readFullBag=false 时可为 null
      this._workerCrashed = false;
      this._phase = "init";
      this._lastPostType = null;
      this._lastPostAt = 0;
      this._lastWaitLabel = null;
    }

    _failAllWaiters(reason) {
      try {
        const err = reason instanceof Error ? reason : new Error(String(reason || "worker error"));
        for (const w of this._waiters) {
          try {
            w?.reject?.(err);
          } catch {}
        }
      } finally {
        this._waiters = [];
      }
    }

    _formatWorkerError(e) {
      try {
        const msg = String(e?.message || e?.error?.message || "worker error");
        const file = e?.filename ? String(e.filename) : "";
        const line = Number.isFinite(e?.lineno) ? `:${Number(e.lineno)}` : "";
        const col = Number.isFinite(e?.colno) ? `:${Number(e.colno)}` : "";
        return file ? `${msg} @ ${file}${line}${col}` : msg;
      } catch {
        return "worker error";
      }
    }

    _teardownWorker(reason) {
      try {
        this._workerCrashed = true;
        this._started = false;
        this._queueLen = 0;
        this._bagStartIndex = null;
        this._ready = null;
        this._phase = "dead";
        this._failAllWaiters(reason || "worker crashed");
        if (this._worker) {
          try {
            this._worker.terminate();
          } catch {}
        }
      } finally {
        this._worker = null;
      }
    }

    _ensureWorker() {
      if (this._worker && !this._workerCrashed) return;
      if (this._worker) this._teardownWorker("recreate");
      const url = this._opts.workerUrl;
      this._workerCrashed = false;
      this._worker = new Worker(url);
      this._worker.onmessage = (e) => {
        const data = e?.data || null;
        if (!data || typeof data !== "object") return;
        this._dispatch(data);
      };
      this._worker.onerror = (e) => {
        this._lastWorkerError = this._formatWorkerError(e);
        this._teardownWorker(this._lastWorkerError);
        if (this._opts.debug) console.warn("[TBP] cold-clear worker error:", e);
      };
      this._worker.onmessageerror = (e) => {
        this._lastWorkerError = this._formatWorkerError(e);
        this._teardownWorker(this._lastWorkerError);
        if (this._opts.debug) console.warn("[TBP] cold-clear worker messageerror:", e);
      };
    }

    _dispatch(msg) {
      for (let i = 0; i < this._waiters.length; i++) {
        const w = this._waiters[i];
        if (!w) continue;
        let ok = false;
        try {
          ok = w.predicate(msg);
        } catch {
          ok = false;
        }
        if (ok) {
          this._waiters.splice(i, 1);
          w.resolve(msg);
          return;
        }
      }
    }

    _waitFor(predicate, timeoutMs) {
      const ms = timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const label = String(this._lastWaitLabel || "等待 cold-clear 返回超时");
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve: null, reject: null };
        const timeoutId = setTimeout(() => {
          try {
            const idx = this._waiters.indexOf(waiter);
            if (idx >= 0) this._waiters.splice(idx, 1);
          } catch {}
          reject(new Error(label));
        }, ms);

        waiter.resolve = (msg) => {
          clearTimeout(timeoutId);
          resolve(msg);
        };
        waiter.reject = (err) => {
          clearTimeout(timeoutId);
          reject(err);
        };

        this._waiters.push(waiter);
      });
    }

    _post(msg) {
      this._ensureWorker();
      try {
        this._lastPostType = msg?.type ? String(msg.type) : null;
        this._lastPostAt = Date.now();
      } catch {}
      this._worker.postMessage(msg);
    }

    async _ensureReady(settings) {
      if (this._ready) return await this._ready;
      this._ensureWorker();

      this._ready = (async () => {
        // 等到 worker 真正启动（我们在 tbpWorker.js 里会 post 一条 tbp_boot）。
        // 如果这一步不等，rules/start 可能发得太早被吞，表现就是“一直超时”。
        this._phase = "wait:tbp_boot";
        this._lastWaitLabel = "等待 cold-clear worker 启动确认超时";
        const bootMsg = await this._waitFor((m) => m.type === "tbp_boot" || m.type === "info" || m.type === "error", 6000).catch((e) => {
          const extra = this._lastWorkerError ? `；worker：${this._lastWorkerError}` : "";
          throw new Error(`cold-clear worker 没启动（${e?.message || e}${extra}）`);
        });
        if (bootMsg?.type === "error") {
          const reason = String(bootMsg.reason || bootMsg.payload?.reason || bootMsg.error || "unknown");
          throw new Error(`cold-clear worker 启动失败：${reason}`);
        }

        this._phase = "send:rules";
        this._post({ type: "rules", randomizer: "seven_bag" });
        this._phase = "wait:ready";
        this._lastWaitLabel = "等待 cold-clear ready 超时";
        const readyMsg = await this._waitFor((m) => m.type === "ready" || m.type === "error", 6000).catch((e) => {
          const extra = this._lastWorkerError ? `；worker：${this._lastWorkerError}` : "";
          throw new Error(`cold-clear 没收到 ready（${e?.message || e}${extra}）`);
        });
        if (readyMsg?.type === "error") {
          const reason = String(readyMsg.reason || readyMsg.payload?.reason || readyMsg.error || "unknown");
          throw new Error(`cold-clear 规则握手失败：${reason}`);
        }
        return true;
      })();

      return await this._ready;
    }

    async reset() {
      this._lastKey = "";
      this._lastResp = null;
      this._lastWorkerError = null;
      this._started = false;
      this._queueLen = 0;
      this._bagStartIndex = null;
      this._ready = null;
      this._teardownWorker("reset");
    }

    _buildQueueFromState(state, settings, bagStartIndexGuess) {
      const current = normalizePiece(state?.current);
      if (!current) return { ok: false, error: "缺少 current" };
      const next = Array.isArray(state?.next) ? state.next.map(normalizePiece).filter(Boolean) : [];

      // 优先用“智能 7bag 队列”（6→12→递减→6 的基础输入）
      try {
        const api = typeof window !== "undefined" ? window.tbpSevenBagQueue : null;
        const buildSmartQueue = api?.buildSmartQueue;
        if (typeof buildSmartQueue === "function") {
          const built = buildSmartQueue({
            current,
            next,
            readFullBag: !!settings?.readFullBag,
            prevBagStartIndex: Number.isFinite(bagStartIndexGuess) ? Number(bagStartIndexGuess) : null
          });
          const queue = Array.isArray(built?.queue) ? built.queue.map(normalizePiece).filter(Boolean) : [];
          const bag_state = Array.isArray(built?.bagState) ? built.bagState.map(normalizePiece).filter(Boolean) : [];
          const bagStartIndex = Number.isFinite(built?.bagStartIndex) ? Number(built.bagStartIndex) : null;

          if (queue.length && bag_state.length) return { ok: true, current, next, queue, bag_state, bagStartIndex, mode: built?.mode || null };
        }
      } catch {}

      // 兜底：readFullBag=true -> 12，否则 6；bag_state 给满袋（更稳）
      const maxQueue = settings?.readFullBag ? 12 : 6;
      const queue = [current, ...next].slice(0, maxQueue);
      const bag_state = ["I", "O", "T", "S", "Z", "J", "L"];
      return { ok: true, current, next, queue, bag_state, bagStartIndex: null, mode: "fallback-fixed" };
    }

    _buildStartFromState(state, settings, bagStartIndexGuess) {
      const q = this._buildQueueFromState(state, settings, bagStartIndexGuess);
      if (!q?.ok) return q;

      const hold = normalizePiece(state?.hold);
      const board = boardTopToTbpBoard(state?.board);
      if (!board || !q.queue.length) return { ok: false, error: "状态不足（board/queue）" };

      return {
        ok: true,
        start: {
          type: "start",
          hold: settings?.useHold ? hold : null,
          queue: q.queue,
          combo: Number.isFinite(Number(state?.combo)) ? Math.max(0, Math.floor(Number(state.combo))) : 0,
          back_to_back: state?.backToBack === true,
          board,
          randomizer: { type: "seven_bag", bag_state: q.bag_state }
        },
        meta: { current: q.current, hold, queue: q.queue, bag_state: q.bag_state, bagStartIndex: q.bagStartIndex, mode: q.mode || null }
      };
    }

    _toFrontendMove(moveLike) {
      const piece = normalizePiece(moveLike?.piece || moveLike?.type || moveLike?.kind);
      if (!piece) return null;
      const orientation = String(moveLike?.orientation || moveLike?.rotation || "north").toLowerCase();
      const x = Number(moveLike?.x);
      const y = Number(moveLike?.y);
      const spin = String(moveLike?.spin || "none").toLowerCase();
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const location = { type: piece, kind: piece, piece, orientation, x, y };
      return { location, spin };
    }

    suggestFromState(state, settings, sync) {
      // 串行化：一个 worker 同时只能跑一个 suggest，否则消息会串。
      this._queue = this._queue
        .catch(() => null)
        .then(async () => {
          const key = `${state?.boardHash || ""}:${state?.current || ""}:${state?.hold || "-"}:${Array.isArray(state?.next) ? state.next.join("") : ""}:${
            settings?.useHold ? "H1" : "H0"
          }:${settings?.readFullBag ? "B1" : "B0"}:${settings?.modePreset || "40l"}:${String(settings?.allowedSpins || "tspins")}:${String(
            settings?.pickStrategy || "strict"
          )}:C${Number.isFinite(Number(state?.combo)) ? Math.max(0, Math.floor(Number(state.combo))) : 0}:${
            state?.backToBack === true ? "B2B1" : "B2B0"
          }`;

          if (key && key === this._lastKey && this._lastResp?.ok) return this._lastResp;

          const syncType = String(sync?.type || "start");
          const advanceByRaw = Number(sync?.advanceBy ?? sync?.advance ?? sync?.consume ?? 1);
          const advanceBy = Number.isFinite(advanceByRaw) && advanceByRaw >= 1 && advanceByRaw <= 3 ? Math.floor(advanceByRaw) : 1;

          const bagGuess =
            syncType === "advance" && this._started && Number.isFinite(this._bagStartIndex)
              ? safeMod(Number(this._bagStartIndex) - advanceBy, SEVEN_BAG_MOD)
              : this._bagStartIndex;

          // 先按“当前局面”算出我们希望喂给 cold-clear 的队列（长度可能变：6/8..12）
          const desired = this._buildQueueFromState(state, settings, bagGuess);
          if (desired?.ok && Number.isFinite(desired.bagStartIndex)) this._bagStartIndex = desired.bagStartIndex;

          const allowedInfo = allowedMovePiecesForState(state, settings);
          const debugBase = {
            syncType,
            advanceBy,
            desiredQueue: Array.isArray(desired?.queue) ? desired.queue.slice() : null,
            desiredBagState: Array.isArray(desired?.bag_state) ? desired.bag_state.slice() : null,
            desiredBagStartIndex: Number.isFinite(desired?.bagStartIndex) ? desired.bagStartIndex : null,
            desiredMode: desired?.mode || null,
            phase: this._phase || null,
            lastPostType: this._lastPostType || null,
            lastPostAt: this._lastPostAt || null,
            stateCurrent: allowedInfo.current,
            stateHold: allowedInfo.hold,
            stateNext1: allowedInfo.next1,
            allowedMovePieces: allowedInfo.allowed
          };

          let didRestart = false;
          let usedQueue = Array.isArray(desired?.queue) ? desired.queue.slice() : null;
          let usedBagState = Array.isArray(desired?.bag_state) ? desired.bag_state.slice() : null;
          let usedMode = desired?.mode || null;
          let usedBagStartIndex = Number.isFinite(desired?.bagStartIndex) ? desired.bagStartIndex : null;
          let addedPieces = null;
          let timeoutMs = null;

          try {
            await this._ensureReady(settings);

            // 允许自动恢复：如果 cold-clear 返回了“不可能的块”（不在 current/hold/next1 中），我们会强制重启并重算一次。
            // 这通常意味着 bot 内部状态和当前局面不同步（比如增量推进时状态跑飞/撤回导致时间倒退/worker 崩溃后残留）。
            let recoveredOnce = false;
            for (let attempt = 0; attempt < 2; attempt++) {
              if (attempt > 0) {
                recoveredOnce = true;
                this._started = false;
              }

              didRestart = false;
              usedQueue = Array.isArray(desired?.queue) ? desired.queue.slice() : null;
              usedBagState = Array.isArray(desired?.bag_state) ? desired.bag_state.slice() : null;
              usedMode = desired?.mode || null;
              usedBagStartIndex = Number.isFinite(desired?.bagStartIndex) ? desired.bagStartIndex : null;
              addedPieces = null;
              timeoutMs = null;

              if (syncType === "advance" && this._started) {
                const mv = this._toFrontendMove(sync?.move);
                if (!mv) {
                  // move 不完整：退回重启
                  this._started = false;
                } else {
                  // 兼容不同实现的字段名：play 里同时放 move/mv
                  this._phase = "send:play";
                  this._post({ type: "play", move: mv, mv });

                  // 按“变长队列”策略：按队列长度变化补齐 0~N 个 new_piece
                  const prevLen = Number(this._queueLen || 0);
                  const lenAfterPlay = prevLen - advanceBy;
                  const desiredQueue = Array.isArray(desired?.queue) ? desired.queue.map(normalizePiece).filter(Boolean) : [];

                  if (!prevLen || lenAfterPlay < 1 || !desiredQueue.length) {
                    // 本地跟踪失效：退回重启
                    this._started = false;
                  } else if (desiredQueue.length < lenAfterPlay) {
                    // 想缩得比“自然消耗”还多（比如 8→6），TBP 没法删队列，只能重启
                    this._started = false;
                  } else {
                    const toAdd = desiredQueue.slice(lenAfterPlay);
                    addedPieces = toAdd.slice();
                    for (const p0 of toAdd) {
                      const p = normalizePiece(p0);
                      this._phase = "send:new_piece";
                      if (p) this._post({ type: "new_piece", piece: p });
                    }
                    this._queueLen = desiredQueue.length;
                  }
                }
              }

              if (!this._started) {
                const built = this._buildStartFromState(state, settings, bagGuess);
                if (!built?.ok) {
                  const resp = { ok: false, engine: "cold-clear-v1", error: built?.error || "状态不足（board/queue）", debug: debugBase };
                  this._lastKey = key;
                  this._lastResp = resp;
                  return resp;
                }

                // 重启（start）会非常慢，所以尽量只在必要时做：不满足 advance 条件就 stop + start。
                try {
                  this._phase = "send:stop";
                  this._post({ type: "stop" });
                } catch {}
                this._phase = "send:start";
                this._post(built.start);
                this._started = true;
                didRestart = true;

                // 记录“我们这次喂给 cold-clear 的队列长度”，后续 advance 才能正确补齐 new_piece
                this._queueLen = Array.isArray(built?.meta?.queue) ? built.meta.queue.length : 0;
                if (Number.isFinite(built?.meta?.bagStartIndex)) this._bagStartIndex = built.meta.bagStartIndex;

                usedQueue = Array.isArray(built?.meta?.queue) ? built.meta.queue.slice() : usedQueue;
                usedBagState = Array.isArray(built?.meta?.bag_state) ? built.meta.bag_state.slice() : usedBagState;
                usedMode = built?.meta?.mode || usedMode;
                usedBagStartIndex = Number.isFinite(built?.meta?.bagStartIndex) ? built.meta.bagStartIndex : usedBagStartIndex;
              }

              this._phase = "send:suggest";
              this._post({ type: "suggest" });

              timeoutMs = didRestart ? START_TIMEOUT_MS : ADVANCE_TIMEOUT_MS;
              this._phase = "wait:suggestion";
              this._lastWaitLabel = `等待 cold-clear 返回超时（${timeoutMs}ms）`;
              const msg = await this._waitFor((m) => m.type === "suggestion" || m.type === "error", timeoutMs);

              if (msg?.type === "error") {
                const reason = String(msg.reason || msg.payload?.reason || msg.error || "unknown");
                const resp = {
                  ok: false,
                  engine: "cold-clear-v1",
                  error: `cold-clear 报错：${reason}`,
                  debug: {
                    ...debugBase,
                    didRestart,
                    timeoutMs,
                    usedQueue,
                    usedBagState,
                    usedBagStartIndex,
                    usedMode,
                    addedPieces,
                    phase: this._phase || null,
                    workerError: this._lastWorkerError || null,
                    workerCrashed: !!this._workerCrashed
                  }
                };
                this._lastKey = key;
                this._lastResp = resp;
                this._started = false;
                return resp;
              }

            const move = extractSuggestionMove(msg, settings, state);
            if (!move) {
              const resp = {
                ok: false,
                engine: "cold-clear-v1",
                error: "cold-clear 没给出有效落点",
                  debug: {
                    ...debugBase,
                    didRestart,
                    timeoutMs,
                    usedQueue,
                    usedBagState,
                    usedBagStartIndex,
                    usedMode,
                    addedPieces,
                    phase: this._phase || null,
                    workerError: this._lastWorkerError || null,
                    workerCrashed: !!this._workerCrashed
                  }
                };
                this._lastKey = key;
                this._lastResp = resp;
                this._started = false;
                return resp;
              }

              // 关键：如果 bot 给了“不可能的块”，说明内部状态跑飞了。强制重启并重算一次。
              if (!isMovePlausible(state, settings, move)) {
                const allowedNow = allowedMovePiecesForState(state, settings);
                const err = `cold-clear 不同步：返回 ${move.piece}，但当前可用只有 ${allowedNow.allowed.join("/") || "-"}`;
                if (recoveredOnce) {
                  const resp = {
                    ok: false,
                    engine: "cold-clear-v1",
                    error: err,
                    debug: {
                      ...debugBase,
                      didRestart,
                      timeoutMs,
                      usedQueue,
                      usedBagState,
                      usedBagStartIndex,
                      usedMode,
                      addedPieces,
                      phase: this._phase || null,
                      movePiece: move.piece,
                      moveIndex: Number.isFinite(move.moveIndex) ? move.moveIndex : null,
                      moveCount: Number.isFinite(move.moveCount) ? move.moveCount : null,
                      moveSpin: move.spin || null,
                      pickStrategy: move.pickStrategy || null,
                      workerError: this._lastWorkerError || null,
                      workerCrashed: !!this._workerCrashed,
                      recoveredOnce: true
                    }
                  };
                  this._lastKey = key;
                  this._lastResp = resp;
                  this._started = false;
                  return resp;
                }
                // retry once
                continue;
              }

              const currentPiece = normalizePiece(state?.current);
              const useHold = !!currentPiece && move.piece !== currentPiece;
              const resp = {
                ok: true,
                engine: "cold-clear-v1",
                move,
                useHold,
                debug: {
                  ...debugBase,
                  didRestart,
                  timeoutMs,
                  usedQueue,
                  usedBagState,
                  usedBagStartIndex,
                  usedMode,
                  addedPieces,
                  movePiece: move.piece,
                  moveIndex: Number.isFinite(move.moveIndex) ? move.moveIndex : null,
                  moveCount: Number.isFinite(move.moveCount) ? move.moveCount : null,
                  moveSpin: move.spin || null,
                  pickStrategy: move.pickStrategy || null,
                  move_info: msg.move_info || null,
                  phase: this._phase || null,
                  workerError: this._lastWorkerError || null,
                  workerCrashed: !!this._workerCrashed,
                  recoveredOnce
                }
              };

              this._lastKey = key;
              this._lastResp = resp;
              return resp;
            }

            const resp = {
              ok: false,
              engine: "cold-clear-v1",
              error: "cold-clear 没返回结果（未知原因）",
              debug: { ...debugBase, phase: this._phase || null, workerError: this._lastWorkerError || null, workerCrashed: !!this._workerCrashed }
            };
            this._lastKey = key;
            this._lastResp = resp;
            this._started = false;
            return resp;
          } catch (e) {
            const extra = this._lastWorkerError ? `；worker：${this._lastWorkerError}` : "";
            const msg = String(e?.message || e || "cold-clear error");
            const isTimeout = msg.includes("超时") || msg.includes("timeout") || msg.includes("Timed out");
            const resp = {
              ok: false,
              engine: "cold-clear-v1",
              error: isTimeout ? `等待 cold-clear 返回超时${extra}` : `${msg}${extra}`,
              debug: {
                ...debugBase,
                didRestart,
                timeoutMs,
                usedQueue,
                usedBagState,
                usedBagStartIndex,
                usedMode,
                addedPieces,
                phase: this._phase || null,
                workerError: this._lastWorkerError || null,
                workerCrashed: !!this._workerCrashed
              }
            };
            this._lastKey = key;
            this._lastResp = resp;
            this._started = false;
            return resp;
          }
        });
      return this._queue;
    }
  }

  window.TbpColdClearClient = TbpColdClearClient;
})();
