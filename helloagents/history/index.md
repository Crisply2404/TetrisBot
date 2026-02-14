# 变更历史索引

本文件记录所有已完成变更的索引，便于追溯和查询。

---

## 索引

| 时间戳 | 功能名称 | 类型 | 状态 | 方案包路径 |
|--------|----------|------|------|------------|
| 202602090251 | tetrio_overlay_advisor | 功能 | [√]已完成 | ../history/2026-02/202602090251_tetrio_overlay_advisor/ |
| 202602102209 | fix_game_api_capture | 修复 | [?]待确认 | ../history/2026-02/202602102209_fix_game_api_capture/ |
| 202602102303 | fix_overlay_not_visible | 修复 | [?]待确认 | ../history/2026-02/202602102303_fix_overlay_not_visible/ |
| 202602102323 | fix_suggestion_and_details_live | 修复/变更 | [?]待确认 | ../history/2026-02/202602102323_fix_suggestion_and_details_live/ |
| 202602102350 | debug_why_no_suggestion | 调试增强 | [?]待确认 | ../history/2026-02/202602102350_debug_why_no_suggestion/ |
| 202602110208 | fix_overlay_alignment | 修复 | [?]待确认 | ../history/2026-02/202602110208_fix_overlay_alignment/ |
| 202602110238 | fix_alignment_and_details | 修复 | [?]待确认 | ../history/2026-02/202602110238_fix_alignment_and_details/ |
| 202602111634 | integrate_cold_clear_v1 | 功能/增强 | [?]待确认 | ../history/2026-02/202602111634_integrate_cold_clear_v1/ |
| 202602111716 | fix_offscreen_and_calibration | 修复/增强 | [?]待确认 | ../history/2026-02/202602111716_fix_offscreen_and_calibration/ |
| 202602111727 | fix_engine_sim_and_calibration_lock | 修复/增强 | [?]待确认 | ../history/2026-02/202602111727_fix_engine_sim_and_calibration_lock/ |
| 202602111820 | fix_calibration_jump_and_coldclear_timeout | 修复/增强 | [?]待确认 | ../history/2026-02/202602111820_fix_calibration_jump_and_coldclear_timeout/ |
| 202602111906 | fix_wasm_csp_and_export_calibration | 修复/增强 | [?]待确认 | ../history/2026-02/202602111906_fix_wasm_csp_and_export_calibration/ |
| 202602112044 | default_calibration_and_cc_worker_fallback | 增强/兜底 | [?]待确认 | ../history/2026-02/202602112044_default_calibration_and_cc_worker_fallback/ |
| 202602112047 | improve_bag_lookahead | 增强 | [?]待确认 | ../history/2026-02/202602112047_improve_bag_lookahead/ |
| 202602112309 | fix_cc_fallback_unreachable | 修复/增强 | [?]待确认 | ../history/2026-02/202602112309_fix_cc_fallback_unreachable/ |
| 202602112330 | fix_bounds_resize_and_live_sync | 修复/变更 | [√]已完成 | ../history/2026-02/202602112330_fix_bounds_resize_and_live_sync/ |
| 202602112340 | debounce_cc_reset_on_zen_rewind | 修复/增强 | [?]待确认 | ../history/2026-02/202602112340_debounce_cc_reset_on_zen_rewind/ |
| 202602112352 | fix_cc_desync_unexpected_piece | 修复 | [?]待确认 | ../history/2026-02/202602112352_fix_cc_desync_unexpected_piece/ |
| 202602112415 | fix_same_piece_refresh_and_details_authority | 修复/变更 | [√]已完成 | ../history/2026-02/202602112415_fix_same_piece_refresh_and_details_authority/ |
| 202602120420 | fix_cc_consistency_hold_lock_and_scale_sampling | 修复/增强 | [√]已完成 | ../history/2026-02/202602120420_fix_cc_consistency_hold_lock_and_scale_sampling/ |
| 202602120455 | fix_canhold_false_positive | 修复 | [√]已完成 | ../history/2026-02/202602120455_fix_canhold_false_positive/ |
| 202602120111 | improve_vs_spin_pick_and_resize_and_fullbag | 增强/变更 | [?]待确认 | ../history/2026-02/202602120111_improve_vs_spin_pick_and_resize_and_fullbag/ |
| 202602120129 | fix_overlay_details_desync_and_restore_fullbag_toggle | 修复/变更 | [?]待确认 | ../history/2026-02/202602120129_fix_overlay_details_desync_and_restore_fullbag_toggle/ |
| 202602121600 | fix_cc_illegal_placement | 修复 | [√]已完成 | ../history/2026-02/202602121600_fix_cc_illegal_placement/ |
| 202602121730 | adaptive_calibration_and_zen_refresh | 修复/增强 | [√]已完成 | ../history/2026-02/202602121730_adaptive_calibration_and_zen_refresh/ |
| 202602122130 | vs_optimal_and_sampling_editor | 增强/变更 | [?]待确认 | ../history/2026-02/202602122130_vs_optimal_and_sampling_editor/ |

---

## 按月归档

### 2026-02

- `202602090251_tetrio_overlay_advisor`（Chrome 扩展 MVP：叠加层 + 快照详情页）
- `202602102209_fix_game_api_capture`（修复：新版 tetr.io 取状态时“未找到游戏 API”）
- `202602102303_fix_overlay_not_visible`（修复：已连接但叠加层不显示，改进棋盘定位与弹窗状态提示）
- `202602102323_fix_suggestion_and_details_live`（修复：建议算不出来/画不到；变更：详情页改实时显示）
- `202602102350_debug_why_no_suggestion`（调试增强：弹窗直接显示“建议❌的原因”，方便继续定位）
- `202602110208_fix_overlay_alignment`（修复：绿色提示格子大小/位置对不上）
- `202602110238_fix_alignment_and_details`（修复：bounds 自动裁剪到可见棋盘；详情页离开对局时不再卡住）
- `202602111634_integrate_cold_clear_v1`（增强：叠加提示接入 Cold Clear v1（WASM）作为计算引擎）
- `202602111716_fix_offscreen_and_calibration`（修复：Cold Clear 实际没启用导致回退 sim；增强：增加手动拖拽校准棋盘框）
- `202602111727_fix_engine_sim_and_calibration_lock`（修复：引擎回退 sim 的原因可见；增强：校准后锁定与“自动对齐”吸附按钮）
- `202602111820_fix_calibration_jump_and_coldclear_timeout`（修复：校准后下一步变大；修复：cold-clear 超时，改为可增量推进）
- `202602111906_fix_wasm_csp_and_export_calibration`（修复：WASM 被 CSP 拦截导致 cold-clear 启动失败；增强：一键复制当前校准参数）
- `202602112044_default_calibration_and_cc_worker_fallback`（增强：把你的校准值写进默认设置；兜底：补 root worker.js 避免 cold-clear 启动失败）
- `202602112047_improve_bag_lookahead`（增强：开启读取完整块序时，提升 cold-clear 前视长度用于 7-bag 预判）
- `202602112309_fix_cc_fallback_unreachable`（修复：cold-clear 打一段时间后回退 sim（超时/unreachable），并补充更好用的排错信息）
- `202602112330_fix_bounds_resize_and_live_sync`（修复：窗口缩放后自动重算对齐；修复：Zen undo 旧回包污染；变更：实时不再回退 sim）
- `202602112340_debounce_cc_reset_on_zen_rewind`（增强：Zen 频繁撤回/重开时，防抖+限流重置 cold-clear，撤回期间暂停出建议）
- `202602112352_fix_cc_desync_unexpected_piece`（修复：cold-clear 偶发建议“不存在的块”，检测到不同步时强制重启重算，并补充更清楚的提示信息）
- `202602112415_fix_same_piece_refresh_and_details_authority`（修复：同块连发偶发不刷新；变更：详情页明确“实时为准/预览后续”并可一键回到实时）
- `202602120420_fix_cc_consistency_hold_lock_and_scale_sampling`（修复：undo/重算建议保持一致；修复：Hold 不能连续用；新增：缩放采样工具方便建模）
- `202602120455_fix_canhold_false_positive`（修复：开局/倒计时阶段误判可Hold=否，导致 cc 返回 hold 块被误报“不同步”）
- `202602120111_improve_vs_spin_pick_and_resize_and_fullbag`（增强/变更：对战优先挑可旋转落点；窗口缩放后自动重算对齐；默认总是读取更长块序并移除开关）
- `202602120129_fix_overlay_details_desync_and_restore_fullbag_toggle`（修复/变更：悬浮提示与详情页默认落点一致；丢弃过期建议避免不同步；恢复读取更长块序开关；undo reset 暂时不防抖）
- `202602121600_fix_cc_illegal_placement`（修复：TBP 坐标换算按 spec 修正 I/O 中心点；新增落点合法性校验，避免画出“压到已有块/越界”的不可能提示）
- `202602121730_adaptive_calibration_and_zen_refresh`（增强：缩放/窗口变化时按采样点自适应重算校准；修复：Zen 开局/切局面不再短暂显示上一局建议）
- `202602122130_vs_optimal_and_sampling_editor`（增强/变更：对战更像“选最优解”；采样点管理页；自动对齐优先；快捷键开关；详情页/叠加层显示上边界之外）
