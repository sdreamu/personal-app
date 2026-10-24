<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { bottomTabs, isActivePath, isItemActive, type NavGroupItem } from '@/config/nav';

const route = useRoute();
/** 手机端分组入口点开的是底部面板（列出该组子页面），不跳新页面。 */
const openGroup = ref<NavGroupItem | null>(null);
const sheetOpen = computed(() => openGroup.value !== null);

function toggleGroup(group: NavGroupItem): void {
  openGroup.value = openGroup.value?.key === group.key ? null : group;
}
function closeSheet(): void {
  openGroup.value = null;
}

watch(() => route.path, closeSheet);
</script>

<template>
  <div class="mobile-nav" data-test="mobile-nav">
    <div v-if="sheetOpen" class="bottom-sheet-backdrop" data-test="bottom-sheet-backdrop" @click="closeSheet" />
    <div
      v-if="openGroup"
      :id="`bottom-sheet-${openGroup.key}`"
      class="bottom-sheet"
      data-test="bottom-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="`${openGroup.label}子页面`"
    >
      <span class="bottom-sheet-handle" aria-hidden="true" />
      <p class="bottom-sheet-title">{{ openGroup.label }}</p>
      <RouterLink
        v-for="child in openGroup.children"
        :key="child.to"
        :to="child.to"
        class="bottom-sheet-link"
        :class="{ active: isActivePath(route.path, child.to) }"
        :aria-current="isActivePath(route.path, child.to) ? 'page' : undefined"
        @click="closeSheet"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="child.icon" />
        </svg>
        <span>{{ child.label }}</span>
      </RouterLink>
    </div>

    <nav class="bottom-nav" data-test="bottom-nav" aria-label="底部导航">
      <template v-for="tab in bottomTabs" :key="tab.key">
        <button
          v-if="tab.kind === 'group'"
          type="button"
          class="bottom-tab"
          data-test="bottom-tab-group"
          :class="{ active: isItemActive(route.path, tab) }"
          :aria-label="`${tab.label}（展开子页面）`"
          :aria-expanded="openGroup?.key === tab.key ? 'true' : 'false'"
          :aria-controls="`bottom-sheet-${tab.key}`"
          @click="toggleGroup(tab)"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="tab.icon" />
          </svg>
          <span class="bottom-tab-label">{{ tab.label }}</span>
        </button>
        <RouterLink
          v-else
          :to="tab.to"
          class="bottom-tab"
          data-test="bottom-tab-link"
          :class="{ active: isActivePath(route.path, tab.to) }"
          :aria-label="tab.label"
          :aria-current="isActivePath(route.path, tab.to) ? 'page' : undefined"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="tab.icon" />
          </svg>
          <span class="bottom-tab-label">{{ tab.label }}</span>
        </RouterLink>
      </template>
    </nav>
  </div>
</template>
