import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

/**
 * 11 条路由，与 PRD §2.2 地址一致（hash 模式，刷新停留在当前页）。
 */
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/home', name: 'home', component: () => import('@/views/HomeView.vue') },
  { path: '/plan', name: 'plan', component: () => import('@/views/PlanView.vue') },
  { path: '/study/books', name: 'study-books', component: () => import('@/views/StudyBooksView.vue') },
  { path: '/study/books/:id', name: 'study-book-detail', component: () => import('@/views/StudyBookDetailView.vue') },
  { path: '/study/subjects', name: 'study-subjects', component: () => import('@/views/StudySubjectsView.vue') },
  { path: '/study/timer', name: 'study-timer', component: () => import('@/views/StudyTimerView.vue') },
  { path: '/mistakes', name: 'mistakes', component: () => import('@/views/MistakesView.vue') },
  { path: '/life/diet', name: 'life-diet', component: () => import('@/views/LifeDietView.vue') },
  { path: '/life/workout', name: 'life-workout', component: () => import('@/views/LifeWorkoutView.vue') },
  { path: '/life/play', name: 'life-play', component: () => import('@/views/LifePlayView.vue') },
  { path: '/review', name: 'review', component: () => import('@/views/ReviewView.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
];

/** 与 PRD §2.2 一致的 11 条页面地址（测试与后续阶段校验用）。 */
export const appRoutePaths: readonly string[] = [
  '/home',
  '/plan',
  '/study/books',
  '/study/books/:id',
  '/study/subjects',
  '/study/timer',
  '/mistakes',
  '/life/diet',
  '/life/workout',
  '/life/play',
  '/review',
  '/settings',
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach(() => {
  document.title = 'Evan的专属APP';
});
