<script setup lang="ts">
import { onMounted, watch } from 'vue';
import HomeCards from '@/components/HomeCards.vue';
import HomeHero from '@/components/HomeHero.vue';
import HomeHintBar from '@/components/HomeHintBar.vue';
import HomeTiles from '@/components/HomeTiles.vue';
import { useDateStore } from '@/stores/date';
import { useHomeStore } from '@/stores/home';
import { useSettingsStore } from '@/stores/settings';

/**
 * 首页（4a）：只读汇总今天。打开首页即把顶栏日期切回今天，
 * 内容始终按“今天”聚合，不随顶栏日期变化。
 * 版面：左上主视觉（问候/日期/时间）→ 4 个今日数据方块 → 提示条 → 六张汇总卡片。
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

// 一天起点修改会影响“今天”与时间轴偏移，切回首页后按新起点重算。
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
    <div class="home-top">
      <HomeHero />
      <HomeTiles />
    </div>
    <HomeHintBar />
    <HomeCards />
  </section>
</template>

<style scoped>
.home-top {
  display: grid;
  gap: 14px;
  margin-bottom: 14px;
}
</style>
