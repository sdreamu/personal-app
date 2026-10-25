import { describe, expect, it } from 'vitest';
import {
  assignSortIndexes,
  clampIndex,
  compareBySortIndex,
  movedIndex,
  nextSortIndex,
  orderedIdsAfterMove,
  sortColumn,
  type DragSortBook,
} from './dragSort';

function book(id: string, status: string, sort_index?: number, created_at = 0): DragSortBook {
  return { id, status, sort_index, created_at };
}

describe('dragSort.compareBySortIndex', () => {
  it('按 sort_index 升序；缺失排末尾；相等按 created_at/id 稳定', () => {
    const list: DragSortBook[] = [
      book('c', 'want', 30, 1),
      book('a', 'want', 10, 5),
      book('b', 'want', undefined, 2),
      book('d', 'want', 20, 9),
    ];
    expect(sortColumn(list).map((row) => row.id)).toEqual(['a', 'd', 'c', 'b']);
    expect(sortColumn(list)).not.toBe(list); // 不改原数组
    expect(compareBySortIndex(book('x', 'want', 10, 1), book('y', 'want', 10, 2))).toBeLessThan(0);
    expect(compareBySortIndex(book('y', 'want', 10, 2), book('x', 'want', 10, 1))).toBeGreaterThan(0);
    expect(compareBySortIndex(book('x', 'want', 10, 1), book('x', 'want', 10, 1))).toBe(0);
  });
});

describe('dragSort.clampIndex', () => {
  it('夹到 [0,length]，非有限值为 length', () => {
    expect(clampIndex(-3, 4)).toBe(0);
    expect(clampIndex(0, 4)).toBe(0);
    expect(clampIndex(2.9, 4)).toBe(2);
    expect(clampIndex(9, 4)).toBe(4);
    expect(clampIndex(Number.NaN, 4)).toBe(4);
    expect(clampIndex(Number.POSITIVE_INFINITY, 4)).toBe(4);
  });
});

describe('dragSort.orderedIdsAfterMove', () => {
  it('同栏下移：把 a 从 0 移到末尾', () => {
    const books = [book('a', 'want', 10), book('b', 'want', 20), book('c', 'want', 30)];
    expect(orderedIdsAfterMove(books, 'a', 'want', 2)).toEqual(['b', 'c', 'a']);
  });

  it('同栏上移：把 c 移到最前', () => {
    const books = [book('a', 'want', 10), book('b', 'want', 20), book('c', 'want', 30)];
    expect(orderedIdsAfterMove(books, 'c', 'want', 0)).toEqual(['c', 'a', 'b']);
  });

  it('跨栏：把书拖到另一栏中间，目标列返回其新的有序 id 列表', () => {
    const books = [
      book('a', 'want', 10),
      book('x', 'reading', 10),
      book('y', 'reading', 20),
      book('z', 'reading', 30),
    ];
    expect(orderedIdsAfterMove(books, 'a', 'reading', 1)).toEqual(['x', 'a', 'y', 'z']);
    expect(orderedIdsAfterMove(books, 'a', 'reading', 0)).toEqual(['a', 'x', 'y', 'z']);
    expect(orderedIdsAfterMove(books, 'a', 'reading', 99)).toEqual(['x', 'y', 'z', 'a']);
  });

  it('跨栏拖到空栏：目标列只有被拖动书', () => {
    const books = [book('a', 'want', 10), book('b', 'want', 20)];
    expect(orderedIdsAfterMove(books, 'a', 'done', 0)).toEqual(['a']);
    expect(orderedIdsAfterMove(books, 'a', 'done', 5)).toEqual(['a']);
  });

  it('幂等：相同落点重复计算得到相同结果', () => {
    const books = [book('a', 'want', 10), book('b', 'want', 20), book('c', 'want', 30)];
    const first = orderedIdsAfterMove(books, 'b', 'want', 0);
    const second = orderedIdsAfterMove(books, 'b', 'want', 0);
    expect(first).toEqual(second);
    expect(first).toEqual(['b', 'a', 'c']);
  });

  it('未找到被拖动的书时抛错', () => {
    expect(() => orderedIdsAfterMove([], 'missing', 'want', 0)).toThrow('未找到被拖动的书');
  });
});

describe('dragSort.assignSortIndexes / nextSortIndex', () => {
  it('整列按 10、20、30… 重新分配（可自定义步长）', () => {
    expect(assignSortIndexes(['a', 'b', 'c'])).toEqual({ a: 10, b: 20, c: 30 });
    expect(assignSortIndexes(['a', 'b'], 5)).toEqual({ a: 5, b: 10 });
    expect(assignSortIndexes([])).toEqual({});
  });

  it('新建书 nextSortIndex：空列 10，有值取最大 + 10，忽略非数字', () => {
    expect(nextSortIndex([])).toBe(10);
    expect(nextSortIndex([10, 30, 20])).toBe(40);
    expect(nextSortIndex([undefined, 20])).toBe(30);
    expect(nextSortIndex([], 5)).toBe(5);
  });
});

describe('movedIndex（键盘 / 触屏上移下移，P6-3）', () => {
  it('常规：列中间上移一得 i-1、下移一得 i+1', () => {
    expect(movedIndex(1, -1, 3)).toBe(0);
    expect(movedIndex(1, 1, 3)).toBe(2);
    expect(movedIndex(0, 1, 3)).toBe(1);
    expect(movedIndex(2, -1, 3)).toBe(1);
  });

  it('边界：列首上移、列尾下移都返回 null（不动也不越界）', () => {
    expect(movedIndex(0, -1, 3)).toBeNull();
    expect(movedIndex(2, 1, 3)).toBeNull();
    expect(movedIndex(0, -1, 1)).toBeNull();
  });

  it('非法输入：下标越界 / 非整数 / 单列都返回 null', () => {
    expect(movedIndex(-1, 1, 3)).toBeNull();
    expect(movedIndex(3, -1, 3)).toBeNull();
    expect(movedIndex(0.5, 1, 3)).toBeNull();
    expect(movedIndex(0, 1, 0)).toBeNull();
  });
});
