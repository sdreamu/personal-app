import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { initAppDb } from './db';
import { applyTheme, useSettingsStore } from './stores/settings';
import { useDateStore } from './stores/date';
import { useTimerStore } from './stores/timer';
import './assets/main.css';

async function bootstrap(): Promise<void> {
  const pinia = createPinia();
  try {
    await initAppDb(); // 打开数据库：种子 + 启动 GC + navigator.storage.persist()
  } catch (err) {
    console.error('数据库初始化失败', err);
  }
  const app = createApp(App);
  app.use(pinia);
  const settings = useSettingsStore(pinia);
  try {
    await settings.load();
  } catch (err) {
    console.error('设置加载失败', err);
  }
  // 主题：settings.load() 内部已 applyTheme 并注册系统主题监听（只注册一次）；这里再兜一次底，
  // 保证即使 load 抛错也把 data-theme 落到 light/dark（'system' 按系统偏好解析）。
  applyTheme(settings.theme);
  const dateStore = useDateStore(pinia);
  if (!dateStore.persisted) dateStore.goToday();
  const timer = useTimerStore(pinia);
  timer.init();
  app.use(router);
  app.mount('#app');
}

void bootstrap();
