<script setup lang="ts">
import { computed, ref } from 'vue';
import BaseModal from '@/components/BaseModal.vue';
import { errorMessage, type PlayRecord } from '@/db';
import { useDateStore } from '@/stores/date';
import { usePlayStore } from '@/stores/play';

/**
 * 娱乐记录区（3c）：今日额度进度条 + 本周累计 + 手动补记/编辑/删除。
 * 手动补记生成 source='manual'；删除走软删除 + 5 秒撤销（store 内 toast）。
 */
const dateStore = useDateStore();
const playStore = usePlayStore();

const showForm = ref(false);
const editingId = ref<string | null>(null);
const formContent = ref('');
const formMinutes = ref('');
const formDate = ref(dateStore.selectedDate);
const formError = ref('');

const selectedDate = computed(() => dateStore.selectedDate);
const quota = computed(() => playStore.quotaState(selectedDate.value));
const weekMinutes = computed(() => playStore.weekTotal(selectedDate.value));
const percent = computed(() => {
  if (quota.value.limit <= 0) return 0;
  return Math.min(100, Math.round((quota.value.used / quota.value.limit) * 100));
});
const records = computed(() => playStore.records);
const modalTitle = computed(() => (editingId.value === null ? '手动补记' : '编辑娱乐记录'));

function openAdd(): void {
  editingId.value = null;
  formContent.value = '';
  formMinutes.value = '';
  formDate.value = dateStore.selectedDate;
  formError.value = '';
  showForm.value = true;
}

function openEdit(record: PlayRecord): void {
  editingId.value = record.id;
  formContent.value = record.content;
  formMinutes.value = String(record.minutes);
  formDate.value = record.date;
  formError.value = '';
  showForm.value = true;
}

async function saveForm(): Promise<void> {
  formError.value = '';
  try {
    const input = { content: formContent.value, minutes: Number(formMinutes.value), date: formDate.value };
    if (editingId.value === null) {
      await playStore.manualAdd(input);
    } else {
      await playStore.editPlay(editingId.value, input);
    }
    showForm.value = false;
  } catch (err) {
    formError.value = errorMessage(err);
  }
}
</script>

<template>
  <section class="settings-card" data-test="play-record-list">
    <div class="quota-block" data-test="quota-block">
      <div class="quota-head">
        <h2>今日娱乐额度</h2>
        <span data-test="quota-text">
          已用 {{ quota.used }} / {{ quota.limit }} 分钟 · 剩余 {{ quota.remaining }} 分钟
        </span>
      </div>
      <div class="progress-track" data-test="progress-track">
        <div
          class="progress-bar"
          :class="{ over: quota.over }"
          :style="{ width: percent + '%' }"
          data-test="progress-bar"
        ></div>
      </div>
      <p v-if="quota.over" class="danger-text" data-test="quota-over-hint">今日娱乐额度已用完</p>
      <p class="hint" data-test="week-total">本周累计娱乐时长：{{ weekMinutes }} 分钟</p>
    </div>

    <div class="list-head">
      <h2>娱乐记录</h2>
      <button class="primary-btn" data-test="open-form-btn" @click="openAdd">手动补记</button>
    </div>

    <p v-if="playStore.loading" class="hint" data-test="list-loading">正在加载…</p>
    <p v-else-if="records.length === 0" class="hint" data-test="list-empty">当天暂无娱乐记录。</p>
    <ul v-else class="record-list" data-test="record-list">
      <li v-for="record in records" :key="record.id" class="record-row" data-test="play-record">
        <div class="record-main">
          <strong>{{ record.content }}</strong>
          <span class="badge">{{ record.source === 'timer' ? '计时' : '补记' }}</span>
        </div>
        <span class="record-minutes">{{ record.minutes }} 分钟</span>
        <div class="record-ops">
          <button class="ghost-btn" data-test="edit-btn" @click="openEdit(record)">编辑</button>
          <button class="danger-btn" data-test="delete-btn" @click="playStore.softDeletePlay(record)">删除</button>
        </div>
      </li>
    </ul>

    <BaseModal v-if="showForm" id="play-record-modal" :title="modalTitle" @close="showForm = false">
      <div class="field">
        <label for="play-form-content">内容名称（必填）</label>
        <input id="play-form-content" v-model="formContent" data-test="form-content" placeholder="如：塞尔达传说" />
      </div>
      <div class="field">
        <label for="play-form-minutes">分钟数（正整数）</label>
        <input id="play-form-minutes" v-model="formMinutes" type="number" min="1" step="1" data-test="form-minutes" />
      </div>
      <div class="field">
        <label for="play-form-date">日期</label>
        <input id="play-form-date" v-model="formDate" type="date" data-test="form-date" />
      </div>
      <p v-if="formError" class="danger-text" data-test="form-error">{{ formError }}</p>
      <template #footer>
        <button class="ghost-btn" data-test="form-cancel" @click="showForm = false">取消</button>
        <button class="primary-btn" data-test="form-save" @click="saveForm">保存</button>
      </template>
    </BaseModal>
  </section>
</template>

<style scoped>
.quota-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.quota-head h2 {
  margin: 0;
}
.progress-track {
  height: 12px;
  background: var(--panel-2);
  border-radius: 999px;
  overflow: hidden;
  margin: 10px 0 6px;
}
.progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.2s ease;
}
.progress-bar.over {
  background: var(--danger);
}
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 0 10px;
}
.list-head h2 {
  margin: 0;
}
.record-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.record-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.record-row:last-child {
  border-bottom: none;
}
.record-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.record-minutes {
  color: var(--muted);
  white-space: nowrap;
}
.record-ops {
  display: flex;
  gap: 6px;
}
.record-ops .ghost-btn,
.record-ops .danger-btn {
  padding: 3px 10px;
  font-size: 13px;
}
</style>
