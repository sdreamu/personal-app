import { describe, expect, it } from 'vitest';
import { alignSeries, buildSparkline, recentDates, summarize, SPARKLINE_DEFAULT_HEIGHT } from './sparkline';

describe('折线图几何（P3）', () => {
  it('数值映射到画布：最大值贴顶、最小值贴底、留白一致', () => {
    const geo = buildSparkline([1, 3, 5], { width: 100, height: 50, min: 1, max: 5, padding: 5 });
    expect(geo.width).toBe(100);
    expect(geo.height).toBe(50);
    // 3 个点：x = 5 / 50 / 95，y：值 1 → 底(45)、值 3 → 中(25)、值 5 → 顶(5)
    expect(geo.points).toBe('5,45 50,25 95,5');
    expect(geo.segments).toEqual(['5,45 50,25 95,5']);
  });

  it('缺值断开折线，不会在空档处连假线', () => {
    const geo = buildSparkline([2, null, 4], { width: 100, height: 50, padding: 5 });
    expect(geo.segments).toHaveLength(2);
    expect(geo.points).toBe(geo.segments.join(' ').split(' ').filter((t) => t !== '').join(' '));
  });

  it('越界值夹到区间内；只看最近 limit 个点', () => {
    const geo = buildSparkline([9, -3, 3, 3, 3], { width: 40, height: 40, min: 1, max: 5, padding: 0, limit: 3 });
    // 只取最后 3 个（都是 3 → 中线 y=20）
    expect(geo.points).toBe('0,20 20,20 40,20');
    const clamped = buildSparkline([9], { width: 10, height: 10, min: 1, max: 5, padding: 0 });
    expect(clamped.points).toBe('0,0');
  });

  it('空数据不炸：没有点、也没有段', () => {
    const geo = buildSparkline([]);
    expect(geo.points).toBe('');
    expect(geo.segments).toEqual([]);
    expect(geo.height).toBe(SPARKLINE_DEFAULT_HEIGHT);
  });

  it('recentDates：含今天的连续 N 天，跨月/跨年都对', () => {
    expect(recentDates('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
    expect(recentDates('2027-01-01', 2)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('alignSeries：按日期对齐，缺的补 null，多余的行不出现', () => {
    const dates = ['2026-06-01', '2026-06-02', '2026-06-03'];
    const aligned = alignSeries(dates, [
      { date: '2026-06-01', value: 4 },
      { date: '2026-06-03', value: 2 },
      { date: '2026-05-30', value: 5 },
    ]);
    expect(aligned).toEqual([
      { date: '2026-06-01', value: 4 },
      { date: '2026-06-02', value: null },
      { date: '2026-06-03', value: 2 },
    ]);
  });

  it('summarize：只算有值的点，一位小数', () => {
    expect(summarize([4, null, 3])).toEqual({ count: 2, average: 3.5 });
    expect(summarize([null, null])).toEqual({ count: 0, average: null });
  });
});
