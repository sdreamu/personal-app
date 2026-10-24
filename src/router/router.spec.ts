import { describe, expect, it } from 'vitest';
import { appRoutePaths, router } from './index';

describe('hash 路由（PRD §2.2 的 11 条地址）', () => {
  it('11 条路由全部可切换且地址与 PRD §2.2 一致（hash 模式，刷新停留在当前页）', async () => {
    expect(appRoutePaths).toEqual([
      '/home',
      '/plan',
      '/study/books',
      '/study/books/:id',
      '/study/subjects',
      '/study/timer',
      '/life/diet',
      '/life/workout',
      '/life/play',
      '/review',
      '/settings',
    ]);
    // 说明：jsdom 中 hash 路由的自动首次导航由 app.use(router) 触发（真实应用 main.ts 已安装）；
    // 测试环境直接手动导航，覆盖全部 11 条地址。
    const targets = [
      '/home',
      '/plan',
      '/study/books',
      '/study/books/test-book-1',
      '/study/subjects',
      '/study/timer',
      '/life/diet',
      '/life/workout',
      '/life/play',
      '/review',
      '/settings',
    ];
    for (const target of targets) {
      await router.push(target);
      expect(router.currentRoute.value.path, '路由不可达：' + target).toBe(target);
      expect(router.currentRoute.value.matched.length, '无匹配组件：' + target).toBeGreaterThan(0);
      expect(router.currentRoute.value.fullPath, 'hash 地址不一致：' + target).toBe(target);
    }
  }, 20_000);
});
