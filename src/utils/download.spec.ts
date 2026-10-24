import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOWNLOAD_REVOKE_DELAY_MS, triggerDownload } from './download';

const createObjectURL = vi.fn((_blob: Blob): string => 'blob:mock-url');
const revokeObjectURL = vi.fn();

let clickedDownload: string | null = null;
let clickedHref: string | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clickedDownload = null;
  clickedHref = null;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickedDownload = this.download;
    clickedHref = this.getAttribute('href');
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('triggerDownload', () => {
  it('默认 mime 是 application/json（备份导出沿用），10 秒后回收 blob URL', () => {
    const anchorCountBefore = document.querySelectorAll('a').length;
    triggerDownload('evan-backup-20260601-0900.json', '{"a":1}');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(clickedDownload).toBe('evan-backup-20260601-0900.json');
    expect(clickedHref).toBe('blob:mock-url');
    // 触发后临时 <a> 已从文档中移除
    expect(document.querySelectorAll('a').length).toBe(anchorCountBefore);

    // 回收有延迟：刚触发时还没 revoke
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOWNLOAD_REVOKE_DELAY_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('可指定 mime（文本导出用 text/markdown）', () => {
    triggerDownload('evan-text-20260601-20260607.md', '# 标题', 'text/markdown');

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('text/markdown');
    expect(clickedDownload).toBe('evan-text-20260601-20260607.md');
    vi.advanceTimersByTime(DOWNLOAD_REVOKE_DELAY_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
