/**
 * 数据库契约 —— 与 DECISIONS.md 的 16 张表完全一致，后续阶段按此对接。
 * 通用字段：id(UUID 字符串主键)、created_at(ms)、updated_at(ms)、deleted_at(ms|null 软删除)。
 * 注意：settings 与 active_timer 为单行表（主键 key），但同样携带通用字段（deleted_at 恒为 null）。
 * plans.category_key：内置分类用 builtin_key（'study'|'life'|'other'），自定义分类用其记录 id；
 * meals.meal_key 同理（'breakfast'|'lunch'|'dinner'|'snack' 或自定义餐次 id）。
 */
import { DEFAULT_DAY_START } from '@/utils/date';

export const DB_NAME = 'evan_personal_app_db';
export const SCHEMA_VERSION = 1;
export const APP_ID = 'evan-app';

export interface BaseFields {
  id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export type PlanBuiltinKey = 'study' | 'life' | 'other';
export type MealBuiltinKey = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** 1. 设置：单行 key='app'。 */
export interface SettingsRecord extends BaseFields {
  key: 'app';
  daily_study_min: number;
  daily_water_ml: number;
  cup_ml: number;
  daily_play_min: number;
  day_start: string;
  theme: 'light' | 'dark';
  last_backup_at: number | null;
}

/** 2. 计划分类：内置 学习/生活/其他 不可删除改名。 */
export interface PlanCategory extends BaseFields {
  name: string;
  builtin_key: PlanBuiltinKey | null;
}

/** 3. 餐次：内置 早/午/晚/加餐 不可删除改名。 */
export interface MealType extends BaseFields {
  name: string;
  builtin_key: MealBuiltinKey | null;
}

/** 4. 训练类型。 */
export interface WorkoutType extends BaseFields {
  name: string;
}

/** 5. 计划项（待办/时间块）。 */
export interface Plan extends BaseFields {
  title: string;
  date: string;
  start_min: number | null;
  end_min: number | null;
  category_key: string;
  category_name: string;
  target_type: 'book' | 'subject' | null;
  target_id: string | null;
  target_title: string | null;
  done: boolean;
  done_at: number | null;
  rollover_from_date: string | null;
  is_rolled_over: boolean;
}

/** 6. 书。 */
export interface Book extends BaseFields {
  title: string;
  author: string | null;
  total_pages: number;
  current_page: number;
  status: 'want' | 'reading' | 'done';
  color: string;
  start_date: string | null;
  finish_date: string | null;
}

/** 7. 摘录。 */
export interface Excerpt extends BaseFields {
  book_id: string;
  page: number;
  content: string;
  thought: string | null;
}

/** 8. 科目。 */
export interface Subject extends BaseFields {
  name: string;
  weekly_goal_min: number;
  deadline: string | null;
  archived: boolean;
}

/** 9. 学习记录（书和科目共用）。 */
export interface StudyRecord extends BaseFields {
  target_type: 'book' | 'subject';
  target_id: string | null;
  target_title: string;
  start_at: number;
  end_at: number;
  duration_sec: number;
  note: string | null;
  start_page: number | null;
  end_page: number | null;
  pages_read: number | null;
  source: 'timer' | 'manual' | 'page_update';
  date: string;
}

/** 10. 进行中的全局计时：单行 key='global'（ended_at 非空 = 待结算）。 */
export interface ActiveTimer extends BaseFields {
  key: 'global';
  type: 'book' | 'subject' | 'entertainment';
  target_id: string | null;
  target_title: string;
  plan_id: string | null;
  mode: 'stopwatch' | 'countdown';
  countdown_sec: number;
  started_at: number;
  paused_total_ms: number;
  paused: boolean;
  pause_started_at: number | null;
  ended_at: number | null;
}

/** 11. 餐食记录。 */
export interface Meal extends BaseFields {
  date: string;
  meal_key: string;
  meal_name: string;
  text: string;
  feeling: 'full' | 'not_full' | 'overeat' | null;
}

/** 12. 喝水记录（ml 可正可负）。 */
export interface Water extends BaseFields {
  date: string;
  ml: number;
  at: number;
}

/** 13. 每周计划（1=周一 ~ 7=周日）。 */
export interface WorkoutTemplate extends BaseFields {
  weekday: number;
  type_name: string;
  exercise_names: string[];
}

export interface ExerciseSet {
  weight_kg: number | null;
  reps: number | null;
  done: boolean;
}

export interface ExerciseEntry {
  name: string;
  sets: ExerciseSet[];
}

/** 14. 训练记录。 */
export interface WorkoutRecord extends BaseFields {
  date: string;
  type_name: string;
  exercises: ExerciseEntry[];
  duration_min: number | null;
  done: boolean;
}

/** 15. 娱乐记录。 */
export interface PlayRecord extends BaseFields {
  date: string;
  content: string;
  minutes: number;
  source: 'timer' | 'manual';
}

/** 16. 复盘记录。 */
export interface Review extends BaseFields {
  date: string;
  rating: number | null;
  mood: number | null;
  energy: number | null;
  good: string | null;
  improve: string | null;
  mit: string | null;
  mit_added_to_plan: boolean;
}

export interface TableRecordMap {
  settings: SettingsRecord;
  plan_categories: PlanCategory;
  meal_types: MealType;
  workout_types: WorkoutType;
  plans: Plan;
  books: Book;
  excerpts: Excerpt;
  subjects: Subject;
  study_records: StudyRecord;
  active_timer: ActiveTimer;
  meals: Meal;
  water: Water;
  workout_templates: WorkoutTemplate;
  workout_records: WorkoutRecord;
  play_records: PlayRecord;
  reviews: Review;
}

export type TableName = keyof TableRecordMap;

/** 备份文件中的表顺序（稳定，便于比对）。 */
export const TABLE_NAMES: readonly TableName[] = [
  'settings',
  'plan_categories',
  'meal_types',
  'workout_types',
  'plans',
  'books',
  'excerpts',
  'subjects',
  'study_records',
  'active_timer',
  'meals',
  'water',
  'workout_templates',
  'workout_records',
  'play_records',
  'reviews',
];

/** 参与软删除 GC 的表（settings / active_timer 为单行表，不参与）。 */
export const GC_TABLES: readonly TableName[] = TABLE_NAMES.filter(
  (name) => name !== 'settings' && name !== 'active_timer',
);

/** 计入“已有数据”的用户数据表（备份提醒用，不含配置与计时单行表）。 */
export const DATA_TABLES: readonly TableName[] = [
  'plans',
  'books',
  'excerpts',
  'subjects',
  'study_records',
  'meals',
  'water',
  'workout_templates',
  'workout_records',
  'play_records',
  'reviews',
];

/** 建了 date 索引、可按逻辑日期查询的表。 */
export type DateTableName = 'plans' | 'study_records' | 'meals' | 'water' | 'workout_records' | 'play_records' | 'reviews';

export type CategoryKind = 'plan_categories' | 'meal_types' | 'workout_types';

export const DEFAULT_SETTINGS_VALUES = {
  daily_study_min: 120,
  daily_water_ml: 2000,
  cup_ml: 250,
  daily_play_min: 60,
  day_start: DEFAULT_DAY_START,
  theme: 'light' as const,
  last_backup_at: null,
};

export const BUILTIN_PLAN_CATEGORIES: ReadonlyArray<{ name: string; builtin_key: PlanBuiltinKey }> = [
  { name: '学习', builtin_key: 'study' },
  { name: '生活', builtin_key: 'life' },
  { name: '其他', builtin_key: 'other' },
];

export const BUILTIN_MEAL_TYPES: ReadonlyArray<{ name: string; builtin_key: MealBuiltinKey }> = [
  { name: '早', builtin_key: 'breakfast' },
  { name: '午', builtin_key: 'lunch' },
  { name: '晚', builtin_key: 'dinner' },
  { name: '加餐', builtin_key: 'snack' },
];

/** 备份 JSON 结构：{ app:'evan-app', schema_version:1, exported_at(ms), tables:{<表名>:[有效记录...]} } */
export interface BackupFile {
  app: typeof APP_ID;
  schema_version: typeof SCHEMA_VERSION;
  exported_at: number;
  tables: { [K in TableName]: TableRecordMap[K][] };
}
