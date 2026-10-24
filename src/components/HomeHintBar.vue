<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useDateStore } from '@/stores/date';
import { useHomeStore, type HomeHint } from '@/stores/home';

/**
 * 首页顶部提示条（4a）：P1~P4 候选按优先级去重、最多显示 2 条；
 * 常驻“昨天定下的最重要的一件事”及其加入今日待办按钮。
 */
const router = useRouter();
const home = useHomeStore();
const dateStore = useDateStore();

async function handleHint(hint: HomeHint): Promise<void> {
  if (hint.action === 'rollover') {
    try {
      await home.rollover();
    } catch {
      // 写库失败已由 store 统一提示
    }
    return;
  }
  if (hint.kind === 'review') {
    dateStore.setSelected(home.yesterday);
    await router.push('/review');
    return;
  }
  if (hint.route !== null) {
    await router.push(hint.route);
  }
}

async function addMit(): Promise<void> {
  try {
    await home.addMit();
  } catch {
    // 写库失败已由 store 统一提示
  }
}
</script>

<template>
  <div v-if="home.hints.length > 0 || home.mitText" class="home-hint-area" data-test="home-hint-area">
    <button
      v-for="hint in home.hints"
      :key="hint.kind"
      class="hint-bar"
      data-test="hint-item"
      @click="handleHint(hint)"
    >
      <span class="hint-priority">P{{ hint.priority }}</span>
      <span class="hint-text" data-test="hint-text">{{ hint.text }}</span>
      <span class="hint-arrow" aria-hidden="true">›</span>
    </button>

    <div v-if="home.mitText" class="mit-bar settings-card" data-test="mit-bar">
      <span class="mit-label">昨天定下的最重要的一件事</span>
      <span class="mit-text" data-test="mit-text">{{ home.mitText }}</span>
      <button
        v-if="!home.mitAdded"
        class="primary-btn"
        data-test="mit-add-btn"
        @click="addMit"
      >
        加入今日待办
      </button>
      <button v-else class="ghost-btn" data-test="mit-add-btn" disabled>
        已加入今日待办 ✓
      </button>
    </div>
  </div>
</template>

<style scoped>
.home-hint-area {
  margin-bottom: 14px;
}
.hint-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 8px;
  text-align: left;
}
.hint-bar:hover {
  background: var(--panel-2);
}
.hint-priority {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 999px;
  padding: 1px 8px;
}
.hint-text {
  flex: 1;
  min-width: 0;
}
.hint-arrow {
  color: var(--muted);
}
.mit-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 0;
}
.mit-label {
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}
.mit-text {
  flex: 1;
  min-width: 180px;
  font-weight: 600;
}
</style>
