/**
 * active_timer 单行读写（全局计时状态持久化）。
 * 本阶段只提供 加载/清除；开始/暂停/结束/结算状态机由第 2 阶段实现。
 */
import { getDb } from './database';
import type { ActiveTimer } from './schema';
import { nowMs } from './util';

export async function getActiveTimer(): Promise<ActiveTimer | null> {
  const db = await getDb();
  return (await db.active_timer.get('global')) ?? null;
}

/** 覆盖写入全局计时单行（第 2 阶段状态机使用）。 */
export async function setActiveTimer(timer: ActiveTimer): Promise<void> {
  const db = await getDb();
  await db.active_timer.put({ ...timer, key: 'global', updated_at: nowMs() });
}

export async function clearActiveTimer(): Promise<void> {
  const db = await getDb();
  await db.active_timer.delete('global');
}
