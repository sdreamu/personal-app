<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Meal } from '@/db';
import { FEELING_LABELS, QUICK_MEAL_LIMIT, useDietStore, type MealFeeling } from '@/stores/diet';

/**
 * 单个餐次分区（3a 饮食页）：
 * 常吃快捷标签（本餐次历史频次前 8）/ 一行输入回车添加 / 编辑与删除（软删除 + 撤销由 store 处理）/
 * 复制昨天这一餐。所有写操作走 useDietStore，页面只负责按餐次渲染。
 */
const props = defineProps<{
  date: string;
  mealKey: string;
  mealName: string;
  open: boolean;
}>();

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const diet = useDietStore();

const items = computed(() => diet.mealsFor(props.mealKey));
const quickItems = computed(() => diet.topFrequentItems(props.mealKey, QUICK_MEAL_LIMIT));

const draft = ref('');
const copying = ref(false);
const editingId = ref<string | null>(null);
const editText = ref('');
const editFeeling = ref<'' | NonNullable<MealFeeling>>('');

async function addDraft(): Promise<void> {
  const text = draft.value.trim();
  if (text === '') return;
  try {
    await diet.addMealItem(props.date, props.mealKey, props.mealName, text);
    draft.value = '';
  } catch {
    // 已由 store 提示
  }
}

async function quickAdd(text: string): Promise<void> {
  try {
    await diet.addMealItem(props.date, props.mealKey, props.mealName, text);
  } catch {
    // 已由 store 提示
  }
}

function startEdit(meal: Meal): void {
  editingId.value = meal.id;
  editText.value = meal.text;
  editFeeling.value = meal.feeling ?? '';
}

async function saveEdit(id: string): Promise<void> {
  const text = editText.value.trim();
  if (text === '') return;
  try {
    await diet.updateMealItem(id, {
      text,
      feeling: editFeeling.value === '' ? null : editFeeling.value,
    });
    editingId.value = null;
  } catch {
    // 已由 store 提示
  }
}

function cancelEdit(): void {
  editingId.value = null;
}

async function remove(meal: Meal): Promise<void> {
  try {
    await diet.softDeleteMeal(meal);
  } catch {
    // 已由 store 提示
  }
}

async function copyYesterday(): Promise<void> {
  if (copying.value) return;
  copying.value = true;
  try {
    await diet.copyYesterdayMeal(props.mealKey);
  } catch {
    // 已由 store 提示
  } finally {
    copying.value = false;
  }
}

function feelingLabel(feeling: NonNullable<MealFeeling>): string {
  return FEELING_LABELS[feeling];
}
</script>

<template>
  <section class="meal-section settings-card" data-test="meal-section" :data-testid="'meal-section-' + mealKey">
    <header class="meal-head">
      <h2 data-test="meal-name">{{ mealName }}</h2>
      <button
        class="ghost-btn"
        data-test="copy-meal"
        :disabled="copying"
        title="把前一天这一餐的全部内容复制过来"
        @click="copyYesterday"
      >
        复制昨天这一餐
      </button>
      <button
        class="primary-btn"
        data-test="toggle-input"
        @click="emit('update:open', !open)"
      >
        {{ open ? '收起' : '+ 添加' }}
      </button>
    </header>

    <div v-if="quickItems.length > 0" class="quick-row" data-test="quick-row">
      <span class="hint">常吃：</span>
      <button
        v-for="text in quickItems"
        :key="text"
        class="chip"
        data-test="quick-item"
        @click="quickAdd(text)"
      >
        {{ text }}
      </button>
    </div>

    <div v-if="open" class="add-row" data-test="add-row">
      <input
        v-model="draft"
        class="text-input"
        data-test="meal-input"
        placeholder="输入一行文字，按回车添加"
        @keydown.enter.prevent="addDraft"
      />
      <button class="primary-btn" data-test="meal-add-btn" @click="addDraft">✓</button>
    </div>

    <ul class="meal-list" data-test="meal-list">
      <li v-for="meal in items" :key="meal.id" class="meal-item" data-test="meal-item">
        <template v-if="editingId === meal.id">
          <input
            v-model="editText"
            class="text-input"
            data-test="meal-edit-input"
            @keydown.enter.prevent="saveEdit(meal.id)"
          />
          <select v-model="editFeeling" data-test="meal-edit-feeling">
            <option value="">未设置</option>
            <option value="full">吃饱</option>
            <option value="not_full">没吃饱</option>
            <option value="overeat">吃多了</option>
          </select>
          <button class="primary-btn" data-test="meal-edit-save" @click="saveEdit(meal.id)">保存</button>
          <button class="ghost-btn" data-test="meal-edit-cancel" @click="cancelEdit">取消</button>
        </template>
        <template v-else>
          <span class="meal-text" data-test="meal-text">{{ meal.text }}</span>
          <span v-if="meal.feeling" class="badge" data-test="meal-feeling">
            {{ feelingLabel(meal.feeling) }}
          </span>
          <span class="meal-ops">
            <button class="ghost-btn" data-test="meal-edit" @click="startEdit(meal)">编辑</button>
            <button class="danger-btn" data-test="meal-delete" @click="remove(meal)">删除</button>
          </span>
        </template>
      </li>
      <li v-if="items.length === 0" class="hint" data-test="meal-empty">还没有记录，点“+ 添加”记一餐</li>
    </ul>
  </section>
</template>

<style scoped>
.meal-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.meal-head h2 {
  margin: 0;
  margin-right: auto;
}
.quick-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.chip {
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 13px;
}
.chip:hover {
  opacity: 0.85;
}
.add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.meal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meal-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  background: var(--panel);
}
.meal-text {
  flex: 1;
  min-width: 120px;
  overflow-wrap: anywhere;
}
.meal-ops {
  display: inline-flex;
  gap: 6px;
}
.meal-ops .ghost-btn,
.meal-ops .danger-btn {
  padding: 3px 10px;
  font-size: 13px;
}
.meal-item .text-input {
  flex: 1;
  min-width: 140px;
}
.meal-item select {
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 8px;
  padding: 6px 8px;
}
</style>
