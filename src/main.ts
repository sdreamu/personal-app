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
  applyTheme(settings.theme);
  const dateStore = useDateStore(pinia);
  if (!dateStore.persisted) dateStore.goToday();
  const timer = useTimerStore(pinia);
  timer.init();
  app.use(router);
  app.mount('#app');
}

void bootstrap();
