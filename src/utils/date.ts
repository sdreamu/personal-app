/**
 * 纯函数日期工具（无副作用、不依赖数据库）。
 * 约定：
 * - 一天起点 dayStartMin：'HH:mm' 换算成的分钟数，默认 04:00 = 240。
 * - 逻辑日期：凌晨在一天起点之前的时刻归前一天。
 * - 时间轴偏移：距离当天起点的分钟数 0~1440；恰为起点的时刻映射为 0，
 *   次日起点（如 04:00 → 1440）由调用方显式传 1440 表示。
 * - 周起点：周一。
 */

export const MINUTES_PER_DAY = 1440;
export const DEFAULT_DAY_START = '04:00';
export const DEFAULT_DAY_START_MIN = 240;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const BACKUP_REMINDER_DAYS = 7;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'HH:mm' → 一天起点分钟数（只允许整点或半点）。 */
export function parseDayStart(hhmm: string): number {
  if (!TIME_RE.test(hhmm)) {
    throw new Error(`非法的一天起点：${hhmm}（需要 HH:mm）`);
  }
  const [h, m] = hhmm.split(':');
  const hour = Number(h);
  const minute = Number(m);
  if (minute !== 0 && minute !== 30) {
    throw new Error(`一天起点只支持整点或半点：${hhmm}`);
  }
  return hour * 60 + minute;
}

export function dayStartToHHmm(dayStartMin: number): string {
  if (!Number.isInteger(dayStartMin) || dayStartMin < 0 || dayStartMin >= MINUTES_PER_DAY) {
    throw new Error(`非法的一天起点分钟数：${dayStartMin}`);
  }
  return `${pad2(Math.floor(dayStartMin / 60))}:${pad2(dayStartMin % 60)}`;
}

/** 'HH:mm' → 当日分钟数（0~1439）。 */
export function parseTime(hhmm: string): number {
  if (!TIME_RE.test(hhmm)) {
    throw new Error(`非法时间：${hhmm}`);
  }
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export function minutesOfDay(tsMs: number): number {
  const d = new Date(tsMs);
  return d.getHours() * 60 + d.getMinutes();
}

/** 本地时区精确时间戳 → 'YYYY-MM-DD'。 */
export function dateKeyOf(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 逻辑日期：时刻早于一天起点时归前一天。
 * 例：起点 04:00，凌晨 02:00 的记录归前一天；04:00 整归当天。
 */
export function logicalDateOf(tsMs: number, dayStartMin: number = DEFAULT_DAY_START_MIN): string {
  return dateKeyOf(tsMs - dayStartMin * 60 * 1000);
}

/** 当前逻辑日期（可注入 nowMs 以便测试）。 */
export function logicalToday(dayStartMin: number = DEFAULT_DAY_START_MIN, nowMs: number = Date.now()): string {
  return logicalDateOf(nowMs, dayStartMin);
}

/**
 * 'HH:mm' → 距一天起点的偏移分钟（0~1439）。
 * 例：起点 04:00：23:00 → 1140；次日 01:00 → 1260；04:00 → 0。
 */
export function timeToOffset(hhmm: string, dayStartMin: number = DEFAULT_DAY_START_MIN): number {
  const m = parseTime(hhmm);
  return (m - dayStartMin + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** 偏移分钟（0~1440）→ 'HH:mm'（1440 表示次日的起点时刻）。 */
export function offsetToTime(offsetMin: number, dayStartMin: number = DEFAULT_DAY_START_MIN): string {
  if (!Number.isInteger(offsetMin) || offsetMin < 0 || offsetMin > MINUTES_PER_DAY) {
    throw new Error(`非法的时间轴偏移分钟数：${offsetMin}（需要 0~1440）`);
  }
  const m = (dayStartMin + offsetMin) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** 解析 'YYYY-MM-DD'，非法（含 2 月 30 日）返回 null。 */
export function parseDateKey(dateKey: string): Date | null {
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  const valid = d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  return valid ? d : null;
}

export function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 日期加减（跨月/跨年均正确处理）。 */
export function addDays(dateKey: string, delta: number): string {
  const d = parseDateKey(dateKey);
  if (!d) throw new Error(`非法日期：${dateKey}`);
  d.setDate(d.getDate() + delta);
  return formatDateKey(d);
}

/** 该日期所在周的周一（一周之首）。 */
export function weekStart(dateKey: string): string {
  const d = parseDateKey(dateKey);
  if (!d) throw new Error(`非法日期：${dateKey}`);
  const day = d.getDay(); // 0=周日
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return formatDateKey(d);
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

/** ISO 周数（周一为一周第一天，跨年按 ISO 规则归属）。顶栏用「W43 · 周六」标记当周。 */
export function isoWeekNumber(dateKey: string): number {
  const parsed = parseDateKey(dateKey);
  const date = parsed === null ? new Date() : parsed;
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function weekdayCN(dateKey: string): string {
  const d = parseDateKey(dateKey);
  if (!d) throw new Error(`非法日期：${dateKey}`);
  return WEEKDAY_NAMES[d.getDay()] ?? '周?';
}

/** 'X月X日'（用于“你正在查看 X月X日”提示）。 */
export function formatDateCN(dateKey: string): string {
  const d = parseDateKey(dateKey);
  if (!d) throw new Error(`非法日期：${dateKey}`);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 'X月X日 周X'（顶栏日期切换显示）。 */
export function formatDateCNWeekday(dateKey: string): string {
  return `${formatDateCN(dateKey)} ${weekdayCN(dateKey)}`;
}

/** 秒数 → 'HH:MM:SS'（小时可超过 24，如 '25:01:01'）。 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

/** 毫秒时间戳 → 'YYYY年M月D日 HH:mm'（设置页上次备份时间）。 */
export function formatDateTimeCN(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 毫秒时间戳 → 'YYYYMMDD-HHmm'（备份文件名时间戳）。 */
export function backupTimestamp(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

/**
 * 备份提醒：
 * - 距 last_backup_at 超过 7 天 → 提醒；
 * - 从未备份（lastBackupAt=null）且已有数据满 7 天（最早记录 ≥ 7 天前）→ 提醒。
 */
export function isBackupReminderDue(
  lastBackupAt: number | null,
  earliestDataAt: number | null,
  nowMs: number = Date.now(),
): boolean {
  if (lastBackupAt !== null) return nowMs - lastBackupAt > BACKUP_REMINDER_DAYS * DAY_MS;
  if (earliestDataAt !== null) return nowMs - earliestDataAt >= BACKUP_REMINDER_DAYS * DAY_MS;
  return false;
}
