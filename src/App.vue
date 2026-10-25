<script setup lang="ts">
import { useEscToCloseModal } from '@/composables/useEscToCloseModal';
import { downloadBackup } from '@/db';
import BottomNav from '@/components/BottomNav.vue';
import SettlementModal from '@/components/SettlementModal.vue';
import SideNav from '@/components/SideNav.vue';
import TopBar from '@/components/TopBar.vue';
import ToastStack from '@/components/ToastStack.vue';
import { useDateStore } from '@/stores/date';
import { useSaveStatusStore } from '@/stores/saveStatus';
import { formatDateCN } from '@/utils/date';

useEscToCloseModal();

const dateStore = useDateStore();
const saveStatus = useSaveStatusStore();

async function exportNow(): Promise<void> {
  try {
    await downloadBackup();
    saveStatus.idle();
  } catch {
    // 保持失败状态，红条继续可见
  }
}
</script>

<template>
  <div class="app-shell">
    <header>
      <TopBar />
      <div v-if="saveStatus.hasError" class="error-bar" data-test="error-bar">
        <span>保存失败：数据可能未写入本地数据库</span>
        <button data-test="error-export" @click="exportNow">立即导出备份</button>
      </div>
    </header>
    <div class="app-body">
      <SideNav />
      <main class="content">
        <div v-if="!dateStore.isToday" class="viewing-banner" data-test="viewing-banner">
          你正在查看 {{ formatDateCN(dateStore.selectedDate) }}
        </div>
        <RouterView v-slot="{ Component, route }">
          <Transition name="page-fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>
    <BottomNav />
    <ToastStack />
    <SettlementModal />
  </div>
</template>
