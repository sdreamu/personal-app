<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { listAliveByDate, type Plan } from '@/db';
import { useDateStore } from '@/stores/date';
import { usePlanStore } from '@/stores/plan';
import { useSettingsStore } from '@/stores/settings';
import { addDays, formatDateCNWeekday, logicalToday, offsetToTime } from '@/utils/date';

interface DayColumn { date: string; plans: Plan[]; failed: boolean }
const router = useRouter();
const settings = useSettingsStore();
const dateStore = useDateStore();
const planStore = usePlanStore();
const selectedDate = ref(logicalToday(settings.dayStartMin));
const days = ref<DayColumn[]>(windowDates().map(date => ({ date, plans: [], failed: false })));
const loading = ref(true);
let loadVersion = 0;
const today = computed(() => logicalToday(settings.dayStartMin));
const selected = computed(() => days.value.find(day => day.date === selectedDate.value));
const preview = computed(() => (selected.value?.plans ?? []).slice(0, 3));
const finished = computed(() => selected.value?.plans.filter(plan => plan.done).length ?? 0);
const remaining = computed(() => Math.max(0, (selected.value?.plans.length ?? 0) - 3));

function windowDates(): string[] {
  const start = logicalToday(settings.dayStartMin);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index - 1));
}
async function load(): Promise<void> {
  const version = ++loadVersion;
  loading.value = true;
  const result = await Promise.all(windowDates().map(async date => {
    try {
      const plans = await listAliveByDate('plans', date);
      plans.sort((a, b) => Number(a.done) - Number(b.done)
        || (a.start_min ?? Infinity) - (b.start_min ?? Infinity)
        || a.created_at - b.created_at || a.id.localeCompare(b.id));
      return { date, plans, failed: false };
    } catch { return { date, plans: [], failed: true }; }
  }));
  if (version !== loadVersion) return;
  days.value = result;
  if (!result.some(day => day.date === selectedDate.value)) selectedDate.value = today.value;
  loading.value = false;
}
function openDay(): void {
  dateStore.setSelected(selectedDate.value);
  void router.push({ path: '/plan', query: { view: 'list' } });
}
function timeLabel(plan: Plan): string {
  return plan.start_min === null ? '待安排' : offsetToTime(plan.start_min, settings.dayStartMin);
}
onMounted(() => { void load(); });
watch(() => settings.dayStartMin, () => void load());
watch(() => planStore.plans, () => void load(), { deep: true });
</script>

<template>
  <section class="seven" data-test="home-seven-days" aria-labelledby="seven-title">
    <div class="seven-head">
      <h2 id="seven-title" class="seven-title">未来七天</h2>
      <RouterLink class="seven-more" to="/plan">看完整日程 →</RouterLink>
    </div>
    <div class="seven-grid" role="group" aria-label="选择预览日期">
      <button
        v-for="day in days" :key="day.date" type="button" class="day"
        :class="{ today: day.date === today, selected: day.date === selectedDate }"
        :aria-pressed="day.date === selectedDate"
        :aria-label="formatDateCNWeekday(day.date) + (day.failed ? '，加载失败' : '，' + day.plans.length + ' 件安排')"
        :aria-current="day.date === today ? 'date' : undefined"
        :data-test="'seven-day-' + day.date" @click="selectedDate = day.date"
      >
        <span class="day-weekday">{{ day.date === today ? '今' : formatDateCNWeekday(day.date).slice(-1) }}</span>
        <span class="day-date num">{{ day.date.slice(5).replace('-', '.') }}</span>
        <span class="day-count num">{{ day.failed ? '—' : day.plans.length + ' 件' }}</span>
      </button>
    </div>
    <div class="day-preview" aria-live="polite" :aria-busy="loading" data-test="seven-preview">
      <div class="preview-heading">
        <h3>{{ formatDateCNWeekday(selectedDate) }}</h3>
        <span v-if="!loading && !selected?.failed && selected?.plans.length" class="num">{{ finished }}/{{ selected.plans.length }} 已完成</span>
      </div>
      <p v-if="loading" class="preview-message" role="status">正在加载安排…</p>
      <div v-else-if="selected?.failed" role="alert" class="preview-error">
        <span>这一天的安排未能加载</span><button type="button" class="seven-more" @click="load">重试</button>
      </div>
      <p v-else-if="!preview.length" class="preview-message" data-test="seven-empty">这一天还没有安排</p>
      <template v-else>
        <ul class="preview-list">
          <li v-for="plan in preview" :key="plan.id" data-test="seven-preview-item">
            <button type="button" class="preview-row" :class="{ done: plan.done }" @click="openDay">
              <span class="preview-check" aria-hidden="true"><svg v-if="plan.done" viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg></span>
              <span class="preview-time num">{{ timeLabel(plan) }}</span>
              <span class="preview-title">{{ plan.title }}</span>
              <span class="preview-status">{{ plan.done ? '已完成' : '未完成' }}</span>
            </button>
          </li>
        </ul>
        <div class="preview-footer">
          <span class="preview-remaining">{{ remaining ? '还有 ' + remaining + ' 项' : '' }}</span>
          <button type="button" class="seven-more" data-test="seven-view-all" @click="openDay">查看当天全部 {{ selected?.plans.length }} 项 →</button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.seven { margin-top: 20px; padding: 18px; }
.seven-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.seven-title { margin: 0; font-size: 19px; }
.seven-more { display: inline-flex; align-items: center; min-height: 44px; padding: 0; border: none; background: transparent; color: var(--accent); font-size: 12px; text-decoration: none; cursor: pointer; }
.seven-grid { display: grid; grid-template-columns: repeat(7, minmax(44px, 1fr)); gap: 4px; overflow-x: auto; padding: 3px; margin: 0 -3px; }
.day { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 88px; border: none; border-radius: var(--radius); background: transparent; color: var(--text); cursor: pointer; }
.day-weekday { color: var(--muted); font-size: 12px; }
.day-date { font-size: 13px; font-weight: 600; }
.day-count { color: var(--muted); font-size: 10px; }
.day-preview { margin-top: 14px; border-top: 1px solid var(--border); padding-top: 14px; }
.preview-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.preview-heading h3 { margin: 0; font-size: 13px; font-weight: 600; }
.preview-heading > span, .preview-remaining { color: var(--muted); font-size: 11px; }
.preview-list { list-style: none; padding: 0; margin: 8px 0 0; }
.preview-list li + li { border-top: 1px solid var(--border); }
.preview-row { display: grid; grid-template-columns: 18px 48px minmax(0, 1fr) auto; gap: 8px; align-items: center; width: 100%; min-height: 52px; padding: 10px 0; border: none; background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.preview-check { display: grid; place-items: center; width: 16px; height: 16px; border: 1px solid var(--border); border-radius: 50%; color: var(--accent); }
.preview-check svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.preview-time, .preview-status { font-size: 11px; color: var(--muted); }
.preview-title { font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.preview-row.done .preview-title { color: var(--muted); text-decoration: line-through; }
.preview-row.done .preview-check { border-color: var(--accent); background: var(--accent-soft); }
.preview-message { margin: 16px 0 8px; color: var(--muted); font-size: 13px; }
.preview-footer, .preview-error { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.preview-error { color: var(--muted); font-size: 13px; }
@media (max-width: 350px) {
  .preview-row { grid-template-columns: 18px 44px minmax(0, 1fr); }
  .preview-status { grid-column: 3; font-size: 10px; }
}
</style>
