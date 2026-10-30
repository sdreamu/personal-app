/**
 * 应用身份的集中处：界面上的应用名与问候语只从这里取，别在各处再写死字符串。
 * 公开仓库里不出现任何个人名字——昵称是用户自己在设置页填的运行时配置（settings.nickname）。
 */

/** 面向用户的应用名（浏览器标签页标题、顶栏品牌、计时器标题闪烁等处统一用它）。 */
export const APP_NAME = '个人生活助手';

/** 没设昵称时的问候语（也就是首页 h1 的全部内容）。 */
export const DEFAULT_NICKNAME = '你好';

/**
 * 纯函数：昵称 → 问候语。
 * 昵称为空 / 只有空白 / null / undefined 时退回「你好」；设了昵称则是「你好，小王」。
 * 读取端一律走这里，所以老数据没有 nickname 字段也不会显示成「你好，undefined」。
 */
export function greeting(nickname?: string | null): string {
  const name = typeof nickname === 'string' ? nickname.trim() : '';
  return name === '' ? DEFAULT_NICKNAME : `你好，${name}`;
}
