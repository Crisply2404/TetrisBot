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
    try {
      if (!window.__tbpMapTapOriginalSet) window.__tbpMapTapOriginalSet = originalSet;
      if (!window.__tbpMapTapOriginalGet) window.__tbpMapTapOriginalGet = originalGet;
    } catch {}

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

  // 自动对齐（优先）：尽量从 PIXI 渲染层里拿到“棋盘真实位置”，窗口怎么缩放都会跟着变。
  // 参考思路来自 ref/tetrio-plus/microplus.js：通过捕获 window.PIXI 出现时机，并代理 PIXI.Application 构造来拿到 app/stage。
  let lastPixiApp = null;
  let lastPixiBounds = null;
  let lastPixiBoundsMeta = null;
  let lastPixiBoundsAt = 0;
  let lastPixiBoundsKey = "";
  let lastHolderBounds = null;
  let lastHolderBoundsMeta = null;
  let lastHolderBoundsAt = 0;
  let lastHolderBoundsKey = "";

  function setupPixiProbe(pixi) {
    try {
      if (!pixi || typeof pixi !== "object") return;
      if (pixi.__tbpPixiProbeInstalled) return;
      if (typeof pixi.Application !== "function") return;

      const OriginalApp = pixi.Application;
      pixi.Application = new Proxy(OriginalApp, {
        construct(target, args) {
          const app = new target(...(Array.isArray(args) ? args : []));
          try {
            lastPixiApp = app;
            window.__tbpPixiApp = app;
            window.__tbpPixiAppAt = Date.now();
          } catch {}
          return app;
        }
      });

      pixi.__tbpPixiProbeInstalled = true;
      if (config.debug) console.log("[TBP] PIXI probe installed");
    } catch {}
  }

  function installPixiProbe() {
    if (window.__tbpPixiProbeHooked) return;
    window.__tbpPixiProbeHooked = true;

    // 已经存在就先装一次
    try {
      const pixi0 = safeGetWindowValue("PIXI");
      if (pixi0) setupPixiProbe(pixi0);
    } catch {}

    // 捕获“之后才出现的 PIXI”
    try {
      const desc = Object.getOwnPropertyDescriptor(window, "PIXI");
      if (desc && desc.configurable === false) return;

      let pixiRef = safeGetWindowValue("PIXI");
      Object.defineProperty(window, "PIXI", {
        configurable: true,
        get() {
          return pixiRef;
        },
        set(val) {
          pixiRef = val;
          setupPixiProbe(val);
        }
      });
    } catch {}
  }

  function isDisplayObjectCandidate(node) {
    try {
      if (!node || typeof node !== "object") return false;
      if (node.visible === false) return false;
      if (typeof node.getBounds !== "function") return false;
      return true;
    } catch {
      return false;
    }
  }

  function computeBoundsFromPixiStage() {
    try {
      const app = safeGetWindowValue("__tbpPixiApp") || lastPixiApp;
      const stage = app?.stage;
      const canvas = app?.view || app?.renderer?.view || null;
      if (!stage || !canvas || typeof canvas.getBoundingClientRect !== "function") return null;

      const rect = canvas.getBoundingClientRect();
      if (!rect?.width || !rect?.height) return null;

      const now = Date.now();
      const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}:${Math.round(
        canvas.width || 0
      )}:${Math.round(canvas.height || 0)}`;

      if (key === lastPixiBoundsKey && lastPixiBounds && now - lastPixiBoundsAt < 900) {
        return { bounds: lastPixiBounds, meta: lastPixiBoundsMeta };
      }

      const scaleX = canvas.width && rect.width ? canvas.width / rect.width : 1;
      const scaleY = canvas.height && rect.height ? canvas.height / rect.height : 1;
      const hiDpi = scaleX > 1.15 || scaleY > 1.15;
      const dpr = window.devicePixelRatio || 1;

      let best = null;
      let bestScore = -Infinity;
      let bestMeta = null;

      const stack = [stage];
      let visited = 0;
      const MAX_NODES = 900;

      while (stack.length && visited < MAX_NODES) {
        const node = stack.pop();
        visited++;
        if (!node) continue;

        try {
          const children = node.children;
          if (Array.isArray(children) && children.length) {
            for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
          }
        } catch {}

        if (!isDisplayObjectCandidate(node)) continue;

        let pixiBounds = null;
        try {
          pixiBounds = node.getBounds();
        } catch {
          continue;
        }
        if (!pixiBounds || !Number.isFinite(pixiBounds.width) || !Number.isFinite(pixiBounds.height)) continue;
        if (pixiBounds.width <= 0 || pixiBounds.height <= 0) continue;

        // 比例约束：棋盘更像 10x20(0.5) 或 10x40(0.25)
        const ratio = pixiBounds.width / Math.max(1, pixiBounds.height);
        if (ratio < 0.18 || ratio > 0.72) continue;

        const scaled = mapPixiBoundsToClient(pixiBounds, canvas, rect, true);
        const raw = mapPixiBoundsToClient(pixiBounds, canvas, rect, false);

        const scaledScore = scoreBounds(scaled, rect) + (hiDpi ? 0.18 : 0);
        if (scaledScore > bestScore) {
          bestScore = scaledScore;
          best = scaled;
          bestMeta = {
            source: "pixi-stage",
            object: "stage-scan",
            mode: "scaled",
            canvasW: Math.round(rect.width),
            canvasH: Math.round(rect.height),
            scaleX: Number(scaleX.toFixed(3)),
            scaleY: Number(scaleY.toFixed(3)),
            dpr: Number(dpr.toFixed(3)),
            visited
          };
        }

        const rawScore = (scoreBounds(raw, rect) + 0.05) * (hiDpi ? 0.05 : 0.75);
        if (rawScore > bestScore) {
          bestScore = rawScore;
          best = raw;
          bestMeta = {
            source: "pixi-stage",
            object: "stage-scan",
            mode: "raw",
            canvasW: Math.round(rect.width),
            canvasH: Math.round(rect.height),
            scaleX: Number(scaleX.toFixed(3)),
            scaleY: Number(scaleY.toFixed(3)),
            dpr: Number(dpr.toFixed(3)),
            visited
          };
        }
      }

      if (!best) return null;
      const meta = bestMeta ? { ...bestMeta, score: Number(bestScore.toFixed(3)) } : null;

      lastPixiBounds = best;
      lastPixiBoundsMeta = meta;
      lastPixiBoundsAt = now;
      lastPixiBoundsKey = key;

      if (config.debug && meta) console.log("[TBP] pixi-stage bounds chosen:", best, meta);
      return { bounds: best, meta };
    } catch (e) {
      if (config.debug) console.warn("[TBP] pixi-stage bounds failed:", e);
      return null;
    }
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
      const baseObjects = [
        // 经验：这些对象更可能代表“棋盘区域”，相对稳定
        ["board", holder?.board],
        ["holder", holder?.holder]
      ].filter(([, obj]) => obj && typeof obj.getBounds === "function");

      // ⚠️ stackobj 往往只是“堆叠方块本身”的包围盒，可能会随局面/掉落块变化，导致对齐抖动。
      // 只有在拿不到更稳定对象时，才把它当兜底候选。
      const fallbackObjects = baseObjects.length
        ? []
        : [["stackobj", holder?.stackobj]].filter(([, obj]) => obj && typeof obj.getBounds === "function");

      const objects = baseObjects.concat(fallbackObjects);

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

      // 缓存：避免每 120ms 都重算一次导致“跟着方块抖”的观感。
      // canvas 的屏幕矩形不变时，短时间内直接复用上一次结果更稳。
      try {
        const primary = canvases[0];
        const rect0 = primary?.rect;
        const canvas0 = primary?.canvas;
        if (rect0 && canvas0) {
          const now0 = Date.now();
          const key0 = `${Math.round(rect0.left)}:${Math.round(rect0.top)}:${Math.round(rect0.width)}:${Math.round(rect0.height)}:${Math.round(
            canvas0.width || 0
          )}:${Math.round(canvas0.height || 0)}`;
          if (key0 === lastHolderBoundsKey && lastHolderBounds && now0 - lastHolderBoundsAt < 900) {
            return { bounds: lastHolderBounds, meta: lastHolderBoundsMeta };
          }
          lastHolderBoundsKey = key0;
        }
      } catch {}

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

        // 更偏好“稳定的棋盘容器”，避免选到“堆叠方块的包围盒”
        const objectBoost = name === "board" ? 0.65 : name === "holder" ? 0.25 : name === "stackobj" ? -0.8 : 0;

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
              source: "holder-data",
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
              source: "holder-data",
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
      try {
        lastHolderBounds = best;
        lastHolderBoundsMeta = meta;
        lastHolderBoundsAt = Date.now();
      } catch {}
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

    // 对战上下文（尽量提取；提取不到就留空，后端会用默认值兜底）
    // 说明：不同模式/版本字段名可能不一致，所以这里做“多候选字段尝试”。
    const comboRaw =
      game.combo ??
      game.stats?.combo ??
      game.stats?.combo_current ??
      game.stats?.currentcombo ??
      game.stats?.comboCounter ??
      game.state?.combo ??
      null;
    const combo = Number.isFinite(Number(comboRaw)) ? Math.max(0, Math.floor(Number(comboRaw))) : null;

    const b2bRaw =
      game.back_to_back ??
      game.backToBack ??
      game.b2b ??
      game.stats?.b2b ??
      game.stats?.back_to_back ??
      game.stats?.backToBack ??
      game.stats?.btb ??
      game.state?.b2b ??
      null;
    const backToBack = typeof b2bRaw === "boolean" ? b2bRaw : Number.isFinite(Number(b2bRaw)) ? Number(b2bRaw) > 0 : null;

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
      combo,
      backToBack,
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
      const now = Date.now();
      const raw = api.ejectState();
      const holder = api.getHolderData?.();
      const boundsResult = computeStackBounds(holder) || computeBoundsFromPixiStage();
      const bounds = boundsResult?.bounds || null;
      const boundsMeta = boundsResult?.meta || null;
      const state = extractStateFromEject(raw);
      if (!state || !state.board || !state.current) {
        // 某些模式（例如切模式/双人练习的准备阶段）可能会短时间拿不到完整 state；
        // 这里做节流，避免每 120ms 刷屏，同时也当作 keepalive 让 content 不误判“状态超时”。
        if (now - lastPostAt > 900) {
          lastPostAt = now;
          postState({ connected: true, error: "已找到 API，但当前还没有完整状态（可能不在对局中）。" });
        }
        return;
      }
      state.bounds = bounds;
      state.boundsMeta = boundsMeta;
      const key = `${state.frame}:${state.boardHash}:${state.current}:${state.hold || "-"}:${state.next.join("")}:${
        bounds
          ? `${Math.round(bounds.x)}:${Math.round(bounds.y)}:${Math.round(bounds.width)}:${Math.round(bounds.height)}`
          : "nob"
      }`;
      // 关键：就算局面 key 没变，也要定期发一次 keepalive（否则 content 侧会误判“状态超时”，尤其在
      // 双人练习/准备阶段/长时间不落块时更明显）。
      const shouldPost = key !== lastKey || now - lastPostAt > 900;
      if (!shouldPost) return;

      lastKey = key;
      lastPostAt = now;
      postState({ connected: true, state });
    } catch (e) {
      if (config.debug) console.warn("[TBP] tick error:", e);
      // 节流：避免异常时刷屏，也避免 content 侧心跳被误导
      const now = Date.now();
      if (now - lastPostAt > 900) {
        lastPostAt = now;
        postState({ connected: false, error: String(e?.message || e) });
      }
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
    if (data.type === "TBP_RESET_CAPTURE") {
      try {
        // 清掉已捕获 API，让 findGameApi/Map tap 能重新抓一份（常见于“退出对局再进/切模式”后旧 API 还在）。
        api = null;
        lastKey = "";
        lastPostAt = 0;
        try {
          window.__tbpGameApi = null;
          window.__tbpGameApiVia = null;
          window.__tbpGameApiAt = 0;
        } catch {}

        // 恢复 Map 原型并重新安装 tap（避免多次 reset 叠加代理）
        try {
          const os = safeGetWindowValue("__tbpMapTapOriginalSet");
          const og = safeGetWindowValue("__tbpMapTapOriginalGet");
          if (typeof os === "function") Map.prototype.set = os;
          if (typeof og === "function") Map.prototype.get = og;
        } catch {}
        try {
          window.__tbpMapTapInstalled = false;
        } catch {}
        installMapTap();
      } catch {}
      return;
    }
    if (data.type === "TBP_PAGE_CONFIG") {
      config.readFullBag = !!data.payload?.readFullBag;
      config.debug = !!data.payload?.debug;
    }
  });

  installMapTap();
  installPixiProbe();
  setInterval(tick, 120);
})();
