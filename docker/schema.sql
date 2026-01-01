-- 主表：时间胶囊（含 send_at_ymd）
CREATE TABLE IF NOT EXISTS capsules (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL,
  content            TEXT NOT NULL,

  signer             TEXT,
  contact            TEXT,
  ip_addr            TEXT,

  send_at            INTEGER NOT NULL,      -- UTC 秒（由北京时区时间换算）
  send_at_ymd        TEXT NOT NULL,         -- YYYY-MM-DD（Asia/Shanghai）
  created_at         INTEGER NOT NULL,      -- UTC 秒
  created_on_ymd     TEXT NOT NULL,         -- YYYY-MM-DD（Asia/Shanghai）

  status             TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed|deleted|delivered|bounced
  last_error         TEXT,

  provider_email_id  TEXT,                  -- Resend email_id
  sent_at            INTEGER,
  delivered_at       INTEGER,
  bounced_at         INTEGER,
  bounce_reason      TEXT
);

-- 关键索引：扫描/限额/追踪
CREATE INDEX IF NOT EXISTS idx_capsules_status_sendat   ON capsules(status, send_at);
CREATE INDEX IF NOT EXISTS idx_capsules_send_at_ymd     ON capsules(send_at_ymd);
CREATE INDEX IF NOT EXISTS idx_capsules_created_on_ymd  ON capsules(created_on_ymd);
CREATE INDEX IF NOT EXISTS idx_capsules_ip              ON capsules(ip_addr);
CREATE INDEX IF NOT EXISTS idx_capsules_provider        ON capsules(provider_email_id);

-- 发送日志（用于 API 发送、事件与失败）
CREATE TABLE IF NOT EXISTS sends_log (
  id                 TEXT PRIMARY KEY,
  capsule_id         TEXT NOT NULL,
  sent_at            INTEGER NOT NULL,
  status             TEXT NOT NULL,         -- success|fail|event
  error              TEXT,
  provider_email_id  TEXT,
  event              TEXT                   -- api_sent|delivered|bounced|failed|api_failed
);

-- IP 限流：每天（北京时区）
CREATE TABLE IF NOT EXISTS rate_limit_daily (
  ip         TEXT NOT NULL,
  ymd        TEXT NOT NULL,                 -- YYYY-MM-DD
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,              -- UTC 秒
  PRIMARY KEY (ip, ymd)
);

-- IP 限流：10 分钟桶（北京时区）
CREATE TABLE IF NOT EXISTS rate_limit_bucket (
  ip         TEXT NOT NULL,
  bucket     TEXT NOT NULL,                 -- YYYYMMDDHHmm（mm=0/10/20/30/40/50）
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (ip, bucket)
);

-- 站点设置（单行表，id=1）
CREATE TABLE IF NOT EXISTS settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  ip_daily_limit     INTEGER NOT NULL DEFAULT 20,
  ip_10min_limit     INTEGER NOT NULL DEFAULT 5,
  min_lead_seconds   INTEGER NOT NULL DEFAULT 3600,
  daily_create_limit INTEGER NOT NULL DEFAULT 80
);
INSERT OR IGNORE INTO settings (id, ip_daily_limit, ip_10min_limit, min_lead_seconds, daily_create_limit)
VALUES (1, 20, 5, 3600, 80);