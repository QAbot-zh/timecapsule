import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import { createHmac, randomUUID, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// ---------- 环境变量 ----------
const env = {
  DATABASE_PATH: process.env.DATABASE_PATH || './data/capsules.db',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  FROM_EMAIL: process.env.FROM_EMAIL || 'Time Capsule <noreply@example.com>',
  BASE_URL: process.env.BASE_URL || '',
  CONTACT_EMAIL: process.env.CONTACT_EMAIL || '',
  PORT: parseInt(process.env.PORT || '3000', 10),
  IP_DAILY_LIMIT: parseInt(process.env.IP_DAILY_LIMIT || '20', 10),
  IP_10MIN_LIMIT: parseInt(process.env.IP_10MIN_LIMIT || '5', 10),
  DAILY_CREATE_LIMIT: parseInt(process.env.DAILY_CREATE_LIMIT || '80', 10),
};

// ---------- 数据库初始化 ----------
// 确保数据目录存在
const dataDir = dirname(env.DATABASE_PATH);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
  console.log(`[DB] Created directory: ${dataDir}`);
}

const db: InstanceType<typeof Database> = new Database(env.DATABASE_PATH);
db.pragma('journal_mode = WAL');

// 自动初始化数据库表结构
function initDatabase() {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // 尝试多个位置查找 schema.sql
  const schemaPaths = [
    resolve(__dirname, '../../schema.sql'),      // docker/schema.sql
    resolve(__dirname, '../../../schema.sql'),   // 项目根目录/schema.sql
    resolve(process.cwd(), 'schema.sql'),        // 当前工作目录
  ];

  let schema: string | null = null;
  for (const p of schemaPaths) {
    if (existsSync(p)) {
      schema = readFileSync(p, 'utf-8');
      console.log(`[DB] Using schema from: ${p}`);
      break;
    }
  }

  if (!schema) {
    // 内置 schema 作为后备
    console.log('[DB] Using built-in schema');
    schema = `
CREATE TABLE IF NOT EXISTS capsules (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, content TEXT NOT NULL,
  signer TEXT, contact TEXT, ip_addr TEXT,
  send_at INTEGER NOT NULL, send_at_ymd TEXT NOT NULL,
  created_at INTEGER NOT NULL, created_on_ymd TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', last_error TEXT,
  provider_email_id TEXT, sent_at INTEGER, delivered_at INTEGER,
  bounced_at INTEGER, bounce_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_capsules_status_sendat ON capsules(status, send_at);
CREATE INDEX IF NOT EXISTS idx_capsules_send_at_ymd ON capsules(send_at_ymd);
CREATE INDEX IF NOT EXISTS idx_capsules_created_on_ymd ON capsules(created_on_ymd);
CREATE INDEX IF NOT EXISTS idx_capsules_ip ON capsules(ip_addr);
CREATE INDEX IF NOT EXISTS idx_capsules_provider ON capsules(provider_email_id);

CREATE TABLE IF NOT EXISTS sends_log (
  id TEXT PRIMARY KEY, capsule_id TEXT NOT NULL, sent_at INTEGER NOT NULL,
  status TEXT NOT NULL, error TEXT, provider_email_id TEXT, event TEXT
);

CREATE TABLE IF NOT EXISTS rate_limit_daily (
  ip TEXT NOT NULL, ymd TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, PRIMARY KEY (ip, ymd)
);

CREATE TABLE IF NOT EXISTS rate_limit_bucket (
  ip TEXT NOT NULL, bucket TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, PRIMARY KEY (ip, bucket)
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ip_daily_limit INTEGER NOT NULL DEFAULT 20,
  ip_10min_limit INTEGER NOT NULL DEFAULT 5,
  min_lead_seconds INTEGER NOT NULL DEFAULT 3600,
  daily_create_limit INTEGER NOT NULL DEFAULT 80
);
INSERT OR IGNORE INTO settings (id, ip_daily_limit, ip_10min_limit, min_lead_seconds, daily_create_limit)
VALUES (1, 20, 5, 3600, 80);
`;
  }

  db.exec(schema);
  console.log('[DB] Database initialized successfully');
}

initDatabase();

// ---------- 常量 ----------
const TEXT_HTML = { 'Content-Type': 'text/html; charset=UTF-8' };
const JSON_TYPE = { 'Content-Type': 'application/json; charset=UTF-8' };
const COOKIE_NAME = 'admin_session';
const COOKIE_MAX_AGE = 24 * 3600; // 1 day
const TZ_OFFSET_SEC = 8 * 3600;   // Asia/Shanghai = UTC+8

// ---------- Time helpers (Asia/Shanghai) ----------
function toUnixSecondsShanghai(input: string): number | null {
  try {
    const [date, time] = input.split('T');
    if (!date || !time) return null;
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const utcMs = Date.UTC(y, m - 1, d, hh - 8, mm, 0, 0);
    return Math.floor(utcMs / 1000);
  } catch { return null; }
}

function ymdShanghaiFromEpoch(tsSec: number): string {
  return new Date((tsSec + TZ_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}

function fmtShanghai(tsSec: number): string {
  return new Date((tsSec + TZ_OFFSET_SEC) * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function defaultFormValueShanghaiPlus(sec: number): string {
  const ms = Date.now() + (sec * 1000) + TZ_OFFSET_SEC * 1000;
  return new Date(ms).toISOString().slice(0, 16);
}

function humanizeSeconds(sec: number): string {
  if (sec <= 0) return '无最小提前量';
  const units: Array<[number, string]> = [
    [30 * 24 * 3600, '30 天'], [7 * 24 * 3600, '7 天'],
    [3 * 24 * 3600, '3 天'], [24 * 3600, '1 天'],
    [12 * 3600, '12 小时'], [6 * 3600, '6 小时'], [3600, '1 小时'],
    [30 * 60, '30 分钟'], [10 * 60, '10 分钟'], [60, '1 分钟']
  ];
  for (const [u, name] of units) if (sec >= u) return name;
  return `${sec} 秒`;
}

// ---------- Misc utils ----------
function hmacSha256(keyStr: string, data: string): string {
  return createHmac('sha256', keyStr).update(data).digest('base64url');
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ---------- Settings ----------
type Settings = {
  ip_daily_limit: number;
  ip_10min_limit: number;
  min_lead_seconds: number;
  daily_create_limit: number;
};

function readSettings(): Settings {
  const row = db.prepare(
    'SELECT ip_daily_limit, ip_10min_limit, min_lead_seconds, daily_create_limit FROM settings WHERE id=1'
  ).get() as Settings | undefined;
  if (row) return row;

  const s: Settings = {
    ip_daily_limit: env.IP_DAILY_LIMIT,
    ip_10min_limit: env.IP_10MIN_LIMIT,
    min_lead_seconds: 3600,
    daily_create_limit: env.DAILY_CREATE_LIMIT
  };
  db.prepare(
    'INSERT OR REPLACE INTO settings (id, ip_daily_limit, ip_10min_limit, min_lead_seconds, daily_create_limit) VALUES (1,?,?,?,?)'
  ).run(s.ip_daily_limit, s.ip_10min_limit, s.min_lead_seconds, s.daily_create_limit);
  return s;
}

function updateSettings(s: Settings) {
  db.prepare(
    'UPDATE settings SET ip_daily_limit=?, ip_10min_limit=?, min_lead_seconds=?, daily_create_limit=? WHERE id=1'
  ).run(s.ip_daily_limit, s.ip_10min_limit, s.min_lead_seconds, s.daily_create_limit);
}

// ---------- Validation ----------
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- Auth ----------
function isAuthed(cookieHeader: string | undefined): boolean {
  const cookies = parseCookies(cookieHeader);
  const val = cookies[COOKIE_NAME];
  if (!val) return false;
  const parts = val.split('.');
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return false;
  const expect = hmacSha256(env.ADMIN_PASSWORD, expStr);
  return sig === expect;
}

// ---------- Rate limiting ----------
function clientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || '0.0.0.0';
}

function tenMinBucketShanghai(tsSec: number): string {
  const d = new Date((tsSec + TZ_OFFSET_SEC) * 1000);
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = Math.floor(d.getUTCMinutes() / 10) * 10;
  const mmStr = String(mm).padStart(2, '0');
  return `${y}${m}${day}${hh}${mmStr}`;
}

function bumpIpCountersOr429(ip: string, nowSec: number, s: Settings): { ok: true } | { ok: false; message: string } {
  const ymd = ymdShanghaiFromEpoch(nowSec);
  const bucket = tenMinBucketShanghai(nowSec);

  db.prepare(
    `INSERT INTO rate_limit_daily (ip, ymd, count, updated_at) VALUES (?,?,1,?)
     ON CONFLICT(ip, ymd) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
  ).run(ip, ymd, nowSec);

  db.prepare(
    `INSERT INTO rate_limit_bucket (ip, bucket, count, updated_at) VALUES (?,?,1,?)
     ON CONFLICT(ip, bucket) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
  ).run(ip, bucket, nowSec);

  const rowDaily = db.prepare('SELECT count FROM rate_limit_daily WHERE ip=? AND ymd=?').get(ip, ymd) as { count: number } | undefined;
  const rowWin = db.prepare('SELECT count FROM rate_limit_bucket WHERE ip=? AND bucket=?').get(ip, bucket) as { count: number } | undefined;

  const sDaily = rowDaily?.count ?? 0;
  const sWin = rowWin?.count ?? 0;

  if (sDaily > s.ip_daily_limit) {
    return { ok: false, message: `该 IP 今日次数已达上限（${s.ip_daily_limit}）` };
  }
  if (sWin > s.ip_10min_limit) {
    return { ok: false, message: `该 IP 操作过于频繁，请稍后再试` };
  }
  return { ok: true };
}

// ---------- Resend ----------
async function sendEmail(to: string, subject: string, html: string): Promise<string> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, html })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  const j = await r.json() as { id?: string };
  return j.id || '';
}

// ---------- Webhook 验证（Resend/Svix） ----------
function b64ToBytes(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}

function verifySvixSignature(raw: string, headers: Record<string, string>): boolean {
  if (!env.RESEND_WEBHOOK_SECRET) return false;
  const id = headers['svix-id'] || '';
  const ts = headers['svix-timestamp'] || '';
  const sig = headers['svix-signature'] || '';
  if (!id || !ts || !sig) return false;

  const content = `${id}.${ts}.${raw}`;
  const keyB64 = env.RESEND_WEBHOOK_SECRET.split('_')[1] || '';
  const keyBytes = b64ToBytes(keyB64);
  const expected = createHmac('sha256', keyBytes).update(content).digest('base64');

  const parts = sig.split(' ').map(s => s.split(',')[1]).filter(Boolean);
  return parts.some(p => {
    try {
      return cryptoTimingSafeEqual(Buffer.from(p), Buffer.from(expected));
    } catch {
      return p === expected;
    }
  });
}

// ---------- Public status ----------
type CapsulePublic = {
  id: string; status: string; send_at: number;
  sent_at?: number | null; delivered_at?: number | null;
  bounced_at?: number | null; bounce_reason?: string | null;
  now: number;
};

function getCapsulePublic(id: string): CapsulePublic | null {
  const row = db.prepare(
    `SELECT id,status,send_at,sent_at,delivered_at,bounced_at,bounce_reason
     FROM capsules WHERE id=? AND status!='deleted'`
  ).get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    send_at: row.send_at,
    sent_at: row.sent_at ?? null,
    delivered_at: row.delivered_at ?? null,
    bounced_at: row.bounced_at ?? null,
    bounce_reason: row.bounce_reason ?? null,
    now: Math.floor(Date.now() / 1000)
  };
}

// ---------- Markdown to HTML ----------
function markdownToHtml(md: string): string {
  if (!md) return '';

  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 表格
  html = html.replace(/(\|.+\|\s*\n)+/g, (tableBlock) => {
    const lines = tableBlock.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return tableBlock;

    const headerLine = lines[0];
    const bodyLines = lines.slice(2);

    const parseRow = (line: string, isHeader: boolean) => {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      const tag = isHeader ? 'th' : 'td';
      const style = isHeader
        ? 'border:1px solid rgba(138,103,184,0.3);padding:10px 12px;background:rgba(147,112,219,0.12);color:#6b4ba6;font-weight:600;text-align:left'
        : 'border:1px solid rgba(138,103,184,0.2);padding:8px 12px';
      return '<tr>' + cells.map(c => `<${tag} style="${style}">${c}</${tag}>`).join('') + '</tr>';
    };

    const header = parseRow(headerLine, true);
    const body = bodyLines.map(l => parseRow(l, false)).join('');

    return `\n<table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid rgba(138,103,184,0.2);border-radius:8px;overflow:hidden">
      <thead>${header}</thead>
      <tbody>${body}</tbody>
    </table>\n`;
  });

  // TODO 列表
  html = html
    .replace(/^- \[x\] (.*)$/gim, '___TODO_DONE___$1___END_TODO___')
    .replace(/^- \[ \] (.*)$/gim, '___TODO_PENDING___$1___END_TODO___');

  // 标题
  html = html
    .replace(/^### (.*$)/gim, '<h3 style="color:#6b4ba6;margin:20px 0 10px 0;font-size:18px;font-weight:600">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="color:#6b4ba6;margin:24px 0 12px 0;font-size:20px;font-weight:600">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="color:#6b4ba6;margin:28px 0 14px 0;font-size:24px;font-weight:700">$1</h1>');

  // 行内样式
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#6b4ba6">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="font-style:italic">$1</em>')
    .replace(/~~(.+?)~~/g, '<s style="text-decoration:line-through;opacity:0.7">$1</s>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(147,112,219,0.1);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:14px">$1</code>');

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#9370db;text-decoration:underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // 分割线
  html = html.replace(/^---+$/gim, '<hr style="border:0;border-top:2px solid rgba(138,103,184,0.2);margin:20px 0"/>');

  // 引用
  html = html.replace(/^&gt; (.*)$/gim, '<blockquote style="border-left:4px solid #9370db;padding:12px 16px;margin:12px 0;color:#6b4ba6;background:rgba(147,112,219,0.05);border-radius:8px">$1</blockquote>');

  // 普通无序列表
  html = html.replace(/^\- (.*)$/gim, '___LI___$1___END_LI___');

  // 还原 TODO 和列表项
  html = html
    .replace(/___TODO_DONE___(.+?)___END_TODO___/g, '<li style="list-style:none;margin:4px 0;padding-left:0"><span style="color:#10b981;font-size:16px;margin-right:8px">☑</span><s style="opacity:0.6">$1</s></li>')
    .replace(/___TODO_PENDING___(.+?)___END_TODO___/g, '<li style="list-style:none;margin:4px 0;padding-left:0"><span style="color:#9370db;font-size:16px;margin-right:8px">☐</span>$1</li>')
    .replace(/___LI___(.+?)___END_LI___/g, '<li style="margin:4px 0">$1</li>');

  // 包裹连续的 <li> 为 <ul>
  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, (match) => {
    return `<ul style="margin:4px 0;padding-left:24px;line-height:1.8">${match}</ul>`;
  });

  // 段落和换行
  html = html
    .split('\n\n')
    .map(block => {
      if (block.trim().match(/^<(table|h[1-6]|ul|blockquote|hr)/)) {
        return block;
      }
      return '<p style="margin:12px 0;line-height:1.8">' + block.replace(/\n/g, '<br/>') + '</p>';
    })
    .join('\n');

  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');

  return html;
}

// ---------- Email template ----------
function renderEmailTemplate(params: { content: string; site?: string; capsuleId: string; sendAtShanghai: string; createdAtShanghai: string; signer?: string | null; contact?: string | null; }) {
  const { content, site, capsuleId, sendAtShanghai, createdAtShanghai, signer, contact } = params;
  const body = markdownToHtml(content);

  const extra = (signer || contact) ? `<div style="margin-top:16px;font-size:14px;color:#6b4ba6">
    ${signer ? `<div>落款：${escapeHtml(signer)}</div>` : ``}
    ${contact ? `<div>联系方式：${escapeHtml(contact)}</div>` : ``}
  </div>` : '';
  const btn = (site && site.length) ? `<a href="${site.replace(/"/g, '&quot;')}/status/${capsuleId}" target="_blank" style="display:inline-block;padding:12px 20px;border-radius:12px;background:linear-gradient(135deg,#9370db,#ba55d3);color:#fff;text-decoration:none;font-weight:600;font-size:15px">查看胶囊状态</a>` : '';
  return `
  <div style="background:linear-gradient(135deg, #e6e6fa 0%, #f0e6fa 50%, #fae6f0 100%);padding:32px;font-family:system-ui,-apple-system,Segoe UI,Roboto,'Noto Sans',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden">
      你的时间胶囊到了：${sendAtShanghai}（北京时间）💌
    </div>
    <table role="presentation" style="width:100%;max-width:680px;margin:0 auto;background:rgba(255,255,255,0.98);border-radius:24px;overflow:hidden;border:2px solid rgba(138,103,184,0.2);box-shadow:0 20px 60px rgba(138,103,184,0.2)">
      <tr><td style="padding:0">
          <div style="background:linear-gradient(135deg,#9370db,#ba55d3);padding:24px 28px;color:#fff">
            <div style="font-size:22px;font-weight:700;letter-spacing:0.5px">✉️ 时间胶囊</div>
            <div style="font-size:14px;opacity:.95;margin-top:4px">投递时间：${createdAtShanghai}</div>
            <div style="font-size:14px;opacity:.95;margin-top:4px">寄达时间：${sendAtShanghai}</div>
          </div>
      </td></tr>
      <tr><td style="padding:28px 28px 16px 28px">
          <div style="line-height:1.8;font-size:16px;color:#2d1b4e;border-left:4px solid #9370db;padding-left:16px;background:rgba(147,112,219,0.05);padding:16px;border-radius:8px">${body}</div>
          ${extra}
          <div style="margin-top:24px;text-align:center">${btn}</div>
      </td></tr>
      <tr><td style="padding:20px 28px;border-top:2px solid rgba(138,103,184,0.12);color:#8b7ba8;font-size:13px">
          邮件编号：${capsuleId}<br/>本邮件由系统自动发送，请勿直接回复。
      </td></tr>
    </table>
    <div style="text-align:center;margin-top:16px;font-size:13px;color:#9b8bb8">
      © ${new Date().getUTCFullYear()} 时间胶囊 · 用心守护每一份关怀 💜
    </div>
  </div>`;
}

// ---------- Cron Job: 发送到期胶囊 ----------
async function processPendingCapsules() {
  const nowSec = Math.floor(Date.now() / 1000);
  const results = db.prepare(
    `SELECT id,email,content,signer,contact,send_at,created_at FROM capsules
     WHERE status='pending' AND send_at <= ? LIMIT 50`
  ).all(nowSec) as any[];

  if (!results?.length) return;

  for (const row of results) {
    const id = row.id as string;
    try {
      const subject = '你的时间胶囊到了 💌';
      const sendAtShanghai = fmtShanghai(row.send_at as number);
      const createdAtShanghai = fmtShanghai(row.created_at as number);
      const html = renderEmailTemplate({
        content: row.content as string,
        signer: (row.signer as string) || null,
        contact: (row.contact as string) || null,
        site: env.BASE_URL,
        capsuleId: id,
        sendAtShanghai,
        createdAtShanghai
      });

      const providerId = await sendEmail(row.email, subject, html);
      const sentAt = Math.floor(Date.now() / 1000);

      db.prepare('UPDATE capsules SET status=?, sent_at=?, provider_email_id=?, last_error=NULL WHERE id=?')
        .run('sent', sentAt, providerId || null, id);
      db.prepare('INSERT INTO sends_log (id,capsule_id,sent_at,status,error,provider_email_id,event) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), id, sentAt, 'success', null, providerId || null, 'api_sent');

      console.log(`[Cron] Sent capsule ${id} to ${row.email}`);
    } catch (err: any) {
      db.prepare('UPDATE capsules SET status=?, last_error=? WHERE id=?')
        .run('failed', String(err?.message || err || 'send failed'), id);
      db.prepare('INSERT INTO sends_log (id,capsule_id,sent_at,status,error,event) VALUES (?,?,?,?,?,?)')
        .run(randomUUID(), id, Math.floor(Date.now() / 1000), 'fail', String(err?.message || err), 'api_failed');

      console.error(`[Cron] Failed to send capsule ${id}:`, err);
    }
  }
}

// ---------- HTML Pages (imported from worker.ts) ----------
import { htmlPage, indexPage, thanksPage, renderStatusPage, renderNotFoundPage, adminPage, adminStatsPage, settingsOptions } from './pages.js';

// ---------- Hono App ----------
const app = new Hono();

// Health check
app.get('/health', (c) => {
  try {
    const row = db.prepare('SELECT 1 as ok').get();
    return c.json({ ok: true, sqlite: !!row });
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

// Index page
app.get('/', (c) => {
  const s = readSettings();
  return c.html(indexPage(s));
});

// Thanks page
app.get('/thanks', (c) => {
  const id = c.req.query('id') || undefined;
  return c.html(thanksPage(id));
});

// Public status page
app.get('/status/:id', (c) => {
  const id = decodeURIComponent(c.req.param('id') || '');
  const capsule = getCapsulePublic(id);
  if (!capsule) return c.html(renderNotFoundPage());
  return c.html(renderStatusPage(capsule, env.CONTACT_EMAIL));
});

// Public status API
app.get('/api/status/:id', (c) => {
  const id = decodeURIComponent(c.req.param('id') || '');
  const capsule = getCapsulePublic(id);
  if (!capsule) return c.json({ ok: false, message: 'not found' }, 404);
  const left = Math.max(0, capsule.send_at - capsule.now);
  return c.json({
    id: capsule.id,
    status: capsule.status,
    send_at: capsule.send_at,
    send_at_shanghai: fmtShanghai(capsule.send_at),
    countdown_seconds: left,
    sent_at: capsule.sent_at || null,
    delivered_at: capsule.delivered_at || null,
    bounced_at: capsule.bounced_at || null,
    bounce_reason: capsule.bounce_reason || null,
    tz: 'Asia/Shanghai'
  });
});

// Submit capsule
app.post('/api/submit', async (c) => {
  const s = readSettings();
  const ct = c.req.header('content-type') || '';

  let email = '', content = '', sendAtStr = '', sign = '', contact = '';

  if (ct.includes('application/json')) {
    const data = await c.req.json();
    email = (data.email || '').trim();
    content = (data.content || '').trim();
    sendAtStr = (data.send_at || '').trim();
    sign = (data.sign || data.signer || '').trim();
    contact = (data.contact || '').trim();
  } else {
    const form = await c.req.formData();
    email = String(form.get('email') || '').trim();
    content = String(form.get('content') || '').trim();
    sendAtStr = String(form.get('send_at') || '').trim();
    sign = String(form.get('sign') || '').trim();
    contact = String(form.get('contact') || '').trim();
  }

  // IP 限流
  const nowSec = Math.floor(Date.now() / 1000);
  const ip = clientIp(c);
  const rateResult = bumpIpCountersOr429(ip, nowSec, s);
  if (!rateResult.ok) {
    return c.json({ ok: false, message: rateResult.message }, 429);
  }

  // 校验
  if (!content) return c.json({ ok: false, message: '内容不能为空' }, 400);
  if (!isValidEmail(email)) return c.json({ ok: false, message: '邮箱格式不正确' }, 400);
  const sendAt = toUnixSecondsShanghai(sendAtStr);
  if (!sendAt) return c.json({ ok: false, message: '投递时间格式不正确' }, 400);
  if (sendAt < nowSec + s.min_lead_seconds) {
    return c.json({ ok: false, message: `投递时间需不早于当前时间 + ${humanizeSeconds(s.min_lead_seconds)}（以北京时区计算）` }, 400);
  }

  // 每天投递上限
  const sendAtYmd = ymdShanghaiFromEpoch(sendAt);
  const row = db.prepare(
    "SELECT COUNT(*) AS c FROM capsules WHERE send_at_ymd=? AND status!='deleted'"
  ).get(sendAtYmd) as { c: number };

  if ((row?.c ?? 0) >= s.daily_create_limit) {
    return c.json({ ok: false, message: `${sendAtYmd} 当天投递已达上限（${s.daily_create_limit}），请选择其他日期` }, 429);
  }

  // 入库
  const id = randomUUID();
  const createdYmd = ymdShanghaiFromEpoch(nowSec);
  db.prepare(
    `INSERT INTO capsules (id,email,content,signer,contact,ip_addr,send_at,send_at_ymd,created_at,created_on_ymd,status)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')`
  ).run(id, email, content, sign || null, contact || null, ip, sendAt, sendAtYmd, nowSec, createdYmd);

  const statusUrl = `/status/${id}`;
  if ((c.req.header('accept') || '').includes('text/html')) {
    return c.redirect(`/thanks?id=${id}`);
  }
  return c.json({ ok: true, id, status_url: statusUrl });
});

// Admin pages
app.get('/admin', (c) => {
  const authed = isAuthed(c.req.header('cookie'));
  if (!authed) {
    return c.html(adminPage(false, null, readSettings()));
  }

  const statusFilter = c.req.query('status') || '';
  const searchEmail = c.req.query('email') || '';
  const searchId = c.req.query('id') || '';

  let query = `SELECT id,email,content,signer,contact,ip_addr,send_at,created_at,status,last_error
    FROM capsules WHERE status != 'deleted'`;
  const bindings: any[] = [];

  if (statusFilter) {
    query += ` AND status = ?`;
    bindings.push(statusFilter);
  }
  if (searchEmail) {
    query += ` AND email LIKE ?`;
    bindings.push(`%${searchEmail}%`);
  }
  if (searchId) {
    query += ` AND id LIKE ?`;
    bindings.push(`%${searchId}%`);
  }

  query += ` ORDER BY created_at DESC LIMIT 1000`;

  const results = db.prepare(query).all(...bindings) as any[];

  return c.html(adminPage(true, results, readSettings(), statusFilter, searchEmail, searchId));
});

app.get('/admin/logout', (c) => {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/admin',
      'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    }
  });
});

app.get('/admin/stats', (c) => {
  const authed = isAuthed(c.req.header('cookie'));
  if (!authed) return c.text('Unauthorized', 401);
  return c.html(adminStatsPage());
});

// Admin login
app.post('/admin/login', async (c) => {
  const form = await c.req.formData();
  const pwd = String(form.get('password') || '');
  if (!pwd || pwd !== env.ADMIN_PASSWORD) {
    return c.html(htmlPage('管理登录', `<h1>🔐 管理登录</h1><p style="color:#d946ef;font-size:15px">❌ 密码错误</p><p><a href="/admin" style="color:#9370db;text-decoration:none;font-weight:500">← 返回</a></p>`));
  }
  const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
  const sig = hmacSha256(env.ADMIN_PASSWORD, String(exp));
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/admin',
      'Set-Cookie': `${COOKIE_NAME}=${exp}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
    }
  });
});

// Admin settings
app.post('/api/admin/settings', async (c) => {
  if (!isAuthed(c.req.header('cookie'))) {
    return c.json({ ok: false, message: '未授权' }, 401);
  }
  const form = await c.req.formData();
  const s = {
    ip_daily_limit: Math.max(0, parseInt(String(form.get('ip_daily_limit') || '0'), 10) || 0),
    ip_10min_limit: Math.max(0, parseInt(String(form.get('ip_10min_limit') || '0'), 10) || 0),
    min_lead_seconds: Math.max(0, parseInt(String(form.get('min_lead_seconds') || '0'), 10) || 0),
    daily_create_limit: Math.max(0, parseInt(String(form.get('daily_create_limit') || '0'), 10) || 0),
  };
  updateSettings(s);
  return c.redirect('/admin');
});

// Admin delete
app.post('/api/admin/delete', async (c) => {
  if (!isAuthed(c.req.header('cookie'))) {
    return c.json({ ok: false, message: '未授权' }, 401);
  }
  const form = await c.req.formData();
  const id = String(form.get('id') || '');
  if (!id) return c.json({ ok: false, message: '缺少 id' }, 400);
  db.prepare("UPDATE capsules SET status='deleted' WHERE id=?").run(id);
  return c.redirect('/admin');
});

// Admin list API
app.get('/api/admin/capsules', (c) => {
  if (!isAuthed(c.req.header('cookie'))) {
    return c.json({ ok: false, message: '未授权' }, 401);
  }

  const statusFilter = c.req.query('status') || '';
  const searchEmail = c.req.query('email') || '';
  const searchId = c.req.query('id') || '';

  let query = `SELECT id,email,content,signer,contact,ip_addr,send_at,created_at,status,last_error
     FROM capsules WHERE status!='deleted'`;
  const bindings: any[] = [];

  if (statusFilter) {
    query += ` AND status = ?`;
    bindings.push(statusFilter);
  }
  if (searchEmail) {
    query += ` AND email LIKE ?`;
    bindings.push(`%${searchEmail}%`);
  }
  if (searchId) {
    query += ` AND id LIKE ?`;
    bindings.push(`%${searchId}%`);
  }

  query += ` ORDER BY created_at DESC LIMIT 1000`;

  const results = db.prepare(query).all(...bindings) as any[];
  const mapped = results.map((r: any) => ({
    ...r, send_at_shanghai: fmtShanghai(r.send_at), created_at_shanghai: fmtShanghai(r.created_at),
  }));
  return c.json(mapped);
});

// Admin stats API
app.get('/api/admin/stats', (c) => {
  if (!isAuthed(c.req.header('cookie'))) {
    return c.json({ ok: false, message: '未授权' }, 401);
  }

  try {
    const days = Math.min(365, Math.max(1, parseInt(c.req.query('days') || '30', 10)));
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 3600 * 1000);
    const startYmd = startDate.toISOString().slice(0, 10);

    const sendDateStats = db.prepare(
      `SELECT send_at_ymd as date, COUNT(*) as count
       FROM capsules
       WHERE send_at_ymd >= ? AND status != 'deleted'
       GROUP BY send_at_ymd
       ORDER BY send_at_ymd DESC
       LIMIT 80`
    ).all(startYmd);

    const ipStats = db.prepare(
      `SELECT ip_addr as ip, COUNT(*) as count
       FROM capsules
       WHERE ip_addr IS NOT NULL AND ip_addr != '' AND status != 'deleted'
       GROUP BY ip_addr
       ORDER BY count DESC
       LIMIT 50`
    ).all();

    const emailStats = db.prepare(
      `SELECT email, COUNT(*) as count
       FROM capsules
       WHERE status != 'deleted'
       GROUP BY email
       ORDER BY count DESC
       LIMIT 50`
    ).all();

    const statusStats = db.prepare(
      `SELECT status, COUNT(*) as count
       FROM capsules
       WHERE status != 'deleted'
       GROUP BY status`
    ).all();

    const totalCount = db.prepare(
      `SELECT COUNT(*) as total FROM capsules WHERE status != 'deleted'`
    ).get() as { total: number };

    return c.json({
      sendDateStats,
      ipStats,
      emailStats,
      statusStats,
      totalCount: totalCount?.total || 0,
      dateRange: {
        days,
        start: startYmd,
        end: now.toISOString().slice(0, 10)
      }
    });
  } catch (e: any) {
    return c.json({ ok: false, message: e?.message || '获取统计数据失败' }, 500);
  }
});

// Resend Webhook
app.post('/api/webhook/resend', async (c) => {
  const raw = await c.req.text();
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const ok = verifySvixSignature(raw, headers);
  if (!ok && env.RESEND_WEBHOOK_SECRET) {
    return c.text('invalid signature', 400);
  }

  const event = JSON.parse(raw);
  const type = String(event?.type || '');
  const emailId = String(event?.data?.email_id || '');
  const createdAt = Math.floor(new Date(event?.created_at || Date.now()).getTime() / 1000);

  if (!emailId) return c.text('no email_id', 200);

  const cap = db.prepare('SELECT id FROM capsules WHERE provider_email_id=?').get(emailId) as { id: string } | undefined;

  db.prepare(
    'INSERT INTO sends_log (id, capsule_id, sent_at, status, error, provider_email_id, event) VALUES (?,?,?,?,?,?,?)'
  ).run(randomUUID(), cap?.id || 'unknown', createdAt, 'event', null, emailId, type);

  if (!cap?.id) return c.text('ok', 200);

  if (type === 'email.delivered') {
    db.prepare('UPDATE capsules SET status=?, delivered_at=?, last_error=NULL WHERE id=?')
      .run('delivered', createdAt, cap.id);
  } else if (type === 'email.bounced') {
    const reason = String(event?.data?.bounce?.message || 'bounced');
    db.prepare('UPDATE capsules SET status=?, bounced_at=?, bounce_reason=?, last_error=? WHERE id=?')
      .run('bounced', createdAt, reason, reason, cap.id);
  } else if (type === 'email.failed') {
    const reason = String(event?.data?.failed?.reason || 'failed');
    db.prepare('UPDATE capsules SET status=?, last_error=? WHERE id=?')
      .run('failed', reason, cap.id);
  } else if (type === 'email.sent') {
    db.prepare('UPDATE capsules SET sent_at=? WHERE id=?').run(createdAt, cap.id);
  }

  return c.text('ok', 200);
});

// 404
app.notFound((c) => {
  return c.text('Not Found', 404);
});

// ---------- Start server ----------
console.log(`Starting Time Capsule server on port ${env.PORT}...`);

// 启动定时任务：每分钟检查一次
cron.schedule('* * * * *', () => {
  console.log('[Cron] Checking pending capsules...');
  processPendingCapsules().catch(err => {
    console.error('[Cron] Error:', err);
  });
});

serve({
  fetch: app.fetch,
  port: env.PORT,
}, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});

export { db, env };