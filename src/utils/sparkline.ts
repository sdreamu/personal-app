/**
 * 折线图几何计算（P3 · 心情 / 精力曲线）：
 * 纯函数，不碰 DOM、不引第三方库 —— 产出 SVG 的 polyline 点串与刻度，组件只负责画。
 */

export interface TrendPoint {
  /** 逻辑日期 'YYYY-MM-DD'。 */
  date: string;
  /** 1~5 的分值。 */
  value: number;
}

export interface SparklineGeometry {
  /** 每条线的 polyline points 串（'x,y x,y'）。 */
  points: string;
  /** 断点（缺失日期）分段后的多段串；没有断点时只有 1 段。 */
  segments: string[];
  min: number;
  max: number;
  /** 画布尺寸（viewBox 用）。 */
  width: number;
  height: number;
}

export interface SparklineOptions {
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  /** 上下左右留白（像素）。 */
  padding?: number;
  /** 每段最多多少天（超出只取最近的）。 */
  limit?: number;
}

export const SPARKLINE_DEFAULT_WIDTH = 320;
export const SPARKLINE_DEFAULT_HEIGHT = 96;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 把一组 (日期, 分值) 换算成 SVG 坐标。
 * 日期不连续时空出来（用 null 占位的做法见 buildTrendSeries），这里只算有值的点。
 */
export function buildSparkline(values: readonly (number | null)[], options: SparklineOptions = {}): SparklineGeometry {
  const width = options.width ?? SPARKLINE_DEFAULT_WIDTH;
  const height = options.height ?? SPARKLINE_DEFAULT_HEIGHT;
  const min = options.min ?? 1;
  const max = options.max ?? 5;
  const padding = options.padding ?? 6;
  const limit = options.limit ?? 30;

  const slice = values.slice(-limit);
  const span = Math.max(1, slice.length - 1);
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);
  const range = Math.max(1, max - min);

  const segments: string[] = [];
  let current: string[] = [];
  const all: string[] = [];

  slice.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (current.length > 0) segments.push(current.join(' '));
      current = [];
      return;
    }
    const clamped = Math.min(max, Math.max(min, value));
    const x = round(padding + (index / span) * innerWidth);
    const y = round(padding + ((max - clamped) / range) * innerHeight);
    const token = x + ',' + y;
    current.push(token);
    all.push(token);
  });
  if (current.length > 0) segments.push(current.join(' '));

  return {
    points: all.join(' '),
    segments,
    min,
    max,
    width,
    height,
  };
}

/** 最近 days 天（含今天）的日期序列，升序。 */
export function recentDates(today: string, days: number): string[] {
  const [year, month, day] = today.split('-').map(Number);
  const base = new Date(year, (month ?? 1) - 1, day ?? 1);
  const out: string[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const cursor = new Date(base.getTime());
    cursor.setDate(cursor.getDate() - index);
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    out.push(y + '-' + m + '-' + d);
  }
  return out;
}

/**
 * 按日期序列把记录（可能缺天、可能为 null）对齐成一条线：
 * 缺失的日期填 null，供 buildSparkline 断开折线（不会在空档处连一条假线）。
 */
export function alignSeries(
  dates: readonly string[],
  rows: readonly { date: string; value: number | null }[],
): { date: string; value: number | null }[] {
  const byDate = new Map<string, number | null>();
  for (const row of rows) byDate.set(row.date, row.value);
  return dates.map((date) => ({ date, value: byDate.has(date) ? (byDate.get(date) as number | null) : null }));
}

/** 有效点个数与均值（给图例上的「已记录 n 天 · 平均 x.x」用）。 */
export function summarize(values: readonly (number | null)[]): { count: number; average: number | null } {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length === 0) return { count: 0, average: null };
  const total = valid.reduce((sum, value) => sum + value, 0);
  return { count: valid.length, average: Math.round((total / valid.length) * 10) / 10 };
}
