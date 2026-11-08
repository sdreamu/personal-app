import { ref } from 'vue';
import { normalizeReviewPatch, type ReviewPatch } from '@/stores/review';

type Job = { date: string; patch: ReviewPatch; token: string };
const prefix = 'evan-review-draft:';

/** Coalesce typing, serialize writes and retain crash-recovery drafts until their exact write succeeds. */
export function useReviewAutosave(save: (date: string, patch: ReviewPatch) => Promise<unknown>, delay = 400) {
  const status = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const pending = new Map<string, Job>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: Promise<boolean> | null = null;

  function read(date: string): Job | null {
    try {
      const job = JSON.parse(localStorage.getItem(prefix + date) ?? 'null') as Job | null;
      if (!job || job.date !== date || typeof job.token !== 'string' || !job.patch) return null;
      const textKeys = ['good', 'improve', 'mit', 'record_worthy', 'day_summary'] as const;
      const numberKeys = ['rating', 'mood', 'energy'] as const;
      const patch: ReviewPatch = {};
      for (const key of textKeys) {
        const value = job.patch[key];
        if (value !== null && typeof value !== 'string') return null;
        patch[key] = value;
      }
      for (const key of numberKeys) {
        const value = job.patch[key];
        if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5)) return null;
        patch[key] = value;
      }
      return { ...job, patch: normalizeReviewPatch(patch) };
    } catch { return null; }
  }

  function enqueue(date: string, patch: ReviewPatch): void {
    const job = { date, patch: { ...patch }, token: crypto.randomUUID() };
    pending.set(date, job);
    try { localStorage.setItem(prefix + date, JSON.stringify(job)); } catch { /* IndexedDB remains the primary store. */ }
    status.value = 'pending';
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, delay);
  }

  function flush(): Promise<boolean> {
    clearTimeout(timer);
    if (flight) return flight;
    if (!pending.size) return Promise.resolve(status.value !== 'error');
    flight = (async () => {
      while (pending.size) {
        const job = pending.values().next().value as Job;
        pending.delete(job.date);
        status.value = 'saving';
        try {
          await save(job.date, job.patch);
          if (read(job.date)?.token === job.token) {
            try { localStorage.removeItem(prefix + job.date); } catch { /* Keep recovery copy if storage is unavailable. */ }
          }
        } catch {
          if (!pending.has(job.date)) pending.set(job.date, job);
          status.value = 'error';
          return false;
        }
      }
      status.value = 'saved';
      return true;
    })().finally(() => { flight = null; });
    return flight;
  }

  function dispose(): void { clearTimeout(timer); void flush(); }
  return { status, enqueue, flush, restore: (date: string) => read(date)?.patch ?? null, dispose };
}
