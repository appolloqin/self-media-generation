import { query, queryOne, run, transaction } from '../db/connection.js';
import { slugify } from '../utils/content.js';
import type { ExpertTrack, ExpertTrackTemplate } from '@smg/shared';

const TRACK_COLS = `id, name, slug, description, audience, boundary, structure, style,
  quality_bar AS qualityBar, compliance, examples, default_params AS defaultParams,
  enabled, is_builtin AS isBuiltin, created_at AS createdAt, updated_at AS updatedAt`;

const TPL_COLS = `id, track_id AS trackId, name, audience, depth, platform, style, strategy,
  word_min AS wordMin, word_max AS wordMax, enabled, created_at AS createdAt, updated_at AS updatedAt`;

/** SQLite stores default_params as TEXT; normalize to object for API consumers. */
function parseDefaultParams(raw: unknown): Record<string, unknown> {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  return {};
}

function hydrateTrack(row: ExpertTrack | undefined | null): ExpertTrack | undefined {
  if (!row) return undefined;
  return { ...row, defaultParams: parseDefaultParams(row.defaultParams) };
}

class TrackService {
  list(onlyEnabled = false): ExpertTrack[] {
    const rows = onlyEnabled
      ? query<ExpertTrack>(`SELECT ${TRACK_COLS} FROM expert_tracks WHERE enabled = 1 ORDER BY id`)
      : query<ExpertTrack>(`SELECT ${TRACK_COLS} FROM expert_tracks ORDER BY id`);
    return rows.map((r) => hydrateTrack(r)!);
  }

  get(id: number): ExpertTrack | undefined {
    return hydrateTrack(queryOne<ExpertTrack>(`SELECT ${TRACK_COLS} FROM expert_tracks WHERE id = ?`, [id]));
  }

  create(data: Partial<ExpertTrack> & { name: string }): ExpertTrack {
    let slug = data.slug?.trim() || slugify(data.name);
    if (queryOne('SELECT id FROM expert_tracks WHERE slug = ?', [slug])) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }
    const res = run(
      `INSERT INTO expert_tracks (name, slug, description, audience, boundary, structure, style,
         quality_bar, compliance, examples, default_params, enabled, is_builtin)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      [
        data.name,
        slug,
        data.description ?? '',
        data.audience ?? '',
        data.boundary ?? '',
        data.structure ?? '',
        data.style ?? '',
        data.qualityBar ?? '',
        data.compliance ?? '',
        data.examples ?? '',
        JSON.stringify(data.defaultParams ?? {}),
        data.enabled === false ? 0 : 1,
      ],
    );
    return this.get(Number(res.lastInsertRowid))!;
  }

  update(id: number, patch: Partial<ExpertTrack>): ExpertTrack {
    const cur = this.get(id);
    if (!cur) throw new Error('赛道不存在');
    if (cur.isBuiltin) {
      const allowed: (keyof ExpertTrack)[] = ['enabled', 'name', 'description', 'audience'];
      const extra = Object.keys(patch).filter((k) => !allowed.includes(k as keyof ExpertTrack));
      if (extra.length) {
        throw new Error(`内置赛道仅可修改 ${allowed.join('、')}，其余字段请先复制为自定义赛道`);
      }
    }
    run(
      `UPDATE expert_tracks SET name=?, description=?, audience=?, boundary=?, structure=?,
              style=?, quality_bar=?, compliance=?, examples=?, default_params=?, enabled=?,
              updated_at=datetime('now','localtime')
       WHERE id = ?`,
      [
        patch.name ?? cur.name,
        patch.description ?? cur.description,
        patch.audience ?? cur.audience,
        patch.boundary ?? cur.boundary,
        patch.structure ?? cur.structure,
        patch.style ?? cur.style,
        patch.qualityBar ?? cur.qualityBar,
        patch.compliance ?? cur.compliance,
        patch.examples ?? cur.examples,
        JSON.stringify(patch.defaultParams ?? cur.defaultParams),
        patch.enabled === undefined ? cur.enabled : patch.enabled ? 1 : 0,
        id,
      ],
    );
    return this.get(id)!;
  }

  remove(id: number) {
    const cur = this.get(id);
    if (!cur) throw new Error('赛道不存在');
    if (cur.isBuiltin) throw new Error('内置赛道不可删除');
    run('DELETE FROM expert_tracks WHERE id = ?', [id]);
  }

  copy(id: number, newName: string): ExpertTrack {
    const src = this.get(id);
    if (!src) throw new Error('赛道不存在');
    return this.create({ ...src, name: newName });
  }

  /* ---------------- 赛道模板 ---------------- */

  templates(trackId?: number): ExpertTrackTemplate[] {
    return trackId
      ? query<ExpertTrackTemplate>(
          `SELECT ${TPL_COLS} FROM expert_track_templates WHERE track_id = ? ORDER BY id`,
          [trackId],
        )
      : query<ExpertTrackTemplate>(`SELECT ${TPL_COLS} FROM expert_track_templates ORDER BY track_id, id`);
  }

  createTemplate(data: {
    trackId: number;
    name: string;
    audience?: string;
    depth?: string;
    platform?: string;
    style?: string;
    strategy?: string;
    wordMin?: number;
    wordMax?: number;
  }): ExpertTrackTemplate {
    const res = run(
      `INSERT INTO expert_track_templates (track_id, name, audience, depth, platform, style, strategy, word_min, word_max)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        data.trackId,
        data.name,
        data.audience ?? '',
        data.depth ?? 'standard',
        data.platform ?? 'wechat',
        data.style ?? '',
        data.strategy ?? '',
        data.wordMin ?? 1000,
        data.wordMax ?? 2000,
      ],
    );
    return queryOne<ExpertTrackTemplate>(
      `SELECT ${TPL_COLS} FROM expert_track_templates WHERE id = ?`,
      [Number(res.lastInsertRowid)],
    )!;
  }

  updateTemplate(id: number, patch: Partial<ExpertTrackTemplate>): ExpertTrackTemplate {
    const cur = queryOne<ExpertTrackTemplate>(
      `SELECT ${TPL_COLS} FROM expert_track_templates WHERE id = ?`,
      [id],
    );
    if (!cur) throw new Error('模板不存在');
    run(
      `UPDATE expert_track_templates SET name=?, audience=?, depth=?, platform=?, style=?,
              strategy=?, word_min=?, word_max=?, enabled=?, updated_at=datetime('now','localtime')
       WHERE id = ?`,
      [
        patch.name ?? cur.name,
        patch.audience ?? cur.audience,
        patch.depth ?? cur.depth,
        patch.platform ?? cur.platform,
        patch.style ?? cur.style,
        patch.strategy ?? cur.strategy,
        patch.wordMin ?? cur.wordMin,
        patch.wordMax ?? cur.wordMax,
        patch.enabled ?? cur.enabled,
        id,
      ],
    );
    return queryOne<ExpertTrackTemplate>(
      `SELECT ${TPL_COLS} FROM expert_track_templates WHERE id = ?`,
      [id],
    )!;
  }

  removeTemplate(id: number) {
    run('DELETE FROM expert_track_templates WHERE id = ?', [id]);
  }

  /** 批量保存赛道配置中的模板 */
  replaceTemplates(trackId: number, items: Partial<ExpertTrackTemplate>[]) {
    return transaction(() => {
      run('DELETE FROM expert_track_templates WHERE track_id = ?', [trackId]);
      for (const it of items) {
        if (!it.name?.trim()) continue;
        this.createTemplate({ trackId, ...(it as any) });
      }
      return this.templates(trackId);
    });
  }
}

export const trackService = new TrackService();
