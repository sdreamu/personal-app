<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { listAliveByDate, type Plan, type StudyRecord } from '@/db';
import { useDateStore } from '@/stores/date';
import { useSettingsStore } from '@/stores/settings';
import { addDays, formatDuration, logicalToday, MINUTES_PER_DAY, weekdayCN } from '@/utils/date';

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

const dateStore = useDateStore();
const settings = useSettingsStore();
const columns = ref<WeekColumn[]>([]);
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

async function load(): Promise<void> {
  loading.value = true;
  const today = logicalToday(settings.dayStartMin);
  const nowOffset = ((new Date().getHours() * 60 + new Date().getMinutes() - settings.dayStartMin) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const result: WeekColumn[] = [];

  for (let index = -1; index <= 5; index += 1) {
    const date = addDays(today, index);
    let plans: Plan[] = [];
    let records: StudyRecord[] = [];
    try {
      plans = await listAliveByDate('plans', date);
      records = await listAliveByDate('study_records', date);
    } catch {
      plans = [];
      records = [];
    }

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
        miss: !plan.done && index <= 0 && plan.end_min <= nowOffset,
        title: plan.title,
      });
    }

    const isToday = date === today;
    const firstUndone = plans.find((plan) => !plan.done) ?? plans[0] ?? null;
    result.push({
      date,
      weekday: weekdayCN(date).replace('周', ''),
      dayLabel: date.slice(5).replace('-', '.'),
      isToday,
      count: plans.length,
      doneCount: plans.filter((plan) => plan.done).length,
      studySec: records.reduce((sum, record) => sum + record.duration_sec, 0),
      main: firstUndone === null ? '还没有安排' : firstUndone.title,
      lanes,
    });
  }

  columns.value = result;
  loading.value = false;
}

function pick(date: string): void {
  dateStore.setSelected(date);
}

onMounted(() => {
  void load();
});

watch(() => settings.dayStartMin, () => void load());
</script>

<template>
  <section class="week" data-test="schedule-week">
    <div class="week-head">
      <h2 class="week-title">这七天</h2>
      <ul class="legend" aria-hidden="true">
        <li><span class="dot lane-study" />学习</li>
        <li><span class="dot lane-life" />生活</li>
        <li><span class="dot lane-other" />其它</li>
      </ul>
    </div>

    <div class="week-grid" :class="{ loading }">
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
        <span v-if="column.count > 0" class="day-done num">完成 {{ column.doneCount }}/{{ column.count }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.week {
  margin: 0 0 18px;
  padding: 16px 16px 12px;
  background: var(--panel);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: 5px 5px 0 var(--slab);
}
.week-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.week-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.legend {
  display: flex;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 11px;
  color: var(--muted);
}
.legend li {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 8px;
  height: 8px;
  display: inline-block;
}
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
}
.day {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 132px;
  padding: 9px 8px 8px;
  text-align: left;
  background: none;
  border: none;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.day:hover {
  background: var(--panel-2);
}
.day.sel {
  outline: 2px solid var(--border-ink);
  outline-offset: -2px;
}
.day.today {
  background: var(--text);
  color: var(--panel);
}
.day-head {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.day-weekday {
  font-size: 12px;
  font-weight: 700;
}
.day-date {
  font-size: 11px;
  color: var(--muted);
}
.day.today .day-date {
  color: var(--hero-sub);
}
.lanes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 3px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.day.today .lanes {
  border-color: var(--field-tick);
}
.lane {
  position: relative;
  height: 7px;
}
.bar {
  position: absolute;
  top: 0;
  bottom: 0;
}
.lane-study .bar {
  background: var(--accent);
}
.lane-life .bar {
  background: var(--muted);
}
.lane-other .bar {
  background: var(--border-ink);
  opacity: 0.5;
}
.day.today .lane-study .bar {
  background: var(--hero-ink);
}
.day.today .lane-life .bar {
  background: var(--hero-sub);
}
.day.today .lane-other .bar {
  background: var(--hero-ink);
  opacity: 0.45;
}
.bar.done {
  opacity: 0.4;
}
.bar.miss {
  background: var(--danger);
  opacity: 1;
}
.day-count {
  font-size: 13px;
  font-weight: 600;
}
.day-study {
  font-size: 11px;
  color: var(--muted);
}
.day.today .day-study {
  color: var(--hero-sub);
}
.day-main {
  font-size: 11px;
  line-height: 1.3;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.day.today .day-main {
  color: var(--hero-sub);
}
.day-done {
  margin-top: auto;
  font-size: 10px;
  color: var(--muted);
}
.day.today .day-done {
  color: var(--hero-sub);
}
.week-grid.loading {
  opacity: 0.6;
}
@media (max-width: 980px) {
  .week-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
