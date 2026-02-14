#!/usr/bin/env node
/**
 * 本地 Cold Clear 2 服务（给 Chrome 扩展用）
 *
 * - 监听 localhost：http://127.0.0.1:47123
 * - 提供 /health /suggest /reset
 * - 内部通过 stdin/stdout 驱动 cold-clear-2 (TBP)
 *
 * 说明：为了简单和稳定，目前每次 /suggest 都会发送一次 start + suggest（不依赖 play 增量同步）。
 */

const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const DEFAULT_PORT = 47123;
const DEFAULT_HOST = "127.0.0.1";

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePiece(p) {
  if (!p) return null;
  const s = String(p).trim().toUpperCase();
  return ["I", "O", "T", "S", "Z", "J", "L"].includes(s) ? s : null;
}

function defaultCc2BinaryPath() {
  const exe = process.platform === "win32" ? "cold-clear-2.exe" : "cold-clear-2";
  return path.join(__dirname, "..", "ref", "cold-clear-2", "target", "release", exe);
}

function resolveCc2Binary() {
  const fromEnv = String(process.env.TBP_CC2_BIN || "").trim();
  const p = fromEnv ? path.resolve(fromEnv) : defaultCc2BinaryPath();
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

function loadSevenBagQueue() {
  try {
    // 复用扩展里的实现（同时提供 CommonJS export）
    // eslint-disable-next-line global-require
    return require(path.join(__dirname, "..", "extension", "engine", "sevenBagQueue.js"));
  } catch {
    return null;
  }
}

class LineJsonRpcProcess {
  constructor(binPath) {
    this._binPath = binPath;
    this._child = null;
    this._stdoutBuf = "";
    this._waiters = [];
    this._ready = null;
    this._lastStderr = "";
    this._deadReason = null;
    this._queue = Promise.resolve();
  }

  _spawn() {
    if (this._child && !this._deadReason) return;
    this._deadReason = null;
    this._ready = null;
    this._waiters = [];
    this._stdoutBuf = "";
    this._lastStderr = "";

    const child = spawn(this._binPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.setDefaultEncoding("utf8");

    child.stdout.on("data", (chunk) => this._onStdout(chunk));
    child.stderr.on("data", (chunk) => {
      const s = String(chunk || "");
      this._lastStderr = (this._lastStderr + s).slice(-8000);
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
    const ms = num(timeoutMs, 1500);
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

  _post(msg) {
    this._spawn();
    if (!this._child || this._deadReason) throw new Error(this._deadReason || "dead");
    this._child.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  async ensureReady() {
    if (this._ready) return await this._ready;
    this._spawn();
    const start = Date.now();
    const bin = this._binPath;
    this._ready = (async () => {
      // cold-clear-2 启动后会先输出一条 info，我们用它当作“进程确实活着”的信号。
      await this._waitFor((m) => m?.type === "info" || m?.type === "ready", 3000).catch(() => null);
      this._post({ type: "rules" });
      const ready = await this._waitFor((m) => m?.type === "ready", 3000).catch(() => null);
      if (!ready) {
        const stderr = this._lastStderr ? `; stderr=${this._lastStderr}` : "";
        throw new Error(`cc2-not-ready (bin=${bin}, ${Date.now() - start}ms${stderr})`);
      }
      return true;
    })();
    return await this._ready;
  }

  async reset() {
    try {
      if (this._child) {
        try {
          this._post({ type: "stop" });
        } catch {}
        this._child.kill();
      }
    } catch {}
    this._child = null;
    this._deadReason = "reset";
    this._ready = null;
    this._waiters = [];
    this._stdoutBuf = "";
    this._lastStderr = "";
    this._queue = Promise.resolve();
  }

  suggestFromState(payload) {
    // 串行化：一个 bot 进程一次只处理一个 /suggest
    this._queue = this._queue
      .catch(() => null)
      .then(async () => {
        const state = payload?.state || null;
        const settings = payload?.settings || null;

        const current = normalizePiece(state?.current);
        const holdRaw = normalizePiece(state?.hold);
        const useHold = settings?.useHold !== false;
        const hold = useHold ? holdRaw : null;

        const next = Array.isArray(state?.next) ? state.next.map(normalizePiece).filter(Boolean) : [];
        const api = loadSevenBagQueue();
        const built = api?.buildSmartQueue
          ? api.buildSmartQueue({
              current,
              next,
              readFullBag: settings?.readFullBag !== false,
              prevBagStartIndex: null
            })
          : null;

        const queue = Array.isArray(built?.queue) ? built.queue.map(normalizePiece).filter(Boolean) : [current, ...next].filter(Boolean).slice(0, 12);
        const bag_state_raw = Array.isArray(built?.bagState) ? built.bagState.map(normalizePiece).filter(Boolean) : ["I", "O", "T", "S", "Z", "J", "L"];
        const bag_state = Array.from(new Set(bag_state_raw)).filter(Boolean);
        const board = boardTopToTbpBoard(state?.board);

        if (!current || !board || !queue.length) {
          return {
            ok: false,
            engine: "cold-clear-2",
            error: "状态不足（缺 current/board/queue）",
            debug: { current, hasBoard: !!board, queueLen: queue.length }
          };
        }

        const combo = Number.isFinite(Number(state?.combo)) ? Math.max(0, Math.floor(Number(state.combo))) : 0;
        const back_to_back = state?.backToBack === true;

        await this.ensureReady();

        // 为了稳定：每次都从 start 重新算，避免因 undo/消行动画/帧回退导致内部状态串。
        this._post({ type: "stop" });
        this._post({
          type: "start",
          hold,
          queue,
          combo,
          back_to_back,
          board,
          randomizer: { type: "seven_bag", bag_state: bag_state.length ? bag_state : ["I", "O", "T", "S", "Z", "J", "L"] }
        });
        this._post({ type: "suggest" });

        const timeoutMs = num(settings?.cc2TimeoutMs, 900);
        const msg = await this._waitFor((m) => m?.type === "suggestion", timeoutMs).catch((e) => {
          const stderr = this._lastStderr ? `；stderr=${this._lastStderr}` : "";
          throw new Error(`timeout:${e?.message || e}${stderr}`);
        });

        const moves = Array.isArray(msg?.moves) ? msg.moves : [];
        const first = moves[0] || null;
        const loc = first?.location || null;
        const piece = normalizePiece(loc?.type || loc?.piece);
        const orientation = String(loc?.orientation || "north").toLowerCase();
        const x = Number(loc?.x);
        const y = Number(loc?.y);
        const spin = String(first?.spin || "none").toLowerCase();
        if (!piece || !Number.isFinite(x) || !Number.isFinite(y)) {
          return {
            ok: false,
            engine: "cold-clear-2",
            error: "cc2 没返回可用落点",
            debug: { moveCount: moves.length }
          };
        }

        return {
          ok: true,
          engine: "cold-clear-2",
          move: { piece, orientation, x, y, spin, moveIndex: 0, moveCount: moves.length, pickStrategy: "tbp:first" },
          useHold: !!current && piece !== current,
          debug: {
            usedQueue: queue,
            usedBagState: bag_state,
            move_info: msg?.move_info || null
          }
        };
      });

    return this._queue;
  }
}

const port = num(process.env.TBP_CC2_PORT, DEFAULT_PORT);
const host = String(process.env.TBP_CC2_HOST || DEFAULT_HOST);
const binPath = resolveCc2Binary();

const cc2 = new LineJsonRpcProcess(binPath);

function healthPayload() {
  return {
    ok: true,
    service: "tbp-cc2-local",
    host,
    port,
    binPath,
    binExists: fs.existsSync(binPath)
  };
}

const server = http.createServer(async (req, res) => {
  try {
    withCors(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end("");
      return;
    }

    const url = new URL(req.url || "/", `http://${host}:${port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, healthPayload());
      return;
    }

    if (req.method === "POST" && url.pathname === "/reset") {
      await cc2.reset();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/suggest") {
      const bodyText = await readBody(req);
      const payload = safeJsonParse(bodyText);
      if (!payload || typeof payload !== "object") {
        sendJson(res, 400, { ok: false, error: "bad-json" });
        return;
      }

      // 二进制不存在就直接提示（比“连不上”更好排查）
      if (!fs.existsSync(binPath)) {
        sendJson(res, 500, {
          ok: false,
          engine: "cold-clear-2",
          error: `找不到 cc2 可执行文件：${binPath}（请先编译 ref/cold-clear-2）`
        });
        return;
      }

      const out = await cc2.suggestFromState(payload);
      sendJson(res, 200, out || { ok: false, error: "no-response" });
      return;
    }

    sendJson(res, 404, { ok: false, error: "not-found" });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: String(e?.message || e || "error") });
  }
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`[tbp-cc2-local] listening on http://${host}:${port} (bin=${binPath})`);
});

