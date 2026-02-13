const sim = window.tbpTetrisSim;

function setMeta(text) {
  setText("meta", text);
}

function setCcInfo(text) {
  setText("ccInfo", text || "");
}

window.addEventListener("error", (e) => {
  try {
    setMeta(`页面报错：${e?.message || e}`);
  } catch {}
});

window.addEventListener("unhandledrejection", (e) => {
  try {
    setMeta(`页面报错：${e?.reason?.message || e?.reason || e}`);
  } catch {}
});

function parseTabId() {
  const u = new URL(location.href);
  const raw = u.searchParams.get("tabId");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

async function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => resolve(resp || null));
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function drawBoard(canvas, board01, bufferRows, visibleRows, highlightCells) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = 10;
  const cw = canvas.width / w;
  const ch = canvas.height / visibleRows;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b0c0f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!board01) return;

  for (let y = 0; y < bufferRows + visibleRows; y++) {
    for (let x = 0; x < w; x++) {
      const filled = board01[y]?.[x] ? 1 : 0;
      const vy = y - bufferRows;
      if (vy < 0 || vy >= visibleRows) continue;
      if (filled) {
        ctx.fillStyle = "#2a2f39";
        ctx.fillRect(x * cw, vy * ch, cw - 1, ch - 1);
      }
    }
  }

  if (Array.isArray(highlightCells)) {
    ctx.fillStyle = "rgba(0, 255, 170, 0.18)";
    ctx.strokeStyle = "rgba(0, 255, 170, 0.95)";
    ctx.lineWidth = Math.max(1, Math.min(cw, ch) * 0.08);
    for (const cell of highlightCells) {
      const vy = cell.y - bufferRows;
      if (vy < 0 || vy >= visibleRows) continue;
      const px = cell.x * cw;
      const py = vy * ch;
      ctx.fillRect(px + 1, py + 1, cw - 2, ch - 2);
      ctx.strokeRect(px + 1, py + 1, cw - 2, ch - 2);
    }
  }
}

function renderSteps(stepsEl, plan) {
  stepsEl.textContent = "";
  if (!Array.isArray(plan) || plan.length === 0) {
    const info = document.createElement("div");
    info.className = "step";
    info.textContent = "当前没有算出可用的步骤（可能读不到状态 / 引擎还在算）。";
    stepsEl.appendChild(info);
    return;
  }

  for (const step of plan) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "step";
    btn.dataset.stepIndex = String(step.index);

    const left = document.createElement("div");
    left.className = "piece";
    left.textContent = `#${step.index + 1}  ${step.piece}`;

    const right = document.createElement("div");
    right.className = "tag";
    right.textContent = `旋转=${step.rotation}  列=${step.x}`;

    btn.appendChild(left);
    btn.appendChild(right);
    stepsEl.appendChild(btn);
  }
}

let tabId = null;
let currentKey = "";
let currentState = null;
let liveSuggestion = null;
let planSuggestion = null;
let boardsBefore = [];
let selectedStepIndex = 0;
let viewMode = "live"; // "live" | "plan"

function renderViewMode() {
  const el = document.getElementById("viewMode");
  const btn = document.getElementById("backToLive");
  if (btn) btn.hidden = viewMode !== "plan";
  if (!el) return;
  if (viewMode === "plan") {
    el.textContent = "当前：预览后续（只影响此页，不影响叠加层）";
  } else {
    el.textContent = "当前：实时落点（叠加层与这里一致）";
  }
}

function computeBoardsBefore(board01, plan) {
  if (!board01 || !Array.isArray(plan) || plan.length === 0) return [];
  const boards = [];
  let cur = sim.cloneBoard(board01);
  for (const step of plan) {
    boards.push(sim.cloneBoard(cur));
    const { board: next } = sim.applyPlacement(cur, {
      piece: step.piece,
      rotation: step.rotation,
      x: step.x,
      y: step.y
    });
    cur = next;
  }
  return boards;
}

function setActiveStep(index) {
  selectedStepIndex = index;
  const canvas = document.getElementById("board");
  const state = currentState;
  const suggestionPlan = planSuggestion;
  const plan = suggestionPlan?.plan || [];
  const bufferRows = Number(state?.bufferRows ?? 0);
  const visibleRows = Number(state?.visibleRows ?? 20);
  const board01 = boardsBefore[index] || state?.board;
  const cells = viewMode === "live" && Array.isArray(liveSuggestion?.cells) ? liveSuggestion.cells : plan[index]?.cells || liveSuggestion?.cells;
  drawBoard(canvas, board01, bufferRows, visibleRows, cells);

  const stepsEl = document.getElementById("steps");
  if (stepsEl) {
    for (const el of stepsEl.querySelectorAll(".step")) {
      const idx = Number(el.dataset.stepIndex);
      el.classList.toggle("isActive", idx === index);
      el.setAttribute("aria-current", idx === index ? "step" : "false");
    }
  }
}

function applyDetailsData(state, live, planned, key, respError) {
  currentState = state || null;
  liveSuggestion = live || null;
  planSuggestion = planned || null;
  const nextStr = Array.isArray(state?.next) ? state.next.slice(0, 5).join("") : "-";
  const frameStr = Number.isFinite(state?.frame) ? String(state.frame) : "-";
  const canHold = state?.canHold === false ? "否" : "是";
  const meta = `已连接；帧=${frameStr}；当前=${state?.current || "-"} Hold=${state?.hold || "-"}（可Hold=${canHold}） Next=${nextStr}${
    respError ? `（提示：${respError}）` : ""
  }`;
  setText("meta", meta);

  const hint = live?.useHold ? "建议：这一步先按 Hold（如果你设置里允许）。" : "建议：这一步不需要 Hold。";
  setText("hint", hint);

  const plan = planned?.plan || [];
  boardsBefore = computeBoardsBefore(state?.board, plan);
  renderSteps(document.getElementById("steps"), plan);
  viewMode = "live";
  renderViewMode();
  setActiveStep(0);

  currentKey = key || "";
}

let refreshTimer = null;
let refreshBusy = false;

function resetDetailsUi(metaText) {
  currentKey = "";
  currentState = null;
  liveSuggestion = null;
  planSuggestion = null;
  boardsBefore = [];
  selectedStepIndex = 0;
  viewMode = "live";
  renderViewMode();

  setText("meta", metaText || "读不到状态（可能还没进游戏）。");
  setCcInfo("");
  setText("hint", "");

  const canvas = document.getElementById("board");
  if (canvas) drawBoard(canvas, null, 0, 20, null);

  const stepsEl = document.getElementById("steps");
  if (stepsEl) {
    stepsEl.textContent = "";
    const info = document.createElement("div");
    info.className = "step";
    info.textContent = "当前没有可显示的步骤（还没进游戏 / 或暂时读不到状态）。";
    stepsEl.appendChild(info);
  }
}

function renderColdClearInfo(engine, coldClearError, coldClearDebug) {
  const parts = [];
  if (engine) parts.push(`实时引擎=${engine}`);
  if (coldClearError) parts.push(`cold-clear=${coldClearError}`);
  const cc = coldClearDebug || null;
  if (cc?.movePiece) parts.push(`cc建议块=${cc.movePiece}`);
  if (cc?.moveSpin && cc.moveSpin !== "none") parts.push(`旋=${cc.moveSpin}`);
  if (cc?.pickStrategy) parts.push(`挑选=${cc.pickStrategy}`);
  if (Number.isFinite(cc?.moveIndex) && Number.isFinite(cc?.moveCount)) parts.push(`排行=${cc.moveIndex + 1}/${cc.moveCount}`);
  const q = Array.isArray(cc?.usedQueue) ? cc.usedQueue : Array.isArray(cc?.desiredQueue) ? cc.desiredQueue : null;
  if (Array.isArray(q) && q.length) parts.push(`喂给cc：${q.join(" ")}`);
  const mode = cc?.usedMode || cc?.desiredMode || null;
  if (mode) parts.push(`队列模式=${mode}`);
  if (cc?.syncType) parts.push(`同步=${cc.syncType}`);
  if (cc?.phase) parts.push(`阶段=${cc.phase}`);
  if (Number.isFinite(cc?.timeoutMs)) parts.push(`超时阈值=${cc.timeoutMs}ms`);
  if (cc?.workerError) parts.push(`workerErr=${String(cc.workerError).slice(0, 120)}`);
  if (cc?.workerCrashed) parts.push("worker=已崩溃（会自动重启）");
  setCcInfo(parts.join("；"));
}

async function refresh() {
  if (!tabId) return;
  if (refreshBusy) return;
  refreshBusy = true;
  try {
    const resp = await sendToTab(tabId, { type: "TBP_GET_DETAILS_DATA" });
    if (!resp?.ok) {
      resetDetailsUi(resp?.error || "读不到状态（可能还没进游戏）。");
      return;
    }
    if (!resp.connected) {
      resetDetailsUi(resp.error || "未连接（读不到状态）。");
      return;
    }

    const key = String(resp.key || "");
    const state = resp.state || null;
    const live = resp.suggestion || null;
    const planned = resp.detailsSuggestion || null;
    renderColdClearInfo(resp.engine || null, resp.coldClearError || null, resp.coldClearDebug || null);

    if (!state) {
      resetDetailsUi(resp.error || "状态还没准备好（可能不在对局中）。");
      return;
    }

    if (key && key !== currentKey) {
      selectedStepIndex = 0;
      applyDetailsData(state, live, planned, key, resp.error || null);
      return;
    }

    currentState = state;
    if (live) liveSuggestion = live;
    if (planned) planSuggestion = planned;
    setActiveStep(selectedStepIndex);
  } finally {
    refreshBusy = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  tabId = parseTabId();
  if (!tabId) {
    setText("meta", "缺少 tabId：请从扩展弹窗里点“打开详情（实时）”。");
    return;
  }

  setText("meta", `正在读取实时状态…（tabId=${tabId}）`);
  renderViewMode();
  await refresh();
  refreshTimer = window.setInterval(refresh, 350);

  document.getElementById("backToLive")?.addEventListener("click", () => {
    viewMode = "live";
    selectedStepIndex = 0;
    renderViewMode();
    setActiveStep(0);
  });

  document.getElementById("steps")?.addEventListener("click", (e) => {
    const target = e.target?.closest?.(".step");
    if (!target) return;
    const idx = Number(target.dataset.stepIndex);
    if (!Number.isFinite(idx)) return;
    viewMode = "plan";
    renderViewMode();
    setActiveStep(idx);
  });
});
