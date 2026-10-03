import * as cheerio from 'cheerio';
import { query, run } from '../db/connection.js';
import { configService } from './config.service.js';
import { logger } from '../core/logger.js';
import { httpGetJson, httpGetText } from '../utils/http.js';
import { weightedRandom } from '../utils/content.js';
import type { HotPlatform, HotTopic, HotTopicGroup } from '@smg/shared';

const ZHIWEI_API = 'https://trends.zhiweidata.com/hotSearchTrend/search/longTimeInListSearch';
const TOPHUB_URL = 'https://tophub.today/';
const VVHAN_API = 'https://api.vvhan.com/api/hotlist/all';
const CACHE_TTL_MS = 5 * 60 * 1000;

/** 今日热榜节点 ID：平台名 / 旧域名 → /n/{id} */
const TOPHUB_NODE_IDS: Record<string, string> = {
  微信: 'WnBe01o371',
  虎扑: 'G47o8weMmN',
  豆瓣小组: 'WYKd6jdaPj',
  澎湃新闻: 'wWmoO5Rd4E',
  'hupu.com': 'G47o8weMmN',
  'douban.com': 'WYKd6jdaPj',
  'thepaper.cn': 'wWmoO5Rd4E',
};

/** 首页卡片标题别名（精确匹配失败时的兜底） */
const TOPHUB_HOME_ALIASES: Record<string, string[]> = {
  微信: ['微信'],
  虎扑: ['虎扑', '虎扑社区'],
  豆瓣小组: ['豆瓣小组'],
  澎湃新闻: ['澎湃新闻', '澎湃', '澎湃热榜'],
};

type RawTopic = { name: string; rank: number; heat: string; url: string; source: HotTopic['source'] };

class HotNewsService {
  private memoryCache = new Map<string, { at: number; topics: RawTopic[] }>();

  private async fromZhiwei(zhiweiId: string): Promise<RawTopic[] | null> {
    const url = `${ZHIWEI_API}?type=${encodeURIComponent(zhiweiId)}&sortType=realTime`;
    try {
      const data = await httpGetJson<any>(url, {
        referer: 'https://trends.zhiweidata.com/',
        timeoutMs: 10_000,
      });
      if (!data?.state || !Array.isArray(data.data)) return null;
      return data.data.map((item: any, i: number) => ({
        name: String(item.name ?? '').trim(),
        rank: Number(item.rank ?? i + 1),
        heat: String(item.lastCount ?? 0),
        url: String(item.url ?? ''),
        source: 'zhiwei' as const,
      }));
    } catch {
      return null;
    }
  }

  /** 解析今日热榜节点页（table 列表；兼容带缩略图的多列布局） */
  private async fromTophubNode(nodeId: string, limit: number): Promise<RawTopic[] | null> {
    try {
      const id = nodeId.replace(/^\/?n\//, '').trim();
      if (!id || id.includes('.')) return null;
      const html = await httpGetText(`${TOPHUB_URL}n/${id}`, { timeoutMs: 12_000 });
      const $ = cheerio.load(html);
      const topics: RawTopic[] = [];
      $('table.table tr').each((_i, tr) => {
        if (topics.length >= limit) return;
        const row = $(tr);
        const tds = row.find('td');
        if (tds.length < 2) return;

        let title = '';
        let url = '';
        row.find('a[href]').each((_j, el) => {
          if (title) return;
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          // 跳过无文字链接、纯图标、以及「查看详细」类操作链接
          if (!text || text.length < 2) return;
          if (/查看|详情|详细/.test(text)) return;
          title = text;
          url = $(el).attr('href') ?? '';
        });
        if (!title) return;

        const rankText = tds.eq(0).text().replace(/[^\d]/g, '');
        // 热度只取专用列，避免带缩略图布局把标题区误判为热度
        const heat = row.find('td.ws').first().text().trim() || '0';

        topics.push({
          name: title,
          rank: Number(rankText || topics.length + 1),
          heat,
          url,
          source: 'tophub',
        });
      });
      return topics.length ? topics : null;
    } catch {
      return null;
    }
  }

  /** 从今日热榜首页按标题（含别名）匹配卡片 */
  private async fromTophubHome(platform: string, limit: number): Promise<RawTopic[] | null> {
    try {
      const html = await httpGetText(TOPHUB_URL, { timeoutMs: 12_000 });
      const $ = cheerio.load(html);
      const aliases = new Set([platform, ...(TOPHUB_HOME_ALIASES[platform] ?? [])]);
      const sections = $('.cc-cd');
      for (let i = 0; i < sections.length; i++) {
        const el = sections.eq(i);
        const label = el.find('.cc-cd-lb span').first().text().trim();
        if (!aliases.has(label)) continue;

        const topics: RawTopic[] = [];
        el.find('.cc-cd-cb-ll')
          .slice(0, limit)
          .each((_idx, node) => {
            const item = $(node);
            const title = item.find('span.t').text().trim();
            if (!title) return;
            topics.push({
              name: title,
              rank: Number(item.find('span.s').text().trim() || topics.length + 1),
              heat: item.find('span.e').text().trim() || '0',
              url: item.find('a').attr('href') ?? '',
              source: 'tophub' as const,
            });
          });
        return topics.length ? topics : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private resolveTophubNodeId(platform: string, tophubId?: string | null): string | null {
    const raw = (tophubId || '').trim();
    if (raw && !raw.includes('.')) return raw.replace(/^\/?n\//, '');
    return TOPHUB_NODE_IDS[platform] ?? (raw ? TOPHUB_NODE_IDS[raw] : undefined) ?? null;
  }

  private async fromTophub(
    platform: string,
    limit: number,
    tophubId?: string | null,
  ): Promise<RawTopic[] | null> {
    const nodeId = this.resolveTophubNodeId(platform, tophubId);
    if (nodeId) {
      const fromNode = await this.fromTophubNode(nodeId, limit);
      if (fromNode?.length) return fromNode;
    }
    return this.fromTophubHome(platform, limit);
  }

  private async fromVvhan(platform: string, limit: number): Promise<RawTopic[] | null> {
    try {
      const data = await httpGetJson<any>(VVHAN_API, { timeoutMs: 10_000 });
      if (!data?.success || !Array.isArray(data.data)) return null;
      const group = data.data.find((g: any) => g.name === platform);
      if (!group?.data) return null;
      return group.data.slice(0, limit).map((item: any, i: number) => ({
        name: String(item.title ?? '').trim(),
        rank: i + 1,
        heat: String(item.hot ?? item.hot_value ?? 0),
        url: String(item.url ?? ''),
        source: 'vvhan' as const,
      }));
    } catch {
      return null;
    }
  }

  /** 解析 RSS（RSS 2.0 与 Atom 兼容） */
  /** 人民日报：聚合官网多个频道 RSS（今日热榜节点常触发人机验证） */
  private async fromPeopleDaily(limit: number): Promise<RawTopic[] | null> {
    const feeds = [
      'http://www.people.com.cn/rss/politics.xml',
      'http://www.people.com.cn/rss/society.xml',
      'http://www.people.com.cn/rss/opinion.xml',
    ];
    const batches = await Promise.all(feeds.map((url) => this.fromRss(url, Math.max(8, Math.ceil(limit / 2)))));
    const lists = batches.filter((b): b is RawTopic[] => Boolean(b?.length));
    if (!lists.length) return null;

    const seen = new Set<string>();
    const out: RawTopic[] = [];
    let idx = 0;
    while (out.length < limit && lists.some((list) => idx < list.length)) {
      for (const list of lists) {
        if (out.length >= limit) break;
        const item = list[idx];
        if (!item || seen.has(item.name)) continue;
        seen.add(item.name);
        out.push({ ...item, rank: out.length + 1 });
      }
      idx += 1;
    }
    return out.length ? out : null;
  }

  private async fromRss(url: string, limit: number): Promise<RawTopic[] | null> {
    try {
      const xml = await httpGetText(url, { timeoutMs: 12_000 });
      const $ = cheerio.load(xml, { xmlMode: true });
      const topics: RawTopic[] = [];

      $('item')
        .slice(0, limit)
        .each((i, node) => {
          const item = $(node);
          const title = item.find('title').first().text().trim();
          if (!title) return;
          topics.push({
            name: title,
            rank: i + 1,
            heat: item.find('pubDate').first().text().trim(),
            url: item.find('link').first().text().trim(),
            source: 'rss',
          });
        });

      if (topics.length) return topics;

      $('entry')
        .slice(0, limit)
        .each((i, node) => {
          const entry = $(node);
          const title = entry.find('title').first().text().trim();
          if (!title) return;
          topics.push({
            name: title,
            rank: i + 1,
            heat: entry.find('updated').first().text().trim(),
            url: entry.find('link').attr('href') ?? '',
            source: 'rss',
          });
        });

      return topics.length ? topics : null;
    } catch {
      return null;
    }
  }

  private fromLocalCache(platform: string, limit: number): RawTopic[] {
    const rows = query<any>(
      `SELECT name, rank, heat, url, source FROM hot_topic_cache
       WHERE platform = ? ORDER BY rank ASC LIMIT ?`,
      [platform, limit],
    );
    return rows.map((r) => ({
      name: r.name,
      rank: r.rank,
      heat: r.heat,
      url: r.url,
      source: r.source,
    }));
  }

  async fetchPlatform(platform: HotPlatform, limit = 30): Promise<RawTopic[]> {
    const cached = this.memoryCache.get(platform.name);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.topics.slice(0, limit);
    }

    let topics: RawTopic[] | null = null;

    if (platform.name === '人民日报') {
      topics = await this.fromPeopleDaily(limit);
    } else if (platform.type === 'rss' && platform.rssUrl) {
      topics = await this.fromRss(platform.rssUrl, limit);
    } else {
      if (platform.zhiweiId) topics = await this.fromZhiwei(platform.zhiweiId);
      if (!topics && (platform.tophubId || TOPHUB_NODE_IDS[platform.name])) {
        topics = await this.fromTophub(platform.name, limit, platform.tophubId);
      }
      if (!topics) topics = await this.fromVvhan(platform.name, limit);
    }

    // 通用 RSS 兜底（例如预设同时带了 tophubId 与 rssUrl）
    if (!topics?.length && platform.rssUrl && platform.name !== '人民日报') {
      topics = await this.fromRss(platform.rssUrl, limit);
    }

    if (topics && topics.length) {
      this.memoryCache.set(platform.name, { at: Date.now(), topics });
      this.persist(platform.name, topics);
      return topics.slice(0, limit);
    }

    const fallback = this.fromLocalCache(platform.name, limit);
    if (fallback.length) {
      logger.warn(`${platform.name} 接口暂不可用，使用本地缓存 ${fallback.length} 条`);
      return fallback;
    }
    return [];
  }

  private persist(platform: string, topics: RawTopic[]): void {
    try {
      run('DELETE FROM hot_topic_cache WHERE platform = ?', [platform]);
      for (const t of topics.slice(0, 50)) {
        run(
          `INSERT INTO hot_topic_cache (platform, name, rank, heat, url, source)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [platform, t.name, t.rank, t.heat, t.url, t.source],
        );
      }
    } catch (err) {
      logger.warn(`热点缓存写入失败: ${(err as Error).message}`);
    }
  }

  /** 聚合所有启用平台 + RSS 订阅（并发） */
  async fetchAll(limit = 15): Promise<HotTopicGroup[]> {
    const cfg = configService.get();
    const enabled = cfg.platforms.filter((p) => p.enabled !== false);
    const rssList = query<any>('SELECT name, url FROM rss_subscriptions WHERE enabled = 1');

    const all: HotPlatform[] = [
      ...enabled,
      ...rssList.map((r) => ({
        name: r.name,
        weight: 0.05,
        enabled: true,
        type: 'rss' as const,
        rssUrl: r.url,
        zhiweiId: null,
        tophubId: null,
      })),
    ];

    return Promise.all(
      all.map(async (p): Promise<HotTopicGroup> => {
        try {
          const topics = await this.fetchPlatform(p, limit);
          return {
            platform: p.name,
            source: topics[0]?.source ?? 'none',
            ok: topics.length > 0,
            topics: topics.map((t) => ({
              platform: p.name,
              name: t.name,
              rank: t.rank,
              heat: t.heat,
              url: t.url,
              source: t.source,
              fetchedAt: new Date().toISOString(),
            })),
          };
        } catch (err) {
          return {
            platform: p.name,
            source: 'error',
            topics: [],
            ok: false,
            error: (err as Error).message,
          };
        }
      }),
    );
  }

  /** 按权重随机抽取一个话题（排名越靠前权重越高） */
  async pickTopic(cnt = 5): Promise<{ platform: string; topic: string }> {
    const enabled = configService
      .get()
      .platforms.filter((p) => p.enabled !== false);
    if (enabled.length === 0) return { platform: '本地', topic: '历史上的今天' };

    const platform = weightedRandom(enabled, (p) => p.weight);
    const topics = await this.fetchPlatform(platform, Math.max(cnt, 10));

    if (topics.length === 0) {
      logger.warn(`平台 ${platform.name} 暂无可用热榜，使用默认话题`);
      return { platform: platform.name, topic: '历史上的今天' };
    }

    const selected = weightedRandom(topics.slice(0, cnt), (_t, i) => 1 / (i + 1) ** 2);
    return {
      platform: platform.name,
      topic: selected.name.replace(/\|/g, '——').trim(),
    };
  }

  /** 黑马挖掘：热度显著高于均值但排名靠后的话题 */
  findBlackHorses(groups: HotTopicGroup[], topN = 10) {
    const horses: {
      platform: string;
      topic: string;
      rank: number;
      heat: number;
      score: number;
      reason: string;
    }[] = [];

    for (const g of groups) {
      if (!g.ok || g.topics.length === 0) continue;
      const heats = g.topics.map((t) => parseHeat(t.heat)).filter((n) => n > 0);
      if (heats.length < 3) continue;
      const avgHeat = heats.reduce((a, b) => a + b, 0) / heats.length;

      for (const t of g.topics) {
        const h = parseHeat(t.heat);
        if (h <= 0 || avgHeat <= 0) continue;
        const heatRatio = h / avgHeat;
        const rankRatio = t.rank / g.topics.length;
        const score = heatRatio * (1 - rankRatio);
        if (score > 1.15) {
          horses.push({
            platform: g.platform,
            topic: t.name,
            rank: t.rank,
            heat: h,
            score: Number(score.toFixed(3)),
            reason: `热度 ${formatHeat(h)}，约为榜单均值 ${formatHeat(avgHeat)} 的 ${heatRatio.toFixed(1)} 倍，但当前仅排第 ${t.rank} 位，预计 12 小时内有上升空间`,
          });
        }
      }
    }

    return horses.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  /** 趋势预测：基于本地快照的排名变化 */
  predictTrend(groups: HotTopicGroup[]) {
    const rows = query<any>(
      'SELECT platform, name, MAX(rank) AS best_rank, COUNT(*) AS hits FROM hot_topic_cache GROUP BY platform, name',
    );
    const bestRank = new Map<string, number>();
    for (const r of rows) bestRank.set(`${r.platform}::${r.name}`, r.best_rank);

    const predictions: {
      platform: string;
      topic: string;
      direction: 'up' | 'down' | 'flat';
      delta: number;
      heat: string;
    }[] = [];

    for (const g of groups) {
      const best = g.topics
        .slice(0, 15)
        .map((t) => ({ t, prev: bestRank.get(`${g.platform}::${t.name}`) }))
        .filter((x) => x.prev !== undefined);

      for (const { t, prev } of best) {
        const delta = (prev as number) - t.rank;
        if (delta === 0) continue;
        predictions.push({
          platform: g.platform,
          topic: t.name,
          direction: delta > 0 ? 'up' : 'down',
          delta,
          heat: t.heat,
        });
      }
    }

    return predictions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 20);
  }

  clearCache(): void {
    this.memoryCache.clear();
  }
}

function parseHeat(heat: string): number {
  if (!heat) return 0;
  const num = parseFloat(heat.replace(/[^\d.]/g, ''));
  if (Number.isNaN(num)) return 0;
  if (heat.includes('亿')) return num * 100_000_000;
  if (heat.includes('万')) return num * 10_000;
  return num;
}

function formatHeat(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return String(Math.round(n));
}

export const hotNewsService = new HotNewsService();
