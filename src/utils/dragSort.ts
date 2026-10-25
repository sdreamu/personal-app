/**
 * 书架拖动排序纯函数：只做「落点 → 新的有序 id 列表」的计算，不碰数据库/UI。
 * 供 library store 与 StudyBooksView 复用，便于单测覆盖边界（越界下标、同栏 / 跨栏）。
 */

/** 拖动计算需要的最小书卡字段（status + 排序键 + 创建时间兜底）。 */
export interface DragSortBook {
  id: string;
  status: string;
  sort_index?: number;
  created_at?: number;
}

/** 排序键：sort_index 升序（缺失排末尾），相等时按 created_at 升序，再按 id 稳定。 */
export function compareBySortIndex(a: DragSortBook, b: DragSortBook): number {
  const ai = typeof a.sort_index === 'number' ? a.sort_index : Number.POSITIVE_INFINITY;
  const bi = typeof b.sort_index === 'number' ? b.sort_index : Number.POSITIVE_INFINITY;
  if (ai !== bi) return ai - bi;
  const ac = a.created_at ?? 0;
  const bc = b.created_at ?? 0;
  if (ac !== bc) return ac - bc;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 某状态列内按排序键升序排列（不改原数组）。 */
export function sortColumn<T extends DragSortBook>(books: readonly T[]): T[] {
  return [...books].sort(compareBySortIndex);
}

/** 把下标夹到 [0, length] 合法区间（小数向下取整，非有限值视为末尾）。 */
export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  const floored = Math.trunc(index);
  if (floored < 0) return 0;
  if (floored > length) return length;
  return floored;
}

/**
 * 拖动落点计算：把 fromId 移到 toStatus 列的 toIndex 处，返回该「目标列」拖动后的有序 id 列表。
 * toIndex 是「目标列移除被拖动书之后」的下标，越界自动收敛到末尾。
 */
export function orderedIdsAfterMove(
  books: readonly DragSortBook[],
  fromId: string,
  toStatus: string,
  toIndex: number,
): string[] {
  const dragged = books.find((book) => book.id === fromId);
  if (dragged === undefined) throw new Error(`未找到被拖动的书：${fromId}`);
  const target = sortColumn(books.filter((book) => book.status === toStatus && book.id !== fromId));
  const index = clampIndex(toIndex, target.length);
  target.splice(index, 0, dragged);
  return target.map((book) => book.id);
}

/** 整列重排后的 sort_index 分配：10、20、30……（step 默认 10，给后续插入留空隙）。 */
export function assignSortIndexes(ids: readonly string[], step = 10): Record<string, number> {
  const result: Record<string, number> = {};
  ids.forEach((id, index) => {
    result[id] = (index + 1) * step;
  });
  return result;
}

/** 新建书时该状态列的 next sort_index = 现有最大值 + step（空列 = step）。 */
export function nextSortIndex(values: readonly (number | undefined)[], step = 10): number {
  const max = values.reduce<number>((acc, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return acc;
    return Math.max(acc, value);
  }, 0);
  return max + step;
}

/**
 * 键盘 / 触屏「上移 / 下移」的目标下标：delta=-1 上移、+1 下移。
 * 返回 null 表示已经在列首 / 列尾，不需要动。返回值与 reorder 的 toIndex 同义
 * （= 该列移除这本书之后的下标）。
 */
export function movedIndex(currentIndex: number, delta: number, length: number): number | null {
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= length) return null;
  const target = currentIndex + Math.trunc(delta);
  if (target < 0 || target >= length) return null;
  return target;
}
