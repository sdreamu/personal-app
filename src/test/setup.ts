import 'fake-indexeddb/auto';

// jsdom 未实现 window.scrollTo，而 vue-router 的 scrollBehavior 会调用它；测试环境用空实现代替。
if (typeof window !== 'undefined' && typeof window.scrollTo !== 'function') {
  window.scrollTo = () => undefined;
}
