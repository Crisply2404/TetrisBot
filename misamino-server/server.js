#!/usr/bin/env node
/**
 * 本地 MisaMinoBot 服务（给 Chrome 扩展用）
 *
 * - 监听：http://127.0.0.1:47124
 * - 提供 /health /suggest /reset
 * - 内部通过 stdin/stdout 驱动 ref/misamino-bot/tetris_ai (action_json)
 *
 * 备注：
 * - 目前按“只喂 next5”设计（MisaMinoBot 内部也只取 5 个 next）。
 * - MisaMinoBot 的坐标系与扩展不同：这里会把返回 cells 映射到扩展的 40 高度 top 坐标（允许 y < 0）。
 */

const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const DEFAULT_PORT = 47124;
const DEFAULT_HOST = "127.0.0.1";
const MISAMINO_FIELD_H = 24; // 20 可见 + 适当 buffer（避免堆高时“看不见上面方块”）

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePiece(p) {
  if (!p) return null;
  const s = String(p).trim().toUpperCase();
  return ["I", "O", "T", "S", "Z", "J", "L"].includes(s) ? s : null;
}

function defaultMisaBinaryPath() {
  const exe = process.platform === "win32" ? "tetris_ai.exe" : "tetris_ai";
  return path.join(__dirname, "..", "ref", "misamino-bot", "tetris_ai", "dist", "Release", "GNU-Linux", exe);
}

function resolveMisaBinary() {
  const fromEnv = String(process.env.TBP_MISA_BIN || "").trim();
  const p = fromEnv ? path.resolve(fromEnv) : defaultMisaBinaryPath();
  return p;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("body-too-large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (e) => reject(e));
  });
}

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function sendJson(res, code, obj) {
  withCors(res);
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function boardTopToMisaField(board01Top, height = MISAMINO_FIELD_H) {
  const H = Array.isArray(board01Top) ? board01Top.length : 0;
  if (H < height) return null;
  const w = Array.isArray(board01Top?.[0]) ? board01Top[0].length : 0;
  if (w !== 10) return null;

  const start = H - height;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const src = board01Top[start + y];
    const cells = new Array(10);
    for (let x = 0; x < 10; x++) cells[x] = src?.[x] ? 2 : 0;
    rows.push(cells.join(","));
  }
  return rows.join(";");
}

function misaSpinToOrientation(spin) {
  const s = Number(spin);
  if (s === 1) return "east";
  if (s === 2) return "south";
  if (s === 3) return "west";
  return "north";
}

function expectedDroppedPiece({ current, hold, next, canHold, useHold }) {
  const cur = normalizePiece(current);
  const h = normalizePiece(hold);
  const n1 = Array.isArray(next) ? normalizePiece(next[0]) : null;
  const ch = !!canHold;
  const uh = !!useHold;
  if (!cur) return null;
  if (!uh) return cur;
  if (!ch) return null;
  if (h) return h;
  return n1;
}

function validateMisaResponse({ current, hold, next, canHold }, raw) {
  const gotPiece = normalizePiece(raw?.piece);
  const useHold = !!raw?.useHold;
  const expected = expectedDroppedPiece({ current, hold, next, canHold, useHold });
  const ok = !!expected && !!gotPiece && expected === gotPiece;
  return {
    ok,
    expected,
    got: gotPiece,
    useHold,
    canHold: !!canHold
  };
}

class LineJsonProcess {
  constructor(binPath) {
    this._binPath = binPath;
    this._child = null;
    this._stdoutBuf = "";
    this._waiters = [];
    this._lastStderr = "";
    this._deadReason = null;
    this._queue = Promise.resolve();
  }

  _spawn() {
    if (this._child && !this._deadReason) return;

    this._deadReason = null;
    this._waiters = [];
    this._stdoutBuf = "";
    this._lastStderr = "";

    const child = spawn(this._binPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.setDefaultEncoding("utf8");
    child.stdout.on("data", (chunk) => this._onStdout(chunk));
    child.stderr.on("data", (chunk) => {
      this._lastStderr = (this._lastStderr + String(chunk || "")).slice(-8000);
    });
    child.on("exit", (code, signal) => {
      this._deadReason = `exit:${code ?? "?"}:${signal ?? "-"}`;
      this._failAllWaiters(this._deadReason);
    });
    child.on("error", (e) => {
      this._deadReason = `spawn-error:${String(e?.message || e)}`;
      this._failAllWaiters(this._deadReason);
    });

    this._child = child;
  }

  _failAllWaiters(reason) {
    const err = new Error(String(reason || "dead"));
    const waiters = this._waiters.slice();
    this._waiters = [];
    for (const w of waiters) {
      try {
        w.reject(err);
      } catch {}
    }
  }

  _onStdout(chunk) {
    this._stdoutBuf += String(chunk || "");
    while (true) {
      const idx = this._stdoutBuf.indexOf("\n");
      if (idx < 0) break;
      const line = this._stdoutBuf.slice(0, idx).trim();
      this._stdoutBuf = this._stdoutBuf.slice(idx + 1);
      if (!line) continue;
      const msg = safeJsonParse(line);
      if (!msg || typeof msg !== "object") continue;
      this._dispatch(msg);
    }
  }

  _dispatch(msg) {
    for (let i = 0; i < this._waiters.length; i++) {
      const w = this._waiters[i];
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
    const ms = num(timeoutMs, 1000);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve: null, reject: null };
      const t = setTimeout(() => {
        try {
          const idx = this._waiters.indexOf(waiter);
          if (idx >= 0) this._waiters.splice(idx, 1);
        } catch {}
        reject(new Error("timeout"));
      }, ms);
      waiter.resolve = (msg) => {
        clearTimeout(t);
        resolve(msg);
      };
      waiter.reject = (err) => {
        clearTimeout(t);
        reject(err);
      };
      this._waiters.push(waiter);
    });
  }

  _write(text) {
    this._spawn();
    if (!this._child || this._deadReason) throw new Error(this._deadReason || "dead");
    this._child.stdin.write(String(text || ""));
  }

  async request(cmdText, { timeoutMs = 1000 } = {}) {
    // 串行化：避免一次写入触发多次回包时乱序
    this._queue = this._queue.then(async () => {
      try {
        this._write(cmdText);
        return await this._waitFor((msg) => typeof msg?.ok === "boolean", timeoutMs);
      } catch (e) {
        // 关键：一旦超时/异常，就把子进程强制重启，避免“旧回包”污染下一次请求
        try {
          this.resetHard();
        } catch {}
        throw e;
      }
    });
    return await this._queue;
  }

  resetHard() {
    try {
      if (this._child && !this._deadReason) this._child.kill("SIGKILL");
    } catch {}
    this._deadReason = "reset";
    this._child = null;
    this._failAllWaiters("reset");
  }

  get lastStderr() {
    return this._lastStderr;
  }
}

let proc = null;

function ensureProc() {
  const bin = resolveMisaBinary();
  if (!proc || proc._binPath !== bin) proc = new LineJsonProcess(bin);
  return proc;
}

function buildCommandText({ current, next, hold, canHold, field }) {
  const holdChar = hold || "N";
  const can = canHold ? "1" : "0";
  const nextStr = Array.isArray(next) ? next.join(",") : "";
  // 注意：Bot parser 是按 token 读取的，field 里不能有空格
  return [
    "update game round 1",
    `update game this_piece_type ${current}`,
    `update game next_pieces ${nextStr}`,
    `update bot1 field ${field}`,
    `update bot1 hold ${holdChar}`,
    `update bot1 canHold ${can}`,
    "action_json moves 10000"
  ].join("\n") + "\n";
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      withCors(res);
      res.statusCode = 204;
      res.end("");
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/health")) {
      const bin = resolveMisaBinary();
      const exists = fs.existsSync(bin);
      sendJson(res, 200, { ok: true, engine: "misamino", bin, exists });
      return;
    }

    if (req.method === "POST" && req.url?.startsWith("/reset")) {
      const p = ensureProc();
      p.resetHard();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url?.startsWith("/suggest")) {
      const text = await readBody(req);
      const body = safeJsonParse(text);
      const state = body?.state || null;
      const settings = body?.settings || null;

      const current = normalizePiece(state?.current);
      const hold0 = normalizePiece(state?.hold);
      const next0 = Array.isArray(state?.next) ? state.next.map(normalizePiece).filter(Boolean) : [];

      const board = state?.board || null;
      const field = boardTopToMisaField(board, MISAMINO_FIELD_H);

      const useHoldSetting = settings?.useHold !== false;
      const canHold = !!state?.canHold && useHoldSetting;
      const hold = useHoldSetting ? hold0 : null;

      if (!current || !field || next0.length < 1) {
        sendJson(res, 400, {
          ok: false,
          error: "bad-request",
          detail: {
            hasCurrent: !!current,
            hasField: !!field,
            nextLen: next0.length
          }
        });
        return;
      }

      // MisaMino 的 next_pieces 会把 next1.. 填到 m_next[1..]，newpiece() 会消费 m_next[0] (this_piece_type)
      const next = next0.slice(0, 5);

      const cmdText = buildCommandText({ current, next, hold, canHold, field });
      const timeoutMs = num(settings?.misaminoTimeoutMs, 800);
      const p = ensureProc();
      const queryOnce = async () => await p.request(cmdText, { timeoutMs });

      let raw = null;
      let validation = null;
      let attempt = 0;
      while (attempt < 2) {
        attempt++;
        try {
          raw = await queryOnce();
        } catch (e) {
          sendJson(res, 200, { ok: false, error: `misamino 超时/崩溃：${String(e?.message || e)}`, stderr: p.lastStderr || "" });
          return;
        }

        validation = validateMisaResponse({ current, hold, next, canHold }, raw);
        if (raw?.ok && validation?.ok) break;

        // 这里极其关键：如果返回了“不可能的块”（比如当前=L/hold空/next1=O，却返回 J），
        // 大概率是 bot 旧回包/不同步。直接硬重启子进程并重试一次，避免扩展画出错误提示。
        if (raw?.ok && !validation?.ok) {
          try {
            p.resetHard();
          } catch {}
          continue;
        }
        break;
      }

      if (!raw?.ok) {
        sendJson(res, 200, { ok: false, error: raw?.error || "misamino 返回失败", raw });
        return;
      }
      if (validation && !validation.ok) {
        sendJson(res, 200, {
          ok: false,
          error: `misamino 不同步：返回 ${validation.got || "?"}（useHold=${validation.useHold ? "true" : "false"}），但按当前状态只能是 ${
            validation.expected || "?"
          }。已自动重试仍异常。`,
          raw,
          detail: {
            current,
            hold,
            next,
            canHold,
            expected: validation.expected,
            got: validation.got,
            useHold: validation.useHold
          }
        });
        return;
      }

      const piece = normalizePiece(raw?.piece);
      const spin = Number(raw?.spin);
      const orientation = misaSpinToOrientation(spin);
      const useHold = !!raw?.useHold;

      const cells20 = Array.isArray(raw?.cells) ? raw.cells : [];
      const cellsTop40 = [];
      const offsetY = 40 - MISAMINO_FIELD_H;
      for (const c of cells20) {
        const x = Number(Array.isArray(c) ? c[0] : null);
        const y = Number(Array.isArray(c) ? c[1] : null);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        // MisaMino 的 y 似乎是 1..20（顶部留了 0 作为缓冲），这里转成 0-based 再加 offset
        cellsTop40.push({ x, y: (y - 1) + offsetY });
      }

      sendJson(res, 200, {
        ok: true,
        engine: "misamino",
        useHold,
        move: piece ? { piece, orientation, x: raw?.x ?? null, y: raw?.y ?? null } : null,
        cells: cellsTop40,
        debug: settings?.debug
          ? { raw, fieldH: MISAMINO_FIELD_H, offsetY, note: "cells 已映射到 boardHeight=40 的 top 坐标" }
          : null
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: "not-found" });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: String(e?.message || e || "internal-error") });
  }
});

const port = num(process.env.TBP_MISA_PORT, DEFAULT_PORT);
server.listen(port, DEFAULT_HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[misamino-server] listening on http://${DEFAULT_HOST}:${port}`);
});
