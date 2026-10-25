<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { listAliveByDate, type Plan } from '@/db';
import { useDateStore } from '@/stores/date';
import { useSettingsStore } from '@/stores/settings';
import { addDays, logicalToday, MINUTES_PER_DAY, weekdayCN } from '@/utils/date';

/**
 * 未来七天（v5）：今天前一天 → 今天后五天，一共 7 列。
 * 首页只给「这几天大概排了什么」：件数 + 形状；点某天跳日程页并把日期切过去。
 */
interface DayColumn {
  date: string;
  weekday: string;
  dayLabel: string;
  isToday: boolean;
  finished: number;
  total: number;
  main: string;
  bars: Array<{ left: string; width: string }>;
}

const router = useRouter();
const settings = useSettingsStore();
const dateStore = useDateStore();
const days = ref<DayColumn[]>([]);

function percent(offset: number): number {
  return Math.min(100, Math.max(0, (offset / MINUTES_PER_DAY) * 100));
}

function summarize(date: string, plans: readonly Plan[]): DayColumn {
  const timed = plans.filter((plan) => plan.start_min !== null && plan.end_min !== null);
  const first = plans.find((plan) => !plan.done) ?? plans[0] ?? null;
  return {
    date,
    weekday: weekdayCN(date).replace('周', ''),
    dayLabel: date.slice(5).replace('-', '.'),
    isToday: date === logicalToday(settings.dayStartMin),
    finished: plans.filter((plan) => plan.done).length,
    total: plans.length,
    main: first === null ? '还没有安排' : first.title,
    bars: timed.map((plan) => ({
      left: `${percent(plan.start_min ?? 0)}%`,
      width: `${Math.max(1.5, percent((plan.end_min ?? 0) - (plan.start_min ?? 0)))}%`,
    })),
  };
}

async function load(): Promise<void> {
  const today = logicalToday(settings.dayStartMin);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(today, index - 1));
  const result: DayColumn[] = [];
  for (const date of dates) {
    let plans: Plan[] = [];
    try {
      plans = await listAliveByDate('plans', date);
    } catch {
      plans = [];
    }
    result.push(summarize(date, plans));
  }
  days.value = result;
}

function openDay(date: string): void {
  dateStore.setSelected(date);
  void router.push('/plan');
}

onMounted(() => {
  void load();
});

watch(() => settings.dayStartMin, () => void load());
</script>

<template>
  <section class="seven" data-test="home-seven-days">
    <div class="seven-head">
      <h2 class="seven-title">未来七天</h2>
      <RouterLink class="seven-more" to="/plan">看完整日程 →</RouterLink>
    </div>
    <div class="seven-grid">
      <button
        v-for="day in days"
        :key="day.date"
        type="button"
        class="day"
        :class="{ today: day.isToday }"
        :data-test="`seven-day-${day.date}`"
        @click="openDay(day.date)"
      >
        <span class="day-when">
          <span class="day-weekday">{{ day.weekday }}</span>
          <span class="day-date num">{{ day.dayLabel }}</span>
        </span>
        <span class="day-shape" aria-hidden="true">
          <span v-for="(bar, index) in day.bars" :key="index" class="bar" :style="{ left: bar.left, width: bar.width }" />
        </span>
        <span class="day-count num">{{ day.total }} 件</span>
        <span class="day-main">{{ day.main }}</span>
        <span v-if="day.total > 0" class="day-done num">{{ day.finished }}/{{ day.total }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.seven {
  position: relative;
  margin: 26px 0 0;
  padding: 18px 16px 14px;
  background: var(--panel);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: 5px 5px 0 var(--slab);
}
.seven-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.seven-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.seven-more {
  font-size: 12px;
  color: var(--muted);
  text-decoration: none;
}
.seven-more:hover {
  color: var(--text);
}
.seven-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
}
.day {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 112px;
  padding: 9px 8px;
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
.day.today {
  background: var(--text);
  color: var(--panel);
}
.day.today:hover {
  background: var(--text);
}
.day-when {
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
.day-shape {
  position: relative;
  height: 14px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.day.today .day-shape {
  border-color: var(--field-tick);
}
.bar {
  position: absolute;
  top: 3px;
  height: 6px;
  background: var(--accent);
}
.day.today .bar {
  background: var(--hero-ink);
}
.day-count {
  font-size: 13px;
  font-weight: 600;
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
@media (max-width: 980px) {
  .seven-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
