import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewAutosave } from './useReviewAutosave';
import type { ReviewPatch } from '@/stores/review';
const date = '2026-11-07';
const draft = (good: string): ReviewPatch => ({ good, improve:'', mit:'', record_worthy:'', day_summary:'', rating:null, mood:null, energy:null });
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

it('debounces successive edits and writes only the latest snapshot', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const auto = useReviewAutosave(save);
  auto.enqueue(date, draft('a'));
  await vi.advanceTimersByTimeAsync(200);
  auto.enqueue(date, draft('ab'));
  await vi.advanceTimersByTimeAsync(399);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledExactlyOnceWith(date, draft('ab'));
  expect(auto.status.value).toBe('saved');
  expect(auto.restore(date)).toBeNull();
});

it('serializes edits during an in-flight save and keeps the newer recovery draft', async () => {
  let finish!: () => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish=resolve; })).mockRejectedValueOnce(new Error('disk'));
  const auto = useReviewAutosave(save);
  auto.enqueue(date, draft('old'));
  const flight = auto.flush();
  auto.enqueue(date, draft('new'));
  expect(auto.restore(date)?.good).toBe('new');
  finish();
  expect(await flight).toBe(false);
  expect(auto.restore(date)?.good).toBe('new');
  expect(save.mock.calls.map(call => call[1].good)).toEqual(['old','new']);
  save.mockResolvedValueOnce(undefined);
  expect(await auto.flush()).toBe(true);
  expect(auto.restore(date)).toBeNull();
});

it('restores unsaved input after remount and captures each date in its queued job', async () => {
  const first = useReviewAutosave(vi.fn().mockRejectedValue(new Error('offline')));
  first.enqueue(date, draft('recover'));
  await first.flush();
  const save = vi.fn().mockResolvedValue(undefined);
  const second = useReviewAutosave(save);
  expect(second.restore(date)?.good).toBe('recover');
  second.enqueue(date, second.restore(date)!);
  second.enqueue('2026-11-06', draft('yesterday'));
  await second.flush();
  expect(save.mock.calls.map(call => call[0])).toEqual([date,'2026-11-06']);
  expect(second.restore(date)).toBeNull();
});
