<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  clearAll,
  downloadBackup,
  errorMessage,
  importBackupObject,
  parseBackupJson,
  summarizeBackup,
  type BackupFile,
  type BackupSummary,
} from '@/db';
import BaseModal from '@/components/BaseModal.vue';
import CategoryManager from '@/components/CategoryManager.vue';
import ClearDataModal from '@/components/ClearDataModal.vue';
import { useSaveStatusStore } from '@/stores/saveStatus';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import { formatDateTimeCN, pad2 } from '@/utils/date';

const settings = useSettingsStore();
const saveStatus = useSaveStatusStore();
const toast = useToastStore();

/* ---------- 每日目标（输入防抖 300ms + change 立即提交） ---------- */
const goals = reactive({ study: 120, water: 2000, cup: 250, play: 60 });
const dayStartHour = ref(4);
const dayStartMinute = ref(0);
let hydrating = false;
let goalsDebounce: number | undefined;

function safeInt(value: unknown, min: number, fallback: number): number {
  const parsed = typeof value === 'number' ? Math.round(value) : Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function hydrateFromSettings(): void {
  const data = settings.data;
  if (!data) return;
  hydrating = true;
  goals.study = data.daily_study_min;
  goals.water = data.daily_water_ml;
  goals.cup = data.cup_ml;
  goals.play = data.daily_play_min;
  const parts = data.day_start.split(':');
  dayStartHour.value = Number(parts[0]);
  dayStartMinute.value = Number(parts[1]);
  hydrating = false;
}
watch(() => settings.data, hydrateFromSettings, { immediate: true });

function commitGoals(): void {
  if (hydrating || !settings.data) return;
  void settings
    .update({
      daily_study_min: safeInt(goals.study, 1, settings.data.daily_study_min),
      daily_water_ml: safeInt(goals.water, 1, settings.data.daily_water_ml),
      cup_ml: safeInt(goals.cup, 1, settings.data.cup_ml),
      daily_play_min: safeInt(goals.play, 1, settings.data.daily_play_min),
    })
    .catch(() => undefined);
}
watch(goals, () => {
  if (hydrating) return;
  window.clearTimeout(goalsDebounce);
  goalsDebounce = window.setTimeout(commitGoals, 300);
});

/* ---------- 一天起点（整点/半点；修改仅对新记录生效） ---------- */
const dayStart = computed(() => pad2(dayStartHour.value) + ':' + pad2(dayStartMinute.value));
watch([dayStartHour, dayStartMinute], () => {
  if (hydrating) return;
  void settings.update({ day_start: dayStart.value }).catch(() => undefined);
});

/* ---------- 外观 ---------- */
const theme = computed(() => settings.theme);
function setTheme(next: 'light' | 'dark'): void {
  if (next !== theme.value) void settings.update({ theme: next }).catch(() => undefined);
}

/* ---------- 数据管理 ---------- */
const lastBackupText = computed(() =>
  settings.data?.last_backup_at ? formatDateTimeCN(settings.data.last_backup_at) : '从未备份',
);

async function handleExport(): Promise<void> {
  try {
    saveStatus.begin();
    const { filename } = await downloadBackup();
    await settings.load();
    saveStatus.idle();
    toast.success('备份已导出：' + filename);
  } catch (err) {
    saveStatus.fail();
    toast.error('导出失败：' + errorMessage(err));
  }
}

const fileInput = ref<HTMLInputElement | null>(null);
const importPreview = ref<{ backup: BackupFile; summary: BackupSummary } | null>(null);

async function handleImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (input) input.value = '';
  if (!file) return;
  let text = '';
  try {
    text = await file.text();
  } catch {
    toast.error('无法读取所选文件');
    return;
  }
  const parsed = parseBackupJson(text);
  if (!parsed.ok) {
    toast.error('导入失败：' + parsed.reason + '（现有数据未改动）');
    return;
  }
  importPreview.value = { backup: parsed.backup, summary: summarizeBackup(parsed.backup) };
}

async function confirmImport(): Promise<void> {
  const preview = importPreview.value;
  if (!preview) return;
  try {
    saveStatus.begin();
    await downloadBackup(); // 覆盖前自动导出当前数据备份
    // Vue ref 会把 backup 变成响应式 Proxy，直接写入 IndexedDB 会触发 DataCloneError；
    // 先深拷贝为纯 JSON 对象再导入（行为与预期一致，仅修复导入在浏览器中的克隆失败）。
    await importBackupObject(JSON.parse(JSON.stringify(preview.backup))); // 事务性覆盖，保留原 id
    await settings.load();
    dataVersion.value += 1;
    importPreview.value = null;
    saveStatus.idle();
    toast.success('导入完成，数据已覆盖');
  } catch (err) {
    saveStatus.fail();
    toast.error('导入失败：' + errorMessage(err) + '（现有数据未改动）');
  }
}

/* ---------- 清空（二次确认 + 手动输入“清空”） ---------- */
const clearOpen = ref(false);
const dataVersion = ref(0);

async function confirmClear(): Promise<void> {
  try {
    saveStatus.begin();
    await clearAll();
    await settings.load();
    dataVersion.value += 1;
    clearOpen.value = false;
    saveStatus.idle();
    toast.success('已清空所有数据');
  } catch (err) {
    saveStatus.fail();
    toast.error('清空失败：' + errorMessage(err));
    throw err;
  }
}
</script>

<template>
  <section class="page settings-page" data-test="settings-page">
    <h1 class="page-title">设置</h1>

    <div class="settings-card">
      <h2>每日目标</h2>
      <div class="settings-grid">
        <label class="field">
          <span>学习时长目标（分钟）</span>
          <input v-model.number="goals.study" type="number" min="1" data-test="goal-study" @change="commitGoals" />
        </label>
        <label class="field">
          <span>喝水目标（ml）</span>
          <input v-model.number="goals.water" type="number" min="1" data-test="goal-water" @change="commitGoals" />
        </label>
        <label class="field">
          <span>每杯容量（ml）</span>
          <input v-model.number="goals.cup" type="number" min="1" data-test="goal-cup" @change="commitGoals" />
        </label>
        <label class="field">
          <span>娱乐额度（分钟）</span>
          <input v-model.number="goals.play" type="number" min="1" data-test="goal-play" @change="commitGoals" />
        </label>
      </div>
    </div>

    <div class="settings-card">
      <h2>一天的起点</h2>
      <div class="inline-row">
        <select v-model.number="dayStartHour" data-test="day-start-hour">
          <option v-for="h in 24" :key="h" :value="h - 1">{{ pad2(h - 1) }}</option>
        </select>
        <span>:</span>
        <select v-model.number="dayStartMinute" data-test="day-start-minute">
          <option :value="0">00</option>
          <option :value="30">30</option>
        </select>
        <p class="hint">凌晨 {{ dayStart }} 之前的时间计入前一天；修改只影响之后的新记录。</p>
      </div>
    </div>

    <div class="settings-card">
      <h2>分类管理</h2>
      <CategoryManager kind="plan_categories" title="计划分类" :refresh-key="dataVersion" />
      <CategoryManager kind="workout_types" title="训练类型" :refresh-key="dataVersion" />
      <CategoryManager kind="meal_types" title="餐次" :refresh-key="dataVersion" />
    </div>

    <div class="settings-card">
      <h2>外观</h2>
      <div class="segmented">
        <button class="seg-btn" :class="{ on: theme === 'light' }" data-test="theme-light" @click="setTheme('light')">
          浅色
        </button>
        <button class="seg-btn" :class="{ on: theme === 'dark' }" data-test="theme-dark" @click="setTheme('dark')">
          深色
        </button>
      </div>
    </div>

    <div class="settings-card">
      <h2>数据管理</h2>
      <p class="hint">上次备份时间：{{ lastBackupText }}</p>
      <div class="button-row">
        <button class="primary-btn" data-test="export-backup" @click="handleExport">导出备份</button>
        <button class="ghost-btn" data-test="import-backup" @click="fileInput?.click()">导入备份</button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden-file"
          data-test="import-file"
          @change="handleImportFile"
        />
        <button class="danger-btn" data-test="clear-data" @click="clearOpen = true">清空所有数据</button>
      </div>
      <p class="hint">
        清空需要二次确认并手动输入“清空”二字；建议先导出备份。导入会覆盖当前数据（覆盖前自动导出当前备份）。
      </p>
    </div>

    <ClearDataModal v-if="clearOpen" :on-confirm="confirmClear" @close="clearOpen = false" />

    <BaseModal v-if="importPreview" id="import-confirm-modal" title="导入备份确认" @close="importPreview = null">
      <div class="import-summary">
        <p>导入将<strong>覆盖当前全部数据</strong>，覆盖前会自动导出当前数据备份。</p>
        <p>备份导出时间：{{ formatDateTimeCN(importPreview.summary.exportedAt) }}</p>
        <ul>
          <li v-for="row in importPreview.summary.counts" :key="row.table">{{ row.table }}：{{ row.count }} 条</li>
        </ul>
      </div>
      <template #footer>
        <button class="ghost-btn" @click="importPreview = null">取消</button>
        <button class="danger-btn" data-test="confirm-import" @click="confirmImport">确认导入（覆盖）</button>
      </template>
    </BaseModal>
  </section>
</template>
