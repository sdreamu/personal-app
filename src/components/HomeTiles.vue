<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useHomeStore } from '@/stores/home';
import { formatDuration } from '@/utils/date';

/** 首页 4 个今日数据方块：全部取 home store 的既有聚合 getter，不额外查库，点击跳对应页面。 */
interface HomeTile {
  key: 'plan' | 'study' | 'water' | 'play';
  label: string;
  main: string;
  sub: string;
  route: string;
  icon: string;
}

const router = useRouter();
const home = useHomeStore();

const tiles = computed<HomeTile[]>(() => {
  const { done, total } = home.planSummary;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;
  return [
    {
      key: 'plan',
      label: '待办完成率',
      main: `${done}/${total}`,
      sub: `完成率 ${rate}%`,
      route: '/plan',
      icon: 'M5 12.5l4.5 4.5L19 7.5',
    },
    {
      key: 'study',
      label: '学习时长',
      main: formatDuration(home.study.totalSec),
      sub: `目标 ${home.study.goalMin} 分钟`,
      route: '/study/timer',
      icon: 'M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-3.4-6.5 3.4v-16a1 1 0 0 1 1-1z',
    },
    {
      key: 'water',
      label: '喝水',
      main: `${home.water.totalMl} ml`,
      sub: `目标 ${home.water.goalMl} ml`,
      route: '/life/diet',
      icon: 'M12 3.2s6 6.6 6 10.6a6 6 0 0 1-12 0c0-4 6-10.6 6-10.6z',
    },
    {
      key: 'play',
      label: '娱乐时长',
      main: `${home.play.usedMin} 分钟`,
      sub: `目标 ${home.play.limitMin} 分钟`,
      route: '/life/play',
      icon: 'M9 5.5v13l10-6.5z',
    },
  ];
});

function go(route: string): void {
  void router.push(route);
}
</script>

<template>
  <div class="home-tiles" data-test="home-tiles">
    <button
      v-for="tile in tiles"
      :key="tile.key"
      type="button"
      class="home-tile"
      :data-test="`tile-${tile.key}`"
      @click="go(tile.route)"
    >
      <svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="tile.icon" />
      </svg>
      <span class="tile-label" :data-test="`tile-${tile.key}-label`">{{ tile.label }}</span>
      <span class="tile-main" :data-test="`tile-${tile.key}-main`">{{ tile.main }}</span>
      <span class="tile-sub" :data-test="`tile-${tile.key}-sub`">{{ tile.sub }}</span>
    </button>
  </div>
</template>

<style scoped>
.home-tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.home-tile {
  aspect-ratio: 1 / 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 3px;
  padding: 16px;
  text-align: left;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  cursor: pointer;
}
.home-tile:hover {
  border-color: var(--accent);
  background: var(--panel-2);
}
.tile-icon {
  width: 22px;
  height: 22px;
  margin-bottom: 4px;
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tile-label {
  font-size: 13px;
  color: var(--muted);
}
.tile-main {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}
.tile-sub {
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 720px) {
  .home-tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .home-tile {
    padding: 12px;
  }
  .tile-main {
    font-size: 17px;
  }
}
</style>
