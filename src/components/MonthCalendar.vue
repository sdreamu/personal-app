<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { datesWithData } from '@/db/dateStats';
import { useSettingsStore } from '@/stores/settings';
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
  type CalendarCell,
} from '@/utils/calendar';
import { formatDateCNWeekday, logicalToday } from '@/utils/date';

/**
 * 顶栏日期跳转弹窗里的月历（一周从周一开始）。
 * - “今天”由 settingsStore.dayStartMin + logicalToday 计算后注入纯函数；
 * - 有记录的日期来自 db/dateStats.datesWithData（只算五张主动记录表，忽略软删除）；
 * - 翻月只改“正在查看的月份”，不改变当前选中日；点某天 emit select，由弹窗负责关闭。
 */
const props = defineProps<{ selectedDate: string }>();
const emit = defineEmits<{ (e: 'select', date: string): void }>();

const settingsStore = useSettingsStore();
const today = computed(() => logicalToday(settingsStore.dayStartMin));

const view = ref(monthOfDateKey(props.selectedDate));
watch(
  () => props.selectedDate,
  (value) => {
    view.value = monthOfDateKey(value);
  },
);

/** 当前查看月份有记录的日期；异步加载，token 防止快速翻月时旧结果覆盖新结果。 */
const recordDates = ref<readonly string[]>([]);
let loadToken = 0;

async function loadRecordDates(year: number, month: number): Promise<void> {
  const token = ++loadToken;
  try {
    const dates = await datesWithData(year, month);
    if (token === loadToken) recordDates.value = dates;
  } catch {
    // 小点是增强信息，查询失败时月历其余功能照常可用
    if (token === loadToken) recordDates.value = [];
  }
}

watch(
  () => [view.value.year, view.value.month] as const,
  ([year, month]) => {
    void loadRecordDates(year, month);
  },
  { immediate: true },
);

const title = computed(() => monthLabel(view.value.year, view.value.month));
const cells = computed<CalendarCell[]>(() =>
  buildMonthGrid(view.value.year, view.value.month, {
    today: today.value,
    selected: props.selectedDate,
    recordDates: recordDates.value,
  }),
);

function goMonth(delta: number): void {
  view.value = shiftMonth(view.value.year, view.value.month, delta);
}

function pick(date: string): void {
  emit('select', date);
}

/** 屏幕阅读器用的按钮文案：日期 + 今天/选中/有记录标记。 */
function cellLabel(cell: CalendarCell): string {
  const marks: string[] = [];
  if (cell.is_today) marks.push('今天');
  if (cell.is_selected) marks.push('当前选中');
  if (cell.has_record) marks.push('有记录');
  const base = formatDateCNWeekday(cell.date);
  return marks.length === 0 ? base : `${base}（${marks.join('，')}）`;
}
</script>

<template>
  <section class="month-calendar" data-test="month-calendar" aria-label="月历">
    <div class="calendar-head">
      <button
        type="button"
        class="icon-btn"
        data-test="calendar-prev-month"
        aria-label="上个月"
        title="上个月"
        @click="goMonth(-1)"
      >
        ◀
      </button>
      <span class="calendar-month-label" data-test="calendar-month-label" aria-live="polite">{{ title }}</span>
      <button
        type="button"
        class="icon-btn"
        data-test="calendar-next-month"
        aria-label="下个月"
        title="下个月"
        @click="goMonth(1)"
      >
        ▶
      </button>
      <button
        type="button"
        class="today-btn calendar-today"
        data-test="calendar-today"
        aria-label="回到今天"
        title="回到今天"
        @click="pick(today)"
      >
        今天
      </button>
    </div>

    <div class="calendar-weekdays" aria-hidden="true">
      <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
    </div>

    <div class="calendar-grid">
      <button
        v-for="cell in cells"
        :key="cell.date"
        type="button"
        class="calendar-day"
        :class="{
          'out-month': !cell.in_month,
          'is-today': cell.is_today,
          'is-selected': cell.is_selected,
        }"
        data-test="calendar-day"
        :data-date="cell.date"
        :data-in-month="cell.in_month ? 'true' : 'false'"
        :data-today="cell.is_today ? 'true' : 'false'"
        :data-selected="cell.is_selected ? 'true' : 'false'"
        :data-has-record="cell.has_record ? 'true' : 'false'"
        :aria-label="cellLabel(cell)"
        :aria-pressed="cell.is_selected"
        :aria-current="cell.is_today ? 'date' : undefined"
        @click="pick(cell.date)"
      >
        <span class="calendar-day-num">{{ cell.day }}</span>
        <span v-if="cell.has_record" class="calendar-dot" data-test="calendar-dot" aria-hidden="true"></span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.month-calendar { display: flex; flex-direction: column; gap: 8px; }
.calendar-head { display: flex; align-items: center; gap: 6px; }
.calendar-month-label {
  flex: 1;
  text-align: center;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.calendar-today { padding: 2px 10px; white-space: nowrap; }
.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.calendar-day {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 2px 0 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.calendar-day:hover { background: var(--panel-2); border-color: var(--border); }
.calendar-day.out-month { color: var(--muted); opacity: 0.6; }
/* 今天：浅底 + 强调色描边；当前选中日：实心强调色底。
   两者同时成立时再叠一圈内描边（on-accent），与“只选中”区分。 */
.calendar-day.is-today {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}
.calendar-day.out-month.is-today { opacity: 1; }
.calendar-day.is-selected {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 700;
}
.calendar-day.is-selected:hover { background: var(--accent); }
.calendar-day.is-selected.is-today { box-shadow: inset 0 0 0 2px var(--on-accent); }
.calendar-dot {
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
  transform: translateX(-50%);
}
.calendar-day.is-selected .calendar-dot { background: var(--on-accent); }

@media (max-width: 768px) {
  .calendar-day { min-height: var(--touch); }
  .calendar-today { min-height: var(--touch); }
}
</style>
