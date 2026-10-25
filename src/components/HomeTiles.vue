<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useHomeStore } from '@/stores/home';
import { formatDuration } from '@/utils/date';

/**
 * 松绿场右侧的四个目标数字（v5）：仍然取 home store 的既有聚合 getter，
 * 不额外查库；点一下跳对应页面。这里只有「标签 + 数字」，没有图标块。
 */
interface HomeTile {
  key: 'plan' | 'study' | 'water' | 'play';
  label: string;
  main: string;
  sub: string;
  route: string;
}

const router = useRouter();
const home = useHomeStore();

const tiles = computed<HomeTile[]>(() => {
  const { done, total } = home.planSummary;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;
  return [
    { key: 'plan', label: '待办完成率', main: `${done}/${total}`, sub: `完成率 ${rate}%`, route: '/plan' },
    {
      key: 'study',
      label: '学习时长',
      main: formatDuration(home.study.totalSec),
      sub: `目标 ${home.study.goalMin} 分钟`,
      route: '/study/timer',
    },
    {
      key: 'water',
      label: '喝水',
      main: `${home.water.totalMl} ml`,
      sub: `目标 ${home.water.goalMl} ml`,
      route: '/life/diet',
    },
    {
      key: 'play',
      label: '娱乐时长',
      main: `${home.play.usedMin} 分钟`,
      sub: `目标 ${home.play.limitMin} 分钟`,
      route: '/life/play',
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
      <span class="tile-label" :data-test="`tile-${tile.key}-label`">{{ tile.label }}</span>
      <span class="tile-main num" :data-test="`tile-${tile.key}-main`">{{ tile.main }}</span>
      <span class="tile-sub" :data-test="`tile-${tile.key}-sub`">{{ tile.sub }}</span>
    </button>
  </div>
</template>

<style scoped>
.home-tiles {
  display: flex;
  gap: 0;
  align-self: flex-end;
}
.home-tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 18px;
  min-width: 92px;
  text-align: left;
  background: none;
  border: none;
  border-left: 1px solid var(--field-tick);
  color: var(--hero-ink);
  cursor: pointer;
}
.home-tile:first-child {
  border-left: none;
}
.home-tile:hover .tile-main {
  color: var(--hero-sub);
}
.tile-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--hero-sub);
}
.tile-main {
  font-size: 17px;
  font-weight: 600;
  color: var(--hero-ink);
}
.tile-sub {
  font-size: 12px;
  color: var(--hero-sub);
}
@media (max-width: 980px) {
  .home-tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 0;
    align-self: stretch;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--field-tick);
  }
  .home-tile {
    padding: 4px 10px;
  }
  .home-tile:nth-child(odd) {
    padding-left: 0;
    border-left: none;
  }
}
</style>
