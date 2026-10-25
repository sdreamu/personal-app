<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Plan } from '@/db';
import { useHomeStore } from '@/stores/home';
import { useSettingsStore } from '@/stores/settings';
import { MINUTES_PER_DAY, minutesOfDay, offsetToTime, pad2 } from '@/utils/date';

/**
 * 首页粗时间带（v5）：一条 24 小时横带里放今天大约 5–6 件事。
 * 只表达「一天长什么形状」，详细排布在日程页；轴的范围跟着设置里的一天起点走。
 * 状态语法见 docs/UI_GUIDE.md §7：已完成实块 / 进行中带光标 / 逾期朱砂 / 未到描边。
 */
const home = useHomeStore();
const settings = useSettingsStore();

const nowMs = ref(Date.now());
let timerId: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timerId = setInterval(() => {
    nowMs.value = Date.now();
  }, 30000);
});

onUnmounted(() => {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
});

/** 现在落在一天里的第几分钟（相对一天起点）。 */
const nowOffset = computed(() => {
  const raw = minutesOfDay(nowMs.value) - settings.dayStartMin;
  return ((raw % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
});

const nowText = computed(() => {
  const d = new Date(nowMs.value);
  return `现在 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
});

const nowLeft = computed(() => percent(nowOffset.value));

interface BandBlock {
  id: string;
  title: string;
  time: string;
  lane: number;
  left: string;
  width: string;
  state: 'done' | 'cur' | 'miss' | 'next';
}

function percent(offset: number): number {
  return Math.min(100, Math.max(0, (offset / MINUTES_PER_DAY) * 100));
}

/** 时间块按开始时间排；重叠的塞到第二排，最多两排（粗带只给形状，不给细节）。 */
const blocks = computed<BandBlock[]>(() => {
  const timed = home.plans
    .filter((plan): plan is Plan & { start_min: number; end_min: number } =>
      plan.start_min !== null && plan.end_min !== null && plan.end_min > plan.start_min,
    )
    .sort((a, b) => a.start_min - b.start_min);

  const laneEnds: number[] = [];
  return timed.map((plan) => {
    let lane = laneEnds.findIndex((end) => end <= plan.start_min);
    if (lane === -1) lane = Math.min(laneEnds.length, 1);
    laneEnds[lane] = plan.end_min;

    const isNow = plan.start_min <= nowOffset.value && nowOffset.value < plan.end_min;
    const state: BandBlock['state'] = plan.done
      ? 'done'
      : isNow
        ? 'cur'
        : plan.end_min <= nowOffset.value
          ? 'miss'
          : 'next';

    return {
      id: plan.id,
      title: plan.title,
      time: offsetToTime(plan.start_min, settings.dayStartMin),
      lane,
      left: `${percent(plan.start_min)}%`,
      width: `${Math.max(2, percent(plan.end_min - plan.start_min))}%`,
      state,
    };
  });
});

const laneCount = computed(() => (blocks.value.some((block) => block.lane === 1) ? 2 : 1));

/** 每 4 小时一个刻度，刻度值跟着一天起点走。 */
const ticks = computed(() =>
  [0, 240, 480, 720, 960, 1200, 1440].map((offset) => ({
    offset,
    left: `${percent(offset)}%`,
    label: offsetToTime(offset, settings.dayStartMin),
  })),
);
</script>

<template>
  <div class="band" data-test="home-band">
    <div class="band-ruler" aria-hidden="true">
      <span
        v-for="tick in ticks"
        :key="tick.offset"
        class="band-tick"
        :class="{ edge: tick.offset === 0 || tick.offset === 1440 }"
        :style="{ left: tick.left }"
      >
        {{ tick.offset === 1440 ? '' : tick.label }}
      </span>
    </div>

    <div class="band-lanes" :class="laneCount === 2 ? 'two' : 'single'">
      <span
        v-for="tick in ticks"
        :key="`grid-${tick.offset}`"
        class="band-grid"
        :style="{ left: tick.left }"
        aria-hidden="true"
      />
      <button
        v-for="block in blocks"
        :key="block.id"
        type="button"
        class="ev"
        :class="[block.state, block.lane === 1 ? 'lane-b' : 'lane-a']"
        :style="{ left: block.left, width: block.width }"
        :data-test="`band-event-${block.id}`"
        :title="`${block.time} ${block.title}`"
      >
        <span class="ev-time num">{{ block.time }}</span>
        <span class="ev-title">{{ block.state === 'miss' ? `${block.title} · 没做` : block.title }}</span>
        <span v-if="block.state === 'cur'" class="nowline" aria-hidden="true" />
      </button>
      <div class="now" :style="{ left: `${nowLeft}%` }">
        <span class="now-label num" :class="{ flip: nowLeft > 78 }">{{ nowText }}</span>
      </div>
      <p v-if="blocks.length === 0" class="band-empty">今天还没有排事</p>
    </div>
  </div>
</template>

<style scoped>
.band {
  position: relative;
  padding: 6px 0 0;
}
.band-ruler {
  position: relative;
  height: 14px;
  margin: 0 0 4px;
}
.band-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--field-sub);
}
.band-tick.edge:first-child {
  transform: none;
}
.band-tick.edge:last-child {
  transform: translateX(-100%);
}
.band-lanes {
  position: relative;
  height: 74px;
  border-top: 1px solid var(--field-tick);
  border-bottom: 1px solid var(--field-tick);
}
.band-lanes.two {
  height: 88px;
}
.band-grid {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--field-tick);
  opacity: 0.6;
}
.ev {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  padding: 6px 7px;
  text-align: left;
  background: none;
  color: var(--hero-ink);
  border: 1px solid var(--hero-ink);
  border-radius: var(--radius);
  cursor: pointer;
}
.band-lanes.single .ev.lane-a {
  top: 6px;
  height: 60px;
}
.ev.lane-a {
  top: 6px;
  height: 30px;
}
.ev.lane-b {
  top: 44px;
  height: 26px;
}
.ev.done {
  background: var(--hero-ink);
  color: var(--field);
}
.ev.done .ev-time {
  color: var(--field-sub);
}
.ev.next {
  background: none;
  color: var(--hero-ink);
  border-color: var(--field-sub);
  border-style: dashed;
}
.ev.cur {
  background: var(--hero-ink);
  color: var(--field);
  box-shadow: 3px 3px 0 var(--field-2);
}
.ev.cur .ev-time {
  color: var(--field-sub);
}
.ev.miss {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--hero-ink);
}
.ev.lane-b {
  padding-top: 3px;
  padding-bottom: 3px;
}
.ev-time {
  font-size: 10px;
  line-height: 1;
  color: var(--field-sub);
}
.ev-title {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ev.lane-b .ev-title {
  font-size: 11px;
  font-weight: 500;
}
.nowline {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  background: var(--field);
  opacity: 0.8;
}
.now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--hero-ink);
}
.now-label {
  position: absolute;
  top: -14px;
  left: 0;
  transform: translateX(-1px);
  white-space: nowrap;
  font-size: 10px;
  font-weight: 700;
  color: var(--hero-ink);
}
.now-label.flip {
  left: auto;
  right: 7px;
  transform: none;
}
.band-empty {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  margin: 0;
  font-size: 12px;
  color: var(--field-sub);
}
@media (max-width: 980px) {
  .band-lanes {
    height: 60px;
  }
  .ev.lane-a {
    top: 4px;
  }
  .ev.lane-b {
    top: 34px;
    height: 22px;
  }
}
</style>
