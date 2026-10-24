import { defineStore } from 'pinia';

/**
 * 普通弹窗注册表：BaseModal 挂载时 open、卸载时 close；
 * 全局 Esc 关闭栈顶弹窗（结算弹窗等特殊弹窗第 2 阶段可用独立机制豁免）。
 */
export const useModalStore = defineStore('modal', {
  state: () => ({ stack: [] as string[] }),
  getters: {
    top: (state) => (state.stack.length > 0 ? (state.stack[state.stack.length - 1] ?? null) : null),
  },
  actions: {
    open(id: string) {
      if (!this.stack.includes(id)) this.stack.push(id);
    },
    close(id: string) {
      this.stack = this.stack.filter((item) => item !== id);
    },
    closeTop() {
      if (this.stack.length > 0) this.stack.pop();
    },
    isOpen(id: string) {
      return this.stack.includes(id);
    },
  },
});
