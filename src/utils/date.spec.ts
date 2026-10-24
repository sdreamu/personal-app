import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  DEFAULT_DAY_START_MIN,
  addDays,
  backupTimestamp,
  dayStartToHHmm,
  formatDateCN,
  formatDateTimeCN,
  formatDuration,
  isBackupReminderDue,
  logicalDateOf,
  logicalToday,
  offsetToTime,
  parseDateKey,
  parseDayStart,
  parseTime,
  timeToOffset,
  weekdayCN,
  weekStart,
} from './date';

function localTs(year: number, month: number, day: number, hour: number, minute: number, second = 0): number {
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

describe('一天起点解析', () => {
  it('HH:mm 与分钟互转（只允许整点/半点）', () => {
    expect(parseDayStart('04:00')).toBe(240);
    expect(parseDayStart('00:00')).toBe(0);
    expect(parseDayStart('00:30')).toBe(30);
    expect(parseDayStart('23:30')).toBe(1410);
    expect(() => parseDayStart('4:00')).toThrow();
    expect(() => parseDayStart('24:00')).toThrow();
    expect(() => parseDayStart('04:15')).toThrow();
    expect(dayStartToHHmm(240)).toBe('04:00');
    expect(dayStartToHHmm(30)).toBe('00:30');
    expect(dayStartToHHmm(1410)).toBe('23:30');
    expect(() => dayStartToHHmm(1440)).toThrow();
  });
});

describe('逻辑日期（默认起点 04:00）', () => {
  it('04:00 边界：04:00 整归当天，03:59:59 归前一天', () => {
    const start = DEFAULT_DAY_START_MIN;
    expect(logicalDateOf(localTs(2026, 6, 2, 4, 0), start)).toBe('2026-06-02');
    expect(logicalDateOf(localTs(2026, 6, 2, 3, 59, 59), start)).toBe('2026-06-01');
    expect(logicalDateOf(localTs(2026, 6, 2, 2, 0), start)).toBe('2026-06-01');
    expect(logicalDateOf(localTs(2026, 6, 2, 23, 59), start)).toBe('2026-06-02');
  });

  it('跨午夜：凌晨 00:00~03:59 均归前一天', () => {
    const start = DEFAULT_DAY_START_MIN;
    expect(logicalDateOf(localTs(2026, 6, 3, 0, 0), start)).toBe('2026-06-02');
    expect(logicalDateOf(localTs(2026, 6, 3, 1, 0), start)).toBe('2026-06-02');
    expect(logicalDateOf(localTs(2026, 6, 3, 3, 59), start)).toBe('2026-06-02');
  });

  it('logicalToday：凌晨 2 点属于昨天（注入 now）', () => {
    expect(logicalToday(240, localTs(2026, 6, 2, 2, 0))).toBe('2026-06-01');
    expect(logicalToday(240, localTs(2026, 6, 2, 4, 0))).toBe('2026-06-02');
  });

  it('自定义起点（如 06:00）同样生效', () => {
    expect(logicalDateOf(localTs(2026, 6, 2, 5, 59), 360)).toBe('2026-06-01');
    expect(logicalDateOf(localTs(2026, 6, 2, 6, 0), 360)).toBe('2026-06-02');
  });
});

describe('HH:mm 与距起点偏移分钟（0~1440）', () => {
  it('23:00 / 次日 01:00 的偏移', () => {
    const start = 240;
    expect(timeToOffset('04:00', start)).toBe(0);
    expect(timeToOffset('23:00', start)).toBe(1140);
    expect(timeToOffset('01:00', start)).toBe(1260); // 次日凌晨 01:00
    expect(timeToOffset('00:00', start)).toBe(1200);
    expect(timeToOffset('03:59', start)).toBe(1439);
  });

  it('偏移回换算与 1440 边界', () => {
    const start = 240;
    expect(offsetToTime(0, start)).toBe('04:00');
    expect(offsetToTime(1140, start)).toBe('23:00');
    expect(offsetToTime(1260, start)).toBe('01:00');
    expect(offsetToTime(1439, start)).toBe('03:59');
    expect(offsetToTime(1440, start)).toBe('04:00'); // 次日起点
    expect(() => offsetToTime(-1, start)).toThrow();
    expect(() => offsetToTime(1441, start)).toThrow();
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('23:59')).toBe(1439);
  });

  it('跨午夜时间块：23:00 → 次日 01:00 时长为 120 分钟', () => {
    expect(timeToOffset('01:00', 240) - timeToOffset('23:00', 240)).toBe(120);
  });
});

describe('周起点与日期运算', () => {
  it('一周之首是周一（含周日归本周一）', () => {
    expect(weekStart('2026-06-03')).toBe('2026-06-01'); // 周三
    expect(weekStart('2026-06-07')).toBe('2026-06-01'); // 周日
    expect(weekStart('2026-06-01')).toBe('2026-06-01'); // 周一本身
    expect(weekStart('2026-06-08')).toBe('2026-06-08');
    expect(weekdayCN('2026-06-01')).toBe('周一');
    expect(weekdayCN('2026-06-07')).toBe('周日');
  });

  it('日期加减跨月/跨年', () => {
    expect(addDays('2026-06-01', 1)).toBe('2026-06-02');
    expect(addDays('2026-06-01', -1)).toBe('2026-05-31');
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('日期格式化与非法日期', () => {
    expect(formatDateCN('2026-10-20')).toBe('10月20日');
    expect(formatDateTimeCN(localTs(2026, 6, 1, 14, 5))).toBe('2026年6月1日 14:05');
    expect(parseDateKey('2026-02-30')).toBeNull();
    expect(parseDateKey('2026-13-01')).toBeNull();
    expect(parseDateKey('abc')).toBeNull();
    expect(() => addDays('2026-02-30', 1)).toThrow();
  });
});

describe('时长格式化 HH:MM:SS', () => {
  it('补零、超 24 小时与负数保护', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(59)).toBe('00:00:59');
    expect(formatDuration(3600)).toBe('01:00:00');
    expect(formatDuration(3661)).toBe('01:01:01');
    expect(formatDuration(86399)).toBe('23:59:59');
    expect(formatDuration(90061)).toBe('25:01:01');
    expect(formatDuration(-5)).toBe('00:00:00');
  });
});

describe('备份提醒', () => {
  it('距上次备份超 7 天提醒；恰好 7 天不提醒', () => {
    const now = localTs(2026, 6, 10, 12, 0);
    expect(isBackupReminderDue(now - 7 * DAY_MS - 1, null, now)).toBe(true);
    expect(isBackupReminderDue(now - 7 * DAY_MS, null, now)).toBe(false);
    expect(isBackupReminderDue(now - 1, null, now)).toBe(false);
  });

  it('从未备份：已有数据满 7 天才提醒', () => {
    const now = localTs(2026, 6, 10, 12, 0);
    expect(isBackupReminderDue(null, now - 7 * DAY_MS, now)).toBe(true);
    expect(isBackupReminderDue(null, now - 7 * DAY_MS + 1, now)).toBe(false);
    expect(isBackupReminderDue(null, null, now)).toBe(false);
  });

  it('备份文件名时间戳', () => {
    expect(backupTimestamp(localTs(2026, 6, 1, 14, 30))).toBe('20260601-1430');
  });
});
