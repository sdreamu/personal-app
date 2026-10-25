/**
 * 导航结构的唯一来源：侧边栏（SideNav）与手机底部导航（BottomNav）都从这里读。
 * icon 是 24×24 视口下的描边 SVG path 字符串（内联，无图标字体/外链）。
 */

export interface NavLeaf {
  readonly to: string;
  readonly label: string;
  readonly icon: string;
}

export interface NavLinkItem {
  readonly kind: 'link';
  readonly key: string;
  readonly to: string;
  readonly label: string;
  readonly icon: string;
}

export interface NavGroupItem {
  readonly kind: 'group';
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly children: readonly NavLeaf[];
}

export type NavItem = NavLinkItem | NavGroupItem;

const ICONS = {
  home: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2',
  plan: 'M4.5 6.5h15v13.5h-15zM4.5 11h15M8.5 4v4M15.5 4v4',
  study: 'M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3zM17 7.5h2v12.5h-2M8.5 8.5h5',
  life: 'M12 20S3.8 14.7 3.8 9.4A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.2 3c0 5.3-8.2 10.6-8.2 10.6z',
  review: 'M3.5 19.5h17M6.5 15.5l4-4.5 3 2.5 5.5-6.5',
  settings: 'M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zM4.5 12h2.2M17.3 12h2.2M7.1 7.1l1.6 1.6M15.3 15.3l1.6 1.6M7.1 16.9l1.6-1.6M15.3 8.7l1.6-1.6',
  books: 'M12 6.8C10.6 5.4 8.4 4.8 5.5 4.8v13c2.9 0 5.1.6 6.5 2 1.4-1.4 3.6-2 6.5-2v-13c-2.9 0-5.1.6-6.5 2zM12 6.8v13',
  subjects: 'M12 3.5 3.5 8 12 12.5 20.5 8zM3.5 12.2 12 16.7l8.5-4.5M3.5 16.4 12 20.9l8.5-4.5',
  timer: 'M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6zM12 8v4.4l3 1.8M9.5 2.5h5',
  diet: 'M3.5 11.5h17a8.5 8.5 0 0 1-17 0zM8.5 8.2c0-1.6 1.3-2 1.3-3.4M12 8.2c0-1.6 1.3-2 1.3-3.4M15.5 8.2c0-1.6 1.3-2 1.3-3.4',
  workout: 'M4 9.5v5M7 7.5v9M17 7.5v9M20 9.5v5M7 12h10',
  play: 'M9.5 7.6l7 4.4-7 4.4zM12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8z',
} as const;

/** 侧边栏顺序：一级入口与分组混排（与 PRD §2.2 路由一一对应）。 */
export const navItems: readonly NavItem[] = [
  { kind: 'link', key: 'home', to: '/home', label: '今天', icon: ICONS.home },
  { kind: 'link', key: 'plan', to: '/plan', label: '日程', icon: ICONS.plan },
  {
    kind: 'group',
    key: 'study',
    label: '学习',
    icon: ICONS.study,
    children: [
      { to: '/study/books', label: '读书', icon: ICONS.books },
      { to: '/study/subjects', label: '科目', icon: ICONS.subjects },
      { to: '/study/timer', label: '计时器', icon: ICONS.timer },
    ],
  },
  {
    kind: 'group',
    key: 'life',
    label: '生活',
    icon: ICONS.life,
    children: [
      { to: '/life/diet', label: '饮食', icon: ICONS.diet },
      { to: '/life/workout', label: '健身', icon: ICONS.workout },
      { to: '/life/play', label: '娱乐', icon: ICONS.play },
    ],
  },
  { kind: 'link', key: 'review', to: '/review', label: '复盘', icon: ICONS.review },
  { kind: 'link', key: 'settings', to: '/settings', label: '设置', icon: ICONS.settings },
];

/**
 * 沉在侧边栏底部的两个入口（复盘 / 设置）：单独一组，和上面的导航拉开距离。
 * 手机端 复盘 仍在底部导航里，设置由侧栏与顶栏进入。
 */
export const navFooter: readonly NavLinkItem[] = navItems.filter(
  (item): item is NavLinkItem => item.kind === 'link' && (item.key === 'review' || item.key === 'settings'),
);

/** 侧边栏主体（不含底部那一组）。 */
export const navMain: readonly NavItem[] = navItems.filter(
  (item) => !navFooter.some((footer) => footer.key === item.key),
);

/** 手机底部导航的 5 个一级入口；设置留在侧边栏之外由顶栏/首页进入。 */
export const bottomTabs: readonly NavItem[] = navItems.filter((item) => item.key !== 'settings');

/** 当前路由是否命中该入口（含详情子路由，如 /study/books/:id 归属 /study/books）。 */
export function isActivePath(currentPath: string, to: string): boolean {
  return currentPath === to || currentPath.startsWith(`${to}/`);
}

/** 分组内是否有子页面命中当前路由。 */
export function isGroupActive(currentPath: string, group: NavGroupItem): boolean {
  return group.children.some((child) => isActivePath(currentPath, child.to));
}

/** 统一判定某个导航项（链接或分组）当前是否高亮。 */
export function isItemActive(currentPath: string, item: NavItem): boolean {
  return item.kind === 'group' ? isGroupActive(currentPath, item) : isActivePath(currentPath, item.to);
}

/**
 * 顶栏日期控件（前一天 / 日期标签 / 后一天 / 回到今天）的显示范围唯一来源。
 * 只有“和日期有关”的页面显示：计划、饮食、健身、娱乐、复盘；
 * 首页、读书/书详情、科目、计时器、设置不显示。快捷键不受此限制，仍全局生效。
 */
export const dateSwitchPaths: readonly string[] = ['/plan', '/life/diet', '/life/workout', '/life/play', '/review'];

/** 当前路由是否显示顶栏日期控件（子路由按 isActivePath 规则归属）。 */
export function showsDateSwitch(currentPath: string): boolean {
  return dateSwitchPaths.some((path) => isActivePath(currentPath, path));
}
