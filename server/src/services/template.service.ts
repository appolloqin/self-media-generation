import { query, queryOne, run, transaction } from '../db/connection.js';
import { llmService } from './llm.service.js';
import { logger } from '../core/logger.js';
import { configService } from './config.service.js';
import { extractTitle, htmlToMarkdown, countWords } from '../utils/content.js';
import type { PageDesignConfig, Template } from '@smg/shared';

class TemplateService {
  listCategories() {
    const rows = query<{ category: string; cnt: number }>(
      'SELECT category, COUNT(*) as cnt FROM templates GROUP BY category ORDER BY category',
    );
    return rows.map((r) => ({ name: r.category, templateCount: r.cnt }));
  }

  list(category?: string): Template[] {
    if (category) {
      return query<Template>(
        'SELECT * FROM templates WHERE category = ? ORDER BY builtin DESC, name ASC',
        [category],
      );
    }
    return query<Template>('SELECT * FROM templates ORDER BY category ASC, builtin DESC, name ASC');
  }

  get(id: number): Template | undefined {
    return queryOne<Template>('SELECT * FROM templates WHERE id = ?', [id]);
  }

  findByName(name: string, category?: string): Template | undefined {
    if (category) {
      return queryOne<Template>('SELECT * FROM templates WHERE name = ? AND category = ?', [
        name,
        category,
      ]);
    }
    return queryOne<Template>('SELECT * FROM templates WHERE name = ? ORDER BY builtin DESC LIMIT 1', [
      name,
    ]);
  }

  create(data: { name: string; category: string; content?: string }): Template {
    const exists = queryOne('SELECT id FROM templates WHERE name = ? AND category = ?', [
      data.name,
      data.category,
    ]);
    if (exists) throw new Error(`分类「${data.category}」下已存在模板「${data.name}」`);

    const res = run(
      'INSERT INTO templates (name, category, content, builtin) VALUES (?,?,?,0)',
      [data.name, data.category, data.content || DEFAULT_TEMPLATE],
    );
    return this.get(Number(res.lastInsertRowid))!;
  }

  update(id: number, patch: { name?: string; category?: string; content?: string }) {
    const tpl = this.get(id);
    if (!tpl) throw new Error('模板不存在');
    const name = patch.name ?? tpl.name;
    const category = patch.category ?? tpl.category;
    const content = patch.content ?? tpl.content;

    const dup = queryOne('SELECT id FROM templates WHERE name = ? AND category = ? AND id != ?', [
      name,
      category,
      id,
    ]);
    if (dup) throw new Error(`分类「${category}」下已存在模板「${name}」`);

    run(
      `UPDATE templates SET name = ?, category = ?, content = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
      [name, category, content, id],
    );
    return this.get(id);
  }

  remove(id: number) {
    const tpl = this.get(id);
    if (!tpl) throw new Error('模板不存在');
    if (tpl.builtin) throw new Error('内置模板不可删除，可先复制后再修改');
    run('DELETE FROM templates WHERE id = ?', [id]);
  }

  copy(id: number, newName: string, targetCategory: string): Template {
    const src = this.get(id);
    if (!src) throw new Error('源模板不存在');
    return this.create({ name: newName, category: targetCategory, content: src.content });
  }

  move(id: number, targetCategory: string): Template | undefined {
    const tpl = this.get(id);
    if (!tpl) throw new Error('模板不存在');
    if (tpl.category === targetCategory) return tpl;
    return this.update(id, { category: targetCategory });
  }

  renameCategory(oldName: string, newName: string) {
    const count = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM templates WHERE category = ?',
      [newName],
    );
    if ((count?.cnt ?? 0) > 0) throw new Error(`目标分类「${newName}」已存在`);

    return transaction(() => {
      run(
        `UPDATE templates SET category = ?, updated_at = datetime('now','localtime') WHERE category = ?`,
        [newName, oldName],
      );
      return { oldName, newName };
    });
  }

  createCategory(name: string) {
    // 分类由模板承载，创建即插入一个占位模板
    const exists = queryOne('SELECT COUNT(*) as cnt FROM templates WHERE category = ?', [name]);
    if ((exists?.cnt ?? 0) > 0) throw new Error(`分类「${name}」已存在`);
    this.create({ name: `_blank`, category: name, content: DEFAULT_TEMPLATE });
  }

  deleteCategory(name: string, force = false) {
    const tpls = this.list(name).filter((t) => t.name !== '_blank');
    if (tpls.length && !force) {
      throw new Error(`分类「${name}」包含 ${tpls.length} 个模板，请先移出或使用强制删除`);
    }
    run('DELETE FROM templates WHERE category = ?', [name]);
  }

  /** 按配置挑选一个模板（指定名称 > 指定分类 > 全局随机） */
  pickTemplate(): Template | null {
    const cfg = configService.get();
    const explicit = cfg.template?.trim();
    if (explicit) {
      const t = this.findByName(explicit, cfg.templateCategory || undefined);
      if (t) return t;
    }

    const category = cfg.templateCategory?.trim();
    let pool = category ? this.list(category) : this.list();
    pool = pool.filter((t) => t.name !== '_blank');
    if (pool.length === 0) return null;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * 用 LLM 将内容填充进模板，保持视觉风格
   */
  async fillTemplate(content: string, title: string, tpl: Template): Promise<string> {
    const cfg = configService.get();
    const templateHtml = tpl.content;
    const compressed = cfg.useCompress ? compressForPrompt(templateHtml) : templateHtml;
    const source = cfg.articleFormat === 'html' ? htmlToMarkdown(content) : content;

    const system = `你是微信公众号模板处理专家，能够将内容适配填充到 HTML 模板中。

## 严格要求
1. 保持原模板的 <section> 布局结构与内联样式完全不变
2. 保持原有的视觉层次、色彩方案、排版风格、圆角与阴影
3. 保持 SVG 动画元素与交互特性
4. 标题替换标题、段落替换段落、列表替换列表
5. 内容总字数 ${cfg.minArticleLen}~${cfg.maxArticleLen} 字，不可过度删减
6. 新内容比原模板长或短时合理调整，不破坏布局
7. 保持原有的强调（粗体/斜体/高亮）应用到新内容相应部分
8. 保持图片位置
9. 不可使用模板中的任何原始日期

## 严格禁止
- 不得添加新的 <style> 标签或外部 CSS
- 不得改变原有色彩方案（限制在三种色系内）
- 不得修改模板整体视觉结构
- 不得使用 position: absolute
- 只输出最终 HTML，不要任何解释`;

    try {
      const out = await llmService.chat({
        system,
        user: `文章标题：\n${title}\n\n文章内容：\n${source}\n\nHTML 模板：\n${compressed}`,
        temperature: 0.6,
        maxTokens: 16000,
      });
      return extractHtml(out) || out;
    } catch (err) {
      logger.warn(`模板填充失败，改用自动排版: ${(err as Error).message}`);
      return '';
    }
  }
}

/** 压缩模板以降低 token 消耗 */
function compressForPrompt(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractHtml(text: string): string {
  const m = text.match(/<section[\s\S]*<\/section>/i) || text.match(/<div[\s\S]*<\/div>/i);
  return m ? m[0] : '';
}

export const DEFAULT_TEMPLATE = `<section style="max-width:677px;margin:0 auto;padding:20px 16px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:#ffffff;color:#3a3a3a;">
  <section style="border-left:4px solid #3a7bd5;padding-left:12px;margin-bottom:24px;">
    <h1 style="margin:0;font-size:22px;line-height:1.5;font-weight:700;color:#1a1a1a;">{{TITLE}}</h1>
  </section>
  <section style="font-size:16px;line-height:1.9;letter-spacing:0.5px;">
{{CONTENT}}
  </section>
  <section style="margin-top:32px;padding-top:16px;border-top:1px solid #ececec;text-align:center;font-size:13px;color:#999;">
    <p style="margin:0;">— 完 —</p>
  </section>
</section>`;

export const templateService = new TemplateService();
