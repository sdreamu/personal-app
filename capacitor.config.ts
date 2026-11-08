import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android 壳的配置（Windows 桌面版走 electron/，与本文件无关）。
 *
 * appId 一旦发布就不能改：它就是 Android 的包名，也是应用数据的归属标识。
 * webDir 指向 Vite 的产物；Capacitor 会把它整体塞进 apk 的 assets 里，
 * 运行时从 https://localhost 提供服务 —— 所以页面拿到的 origin 是 https://localhost，
 * 与浏览器版（127.0.0.1:5173）不是同一个存储域，数据要靠 JSON 备份搬。
 */
const config: CapacitorConfig = {
  appId: 'com.evan.personalapp',
  appName: '个人生活助手',
  webDir: 'dist',
  android: {
    // 这个应用不联网、也不加载任何远程内容，混合内容一律关掉
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
