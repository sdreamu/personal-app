/**
 * 数据库契约 —— 与 DECISIONS.md 的 16 张表完全一致，后续阶段按此对接。
 * 通用字段：id(UUID 字符串主键)、created_at(ms)、updated_at(ms)、deleted_at(ms|null 软删除)。
 * 注意：settings 与 active_timer 为单行表（主键 key），但同样携带通用字段（deleted_at 恒为 null）。
 * plans.category_key：内置分类用 builtin_key（'study'|'life'|'other'），自定义分类用其记录 id；
 * meals.meal_key 同理（'breakfast'|'lunch'|'dinner'|'snack' 或自定义餐次 id）。
 */
import { DEFAULT_DAY_START } from '@/utils/date';

export const DB_NAME = 'evan_personal_app_db';
/** 备份 JSON 的结构版本（导出时写入，导入时按兼容清单校验）。 */
export const SCHEMA_VERSION = 3;
/** Dexie 数据库结构版本（this.version 用）——与备份结构版本解耦，两者独立演进。 */
export const DB_VERSION = 3;
/** 可导入的备份结构版本：1/2 = 旧备份（缺表/缺字段按默认值补齐），3 = 当前版本。 */
export const SUPPORTED_BACKUP_VERSIONS: readonly number[] = [1, 2, 3];
export const APP_ID = 'evan-app';

export interface BaseFields {
  id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * 主题模式（唯一类型定义，store 与设置页共用）：
 * - 'light' / 'dark'：用户手选，固定不随系统变；
 * - 'system'：跟随系统 prefers-color-scheme，系统切换时立即生效。
 * 注意：'system' 只是「取值域扩大」，DB_VERSION / SCHEMA_VERSION / 备份版本都不变，
 * 旧备份里的 'light'/'dark' 仍然合法；读取端遇到未知值兜底为 'light'（见 normalizeTheme）。
 */
export type ThemeMode = 'light' | 'dark' | 'system';

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
  theme: ThemeMode;
  last_backup_at: number | null;
  /**
   * 首页问候语用的昵称（v4 新增，可选）：'' / 缺省 = 没设昵称，问候语只显示「你好」。
   * 只是新增可选字段，不升 DB_VERSION / SCHEMA_VERSION —— 老库里的 settings 行没有这个键，
   * 读取端用 `settings.nickname` 直接取值时靠可选类型 + 运行时兜底（见 config/app.ts 的 greeting）。
   */
  nickname?: string;
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
  /**
   * 书架拖动排序键（v3 新增）：只在同一 status 内比较大小，升序显示。
   * 建库 / 新建书 / 拖动重排 / 备份导入都会赋值；老数据升级时按 created_at 回填，
   * 读取方用 `?? Infinity` 兜底（缺省排到该列末尾，再按 created_at 稳定）。
   */
  sort_index?: number;
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
  /** 可选分类字段，旧记录按空数组读取，随 JSON 备份保存。 */
  knowledge_points?: string[];
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
  /**
   * 餐食照片（AC-86）：压缩后的 JPEG data URL 数组，单条最多 MEAL_PHOTO_LIMIT 张。
   * 可选字段：老数据没有这个键，读的时候按「没有照片」处理，所以不用升 DB 版本。
   */
  photos?: string[];
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
  /** 动作备注（v2 新增；v1 数据升级时补 null，读取方按 null 兜底）。 */
  note?: string | null;
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
  /** 今天一件值得记录的事（v2 新增；v1 数据升级时补 null）。 */
  record_worthy?: string | null;
  /** 一句话总结今天（v2 新增；v1 数据升级时补 null）。 */
  day_summary?: string | null;
  mit_added_to_plan: boolean;
}

/** 17. 训练项目库（动作名，去重后作为动作补全候选源）。 */
export interface Exercise extends BaseFields {
  name: string;
}

/** 18. 错题本。图片一律以 base64 data URL 字符串存储（可被 JSON 备份直接带走，禁止 Blob）。 */
export interface Mistake extends BaseFields {
  /** 旧错题未标注时按未分类读取。 */
  knowledge_point?: string | null;
  date: string;
  subject_name: string | null;
  question_text: string | null;
  question_images: string[];
  correction_text: string | null;
  correction_images: string[];
  reasons: string[];
  /** 备注（v2 新增；旧记录/旧备份缺失时按 null 兜底，读取方用 note ?? ''）。 */
  note?: string | null;
  /** 难度 1~5（整数）。 */
  difficulty: number;
  mastered: boolean;
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
  exercises: Exercise;
  mistakes: Mistake;
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
  'exercises',
  'mistakes',
];

/** v1 备份里存在的表（v2 新增的 exercises / mistakes 不在此列，旧备份缺失时补空数组）。 */
export const V1_TABLE_NAMES: readonly TableName[] = TABLE_NAMES.filter(
  (name) => name !== 'exercises' && name !== 'mistakes',
);

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
  'exercises',
  'mistakes',
];

/** 建了 date 索引、可按逻辑日期查询的表。 */
export type DateTableName =
  | 'plans'
  | 'study_records'
  | 'meals'
  | 'water'
  | 'workout_records'
  | 'play_records'
  | 'reviews'
  | 'mistakes';

export type CategoryKind = 'plan_categories' | 'meal_types' | 'workout_types';

export const DEFAULT_SETTINGS_VALUES = {
  daily_study_min: 120,
  daily_water_ml: 2000,
  cup_ml: 250,
  daily_play_min: 60,
  day_start: DEFAULT_DAY_START,
  theme: 'light' as const,
  last_backup_at: null,
  nickname: '',
};

export const BUILTIN_PLAN_CATEGORIES: ReadonlyArray<{ name: string; builtin_key: PlanBuiltinKey }> = [
  { name: '学习', builtin_key: 'study' },
  { name: '生活', builtin_key: 'life' },
  { name: '其他', builtin_key: 'other' },
];

/**
 * 内置训练类型（AC-84）：健身页的周计划只能从「训练类型」里选，而这张表以前从来不种子化，
 * 于是新装/清空过的库打开健身页时，类型下拉只有「休息」一项 —— 周计划永远排不出训练日，
 * 表现为"每日计划加不进去"。现在随库种入这三个最通用的类型，用户可自行增删。
 */
export const BUILTIN_WORKOUT_TYPES: readonly string[] = ['力量', '有氧', '拉伸'];

export const BUILTIN_MEAL_TYPES: ReadonlyArray<{ name: string; builtin_key: MealBuiltinKey }> = [
  { name: '早', builtin_key: 'breakfast' },
  { name: '午', builtin_key: 'lunch' },
  { name: '晚', builtin_key: 'dinner' },
  { name: '加餐', builtin_key: 'snack' },
];

/** 备份 JSON 结构：{ app:'evan-app', schema_version:2, exported_at(ms), tables:{<表名>:[有效记录...]} } */
export interface BackupFile {
  app: typeof APP_ID;
  schema_version: typeof SCHEMA_VERSION;
  exported_at: number;
  tables: { [K in TableName]: TableRecordMap[K][] };
}
