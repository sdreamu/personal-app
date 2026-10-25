import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 已安装 Agent Skill 的守卫测试。
 *
 * 本项目把技能放在仓库内的 `.dsh/skills/<name>/SKILL.md`（DSH 的 project-dsh 技能根，
 * 优先级高于用户级 `~/.dsh/skills`）。DSH 用严格 YAML 解析 frontmatter，
 * 解析失败的技能会被静默丢弃（表现为「装了但技能列表里没有」），所以这里在 CI 里提前报错。
 */

/** vitest 的 jsdom 环境里 import.meta.url 不是 file:// URL，改用仓库根目录（vitest 从根运行）。 */
const SKILLS_ROOT = resolve(process.cwd(), '.dsh/skills');

interface Frontmatter {
  fields: Record<string, string>;
  body: string;
}

/** 只解析我们关心的顶层标量字段，支持 `key: value`、引号值和 `|-` / `>-` 块标量。 */
function parseFrontmatter(source: string, where: string): Frontmatter {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new Error(`${where}: 文件必须以 "---" frontmatter 开头`);
  }
  const end = normalized.indexOf('\n---', 4);
  if (end < 0) {
    throw new Error(`${where}: frontmatter 缺少结束的 "---"`);
  }
  const head = normalized.slice(4, end);
  const body = normalized.slice(end + 4);

  const fields: Record<string, string> = {};
  let current: string | undefined;
  let block: string[] = [];
  const flush = () => {
    if (current) fields[current] = block.join(' ').trim();
    current = undefined;
    block = [];
  };

  for (const line of head.split('\n')) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (top && !/^\s/.test(line)) {
      flush();
      const key = top[1];
      const inline = top[2].trim();
      if (inline === '' || /^[|>][-+]?$/.test(inline)) {
        current = key;
      } else {
        fields[key] = inline.replace(/^(["'])(.*)\1$/, '$2');
      }
      continue;
    }
    if (/^\s+\S/.test(line) && current) {
      block.push(line.trim());
      continue;
    }
    throw new Error(`${where}: 无法解析的 frontmatter 行 "${line}"`);
  }
  flush();
  return { fields, body };
}

const skillDirs = existsSync(SKILLS_ROOT)
  ? readdirSync(SKILLS_ROOT)
      .map((name) => join(SKILLS_ROOT, name))
      .filter((path) => statSync(path).isDirectory())
      .filter((path) => existsSync(join(path, 'SKILL.md')))
  : [];

const skillNameOf = (dir: string) => dir.split(/[\\/]/).pop() as string;

describe('已安装的技能（.dsh/skills）', () => {
  it('至少安装了 design-taste-frontend（视觉提升 UI 技能）', () => {
    expect(existsSync(join(SKILLS_ROOT, 'design-taste-frontend', 'SKILL.md'))).toBe(true);
  });

  it('每个技能的 frontmatter 都能被严格解析，含必需的 name / description', () => {
    const problems: string[] = [];
    const seen = new Map<string, string>();

    for (const dir of skillDirs) {
      const file = join(dir, 'SKILL.md');
      const dirName = skillNameOf(dir);
      const where = `${dirName}/SKILL.md`;
      let fm: Frontmatter;
      try {
        fm = parseFrontmatter(readFileSync(file, 'utf8'), where);
      } catch (error) {
        problems.push((error as Error).message);
        continue;
      }

      const name = fm.fields.name;
      const description = fm.fields.description;

      // name：字母数字加连字符，且与目录名一致（上游 install.sh 用 frontmatter 的 name 做安装名）。
      if (!name) problems.push(`${where}: 缺少 name`);
      else if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        problems.push(`${where}: name "${name}" 只允许小写字母、数字和连字符`);
      } else if (name !== dirName) {
        problems.push(`${where}: name "${name}" 必须与目录名一致`);
      }

      if (!description) problems.push(`${where}: 缺少 description`);
      else if (description.length < 20) {
        problems.push(`${where}: description 太短，模型无法据此判断何时使用`);
      }

      if (name) {
        const previous = seen.get(name);
        if (previous) problems.push(`${where}: name "${name}" 与 ${previous} 重复`);
        else seen.set(name, where);
      }

      expect(fm.body.trim().length).toBeGreaterThan(0);
    }

    expect(problems).toEqual([]);
  });

  it('技能正文里引用的本地文件都真实存在（例如 references/*.md）', () => {
    const problems: string[] = [];
    for (const dir of skillDirs) {
      const source = readFileSync(join(dir, 'SKILL.md'), 'utf8')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n');
      const body = source.slice(source.indexOf('\n---', 4) + 4);
      const refs = new Set(
        [...body.matchAll(/(?<![\w/.-])(references\/[\w./-]+\.md)/g)].map((match) => match[1]),
      );
      for (const ref of refs) {
        if (!existsSync(join(dir, ref))) {
          problems.push(`${skillNameOf(dir)}: 引用了不存在的文件 ${ref}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
