import { defineStore } from 'pinia';
import {
  createRecord,
  errorMessage,
  getRecord,
  isAlive,
  listAlive,
  nowMs,
  softDelete,
  undoDelete,
  updateRecord,
  type Mistake,
} from '@/db';
import { useSaveStatusStore } from './saveStatus';
import { useToastStore } from './toast';

/** 错误原因预设标签（Q5 拍板：4 个预设，另外允许自定义）。 */
export const MISTAKE_REASONS: readonly string[] = ['概念不清', '计算失误', '审题错误', '时间不够'];

/** 难度 1~5（整数）；越界时夹到区间内。 */
export function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value)));
}

export interface MistakeInput {
  date: string;
  subjectName: string | null;
  knowledgePoint?: string | null;
  questionText: string;
  correctionText: string;
  reasons: string[];
  note: string;
  difficulty: number;
  mastered: boolean;
  /** 题目照片（base64 dataURL，单组上限 4 张）。 */
  questionImages?: string[];
  /** 订正照片（base64 dataURL，单组上限 4 张）。 */
  correctionImages?: string[];
}

/** 单组图片上限（Q6：题目 4 张 + 订正 4 张）。 */
export const MISTAKE_IMAGE_LIMIT = 4;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 错题本（PRD M9，一题一卡）：
 * 表结构早就就绪（`mistakes` 已进备份/文本导出），这里只做读写与筛选。
 */
export const useMistakesStore = defineStore('mistakes', {
  state: () => ({
    loaded: false,
    loading: false,
    /** 保留旧调用的日期参数，列表不再按日期截断。 */
    date: '',
    items: [] as Mistake[],
    /** 科目筛选（null = 全部）。 */
    subjectFilter: null as string | null,
    /** 只看未掌握。 */
    onlyUnmastered: false,
    knowledgeFilter: null as string | null,
  }),
  getters: {
    /** 按科目、知识点与掌握状态筛选全部错题：未掌握优先，其次按创建时间倒序。 */
    visible(state): Mistake[] {
      return state.items
        .filter((item) => state.subjectFilter === null || item.subject_name === state.subjectFilter)
        .filter((item) => state.knowledgeFilter === null || item.knowledge_point === state.knowledgeFilter)
        .filter((item) => !state.onlyUnmastered || !item.mastered)
        .slice()
        .sort((a, b) => {
          if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
          return b.created_at - a.created_at;
        });
    },
    total(state): number {
      return state.items.length;
    },
    masteredCount(state): number {
      return state.items.filter((item) => item.mastered).length;
    },
    /** 全部错题出现过的科目，兼容未建立科目档案的旧记录。 */
    usedSubjects(state): string[] {
      const names = new Set<string>();
      for (const item of state.items) {
        if (item.subject_name !== null && item.subject_name !== '') names.add(item.subject_name);
      }
      return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    },
  },
  actions: {
    async runWithSaveStatus<T>(fn: () => Promise<T>): Promise<T> {
      const saveStatus = useSaveStatusStore();
      saveStatus.begin();
      try {
        const result = await fn();
        saveStatus.idle();
        return result;
      } catch (err) {
        saveStatus.fail();
        useToastStore().error('保存失败：' + errorMessage(err));
        throw err;
      }
    },

    /** 读取全部日期的错题（软删除的不算）。 */
    async load(date = ''): Promise<void> {
      this.loading = true;
      this.date = date;
      try {
        const rows = await listAlive('mistakes');
        this.items = rows.filter((row) => isAlive(row)).sort((a, b) => b.created_at - a.created_at);
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },

    /** 新增一条错题：日期用逻辑日期，mastered 默认 false。 */
    async create(input: MistakeInput): Promise<Mistake | null> {
      const questionText = input.questionText.trim();
      const correctionText = input.correctionText.trim();
      // 支持纯照片录题；文字和两组图片都为空才忽略。
      if (questionText === '' && correctionText === '' && !input.questionImages?.length && !input.correctionImages?.length) return null;
      const created = await this.runWithSaveStatus(() =>
        createRecord('mistakes', {
          date: input.date,
          subject_name: emptyToNull(input.subjectName ?? ''),
          knowledge_point: emptyToNull(input.knowledgePoint ?? ''),
          question_text: emptyToNull(questionText),
          question_images: [...(input.questionImages ?? [])].slice(0, MISTAKE_IMAGE_LIMIT),
          correction_text: emptyToNull(correctionText),
          correction_images: [...(input.correctionImages ?? [])].slice(0, MISTAKE_IMAGE_LIMIT),
          // 注意：调用方传进来的可能是 Vue 响应式数组（Proxy），IndexedDB 结构化克隆会报
          // DataCloneError，这里一律展开成普通数组再落库。
          reasons: [...input.reasons],
          note: emptyToNull(input.note),
          difficulty: clampDifficulty(input.difficulty),
          mastered: input.mastered,
        }),
      );
      this.items = [created, ...this.items];
      return created;
    },

    /** 编辑一条错题（字段与新增一致）。 */
    async save(id: string, input: MistakeInput): Promise<Mistake | null> {
      await this.runWithSaveStatus(() =>
        updateRecord('mistakes', id, {
          date: input.date,
          subject_name: emptyToNull(input.subjectName ?? ''),
          knowledge_point: emptyToNull(input.knowledgePoint ?? ''),
          question_text: emptyToNull(input.questionText),
          correction_text: emptyToNull(input.correctionText),
          question_images: [...(input.questionImages ?? [])].slice(0, MISTAKE_IMAGE_LIMIT),
          correction_images: [...(input.correctionImages ?? [])].slice(0, MISTAKE_IMAGE_LIMIT),
          reasons: [...input.reasons],
          note: emptyToNull(input.note),
          difficulty: clampDifficulty(input.difficulty),
          mastered: input.mastered,
        }),
      );
      const updated = await getRecord('mistakes', id);
      if (updated !== undefined && this.items.some((item) => item.id === id)) {
        this.items = this.items.map((item) => (item.id === id ? updated : item));
      }
      return updated ?? null;
    },

    /** 标记 / 取消「已掌握」。 */
    async toggleMastered(id: string): Promise<void> {
      const current = this.items.find((item) => item.id === id) ?? (await getRecord('mistakes', id));
      if (current === undefined) return;
      const next = !current.mastered;
      await this.runWithSaveStatus(() => updateRecord('mistakes', id, { mastered: next }));
      this.items = this.items.map((item) => (item.id === id ? { ...item, mastered: next, updated_at: nowMs() } : item));
    },

    /** 删除：软删除 + 5 秒内可撤销。 */
    async remove(id: string): Promise<void> {
      await this.runWithSaveStatus(() => softDelete('mistakes', id));
      this.items = this.items.filter((item) => item.id !== id);
      useToastStore().undoable('已删除这道错题，可撤销', async () => {
        await undoDelete('mistakes', id);
        await this.load(this.date);
      });
    },
  },
});
