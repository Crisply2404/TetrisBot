(() => {
  const PIECES = /** @type {const} */ (["I", "O", "T", "S", "Z", "J", "L"]);
  const PIECE_SET = new Set(PIECES);

  function normalizePiece(p) {
    if (!p) return null;
    const s = String(p).trim().toUpperCase();
    return PIECE_SET.has(s) ? s : null;
  }

  function isFullBagSegment(segment) {
    if (!Array.isArray(segment) || segment.length !== 7) return false;
    const set = new Set();
    for (const p of segment) {
      if (!p || !PIECE_SET.has(p)) return false;
      set.add(p);
    }
    if (set.size !== 7) return false;
    for (const p of PIECES) if (!set.has(p)) return false;
    return true;
  }

  function scoreConsecutiveFullBags(nextPieces, startIndex, maxBags = 3) {
    if (!Array.isArray(nextPieces)) return 0;
    let score = 0;
    for (let i = 0; i < maxBags; i++) {
      const idx = startIndex + i * 7;
      if (idx + 7 > nextPieces.length) break;
      if (!isFullBagSegment(nextPieces.slice(idx, idx + 7))) break;
      score += 1;
    }
    return score;
  }

  function findBagStartCandidates(nextPieces) {
    const out = [];
    for (let i = 0; i <= 6; i++) {
      if (i + 7 > nextPieces.length) break;
      if (isFullBagSegment(nextPieces.slice(i, i + 7))) out.push(i);
    }
    return out;
  }

  function circularDistance(a, b, mod) {
    const d = Math.abs(a - b);
    return Math.min(d, mod - d);
  }

  function chooseBagStartIndex(nextPieces, prevBagStartIndex) {
    const candidates = findBagStartCandidates(nextPieces);
    if (!candidates.length) return null;

    const hasPrev = Number.isFinite(prevBagStartIndex);
    let best = candidates[0];
    let bestScore = -Infinity;
    let bestDist = Infinity;

    for (const cand of candidates) {
      const score = scoreConsecutiveFullBags(nextPieces, cand, 3);
      const dist = hasPrev ? circularDistance(cand, prevBagStartIndex, 7) : 0;

      if (score > bestScore) {
        best = cand;
        bestScore = score;
        bestDist = dist;
        continue;
      }
      if (score < bestScore) continue;

      // score 相同：优先选“更接近上一帧估计”的
      if (hasPrev) {
        if (dist < bestDist) {
          best = cand;
          bestDist = dist;
          continue;
        }
        if (dist > bestDist) continue;
      }

      // 仍然相同：优先选更大的 index（更像“新袋还没那么早出现”）
      if (cand > best) best = cand;
    }
    return best;
  }

  // 计算：在“只给 current+next5”这种短队列场景下，队列末尾所在的 bag_state（TBP randomizer 的语义：队列末尾的袋子里还剩什么）
  // 关键点：只能从队列末尾反推；不能用“整段去重”来算，否则一旦出现跨袋重复（例如 ...I ... I），bag_state 会变得不可能，容易把引擎喂炸。
  function bagStateAtQueueEnd(queuePieces) {
    const q = Array.isArray(queuePieces) ? queuePieces : [];
    if (!q.length) return [...PIECES];

    const suffixSeen = new Set();
    // 从队列末尾往前扫，直到遇到重复（重复通常意味着跨袋边界）
    for (let i = q.length - 1, n = 0; i >= 0 && n < 7; i--, n++) {
      const p = q[i];
      if (!p || !PIECE_SET.has(p)) continue;
      if (suffixSeen.has(p)) break;
      suffixSeen.add(p);
    }

    // 如果刚好凑满 7 个不重复：说明最后一袋被用空了，队列末尾之后会刷新成“满袋”
    if (suffixSeen.size >= 7) return [...PIECES];

    const remain = PIECES.filter((p) => !suffixSeen.has(p));
    return remain.length ? remain : [...PIECES];
  }

  /**
   * 生成“智能变长队列”（你描述的 6→12→递减→6 循环的基础输入）
   *
   * 返回：
   * - queue: 要喂给冷清算的 queue（含 current）
   * - bagStartIndex: next[] 里“新袋开始”的下标（0..6），找不到则为 null
   * - bagState: TBP seven_bag 的 bag_state（我们尽量保证非空；readFullBag=true 时偏保守给满袋）
   */
  function buildSmartQueue({ current, next, readFullBag, prevBagStartIndex } = {}) {
    const cur = normalizePiece(current);
    const nextPieces = Array.isArray(next) ? next.map(normalizePiece).filter(Boolean) : [];

    if (!cur) {
      return { queue: [], bagStartIndex: null, bagState: [...PIECES], mode: "invalid" };
    }

    // 默认：current + next5
    if (!readFullBag) {
      const queue = [cur, ...nextPieces].slice(0, 6);
      const bagState = bagStateAtQueueEnd(queue);
      return { queue, bagStartIndex: null, bagState, mode: "short" };
    }

    // readFullBag=true：尝试找出 next[] 里“新袋开始”的位置（bagStartIndex）
    const bagStartIndex = chooseBagStartIndex(nextPieces, prevBagStartIndex);

    // 如果实在找不到边界：退回“固定12”，并把 bag_state 设成满袋（更稳，不容易把引擎喂炸）
    if (bagStartIndex === null) {
      const queue = [cur, ...nextPieces].slice(0, 12);
      return { queue, bagStartIndex: null, bagState: [...PIECES], mode: "fallback12" };
    }

    const r = bagStartIndex + 1; // 旧袋剩余（含 current）

    // 新袋还没进 next5：继续只给6（省时间）
    if (r >= 6) {
      const queue = [cur, ...nextPieces].slice(0, 6);
      // r=7：我们只取了 6 个，还差旧袋最后 1 个；bag_state 就是那 1 个
      const bagState = r === 7 && nextPieces.length >= 6 ? [nextPieces[5]] : [...PIECES];
      return { queue, bagStartIndex, bagState, mode: "short" };
    }

    // next5 已跨袋：旧袋剩余 + 新袋完整7（长度 = r + 7）
    if (nextPieces.length < bagStartIndex + 7) {
      const queue = [cur, ...nextPieces].slice(0, 12);
      return { queue, bagStartIndex, bagState: [...PIECES], mode: "fallback12" };
    }

    const oldRemainAfterCurrent = nextPieces.slice(0, bagStartIndex);
    const newBag = nextPieces.slice(bagStartIndex, bagStartIndex + 7);
    const queue = [cur, ...oldRemainAfterCurrent, ...newBag];
    return { queue, bagStartIndex, bagState: [...PIECES], mode: "smart" };
  }

  const api = {
    PIECES,
    normalizePiece,
    buildSmartQueue,
    chooseBagStartIndex,
    findBagStartCandidates
  };

  try {
    const root = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : window;
    root.tbpSevenBagQueue = api;
  } catch {}

  try {
    if (typeof module !== "undefined" && module.exports) module.exports = api;
  } catch {}
})();
