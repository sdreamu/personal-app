<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import EmptyState from '@/components/EmptyState.vue';
import MealSection from '@/components/MealSection.vue';
import WaterTracker from '@/components/WaterTracker.vue';
import { errorMessage } from '@/db';
import { useDateStore } from '@/stores/date';
import { useDietStore } from '@/stores/diet';
import { useToastStore } from '@/stores/toast';

/**
 * 饮食页 #/life/diet（PRD §5.5 / AC-40~42）：
 * 四餐分区（早/午/晚/加餐 + 设置里自定义餐次）+ 常吃快捷项 +
 * 复制昨天这一餐 + 喝水打卡；读/写全部跟随 dateStore.selectedDate（可补记任意日期）。
 * 页面只负责按餐次渲染与空状态引导，业务动作集中在 useDietStore。
 */
const dateStore = useDateStore();
const diet = useDietStore();
const toast = useToastStore();

const selectedDate = computed(() => dateStore.selectedDate);
const sections = computed(() => diet.mealSections);
const firstMealKey = computed(() => sections.value[0]?.key ?? null);
const openMealKey = ref<string | null>(null);
const isEmpty = computed(
  () => !diet.loading && diet.loadedDate === selectedDate.value && diet.meals.length === 0,
);

async function load(): Promise<void> {
  try {
    await diet.loadMealData(selectedDate.value);
  } catch (err) {
    toast.error(`加载饮食数据失败：${errorMessage(err)}`);
  }
}

watch(
  () => dateStore.selectedDate,
  () => {
    openMealKey.value = null;
    void load();
  },
);

onMounted(() => {
  void load();
});

/** 空状态主按钮：打开第一个餐次分区的输入行。 */
function startFirstMeal(): void {
  if (firstMealKey.value !== null) openMealKey.value = firstMealKey.value;
}
</script>

<template>
  <section class="page diet-page" data-test="diet-view">
    <h1 class="page-title">饮食</h1>

    <WaterTracker :date="selectedDate" />

    <div v-if="diet.loading && diet.loadedDate === null" class="hint" data-test="diet-loading">
      正在加载饮食数据…
    </div>

    <EmptyState
      v-else-if="isEmpty && openMealKey === null"
      title="这一天还没有饮食记录"
      description="先记下第一餐，或者点 +1 杯喝口水"
      action-label="+ 新增第一条"
      icon="🍽"
      data-test="diet-empty"
      @action="startFirstMeal"
    />

    <div v-else class="meal-sections" data-test="meal-sections">
      <MealSection
        v-for="section in sections"
        :key="section.key"
        :date="selectedDate"
        :meal-key="section.key"
        :meal-name="section.name"
        :open="openMealKey === section.key"
        @update:open="(value) => (openMealKey = value ? section.key : null)"
      />
    </div>
  </section>
</template>

<style scoped>
.meal-sections {
  display: flex;
  flex-direction: column;
}
</style>
