<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useRoute } from 'vue-router';
import { isActivePath, isGroupActive, isItemActive, navItems, type NavGroupItem } from '@/config/nav';

const route = useRoute();
/** 分组默认展开；当前路由所在分组自动展开（沿用原有规则）。 */
const openGroups = reactive<Record<string, boolean>>({ study: true, life: true });

function toggleGroup(group: NavGroupItem): void {
  openGroups[group.key] = !openGroups[group.key];
}

watch(
  () => route.path,
  () => {
    for (const item of navItems) {
      if (item.kind === 'group' && isGroupActive(route.path, item)) openGroups[item.key] = true;
    }
  },
  { immediate: true },
);
</script>

<template>
  <nav class="side-nav" data-test="side-nav" aria-label="主导航">
    <template v-for="item in navItems" :key="item.key">
      <div v-if="item.kind === 'group'" class="nav-group">
        <button
          type="button"
          class="nav-group-toggle"
          :class="{ active: isItemActive(route.path, item) }"
          data-test="nav-group"
          :aria-expanded="openGroups[item.key] ? 'true' : 'false'"
          :aria-controls="`side-nav-group-${item.key}`"
          @click="toggleGroup(item)"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="item.icon" />
          </svg>
          <span class="nav-label">{{ item.label }}</span>
          <span class="chevron" aria-hidden="true">{{ openGroups[item.key] ? '▾' : '▸' }}</span>
        </button>
        <div v-if="openGroups[item.key]" :id="`side-nav-group-${item.key}`" class="nav-group-children">
          <RouterLink
            v-for="child in item.children"
            :key="child.to"
            :to="child.to"
            class="nav-link nav-link-child"
            :class="{ active: isActivePath(route.path, child.to) }"
            :title="child.label"
            :aria-current="isActivePath(route.path, child.to) ? 'page' : undefined"
          >
            <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path :d="child.icon" />
            </svg>
            <span class="nav-label">{{ child.label }}</span>
          </RouterLink>
        </div>
      </div>
      <RouterLink
        v-else
        :to="item.to"
        class="nav-link"
        :class="{ active: isActivePath(route.path, item.to) }"
        :title="item.label"
        :aria-current="isActivePath(route.path, item.to) ? 'page' : undefined"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="item.icon" />
        </svg>
        <span class="nav-label">{{ item.label }}</span>
      </RouterLink>
    </template>
  </nav>
</template>
