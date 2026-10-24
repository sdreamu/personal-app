<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useRoute } from 'vue-router';

interface NavLeaf {
  to: string;
  label: string;
}
type NavItem =
  | { kind: 'link'; to: string; label: string }
  | { kind: 'group'; label: string; children: NavLeaf[] };

const navItems: NavItem[] = [
  { kind: 'link', to: '/home', label: '首页' },
  { kind: 'link', to: '/plan', label: '计划' },
  {
    kind: 'group',
    label: '学习',
    children: [
      { to: '/study/books', label: '读书' },
      { to: '/study/subjects', label: '科目' },
      { to: '/study/timer', label: '计时器' },
    ],
  },
  {
    kind: 'group',
    label: '生活',
    children: [
      { to: '/life/diet', label: '饮食' },
      { to: '/life/workout', label: '健身' },
      { to: '/life/play', label: '娱乐' },
    ],
  },
  { kind: 'link', to: '/review', label: '复盘' },
  { kind: 'link', to: '/settings', label: '设置' },
];

const route = useRoute();
const openGroups = reactive<Record<string, boolean>>({ 学习: true, 生活: true });

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`);
}
function groupActive(group: { label: string; children: NavLeaf[] }): boolean {
  return group.children.some((child) => isActive(child.to));
}
function toggleGroup(label: string): void {
  openGroups[label] = !openGroups[label];
}

watch(
  () => route.path,
  () => {
    for (const item of navItems) {
      if (item.kind === 'group' && groupActive(item)) openGroups[item.label] = true;
    }
  },
  { immediate: true },
);
</script>

<template>
  <nav class="side-nav" data-test="side-nav">
    <template v-for="item in navItems" :key="item.label">
      <template v-if="item.kind === 'group'">
        <button
          class="nav-group-toggle"
          data-test="nav-group"
          @click="toggleGroup(item.label)"
        >
          <span>{{ item.label }}</span>
          <span class="chevron">{{ openGroups[item.label] ? '▾' : '▸' }}</span>
        </button>
        <div v-if="openGroups[item.label]" class="nav-group-children">
          <RouterLink
            v-for="child in item.children"
            :key="child.to"
            :to="child.to"
            class="nav-link"
            :class="{ active: isActive(child.to) }"
          >
            {{ child.label }}
          </RouterLink>
        </div>
      </template>
      <template v-else>
        <RouterLink :to="item.to" class="nav-link" :class="{ active: isActive(item.to) }">
          {{ item.label }}
        </RouterLink>
      </template>
    </template>
  </nav>
</template>
