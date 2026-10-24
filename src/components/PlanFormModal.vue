<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BaseModal from '@/components/BaseModal.vue';
import { QUICK_DURATIONS, resolveTimeRange, type PlanFormPayload } from '@/stores/plan';
import { offsetToTime, timeToOffset } from '@/utils/date';
import type { Book, Plan, PlanCategory, Subject } from '@/db';

/**
 * 计划项新增/编辑弹窗（普通弹窗：Esc / 遮罩关闭，回车或点“保存”写入）。
 * 纯展示组件：校验与换算在这里完成，真正的写库由父组件调用 plan store。
 * 时间输入为 HH:mm，保存前按设置的一天起点换算为偏移分钟（结束不晚于开始时
 * 自动视为次日，跨一天起点边界拒绝保存）；快捷时长 = 结束 = 开始 + 时长。
 */
const props = defineProps<{
  dayStartMin: number;
  categories: PlanCategory[];
  books: Book[];
  subjects: Subject[];
  /** null = 新增；否则编辑该计划项。 */
  initial: Plan | null;
  /** 父组件写库失败时传回的行内错误。 */
  externalError?: string | null;
}>();
const emit = defineEmits<{
  (e: 'save', payload: PlanFormPayload): void;
  (e: 'close'): void;
}>();

const title = ref(props.initial?.title ?? '');
const categoryKey = ref(props.initial?.category_key ?? 'other');
const startHhmm = ref('');
const endHhmm = ref('');
const targetValue = ref('');
const error = ref('');

function initFromInitial(): void {
  const p = props.initial;
  startHhmm.value =
    p && p.start_min !== null ? offsetToTime(p.start_min, props.dayStartMin) : '';
  endHhmm.value = p && p.end_min !== null ? offsetToTime(p.end_min, props.dayStartMin) : '';
  targetValue.value = p?.target_type && p.target_id ? `${p.target_type}:${p.target_id}` : '';
}
initFromInitial();

const isStudy = computed(() => categoryKey.value === 'study');
const dialogTitle = computed(() => (props.initial ? '编辑计划' : '新增计划'));

/** 编辑历史项时其自定义分类可能已被删除：保留快照供下拉回显。 */
const categoryOptions = computed(() => {
  const list = [...props.categories];
  const current = list.find((c) => (c.builtin_key ?? c.id) === categoryKey.value);
  if (!current && props.initial) {
    list.push({
      id: props.initial.category_key,
      name: `${props.initial.category_name}（已删除）`,
      builtin_key: null,
      created_at: 0,
      updated_at: 0,
      deleted_at: null,
    } as PlanCategory);
  }
  return list;
});

interface TargetOption {
  value: string;
  label: string;
  type: 'book' | 'subject';
  id: string;
  title: string;
}

const targetOptions = computed<TargetOption[]>(() => {
  const list: TargetOption[] = [
    ...props.books.map((b) => ({
      value: `book:${b.id}`,
      label: `书 · ${b.title}`,
      type: 'book' as const,
      id: b.id,
      title: b.title,
    })),
    ...props.subjects.map((s) => ({
      value: `subject:${s.id}`,
      label: `科目 · ${s.name}`,
      type: 'subject' as const,
      id: s.id,
      title: s.name,
    })),
  ];
  if (
    props.initial?.target_type &&
    props.initial.target_id &&
    targetValue.value !== '' &&
    !list.some((o) => o.value === targetValue.value)
  ) {
    list.push({
      value: targetValue.value,
      label: `${props.initial.target_type === 'book' ? '书' : '科目'} · ${props.initial.target_title ?? '（已删除）'}`,
      type: props.initial.target_type,
      id: props.initial.target_id,
      title: props.initial.target_title ?? '（已删除）',
    });
  }
  return list;
});

// 分类切走“学习”时清空关联对象（仅学习类可选关联）。
watch(isStudy, (study) => {
  if (!study) targetValue.value = '';
});

/** 快捷时长：结束 = 开始 + 时长；结束偏移超过 1440 即跨一天起点边界，拒绝。 */
function applyDuration(minutes: number): void {
  error.value = '';
  const start = startHhmm.value.trim();
  if (start === '') {
    error.value = '请先填写开始时间';
    return;
  }
  try {
    const startMin = timeToOffset(start, props.dayStartMin);
    const endMin = startMin + minutes;
    if (endMin > 1440) {
      error.value = '时间块不得跨越一天起点边界';
      return;
    }
    endHhmm.value = offsetToTime(endMin, props.dayStartMin);
  } catch {
    error.value = '请输入有效的开始时间（HH:mm）';
  }
}

function parseTimes():
  | { ok: true; startMin: number | null; endMin: number | null }
  | { ok: false; reason: string } {
  const start = startHhmm.value.trim();
  const end = endHhmm.value.trim();
  if (start === '' && end === '') return { ok: true, startMin: null, endMin: null };
  if (start === '' || end === '') {
    return { ok: false, reason: '请同时填写开始与结束时间' };
  }
  const resolved = resolveTimeRange(start, end, props.dayStartMin);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  return { ok: true, startMin: resolved.startMin, endMin: resolved.endMin };
}

function save(): void {
  error.value = '';
  const trimmedTitle = title.value.trim();
  if (trimmedTitle === '') {
    error.value = '标题不能为空';
    return;
  }
  const times = parseTimes();
  if (!times.ok) {
    error.value = times.reason;
    return;
  }
  let targetType: PlanFormPayload['targetType'] = null;
  let targetId: string | null = null;
  let targetTitle: string | null = null;
  if (isStudy.value && targetValue.value !== '') {
    const option = targetOptions.value.find((o) => o.value === targetValue.value);
    if (option) {
      targetType = option.type;
      targetId = option.id;
      targetTitle = option.title;
    }
  }
  emit('save', {
    title: trimmedTitle,
    categoryKey: categoryKey.value,
    startMin: times.startMin,
    endMin: times.endMin,
    targetType,
    targetId,
    targetTitle,
  });
}
</script>

<template>
  <BaseModal id="plan-form" :title="dialogTitle" @close="emit('close')">
    <form class="plan-form" data-test="plan-form" @submit.prevent="save">
      <div class="field">
        <label for="plan-form-title">标题（必填）</label>
        <input
          id="plan-form-title"
          v-model="title"
          data-test="plan-form-title"
          placeholder="要做什么？"
        />
      </div>
      <div class="field">
        <label for="plan-form-category">分类</label>
        <select id="plan-form-category" v-model="categoryKey" data-test="plan-form-category">
          <option v-for="c in categoryOptions" :key="c.builtin_key ?? c.id" :value="c.builtin_key ?? c.id">
            {{ c.name }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="plan-form-start">开始时间（可空 HH:mm）</label>
        <input id="plan-form-start" v-model="startHhmm" type="time" data-test="plan-form-start" />
      </div>
      <div class="field">
        <label for="plan-form-end">结束时间（可空 HH:mm）</label>
        <input id="plan-form-end" v-model="endHhmm" type="time" data-test="plan-form-end" />
      </div>
      <div class="field">
        <span>快捷时长</span>
        <div class="quick-row">
          <button
            v-for="minutes in QUICK_DURATIONS"
            :key="minutes"
            type="button"
            class="ghost-btn"
            :data-test="`quick-${minutes}`"
            @click="applyDuration(minutes)"
          >
            {{ minutes }}分钟
          </button>
        </div>
      </div>
      <div v-if="isStudy" class="field">
        <label for="plan-form-target">关联对象（可选）</label>
        <select id="plan-form-target" v-model="targetValue" data-test="plan-form-target">
          <option value="">不关联</option>
          <option v-for="opt in targetOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
      <p v-if="error || externalError" class="form-error" data-test="plan-form-error">
        {{ error || externalError }}
      </p>
      <footer class="form-footer">
        <button type="button" class="ghost-btn" data-test="plan-form-cancel" @click="emit('close')">
          取消
        </button>
        <button type="submit" class="primary-btn" data-test="plan-form-save">保存</button>
      </footer>
    </form>
  </BaseModal>
</template>

<style scoped>
.plan-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.quick-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.quick-row .ghost-btn {
  padding: 4px 12px;
  font-size: 13px;
}
.form-error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}
.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
</style>
