export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

-- ============================================================
-- 应用配置（key-value 单行存储）
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- 账号与会话
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  username            TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL DEFAULT '',
  password_hash       TEXT NOT NULL,
  password_salt       TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'editor',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  enabled             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_login_at       TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip          TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at  TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL,
  ip          TEXT NOT NULL DEFAULT '',
  ok          INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_username ON login_attempts(username, created_at);

-- ============================================================
-- 文章
-- ============================================================
CREATE TABLE IF NOT EXISTS articles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  topic       TEXT    DEFAULT '',
  platform    TEXT    NOT NULL DEFAULT 'wechat',
  category    TEXT    DEFAULT '',
  format      TEXT    NOT NULL DEFAULT 'html',
  content     TEXT    NOT NULL DEFAULT '',
  summary     TEXT    DEFAULT '',
  cover_path  TEXT,
  tags        TEXT    DEFAULT '',
  source      TEXT    NOT NULL DEFAULT 'ai',
  track_id    INTEGER,
  scene_id    INTEGER,
  word_count  INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'draft',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_articles_created  ON articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_platform ON articles(platform);
CREATE INDEX IF NOT EXISTS idx_articles_status   ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_source   ON articles(source);
CREATE INDEX IF NOT EXISTS idx_articles_track    ON articles(track_id);
CREATE INDEX IF NOT EXISTS idx_articles_scene    ON articles(scene_id);

-- 文章发布记录
CREATE TABLE IF NOT EXISTS article_publish_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id   INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  platform     TEXT    NOT NULL,
  account_info TEXT    DEFAULT '{}',
  success      INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  publish_id   TEXT,
  url          TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_pubrec_article ON article_publish_records(article_id);
CREATE INDEX IF NOT EXISTS idx_pubrec_time    ON article_publish_records(created_at DESC);

-- ============================================================
-- 模板
-- ============================================================
CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  category   TEXT    NOT NULL,
  content    TEXT    NOT NULL DEFAULT '',
  builtin    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(category, name)
);
CREATE INDEX IF NOT EXISTS idx_templates_cat ON templates(category);

-- ============================================================
-- 专家赛道
-- ============================================================
CREATE TABLE IF NOT EXISTS expert_tracks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL UNIQUE,
  slug           TEXT    NOT NULL UNIQUE,
  description    TEXT    DEFAULT '',
  audience       TEXT    DEFAULT '',
  boundary       TEXT    DEFAULT '',
  structure      TEXT    DEFAULT '',
  style          TEXT    DEFAULT '',
  quality_bar    TEXT    DEFAULT '',
  compliance     TEXT    DEFAULT '',
  examples       TEXT    DEFAULT '',
  default_params TEXT    DEFAULT '{}',
  enabled        INTEGER NOT NULL DEFAULT 1,
  is_builtin     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS expert_track_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id   INTEGER NOT NULL REFERENCES expert_tracks(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  audience   TEXT    DEFAULT '',
  depth      TEXT    NOT NULL DEFAULT 'standard',
  platform   TEXT    DEFAULT 'wechat',
  style      TEXT    DEFAULT '',
  strategy   TEXT    DEFAULT '',
  word_min   INTEGER NOT NULL DEFAULT 1000,
  word_max   INTEGER NOT NULL DEFAULT 2000,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tpl_track ON expert_track_templates(track_id);

-- ============================================================
-- 文案武库
-- ============================================================
CREATE TABLE IF NOT EXISTS copywriting_scenes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  category_label  TEXT    NOT NULL,
  description     TEXT    DEFAULT '',
  structure       TEXT    DEFAULT '',
  hooks           TEXT    DEFAULT '',
  tone            TEXT    DEFAULT '',
  forbidden       TEXT    DEFAULT '',
  compliance      TEXT    DEFAULT '',
  need_line_break INTEGER NOT NULL DEFAULT 0,
  built_in        INTEGER NOT NULL DEFAULT 0,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_scenes_cat ON copywriting_scenes(category);

-- 场景旋钮档位
CREATE TABLE IF NOT EXISTS copywriting_knobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id   INTEGER NOT NULL REFERENCES copywriting_scenes(id) ON DELETE CASCADE,
  knob       TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE(scene_id, knob, value)
);

-- 场景成品沉淀（仿写骨架）
CREATE TABLE IF NOT EXISTS copywriting_presets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id   INTEGER NOT NULL REFERENCES copywriting_scenes(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  structure  TEXT    DEFAULT '',
  hooks      TEXT    DEFAULT '',
  body       TEXT    DEFAULT '',
  source     TEXT    DEFAULT 'imitate',
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- 资源图库
-- ============================================================
CREATE TABLE IF NOT EXISTS image_assets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL DEFAULT '',
  file_name  TEXT    NOT NULL,
  url        TEXT    NOT NULL,
  prompt     TEXT    DEFAULT '',
  source     TEXT    NOT NULL DEFAULT 'upload',
  style      TEXT    DEFAULT '',
  tags       TEXT    DEFAULT '',
  width      INTEGER NOT NULL DEFAULT 0,
  height     INTEGER NOT NULL DEFAULT 0,
  size       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_images_source ON image_assets(source);
CREATE INDEX IF NOT EXISTS idx_images_style  ON image_assets(style);

CREATE TABLE IF NOT EXISTS image_style_presets (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE,
  prompt_template TEXT    NOT NULL DEFAULT '',
  negative_prompt TEXT    NOT NULL DEFAULT '',
  category        TEXT    NOT NULL DEFAULT '通用',
  builtin         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- 素材文库
-- ============================================================
CREATE TABLE IF NOT EXISTS library_articles (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL,
  author           TEXT    DEFAULT '',
  account_name     TEXT    DEFAULT '',
  account_biz      TEXT    DEFAULT '',
  url              TEXT    NOT NULL,
  content_html     TEXT    NOT NULL DEFAULT '',
  content_text     TEXT    NOT NULL DEFAULT '',
  content_markdown TEXT    NOT NULL DEFAULT '',
  images           TEXT    NOT NULL DEFAULT '[]',
  publish_time     TEXT    DEFAULT '',
  digest           TEXT    DEFAULT '',
  word_count       INTEGER NOT NULL DEFAULT 0,
  tags             TEXT    DEFAULT '',
  used_count       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(url)
);
CREATE INDEX IF NOT EXISTS idx_lib_account ON library_articles(account_name);
CREATE INDEX IF NOT EXISTS idx_lib_created ON library_articles(created_at DESC);

CREATE TABLE IF NOT EXISTS library_accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  biz              TEXT    NOT NULL DEFAULT '',
  wechat_id        TEXT    DEFAULT '',
  last_fetch_at    TEXT,
  last_article_url TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS topic_ideas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  topic           TEXT    NOT NULL,
  score           REAL    NOT NULL DEFAULT 0,
  reason          TEXT    DEFAULT '',
  angles          TEXT    DEFAULT '',
  ref_article_ids TEXT    DEFAULT '[]',
  status          INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- 小说连载
-- ============================================================
CREATE TABLE IF NOT EXISTS novels (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT    NOT NULL,
  genre          TEXT    DEFAULT '',
  synopsis       TEXT    DEFAULT '',
  world_setting  TEXT    DEFAULT '',
  style          TEXT    DEFAULT '',
  theme          TEXT    DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'writing',
  target_words   INTEGER NOT NULL DEFAULT 200000,
  finished_words INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS novel_volumes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id    INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  summary     TEXT    DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_vol_novel ON novel_volumes(novel_id);

CREATE TABLE IF NOT EXISTS novel_characters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id     INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  role         TEXT    DEFAULT '',
  appearance   TEXT    DEFAULT '',
  personality  TEXT    DEFAULT '',
  background   TEXT    DEFAULT '',
  motivation   TEXT    DEFAULT '',
  speech_style TEXT    DEFAULT '',
  arc          TEXT    DEFAULT '',
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_char_novel ON novel_characters(novel_id);

CREATE TABLE IF NOT EXISTS novel_chapters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id    INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  volume_id   INTEGER,
  title       TEXT    NOT NULL,
  outline     TEXT    DEFAULT '',
  content     TEXT    DEFAULT '',
  word_count  INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'outline',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_chap_novel ON novel_chapters(novel_id, order_index);

CREATE TABLE IF NOT EXISTS novel_foreshadows (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id       INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  description    TEXT    DEFAULT '',
  plant_chapter  TEXT    DEFAULT '',
  payoff_chapter TEXT    DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'planted',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS novel_memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id   INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  scope      TEXT    NOT NULL DEFAULT 'short',
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL DEFAULT '',
  weight     REAL    NOT NULL DEFAULT 1.0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_mem_novel ON novel_memories(novel_id, scope);

-- ============================================================
-- 热点缓存 + RSS 订阅
-- ============================================================
CREATE TABLE IF NOT EXISTS hot_topic_cache (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  platform   TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  rank       INTEGER NOT NULL DEFAULT 0,
  heat       TEXT    DEFAULT '0',
  url        TEXT    DEFAULT '',
  source     TEXT    NOT NULL DEFAULT 'zhiwei',
  fetched_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_hot_platform ON hot_topic_cache(platform, fetched_at DESC);

CREATE TABLE IF NOT EXISTS rss_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  url        TEXT    NOT NULL,
  category   TEXT    NOT NULL DEFAULT 'RSS',
  weight     REAL    NOT NULL DEFAULT 0.05,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- 任务与日志
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topic       TEXT    NOT NULL,
  platform    TEXT    DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'idle',
  stage       TEXT    DEFAULT '',
  progress    INTEGER NOT NULL DEFAULT 0,
  article_id  INTEGER,
  error       TEXT,
  started_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  finished_at TEXT,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_started ON tasks(started_at DESC);

CREATE TABLE IF NOT EXISTS workflow_metrics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow      TEXT    NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  total_ms      INTEGER NOT NULL DEFAULT 0,
  last_status   TEXT    NOT NULL DEFAULT '',
  last_run_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(workflow)
);

-- ============================================================
-- 提示词资源库
-- ============================================================
CREATE TABLE IF NOT EXISTS prompt_presets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  category   TEXT    NOT NULL DEFAULT '通用',
  content    TEXT    NOT NULL,
  builtin    INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_prompt_cat ON prompt_presets(category);
`;

export const SCHEMA_VERSION = 1;
