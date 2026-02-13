(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    modePreset: "40l",
    allowedSpins: "tspins",
    useHold: true,
    opacity: 0.45,
    // 读取更长块序：默认开启（并按 6 → 12 → … → 6 的变长队列策略喂给 cold-clear）
    // 你也可以在设置页关掉，强制回到“只看 next5（更快但更弱）”做对比。
    readFullBag: true,
    debug: false,
    // 缩放/窗口适配样本（由“测缩放系数（采样）”页面或校准保存自动记录）
    // 用于在窗口大小变化时更聪明地重算锁定框，减少“缩放后对不齐”。
    // 内置一组采样点（主要用于你“还没来得及记录样本/清空了 storage”时的兜底）。
    // 真正的自适应会以你本机记录到的 scaleSamples 为准（校准保存/采样工具都会自动写入）。
    scaleSamples: [
      { viewport: { w: 3416, h: 1700 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.39405467801237093, dyr: 0.13615454614580058, hr: 0.8717460883963596, wr: 0.5529267885465421 } },
      { viewport: { w: 3192, h: 1700 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.3904414488174213, dyr: 0.1387665722593435, hr: 0.8716280707333557, wr: 0.5521748411824614 } },
      { viewport: { w: 2984, h: 1700 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.39013615701373233, dyr: 0.14275765580387736, hr: 0.8699818354840365, wr: 0.5532308115116059 } },
      { viewport: { w: 2716, h: 1700 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.39044807177857316, dyr: 0.1496963777105783, hr: 0.8670573051552829, wr: 0.5548834954575735 } },
      { viewport: { w: 2429, h: 1700 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.387741340563498, dyr: 0.1592487979679127, hr: 0.8643459650069133, wr: 0.5575219230106606 } },
      { viewport: { w: 2181, h: 1706 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.3887907121591292, dyr: 0.17111787123070946, hr: 0.8583521773655526, wr: 0.556149015939364 } },
      { viewport: { w: 2181, h: 1501 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.39156452271244274, dyr: 0.15733166568214785, hr: 0.8608175009383087, wr: 0.5547621106627073 } },
      { viewport: { w: 2181, h: 1255 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.3874038068824724, dyr: 0.14249268291766415, hr: 0.8607025670775514, wr: 0.5589228264926775 } },
      { viewport: { w: 2181, h: 744 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.48454956604374444, dyr: 0.13082095540971045, hr: 0.8449764815589197, wr: 0.5547803290283373 } },
      { viewport: { w: 1204, h: 1700 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.39734580799951774, dyr: 0.2491545363106851, hr: 0.8321718099336418, wr: 0.5529601287519709 } },
      { viewport: { w: 717, h: 496 }, dpr: 1.125, boundsLockBaseMode: "visible", boundsAdjust: { dxr: 0.39914469904026467, dyr: 0.14408765488251005, hr: 0.7989618089466817, wr: 0.5598447370649772 } }
    ],
    // 叠加层定位校准：用“相对比例”存（更抗缩放/分辨率变化）
    // x = base.x + base.width * dxr
    // y = base.y + base.height * dyr
    // w = base.width * wr
    // h = base.height * hr
    // 默认值：按你当前的校准参数预置（你要求的“作为默认参数”）。
    // 注意：其中 boundsLockedRect 是“绝对像素”，只对你当前显示器/缩放更匹配；换屏幕可能需要重新校准。
    boundsAdjust: { dxr: 0.39013615701373233, dyr: 0.14275765580387736, hr: 0.8699818354840365, wr: 0.5532308115116059 },
    // 校准后锁定：避免后续自动裁剪/推断导致“我刚对齐又变了”
    boundsLock: true,
    // 记录校准时使用的 base bounds 模式（决定后续是否继续做 buffer->visible 裁剪）
    // 可能值：null | "visible" | "croppedFromTotal"
    boundsLockBaseMode: "visible",
    // 校准后锁定的“绝对像素框”（优先使用它来画叠加层，避免 base bounds 在不同帧变来变去导致变大/漂移）
    // 结构：{ x, y, width, height } 或 null
    boundsLockedRect: { height: 1230, width: 615, x: 1399, y: 239 },
    // 锁定像素框对应的视口尺寸（用于窗口大小变化时自动重算并更新 lockedRect）
    // 结构：{ w, h } 或 null
    boundsLockedViewport: null
  };

  function withDefaults(raw) {
    return { ...DEFAULT_SETTINGS, ...(raw || {}) };
  }

  function storageGet(keysOrDefaults) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keysOrDefaults, (items) => resolve(items));
    });
  }

  function storageSet(items) {
    return new Promise((resolve) => {
      chrome.storage.local.set(items, () => resolve());
    });
  }

  async function getSettings() {
    const items = await storageGet(DEFAULT_SETTINGS);
    return withDefaults(items);
  }

  async function setSettings(patch) {
    const current = await getSettings();
    const next = withDefaults({ ...current, ...(patch || {}) });
    await storageSet(next);
    return next;
  }

  window.tbpSettings = {
    DEFAULT_SETTINGS,
    getSettings,
    setSettings,
    withDefaults
  };
})();
