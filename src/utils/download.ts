/**
 * 通用文件下载：把文本内容包成 Blob，用隐藏的 <a download> 触发浏览器下载。
 *
 * 备份（application/json）与文本导出（text/markdown）共用这一份实现，只有 mime 不同；
 * 改动这里等于同时改动两条导出路径 —— 备份的行为（mime、10 秒后 revokeObjectURL、文件名规则）
 * 必须保持完全不变（见 src/db/backup.ts）。
 */

/** createObjectURL 的 blob 存活时间：10 秒后回收（与历史备份导出一致）。 */
export const DOWNLOAD_REVOKE_DELAY_MS = 10_000;

/**
 * 触发一次文件下载。
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
