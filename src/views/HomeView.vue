<script setup lang="ts">
import { onMounted, watch } from 'vue';
import HomeCards from '@/components/HomeCards.vue';
import HomeDayBand from '@/components/HomeDayBand.vue';
import HomeHero from '@/components/HomeHero.vue';
import HomeHintBar from '@/components/HomeHintBar.vue';
import HomeNext from '@/components/HomeNext.vue';
import HomeSevenDays from '@/components/HomeSevenDays.vue';
import HomeTiles from '@/components/HomeTiles.vue';
import HomeWeekStudy from '@/components/HomeWeekStudy.vue';
import { useDateStore } from '@/stores/date';
import { useHomeStore } from '@/stores/home';
import { useSettingsStore } from '@/stores/settings';

/**
 * 首页（v5）：一屏只讲「今天大概什么样」。
 * 版面：松绿场（问候 + 四个目标 + 一条粗时间带）→ 提示条 → 接下来 / 本周学习 → 未来七天 → 各模块一句话状态。
 * 打开首页即把顶栏日期切回今天，内容始终按「今天」聚合，不随顶栏日期变化。
 */
const home = useHomeStore();
const dateStore = useDateStore();
const settings = useSettingsStore();

async function ensureLoaded(): Promise<void> {
  dateStore.goToday();
  if (!settings.loaded) {
    try {
      await settings.load();
    } catch {
      // 数据库不可用时保持空态，避免控制台红错
    }
  }
  try {
    await home.load();
  } catch {
    // 同上：首页聚合失败时保持空态
  }
}

onMounted(() => {
  void ensureLoaded();
});

// 一天起点修改会影响「今天」与时间轴偏移，切回首页后按新起点重算。
watch(
  () => settings.dayStartMin,
  () => {
    dateStore.goToday();
    void home.load();
  },
);
</script>

<template>
  <section class="page home-page" data-test="home-view">
    <section class="home-field" data-test="home-field">
      <div class="home-field-top">
        <HomeHero />
        <HomeTiles />
      </div>
      <div class="home-shelf">
        <HomeDayBand />
      </div>
    </section>

    <HomeHintBar />
    <div class="home-pair">
      <HomeNext />
      <HomeWeekStudy />
    </div>
    <HomeSevenDays />
    <HomeCards />
  </section>
</template>

<style scoped>
.home-page {
  max-width: 1280px;
}
.home-field {
  position: relative;
  margin: 0 0 24px;
  padding: 22px 26px 0;
  background: var(--field);
  color: var(--hero-ink);
  border: var(--line-w) solid var(--border-ink);
  box-shadow:
    7px 7px 0 var(--slab),
    14px 14px 0 var(--border-ink);
}
.home-field::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 1px solid var(--field-tick);
  pointer-events: none;
}
.home-field-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 18px;
}
.home-pair {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 18px;
  margin-top: 26px;
}
@media (max-width: 980px) {
  .home-pair {
    grid-template-columns: 1fr;
  }
}
.home-shelf {
  position: relative;
  margin: 0 -26px;
  padding: 10px 26px 12px;
  background: var(--field-2);
  border-top: 1px solid var(--field-tick);
}
@media (max-width: 980px) {
  .home-field {
    padding: 16px 16px 0;
    box-shadow:
      4px 4px 0 var(--slab),
      8px 8px 0 var(--border-ink);
  }
  .home-field-top {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }
  .home-shelf {
    margin: 0 -16px;
    padding: 8px 16px 10px;
  }
}
</style>
