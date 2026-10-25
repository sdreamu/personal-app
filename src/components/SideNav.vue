<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useSettingsStore } from '@/stores/settings';
import { logicalToday } from '@/utils/date';
import {
  isActivePath,
  isGroupActive,
  isItemActive,
  navFooter,
  navMain,
  type NavGroupItem,
} from '@/config/nav';

/**
 * 左侧导航（v5）：品牌标记 + 一级入口 + 两个分组 + 沉底的复盘/设置 + 手写便签。
 * 结构见 docs/UI_GUIDE.md §5；当前项用反相块（墨底反白）而不是色条。
 */
const route = useRoute();
const settings = useSettingsStore();
/** 手写便签下面的日期戳：取逻辑今天的 MM.DD（只读，不参与任何业务）。 */
const handDate = computed(() => {
  const key = logicalToday(settings.dayStartMin);
  return `${key.slice(5, 7)}.${key.slice(8, 10)} · 写给今天`;
});
/** 分组默认展开；当前路由所在分组自动展开（沿用原有规则）。 */
const openGroups = reactive<Record<string, boolean>>({ study: true, life: true });

function toggleGroup(group: NavGroupItem): void {
  openGroups[group.key] = !openGroups[group.key];
}

watch(
  () => route.path,
  () => {
    for (const item of navMain) {
      if (item.kind === 'group' && isGroupActive(route.path, item)) openGroups[item.key] = true;
    }
  },
  { immediate: true },
);
</script>

<template>
  <nav class="side-nav" data-test="side-nav" aria-label="主导航">
    <div class="side-brand">
      <svg class="brand-mark" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1" y="6" width="3" height="9" />
        <rect x="6.5" y="1" width="3" height="14" />
        <rect class="brand-mark-accent" x="12" y="8.5" width="3" height="6.5" />
      </svg>
      <span>EVAN</span>
    </div>

    <template v-for="item in navMain" :key="item.key">
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

    <div class="side-footer">
      <RouterLink
        v-for="item in navFooter"
        :key="item.key"
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

      <div class="hand-note" data-test="hand-note">
        <p class="hand">别等状态，<br /><mark class="hl">先坐下。</mark></p>
        <p class="hand-date">{{ handDate }}</p>
      </div>

      <p class="side-foot">数据只在本机</p>
    </div>
  </nav>
</template>

<style scoped>
.side-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 2px 8px 18px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.brand-mark {
  width: 16px;
  height: 16px;
  flex: none;
  fill: var(--text);
}
.brand-mark-accent {
  fill: var(--danger);
}
.side-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: var(--line-w) solid var(--border-ink);
}
.hand-note {
  margin: 20px 8px 6px;
}
.hand-note .hand {
  margin: 0;
  font-size: 20px;
  line-height: 1.4;
}
.hand-note .hand-date {
  margin: 6px 0 0;
}
.side-foot {
  margin: 10px 8px 0;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}
@media (max-width: 980px) {
  .hand-note {
    display: none;
  }
}
</style>
