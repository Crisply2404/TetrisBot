(() => {
  if (window.__tbpPageHookInstalled) return;
  window.__tbpPageHookInstalled = true;

  const PAGE_SOURCE = "tbp-page";
  const EXT_SOURCE = "tbp-ext";

  const config = {
    // 默认开启（你希望“装上就能用”时更强）；但仍可在设置页关掉做对比。
    readFullBag: true,
    debug: false
  };

  function safeGetWindowValue(key) {
    try {
      return window[key];
    } catch {
      return undefined;
    }
  }

  function isApiCandidate(value) {
    try {
      if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
      if (value === window) return false;
      const getHolderData = value.getHolderData;
      const ejectState = value.ejectState;
      const isOnline = value.isOnline;
      return typeof getHolderData === "function" && typeof ejectState === "function" && typeof isOnline === "function";
    } catch {
      return false;
    }
  }

  function tryCaptureApi(value, via) {
    try {
      if (!isApiCandidate(value)) return false;
      if (!window.__tbpGameApi) {
        window.__tbpGameApi = value;
        window.__tbpGameApiVia = String(via || "unknown");
        if (config.debug) console.log("[TBP] captured game API via", window.__tbpGameApiVia);
      }
      return true;
    } catch {
      return false;
    }
  }

  function installMapTap() {
    if (window.__tbpMapTapInstalled) return;
    window.__tbpMapTapInstalled = true;

    const originalSet = Map.prototype.set;
    const originalGet = Map.prototype.get;

    function maybeUninstall() {
      if (!window.__tbpGameApi) return;
      try {
        Map.prototype.set = originalSet;
        Map.prototype.get = originalGet;
        if (config.debug) console.log("[TBP] map tap uninstalled after capture");
      } catch {}
    }

    Map.prototype.set = function (key, value) {
      const out = originalSet.call(this, key, value);
      if (!window.__tbpGameApi) tryCaptureApi(value, "Map.set");
      maybeUninstall();
      return out;
    };

    Map.prototype.get = function (key) {
      const out = originalGet.call(this, key);
      if (!window.__tbpGameApi) tryCaptureApi(out, "Map.get");
      maybeUninstall();
      return out;
    };
  }

  function findGameApi() {
    const captured = safeGetWindowValue("__tbpGameApi");
    if (isApiCandidate(captured)) return captured;

    const keys = Object.getOwnPropertyNames(window);
    for (const key of keys) {
      const value = safeGetWindowValue(key);
      if (isApiCandidate(value)) return value;
    }
    return null;
  }

  function pickMainCanvas() {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    if (!canvases.length) return null;
    let best = null;
    let bestArea = 0;
    for (const c of canvases) {
      const rect = c.getBoundingClientRect();
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      if (area > bestArea) {
        bestArea = area;
        best = c;
      }
    }
    return best;
  }

  function listVisibleCanvases() {
    const out = [];
    const canvases = Array.from(document.querySelectorAll("canvas"));
    for (const c of canvases) {
      try {
        const rect = c.getBoundingClientRect();
        if (!rect || !rect.width || !rect.height) continue;
        if (rect.width < 80 || rect.height < 80) continue;
        if (rect.bottom < 0 || rect.right < 0) continue;
        if (rect.top > window.innerHeight || rect.left > window.innerWidth) continue;
        out.push({ canvas: c, rect });
      } catch {}
    }
    out.sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    return out;
  }

  function isCanvasElement(el) {
    try {
      return !!el && el instanceof HTMLCanvasElement;
    } catch {
      return false;
    }
  }

  function pickHolderCanvas(holder) {
    try {
      const c1 = holder?.app?.view;
      if (isCanvasElement(c1)) return c1;
      const c2 = holder?.app?.renderer?.view;
      if (isCanvasElement(c2)) return c2;
      const c3 = holder?.holder?.app?.view;
      if (isCanvasElement(c3)) return c3;
      return null;
    } catch {
      return null;
    }
  }

  function intersectArea(a, bRect) {
    const x1 = Math.max(a.x, bRect.left);
    const y1 = Math.max(a.y, bRect.top);
    const x2 = Math.min(a.x + a.width, bRect.left + bRect.width);
    const y2 = Math.min(a.y + a.height, bRect.top + bRect.height);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    return w * h;
  }

  function scoreBounds(bounds, canvasRect) {
    if (!bounds) return -Infinity;
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return -Infinity;
    if (bounds.width <= 0 || bounds.height <= 0) return -Infinity;
    if (bounds.width < 60 || bounds.height < 120) return -Infinity;
    if (bounds.width > window.innerWidth * 2 || bounds.height > window.innerHeight * 2) return -Infinity;

    const area = bounds.width * bounds.height;
    if (area < 2000) return -Infinity;

    const overlap = intersectArea(bounds, canvasRect) / area;
    if (overlap < 0.4) return -Infinity;

    const ratio = bounds.width / bounds.height;
    const ratioScore = 1 - Math.min(1, Math.abs(ratio - 0.5) / 0.5);
    const centerDist = Math.hypot(
      bounds.x + bounds.width / 2 - (canvasRect.left + canvasRect.width / 2),
      bounds.y + bounds.height / 2 - (canvasRect.top + canvasRect.height / 2)
    );
    const centerScore = 1 - Math.min(1, centerDist / Math.max(1, Math.min(canvasRect.width, canvasRect.height)));
    return overlap * 2 + ratioScore + centerScore * 0.15;
  }

  function mapPixiBoundsToClient(pixiBounds, canvas, rect, useCanvasScale) {
    const scaleX = canvas.width && rect.width ? canvas.width / rect.width : 1;
    const scaleY = canvas.height && rect.height ? canvas.height / rect.height : 1;
    const sx = useCanvasScale ? scaleX : 1;
    const sy = useCanvasScale ? scaleY : 1;
    return {
      x: rect.left + pixiBounds.x / sx,
      y: rect.top + pixiBounds.y / sy,
      width: pixiBounds.width / sx,
      height: pixiBounds.height / sy
    };
  }

  function computeStackBounds(holder) {
    try {
      const objects = [
        ["board", holder?.board],
        ["holder", holder?.holder],
        ["stackobj", holder?.stackobj]
      ].filter(([, obj]) => obj && typeof obj.getBounds === "function");

      if (!objects.length) return null;

      // 优先使用 holder 里带出来的 canvas（更准、更不容易选错）；拿不到再去扫页面上所有 canvas。
      const preferredCanvas = pickHolderCanvas(holder);
      let canvases = [];
      if (preferredCanvas) {
        try {
          const rect = preferredCanvas.getBoundingClientRect();
          if (rect?.width > 0 && rect?.height > 0) canvases = [{ canvas: preferredCanvas, rect, preferred: true }];
        } catch {}
      }
      if (!canvases.length) canvases = listVisibleCanvases();
      if (!canvases.length) return null;

      let best = null;
      let bestScore = -Infinity;
      let bestMeta = null;

      for (const [name, obj] of objects) {
        let pixiBounds = null;
        try {
          pixiBounds = obj.getBounds();
        } catch {
          continue;
        }
        if (!pixiBounds || !Number.isFinite(pixiBounds.width) || !Number.isFinite(pixiBounds.height)) continue;
        if (pixiBounds.width <= 0 || pixiBounds.height <= 0) continue;

        const objectBoost = name === "board" ? 0.35 : name === "holder" ? 0.15 : 0;

        for (const { canvas, rect, preferred } of canvases) {
          const scaleX = canvas.width && rect.width ? canvas.width / rect.width : 1;
          const scaleY = canvas.height && rect.height ? canvas.height / rect.height : 1;
          const hiDpi = scaleX > 1.15 || scaleY > 1.15;
          const dpr = window.devicePixelRatio || 1;

          const scaled = mapPixiBoundsToClient(pixiBounds, canvas, rect, true);
          const scaledScore = scoreBounds(scaled, rect) + objectBoost + (hiDpi ? 0.25 : 0) + (preferred ? 0.6 : 0);
          if (scaledScore > bestScore) {
            bestScore = scaledScore;
            best = scaled;
            bestMeta = {
              object: name,
              mode: "scaled",
              canvasW: Math.round(rect.width),
              canvasH: Math.round(rect.height),
              scaleX: Number(scaleX.toFixed(3)),
              scaleY: Number(scaleY.toFixed(3)),
              dpr: Number(dpr.toFixed(3)),
              preferred: !!preferred
            };
          }

          // raw 作为兜底：在 hiDPI 情况下大概率会“放大一倍”，所以强力降权
          const raw = mapPixiBoundsToClient(pixiBounds, canvas, rect, false);
          const rawScore = (scoreBounds(raw, rect) + objectBoost + (preferred ? 0.25 : 0)) * (hiDpi ? 0.03 : 0.7);
          if (rawScore > bestScore) {
            bestScore = rawScore;
            best = raw;
            bestMeta = {
              object: name,
              mode: "raw",
              canvasW: Math.round(rect.width),
              canvasH: Math.round(rect.height),
              scaleX: Number(scaleX.toFixed(3)),
              scaleY: Number(scaleY.toFixed(3)),
              dpr: Number(dpr.toFixed(3)),
              preferred: !!preferred
            };
          }
        }
      }

      if (!best) return null;
      const meta = bestMeta ? { ...bestMeta, score: Number(bestScore.toFixed(3)) } : null;
      if (config.debug && meta) console.log("[TBP] bounds chosen:", best, meta);
      return { bounds: best, meta };
    } catch (e) {
      if (config.debug) console.warn("[TBP] bounds failed:", e);
      return null;
    }
  }

  function normalizePiece(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      const p = value.trim().toUpperCase();
      if (["I", "O", "T", "S", "Z", "J", "L"].includes(p)) return p;
      return null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const idx = Math.trunc(value);
      const map = ["I", "O", "T", "S", "Z", "J", "L"];
      return map[idx] || null;
    }
    if (typeof value === "object") {
      const t = value?.type ?? value?.name ?? null;
      return normalizePiece(t);
    }
    return null;
  }

  function detectEmptyCellValue(board, width, height) {
    try {
      const counts = new Map();
      const sampleRows = Math.min(height, 12);
      const sampleCols = Math.min(width, 10);
      for (let y = 0; y < sampleRows; y++) {
        const row = board[y];
        if (!row) continue;
        for (let x = 0; x < sampleCols; x++) {
          const cell = row[x];
          const k = cell === null ? "null" : cell === undefined ? "undefined" : typeof cell === "number" ? `n:${cell}` : `o:${String(cell)}`;
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      }
      if (!counts.size) return null;

      const preferred = ["null", "undefined", "n:255", "n:-1", "n:0"];
      for (const k of preferred) {
        if (counts.has(k)) return k;
      }

      let bestK = null;
      let bestC = -1;
      for (const [k, c] of counts.entries()) {
        if (c > bestC) {
          bestC = c;
          bestK = k;
        }
      }
      return bestK;
    } catch {
      return null;
    }
  }

  function isEmptyCellByKey(cell, emptyKey) {
    if (cell === null || cell === undefined || cell === false) return true;
    if (!emptyKey) return cell === 0 || cell === 255 || cell === -1;
    if (emptyKey === "null") return cell === null;
    if (emptyKey === "undefined") return cell === undefined;
    if (emptyKey.startsWith("n:")) {
      const n = Number(emptyKey.slice(2));
      return typeof cell === "number" && cell === n;
    }
    if (emptyKey.startsWith("o:")) return String(cell) === emptyKey.slice(2);
    return cell === 0 || cell === 255 || cell === -1;
  }

  function boardTo01(board) {
    if (!board || typeof board.length !== "number") return null;
    const height = board.length;
    if (height <= 0) return null;
    const firstRow = board[0];
    if (!firstRow || typeof firstRow.length !== "number") return null;
    const width = firstRow.length;
    const emptyKey = detectEmptyCellValue(board, width, height);
    const out = new Array(height);
    for (let y = 0; y < height; y++) {
      const row = board[y];
      if (!row || typeof row.length !== "number") return null;
      const r = new Array(width);
      for (let x = 0; x < width; x++) {
        const cell = row[x];
        r[x] = isEmptyCellByKey(cell, emptyKey) ? 0 : 1;
      }
      out[y] = r;
    }
    return out;
  }

  function hashBoard01(board01) {
    if (!board01) return "no-board";
    let h = 2166136261;
    for (const row of board01) {
      for (const v of row) {
        h ^= v ? 1 : 0;
        h = Math.imul(h, 16777619);
      }
    }
    return String(h >>> 0);
  }

  function extractStateFromEject(raw) {
    const game = raw?.game;
    if (!game) return null;

    const falling = game.falling || null;
    const current = normalizePiece(falling?.type);

    const holdRaw = game.hold?.type ?? game.hold;
    const hold = normalizePiece(holdRaw);

    // 注意：不同版本/模式下，game.bag 可能是“从 next1 开始”，也可能把当前块也放在最前面。
    // 我们同时拿 falling.type 作为 current，所以这里做一次去重：如果 bag[0] 恰好等于 current，就把它丢掉，保证 next[] 真的是“后续块序”。
    let bag = Array.isArray(game.bag) ? game.bag.map(normalizePiece).filter(Boolean) : [];
    if (current && bag[0] === current) bag = bag.slice(1);
    const next = config.readFullBag ? bag.slice(0, 32) : bag.slice(0, 5);

    let board01 = boardTo01(game.board);
    const visible = Number(game.setoptions?.boardheight ?? 20);
    const bufRaw = game.setoptions?.boardbuffer;
    const bufOpt = bufRaw === null || bufRaw === undefined ? null : Number(bufRaw);

    let buffer = 0;
    if (board01?.length) {
      const total = board01.length;
      if (total > visible) buffer = total - visible;
      else if (Number.isFinite(bufOpt) && bufOpt > 0) buffer = bufOpt;

      const targetTotal = buffer + visible;
      if (targetTotal > 0 && total < targetTotal) {
        const padRows = targetTotal - total;
        const width = board01[0]?.length || 10;
        const pad = [];
        for (let i = 0; i < padRows; i++) pad.push(new Array(width).fill(0));
        board01 = pad.concat(board01);
      }
    }

    return {
      board: board01,
      boardHash: hashBoard01(board01),
      current,
      hold,
      next,
      bufferRows: buffer,
      visibleRows: visible,
      frame: Number(raw?.frame || 0)
    };
  }

  function postState(payload) {
    window.postMessage({ source: PAGE_SOURCE, type: "TBP_STATE", payload }, "*");
  }

  let api = null;
  let lastKey = "";
  let lastPostAt = 0;

  function tick() {
    if (!api) api = findGameApi();
    if (!api) {
      const now = Date.now();
      if (now - lastPostAt > 1000) {
        lastPostAt = now;
        postState({ connected: false, error: "未找到游戏 API（可能还没加载完）。" });
      }
      return;
    }

    try {
      const raw = api.ejectState();
      const holder = api.getHolderData?.();
      const boundsResult = computeStackBounds(holder);
      const bounds = boundsResult?.bounds || null;
      const boundsMeta = boundsResult?.meta || null;
      const state = extractStateFromEject(raw);
      if (!state || !state.board || !state.current) {
        postState({ connected: true, error: "已找到 API，但当前还没有完整状态（可能不在对局中）。" });
        return;
      }
      state.bounds = bounds;
      state.boundsMeta = boundsMeta;
      const key = `${state.frame}:${state.boardHash}:${state.current}:${state.hold || "-"}:${state.next.join("")}:${
        bounds
          ? `${Math.round(bounds.x)}:${Math.round(bounds.y)}:${Math.round(bounds.width)}:${Math.round(bounds.height)}`
          : "nob"
      }`;
      if (key !== lastKey) {
        lastKey = key;
        postState({ connected: true, state });
      }
    } catch (e) {
      if (config.debug) console.warn("[TBP] tick error:", e);
      postState({ connected: false, error: String(e?.message || e) });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== EXT_SOURCE) return;
    if (data.type === "TBP_PING") {
      window.postMessage({ source: PAGE_SOURCE, type: "TBP_PONG", payload: { ts: Date.now() } }, "*");
      return;
    }
    if (data.type === "TBP_PAGE_CONFIG") {
      config.readFullBag = !!data.payload?.readFullBag;
      config.debug = !!data.payload?.debug;
    }
  });

  installMapTap();
  setInterval(tick, 120);
})();
