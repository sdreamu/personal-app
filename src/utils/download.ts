/**
 * 通用文件导出：把文本内容交给用户。
 *
 * 两条路必须分开（写在一起会骗人）：
 * - 浏览器：Blob + 隐藏 <a download>（triggerDownload，历史行为不变）
 * - Android / iOS（Capacitor WebView）：<a download> 在 WebView 里不落盘，点下去毫无反应，
 *   用户以为导出成功了、其实什么也没存。所以走原生：先写进应用缓存目录（不需要存储权限），
 *   再弹系统分享面板，让用户自己存到"下载"或发给别人。
 *
 * 备份（application/json）与文本导出（text/markdown）共用这一份实现，只有 mime 不同；
 * 改动这里等于同时改动两条导出路径 —— 浏览器侧行为（mime、10 秒后 revokeObjectURL、
 * 文件名规则）必须保持完全不变（见 src/db/backup.ts）。
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** createObjectURL 的 blob 存活时间：10 秒后回收（与历史备份导出一致）。 */
export const DOWNLOAD_REVOKE_DELAY_MS = 10_000;

/**
 * 触发一次浏览器下载。
 * @param filename 下载文件名（含扩展名）
 * @param content  文本内容
 * @param mime     Blob 的 MIME 类型，默认 application/json（备份导出沿用）
 */
export function triggerDownload(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
}

/** 导出实际走了哪条路，调用方可以据此换文案。 */
export type SaveFileTarget = 'download' | 'native';

/**
 * 导出文件：原生壳里写盘 + 系统分享，浏览器里就是普通下载。
 * 原生写盘失败会抛错（调用方的 try/catch 会把它变成失败提示），
 * 但用户中途取消分享不算失败——文件已经写在缓存目录里了。
 */
export async function saveFile(
  filename: string,
  content: string,
  mime = 'application/json',
): Promise<SaveFileTarget> {
  if (!Capacitor.isNativePlatform()) {
    triggerDownload(filename, content, mime);
    return 'download';
  }
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  try {
    await Share.share({ title: filename, url: uri, dialogTitle: '保存或分享导出文件' });
  } catch {
    // 用户取消分享 / 分享面板不可用：文件已在缓存目录，不当成导出失败
  }
  return 'native';
}
