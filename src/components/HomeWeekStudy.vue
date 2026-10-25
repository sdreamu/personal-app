<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { listAliveByDate, type StudyRecord } from '@/db';
import { summarizeWeekStudy } from '@/stores/home';
import { useSettingsStore } from '@/stores/settings';
import { addDays, logicalToday, weekStart, weekdayCN } from '@/utils/date';

/**
 * 本周学习（v5）：七根柱子，今天反白；底下是本周总时长 / 一周目标。
 * 只回答「这周学到什么程度了」，所以不画坐标轴、不标每根柱子的数字。
 */
interface DayBar {
  date: string;
  weekday: string;
  ratio: number;
  isToday: boolean;
  sec: number;
}

const settings = useSettingsStore();
const bars = ref<DayBar[]>([]);
const totalSec = ref(0);
const goalMin = ref(0);

const totalText = computed(() => {
  const minutes = Math.round(totalSec.value / 60);
  if (minutes === 0) return '0 分钟';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest} 分钟` : `${hours} 小时 ${rest} 分`;
});

const goalText = computed(() => {
  const hours = goalMin.value / 60;
  return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`;
});

async function load(): Promise<void> {
  const today = logicalToday(settings.dayStartMin);
  const start = weekStart(today);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const records: StudyRecord[] = [];
  for (const date of dates) {
    try {
      records.push(...(await listAliveByDate('study_records', date)));
    } catch {
      // 单天读失败就当那天没有记录，不影响整块渲染
    }
  }
  const summary = summarizeWeekStudy(records, dates, settings.data?.daily_study_min ?? 0);
  const peak = Math.max(...summary.days.map((day) => day.sec), 0);
  bars.value = summary.days.map((day) => ({
    date: day.date,
    weekday: weekdayCN(day.date).replace('周', ''),
    ratio: peak === 0 ? 0 : day.sec / peak,
    isToday: day.date === today,
    sec: day.sec,
  }));
  totalSec.value = summary.totalSec;
  goalMin.value = summary.goalMin;
}

onMounted(() => {
  void load();
});

watch(() => settings.dayStartMin, () => void load());
</script>

<template>
  <section class="week" data-test="home-week-study">
    <span class="panel-tab">本周学习</span>
    <div class="week-bars" role="img" :aria-label="`本周学习 ${totalText}`">
      <div
        v-for="bar in bars"
        :key="bar.date"
        class="week-col"
        :class="{ today: bar.isToday }"
        :data-test="`week-bar-${bar.date}`"
      >
        <span class="week-bar" :style="{ height: `${Math.max(4, Math.round(bar.ratio * 100))}%` }" />
        <span class="week-day">{{ bar.weekday }}</span>
      </div>
    </div>
    <p class="week-sum num">
      本周 {{ totalText }}
      <span class="week-goal">目标 {{ goalText }}</span>
    </p>
  </section>
</template>

<style scoped>
.week {
  position: relative;
  padding: 20px 16px 12px;
  background: var(--panel);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: 5px 5px 0 var(--slab);
}
.panel-tab {
  position: absolute;
  top: -14px;
  left: 12px;
  padding: 2px 10px;
  background: var(--text);
  color: var(--panel);
  border: var(--line-w) solid var(--border-ink);
  font-size: 12px;
  font-weight: 700;
}
.week-bars {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
  height: 92px;
  padding-top: 6px;
  border-bottom: var(--line-w) solid var(--border-ink);
}
.week-col {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  gap: 5px;
  height: 100%;
}
.week-bar {
  display: block;
  background: var(--accent-soft);
  border: 1px solid var(--border);
}
.week-col.today .week-bar {
  background: var(--text);
  border-color: var(--border-ink);
}
.week-day {
  font-size: 11px;
  text-align: center;
  color: var(--muted);
}
.week-col.today .week-day {
  color: var(--text);
  font-weight: 700;
}
.week-sum {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 0 0;
  font-size: 13px;
  font-weight: 600;
}
.week-goal {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
}
</style>
