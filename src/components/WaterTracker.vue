<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_SETTINGS_VALUES } from '@/db';
import { useDietStore } from '@/stores/diet';
import { useSettingsStore } from '@/stores/settings';

/**
 * 喝水打卡（3a 饮食页顶部）：
 * +1 杯 / -1 杯写库（杯量来自设置，总量保底 0 ml）；
 * 圆点进度按“每满一杯亮一个圆点”整杯计，目标杯数为每日目标 / 杯量向上取整。
 */
const props = defineProps<{
  date: string;
}>();

const diet = useDietStore();
const settings = useSettingsStore();

const cupMl = computed(() => {
  const cup = settings.data?.cup_ml ?? DEFAULT_SETTINGS_VALUES.cup_ml;
  return Number.isFinite(cup) && cup > 0 ? cup : DEFAULT_SETTINGS_VALUES.cup_ml;
});
const goalMl = computed(() => {
  const goal = settings.data?.daily_water_ml ?? DEFAULT_SETTINGS_VALUES.daily_water_ml;
  return Number.isFinite(goal) && goal > 0 ? goal : DEFAULT_SETTINGS_VALUES.daily_water_ml;
});
const totalMl = computed(() => diet.waterTotalMl);
const cups = computed(() => diet.waterCups);
const goalCups = computed(() => Math.max(1, Math.ceil(goalMl.value / cupMl.value)));
const dotCount = computed(() => Math.max(cups.value, goalCups.value));

async function change(delta: 1 | -1): Promise<void> {
  try {
    await diet.addWater(props.date, delta);
  } catch {
    // 已由 store 提示
  }
}
</script>

<template>
  <div class="water-tracker settings-card" data-test="water-tracker">
    <div class="water-head">
      <h2 data-test="water-title">喝水</h2>
      <div class="water-btns">
        <button
          class="primary-btn"
          data-test="water-minus"
          :disabled="totalMl <= 0"
          @click="change(-1)"
        >
          -1 杯
        </button>
        <button
          class="primary-btn"
          data-test="water-plus"
          @click="change(1)"
        >
          +1 杯
        </button>
      </div>
    </div>

    <div class="water-summary" data-test="water-summary">
      <span class="water-total" data-test="water-total">{{ totalMl }} ml</span>
      <span class="hint" data-test="water-cups">{{ cups }} 杯（目标 {{ goalMl }} ml）</span>
    </div>

    <div class="water-dots" data-test="water-dots">
      <span
        v-for="index in dotCount"
        :key="index"
        class="dot"
        :class="{ lit: index <= cups }"
        data-test="water-dot"
      />
    </div>
  </div>
</template>

<style scoped>
.water-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.water-head h2 {
  margin: 0;
  margin-right: auto;
}
.water-btns {
  display: inline-flex;
  gap: 8px;
}
.water-summary {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 4px;
}
.water-total {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.water-dots {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--panel-2);
  border: 1px solid var(--border);
}
.dot.lit {
  background: var(--accent);
  border-color: var(--accent);
}
</style>
