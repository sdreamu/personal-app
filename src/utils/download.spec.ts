import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { DOWNLOAD_REVOKE_DELAY_MS, saveFile, triggerDownload } from './download';

// 原生壳的三件套：环境判定、写盘、系统分享。这里只验证"该走哪条路"和参数，不碰真机。
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: vi.fn(async () => ({ uri: 'file:///cache/evan.json' })) },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(async () => ({ activityType: 'com.test' })) } }));

const isNativePlatformMock = vi.mocked(Capacitor.isNativePlatform);
const writeFileMock = vi.mocked(Filesystem.writeFile);
const shareMock = vi.mocked(Share.share);

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

describe('saveFile（浏览器 vs 原生壳）', () => {
  beforeEach(() => {
    isNativePlatformMock.mockReset();
    isNativePlatformMock.mockReturnValue(false);
    writeFileMock.mockClear();
    shareMock.mockClear();
  });

  it('浏览器里走普通下载，不碰原生写盘', async () => {
    const target = await saveFile('evan-backup-20260601-0900.json', '{"a":1}');

    expect(target).toBe('download');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedDownload).toBe('evan-backup-20260601-0900.json');
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(shareMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOWNLOAD_REVOKE_DELAY_MS);
  });

  it('安卓 / iOS 壳里写进缓存目录再弹系统分享（WebView 里 <a download> 不落盘）', async () => {
    isNativePlatformMock.mockReturnValue(true);

    const target = await saveFile('evan-backup-20260601-0900.json', '{"a":1}');

    expect(target).toBe('native');
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock.mock.calls[0]?.[0]).toMatchObject({
      path: 'evan-backup-20260601-0900.json',
      data: '{"a":1}',
      directory: 'CACHE',
      encoding: 'utf8',
    });
    expect(shareMock).toHaveBeenCalledTimes(1);
    expect(shareMock.mock.calls[0]?.[0]).toMatchObject({ url: 'file:///cache/evan.json' });
    // 原生路径不该再走浏览器下载
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('原生壳里用户取消分享不算导出失败（文件已在缓存里）', async () => {
    isNativePlatformMock.mockReturnValue(true);
    shareMock.mockRejectedValueOnce(new Error('Share canceled'));

    await expect(saveFile('evan-text.md', '# 标题', 'text/markdown')).resolves.toBe('native');
    expect(writeFileMock).toHaveBeenCalledTimes(1);
  });

  it('原生写盘失败要抛出来，让调用方提示导出失败', async () => {
    isNativePlatformMock.mockReturnValue(true);
    writeFileMock.mockRejectedValueOnce(new Error('磁盘写满'));

    await expect(saveFile('evan-backup.json', '{}')).rejects.toThrow('磁盘写满');
    expect(shareMock).not.toHaveBeenCalled();
  });
});
