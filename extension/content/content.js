(() => {
  const PAGE_SOURCE = "tbp-page";
  const EXT_SOURCE = "tbp-ext";

  const overlay = window.tbpOverlay;
  const sim = window.tbpTetrisSim;

  let settings = null;
  let pageConnected = false;
  let lastPageError = null;
  let pageHookReady = false;
  let lastPageMessageAt = 0;
  let lastState = null;
  let lastSuggestion = null;
  let lastEngineDebug = null;
  let lastOverlayBounds = null;
  let lastOverlayBoundsMode = null;
  let lastBaseBounds = null;
  let lastLiveKey = "";
  let liveInFlight = null;
  let liveRequestSeq = 0;
  let lastAppliedLiveRequestId = 0;
  let lastEngineName = "cold-clear-v1";
  let lastColdClearError = null;
  let lastColdClearDebug = null;
  let lastLockedViewport = null;
  let holdUsedThisTurn = false;

  // 一致性缓存：同一个局面（board/current/hold/next + 设置）算过一次就复用。
  // 这样你 undo 回到同一局面时，不会出现“cc 又换了一种建议”的感觉。
  const liveSemanticCache = new Map(); // semanticKey -> { at, suggestion, engine, coldClearError, coldClearDebug }
  const LIVE_CACHE_MAX = 50;

  // cold-clear 增量同步用：记录上一手“冷清算出来的落点”与对应的局面
  let lastCcState = null;
  let lastCcMove = null;
  let lastCcCells = null;

  // Zen 撤回/重开（时间倒退）用：先按“立即 reset”处理（你要求暂时不要防抖）。
  // 后续如果你又想要防抖/限流，我们再加回来。

  let detailsCacheKey = "";
  let detailsCacheSuggestion = null;
  let detailsInFlight = null;

  function postToPage(type, payload) {
    window.postMessage({ source: EXT_SOURCE, type, payload }, "*");
  }

  function markPageHookAlive() {
    pageHookReady = true;
    lastPageMessageAt = Date.now();
  }

  function injectPageHook() {
    if (document.documentElement?.querySelector("script[data-tbp-pagehook]")) return;
    const script = document.createElement("script");
    script.setAttribute("data-tbp-pagehook", "1");
    script.src = chrome.runtime.getURL("page/pageHook.js");
    script.async = false;
    script.onload = () => script.remove();
    script.onerror = () => script.remove();
    document.documentElement.appendChild(script);
  }

  function requestMainWorldInjection() {
    try {
      chrome.runtime.sendMessage({ type: "TBP_INJECT_MAIN" }, (resp) => {
        if (resp?.ok) return;
        if (resp?.error && settings?.debug) console.warn("[TBP] main-world inject failed:", resp.error);
      });
    } catch {}
  }

  function pingPageHook() {
    postToPage("TBP_PING", { ts: Date.now() });
    window.setTimeout(() => {
      if (pageHookReady) return;
      lastPageError = "页面 Hook 没响应（可能被网站拦了）。先试试：刷新页面 + 重新加载扩展。";
    }, 1500);
  }

  function normalizeBoard(board, expectedHeight = 40, expectedWidth = 10) {
    if (!Array.isArray(board) || !Array.isArray(board[0])) return null;
    const h = board.length;
    const w = board[0].length;
    if (w !== expectedWidth) return null;
    if (h === expectedHeight) return board;
    if (h > expectedHeight) return board.slice(h - expectedHeight);
    const pad = sim?.emptyBoard?.(expectedHeight - h, expectedWidth);
    if (!pad) return null;
    return pad.concat(board);
  }

  function computeOverlayBoundsFromState(state) {
    const raw = state?.bounds || null;
    if (!raw || ![raw.x, raw.y, raw.width, raw.height].every(Number.isFinite)) {
      return { bounds: null, mode: "missing", raw: raw || null };
    }

    // 如果用户做过校准，就尽量“别再自动改动 base bounds 的定义”，避免出现“我刚对齐又漂了”。
    // 这里锁定的意思：裁剪逻辑（是否把包含 buffer 的 bounds 裁成可见 20 行）按校准当时的模式来。
    const lockEnabled = !!settings?.boundsLock;
    const lockMode = String(settings?.boundsLockBaseMode || "");
    if (lockEnabled) {
      if (lockMode === "croppedFromTotal") {
        const bufferRows = Number.isFinite(state?.bufferRows) ? Number(state.bufferRows) : 0;
        const visibleRows = Number.isFinite(state?.visibleRows) ? Number(state.visibleRows) : 20;
        const totalRows = Math.max(1, bufferRows + visibleRows);
        const cellH = raw.height / totalRows;
        const y = raw.y + cellH * bufferRows;
        const height = cellH * visibleRows;
        const cropped = { x: raw.x, y, width: raw.width, height };
        return { bounds: cropped, mode: "locked:croppedFromTotal", raw };
      }
      return { bounds: raw, mode: "locked:raw", raw };
    }

    const bufferRows = Number.isFinite(state?.bufferRows) ? Number(state.bufferRows) : 0;
    const visibleRows = Number.isFinite(state?.visibleRows) ? Number(state.visibleRows) : 20;
    const totalRows = Math.max(1, bufferRows + visibleRows);

    // 经验：当取到的 bounds 把隐藏 buffer 行也算进来时，叠加层会“看起来变大”，并且和格子对不上。
    // 解决：如果 bounds 的比例更像 10x(可见+buffer)，就把它裁到只剩可见区域（通常是底部 20 行）。
    const ratio = raw.width / Math.max(1, raw.height);
    const expectedVisibleRatio = 10 / Math.max(1, visibleRows);
    const expectedTotalRatio = 10 / totalRows;

    const looksLikeTotal =
      bufferRows > 0 && totalRows > visibleRows && Math.abs(ratio - expectedTotalRatio) + 0.01 < Math.abs(ratio - expectedVisibleRatio);

    if (!looksLikeTotal) return { bounds: raw, mode: "visible", raw };

    const cellH = raw.height / totalRows;
    const y = raw.y + cellH * bufferRows;
    const height = cellH * visibleRows;
    const cropped = { x: raw.x, y, width: raw.width, height };
    return { bounds: cropped, mode: "croppedFromTotal", raw };
  }

  function applyBoundsAdjust(bounds, adjust) {
    if (!bounds) return null;
    if (!adjust || typeof adjust !== "object") return bounds;
    const dxr = Number(adjust.dxr ?? 0);
    const dyr = Number(adjust.dyr ?? 0);
    const wr = Number(adjust.wr ?? 1);
    const hr = Number(adjust.hr ?? 1);
    if (![dxr, dyr, wr, hr].every(Number.isFinite)) return bounds;
    return {
      x: bounds.x + bounds.width * dxr,
      y: bounds.y + bounds.height * dyr,
      width: bounds.width * wr,
      height: bounds.height * hr
    };
  }

  function normalizeViewport(vp) {
    const w = Number(vp?.w);
    const h = Number(vp?.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { w, h };
  }

  function normalizeBoundsAdjust(adjust) {
    if (!adjust || typeof adjust !== "object") return null;
    const dxr = Number(adjust.dxr);
    const dyr = Number(adjust.dyr);
    const wr = Number(adjust.wr);
    const hr = Number(adjust.hr);
    if (![dxr, dyr, wr, hr].every(Number.isFinite)) return null;
    return { dxr, dyr, wr, hr };
  }

  function viewportDistance(a, b) {
    const va = normalizeViewport(a);
    const vb = normalizeViewport(b);
    if (!va || !vb) return Infinity;
    const nw = Math.max(1, (va.w + vb.w) / 2);
    const nh = Math.max(1, (va.h + vb.h) / 2);
    const dw = (va.w - vb.w) / nw;
    const dh = (va.h - vb.h) / nh;
    return Math.sqrt(dw * dw + dh * dh);
  }

  function median(nums) {
    const arr = Array.isArray(nums) ? nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y) : [];
    const n = arr.length;
    if (!n) return null;
    const mid = Math.floor(n / 2);
    return n % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }

  function pickBoundsAdjustForViewport(viewportNow, lockBaseMode, samples) {
    const vp = normalizeViewport(viewportNow);
    if (!vp) return null;
    const mode = String(lockBaseMode || "");
    const arr = Array.isArray(samples) ? samples : [];

    const valid = [];
    for (const s of arr) {
      const svp = normalizeViewport(s?.viewport);
      const adj = normalizeBoundsAdjust(s?.boundsAdjust);
      if (!svp || !adj) continue;
      if (mode && String(s?.boundsLockBaseMode || "") && String(s.boundsLockBaseMode) !== mode) continue;
      valid.push({ s, vp: svp, adj, dist: viewportDistance(vp, svp) });
    }
    if (!valid.length) return null;

    valid.sort((a, b) => a.dist - b.dist);

    // 只看离得最近的几条：更符合“我在哪个窗口校准，就尽量用那条校准”的直觉。
    const K = Math.min(6, valid.length);
    const near = valid.slice(0, K);

    // 在 near 内做一个“温和的去离群”：防止极小窗口的误差样本把整体拉歪。
    const med = {
      dxr: median(near.map((x) => x.adj.dxr)),
      dyr: median(near.map((x) => x.adj.dyr)),
      wr: median(near.map((x) => x.adj.wr)),
      hr: median(near.map((x) => x.adj.hr))
    };

    const dev = (k) => median(near.map((x) => Math.abs(Number(x.adj[k]) - Number(med[k])))) ?? 0;
    const mad = { dxr: dev("dxr"), dyr: dev("dyr"), wr: dev("wr"), hr: dev("hr") };

    const filtered = near.filter((x) => {
      // MAD 过小会导致阈值过严，所以加一个最低阈值（大概“肉眼能接受”的误差范围）。
      const thr = (k) => Math.max(0.04, 3 * Number(mad[k] || 0));
      return (
        Math.abs(x.adj.dxr - med.dxr) <= thr("dxr") &&
        Math.abs(x.adj.dyr - med.dyr) <= thr("dyr") &&
        Math.abs(x.adj.wr - med.wr) <= thr("wr") &&
        Math.abs(x.adj.hr - med.hr) <= thr("hr")
      );
    });

    const use = filtered.length ? filtered : near;

    // 距离越近权重越高（避免跨太远窗口“硬套”）
    let sw = 0;
    let dxr = 0;
    let dyr = 0;
    let wr = 0;
    let hr = 0;
    for (const x of use) {
      const d = Number.isFinite(x.dist) ? x.dist : 1;
      const w = 1 / (d * d + 1e-4);
      sw += w;
      dxr += x.adj.dxr * w;
      dyr += x.adj.dyr * w;
      wr += x.adj.wr * w;
      hr += x.adj.hr * w;
    }
    if (!sw) return null;
    return { dxr: dxr / sw, dyr: dyr / sw, wr: wr / sw, hr: hr / sw };
  }

  function isRectLike(r) {
    return !!r && typeof r === "object" && [r.x, r.y, r.width, r.height].every(Number.isFinite);
  }

  function isSameBoard(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let y = 0; y < a.length; y++) {
      const ra = a[y];
      const rb = b[y];
      if (!Array.isArray(ra) || !Array.isArray(rb) || ra.length !== rb.length) return false;
      for (let x = 0; x < ra.length; x++) {
        if ((ra[x] ? 1 : 0) !== (rb[x] ? 1 : 0)) return false;
      }
    }
    return true;
  }

  function applyCellsToBoard(board01Top, cells) {
    if (!sim?.cloneBoard || !sim?.clearLines) return null;
    if (!Array.isArray(board01Top) || !Array.isArray(cells)) return null;
    const next = sim.cloneBoard(board01Top);
    const height = next.length;
    const width = next[0]?.length || 0;
    for (const c of cells) {
      const x = Number(c?.x);
      const y = Number(c?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 0 || x >= width) continue;
      if (y < 0 || y >= height) continue;
      next[y][x] = 1;
    }
    return sim.clearLines(next)?.board || next;
  }

  function computeBestCurrent(state, settings) {
    const debug = {
      preset: settings?.modePreset === "vs" ? "vs" : "40l",
      current: state?.current ?? null,
      boardH: Array.isArray(state?.board) ? state.board.length : null,
      boardW: Array.isArray(state?.board?.[0]) ? state.board[0].length : null,
      reason: null,
      placements: null
    };

    if (!sim) {
      debug.reason = "计算模块没加载（tbpTetrisSim 不存在）";
      return { suggestion: null, debug };
    }

    const board = normalizeBoard(state?.board);
    if (!board) {
      debug.reason = "棋盘尺寸不对（需要 10 列；高度会自动补到 40 行）";
      return { suggestion: null, debug };
    }

    const preset = settings?.modePreset === "vs" ? "vs" : "40l";
    const current = sim.normalizePieceId(state?.current);
    if (!current) {
      debug.reason = "拿不到当前块（current 不是 I/O/T/S/Z/J/L）";
      return { suggestion: null, debug };
    }

    const placements = sim.enumeratePlacements(board, current);
    debug.placements = placements.length;
    if (!placements.length) {
      debug.reason = "当前块没有任何可落点（可能棋盘解析错/或者游戏不在可操作状态）";
      return { suggestion: null, debug };
    }

    const best = sim.pickBestMove(board, current, preset);
    if (!best?.cells?.length) {
      debug.reason = "内部评分器返回空（异常情况）";
      return { suggestion: null, debug };
    }

    return {
      suggestion: { useHold: false, rotation: best.rotation, x: best.x, y: best.y, cells: best.cells },
      debug
    };
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
    // 返回相对 TBP location (x,y) 的 4 个 mino 偏移
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
    for (const [dx0, dy0] of base) {
      out.push(rotateCell(o, dx0, dy0));
    }
    return out;
  }

  function snapNearInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return x;
    const r = Math.round(x);
    return Math.abs(x - r) < 1e-6 ? r : x;
  }

  function tbpMoveToTopCells(move, boardHeight = 40) {
    const piece = sim?.normalizePieceId?.(move?.piece) || null;
    if (!piece) return [];
    const orientation = String(move?.orientation || "north").toLowerCase();
    const rel = tbpPieceCellsRelativeToCenter(piece, orientation);
    if (!rel) return [];
    const cx = Number(move?.x);
    const cy = Number(move?.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return [];

    const out = [];
    for (const [dx, dy] of rel) {
      const x = snapNearInt(cx + dx);
      const yBottom = snapNearInt(cy + dy);
      const yTop = boardHeight - 1 - yBottom;
      out.push({ x, y: yTop });
    }
    return out;
  }

  function validateTopCellsAgainstBoard01(cellsTop, board01Top) {
    const height = Array.isArray(board01Top) ? board01Top.length : 0;
    const width = 10;
    const collisions = [];
    const outOfBounds = [];
    const nonInteger = [];
    for (const c of Array.isArray(cellsTop) ? cellsTop : []) {
      const x = c?.x;
      const y = c?.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        nonInteger.push({ x, y });
        continue;
      }
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        nonInteger.push({ x, y });
        continue;
      }
      if (x < 0 || x >= width || y < 0 || y >= height) {
        outOfBounds.push({ x, y });
        continue;
      }
      if (board01Top?.[y]?.[x]) {
        collisions.push({ x, y });
      }
    }
    return {
      ok: collisions.length === 0 && outOfBounds.length === 0 && nonInteger.length === 0,
      collisions,
      outOfBounds,
      nonInteger,
      height
    };
  }

  async function requestColdClear(state, settings, sync, requestId) {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "TBP_CC_SUGGEST", payload: { state, settings, sync: sync || null, requestId: Number(requestId) } },
        (resp) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve({ ok: false, error: String(err.message || err) });
        resolve(resp || null);
        }
      );
    });
  }

  function requestColdClearReset(reason) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "TBP_CC_RESET", payload: { reason: String(reason || "") } }, (resp) => {
          const err = chrome.runtime.lastError;
          if (err && settings?.debug) console.warn("[TBP] cold-clear reset failed:", err.message || err);
          resolve(resp || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function computeLiveAsync() {
    if (!settings?.enabled) return;
    if (!lastState?.current || !lastState?.board) return;

    const state = lastState;

    const key = stateKeyForLive(state, settings);
    const semanticKey = semanticKeyForLive(state, settings);

    // 同一个语义局面已经有建议了，就别重复算（避免 frame 变化导致频繁重算）
    if (semanticKey && semanticKey === lastLiveKey && lastSuggestion?.cells?.length) return;
    if (liveInFlight?.semanticKey && liveInFlight.semanticKey === semanticKey) return;

    // 先查一致性缓存：命中则直接复用，不再问 cold-clear
    try {
      const cached = semanticKey ? liveSemanticCache.get(semanticKey) : null;
      if (cached?.suggestion?.cells?.length) {
        lastEngineName = cached.engine || "cold-clear-v1";
        lastColdClearError = cached.coldClearError || null;
        lastColdClearDebug = cached.coldClearDebug || null;
        lastSuggestion = cached.suggestion;
        lastEngineDebug = settings?.debug ? { fromCache: true } : null;
        lastLiveKey = semanticKey || "";
        draw();
        return;
      }
    } catch {}

    const requestId = ++liveRequestSeq;
    const run = (async () => {
      // 默认：重启（start）一次从当前局面算。
      // 优化：如果上一手玩家确实按我们建议下了，就走 play/new_piece 推进状态，避免每次都重启 cold-clear（会很慢，甚至超时）。
      let sync = { type: "start" };
      try {
        if (lastCcMove && lastCcCells && lastCcState) {
          const prev = lastCcState;
          const prevBoard = normalizeBoard(prev?.board);
          const nowBoard = normalizeBoard(state?.board);
          const predicted = prevBoard ? applyCellsToBoard(prevBoard, lastCcCells) : null;

          const prevCurrent = sim?.normalizePieceId?.(prev?.current) || null;
          const prevHold = sim?.normalizePieceId?.(prev?.hold) || null;
          const prevNext = Array.isArray(prev?.next) ? prev.next.map((p) => sim.normalizePieceId(p)).filter(Boolean) : [];

          const nowCurrent = sim?.normalizePieceId?.(state?.current) || null;
          const nowHold = sim?.normalizePieceId?.(state?.hold) || null;

          const placed = sim?.normalizePieceId?.(lastCcMove?.piece) || null;
          const usedHold = !!placed && !!prevCurrent && placed !== prevCurrent;

          let expectedCurrent = prevNext[0] || null;
          if (usedHold && !prevHold) expectedCurrent = prevNext[1] || prevNext[0] || null;
          const expectedHold = usedHold ? prevCurrent : prevHold;

          const boardOk = !!predicted && !!nowBoard && isSameBoard(predicted, nowBoard);
          const curOk = !expectedCurrent || nowCurrent === expectedCurrent;
          const holdOk = !expectedHold || nowHold === expectedHold;

           if (boardOk && curOk && holdOk) {
            // 关键：TBP 的 play/new_piece 需要知道“这一手消耗了队列里几个 piece”
            // - 普通情况：落 1 个块，只消耗 1 个
            // - 用了 hold 且上一手 hold 为空：会额外消耗 1 个（hold 会先把 next 顶上来）
            const advanceBy = usedHold && !prevHold ? 2 : 1;
            sync = { type: "advance", move: lastCcMove, advanceBy };
          }
        }
      } catch {}

      const resp = await requestColdClear(state, settings, sync, requestId);

      // 关键修复：丢弃“过期结果”，避免 overlay 显示上一手/更早的建议，导致你看到“建议的块根本不存在”。
      // 如果请求回来时 key 已经变了（玩家已经走到下一手），就不更新 lastSuggestion。
      try {
        // 1) 语义局面不一致：丢弃（frame 会一直变，不能拿它做一致性判断）
        if (semanticKey !== semanticKeyForLive(lastState, settings)) {
          return;
        }
        // 1.5) 不是当前这次 in-flight：丢弃（更严格，避免旧回包污染）
        if (liveInFlight?.requestId !== requestId || liveInFlight?.semanticKey !== semanticKey) {
          return;
        }
        // 2) requestId 不是最新的：丢弃（关键：Zen undo 可能回到“同一个 key”，仅靠 key 会被旧回包污染）
        if (requestId < lastAppliedLiveRequestId) {
          return;
        }
      } catch {}

      if (resp?.ok && resp.move) {
        lastAppliedLiveRequestId = Math.max(lastAppliedLiveRequestId, requestId);
        lastEngineName = resp.engine || "cold-clear-v1";
        lastColdClearError = null;
        lastColdClearDebug = resp?.debug || null;
        const cells = tbpMoveToTopCells(resp.move, 40);
        const cellCheck = validateTopCellsAgainstBoard01(cells, state?.board);
        if (!cells?.length || !cellCheck.ok) {
          // 这是“根因定位”的关键证据：如果落点压到已有块/越界，说明：
          // - 要么我们对 TBP 的坐标/旋转解释错了（会稳定复现）
          // - 要么 cold-clear 内部状态跑飞/不同步（通常会偶发，reset 后恢复）
          const p = String(resp?.move?.piece || "?");
          const o = String(resp?.move?.orientation || "north");
          const x = Number(resp?.move?.x);
          const y = Number(resp?.move?.y);
          const why = cellCheck.nonInteger?.length ? "坐标不是整数" : cellCheck.outOfBounds?.length ? "越界" : "压到已有块";
          const example = (cellCheck.collisions?.[0] || cellCheck.outOfBounds?.[0] || cellCheck.nonInteger?.[0]) ?? null;
          const where = example && Number.isFinite(example.x) && Number.isFinite(example.y) ? `（比如 ${example.x},${example.y}）` : "";

          lastColdClearError = `cold-clear 落点不合法：${p} ${o} x=${Number.isFinite(x) ? x : "?"} y=${
            Number.isFinite(y) ? y : "?"
          }，原因=${why}${where}`;
          lastColdClearDebug = {
            ...(resp?.debug || null),
            badMove: { piece: p, orientation: o, x: Number.isFinite(x) ? x : null, y: Number.isFinite(y) ? y : null },
            cellCheck
          };

          // 不要把“错误落点”写入一致性缓存；并强制 reset，让下一次从 start 重新同步。
          lastCcState = null;
          lastCcMove = null;
          lastCcCells = null;
          lastSuggestion = null;
          lastEngineDebug = settings?.debug ? { engine: lastEngineName, ...lastColdClearDebug, sync } : { sync };
          lastLiveKey = semanticKey || "";
          try {
            if (semanticKey) liveSemanticCache.delete(semanticKey);
          } catch {}
          await requestColdClearReset(`invalid_move:${why}`);
          draw();
          return;
        }

        lastSuggestion = { useHold: !!resp.useHold, rotation: 0, x: 0, y: 0, cells };

        // 关键：如果这一步建议“先 Hold 再放某块”，那么玩家按下 Hold 后，当前块会变。
        // 为了让你感觉“前后不矛盾”，我们把“按 Hold 后的那个局面”也预先写进一致性缓存：
        // 这样玩家按了 Hold 以后，叠加层/详情页会继续显示同一个落点（而不是又重新算出另一个 T 落点）。
        try {
          if (resp.useHold && semanticKey && settings?.useHold) {
            const cur0 = String(state?.current || "");
            const hold0 = state?.hold ? String(state.hold) : null;
            const next0 = Array.isArray(state?.next) ? state.next.slice() : [];
            const movePiece = String(resp?.move?.piece || "");

            let post = null;
            if (hold0) {
              // hold 有块：交换，不消耗 next
              if (movePiece === hold0) {
                post = {
                  boardHash: state.boardHash,
                  board: state.board,
                  current: hold0,
                  hold: cur0 || null,
                  next: next0,
                  canHold: false
                };
              }
            } else {
              // hold 空：hold 会把 next1 顶上来（并消耗 1 个 next）
              const next1 = next0[0] ? String(next0[0]) : "";
              if (movePiece && next1 && movePiece === next1) {
                post = {
                  boardHash: state.boardHash,
                  board: state.board,
                  current: next1,
                  hold: cur0 || null,
                  next: next0.slice(1),
                  canHold: false
                };
              }
            }

            if (post) {
              const postKey = semanticKeyForLive(post, settings);
              if (postKey) {
                liveSemanticCache.set(postKey, {
                  at: Date.now(),
                  suggestion: { ...lastSuggestion, useHold: false },
                  engine: lastEngineName,
                  coldClearError: null,
                  coldClearDebug: lastColdClearDebug ? { ...lastColdClearDebug, holdCarry: true } : { holdCarry: true }
                });
                trimLiveCacheIfNeeded();
              }
            }
          }
        } catch {}

        // 记录“这一步的建议”，方便下一次状态变化时判断能否用 play/new_piece 增量推进
        lastCcState = state;
        lastCcMove = resp.move;
        lastCcCells = cells;

        lastEngineDebug = settings?.debug ? { engine: lastEngineName, ...resp.debug, sync } : { preset: settings?.modePreset || "40l", reason: null, sync };

        // 写入一致性缓存（语义 key）
        try {
          if (semanticKey) {
            liveSemanticCache.set(semanticKey, {
              at: Date.now(),
              suggestion: lastSuggestion,
              engine: lastEngineName,
              coldClearError: null,
              coldClearDebug: lastColdClearDebug
            });
            trimLiveCacheIfNeeded();
          }
        } catch {}

        lastLiveKey = semanticKey || "";
        draw();
        return;
      }

      // 按当前要求：cold-clear 失败时不要回退到 sim（避免两套逻辑“看起来同步了但其实不一样”）
      lastAppliedLiveRequestId = Math.max(lastAppliedLiveRequestId, requestId);
      lastEngineName = resp?.engine || "cold-clear-v1";
      lastColdClearError = resp?.error ? String(resp.error) : "cold-clear 没有响应/不支持";
      lastColdClearDebug = resp?.debug || null;
      lastCcState = null;
      lastCcMove = null;
      lastCcCells = null;
      lastSuggestion = null;
      lastEngineDebug = settings?.debug ? { coldClearError: lastColdClearError, coldClearDebug: lastColdClearDebug, sync } : { sync };
      lastLiveKey = semanticKey || "";
      draw();
    })();

    liveInFlight = { key, semanticKey, requestId, promise: run };
    run.finally(() => {
      if (liveInFlight?.semanticKey === semanticKey && liveInFlight?.requestId === requestId) liveInFlight = null;
    });
  }

  function computePlanSuggestion(state, settings) {
    if (!sim) return null;
    const board = normalizeBoard(state?.board);
    if (!board) return null;

    const preset = settings?.modePreset === "vs" ? "vs" : "40l";
    const current = sim.normalizePieceId(state?.current);
    const hold = sim.normalizePieceId(state?.hold);
    const next = Array.isArray(state?.next) ? state.next.map(sim.normalizePieceId).filter(Boolean) : [];
    if (!current) return null;

    const lookahead = next.slice(0, 5);
    const basePieces = [current, ...lookahead].filter(Boolean);

    const allowHold = !!settings?.useHold;
    if (!allowHold) {
      const moves = sim.beamSearchPlan(board, basePieces, preset, 25);
      const first = moves[0] || null;
      return {
        useHold: false,
        rotation: first?.rotation ?? 0,
        x: first?.x ?? 0,
        y: first?.y ?? 0,
        cells: first?.cells ?? [],
        plan: moves.map((m, idx) => ({
          index: idx,
          piece: m.piece,
          rotation: m.rotation,
          x: m.x,
          y: m.y,
          cells: m.cells,
          cleared: m.cleared
        }))
      };
    }

    const noHoldMoves = sim.beamSearchPlan(board, basePieces, preset, 25);

    let holdMoves = null;
    if (hold) {
      const pieces = [hold, ...lookahead].filter(Boolean);
      holdMoves = sim.beamSearchPlan(board, pieces, preset, 25);
    } else if (lookahead.length) {
      const pieces = [lookahead[0], ...lookahead.slice(1)].filter(Boolean);
      holdMoves = sim.beamSearchPlan(board, pieces, preset, 25);
    }

    const noHoldScore = noHoldMoves.reduce((a, m) => a + (m.cleared || 0), 0);
    const holdScore = (holdMoves || []).reduce((a, m) => a + (m.cleared || 0), 0);
    const useHold = !!holdMoves && holdScore > noHoldScore;
    const moves = useHold ? holdMoves || [] : noHoldMoves;
    const first = moves[0] || null;
    return {
      useHold,
      rotation: first?.rotation ?? 0,
      x: first?.x ?? 0,
      y: first?.y ?? 0,
      cells: first?.cells ?? [],
      plan: moves.map((m, idx) => ({
        index: idx,
        piece: m.piece,
        rotation: m.rotation,
        x: m.x,
        y: m.y,
        cells: m.cells,
        cleared: m.cleared
      }))
    };
  }

  function computeLive() {
    // 兼容旧调用点：改为异步算（cold-clear 走 offscreen/worker）
    computeLiveAsync().catch(() => {});
  }

  function computeSnapshotSuggestion(state) {
    return Promise.resolve(computePlanSuggestion(state, settings));
  }

  function stateKeyForDetails(state) {
    if (!state) return "";
    const next = Array.isArray(state.next) ? state.next.join("") : "";
    const hold = state.hold || "-";
    return `${state.boardHash || ""}:${state.current || ""}:${hold}:${next}`;
  }

  function semanticKeyForLive(state, settings) {
    if (!state) return "";
    const next = Array.isArray(state?.next) ? state.next.join("") : "";
    const canHold = state?.canHold === false ? "CH0" : "CH1";
    return `${state.boardHash || ""}:${state.current || ""}:${state.hold || "-"}:${next}:${canHold}:${settings?.modePreset || "40l"}:${
      settings?.useHold ? "H1" : "H0"
    }:${settings?.readFullBag ? "B1" : "B0"}:${String(settings?.allowedSpins || "tspins")}`;
  }

  function stateKeyForLive(state, settings) {
    if (!state) return "";
    const frame = Number.isFinite(state?.frame) ? Number(state.frame) : 0;
    return `${frame}:${semanticKeyForLive(state, settings)}`;
  }

  function trimLiveCacheIfNeeded() {
    try {
      if (liveSemanticCache.size <= LIVE_CACHE_MAX) return;
      const arr = Array.from(liveSemanticCache.entries());
      arr.sort((a, b) => (a?.[1]?.at || 0) - (b?.[1]?.at || 0));
      while (liveSemanticCache.size > LIVE_CACHE_MAX && arr.length) {
        const k = arr.shift()?.[0];
        if (k) liveSemanticCache.delete(k);
      }
    } catch {}
  }

  async function getOrComputeDetailsSuggestion(state) {
    const key = stateKeyForDetails(state);
    if (!key) return null;
    if (detailsCacheKey === key && detailsCacheSuggestion) return detailsCacheSuggestion;

    if (detailsInFlight?.key === key) return await detailsInFlight.promise;

    const promise = computeSnapshotSuggestion(state)
      .then((suggestion) => {
        if (suggestion) {
          detailsCacheKey = key;
          detailsCacheSuggestion = suggestion;
        }
        return suggestion || null;
      })
      .catch(() => null)
      .finally(() => {
        if (detailsInFlight?.key === key) detailsInFlight = null;
      });

    detailsInFlight = { key, promise };
    return await promise;
  }

  function draw() {
    if (!overlay) return;
    if (!settings?.enabled) {
      overlay.clear();
      return;
    }
    if (!pageConnected || !lastState?.bounds) {
      lastOverlayBounds = null;
      lastOverlayBoundsMode = null;
      lastBaseBounds = null;
      overlay.clear();
      return;
    }

    // “以当前局面为准”：如果建议还没算出来（或还是上一手的），就不要继续画旧建议，避免出现
    // “开局我手里是 S/Z，但画了个 I 的建议”这种错觉。
    const liveSemanticNow = semanticKeyForLive(lastState, settings);
    const suggestionOk = !!liveSemanticNow && liveSemanticNow === lastLiveKey;
    const suggestionForDraw = suggestionOk ? lastSuggestion : null;

    // 校准并锁定后：优先使用“绝对像素框”，避免 base bounds 在不同帧变动导致忽大忽小。
    const locked = settings?.boundsLock && isRectLike(settings?.boundsLockedRect) ? settings.boundsLockedRect : null;
    if (locked) {
      const viewportNow = { w: window.innerWidth, h: window.innerHeight };

      // 用“内存里的 lastLockedViewport”来判断 resize（更可靠：不依赖 storage 读写是否及时生效）
      if (!lastLockedViewport) {
        const vp = settings?.boundsLockedViewport;
        const hasVp = Number.isFinite(vp?.w) && Number.isFinite(vp?.h) && vp.w > 0 && vp.h > 0;
        lastLockedViewport = hasVp ? { w: vp.w, h: vp.h } : { ...viewportNow };
        if (!hasVp) {
          try {
            window.tbpSettings.setSettings({ boundsLockedViewport: viewportNow });
          } catch {}
        }
      }

      const viewportChanged = lastLockedViewport.w !== viewportNow.w || lastLockedViewport.h !== viewportNow.h;

      // 即使锁定，也持续计算 baseBounds（给校准吸附/调试用）
      let baseBounds = null;
      try {
        const r = computeOverlayBoundsFromState(lastState);
        baseBounds = r?.bounds || null;
      } catch {}
      lastBaseBounds = baseBounds;

      let effective = locked;

      // 窗口大小变化后：绝对像素框会失效。此时用 boundsAdjust（相对比例）+ 最新 baseBounds 自动重算，再更新 lockedRect。
      if (viewportChanged) {
        try {
          // 自适应：优先用“同窗口大小下的校准样本”推断 boundsAdjust；没有样本再退回 settings.boundsAdjust。
          const modelAdjust = pickBoundsAdjustForViewport(viewportNow, settings?.boundsLockBaseMode, settings?.scaleSamples);
          const adjust = modelAdjust || settings?.boundsAdjust;
          const recomputed = applyBoundsAdjust(baseBounds, adjust);
          if (isRectLike(recomputed)) {
            effective = recomputed;
            lastLockedViewport = { ...viewportNow };
            try {
              window.tbpSettings.setSettings({ boundsLockedRect: recomputed, boundsLockedViewport: viewportNow });
            } catch {}
          } else {
            // recompute 失败时仍然至少更新 viewport 记录，避免一直重复触发
            lastLockedViewport = { ...viewportNow };
            try {
              window.tbpSettings.setSettings({ boundsLockedViewport: viewportNow });
            } catch {}
          }
        } catch {}
      }

      lastOverlayBounds = effective;
      lastOverlayBoundsMode = viewportChanged ? "lockedRect:recomputed" : "lockedRect";
      overlay.setBounds(effective);
      overlay.drawSuggestion(suggestionForDraw, settings, {
        visibleRows: lastState.visibleRows,
        bufferRows: lastState.bufferRows,
        boundsMode: lastOverlayBoundsMode,
        boundsMeta: lastState.boundsMeta || null
      });
      return;
    }

    const { bounds: baseBounds, mode } = computeOverlayBoundsFromState(lastState);
    lastBaseBounds = baseBounds;
    const bounds = applyBoundsAdjust(baseBounds, settings?.boundsAdjust);
    lastOverlayBounds = bounds;
    lastOverlayBoundsMode = mode;

    if (!bounds) {
      overlay.clear();
      return;
    }

    // 迁移/兜底：老版本只保存了 boundsAdjust + boundsLock，没有保存绝对像素框。
    // 这会导致“放一块后 base bounds 变了 → overlay 又变大/漂移”。
    // 这里在第一次拿到可用 bounds 时把它冻结成 boundsLockedRect。
    if (settings?.boundsLock && !isRectLike(settings?.boundsLockedRect)) {
      try {
        window.tbpSettings.setSettings({ boundsLockedRect: bounds });
      } catch {}
    }

    overlay.setBounds(bounds);
    overlay.drawSuggestion(suggestionForDraw, settings, {
      visibleRows: lastState.visibleRows,
      bufferRows: lastState.bufferRows,
      boundsMode: mode,
      boundsMeta: lastState.boundsMeta || null
    });
  }

  function handlePageMessage(payload) {
    if (!payload) return;
    markPageHookAlive();
    pageConnected = !!payload.connected;
    lastPageError = payload.error || null;
    if (payload.error && settings?.debug) console.warn("[TBP] page error:", payload.error);

    const nextState = payload.state || null;
    if (!nextState) {
      // 典型场景：退出对局/回到菜单时，Hook 还活着但拿不到 game 状态。
      // 这时必须清掉上一局的 lastState/lastSuggestion，否则叠加层会“停在上一局不动”。
      requestColdClearReset("no-state");
      lastState = null;
      lastSuggestion = null;
      lastOverlayBounds = null;
      lastOverlayBoundsMode = null;
      lastBaseBounds = null;
      lastColdClearError = null;
      lastColdClearDebug = null;
      lastCcState = null;
      lastCcMove = null;
      lastCcCells = null;
      lastLiveKey = "";
      liveInFlight = null;
      lastAppliedLiveRequestId = 0;
      holdUsedThisTurn = false;
      try {
        liveSemanticCache.clear();
      } catch {}
      draw();
      return;
    }

    // Zen 撤回/重开等场景：frame 会倒退。此时必须把 cold-clear 的内部状态也重置，否则容易串状态导致超时/崩溃回退。
    try {
      const prevFrame = Number.isFinite(lastState?.frame) ? Number(lastState.frame) : null;
      const nextFrame = Number.isFinite(nextState?.frame) ? Number(nextState.frame) : null;
      if (prevFrame !== null && nextFrame !== null && nextFrame < prevFrame) {
        requestColdClearReset(`rewind:${prevFrame}->${nextFrame}`);
        lastCcState = null;
        lastCcMove = null;
        lastCcCells = null;
        lastLiveKey = "";
        liveInFlight = null;
        holdUsedThisTurn = false;
        try {
          liveSemanticCache.clear();
        } catch {}
      }
    } catch {}

    // Hold 一致性：tetr.io 规则是“每个块最多 hold 一次”，hold 以后直到落地前都不能再 hold。
    // 但我们拿不到一个稳定的 canHold 字段，所以用“状态变化”自己推断：
    // - 一旦棋盘变了（说明块落地/行清/吃垃圾），就进入新一手，hold 又恢复可用
    // - 棋盘没变时，只在“看起来确实发生了 hold 交换”的情况下，才认定这手已经 hold 过
    //   （避免开局/倒计时/生成新块时 current 变化，被误判成“已经 hold 过”，导致可Hold=否）
    try {
      const prev = lastState || null;
      const prevHash = prev?.boardHash || null;
      const nextHash = nextState?.boardHash || null;
      const boardSame = !!prevHash && !!nextHash && prevHash === nextHash;
      if (!boardSame) {
        holdUsedThisTurn = false;
      } else {
        const pc = prev?.current ? String(prev.current) : "";
        const nc = nextState?.current ? String(nextState.current) : "";
        const ph = prev?.hold ? String(prev.hold) : "";
        const nh = nextState?.hold ? String(nextState.hold) : "";
        const pn1 = Array.isArray(prev?.next) && prev.next[0] ? String(prev.next[0]) : "";
        const nn1 = Array.isArray(nextState?.next) && nextState.next[0] ? String(nextState.next[0]) : "";

        let didHold = false;

        // 1) hold 槽里本来就有块：典型 hold 是 current/hold 互换
        if (pc && ph && nc && nh) {
          if (nc === ph && nh === pc) didHold = true;
        }

        // 2) hold 槽本来是空的：hold 会把 next1 顶上来，同时把 current 放进 hold，并“消耗”一个 next
        //    注意：我们只做“足够强的特征匹配”，不强依赖 next 全部对齐（tetr.io 内部实现可能会在帧边界抖动）。
        if (!didHold && pc && !ph && nc && nh && pn1) {
          if (nh === pc && nc === pn1) didHold = true;
        }

        if (didHold) holdUsedThisTurn = true;
      }

      // 写回到 state：引擎会用它避免“建议你连续 hold 两次”这种不合法操作
      nextState.canHold = !!settings?.useHold && !holdUsedThisTurn;
    } catch {
      nextState.canHold = !!settings?.useHold;
    }

    // 关键：一旦局面语义变了（棋盘/当前块/hold/next 等），就先清掉旧建议/旧 debug，等新建议算出来再显示。
    // 这样 Zen “从上次没打完继续”或“开局快速切模式”时，不会短暂显示上一局的建议。
    try {
      const semNow = semanticKeyForLive(nextState, settings);
      if (semNow && semNow !== lastLiveKey) {
        lastSuggestion = null;
        lastColdClearError = null;
        lastColdClearDebug = null;
        lastEngineDebug = null;
      }
    } catch {}

    lastState = nextState;
    computeLive();
    draw();
  }

  function listenWindowMessages() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== PAGE_SOURCE) return;
      if (data.type === "TBP_PONG") {
        markPageHookAlive();
        return;
      }
      if (data.type === "TBP_STATE") handlePageMessage(data.payload);
    });
  }

  function listenExtensionMessages() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg?.type) return;
      if (msg.type === "TBP_GET_STATUS") {
        const semNow = semanticKeyForLive(lastState, settings);
        const liveOk = !!semNow && semNow === lastLiveKey;
        const liveSuggestion = liveOk ? lastSuggestion : null;
        const suggestionCells = Array.isArray(liveSuggestion?.cells) ? liveSuggestion.cells.length : 0;
        const boardH = Array.isArray(lastState?.board) ? lastState.board.length : null;
        const boardW = Array.isArray(lastState?.board?.[0]) ? lastState.board[0].length : null;
        sendResponse({
          ok: true,
          connected: pageConnected,
          error: lastPageError,
          hasState: !!lastState,
          hasBounds: !!lastState?.bounds,
          hasSuggestion: suggestionCells > 0,
          suggestionCells,
          engine: lastEngineName || "sim",
          current: lastState?.current || null,
          hold: lastState?.hold || null,
          nextLen: Array.isArray(lastState?.next) ? lastState.next.length : 0,
          boardH,
          boardW,
          bufferRows: Number.isFinite(lastState?.bufferRows) ? lastState.bufferRows : null,
          visibleRows: Number.isFinite(lastState?.visibleRows) ? lastState.visibleRows : null,
          engineDebug: settings?.debug ? lastEngineDebug : null,
          // 冷启动/排错时很关键：即使没开 debug，也给用户看到一句“为啥没用上 cold-clear”
          coldClearError: liveOk ? lastColdClearError || null : null,
          coldClearDebug: liveOk ? lastColdClearDebug || null : null,
          modePreset: settings?.modePreset || "40l",
          boundsMeta: lastState?.boundsMeta || null,
          boundsRaw: lastState?.bounds || null,
          boundsUsed: lastOverlayBounds || null,
          boundsMode: lastOverlayBoundsMode || null,
          baseBounds: lastBaseBounds || null,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          dpr: window.devicePixelRatio || 1,
          canHold: lastState?.canHold !== false
        });
        return;
      }
      if (msg.type === "TBP_START_CALIBRATION") {
        (async () => {
          if (!overlay?.startCalibration) return { ok: false, error: "叠加层模块没加载（overlay.startCalibration 不存在）" };
          if (!settings?.enabled) return { ok: false, error: "当前没启用叠加提示：先在弹窗里打开“启用叠加提示”。" };

          const locked0 = settings?.boundsLock && isRectLike(settings?.boundsLockedRect) ? settings.boundsLockedRect : null;
          if (!locked0 && !lastBaseBounds) return { ok: false, error: "还没定位到棋盘：请先进一局游戏（能看到棋盘）再试。" };

          const startRect = locked0 || lastOverlayBounds || applyBoundsAdjust(lastBaseBounds, settings?.boundsAdjust) || lastBaseBounds;

          const ok = overlay.startCalibration(startRect, {
            onSave: (rect) => {
              try {
                const base = lastBaseBounds;
                if (!rect) return;

                const patch = {
                  boundsLock: true,
                  boundsLockedRect: rect,
                  boundsLockedViewport: { w: window.innerWidth, h: window.innerHeight },
                  // 记住“校准时 base bounds 的模式”，后续不要乱切
                  boundsLockBaseMode: lastOverlayBoundsMode === "croppedFromTotal" ? "croppedFromTotal" : "visible"
                };

                // base 可用时同时更新相对比例（方便以后做“解锁/自适应”再用）
                if (base && isRectLike(base)) {
                  const dxr = (rect.x - base.x) / Math.max(1, base.width);
                  const dyr = (rect.y - base.y) / Math.max(1, base.height);
                  const wr = rect.width / Math.max(1, base.width);
                  const hr = rect.height / Math.max(1, base.height);
                  patch.boundsAdjust = {
                    dxr: Number.isFinite(dxr) ? dxr : 0,
                    dyr: Number.isFinite(dyr) ? dyr : 0,
                    wr: Number.isFinite(wr) ? wr : 1,
                    hr: Number.isFinite(hr) ? hr : 1
                  };
                }

                // 自适应建模：把“这次校准的窗口大小”一起记录成样本。
                // 以后你只要在某个窗口大小校准过一次，缩放到类似大小时我们就会优先套用那条样本。
                try {
                  const viewport = { w: window.innerWidth, h: window.innerHeight };
                  const sample = {
                    ts: Date.now(),
                    viewport,
                    dpr: window.devicePixelRatio || 1,
                    baseBounds: base && isRectLike(base) ? base : null,
                    boundsAdjust: patch.boundsAdjust || null,
                    boundsLockedRect: rect,
                    boundsLockBaseMode: patch.boundsLockBaseMode || null,
                    boundsMeta: lastState?.boundsMeta || null,
                    boundsMode: "lockedRect",
                    boundsRaw: lastState?.bounds || null,
                    boundsUsed: rect
                  };

                  const list = Array.isArray(settings?.scaleSamples) ? settings.scaleSamples.slice() : [];
                  const mode = String(sample.boundsLockBaseMode || "");
                  const idx = list.findIndex(
                    (s) =>
                      Number(s?.viewport?.w) === viewport.w &&
                      Number(s?.viewport?.h) === viewport.h &&
                      String(s?.boundsLockBaseMode || "") === mode
                  );
                  if (idx >= 0) list[idx] = sample;
                  else list.push(sample);

                  window.tbpSettings.setSettings({ ...patch, scaleSamples: list });
                } catch {
                  window.tbpSettings.setSettings(patch);
                }
              } catch {}
            },
            onSnap: (rect) => {
              try {
                const state = lastState || null;
                const base = lastBaseBounds || null;
                if (!rect) return null;
                const visibleRows = Number.isFinite(state?.visibleRows) ? Number(state.visibleRows) : 20;

                // 1) 先把框“吸附成标准 10x20”（方格更容易对齐）
                const cx = rect.x + rect.width / 2;
                const cy = rect.y + rect.height / 2;
                const rectCell = Math.min(rect.width / 10, rect.height / Math.max(1, visibleRows));

                let cell = rectCell;
                if (base && [base.x, base.y, base.width, base.height].every(Number.isFinite)) {
                  const baseCellW = base.width / 10;
                  const baseCellH = base.height / Math.max(1, visibleRows);
                  const baseCell = (baseCellW + baseCellH) / 2;
                  // 如果大小差不多，就把格子大小也吸附到 base（更稳定）
                  if (Math.abs(baseCell - rectCell) / Math.max(1e-6, rectCell) < 0.25) cell = baseCell;
                }

                const w = 10 * cell;
                const h = visibleRows * cell;
                let x = cx - w / 2;
                let y = cy - h / 2;

                // 2) 如果 base 可用：把左上角吸附到“最接近的格子对齐点”
                if (base && [base.x, base.y, base.width, base.height].every(Number.isFinite)) {
                  const baseCellW = base.width / 10;
                  const baseCellH = base.height / Math.max(1, visibleRows);
                  const candX = base.x + Math.round((x - base.x) / Math.max(1e-6, baseCellW)) * baseCellW;
                  const candY = base.y + Math.round((y - base.y) / Math.max(1e-6, baseCellH)) * baseCellH;
                  const thr = Math.max(6, cell * 0.6);
                  if (Math.abs(candX - x) < thr) x = candX;
                  if (Math.abs(candY - y) < thr) y = candY;
                }

                // 3) clamp 到视口（避免拖出屏幕外）
                const maxX = Math.max(0, window.innerWidth - w);
                const maxY = Math.max(0, window.innerHeight - h);
                x = Math.max(0, Math.min(maxX, x));
                y = Math.max(0, Math.min(maxY, y));

                return { x, y, width: w, height: h };
              } catch {
                return null;
              }
            }
          });

          return ok ? { ok: true } : { ok: false, error: "无法进入校准模式（可能还没拿到棋盘 bounds）。" };
        })()
          .then((resp) => sendResponse(resp))
          .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
        return true;
      }
      if (msg.type === "TBP_GET_DETAILS_DATA") {
        (async () => {
          if (!lastState) {
            sendResponse({ ok: false, error: "当前没有拿到游戏状态（可能还没进游戏，或读不到状态）。" });
            return;
          }
          const semNow = semanticKeyForLive(lastState, settings);
          const liveOk = !!semNow && semNow === lastLiveKey;
          const detailsSuggestion = await getOrComputeDetailsSuggestion(lastState);
          sendResponse({
            ok: true,
            connected: pageConnected,
            error: lastPageError,
            key: stateKeyForDetails(lastState),
            state: lastState,
            suggestion: liveOk ? lastSuggestion : null,
            detailsSuggestion,
            engine: lastEngineName || "sim",
            coldClearError: liveOk ? lastColdClearError || null : null,
            coldClearDebug: liveOk ? lastColdClearDebug || null : null,
            modePreset: settings?.modePreset || "40l"
          });
        })();
        return true;
      }
    });
  }

  async function init() {
    lastPageError = "正在连接…";
    injectPageHook();
    listenWindowMessages();
    listenExtensionMessages();
    settings = await window.tbpSettings.getSettings();
    try {
      const vp = settings?.boundsLockedViewport;
      const hasVp = Number.isFinite(vp?.w) && Number.isFinite(vp?.h) && vp.w > 0 && vp.h > 0;
      lastLockedViewport = hasVp ? { w: vp.w, h: vp.h } : null;
    } catch {
      lastLockedViewport = null;
    }
    requestMainWorldInjection();
    postToPage("TBP_PAGE_CONFIG", { readFullBag: !!settings.readFullBag, debug: !!settings.debug });
    pingPageHook();
    draw();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const patch = {};
      for (const [k, v] of Object.entries(changes)) patch[k] = v.newValue;
      settings = window.tbpSettings.withDefaults({ ...(settings || {}), ...patch });
      try {
        const vp = settings?.boundsLockedViewport;
        const hasVp = Number.isFinite(vp?.w) && Number.isFinite(vp?.h) && vp.w > 0 && vp.h > 0;
        lastLockedViewport = settings?.boundsLock && hasVp ? { w: vp.w, h: vp.h } : null;
      } catch {
        lastLockedViewport = null;
      }
      requestMainWorldInjection();
      postToPage("TBP_PAGE_CONFIG", { readFullBag: !!settings.readFullBag, debug: !!settings.debug });
      pingPageHook();
      computeLive();
      draw();
    });
  }

  init().catch((e) => console.warn("[TBP] init failed:", e));
})();
