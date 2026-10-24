/**
 * 分类管理（计划分类/训练类型/餐次）。
 * 内置项（builtin_key 非 null）不可删除/改名；删除自定义项不触碰历史记录
 * （历史记录靠各记录表的名称快照字段继续显示）。
 */
import { createRecord, listAlive, softDelete, updateRecord } from './crud';
import type { CategoryKind, MealType, PlanCategory, TableRecordMap, WorkoutType } from './schema';

export type CategoryRecord = PlanCategory | MealType | WorkoutType;
export type CategoryOf<K extends CategoryKind> = TableRecordMap[K];

export function isBuiltinCategory(record: CategoryRecord): boolean {
  return 'builtin_key' in record && record.builtin_key !== null;
}

export async function listCategories<K extends CategoryKind>(kind: K): Promise<CategoryOf<K>[]> {
  return listAlive(kind);
}

export async function addCategory<K extends CategoryKind>(kind: K, name: string): Promise<CategoryOf<K>> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('分类名称不能为空');
  if (kind === 'workout_types') {
    return (await createRecord(kind as 'workout_types', { name: trimmed })) as CategoryOf<K>;
  }
  return (await createRecord(kind as 'plan_categories' | 'meal_types', {
    name: trimmed,
    builtin_key: null,
  })) as CategoryOf<K>;
}

export async function renameCategory(kind: CategoryKind, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('分类名称不能为空');
  const current = (await listCategories(kind)).find((row) => row.id === id);
  if (!current) throw new Error('分类不存在');
  if (isBuiltinCategory(current)) throw new Error('内置分类不可改名');
  await updateRecord(kind, id, { name: trimmed } as Partial<TableRecordMap[CategoryKind]>);
}

export async function removeCategory(kind: CategoryKind, id: string): Promise<void> {
  const current = (await listCategories(kind)).find((row) => row.id === id);
  if (!current) throw new Error('分类不存在');
  if (isBuiltinCategory(current)) throw new Error('内置分类不可删除');
  await softDelete(kind, id);
}
