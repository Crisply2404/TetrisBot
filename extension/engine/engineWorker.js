/* global tbpTetrisSim */
importScripts("../shared/tetris-sim.js");

const sim = self.tbpTetrisSim;

function normalizeBoard(board, expectedHeight = 40, expectedWidth = 10) {
  if (!Array.isArray(board) || !Array.isArray(board[0])) return null;
  const h = board.length;
  const w = board[0].length;
  if (w !== expectedWidth) return null;
  if (h === expectedHeight) return board;
  if (h > expectedHeight) return board.slice(h - expectedHeight);
  const pad = sim.emptyBoard(expectedHeight - h, expectedWidth);
  return pad.concat(board);
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

  if (!state?.board) {
    debug.reason = "没有棋盘数据（board 是空的）";
    return { best: null, debug };
  }

  const board = normalizeBoard(state.board);
  if (!board) {
    debug.reason = "棋盘尺寸不对（需要 10 列；高度会自动补到 40 行）";
    return { best: null, debug };
  }
  const preset = settings?.modePreset === "vs" ? "vs" : "40l";
  const current = sim.normalizePieceId(state.current);
  if (!current) {
    debug.reason = "拿不到当前块（current 不是 I/O/T/S/Z/J/L）";
    return { best: null, debug };
  }

  const placements = sim.enumeratePlacements(board, current);
  debug.placements = placements.length;
  if (!placements.length) {
    debug.reason = "当前块没有任何可落点（可能是棋盘解析错/或者游戏不在可操作状态）";
    return { best: null, debug };
  }

  const best = sim.pickBestMove(board, current, preset);
  if (!best) {
    debug.reason = "内部评分器返回空（异常情况）";
    return { best: null, debug };
  }
  debug.reason = null;
  return { best, debug };
}

function computePlan(state, settings) {
  const board = normalizeBoard(state.board);
  if (!board) return null;
  const preset = settings?.modePreset === "vs" ? "vs" : "40l";

  const current = sim.normalizePieceId(state.current);
  const hold = sim.normalizePieceId(state.hold);
  const next = Array.isArray(state.next) ? state.next.map(sim.normalizePieceId).filter(Boolean) : [];
  if (!current) return null;

  const lookahead = next.slice(0, 5);
  const basePieces = [current, ...lookahead].filter(Boolean);

  const allowHold = !!settings?.useHold;
  if (!allowHold) {
    const moves = sim.beamSearchPlan(board, basePieces, preset, 25);
    return { useHold: false, moves };
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

  if (!holdMoves || holdMoves.length === 0) return { useHold: false, moves: noHoldMoves };
  if (noHoldMoves.length === 0) return { useHold: true, moves: holdMoves };

  const noHoldScore = noHoldMoves.reduce((a, m) => a + (m.cleared || 0), 0);
  const holdScore = holdMoves.reduce((a, m) => a + (m.cleared || 0), 0);
  const useHold = holdScore > noHoldScore;
  return { useHold, moves: useHold ? holdMoves : noHoldMoves };
}

function toSuggestionFromMove(move) {
  if (!move) return null;
  return {
    useHold: false,
    rotation: move.rotation,
    x: move.x,
    y: move.y,
    cells: move.cells
  };
}

self.onmessage = (event) => {
  const msg = event.data;
  if (!msg?.type) return;
  try {
    if (msg.type === "COMPUTE_LIVE") {
      const { state, settings } = msg.payload || {};
      const { best, debug } = computeBestCurrent(state, settings) || {};
      const suggestion = toSuggestionFromMove(best);
      self.postMessage({ type: "LIVE_RESULT", requestId: msg.requestId, suggestion, debug });
      return;
    }
    if (msg.type === "COMPUTE_SNAPSHOT") {
      const { state, settings } = msg.payload || {};
      const plan = computePlan(state, settings);
      const first = plan?.moves?.[0] || null;
      const suggestion = {
        useHold: !!plan?.useHold,
        rotation: first?.rotation ?? 0,
        x: first?.x ?? 0,
        y: first?.y ?? 0,
        cells: first?.cells ?? [],
        plan: (plan?.moves || []).map((m, idx) => ({
          index: idx,
          piece: m.piece,
          rotation: m.rotation,
          x: m.x,
          y: m.y,
          cells: m.cells,
          cleared: m.cleared
        }))
      };
      self.postMessage({ type: "SNAPSHOT_RESULT", requestId: msg.requestId, suggestion });
      return;
    }
  } catch (e) {
    self.postMessage({ type: "ENGINE_ERROR", error: String(e?.message || e) });
  }
};
