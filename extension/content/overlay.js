(() => {
  class Overlay {
    constructor() {
      this._host = null;
      this._shadow = null;
      this._canvas = null;
      this._ctx = null;
      this._bounds = null;
      this._lastDrawKey = "";

      this._calibLayer = null;
      this._calibBox = null;
      this._calibHint = null;
      this._calibActive = false;
      this._calibCallbacks = null;
      this._calibPointer = null;
    }

    ensure() {
      if (this._host) return;
      const host = document.createElement("div");
      host.id = "tbp-overlay-host";
      host.style.position = "fixed";
      host.style.left = "0";
      host.style.top = "0";
      host.style.width = "100vw";
      host.style.height = "100vh";
      host.style.zIndex = "2147483647";
      host.style.pointerEvents = "none";

      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial; }
        #tbp-calib-layer { position: fixed; inset: 0; z-index: 2147483647; pointer-events: auto; display: none; }
        #tbp-calib-box { position: fixed; border: 2px solid rgba(0, 255, 170, 0.95); box-sizing: border-box; background: rgba(0, 255, 170, 0.06); }
        .tbp-calib-handle { position: absolute; width: 14px; height: 14px; background: rgba(0, 255, 170, 0.95); border: 2px solid rgba(0,0,0,0.35); box-sizing: border-box; border-radius: 2px; }
        .tbp-calib-handle[data-h=\"tl\"] { left: -8px; top: -8px; cursor: nwse-resize; }
        .tbp-calib-handle[data-h=\"tr\"] { right: -8px; top: -8px; cursor: nesw-resize; }
        .tbp-calib-handle[data-h=\"bl\"] { left: -8px; bottom: -8px; cursor: nesw-resize; }
        .tbp-calib-handle[data-h=\"br\"] { right: -8px; bottom: -8px; cursor: nwse-resize; }
        #tbp-calib-toolbar { position: fixed; left: 12px; top: 12px; display: flex; gap: 8px; align-items: center; z-index: 2147483647; }
        #tbp-calib-toolbar button { font: 12px system-ui, -apple-system, Segoe UI, sans-serif; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(10,12,15,0.92); color: rgba(255,255,255,0.92); cursor: pointer; }
        #tbp-calib-toolbar button.primary { background: rgba(0, 255, 170, 0.20); border-color: rgba(0, 255, 170, 0.45); }
        #tbp-calib-hint { font: 12px system-ui, -apple-system, Segoe UI, sans-serif; color: rgba(255,255,255,0.92); opacity: 0.95; padding: 6px 10px; border-radius: 10px; background: rgba(10,12,15,0.80); border: 1px solid rgba(255,255,255,0.12); }
      `;
      shadow.appendChild(style);

      const canvas = document.createElement("canvas");
      canvas.id = "tbp-overlay-canvas";
      canvas.style.position = "fixed";
      canvas.style.left = "0";
      canvas.style.top = "0";
      canvas.style.zIndex = "2147483647";
      canvas.style.pointerEvents = "none";

      shadow.appendChild(canvas);

      const calibLayer = document.createElement("div");
      calibLayer.id = "tbp-calib-layer";

      const toolbar = document.createElement("div");
      toolbar.id = "tbp-calib-toolbar";

      const btnSnap = document.createElement("button");
      btnSnap.type = "button";
      btnSnap.textContent = "吸附对齐";

      const btnSave = document.createElement("button");
      btnSave.type = "button";
      btnSave.className = "primary";
      btnSave.textContent = "保存校准";

      const btnCancel = document.createElement("button");
      btnCancel.type = "button";
      btnCancel.textContent = "取消";

      const hint = document.createElement("div");
      hint.id = "tbp-calib-hint";
      hint.textContent = "校准模式：先拖到差不多的位置，点“吸附对齐”让框更标准；再微调到刚好盖住棋盘（10x20 可见区域），最后点“保存校准”。";

      toolbar.appendChild(btnSnap);
      toolbar.appendChild(btnSave);
      toolbar.appendChild(btnCancel);
      toolbar.appendChild(hint);
      calibLayer.appendChild(toolbar);

      const box = document.createElement("div");
      box.id = "tbp-calib-box";

      for (const h of ["tl", "tr", "bl", "br"]) {
        const handle = document.createElement("div");
        handle.className = "tbp-calib-handle";
        handle.dataset.h = h;
        box.appendChild(handle);
      }

      calibLayer.appendChild(box);
      shadow.appendChild(calibLayer);
      document.documentElement.appendChild(host);

      this._host = host;
      this._shadow = shadow;
      this._canvas = canvas;
      this._ctx = canvas.getContext("2d");
      this._calibLayer = calibLayer;
      this._calibBox = box;
      this._calibHint = hint;

      btnSnap.addEventListener("click", () => this._snapCalibration());
      btnSave.addEventListener("click", () => this._commitCalibration());
      btnCancel.addEventListener("click", () => this._cancelCalibration());
    }

    setBounds(bounds) {
      this.ensure();
      this._bounds = bounds;
      if (!bounds || !this._canvas || !this._ctx) return;

      const { x, y, width, height } = bounds;
      this._canvas.style.left = `${Math.round(x)}px`;
      this._canvas.style.top = `${Math.round(y)}px`;
      this._canvas.style.width = `${Math.round(width)}px`;
      this._canvas.style.height = `${Math.round(height)}px`;

      const dpr = window.devicePixelRatio || 1;
      const nextW = Math.max(1, Math.round(width * dpr));
      const nextH = Math.max(1, Math.round(height * dpr));
      if (this._canvas.width !== nextW || this._canvas.height !== nextH) {
        this._canvas.width = nextW;
        this._canvas.height = nextH;
      }

      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._lastDrawKey = "";
    }

    clear() {
      if (!this._canvas || !this._ctx) return;
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      this._lastDrawKey = "";
    }

    _setCalibBoxRect(r) {
      if (!this._calibBox) return;
      this._calibBox.style.left = `${Math.round(r.x)}px`;
      this._calibBox.style.top = `${Math.round(r.y)}px`;
      this._calibBox.style.width = `${Math.round(r.width)}px`;
      this._calibBox.style.height = `${Math.round(r.height)}px`;
    }

    _getCalibBoxRect() {
      if (!this._calibBox) return null;
      const rect = this._calibBox.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }

    startCalibration(bounds, callbacks) {
      this.ensure();
      if (!this._calibLayer || !this._calibBox) return false;
      if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return false;

      this._calibActive = true;
      this._calibCallbacks = callbacks || null;
      this._calibLayer.style.display = "block";
      this._setCalibBoxRect(bounds);

      const onPointerDown = (e) => this._onCalibPointerDown(e);
      const onPointerMove = (e) => this._onCalibPointerMove(e);
      const onPointerUp = (e) => this._onCalibPointerUp(e);

      this._calibLayer.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);

      this._calibPointer = { onPointerDown, onPointerMove, onPointerUp };
      return true;
    }

    stopCalibration() {
      if (!this._calibLayer || !this._calibPointer) {
        if (this._calibLayer) this._calibLayer.style.display = "none";
        this._calibActive = false;
        this._calibCallbacks = null;
        return;
      }
      this._calibLayer.style.display = "none";
      this._calibLayer.removeEventListener("pointerdown", this._calibPointer.onPointerDown);
      window.removeEventListener("pointermove", this._calibPointer.onPointerMove);
      window.removeEventListener("pointerup", this._calibPointer.onPointerUp);
      window.removeEventListener("pointercancel", this._calibPointer.onPointerUp);
      this._calibPointer = null;
      this._calibActive = false;
      this._calibCallbacks = null;
    }

    _commitCalibration() {
      const rect = this._getCalibBoxRect();
      if (this._calibCallbacks?.onSave && rect) {
        try {
          this._calibCallbacks.onSave(rect);
        } catch {}
      }
      this.stopCalibration();
    }

    _defaultSnapRect(rect) {
      if (!rect) return null;
      const visibleRows = 20;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const cell = Math.min(rect.width / 10, rect.height / visibleRows);
      const w = 10 * cell;
      const h = visibleRows * cell;
      let x = cx - w / 2;
      let y = cy - h / 2;
      const maxX = Math.max(0, window.innerWidth - w);
      const maxY = Math.max(0, window.innerHeight - h);
      x = Math.max(0, Math.min(maxX, x));
      y = Math.max(0, Math.min(maxY, y));
      return { x, y, width: w, height: h };
    }

    _snapCalibration() {
      const rect = this._getCalibBoxRect();
      if (!rect) return;

      let next = null;
      if (this._calibCallbacks?.onSnap) {
        try {
          next = this._calibCallbacks.onSnap(rect) || null;
        } catch {
          next = null;
        }
      }
      if (!next) next = this._defaultSnapRect(rect);
      if (!next) return;
      this._setCalibBoxRect(next);
    }

    _cancelCalibration() {
      if (this._calibCallbacks?.onCancel) {
        try {
          this._calibCallbacks.onCancel();
        } catch {}
      }
      this.stopCalibration();
    }

    _onCalibPointerDown(e) {
      if (!this._calibActive) return;
      const target = e.target;
      const rect = this._getCalibBoxRect();
      if (!rect) return;

      const handle = target?.dataset?.h || null;
      const inBox = target === this._calibBox || this._calibBox?.contains(target);
      if (!handle && !inBox) return;

      e.preventDefault();
      e.stopPropagation();

      const mode = handle ? `resize:${handle}` : "move";
      this._drag = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        rect
      };
    }

    _onCalibPointerMove(e) {
      if (!this._drag) return;
      const d = this._drag;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      let r = { ...d.rect };

      const minW = 80;
      const minH = 160;

      if (d.mode === "move") {
        r.x += dx;
        r.y += dy;
      } else if (d.mode.startsWith("resize:")) {
        const h = d.mode.slice("resize:".length);
        if (h === "tl") {
          r.x += dx;
          r.y += dy;
          r.width -= dx;
          r.height -= dy;
        } else if (h === "tr") {
          r.y += dy;
          r.width += dx;
          r.height -= dy;
        } else if (h === "bl") {
          r.x += dx;
          r.width -= dx;
          r.height += dy;
        } else if (h === "br") {
          r.width += dx;
          r.height += dy;
        }
      }

      // clamp min size
      if (r.width < minW) {
        const diff = minW - r.width;
        if (d.mode === "resize:tl" || d.mode === "resize:bl") r.x -= diff;
        r.width = minW;
      }
      if (r.height < minH) {
        const diff = minH - r.height;
        if (d.mode === "resize:tl" || d.mode === "resize:tr") r.y -= diff;
        r.height = minH;
      }

      this._setCalibBoxRect(r);
      if (this._calibCallbacks?.onUpdate) {
        try {
          this._calibCallbacks.onUpdate(r);
        } catch {}
      }
    }

    _onCalibPointerUp() {
      if (!this._drag) return;
      this._drag = null;
    }

    drawSuggestion(suggestion, settings, boardMeta) {
      if (!this._canvas || !this._ctx || !this._bounds) return;
      const opacity = typeof settings?.opacity === "number" ? settings.opacity : 0.45;
      const visibleRows = Number.isFinite(boardMeta?.visibleRows) ? Number(boardMeta.visibleRows) : 20;
      const bufferRows = Number.isFinite(boardMeta?.bufferRows) ? Number(boardMeta.bufferRows) : 0;

      const key = JSON.stringify({ suggestion, opacity, bounds: this._bounds });
      if (key === this._lastDrawKey) return;
      this._lastDrawKey = key;

      this._ctx.clearRect(0, 0, this._bounds.width, this._bounds.height);

      const isDebug = !!settings?.debug;
      const lockEnabled = !!settings?.boundsLock;

      // 理想情况：bounds 只覆盖“可见 20 行”。但 tetr.io 内部对象的 getBounds() 偶尔会把隐藏的 buffer 行也算进来。
      // 这里用“更接近哪个比例”来判断：更像 10x可见行，还是更像 10x(可见+buffer)。
      const totalRows = Math.max(1, bufferRows + visibleRows);
      const ratio = this._bounds.width / Math.max(1, this._bounds.height);
      const expectedVisibleRatio = 10 / Math.max(1, visibleRows);
      const expectedTotalRatio = 10 / totalRows;
      const boundsLooksLikeTotalRows =
        !lockEnabled &&
        bufferRows > 0 && totalRows > visibleRows && Math.abs(ratio - expectedTotalRatio) < Math.abs(ratio - expectedVisibleRatio);

      const rowsInBounds = boundsLooksLikeTotalRows ? totalRows : visibleRows;
      const cellW = this._bounds.width / 10;
      const cellH = this._bounds.height / Math.max(1, rowsInBounds);
      const originY = boundsLooksLikeTotalRows ? bufferRows * cellH : 0;

      if (isDebug) {
        this._ctx.save();
        this._ctx.globalAlpha = 0.22;
        this._ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        this._ctx.lineWidth = 1;
        this._ctx.strokeRect(0.5, 0.5, this._bounds.width - 1, this._bounds.height - 1);
        if (boundsLooksLikeTotalRows) {
          // 标出“可见 20 行”区域（在总行数 bounds 的底部）
          this._ctx.strokeStyle = "rgba(0, 255, 170, 0.55)";
          this._ctx.strokeRect(0.5, originY + 0.5, this._bounds.width - 1, visibleRows * cellH - 1);
        }
        // 竖线 10 列
        for (let x = 1; x < 10; x++) {
          const px = x * cellW;
          this._ctx.beginPath();
          this._ctx.moveTo(px, 0);
          this._ctx.lineTo(px, this._bounds.height);
          this._ctx.stroke();
        }
        // 横线 rowsInBounds 行
        const rowCount = Math.min(60, Math.max(1, Math.round(rowsInBounds)));
        for (let y = 1; y < rowCount; y++) {
          const py = y * cellH;
          this._ctx.beginPath();
          this._ctx.moveTo(0, py);
          this._ctx.lineTo(this._bounds.width, py);
          this._ctx.stroke();
        }

        // 左上角打一个小字，方便用户截图反馈“当前映射到底选了啥”
        this._ctx.globalAlpha = 0.85;
        this._ctx.fillStyle = "rgba(0,0,0,0.55)";
        this._ctx.fillRect(6, 6, 220, 44);
        this._ctx.fillStyle = "rgba(255,255,255,0.92)";
        this._ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
        this._ctx.fillText(`ratio=${ratio.toFixed(3)} rows=${rowsInBounds}`, 12, 24);
        this._ctx.fillText(`vis=${visibleRows} buf=${bufferRows} originY=${originY.toFixed(1)}`, 12, 40);
        this._ctx.restore();
      }

      if (!suggestion?.cells?.length) return;

      this._ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      this._ctx.lineWidth = Math.max(1, Math.min(cellW, cellH) * 0.08);
      this._ctx.strokeStyle = "rgba(0, 255, 170, 0.95)";
      this._ctx.fillStyle = "rgba(0, 255, 170, 0.18)";

      for (const cell of suggestion.cells) {
        const vy = cell.y - bufferRows;
        if (vy < 0 || vy >= visibleRows) continue;
        const x = cell.x * cellW;
        const y = originY + vy * cellH;
        this._ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
        this._ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
      }

      this._ctx.globalAlpha = 1;
    }
  }

  window.tbpOverlay = new Overlay();
})();
