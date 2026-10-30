<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { greeting } from '@/config/app';
import { useSettingsStore } from '@/stores/settings';
import { formatDateCN, logicalToday, pad2, parseDateKey, weekdayCN } from '@/utils/date';

/**
 * 首页问候（v5）：只负责「问候语 + 日期 + 星期 + 时间」这一组字，
 * 底色、边框、时间带都由 HomeView 的松绿场提供，所以这里没有背景。
 * 问候语来自设置页填的昵称（settings.nickname，见 config/app.ts 的 greeting）；
 * name 属性只在测试/预览时用来直接指定名字，平时留空。
 * 时间只到分钟：秒会跳，跳秒是仪表盘表演（见 docs/UI_GUIDE.md §3）。
 */
const props = withDefaults(defineProps<{ name?: string; dateKey?: string }>(), {
  name: '',
  dateKey: '',
});

const settings = useSettingsStore();
const nowMs = ref(Date.now());
let timerId: ReturnType<typeof setInterval> | null = null;

const dateKey = computed(() => props.dateKey || logicalToday(settings.dayStartMin, nowMs.value));

/** 昵称没设 / 老数据缺这个键时 greeting() 会退回「你好」。 */
const greetingText = computed(() => greeting(props.name || settings.data?.nickname));

const dateText = computed(() => {
  const key = dateKey.value;
  const d = parseDateKey(key);
  return d === null ? key : `${d.getFullYear()}年${formatDateCN(key)}`;
});

const weekdayText = computed(() => weekdayCN(dateKey.value));

const timeText = computed(() => {
  const d = new Date(nowMs.value);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
  <div class="home-hero" data-test="home-hero">
    <h1 class="hero-greeting" data-test="hero-greeting">{{ greetingText }}</h1>
    <p class="hero-meta">
      <span class="hero-date" data-test="hero-date">{{ dateText }}</span>
      <span class="hero-weekday">{{ weekdayText }}</span>
      <span class="hero-time num" data-test="hero-time">{{ timeText }}</span>
    </p>
  </div>
</template>

<style scoped>
.home-hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hero-greeting {
  margin: 0;
  font-size: clamp(30px, 3.4vw, 52px);
  line-height: 1.04;
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--hero-ink);
}
.hero-meta {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 0;
  font-size: 13px;
  color: var(--hero-sub);
}
.hero-weekday {
  color: var(--hero-sub);
}
.hero-time {
  font-size: 16px;
  font-weight: 600;
  color: var(--hero-ink);
}
</style>
