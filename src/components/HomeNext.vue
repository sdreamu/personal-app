<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { listAliveByDate, type Plan } from '@/db';
import { useDateStore } from '@/stores/date';
import { usePlanStore } from '@/stores/plan';
import { useSettingsStore } from '@/stores/settings';
import { useDoneFlash } from '@/composables/useDoneFlash';
import { addDays, logicalToday, minutesOfDay, pad2 } from '@/utils/date';

/**
 * 接下来（v5）：首页只回答一件事——现在该干什么。
 * 三行封顶：今天下一个时间块（可「开始」）、今天的无时间待办（可「完成」）、明天第一件。
 */
interface NextRow {
  key: string;
  when: string;
  title: string;
  action: 'start' | 'done' | null;
  plan: Plan | null;
}

const router = useRouter();
const settings = useSettingsStore();
const dateStore = useDateStore();
const planStore = usePlanStore();
const rows = ref<NextRow[]>([]);
/** N4 完成反馈：点「完成」时该行闪一下。 */
const doneFlash = useDoneFlash();

/** 时间块在前（按开始时间），无时间的排最后——首页只关心「下一件」。 */
function sortForHome(plans: readonly Plan[]): Plan[] {
  return [...plans].sort(
    (a, b) => (a.start_min ?? Number.MAX_SAFE_INTEGER) - (b.start_min ?? Number.MAX_SAFE_INTEGER),
  );
}

function hhmm(offsetMin: number): string {
  const safe = ((offsetMin % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

function span(plan: Plan): string {
  if (plan.start_min === null) return '无时间';
  if (plan.end_min === null) return hhmm(plan.start_min);
  return `${hhmm(plan.start_min)}–${hhmm(plan.end_min)}`;
}

async function load(): Promise<void> {
  const today = logicalToday(settings.dayStartMin);
  const tomorrow = addDays(today, 1);
  let todayPlans: Plan[] = [];
  let tomorrowPlans: Plan[] = [];
  try {
    todayPlans = await listAliveByDate('plans', today);
    tomorrowPlans = await listAliveByDate('plans', tomorrow);
  } catch {
    todayPlans = [];
    tomorrowPlans = [];
  }

  const undone = sortForHome(todayPlans.filter((plan) => !plan.done));
  const nowOffset = minutesOfDay(Date.now());
  const next: NextRow[] = [];

  const upcoming = undone.find((plan) => plan.start_min !== null && plan.start_min >= nowOffset) ?? null;
  const untimed = undone.find((plan) => plan.start_min === null) ?? null;
  if (upcoming !== null) {
    next.push({ key: upcoming.id, when: span(upcoming), title: upcoming.title, action: 'start', plan: upcoming });
  }
  if (untimed !== null) {
    next.push({ key: untimed.id, when: '无时间', title: untimed.title, action: 'done', plan: untimed });
  }
  if (upcoming === null) {
    const late = [...undone].reverse().find((plan) => plan.start_min !== null) ?? null;
    if (late !== null && (untimed === null || late.id !== untimed.id)) {
      next.push({ key: late.id, when: span(late), title: late.title, action: 'start', plan: late });
    }
  }
  const tomorrowFirst = sortForHome(tomorrowPlans)[0] ?? null;
  if (tomorrowFirst !== null) {
    const when = tomorrowFirst.start_min === null ? '明天' : `明天 ${hhmm(tomorrowFirst.start_min)}`;
    next.push({ key: `t-${tomorrowFirst.id}`, when, title: tomorrowFirst.title, action: null, plan: null });
  }
  rows.value = next.slice(0, 3);
}

function openPlan(): void {
  dateStore.setSelected(logicalToday(settings.dayStartMin));
  void router.push('/plan');
}

async function run(row: NextRow): Promise<void> {
  if (row.action === 'done' && row.plan !== null) {
    await planStore.toggleDone(row.plan);
    await load();
    return;
  }
  if (row.action === 'start') openPlan();
}

onMounted(() => {
  void load();
});

watch(() => settings.dayStartMin, () => void load());

/** 点「完成」：先播一次完成高亮，再走统一动作。 */
function runDone(row: NextRow): void {
  doneFlash.flash(row.key);
  run(row);
}
</script>

<template>
  <section class="next" data-test="home-next">
    <span class="panel-tab">接下来</span>
    <RouterLink class="next-more" to="/plan">日程 →</RouterLink>
    <ul v-if="rows.length > 0" class="next-list">
      <li
        v-for="(row, index) in rows"
        :key="row.key"
        class="next-row"
        :class="{ 'done-flash': doneFlash.isFlashing(row.key) }"
        :data-test="`next-row-${index}`"
      >
        <span class="next-when num">{{ row.when }}</span>
        <span class="next-title">
          <mark v-if="index === 0" class="hl">{{ row.title }}</mark>
          <template v-else>{{ row.title }}</template>
        </span>
        <span class="next-act">
          <button
            v-if="row.action === 'start'"
            type="button"
            class="primary-btn next-btn"
            :data-test="`next-start-${index}`"
            @click="run(row)"
          >
            开始
          </button>
          <button
            v-else-if="row.action === 'done'"
            type="button"
            class="ghost-btn next-btn"
            :data-test="`next-done-${index}`"
            @click="runDone(row)"
          >
            完成
          </button>
        </span>
      </li>
    </ul>
    <p v-else class="next-empty">今天没有待办了，去日程排一件。</p>
  </section>
</template>

<style scoped>
.next {
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
.next-more {
  position: absolute;
  top: 8px;
  right: 14px;
  font-size: 12px;
  color: var(--muted);
  text-decoration: none;
}
.next-more:hover {
  color: var(--text);
}
.next-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.next-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.next-row:last-child {
  border-bottom: none;
}
.next-when {
  font-size: 12px;
  color: var(--muted);
}
.next-title {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.next-btn {
  min-width: 62px;
  padding: 3px 10px;
  font-size: 12px;
}
.next-empty {
  margin: 6px 0 8px;
  font-size: 13px;
  color: var(--muted);
}
@media (max-width: 768px) {
  .next-row {
    grid-template-columns: 78px minmax(0, 1fr) auto;
  }
}
</style>
