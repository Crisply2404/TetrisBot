const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSmartQueue, PIECES } = require("./sevenBagQueue.js");

test("readFullBag=false：只取 current+next5（最多6个）", () => {
  const current = "T";
  const next = ["I", "O", "J", "L", "S", "Z"];
  const r = buildSmartQueue({ current, next, readFullBag: false });
  assert.deepEqual(r.queue, ["T", "I", "O", "J", "L", "S"]);
  assert.ok(r.bagState.length >= 1);
});

test("readFullBag=false：bag_state 只看队列末尾（避免跨袋重复把引擎喂炸）", () => {
  // queue = I I I I O O（末尾有重复 O）
  // 如果用“整段去重”算 bag_state，会推出 drawnSet={I,O}，要求队列末尾 2 个必须是 I+O（且不重复），显然不成立。
  // 我们现在按“末尾最长不重复后缀”反推：末尾 drawn 只认为是 {O}，bag_state 里就应该包含 I 以及其它 5 个。
  const current = "I";
  const next = ["I", "I", "I", "O", "O", "T"];
  const r = buildSmartQueue({ current, next, readFullBag: false });
  assert.deepEqual(r.queue, ["I", "I", "I", "I", "O", "O"]);
  assert.deepEqual(r.bagState, ["I", "T", "S", "Z", "J", "L"]);
});

test("readFullBag=true：next5 跨袋时，返回 旧袋剩余+新袋完整7（长度12）", () => {
  // 设计成：旧袋剩余(4) + 新袋(7) + 再来一袋(7)...
  // 并让 “跨袋窗口” 很容易出现重复，避免误判边界。
  const current = "Z";
  const next = [
    // 旧袋剩余（after current）
    "I",
    "O",
    "T",
    "S",
    // 新袋（完整 7）
    "I",
    "O",
    "T",
    "S",
    "Z",
    "J",
    "L",
    // 再来一袋（完整 7）
    "L",
    "J",
    "Z",
    "S",
    "T",
    "O",
    "I"
  ];

  const r = buildSmartQueue({ current, next, readFullBag: true });
  assert.equal(r.bagStartIndex, 4);
  assert.equal(r.queue.length, 12);
  assert.deepEqual(r.queue, ["Z", "I", "O", "T", "S", "I", "O", "T", "S", "Z", "J", "L"]);
  assert.deepEqual(new Set(r.bagState), new Set(PIECES));
});

test("readFullBag=true：新袋还没进 next5 时，仍然只给6个", () => {
  // b=6：新袋从 next[6] 开始，next5 全在旧袋
  const current = "T";
  const next = [
    // 旧袋剩余（6个 after current）
    "I",
    "O",
    "S",
    "Z",
    "J",
    "L",
    // 新袋（完整7）
    "T",
    "I",
    "O",
    "S",
    "Z",
    "J",
    "L"
  ];

  const r = buildSmartQueue({ current, next, readFullBag: true, prevBagStartIndex: 6 });
  assert.equal(r.bagStartIndex, 6);
  assert.equal(r.queue.length, 6);
  assert.deepEqual(r.queue, ["T", "I", "O", "S", "Z", "J"]);
  assert.deepEqual(r.bagState, ["L"]);
});
