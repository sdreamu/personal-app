<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { formatDateCN, logicalToday, pad2, parseDateKey, weekdayCN } from '@/utils/date';

/**
 * 首页左上主视觉：问候语 + 中文日期 + 每秒刷新的实时时间。
 * 日期按“一天起点”取逻辑日期，与首页其余聚合口径一致；卸载时清定时器。
 */
const props = withDefaults(defineProps<{ name?: string; dateKey?: string }>(), {
  name: 'Evan',
  dateKey: '',
});

const settings = useSettingsStore();
const nowMs = ref(Date.now());
let timerId: ReturnType<typeof setInterval> | null = null;

const dateKey = computed(() => props.dateKey || logicalToday(settings.dayStartMin, nowMs.value));

const dateText = computed(() => {
  const key = dateKey.value;
  const d = parseDateKey(key);
  return d === null ? key : `${d.getFullYear()}年${formatDateCN(key)} ${weekdayCN(key)}`;
});

const timeText = computed(() => {
  const d = new Date(nowMs.value);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
});

onMounted(() => {
  timerId = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
});
</script>

<template>
  <section class="home-hero" data-test="home-hero">
    <p class="hero-kicker">今天</p>
    <h1 class="hero-greeting" data-test="hero-greeting">你好，{{ name }}</h1>
    <div class="hero-meta">
      <span class="hero-date" data-test="hero-date">{{ dateText }}</span>
      <span class="hero-divider" aria-hidden="true">·</span>
      <span class="hero-time" data-test="hero-time">{{ timeText }}</span>
    </div>
    <svg class="hero-deco" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="33" />
      <path d="M60 9v13M60 98v13M9 60h13M98 60h13M23 23l9 9M88 88l9 9M97 23l-9 9M32 88l-9 9" />
    </svg>
  </section>
</template>

<style scoped>
.home-hero {
  position: relative;
  overflow: hidden;
  padding: 28px;
  border: none;
  border-radius: var(--radius-card);
  background: var(--hero-bg);
  color: var(--hero-ink);
}
.hero-kicker {
  margin: 0 0 4px;
  font-size: 13px;
  letter-spacing: 0.18em;
  color: var(--hero-sub);
}
.hero-greeting {
  margin: 0 0 12px;
  font-size: clamp(26px, 4.2vw, 40px);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--hero-ink);
}
.hero-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.hero-date {
  font-size: 15px;
  color: var(--hero-sub);
  font-weight: 600;
}
.hero-divider {
  color: var(--hero-sub);
}
.hero-time {
  font-size: 20px;
  font-weight: 700;
  color: var(--hero-ink);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.hero-deco {
  position: absolute;
  top: -26px;
  right: -18px;
  width: 172px;
  height: 172px;
  fill: none;
  stroke: var(--hero-ink);
  stroke-width: 2.5;
  stroke-linecap: round;
  opacity: 0.18;
  pointer-events: none;
}
@media (max-width: 720px) {
  .home-hero {
    padding: 20px;
  }
  .hero-deco {
    width: 132px;
    height: 132px;
    top: -18px;
  }
}
</style>
