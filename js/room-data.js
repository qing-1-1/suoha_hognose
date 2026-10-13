/* Durable room persistence. Requests retain their UUID through transient retries. */
(function () {
  'use strict';
  const pending = new Map();
  async function rpc(name, args) {
    if (typeof sb === 'undefined' || !sb || typeof sb.rpc !== 'function') throw new Error('数据库尚未连接，请登录后重试。');
    const { data, error } = await sb.rpc(name, args || {});
    if (error) {
      const message = error.message || '爬房保存失败';
      const err = new Error(/revision conflict/i.test(message) ? '其他会话已修改爬房，请刷新后再保存。' : /schema cache|does not exist|could not find the function/i.test(message) ? '爬房数据库迁移尚未部署，请依次执行 039 和 040 爬房迁移。' : message);
      err.code = error.code; err.cause = error; throw err;
    }
    if (!data || !Number.isInteger(data.revision)) throw new Error('爬房数据库返回无效，请刷新重试。');
    return data;
  }
  async function write(name, args) {
    const key = JSON.stringify([name, args]);
    const request = pending.get(key) || crypto.randomUUID();
    pending.set(key, request);
    try { const data = await rpc(name, { ...args, p_request: request }); pending.delete(key); return data; }
    catch (error) {
      // Only ambiguous transport failures retain their idempotency key; definitive database rejection may be corrected.
      if (error.code && !/^08|^PGRST00/.test(error.code)) pending.delete(key);
      throw error;
    }
  }
  window.SuohaRoomData = Object.freeze({
    load: () => rpc('room_snapshot'),
    save: (config, revision) => write('room_save_layout', { p_revision: revision, p_config: config }),
    assign: (snakeId, slotId, revision, swap = false, scheduleMode = 'inherit') => write('room_assign', { p_revision: revision, p_snake: snakeId, p_target_slot: slotId ?? null, p_swap: !!swap, p_schedule_mode: scheduleMode }),
    record: (payload, revision) => write('room_record_feeding', { p_revision: revision, p_payload: payload }),
    syncPlans: (tasks, from, to, revision) => write('room_sync_plans', { p_revision: revision, p_tasks: tasks, p_from: from, p_to: to }),
    saveRuleVersion: (name, rules, revision, activate = true) => write('room_save_rule_version', { p_revision: revision, p_name: name, p_rules: rules, p_activate: !!activate }),
    activateRuleVersion: (id, revision) => write('room_activate_rule_version', { p_revision: revision, p_version: id }),
    confirmBatch: (name, items, revision) => write('room_confirm_batch', { p_revision: revision, p_name: name, p_items: items }),
    moveBox: (sourceSlot, targetSlot, revision, swap = false, scheduleMode = 'inherit') => write('room_move_box', { p_revision: revision, p_source_slot: sourceSlot, p_target_slot: targetSlot, p_swap: !!swap, p_schedule_mode: scheduleMode })
  });
})();
