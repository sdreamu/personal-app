<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { listAliveByDate, type Plan, type StudyRecord } from '@/db';
import { useDateStore } from '@/stores/date';
import { useSettingsStore } from '@/stores/settings';
import { usePlanStore } from '@/stores/plan';
import { addDays, formatDuration, logicalToday, MINUTES_PER_DAY, parseDateKey, weekdayCN } from '@/utils/date';

/**
 * 日程页顶部的一周概览（v5）：默认窗口「昨天 → 后五天」共 7 天。
 * 每列 = 一天，分三条泳道（学习 / 生活 / 其它），列脚给摘要：件数 + 学习时长 + 主项。
 * 点某天等于把下面的单日时间轴切到那天，不跳页。
 */
interface LaneBar {
  left: string;
  width: string;
  done: boolean;
  miss: boolean;
  title: string;
}

interface WeekColumn {
  date: string;
  weekday: string;
  dayLabel: string;
  isToday: boolean;
  count: number;
  doneCount: number;
  studySec: number;
  main: string;
  lanes: Record<'study' | 'life' | 'other', LaneBar[]>;
}

const props = withDefaults(defineProps<{ windowStart?: string | null }>(), { windowStart: null });

const emit = defineEmits<{
  /** 点了某一天（dateStore 已经切过去，父组件据此下钻到单日视图）。 */
  (e: 'pick', date: string): void;
  /** 窗口翻页：上一周 / 回到今天 / 下一周。 */
  (e: 'nav', step: 'prev' | 'today' | 'next'): void;
}>();

const dateStore = useDateStore();
const settings = useSettingsStore();
const planStore = usePlanStore();
const columns = ref<WeekColumn[]>(windowDates().map(date => summarize(date, [], [])));
let loadVersion = 0;
const loading = ref(true);

const selected = computed(() => dateStore.selectedDate);

function percent(offset: number): number {
  return Math.min(100, Math.max(0, (offset / MINUTES_PER_DAY) * 100));
}

function laneOf(plan: Plan, customKeys: Set<string>): 'study' | 'life' | 'other' {
  if (plan.category_key === 'study') return 'study';
  if (plan.category_key === 'life') return 'life';
  if (customKeys.has(plan.category_key)) return 'other';
  return 'other';
}

function windowDates(): string[] {
  const today = logicalToday(settings.dayStartMin);
  const start = props.windowStart && parseDateKey(props.windowStart) !== null
    ? props.windowStart : addDays(today, -1);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function summarize(date: string, plans: Plan[], records: StudyRecord[]): WeekColumn {
  const today = logicalToday(settings.dayStartMin);
  const now = new Date();
  const nowOffset = ((now.getHours() * 60 + now.getMinutes() - settings.dayStartMin) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const lanes: WeekColumn['lanes'] = { study: [], life: [], other: [] };
  const customKeys = new Set<string>();
  for (const plan of plans) {
    if (plan.category_key !== 'study' && plan.category_key !== 'life') customKeys.add(plan.category_key);
  }
  for (const plan of plans) {
    if (plan.start_min === null || plan.end_min === null || plan.end_min <= plan.start_min) continue;
    const lane = laneOf(plan, customKeys);
    lanes[lane].push({
      left: `${percent(plan.start_min)}%`,
      width: `${Math.max(2, percent(plan.end_min - plan.start_min))}%`,
      done: plan.done,
      miss: !plan.done && date <= today && plan.end_min <= nowOffset,
      title: plan.title,
    });
  }

  const isToday = date === today;
  const firstUndone = plans.find((plan) => !plan.done) ?? plans[0] ?? null;
  return {
    date,
    weekday: weekdayCN(date).replace('周', ''),
    dayLabel: date.slice(5).replace('-', '.'),
    isToday,
    count: plans.length,
    doneCount: plans.filter((plan) => plan.done).length,
    studySec: records.reduce((sum, record) => sum + record.duration_sec, 0),
    main: firstUndone === null ? '还没有安排' : firstUndone.title,
    lanes,
  };
}

async function load(): Promise<void> {
  const version = ++loadVersion;
  loading.value = true;
  // 首帧已保留七天布局；刷新时保留现有内容，查询完成后一次更新。
  const result = await Promise.all(windowDates().map(async date => {
    try {
      const [plans, records] = await Promise.all([
        listAliveByDate('plans', date),
        listAliveByDate('study_records', date),
      ]);
      return summarize(date, plans, records);
    } catch {
      return summarize(date, [], []);
    }
  }));
  if (version !== loadVersion) return;
  columns.value = result;
  loading.value = false;
}

function pick(date: string): void {
  dateStore.setSelected(date);
  emit('pick', date);
}

const rangeLabel = computed(() => {
  const first = columns.value[0]?.dayLabel ?? '';
  const last = columns.value[columns.value.length - 1]?.dayLabel ?? '';
  return first === '' ? '' : first + ' – ' + last;
});

onMounted(() => {
  void load();
});

watch(() => settings.dayStartMin, () => void load());
watch(() => props.windowStart, () => void load());
watch(() => planStore.plans, () => void load(), { deep: true });
</script>

<template>
  <section class="week" data-test="schedule-week">
    <div class="week-head">
      <h2 class="week-title">这七天</h2>
      <span class="week-range num" data-test="week-range">{{ rangeLabel }}</span>
      <span class="week-nav">
        <button type="button" class="ghost-btn" data-test="week-prev" @click="emit('nav', 'prev')">
          ← 上一周
        </button>
        <button type="button" class="ghost-btn" data-test="week-today" @click="emit('nav', 'today')">
          回到今天
        </button>
        <button type="button" class="ghost-btn" data-test="week-next" @click="emit('nav', 'next')">
          下一周 →
        </button>
      </span>
      <ul class="legend" aria-hidden="true">
        <li><span class="dot lane-study" />学习</li>
        <li><span class="dot lane-life" />生活</li>
        <li><span class="dot lane-other" />其它</li>
      </ul>
    </div>

    <div class="week-grid" :aria-busy="loading">
      <button
        v-for="column in columns"
        :key="column.date"
        type="button"
        class="day"
        :class="{ today: column.isToday, sel: column.date === selected }"
        :data-test="`week-day-${column.date}`"
        @click="pick(column.date)"
      >
        <span class="day-head">
          <span class="day-weekday">{{ column.weekday }}</span>
          <span class="day-date num">{{ column.dayLabel }}</span>
        </span>

        <span class="lanes" aria-hidden="true">
          <span v-for="lane in (['study', 'life', 'other'] as const)" :key="lane" class="lane" :class="'lane-' + lane">
            <span
              v-for="(bar, index) in column.lanes[lane]"
              :key="index"
              class="bar"
              :class="{ done: bar.done, miss: bar.miss }"
              :style="{ left: bar.left, width: bar.width }"
            />
          </span>
        </span>

        <span class="day-count num">{{ column.count }} 件</span>
        <span class="day-study num">{{ column.studySec > 0 ? formatDuration(column.studySec) : '— —' }}</span>
        <span class="day-main">{{ column.main }}</span>
        <span :style="{ visibility: column.count > 0 ? undefined : 'hidden' }" class="day-done num">完成 {{ column.doneCount }}/{{ column.count }}</span>
      </button>
    </div>
    <div class="week-agenda"><button v-for="column in columns.filter(day => day.count > 0)" :key="column.date" type="button" class="agenda-row" @click="pick(column.date)"><span>{{ column.dayLabel }}</span><b>{{ column.main }}</b><span>{{ column.doneCount }}/{{ column.count }}</span></button></div>
  </section>
</template>

<style scoped>
.week-agenda { display: none; }
.agenda-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 12px 0; text-align: left; border: none; border-bottom: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 12px; }
.agenda-row b { flex: 1; min-width: 0; color: var(--text); font-weight: 500; overflow-wrap: anywhere; }
.week { margin: 24px 0; }
.week-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 16px; }
.week-title { margin: 0; font-size: 19px; font-weight: 650; }
.week-range { color: var(--muted); font-size: 13px; }
.week-nav { display: flex; gap: 4px; margin-left: auto; }
.week-nav .ghost-btn { background: transparent; padding: 6px 10px; font-size: 12px; }
.legend { display: flex; gap: 14px; padding: 0; margin: 0; list-style: none; width: 100%; color: var(--muted); font-size: 11px; }
.legend li { display: flex; align-items: center; gap: 5px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.dot.lane-study { background: var(--accent); }
.dot.lane-other { opacity: .5; }
.week-grid { display: grid; grid-template-columns: repeat(7, minmax(44px, 1fr)); gap: 6px; overflow-x: auto; padding: 3px 2px 8px; }
.day { display: flex; flex-direction: column; gap: 7px; min-height: 170px; min-width: 0; padding: 14px 10px; border: none; border-radius: var(--radius); background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.day:hover { background: var(--panel-2); }
.day.sel { box-shadow: inset 0 0 0 1px var(--accent); }
.day.today { background: var(--accent-soft); color: var(--accent); }
.day-head { display: flex; flex-direction: column; gap: 5px; }
.day-weekday { font-size: 12px; color: var(--muted); }
.day-date { font-size: 19px; font-weight: 650; }
.lanes { display: flex; flex-direction: column; gap: 3px; padding: 3px 0; }
.lane { position: relative; height: 4px; }
.bar { position: absolute; top: 0; bottom: 0; background: var(--accent); border-radius: var(--radius-small); }
.lane-life .bar { background: var(--muted); }
.lane-other .bar { background: var(--muted); opacity: .5; }
.bar.done { opacity: .4; }
.bar.miss { background: var(--danger); opacity: 1; }
.day-count { font-size: 12px; font-weight: 600; }
.day-study, .day-done { font-size: 11px; color: var(--muted); }
.day-main { font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; color: var(--muted); }
.day-done { margin-top: auto; }
@media (max-width: 768px) {
  .week-agenda { display: block; }
  .week-head { gap: 6px 10px; }
  .week-nav { flex-basis: 100%; margin-left: 0; justify-content: space-between; }
  .week-nav .ghost-btn { padding: 4px 0; }
  .week-grid { gap: 3px; }
  .day { padding: 12px 3px; min-height: 118px; text-align: center; gap: 6px; }
  .day-head { align-items: center; }
  .day-date { font-size: 14px; }
  .day-main, .day-study, .day-done { display: none; }
  .legend { margin-top: 4px; }
}
</style>
