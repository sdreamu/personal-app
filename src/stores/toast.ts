import { defineStore } from 'pinia';

export type ToastType = 'info' | 'success' | 'error';

export interface ToastUndo {
  label: string;
  action: () => void | Promise<void>;
}

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  undo: ToastUndo | null;
}

let nextToastId = 1;

/** 全局 toast；删除类操作用 undoable() 提供 5 秒内“撤销”。 */
export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] as ToastItem[] }),
  actions: {
    show(message: string, options: { type?: ToastType; undo?: ToastUndo; durationMs?: number } = {}) {
      const id = nextToastId++;
      const item: ToastItem = {
        id,
        message,
        type: options.type ?? 'info',
        undo: options.undo ?? null,
      };
      this.items.push(item);
      window.setTimeout(() => this.remove(id), options.durationMs ?? (options.undo ? 5000 : 4000));
    },
    info(message: string) {
      this.show(message, { type: 'info' });
    },
    success(message: string) {
      this.show(message, { type: 'success' });
    },
    error(message: string) {
      this.show(message, { type: 'error' });
    },
    /** 删除后 5 秒内可撤销的提示。 */
    undoable(message: string, action: () => void | Promise<void>) {
      this.show(message, { undo: { label: '撤销', action } });
    },
    remove(id: number) {
      this.items = this.items.filter((item) => item.id !== id);
    },
  },
});
