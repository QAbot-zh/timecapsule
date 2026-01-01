export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;     // secret
  RESEND_WEBHOOK_SECRET?: string; // webhook 签名验证 whsec_xxx
  ADMIN_PASSWORD: string;     // secret
  FROM_EMAIL: string;
  BASE_URL?: string;
  CONTACT_EMAIL?: string;     // 新增：用户联系邮箱

  // 仅作为后备默认（settings 初始化失败时兜底）
  DAILY_CREATE_LIMIT?: string;
  IP_DAILY_LIMIT?: string;
  IP_10MIN_LIMIT?: string;
}

const TEXT_HTML = { "content-type": "text/html; charset=UTF-8" };
const JSON_TYPE = { "content-type": "application/json; charset=UTF-8" };

const COOKIE_NAME = "admin_session";
const COOKIE_MAX_AGE = 24 * 3600; // 1 day
const TZ_OFFSET_SEC = 8 * 3600;   // Asia/Shanghai = UTC+8

// ---------- Time helpers (Asia/Shanghai) ----------
function toUnixSecondsShanghai(input: string): number | null {
  try {
    const [date, time] = input.split("T");
    if (!date || !time) return null;
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const utcMs = Date.UTC(y, m - 1, d, hh - 8, mm, 0, 0); // 本地上海→UTC
    return Math.floor(utcMs / 1000);
  } catch { return null; }
}
function ymdShanghaiFromEpoch(tsSec: number): string {
  return new Date((tsSec + TZ_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}
function fmtShanghai(tsSec: number): string {
  return new Date((tsSec + TZ_OFFSET_SEC) * 1000).toISOString().replace("T"," ").slice(0,19);
}
function defaultFormValueShanghaiPlus(sec: number): string {
  const ms = Date.now() + (sec * 1000) + TZ_OFFSET_SEC * 1000;
  return new Date(ms).toISOString().slice(0,16);
}
function humanizeSeconds(sec: number): string {
  if (sec <= 0) return "无最小提前量";
  const units: Array<[number,string]> = [
    [30*24*3600, "30 天"], [7*24*3600, "7 天"], 
    [3*24*3600, "3 天"], [24*3600, "1 天"],
    [12*3600, "12 小时"], [6*3600, "6 小时"], [3600, "1 小时"],
    [30*60, "30 分钟"], [10*60, "10 分钟"], [60, "1 分钟"]
  ];
  for (const [u, name] of units) if (sec >= u) return name;
  return `${sec} 秒`;
}

// ---------- Misc utils ----------
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
async function hmacSha256(keyStr: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(keyStr), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}
function parseCookies(req: Request): Record<string, string> {
  const cookie = req.headers.get("cookie") || "";
  const out: Record<string, string> = {};
  cookie.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
function htmlPage(title: string, body: string): Response {
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-size="70" fill="#6b4ba6" transform="translate(0, 5)">✉️</text></svg>`;
  const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(favicon)}"/>
<title>${title}</title>
<style>
  :root{color-scheme:light dark;}
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Noto Sans',sans-serif;margin:0;padding:24px;line-height:1.7;background:linear-gradient(135deg, #e6e6fa 0%, #f0e6fa 50%, #fae6f0 100%);min-height:100vh}
  .card{max-width:1200px;margin:24px auto;background:rgba(255,255,255,0.95);color:#2d1b4e;border:1px solid rgba(138,103,184,0.2);border-radius:24px;padding:40px;box-shadow:0 20px 60px rgba(138,103,184,0.15),0 0 0 1px rgba(255,255,255,0.8) inset;backdrop-filter:blur(10px)}
  h1{margin-top:0;font-size:2.2rem;color:#6b4ba6;font-weight:700;letter-spacing:0.5px}
  h2{font-size:1.5rem;color:#7c5cad;margin-top:24px}
  input,textarea,select{width:100%;padding:14px 16px;border-radius:16px;border:2px solid rgba(138,103,184,0.25);background:rgba(255,255,255,0.9);color:#2d1b4e;font-size:16px;transition:all 0.3s ease}
  input::placeholder,textarea::placeholder{color:rgba(107,75,166,0.5);font-size:15px}
  input:focus,textarea:focus,select:focus{outline:none;border-color:#9370db;box-shadow:0 0 0 4px rgba(147,112,219,0.15);background:#fff}
  label{font-weight:600;margin:20px 0 10px;display:block;color:#6b4ba6;font-size:16px}
  button{padding:14px 24px;border:0;border-radius:16px;background:linear-gradient(135deg,#9370db,#ba55d3);color:white;cursor:pointer;font-weight:600;font-size:16px;transition:all 0.3s ease;box-shadow:0 4px 15px rgba(147,112,219,0.3)}
  button:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(147,112,219,0.4)}
  button[disabled]{opacity:.6;cursor:not-allowed;transform:none}
  .muted{color:#8b7ba8;font-size:14px}
  .note{font-size:14px;margin-top:6px;color:#9b8bb8}
  .section{margin-top:40px;padding-top:32px;border-top:2px solid rgba(138,103,184,0.15)}
  .toast-wrap{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center}
  .toast-wrap .toast-overlay{position:absolute;inset:0;background:rgba(107,75,166,0.3);backdrop-filter:blur(4px)}
  .toast{background:linear-gradient(135deg,#6b4ba6,#8b6bb8);color:#fff;padding:20px 28px;border-radius:20px;box-shadow:0 20px 60px rgba(107,75,166,0.5);font-size:16px;min-width:320px;max-width:90vw;text-align:center;animation:toastIn 0.3s ease-out;position:relative;cursor:pointer}
  .toast.error{background:linear-gradient(135deg,#d946ef,#c026d3)}
  .toast.success{background:linear-gradient(135deg,#10b981,#059669)}
  @keyframes toastIn{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
  .counter{font-size:13px;text-align:right;margin-top:6px;color:#9b8bb8}
  table{width:100%;border-collapse:collapse;min-width:900px}
  .table-wrap{overflow:auto;border-radius:12px;border:1px solid rgba(138,103,184,0.2)}
  th,td{padding:12px 14px;vertical-align:top;border-bottom:1px solid rgba(138,103,184,0.12);font-size:15px}
  th{white-space:nowrap;background:rgba(147,112,219,0.08);color:#6b4ba6;font-weight:600}
  .td-time{white-space:normal;word-break:break-word;max-width:110px;}
  .td-id{max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .td-ip{white-space:nowrap;font-variant-numeric:tabular-nums}
  .td-clip{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:normal;}
  .td-clip-wide{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:normal;}
  .overlay{position:fixed;inset:0;background:rgba(107,75,166,0.5);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:9999;padding:20px}
  .overlay .panel{max-width:800px;width:100%;max-height:85vh;background:rgba(255,255,255,0.98);color:#2d1b4e;border-radius:20px;border:2px solid rgba(138,103,184,0.2);box-shadow:0 20px 60px rgba(107,75,166,0.3);display:flex;flex-direction:column;overflow:hidden}
  .overlay .panel-header{display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:2px solid rgba(138,103,184,0.12);flex-shrink:0;background:rgba(147,112,219,0.05)}
  .overlay .panel-header strong{font-size:18px;color:#6b4ba6;font-weight:600}
  .overlay .panel-header .close-btn{padding:8px 16px;font-size:14px;min-width:auto;background:linear-gradient(135deg,#8b7ba8,#9b8bb8)}
  .overlay .panel-body{padding:20px 24px;overflow-y:auto;flex:1;min-height:0}
  .overlay .panel-body pre{white-space:pre-wrap;word-break:break-word;font-size:15px;line-height:1.7;color:#2d1b4e;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
  .expand{cursor:pointer;color:#9370db;text-decoration:underline;text-underline-offset:3px;font-weight:500}
  .expand:hover{color:#ba55d3}
  .admin-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
  .admin-header h1{margin:0}
  .logout-btn{padding:10px 20px;font-size:14px}
  .settings-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
  .settings-header h2{margin:0}
  .settings-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
  .settings-item label{margin:0 0 6px 0;font-size:14px}
  .settings-item input,.settings-item select{padding:10px 12px;font-size:15px}
  .settings-item .note{font-size:12px;margin-top:4px}
  .intro-text{font-size:16px;color:#6b4ba6;line-height:1.8;margin:16px 0 24px 0;padding:20px;background:rgba(147,112,219,0.08);border-radius:16px;border-left:4px solid #9370db}
  .info-box{background:rgba(147,112,219,0.08);padding:16px;border-radius:12px;border-left:4px solid #9370db;margin-top:16px;font-size:14px;color:#6b4ba6}
  .filter-grid{display:grid;grid-template-columns:150px 1fr 1fr 200px;gap:12px;background:rgba(147,112,219,0.05);padding:16px;border-radius:12px}
  @media (max-width: 768px) {
    .settings-grid{grid-template-columns:1fr}
    .filter-grid{grid-template-columns:1fr;gap:12px}
    .admin-header{flex-direction:column;align-items:flex-start!important}
    .admin-header h1{margin-bottom:16px}
    .admin-header > div{width:100%;justify-content:flex-start}
    .settings-header{flex-direction:column;align-items:flex-start!important}
    .settings-header h2{margin-bottom:12px}
    .settings-header > div{width:100%}
    /* 统计面板响应式 */
    .section[style*="grid-template-columns:1fr 1fr"]{grid-template-columns:1fr!important}
    .section[style*="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"] > div{margin-bottom:12px}
  }

  #content-preview { font-size: 16px; }

  /* 全屏预览样式 */
  .fullscreen-preview-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(107, 75, 166, 0.95);
    backdrop-filter: blur(10px);
    z-index: 10000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .fullscreen-preview-container {
    background: rgba(255, 255, 255, 0.98);
    color: #2d1b4e;
    border-radius: 24px;
    border: 2px solid rgba(138, 103, 184, 0.2);
    box-shadow: 0 20px 60px rgba(107, 75, 166, 0.3);
    max-width: 900px;
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideIn 0.3s ease-out;
  }

  .fullscreen-preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 2px solid rgba(138, 103, 184, 0.12);
    background: rgba(147, 112, 219, 0.05);
    flex-shrink: 0;
  }

  .fullscreen-preview-header h3 {
    margin: 0;
    color: #6b4ba6;
    font-size: 18px;
    font-weight: 600;
  }

  .fullscreen-preview-close {
    padding: 8px 16px;
    font-size: 14px;
    background: linear-gradient(135deg, #8b7ba8, #9b8bb8);
    border: none;
    border-radius: 12px;
    color: white;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.3s ease;
  }

  .fullscreen-preview-close:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(147, 112, 219, 0.3);
  }

  .fullscreen-preview-content {
    flex: 1;
    overflow-y: auto;
    padding: 32px;
    line-height: 1.8;
    font-size: 16px;
  }

  .fullscreen-preview-content h1,
  .fullscreen-preview-content h2,
  .fullscreen-preview-content h3 {
    color: #6b4ba6;
    margin-top: 24px;
    margin-bottom: 12px;
  }

  .fullscreen-preview-content h1 { font-size: 28px; }
  .fullscreen-preview-content h2 { font-size: 24px; }
  .fullscreen-preview-content h3 { font-size: 20px; }

  .fullscreen-preview-content strong {
    font-weight: 600;
    color: #6b4ba6;
  }

  .fullscreen-preview-content code {
    background: rgba(147, 112, 219, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 14px;
  }

  .fullscreen-preview-content pre {
    background: rgba(147, 112, 219, 0.08);
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 16px 0;
  }

  .fullscreen-preview-content pre code {
    background: none;
    padding: 0;
  }

  .fullscreen-preview-content blockquote {
    border-left: 4px solid #9370db;
    padding-left: 20px;
    margin: 16px 0;
    color: #6b4ba6;
    background: rgba(147, 112, 219, 0.05);
    padding: 16px 20px;
    border-radius: 8px;
  }

  .fullscreen-preview-content ul,
  .fullscreen-preview-content ol {
    margin: 16px 0;
    padding-left: 32px;
  }

  .fullscreen-preview-content li {
    margin: 6px 0;
  }

  .fullscreen-preview-content hr {
    border: 0;
    border-top: 2px solid rgba(138, 103, 184, 0.2);
    margin: 24px 0;
  }

  .fullscreen-preview-content img {
    max-width: 100%;
    border-radius: 8px;
    margin: 16px 0;
  }

  .fullscreen-preview-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    border: 1px solid rgba(138, 103, 184, 0.2);
    border-radius: 8px;
    overflow: hidden;
  }

  .fullscreen-preview-content th {
    background: rgba(147, 112, 219, 0.12);
    color: #6b4ba6;
    font-weight: 600;
    padding: 12px 16px;
    text-align: left;
    border: 1px solid rgba(138, 103, 184, 0.3);
  }

  .fullscreen-preview-content td {
    padding: 10px 16px;
    border: 1px solid rgba(138, 103, 184, 0.2);
  }

  .fullscreen-preview-content tbody tr:hover {
    background: rgba(147, 112, 219, 0.03);
  }

  .fullscreen-preview-content input[type="checkbox"] {
    margin-right: 8px;
    accent-color: #9370db;
    cursor: default;
    pointer-events: none;
  }

  .fullscreen-preview-content input[type="checkbox"]:checked + * {
    text-decoration: line-through;
    opacity: 0.6;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }
  #content-preview h1, #content-preview h2, #content-preview h3 { color: #6b4ba6; margin-top: 16px; margin-bottom: 8px; }
  #content-preview h1 { font-size: 22px; }
  #content-preview h2 { font-size: 20px; }
  #content-preview h3 { font-size: 18px; }
  #content-preview strong { font-weight: 600; color: #6b4ba6; }
  #content-preview code {
    background: rgba(147,112,219,0.1);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 14px;
  }
  #content-preview pre {
    background: rgba(147,112,219,0.08);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 12px 0;
  }
  #content-preview pre code {
    background: none;
    padding: 0;
  }
  #content-preview blockquote {
    border-left: 4px solid #9370db;
    padding-left: 16px;
    margin: 12px 0;
    color: #6b4ba6;
    background: rgba(147,112,219,0.05);
    padding: 12px 16px;
    border-radius: 8px;
  }
  #content-preview a {
    color: #9370db;
    text-decoration: underline;
  }
  #content-preview ul, #content-preview ol {
    margin: 12px 0;
    padding-left: 24px;
  }
  #content-preview li {
    margin: 4px 0;
  }
  #content-preview hr {
    border: 0;
    border-top: 2px solid rgba(138,103,184,0.2);
    margin: 16px 0;
  }
  #content-preview img {
    max-width: 100%;
    border-radius: 8px;
    margin: 12px 0;
  }
  #content-preview table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    border: 1px solid rgba(138,103,184,0.2);
    border-radius: 8px;
    overflow: hidden;
  }
  #content-preview th {
    background: rgba(147,112,219,0.12);
    color: #6b4ba6;
    font-weight: 600;
    padding: 10px 12px;
    text-align: left;
    border: 1px solid rgba(138,103,184,0.3);
  }
  #content-preview td {
    padding: 8px 12px;
    border: 1px solid rgba(138,103,184,0.2);
  }
  #content-preview tbody tr:hover {
    background: rgba(147,112,219,0.03);
  }
  
  /* TODO 列表样式 */
  #content-preview input[type="checkbox"] {
    margin-right: 8px;
    accent-color: #9370db;
    cursor: default;
    pointer-events: none; /* 禁止点击 */
  }
  #content-preview input[type="checkbox"]:checked + * {
    text-decoration: line-through;
    opacity: 0.6;
  }
  @media (max-width: 768px) {
    form > div[style*="grid-template-columns"] {
      grid-template-columns: 1fr !important;
    }
  }
  /* 问题反馈按钮 */
  .feedback-btn {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #9370db, #ba55d3);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    box-shadow: 0 4px 16px rgba(147, 112, 219, 0.4);
    transition: all 0.3s ease;
    z-index: 1000;
    font-size: 22px;
  }
  .feedback-btn:hover {
    transform: translateY(-3px) scale(1.05);
    box-shadow: 0 8px 24px rgba(147, 112, 219, 0.5);
  }
  .feedback-btn:active {
    transform: translateY(-1px) scale(1.02);
  }
  .feedback-tooltip {
    position: absolute;
    right: 56px;
    background: rgba(45, 27, 78, 0.95);
    color: white;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    line-height: 1.5;
  }
  .feedback-btn:hover .feedback-tooltip {
    opacity: 1;
  }
  .feedback-tooltip::after {
    content: '';
    position: absolute;
    right: -6px;
    top: 50%;
    transform: translateY(-50%);
    border: 6px solid transparent;
    border-left-color: rgba(45, 27, 78, 0.95);
  }
  .feedback-tooltip-title {
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 14px;
  }
  .feedback-tooltip-desc {
    opacity: 0.85;
    font-size: 12px;
  }
</style></head><body><div class="card">${body}</div>
<a href="https://github.com/QAbot-zh/timecapsule/issues" target="_blank" rel="noopener noreferrer" class="feedback-btn" title="问题反馈 & 功能请求">
  <span class="feedback-tooltip">
    <div class="feedback-tooltip-title">💡 反馈 & 建议</div>
    <div class="feedback-tooltip-desc">问题反馈 · 功能请求 · 想法交流</div>
  </span>
  💬
</a>
</body></html>`;
  return new Response(html, { headers: TEXT_HTML });
}

// ---------- Settings (DB) ----------
type Settings = {
  ip_daily_limit: number;
  ip_10min_limit: number;
  min_lead_seconds: number;
  daily_create_limit: number;
};
async function readSettings(env: Env): Promise<Settings> {
  const row = await env.DB.prepare(
    "SELECT ip_daily_limit, ip_10min_limit, min_lead_seconds, daily_create_limit FROM settings WHERE id=1"
  ).first<Settings>();
  if (row) return row;
  const s: Settings = {
    ip_daily_limit: parseInt(env.IP_DAILY_LIMIT || "20", 10),
    ip_10min_limit: parseInt(env.IP_10MIN_LIMIT || "5", 10),
    min_lead_seconds: 3600,
    daily_create_limit: parseInt(env.DAILY_CREATE_LIMIT || "80", 10)
  };
  await env.DB.prepare(
    "INSERT OR REPLACE INTO settings (id, ip_daily_limit, ip_10min_limit, min_lead_seconds, daily_create_limit) VALUES (1,?,?,?,?)"
  ).bind(s.ip_daily_limit, s.ip_10min_limit, s.min_lead_seconds, s.daily_create_limit).run();
  return s;
}
async function updateSettings(env: Env, s: Settings) {
  await env.DB.prepare(
    "UPDATE settings SET ip_daily_limit=?, ip_10min_limit=?, min_lead_seconds=?, daily_create_limit=? WHERE id=1"
  ).bind(s.ip_daily_limit, s.ip_10min_limit, s.min_lead_seconds, s.daily_create_limit).run();
}

// ---------- Public pages ----------
function indexPage(s: Settings): Response {
  const def = defaultFormValueShanghaiPlus(Math.max(s.min_lead_seconds, 10 * 60) + 15 * 60);
  return htmlPage("时间胶囊 - 投递", `
<h1>✉️ <a href="https://github.com/QAbot-zh/timecapsule" target="_blank" rel="noopener noreferrer" style="color:#6b4ba6;text-decoration:none;border-bottom:2px dashed rgba(107,75,166,0.4);text-underline-offset:4px">时间胶囊</a></h1>
<div class="intro-text">
  把此刻的心情，寄往未来的某一天。<br/>
  也许是写给一年后的自己，也许是寄托对远方 TA 的思念。<br/>
  时光会替你保管，在约定的时刻悄然送达。
</div>
<form id="capsule-form" method="post" action="/api/submit">
  <label>📮 收件邮箱（必填）</label>
  <input type="email" name="email" placeholder="name@example.com（建议使用收件人的常用邮箱）" required autocomplete="off" />

  <label>⏰ 投递时间 <span class="muted">(北京时间)</span></label>
  <div style="display:flex;gap:8px;align-items:center">
    <input type="datetime-local" name="send_at" id="send_at" value="${def}" required autocomplete="off" />
    <select id="quick-time-select" style="padding:8px 6px;font-size:13px;background:#fff;color:#6b4ba6;border:2px solid rgba(147,112,219,0.3);border-radius:10px;cursor:pointer;font-weight:500;outline:none;width:auto">
      <option value="">⚡ 快捷投递</option>
      <option value="30">1 月后</option>
      <option value="60">2 月后</option>
      <option value="90">3 月后</option>
      <option value="180">半年后</option>
      <option value="365">1 年后</option>
    </select>
    <button type="button" id="random-time-btn" style="padding:8px 12px;font-size:13px;background:linear-gradient(135deg,#9370db,#ba55d3);color:white;border:none;border-radius:10px;cursor:pointer;font-weight:500;box-shadow:0 2px 6px rgba(147,112,219,0.3);white-space:nowrap">🎲 随机日期</button>
  </div>
  <div class="note muted">最早可投递时间：${humanizeSeconds(s.min_lead_seconds)}后</div>
  <input type="hidden" id="min_lead_seconds" value="${s.min_lead_seconds}" />

  <label>💌 胶囊内容 <span class="muted">(支持 Markdown 格式)</span></label>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:8px">
    <div style="min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-size:13px;color:#8b7ba8">编辑区</div>
        <button type="button" id="fill-example-btn" style="padding:6px 12px;font-size:12px;background:linear-gradient(135deg,#9370db,#ba55d3);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:500;box-shadow:0 2px 8px rgba(147,112,219,0.3);transition:all 0.3s ease">填入示例</button>
      </div>
      <textarea id="content-input" name="content" placeholder="写下你想说的话...&#10;&#10;支持 Markdown 语法：&#10;**粗体** *斜体* [链接](url)&#10;- 列表项&#10;> 引用&#10;&#10;可以是对未来自己的期许，可以是对 TA 的思念，也可以是此刻的心情记录。" required style="height:450px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:16px"></textarea>
    </div>
    <div style="min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-size:13px;color:#8b7ba8">预览效果</div>
        <button type="button" id="fullscreen-preview-btn" style="padding:6px 12px;font-size:12px;background:linear-gradient(135deg,#9370db,#ba55d3);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:500;box-shadow:0 2px 8px rgba(147,112,219,0.3);transition:all 0.3s ease">全屏预览</button>
      </div>
      <div id="content-preview" style="height:450px;overflow-y:auto;padding:14px 16px;border-radius:16px;border:2px solid rgba(138,103,184,0.25);background:rgba(255,255,255,0.9);color:#2d1b4e;line-height:1.7"></div>
    </div>
  </div>
  <div class="counter" id="content-count">0 / 10000</div>

  <div class="note muted" style="margin-top:16px;margin-bottom:8px">为方便收信人了解投递者信息，可填写以下内容（可选）</div>

  <label>✍️ 落款 <span class="muted">(如担心隐私，可不填或填对方可认出的昵称)</span></label>
  <input type="text" name="sign" placeholder="你的名字 / 昵称（可选）" autocomplete="off" />

  <label>📞 联系方式 <span class="muted">(如担心隐私，可不填)</span></label>
  <input type="text" name="contact" placeholder="微信 / 手机 / 邮箱 ...（可选）" autocomplete="off" />

  <div style="margin-top:20px; display:flex; justify-content:center;"><button type="submit">🚀 投递胶囊</button></div>
</form>

<div class="toast-wrap" id="toast-wrap" aria-live="assertive"></div>

<!-- 全屏预览模态框 -->
<div class="fullscreen-preview-overlay" id="fullscreen-preview-overlay">
  <div class="fullscreen-preview-container">
    <div class="fullscreen-preview-header">
      <h3>📖 全屏预览</h3>
      <button type="button" class="fullscreen-preview-close" id="fullscreen-preview-close">✕ 关闭</button>
    </div>
    <div class="fullscreen-preview-content" id="fullscreen-preview-content">
      <!-- 预览内容将在这里显示 -->
    </div>
  </div>
</div>

<!-- Markdown 渲染库 -->
<script src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js"></script>

<script>
(function(){
  const CACHE_KEY = 'capsule_draft';
  
  // 缓存管理
  const CacheManager = {
    save(data) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch(e) {
        console.warn('缓存保存失败:', e);
      }
    },
    
    load() {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        return cached ? JSON.parse(cached) : null;
      } catch(e) {
        console.warn('缓存读取失败:', e);
        return null;
      }
    },
    
    clear() {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch(e) {
        console.warn('缓存清除失败:', e);
      }
    }
  };

  const form = document.getElementById('capsule-form');
  const contentEl = document.getElementById('content-input');
  const previewEl = document.getElementById('content-preview');
  const emailEl = form.querySelector('input[name="email"]');
  const sendAtEl = form.querySelector('input[name="send_at"]');
  const signEl = form.querySelector('input[name="sign"]');
  const contactEl = form.querySelector('input[name="contact"]');
  const btn = form.querySelector('button[type="submit"]');
  const count = document.getElementById('content-count');

  const MAX = 10000;

  // 配置 marked
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  // Markdown 渲染函数
  function renderMarkdown(text) {
    if (!text.trim()) {
      previewEl.innerHTML = '<div style="color:#9b8bb8;font-style:italic">预览区域（输入内容后自动显示）</div>';
      return;
    }
    try {
      const rawHtml = marked.parse(text);
      const cleanHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img','table', 'thead', 'tbody', 'tr', 'th', 'td'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'style', 'type', 'checked', 'disabled']
      });
      previewEl.innerHTML = cleanHtml;
    } catch (e) {
      previewEl.innerHTML = '<div style="color:#d946ef">渲染出错，请检查 Markdown 语法</div>';
    }
  }

  // 保存当前表单数据
  function saveFormData() {
    const data = {
      email: emailEl.value.trim(),
      content: contentEl.value,
      send_at: sendAtEl.value,
      sign: signEl.value.trim(),
      contact: contactEl.value.trim()
    };
    CacheManager.save(data);
  }

  // 恢复表单数据
  function restoreFormData() {
    const cached = CacheManager.load();
    if (!cached) return;
    
    if (cached.email && !emailEl.value) emailEl.value = cached.email;
    if (cached.send_at && !sendAtEl.value) sendAtEl.value = cached.send_at;
    if (cached.sign && !signEl.value) signEl.value = cached.sign;
    if (cached.contact && !contactEl.value) contactEl.value = cached.contact;
    
    if (cached.content && !contentEl.value) {
      contentEl.value = cached.content;
      renderMarkdown(cached.content);
      const len = cached.content.length;
      count.textContent = (len > MAX ? MAX : len) + ' / ' + MAX;
    }
  }

  // 防抖保存
  let saveTimer = null;
  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveFormData, 500);
  }

  // 监听所有表单字段
  [emailEl, contentEl, sendAtEl, signEl, contactEl].forEach(el => {
    if (el) el.addEventListener('input', debouncedSave);
  });

  // 实时预览
  contentEl.addEventListener('input', ()=>{
    const len = contentEl.value.length;
    count.textContent = (len>MAX?MAX:len) + ' / ' + MAX;
    if (len > MAX) contentEl.value = contentEl.value.slice(0, MAX);
    renderMarkdown(contentEl.value);
  });

  // 页面加载时恢复
  restoreFormData();

  // 填入示例功能
  const fillExampleBtn = document.getElementById('fill-example-btn');
  if (fillExampleBtn) {
    fillExampleBtn.addEventListener('click', () => {
      const exampleText = \`### 致亲爱的未来的我：

当你读到这封信的时候，不知道已经过去了多久？

此刻的我，怀着激动又忐忑的心情，写下这些话。

**关于现在的心情：**
- 有些期待未来的模样
- 也有些怀念过去的时光
- 更多的是对当下的珍惜

**想对未来的你说：**
> 无论你现在身处何地，经历着什么，请记得保持那颗初心。
> 生活或许不尽如人意，但请相信一切都是最好的安排。

**一些小目标：**
- [ ] 保持健康的身体
- [ ] 珍惜身边的人
- [ ] 勇敢追求梦想
- [ ] 学会感恩生活

愿时光不老，愿初心不改。

此致
敬礼！

${new Date().toLocaleDateString('zh-CN')}\`;

      contentEl.value = exampleText;
      const len = exampleText.length;
      count.textContent = (len > MAX ? MAX : len) + ' / ' + MAX;
      if (len > MAX) contentEl.value = contentEl.value.slice(0, MAX);
      renderMarkdown(contentEl.value);
      saveFormData(); // 保存到缓存

      // 显示成功提示
      showToast('✅ 示例内容已填入！你可以根据需要修改', 'success');
    });
  }

  // 随机时间按钮功能
  const randomTimeBtn = document.getElementById('random-time-btn');
  const minLeadSecondsEl = document.getElementById('min_lead_seconds');
  const quickTimeSelect = document.getElementById('quick-time-select');

  // 辅助函数：设置指定天数后的时间
  function setTimeAfterDays(days) {
    const now = Date.now();
    const targetTime = now + days * 24 * 3600 * 1000;
    const shanghaiOffset = 8 * 3600 * 1000;
    const shanghaiTime = new Date(targetTime + shanghaiOffset);
    const formatted = shanghaiTime.toISOString().slice(0, 16);
    sendAtEl.value = formatted;
    debouncedSave();
  }

  // 快捷选择下拉框
  if (quickTimeSelect && sendAtEl) {
    quickTimeSelect.addEventListener('change', () => {
      const days = parseInt(quickTimeSelect.value, 10);
      if (!days) return;

      setTimeAfterDays(days);

      // 显示提示
      const labels = { 30: '1 个月后', 60: '2 个月后', 90: '3 个月后', 180: '6 个月后', 365: '1 年后' };
      showToast('⚡ 已设置投递时间：' + (labels[days] || days + ' 天后'), 'success');

      // 重置下拉框显示
      quickTimeSelect.value = '';
    });
  }

  if (randomTimeBtn && sendAtEl && minLeadSecondsEl) {
    randomTimeBtn.addEventListener('click', () => {
      const minLeadSeconds = parseInt(minLeadSecondsEl.value, 10) || 0;
      const now = Date.now();

      // 最早时间：当前时间 + 最小提前量 + 5分钟缓冲
      const minTime = now + (minLeadSeconds + 300) * 1000;
      // 最晚时间：1年后
      const maxTime = now + 365 * 24 * 3600 * 1000;

      // 在范围内随机选择一个时间
      const randomTime = minTime + Math.random() * (maxTime - minTime);

      // 转换为北京时间的 datetime-local 格式
      const shanghaiOffset = 8 * 3600 * 1000;
      const shanghaiTime = new Date(randomTime + shanghaiOffset);
      const formatted = shanghaiTime.toISOString().slice(0, 16);

      sendAtEl.value = formatted;
      debouncedSave();

      // 计算并显示选中的时间描述
      const diffDays = Math.floor((randomTime - now) / (24 * 3600 * 1000));
      let timeDesc = '';
      if (diffDays < 1) timeDesc = '今天';
      else if (diffDays < 7) timeDesc = diffDays + ' 天后';
      else if (diffDays < 30) timeDesc = Math.floor(diffDays / 7) + ' 周后';
      else if (diffDays < 365) timeDesc = Math.floor(diffDays / 30) + ' 个月后';
      else timeDesc = '约 1 年后';

      showToast('🎲 已随机匹配良辰吉日：' + timeDesc, 'success');
    });
  }

  // 全屏预览功能
  const fullscreenPreviewBtn = document.getElementById('fullscreen-preview-btn');
  const fullscreenOverlay = document.getElementById('fullscreen-preview-overlay');
  const fullscreenContent = document.getElementById('fullscreen-preview-content');
  const fullscreenClose = document.getElementById('fullscreen-preview-close');

  if (fullscreenPreviewBtn && fullscreenOverlay && fullscreenContent && fullscreenClose) {
    // 打开全屏预览
    fullscreenPreviewBtn.addEventListener('click', () => {
      const content = contentEl.value;
      if (!content.trim()) {
        showToast('❌ 请先输入一些内容再预览', 'error');
        return;
      }

      // 渲染Markdown内容
      try {
        const rawHtml = marked.parse(content);
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
          ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'style', 'type', 'checked', 'disabled']
        });
        fullscreenContent.innerHTML = cleanHtml;
      } catch (e) {
        fullscreenContent.innerHTML = '<div style="color:#d946ef;text-align:center;padding:40px">渲染出错，请检查 Markdown 语法</div>';
      }

      // 显示全屏预览
      fullscreenOverlay.style.display = 'flex';
      document.body.style.overflow = 'hidden'; // 防止背景滚动
    });

    // 关闭全屏预览
    function closeFullscreenPreview() {
      fullscreenOverlay.style.display = 'none';
      document.body.style.overflow = ''; // 恢复滚动
    }

    // 点击关闭按钮
    fullscreenClose.addEventListener('click', closeFullscreenPreview);

    // 点击遮罩层关闭
    fullscreenOverlay.addEventListener('click', (e) => {
      if (e.target === fullscreenOverlay) {
        closeFullscreenPreview();
      }
    });

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fullscreenOverlay.style.display === 'flex') {
        closeFullscreenPreview();
      }
    });
  }

  function showToast(msg, type = 'error'){
    const wrap = document.getElementById('toast-wrap');
    wrap.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'toast-overlay';
    wrap.appendChild(overlay);
    const div = document.createElement('div');
    div.className = 'toast ' + type;
    div.innerHTML = msg;
    wrap.appendChild(div);
    wrap.style.display = 'flex';
    const close = () => {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
    };
    overlay.addEventListener('click', close);
    div.addEventListener('click', close);
    setTimeout(close, 3000);
  }

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = emailEl.value.trim();
    const content = contentEl.value.trim();
    const sign = (signEl?.value || '').trim();
    const contact = (contactEl?.value || '').trim();
    const sendAt = sendAtEl.value;

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      showToast('❌ 邮箱格式不正确', 'error'); 
      emailEl.focus(); 
      return;
    }
    if (!content) { 
      showToast('❌ 内容不能为空', 'error'); 
      contentEl.focus(); 
      return; 
    }

    btn.disabled = true;
    btn.textContent = '🚀 投递中...';
    
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept':'application/json' },
        body: JSON.stringify({ email, content, sign, contact, send_at: sendAt })
      });
      const data = await res.json().catch(()=>({ok:false,message:'提交失败'}));
      if (!res.ok || !data.ok) {
        showToast('❌ ' + (data.message || '提交失败，请稍后重试'), 'error');
        btn.disabled = false;
        btn.textContent = '🚀 投递胶囊';
        return;
      }
      
      // 投递成功，清除缓存
      CacheManager.clear();
      
      showToast('✅ 投递成功！正在跳转...', 'success');
      setTimeout(() => {
        location.href = data.status_url || ('/thanks?id=' + data.id);
      }, 1000);
    } catch(err){
      showToast('❌ 网络异常，请稍后再试', 'error'); 
      btn.disabled = false;
      btn.textContent = '🚀 投递胶囊';
    }
  });
})();
</script>

<p class="muted" style="margin-top:20px;text-align:center">投递时间到点后系统自动发信，请保存好胶囊链接 🔗</p>

<!-- 页脚 -->
<div style="margin-top:40px;padding-top:24px;border-top:2px solid rgba(138,103,184,0.15);text-align:center">
  <p style="margin:0;font-size:15px;color:#8b7ba8;font-style:italic">© ${new Date().getUTCFullYear()} 时光会替你守护这份心意 💜
    <a href="https://github.com/QAbot-zh/timecapsule" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-left:10px;text-decoration:none;vertical-align:middle;font-size:20px;font-style:normal;transition:transform 0.3s">✉️</a>
  </p>
</div>

<script>
(function() {
  // 烟花粒子类
  class Particle {
    constructor(x, y, angle, color) {
      this.x = x;
      this.y = y;
      const speed = Math.random() * 4 + 3;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.color = color;
      this.alpha = 1;
      this.gravity = 0.15;
      this.friction = 0.98;
      this.size = Math.random() * 2 + 1;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= this.friction;
      this.vy *= this.friction;
      this.vy += this.gravity;
      this.alpha -= 0.015;
      this.size *= 0.995;
    }

    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    isDead() {
      return this.alpha <= 0 || this.size <= 0.1;
    }
  }

  // 烟花类
  class Firework {
    constructor(x, y) {
      this.particles = [];
      const particleCount = Math.floor(Math.random() * 3) + 3; // 3-5个粒子
      const hue = Math.random() * 360;

      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 / particleCount) * i + Math.random() * 0.5;
        const color = 'hsl(' + (hue + Math.random() * 60) + ', 70%, 60%)';
        this.particles.push(new Particle(x, y, angle, color));
      }
    }

    update() {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.update();
        if (p.isDead()) {
          this.particles.splice(i, 1);
        }
      }
    }

    draw(ctx) {
      this.particles.forEach(p => p.draw(ctx));
    }

    isDead() {
      return this.particles.length === 0;
    }
  }

  // 创建画布
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '1';
  document.body.appendChild(canvas);

  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  const fireworks = [];

  // 检测点是否在表单区域内
  function isInFormArea(x, y) {
    const form = document.getElementById('capsule-form');
    if (!form) return false;
    const rect = form.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (let i = fireworks.length - 1; i >= 0; i--) {
      const fw = fireworks[i];
      fw.update();
      fw.draw(ctx);
      if (fw.isDead()) {
        fireworks.splice(i, 1);
      }
    }

    requestAnimationFrame(animate);
  }

  window.addEventListener('mousemove', (e) => {
    // 只在背景区域触发，不在表单区域触发
    if (!isInFormArea(e.clientX, e.clientY) && Math.random() > 0.85) {
      fireworks.push(new Firework(e.clientX, e.clientY));
    }
  });

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  animate();
})();
</script>
`);}

function thanksPage(id?: string): Response {
  const idHtml = id ? `<p style="font-size:16px">你的胶囊 ID：<code style="background:rgba(147,112,219,0.1);padding:4px 8px;border-radius:6px;color:#6b4ba6">${id}</code></p><p><a href="/status/${id}" style="color:#9370db;text-decoration:none;font-weight:500">📊 查看投递状态</a></p>` : "";
  return htmlPage("投递成功", `
<h1>✅ 投递成功</h1>
<div class="intro-text">
  你的时间胶囊已妥善保存，将在设定的时刻（北京时区）准时送达。<br/>
  时光会替你守护这份心意 💜
</div>
${idHtml}
<div class="info-box">
  💡 <strong>重要提示：</strong>请务必保存好胶囊链接，以便随时查看投递状态。建议收藏或截图保存。
</div>
<p style="margin-top:24px"><a href="/" style="color:#9370db;text-decoration:none;font-weight:500">← 返回首页</a></p>
`);
}

// ---------- Admin ----------
async function isAuthed(req: Request, env: Env): Promise<boolean> {
  const cookies = parseCookies(req);
  const val = cookies[COOKIE_NAME];
  if (!val) return false;
  const parts = val.split(".");
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return false;
  const expect = await hmacSha256(env.ADMIN_PASSWORD, expStr);
  return sig === expect;
}
function settingsOptions(selectedSec: number) {
  const opts: Array<[number,string]> = [
    [0, "无最小提前量"], [10*60, "10 分钟"], [30*60, "30 分钟"], [1*3600, "1 小时"], [6*3600, "6 小时"], 
    [12*3600, "12 小时"], [24*3600, "1 天"], [3*24*3600, "3 天"], [7*24*3600, "7 天"], [30*24*3600, "30 天"]
  ];
  return opts.map(([v, label]) => `<option value="${v}" ${v===selectedSec?'selected':''}>${label}</option>`).join("");
}
async function adminPage(req: Request, env: Env): Promise<Response> {
  const authed = await isAuthed(req, env);
  if (!authed) {
    return htmlPage("管理登录", `
<h1>🔐 管理登录</h1>
<form method="post" action="/admin/login">
  <label>管理密码</label>
  <input type="password" name="password" required autocomplete="off" />
  <div style="margin-top:16px"><button type="submit">登录</button></div>
</form>`);
  }
  
  const s = await readSettings(env);
  
  // 获取筛选参数
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") || "";
  const searchEmail = url.searchParams.get("email") || "";
  const searchId = url.searchParams.get("id") || "";
  
  // 构建查询
  let query = `SELECT id,email,content,signer,contact,ip_addr,send_at,created_at,status,last_error
    FROM capsules
    WHERE status != 'deleted'`;
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
  
  let stmt = env.DB.prepare(query);
  if (bindings.length > 0) {
    stmt = stmt.bind(...bindings);
  }
  const { results } = await stmt.all();

  const rows = (results as any[]).map(r => {
    const sendAt = fmtShanghai(r.send_at as number);
    const createdAt = fmtShanghai(r.created_at as number);

    const signer  = (r.signer   ?? "").toString().trim();
    const contact = (r.contact  ?? "").toString().trim();
    const ip      = (r.ip_addr  ?? "").toString().trim();
    const email   = (r.email    ?? "").toString().trim();

    // 状态 → 中文
    const statusMap: Record<string,string> = {
      pending: "⏳ 待发送",
      sent: "📤 已发送",
      delivered: "✅ 已投递",
      bounced: "❌ 被拒收",
      failed: "⚠️ 失败",
    };
    const statusZh = statusMap[String(r.status)] || String(r.status);
    const err = r.last_error ? `<div class="muted" style="font-size:13px;margin-top:4px">错误：${escapeHtml(r.last_error)}</div>` : "";
    
    return `<tr>
      <td class="td-id" title="点击复制 ID：${r.id}"><span class="copyable" data-text="${r.id}" style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;color:#6b4ba6;font-weight:500" title="点击复制 ID：${r.id}">${r.id}</span></td>
      <td class="td-clip" data-field="邮箱" data-full="${escapeHtml(email)}">
        <span class="expand">展开</span>
      </td>
      <td class="td-clip" data-field="内容" data-full="${escapeHtml(String(r.content))}">
        <span class="expand">展开</span>
      </td>
      ${signer ? `<td class="td-clip" data-field="落款" data-full="${escapeHtml(signer)}">
        <span class="expand">展开</span>
      </td>` : '<td class="td-clip-wide muted">—</td>'}
      ${contact ? `<td class="td-clip" data-field="联系方式" data-full="${escapeHtml(contact)}">
        <span class="expand">展开</span>
      </td>` : '<td class="td-clip-wide muted">—</td>'}
      <td class="td-ip">${ip || "—"}</td>
      <td class="td-time">${sendAt}</td>
      <td class="td-time">${createdAt}</td>
      <td>${statusZh}</td>
      <td>
        <form method="post" action="/api/admin/delete" onsubmit="return confirm('确认删除？');" style="display:inline">
          <input type="hidden" name="id" value="${r.id}">
          <button type="submit" style="padding:8px 14px;font-size:14px">删除</button>
        </form>
        ${err}
      </td>
    </tr>`;
  }).join("");

  const statusOptions = ['', 'pending', 'sent', 'delivered', 'bounced', 'failed'].map(s => {
    const labels: Record<string, string> = {
      '': '全部状态',
      'pending': '⏳ 待发送',
      'sent': '📤 已发送',
      'delivered': '✅ 已投递',
      'bounced': '❌ 被拒收',
      'failed': '⚠️ 失败'
    };
    return `<option value="${s}" ${s === statusFilter ? 'selected' : ''}>${labels[s]}</option>`;
  }).join('');

  return htmlPage("管理面板", `
<div class="admin-header" style="flex-wrap:wrap;gap:16px">
  <h1>⚙️ 管理面板</h1>
  <div style="display:flex;gap:12px;flex-wrap:wrap">
    <a href="/admin/stats"><button class="logout-btn">📊 统计面板</button></a>
    <a href="/admin/logout"><button class="logout-btn">退出登录</button></a>
  </div>
</div>

<div class="section">
  <form method="post" action="/api/admin/settings">
    <div class="settings-header">
      <h2>站点设置</h2>
      <button type="submit" style="padding:10px 20px;font-size:14px">💾 保存设置</button>
    </div>
    <div class="settings-grid">
      <div class="settings-item">
        <label>每 IP 每天上限</label>
        <input type="number" name="ip_daily_limit" min="0" step="1" value="${s.ip_daily_limit}" required />
        <div class="note muted">超过将返回 429</div>
      </div>
      <div class="settings-item">
        <label>每 IP 每 10 分钟上限</label>
        <input type="number" name="ip_10min_limit" min="0" step="1" value="${s.ip_10min_limit}" required />
      </div>
      <div class="settings-item">
        <label>最小提前量</label>
        <select name="min_lead_seconds">${settingsOptions(s.min_lead_seconds)}</select>
        <div class="note muted">投递时间 ≥ 当前 + 提前量</div>
      </div>
      <div class="settings-item">
        <label>每天投递上限</label>
        <input type="number" name="daily_create_limit" min="0" step="1" value="${s.daily_create_limit}" required />
        <div class="note muted">按投递日期（北京时区）统计</div>
      </div>
    </div>
  </form>
</div>

<div class="section">
  <div class="settings-header">
    <h2>胶囊列表（最近 1000 条）</h2>
    <div style="display:flex;gap:8px">
      <button onclick="exportCSV()" style="padding:10px 20px;font-size:14px">📥 导出 CSV</button>
      <button onclick="exportJSON()" style="padding:10px 20px;font-size:14px">📥 导出 JSON</button>
    </div>
  </div>
  
  <form method="get" action="/admin" style="margin-bottom:16px">
    <div class="filter-grid">
      <div>
        <label style="margin:0 0 6px 0;font-size:14px">状态</label>
        <select name="status" style="padding:10px 12px;font-size:15px">${statusOptions}</select>
      </div>
      <div>
        <label style="margin:0 0 6px 0;font-size:14px">邮箱</label>
        <input type="text" name="email" placeholder="搜索邮箱..." value="${escapeHtml(searchEmail)}" style="padding:10px 12px;font-size:15px" autocomplete="off" />
      </div>
      <div>
        <label style="margin:0 0 6px 0;font-size:14px">ID</label>
        <input type="text" name="id" placeholder="搜索 ID..." value="${escapeHtml(searchId)}" style="padding:10px 12px;font-size:15px" autocomplete="off" />
      </div>
      <div style="display:flex;align-items:flex-end;gap:8px">
        <button type="submit" style="padding:10px 16px;font-size:14px;flex:1;white-space:nowrap">🔍 筛选</button>
        <a href="/admin" style="text-decoration:none;flex:1"><button type="button" style="padding:10px 16px;font-size:14px;width:100%;background:linear-gradient(135deg,#8b7ba8,#9b8bb8);white-space:nowrap">🔄 重置</button></a>
      </div>
    </div>
  </form>
  
  <div class="table-wrap">
    <table id="capsule-table">
      <thead>
        <tr>
          <th>ID</th><th>邮箱</th><th>内容</th><th>落款</th><th>联系方式</th>
          <th>IP</th><th>投递时间</th><th>创建时间</th><th>状态</th><th>操作</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="10" class="muted" style="text-align:center;padding:24px">暂无数据</td></tr>`}</tbody>
    </table>
  </div>
</div>

<div class="overlay" id="ov" onclick="if(event.target===this) this.style.display='none'">
  <div class="panel">
    <div class="panel-header">
      <strong id="ov-title">预览</strong>
      <button onclick="document.getElementById('ov').style.display='none'" class="close-btn">✕</button>
    </div>
    <div class="panel-body">
      <pre id="ov-text"></pre>
    </div>
  </div>
</div>

<script>
(function(){
  document.addEventListener('click', function(e){
    const t = e.target;
    if (t && t.classList && t.classList.contains('expand')) {
      const td = t.parentElement;
      const full = td.getAttribute('data-full') || td.textContent || '';
      const field = td.getAttribute('data-field') || '内容';
      const ov = document.getElementById('ov');
      const txt = document.getElementById('ov-text');
      const title = document.getElementById('ov-title');
      title.textContent = field + '预览';
      txt.textContent = full;
      ov.style.display = 'flex';
    }
    if (t && t.classList && t.classList.contains('copyable')) {
      const text = t.getAttribute('data-text') || t.textContent || '';
      navigator.clipboard.writeText(text).then(() => {
        const originalText = t.textContent;
        t.textContent = '✅ 已复制!';
        t.style.color = '#059669';
        setTimeout(() => {
          t.textContent = originalText;
          t.style.color = '#6b4ba6';
        }, 1500);
      }).catch(err => {
        t.textContent = '❌ 复制失败';
        t.style.color = '#d946ef';
        setTimeout(() => {
          t.textContent = text;
          t.style.color = '#6b4ba6';
        }, 1500);
      });
    }
  });
  
  async function fetchData() {
    const params = new URLSearchParams(window.location.search);
    const res = await fetch('/api/admin/capsules?' + params.toString());
    if (!res.ok) {
      alert('获取数据失败');
      return null;
    }
    return await res.json();
  }
  
  window.exportCSV = async function() {
    const data = await fetchData();
    if (!data) return;
    
    const headers = ['ID', '邮箱', '内容', '落款', '联系方式', 'IP', '投递时间', '创建时间', '状态', '错误'];
    const rows = data.map(r => [
      r.id,
      r.email,
      (r.content || '').replace(/"/g, '""'),
      r.signer || '',
      r.contact || '',
      r.ip_addr || '',
      r.send_at_shanghai,
      r.created_at_shanghai,
      r.status,
      (r.last_error || '').replace(/"/g, '""')
    ]);
    
    const csv = [
      headers.map(h => '"' + h + '"').join(','),
      ...rows.map(row => row.map(cell => '"' + cell + '"').join(','))
    ].join('\\n');
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'capsules_' + new Date().toISOString().slice(0,10) + '.csv';
    link.click();
  };
  
  window.exportJSON = async function() {
    const data = await fetchData();
    if (!data) return;
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'capsules_' + new Date().toISOString().slice(0,10) + '.json';
    link.click();
  };
})();
</script>
`);
}

// ---------- Validation ----------
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- Resend ----------
async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<string> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, html })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  const j = await r.json() as { id?: string };
  return j.id || "";
}

// ---------- Rate limiting (D1) ----------
function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP")
    || req.headers.get("x-forwarded-for")
    || "0.0.0.0";
}
function tenMinBucketShanghai(tsSec: number): string {
  const d = new Date((tsSec + TZ_OFFSET_SEC) * 1000); // 时区：Asia/Shanghai
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = Math.floor(d.getUTCMinutes() / 10) * 10;
  const mmStr = String(mm).padStart(2, "0");
  return `${y}${m}${day}${hh}${mmStr}`;
}
async function bumpIpCountersOr429(env: Env, ip: string, nowSec: number, s: Settings) {
  const ymd = ymdShanghaiFromEpoch(nowSec);
  const bucket = tenMinBucketShanghai(nowSec);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO rate_limit_daily (ip, ymd, count, updated_at) VALUES (?,?,1,?)
       ON CONFLICT(ip, ymd) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
    ).bind(ip, ymd, nowSec),
    env.DB.prepare(
      `INSERT INTO rate_limit_bucket (ip, bucket, count, updated_at) VALUES (?,?,1,?)
       ON CONFLICT(ip, bucket) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
    ).bind(ip, bucket, nowSec)
  ]);
  const [rowDaily, rowWin] = await Promise.all([
    env.DB.prepare("SELECT count FROM rate_limit_daily WHERE ip=? AND ymd=?").bind(ip, ymd).first<{count:number}>(),
    env.DB.prepare("SELECT count FROM rate_limit_bucket WHERE ip=? AND bucket=?").bind(ip, bucket).first<{count:number}>()
  ]);
  const sDaily = rowDaily?.count ?? 0;
  const sWin = rowWin?.count ?? 0;
  const settings = await readSettings(env);
  if (sDaily > settings.ip_daily_limit) {
    throw new Response(JSON.stringify({ ok: false, message: `该 IP 今日次数已达上限（${settings.ip_daily_limit}）` }), { status: 429, headers: JSON_TYPE });
  }
  if (sWin > settings.ip_10min_limit) {
    throw new Response(JSON.stringify({ ok: false, message: `该 IP 操作过于频繁，请稍后再试` }), { status: 429, headers: JSON_TYPE });
  }
}

// ---------- Public status (API + Page) ----------
type CapsulePublic = {
  id: string; status: string; send_at: number; // epoch(UTC)
  sent_at?: number | null; delivered_at?: number | null;
  bounced_at?: number | null; bounce_reason?: string | null;
  now: number; // server now utc seconds
};
async function getCapsulePublic(env: Env, id: string): Promise<CapsulePublic | null> {
  const row = await env.DB.prepare(
    `SELECT id,status,send_at,sent_at,delivered_at,bounced_at,bounce_reason
     FROM capsules WHERE id=? AND status!='deleted'`
  ).bind(id).first<any>();
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    send_at: row.send_at,
    sent_at: row.sent_at ?? null,
    delivered_at: row.delivered_at ?? null,
    bounced_at: row.bounced_at ?? null,
    bounce_reason: row.bounce_reason ?? null,
    now: Math.floor(Date.now()/1000)
  };
}
function renderNotFoundPage(): Response {
  return htmlPage("未找到 - 时光胶囊", `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Playfair+Display:wght@400;600&display=swap');
  
  :root {
    --parchment: #f5f0e6;
    --ink: #3d3229;
    --ink-light: #6b5d4d;
    --accent: #a67c6d;
    --gold: #c9a962;
    --shadow: rgba(61, 50, 41, 0.1);
  }
  
  * { box-sizing: border-box; }
  
  body {
    margin: 0;
    min-height: 100vh;
    background: linear-gradient(180deg, #e8e0d4 0%, #f5f0e6 50%, #ebe4d8 100%);
    font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif;
    color: var(--ink);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
  }
  
  .capsule-card {
    width: 100%;
    max-width: 480px;
    background: 
      linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%),
      var(--parchment);
    border-radius: 24px;
    box-shadow: 
      0 4px 24px var(--shadow),
      0 1px 3px var(--shadow),
      inset 0 1px 0 rgba(255,255,255,0.6);
    padding: 56px 40px;
    position: relative;
    overflow: hidden;
    text-align: center;
  }
  
  .capsule-card::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4px;
    background: linear-gradient(90deg, var(--gold), var(--accent), var(--gold));
  }
  
  .corner {
    position: absolute;
    width: 60px;
    height: 60px;
    opacity: 0.15;
    pointer-events: none;
  }
  .corner-tl { top: 12px; left: 12px; border-top: 2px solid var(--ink); border-left: 2px solid var(--ink); }
  .corner-tr { top: 12px; right: 12px; border-top: 2px solid var(--ink); border-right: 2px solid var(--ink); }
  .corner-bl { bottom: 12px; left: 12px; border-bottom: 2px solid var(--ink); border-left: 2px solid var(--ink); }
  .corner-br { bottom: 12px; right: 12px; border-bottom: 2px solid var(--ink); border-right: 2px solid var(--ink); }
  
  .empty-icon {
    font-size: 64px;
    margin-bottom: 20px;
    opacity: 0.8;
  }
  
  .empty-title {
    font-size: 26px;
    font-weight: 600;
    color: var(--accent);
    margin: 0 0 12px;
    letter-spacing: 3px;
  }
  
  .empty-desc {
    font-size: 15px;
    color: var(--ink-light);
    line-height: 1.8;
    margin: 0 0 32px;
  }
  
  .back-btn {
    display: inline-block;
    padding: 14px 36px;
    background: linear-gradient(135deg, var(--accent) 0%, #8b6b5d 100%);
    color: var(--parchment);
    text-decoration: none;
    border-radius: 30px;
    font-size: 15px;
    letter-spacing: 2px;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(166,124,109,0.3);
  }
  
  .back-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(166,124,109,0.4);
  }
  
  .divider {
    width: 60px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold), transparent);
    margin: 0 auto 24px;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .capsule-card { animation: fadeIn 0.6s ease-out; }
  
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  
  .empty-icon { animation: float 3s ease-in-out infinite; }
</style>

<div class="capsule-card">
  <div class="corner corner-tl"></div>
  <div class="corner corner-tr"></div>
  <div class="corner corner-bl"></div>
  <div class="corner corner-br"></div>
  
  <div class="empty-icon">📭</div>
  <h1 class="empty-title">无迹可寻</h1>
  <div class="divider"></div>
  <p class="empty-desc">
    这枚时光胶囊不存在，或已随时光消逝。<br>
    请确认胶囊 ID/链接是否正确。
  </p>
  <a href="/" class="back-btn">返回首页</a>
</div>`);
}
function renderStatusPage(c: CapsulePublic, contactEmail?: string): Response {
  const now = c.now, left = Math.max(0, c.send_at - now);
  const shSend = fmtShanghai(c.send_at);
  
  // 状态配置
  const statusConfig: Record<string, { icon: string; title: string; desc: string; accent: string }> = {
    pending: { 
      icon: "⏳", 
      title: left > 0 ? "封印中" : "即将启封", 
      desc: left > 0 ? `这枚时光胶囊将于 ${shSend} 启封寄出` : "封印时刻已至，静候系统唤醒",
      accent: "#8b7355"
    },
    sent: { 
      icon: "📜", 
      title: "已启封", 
      desc: `信笺已于 ${c.sent_at ? fmtShanghai(c.sent_at) : shSend} 飞向远方，等待抵达`,
      accent: "#6b8e7d"
    },
    delivered: { 
      icon: "✉️", 
      title: "已送达", 
      desc: `信笺已于 ${c.delivered_at ? fmtShanghai(c.delivered_at) : ""} 安然抵达`,
      accent: "#5d7a5d"
    },
    bounced: { 
      icon: "📭", 
      title: "未能送达", 
      desc: c.bounce_reason ? `原因：${escapeHtml(c.bounce_reason)}` : "信笺被退回，未能抵达目的地",
      accent: "#a67c6d"
    },
    failed: { 
      icon: "⚠️", 
      title: "发送受阻", 
      desc: "系统遇到了一些问题，请稍后再试",
      accent: "#a67c6d"
    }
  };
  
  const cfg = statusConfig[c.status] || { icon: "📦", title: c.status, desc: "", accent: "#8b7355" };

  return htmlPage(`时光胶囊 - ${c.id}`, `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Playfair+Display:wght@400;600&display=swap');
  
  :root {
    --parchment: #f5f0e6;
    --ink: #3d3229;
    --ink-light: #6b5d4d;
    --accent: ${cfg.accent};
    --gold: #c9a962;
    --shadow: rgba(61, 50, 41, 0.1);
  }
  
  * { box-sizing: border-box; }
  
  body {
    margin: 0;
    min-height: 100vh;
    background: linear-gradient(180deg, #e8e0d4 0%, #f5f0e6 50%, #ebe4d8 100%);
    font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif;
    color: var(--ink);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
  }
  
  .capsule-card {
    width: 100%;
    max-width: 520px;
    background: 
      linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%),
      var(--parchment);
    border-radius: 24px;
    box-shadow: 
      0 4px 24px var(--shadow),
      0 1px 3px var(--shadow),
      inset 0 1px 0 rgba(255,255,255,0.6);
    padding: 48px 40px;
    position: relative;
    overflow: hidden;
  }
  
  .capsule-card::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4px;
    background: linear-gradient(90deg, var(--gold), var(--accent), var(--gold));
  }
  
  /* 装饰角 */
  .corner {
    position: absolute;
    width: 60px;
    height: 60px;
    opacity: 0.15;
    pointer-events: none;
  }
  .corner-tl { top: 12px; left: 12px; border-top: 2px solid var(--ink); border-left: 2px solid var(--ink); }
  .corner-tr { top: 12px; right: 12px; border-top: 2px solid var(--ink); border-right: 2px solid var(--ink); }
  .corner-bl { bottom: 12px; left: 12px; border-bottom: 2px solid var(--ink); border-left: 2px solid var(--ink); }
  .corner-br { bottom: 12px; right: 12px; border-bottom: 2px solid var(--ink); border-right: 2px solid var(--ink); }
  
  .header {
    text-align: center;
    margin-bottom: 32px;
  }
  
  .status-icon {
    font-size: 48px;
    margin-bottom: 12px;
    filter: drop-shadow(0 2px 4px var(--shadow));
  }
  
  .status-title {
    font-size: 28px;
    font-weight: 600;
    color: var(--accent);
    margin: 0 0 8px;
    letter-spacing: 4px;
  }
  
  .status-desc {
    font-size: 15px;
    color: var(--ink-light);
    margin: 0;
    line-height: 1.6;
  }
  
  /* 倒计时 */
  .countdown-section {
    margin: 36px 0;
    padding: 32px 20px;
    background: linear-gradient(135deg, rgba(201,169,98,0.08) 0%, rgba(139,115,85,0.05) 100%);
    border-radius: 16px;
    border: 1px solid rgba(201,169,98,0.2);
  }
  
  .countdown-label {
    text-align: center;
    font-size: 13px;
    color: var(--ink-light);
    letter-spacing: 3px;
    margin-bottom: 20px;
    text-transform: uppercase;
  }
  
  .countdown-grid {
    display: flex;
    justify-content: center;
    gap: 12px;
  }
  
  .countdown-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 72px;
  }
  
  .countdown-value {
    font-family: 'Playfair Display', 'Noto Serif SC', serif;
    font-size: 42px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1;
    background: linear-gradient(180deg, var(--ink) 0%, var(--ink-light) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: 0 2px 4px var(--shadow);
  }
  
  .countdown-unit {
    font-size: 12px;
    color: var(--ink-light);
    margin-top: 6px;
    letter-spacing: 2px;
  }
  
  .countdown-separator {
    font-size: 32px;
    color: var(--gold);
    align-self: flex-start;
    margin-top: 4px;
    opacity: 0.6;
  }
  
  .countdown-done {
    text-align: center;
    font-size: 18px;
    color: var(--accent);
    padding: 20px;
  }
  
  /* 信息框 */
  .info-section {
    margin-top: 28px;
    padding: 20px 24px;
    background: rgba(255,255,255,0.5);
    border-radius: 12px;
    border-left: 3px solid var(--gold);
  }
  
  .info-title {
    font-size: 13px;
    color: var(--gold);
    letter-spacing: 2px;
    margin: 0 0 8px;
    font-weight: 600;
  }
  
  .info-text {
    font-size: 14px;
    color: var(--ink-light);
    line-height: 1.7;
    margin: 0;
  }
  
  .info-text a {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px dashed var(--accent);
  }
  
  .capsule-id {
    text-align: center;
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px dashed rgba(107,93,77,0.2);
  }
  
  .capsule-id-label {
    font-size: 11px;
    color: var(--ink-light);
    letter-spacing: 2px;
    opacity: 0.7;
  }
  
  .capsule-id-value {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: var(--ink-light);
    background: rgba(139,115,85,0.08);
    padding: 6px 14px;
    border-radius: 6px;
    margin-top: 6px;
    display: inline-block;
  }
  
  .back-link {
    display: block;
    text-align: center;
    margin-top: 24px;
    font-size: 14px;
    color: var(--ink-light);
    text-decoration: none;
    transition: color 0.2s;
  }
  
  .back-link:hover {
    color: var(--accent);
  }
  
  /* 动画 */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .capsule-card { animation: fadeIn 0.6s ease-out; }
  
  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  
  .countdown-separator { animation: pulse 1s infinite; }
</style>

<div class="capsule-card">
  <div class="corner corner-tl"></div>
  <div class="corner corner-tr"></div>
  <div class="corner corner-bl"></div>
  <div class="corner corner-br"></div>
  
  <div class="header">
    <div class="status-icon">${cfg.icon}</div>
    <h1 class="status-title">${cfg.title}</h1>
    <p class="status-desc">${cfg.desc}</p>
  </div>
  
  ${c.status === "pending" ? `
  <div class="countdown-section">
    <div class="countdown-label">距 离 启 封</div>
    <div id="countdown" class="countdown-grid">
      <div class="countdown-item">
        <span class="countdown-value" id="cd-days">--</span>
        <span class="countdown-unit">天</span>
      </div>
      <span class="countdown-separator">:</span>
      <div class="countdown-item">
        <span class="countdown-value" id="cd-hours">--</span>
        <span class="countdown-unit">时</span>
      </div>
      <span class="countdown-separator">:</span>
      <div class="countdown-item">
        <span class="countdown-value" id="cd-mins">--</span>
        <span class="countdown-unit">分</span>
      </div>
      <span class="countdown-separator">:</span>
      <div class="countdown-item">
        <span class="countdown-value" id="cd-secs">--</span>
        <span class="countdown-unit">秒</span>
      </div>
    </div>
  </div>
  ` : ""}
  
  <div class="info-section">
    <p class="info-title">💡 温馨提示</p>
    <p class="info-text">请妥善保存此页面链接，以便随时查看胶囊投递状态。建议收藏至浏览器或截图留存。</p>
  </div>
  
  ${(contactEmail && contactEmail.trim()) ? `
  <div class="info-section" style="margin-top:16px;border-left-color:var(--accent)">
    <p class="info-title">📮 撤销说明</p>
    <p class="info-text">如需撤销这枚胶囊，请在投递前发送邮件至 <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>，并注明胶囊 ID。</p>
  </div>
  ` : ""}
  
  <div class="capsule-id">
    <div class="capsule-id-label">CAPSULE ID</div>
    <div class="capsule-id-value">${c.id}</div>
  </div>
  
  <a href="/" class="back-link">← 返回首页</a>
</div>

<script>
(function(){
  var sendAt = ${c.send_at};
  var status = ${JSON.stringify(c.status)};
  
  function pad(n) { return n < 10 ? '0' + n : n; }
  
  function tick() {
    if (status !== "pending") return;
    
    var left = Math.max(0, sendAt - Math.floor(Date.now() / 1000));
    var container = document.getElementById('countdown');
    if (!container) return;
    
    if (left > 0) {
      var d = Math.floor(left / 86400);
      var h = Math.floor((left % 86400) / 3600);
      var m = Math.floor((left % 3600) / 60);
      var s = left % 60;
      
      document.getElementById('cd-days').textContent = pad(d);
      document.getElementById('cd-hours').textContent = pad(h);
      document.getElementById('cd-mins').textContent = pad(m);
      document.getElementById('cd-secs').textContent = pad(s);
    } else {
      container.innerHTML = '<div class="countdown-done">✨ 封印时刻已至，静候启封 ✨</div>';
    }
  }
  
  tick();
  setInterval(tick, 1000);
  setInterval(function(){ location.reload(); }, 30000);
})();
</script>`);
}


// ---------- Webhook 验证（Resend/Svix） ----------
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function verifySvixSignature(raw: string, headers: Headers, secret?: string): Promise<boolean> {
  if (!secret) return false;
  const id = headers.get("svix-id") || "";
  const ts = headers.get("svix-timestamp") || "";
  const sig = headers.get("svix-signature") || "";
  if (!id || !ts || !sig) return false;
  // 构造 signed content：id.timestamp.body
  const content = `${id}.${ts}.${raw}`;
  // webhook secret 取 whsec_ 之后部分做 base64 decode
  const keyB64 = secret.split("_")[1] || "";
  const keyBytes = b64ToBytes(keyB64);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(content));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes))); // base64
  // 头里可能有多段：v1,xxx v1,yyy v2,zzz ...
  const parts = sig.split(" ").map(s => s.split(",")[1]).filter(Boolean);
  return parts.some(p => timingSafeEqual(p, expected));
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i=0;i<a.length;i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// ---------- Router ----------
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.DB || typeof (env.DB as any).prepare !== "function") {
      return new Response("D1 binding 'DB' is missing. Check [[d1_databases]] in wrangler.toml.", { status: 500 });
    }

    if (req.method === "GET" && new URL(req.url).pathname === "/health") {
      try {
        const row = await env.DB.prepare("SELECT 1 as ok").first<any>();
        return new Response(JSON.stringify({ ok: true, d1: !!row }), { headers: { "content-type": "application/json" }});
      } catch (e:any) {
        return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:500, headers: { "content-type":"application/json" }});
      }
    }

    const url = new URL(req.url);
    const path = url.pathname;

    try {
      // Pages
      if (req.method === "GET" && path === "/") {
        const s = await readSettings(env);
        return indexPage(s);
      }
      if (req.method === "GET" && path === "/thanks") {
        const id = url.searchParams.get("id") || undefined;
        return thanksPage(id);
      }

      // Public: status page & API
      if (req.method === "GET" && path.startsWith("/status/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const c = await getCapsulePublic(env, id);
        if (!c) return renderNotFoundPage();
        return renderStatusPage(c, env.CONTACT_EMAIL);
      }
      if (req.method === "GET" && path.startsWith("/api/status/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const c = await getCapsulePublic(env, id);
        if (!c) return jsonBad(404, "not found");
        const left = Math.max(0, c.send_at - c.now);
        return new Response(JSON.stringify({
          id: c.id,
          status: c.status,
          send_at: c.send_at,
          send_at_shanghai: fmtShanghai(c.send_at),
          countdown_seconds: left,
          sent_at: c.sent_at || null,
          delivered_at: c.delivered_at || null,
          bounced_at: c.bounced_at || null,
          bounce_reason: c.bounce_reason || null,
          tz: "Asia/Shanghai"
        }), { headers: JSON_TYPE });
      }

      // Admin statistics page
      if (req.method === "GET" && path === "/admin/stats") {
        return adminStatsPage(req, env);
      }

      // Admin pages
      if (req.method === "GET" && path.startsWith("/admin")) {
        if (path === "/admin/logout") {
          return new Response("", { status: 302, headers: {
            "location": "/admin",
            "set-cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
          }});
        }
        return adminPage(req, env);
      }

      // Admin: login
      if (req.method === "POST" && path === "/admin/login") {
        const form = await req.formData();
        const pwd = String(form.get("password") || "");
        if (!pwd || pwd !== env.ADMIN_PASSWORD) {
          return htmlPage("管理登录", `<h1>🔐 管理登录</h1><p style="color:#d946ef;font-size:15px">❌ 密码错误</p><p><a href="/admin" style="color:#9370db;text-decoration:none;font-weight:500">← 返回</a></p>`);
        }
        const exp = Math.floor(Date.now()/1000) + COOKIE_MAX_AGE;
        const sig = await hmacSha256(env.ADMIN_PASSWORD, String(exp));
        return new Response("", {
          status: 302,
          headers: {
            "location": "/admin",
            "set-cookie": `${COOKIE_NAME}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
          }
        });
      }

      // Admin: update settings
      if (req.method === "POST" && path === "/api/admin/settings") {
        if (!(await isAuthed(req, env))) return jsonBad(401, "未授权");
        const form = await req.formData();
        const s = {
          ip_daily_limit: Math.max(0, parseInt(String(form.get("ip_daily_limit") || "0"), 10) || 0),
          ip_10min_limit: Math.max(0, parseInt(String(form.get("ip_10min_limit") || "0"), 10) || 0),
          min_lead_seconds: Math.max(0, parseInt(String(form.get("min_lead_seconds") || "0"), 10) || 0),
          daily_create_limit: Math.max(0, parseInt(String(form.get("daily_create_limit") || "0"), 10) || 0),
        };
        await updateSettings(env, s);
        return new Response("", { status: 302, headers: { "location": "/admin" }});
      }

      // Public submit
      if (req.method === "POST" && path === "/api/submit") {
        const s = await readSettings(env);
        const ct = req.headers.get("content-type") || "";
        let email = "", content = "", sendAtStr = "", sign = "", contact = "";
        if (ct.includes("application/json")) {
          const data = await req.json(); email = (data.email||"").trim(); content = (data.content||"").trim(); sendAtStr = (data.send_at||"").trim(); sign = (data.sign||data.signer||"").trim(); contact = (data.contact||"").trim();
        } else {
          const form = await req.formData();
          email = String(form.get("email")||"").trim();
          content = String(form.get("content")||"").trim();
          sendAtStr = String(form.get("send_at")||"").trim();
          sign = String(form.get("sign")||"").trim();
          contact = String(form.get("contact")||"").trim();
        }

        // IP 限流
        const nowSec = Math.floor(Date.now()/1000);
        const ip = clientIp(req);
        try { await bumpIpCountersOr429(env, ip, nowSec, s); } catch (resp:any) {
          if (resp instanceof Response) return resp; throw resp;
        }

        // 校验
        if (!content) return jsonBad(400, "内容不能为空");
        if (!isValidEmail(email)) return jsonBad(400, "邮箱格式不正确");
        const sendAt = toUnixSecondsShanghai(sendAtStr);
        if (!sendAt) return jsonBad(400, "投递时间格式不正确");
        if (sendAt < nowSec + s.min_lead_seconds) {
          return jsonBad(400, `投递时间需不早于当前时间 + ${humanizeSeconds(s.min_lead_seconds)}（以北京时区计算）`);
        }

        // 站点“每天投递上限”：直接用 send_at_ymd 等值统计，避免边界/时区计算
        const sendAtYmd = ymdShanghaiFromEpoch(sendAt);
        const row = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM capsules WHERE send_at_ymd=? AND status!='deleted'"
        ).bind(sendAtYmd).first<{c:number}>();
        
        if ((row?.c ?? 0) >= s.daily_create_limit) {
          return jsonBad(429, `${sendAtYmd} 当天投递已达上限（${s.daily_create_limit}），请选择其他日期`);
        }

        // 入库
        const id = crypto.randomUUID();
        const createdYmd = ymdShanghaiFromEpoch(nowSec);
        await env.DB.prepare(
          `INSERT INTO capsules (id,email,content,signer,contact,ip_addr,send_at,send_at_ymd,created_at,created_on_ymd,status)
           VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')`
        ).bind(id, email, content, sign || null, contact || null, ip, sendAt, sendAtYmd, nowSec, createdYmd).run();

        // HTML → 显示 ID；JSON → 返回 status_url
        const statusUrl = `/status/${id}`;
        if ((req.headers.get("accept") || "").includes("text/html")) {
          return new Response("", { status: 302, headers: { "location": `/thanks?id=${id}` }});
        }
        return new Response(JSON.stringify({ ok: true, id, status_url: statusUrl }), { headers: JSON_TYPE });
      }

      // Admin delete
      if (req.method === "POST" && path === "/api/admin/delete") {
        if (!(await isAuthed(req, env))) return jsonBad(401, "未授权");
        const form = await req.formData();
        const id = String(form.get("id") || "");
        if (!id) return jsonBad(400, "缺少 id");
        await env.DB.prepare("UPDATE capsules SET status='deleted' WHERE id=?").bind(id).run();
        return new Response("", { status: 302, headers: { "location": "/admin" }});
      }

      // Admin list api（可选）
      if (req.method === "GET" && path === "/api/admin/capsules") {
        if (!(await isAuthed(req, env))) return jsonBad(401, "未授权");

        const url = new URL(req.url);
        const statusFilter = url.searchParams.get("status") || "";
        const searchEmail = url.searchParams.get("email") || "";
        const searchId = url.searchParams.get("id") || "";

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

        let stmt = env.DB.prepare(query);
        if (bindings.length > 0) {
          stmt = stmt.bind(...bindings);
        }
        const { results } = await stmt.all();

        const mapped = (results || []).map((r: any) => ({
          ...r, send_at_shanghai: fmtShanghai(r.send_at), created_at_shanghai: fmtShanghai(r.created_at),
        }));
        return new Response(JSON.stringify(mapped), { headers: JSON_TYPE });
      }

      // Admin statistics API
      if (req.method === "GET" && path === "/api/admin/stats") {
        if (!(await isAuthed(req, env))) return jsonBad(401, "未授权");

        try {
          const url = new URL(req.url);
          const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10)));

          const now = new Date();
          const startDate = new Date(now.getTime() - days * 24 * 3600 * 1000);
          const startYmd = startDate.toISOString().slice(0, 10);

          const [
            sendDateStats,
            ipStats,
            emailStats,
            statusStats,
            totalCount
          ] = await Promise.all([
            // 按接收日期统计
            env.DB.prepare(
              `SELECT send_at_ymd as date, COUNT(*) as count
               FROM capsules
               WHERE send_at_ymd >= ? AND status != 'deleted'
               GROUP BY send_at_ymd
               ORDER BY send_at_ymd DESC
               LIMIT 100`
            ).bind(startYmd).all(),

            // 按IP统计
            env.DB.prepare(
              `SELECT ip_addr as ip, COUNT(*) as count
               FROM capsules
               WHERE ip_addr IS NOT NULL AND ip_addr != '' AND status != 'deleted'
               GROUP BY ip_addr
               ORDER BY count DESC
               LIMIT 50`
            ).all(),

            // 按邮箱统计
            env.DB.prepare(
              `SELECT email, COUNT(*) as count
               FROM capsules
               WHERE status != 'deleted'
               GROUP BY email
               ORDER BY count DESC
               LIMIT 50`
            ).all(),

            // 按状态统计
            env.DB.prepare(
              `SELECT status, COUNT(*) as count
               FROM capsules
               WHERE status != 'deleted'
               GROUP BY status`
            ).all(),

            // 总数量
            env.DB.prepare(
              `SELECT COUNT(*) as total FROM capsules WHERE status != 'deleted'`
            ).first()
          ]);

          return new Response(JSON.stringify({
            sendDateStats: sendDateStats.results || [],
            ipStats: ipStats.results || [],
            emailStats: emailStats.results || [],
            statusStats: statusStats.results || [],
            totalCount: totalCount?.total || 0,
            dateRange: {
              days,
              start: startYmd,
              end: now.toISOString().slice(0, 10)
            }
          }), { headers: JSON_TYPE });
        } catch (e: any) {
          return jsonBad(500, e?.message || "获取统计数据失败");
        }
      }

      // Resend Webhook（事件：sent / delivered / bounced / failed ...）
      if (req.method === "POST" && path === "/api/webhook/resend") {
        const raw = await req.text();
        const ok = await verifySvixSignature(raw, req.headers, env.RESEND_WEBHOOK_SECRET);
        if (!ok) return new Response("invalid signature", { status: 400 });

        const event = JSON.parse(raw);
        const type = String(event?.type || "");
        const emailId = String(event?.data?.email_id || ""); // 事件中的消息 ID
        const createdAt = Math.floor(new Date(event?.created_at || Date.now()).getTime()/1000);

        if (!emailId) return new Response("no email_id", { status: 200 });

        // 找到对应胶囊
        const cap = await env.DB.prepare(
          "SELECT id FROM capsules WHERE provider_email_id=?"
        ).bind(emailId).first<{id:string}>();

        // 记录事件（可选）
        await env.DB.prepare(
          "INSERT INTO sends_log (id, capsule_id, sent_at, status, error, provider_email_id, event) VALUES (?,?,?,?,?,?,?)"
        ).bind(crypto.randomUUID(), cap?.id || "unknown", createdAt, "event", null, emailId, type).run();

        if (!cap?.id) return new Response("ok", { status: 200 });

        if (type === "email.delivered") {
          await env.DB.prepare("UPDATE capsules SET status='delivered', delivered_at=?, last_error=NULL WHERE id=?")
            .bind(createdAt, cap.id).run();
        } else if (type === "email.bounced") {
          const reason = String(event?.data?.bounce?.message || "bounced");
          await env.DB.prepare("UPDATE capsules SET status='bounced', bounced_at=?, bounce_reason=?, last_error=? WHERE id=?")
            .bind(createdAt, reason, reason, cap.id).run();
        } else if (type === "email.failed") {
          const reason = String(event?.data?.failed?.reason || "failed");
          await env.DB.prepare("UPDATE capsules SET status='failed', last_error=? WHERE id=?")
            .bind(reason, cap.id).run();
        } else if (type === "email.sent") {
          // 可选：若你希望以 webhook 的 sent 覆盖 sent_at
          await env.DB.prepare("UPDATE capsules SET sent_at=? WHERE id=?").bind(createdAt, cap.id).run();
        }
        return new Response("ok", { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    } catch (e: any) {
      return jsonBad(500, e?.message || "Server Error");
    }
  },

  // Cron：扫描到期（UTC 现在 >= send_at）
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (!env.DB || typeof (env.DB as any).prepare !== "function") {
      return new Response("D1 binding 'DB' is missing. Check [[d1_databases]] in wrangler.toml.", { status: 500 });
    }
    const nowSec = Math.floor(Date.now()/1000);
    const { results } = await env.DB.prepare(
      `SELECT id,email,content,signer,contact,send_at,created_at FROM capsules
       WHERE status='pending' AND send_at <= ? LIMIT 50`
    ).bind(nowSec).all<any>();

    if (!results?.length) return;
    await Promise.all((results as any[]).map(async row => {
      const id = row.id as string;
      try {
        const subject = "你的时间胶囊到了 💌";
        const site = env.BASE_URL || "";
        const sendAtShanghai = fmtShanghai(row.send_at as number);
        const createdAtShanghai = fmtShanghai(row.created_at as number);
        const html = renderEmailTemplate({
          content: row.content as string,
          signer: (row.signer as string)||null,
          contact: (row.contact as string)||null,
          site, capsuleId: id, sendAtShanghai, createdAtShanghai
        });

        const providerId = await sendEmail(env, row.email, subject, html); // 返回 Resend 的 id
        const sentAt = Math.floor(Date.now()/1000);

        await env.DB.batch([
          env.DB.prepare("UPDATE capsules SET status='sent', sent_at=?, provider_email_id=?, last_error=NULL WHERE id=?")
            .bind(sentAt, providerId || null, id),
          env.DB.prepare("INSERT INTO sends_log (id,capsule_id,sent_at,status,error,provider_email_id,event) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), id, sentAt, "success", null, providerId || null, "api_sent")
        ]);
      } catch (err: any) {
        await env.DB.batch([
          env.DB.prepare("UPDATE capsules SET status='failed', last_error=? WHERE id=?")
            .bind(String(err?.message || err || "send failed"), id),
          env.DB.prepare("INSERT INTO sends_log (id,capsule_id,sent_at,status,error,event) VALUES (?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), id, Math.floor(Date.now()/1000), "fail", String(err?.message || err), "api_failed")
        ]);
      }
    }));
  }
};

// ---------- Admin statistics page ----------
async function adminStatsPage(req: Request, env: Env): Promise<Response> {
  const authed = await isAuthed(req, env);
  if (!authed) {
    return new Response("Unauthorized", { status: 401 });
  }

  return htmlPage("统计面板", `
<div class="admin-header">
  <h1>📊 统计面板</h1>
  <a href="/admin"><button class="logout-btn">← 返回管理</button></a>
</div>

<div class="section">
  <div class="settings-header" style="flex-wrap:wrap;gap:16px">
    <h2>数据概览</h2>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;min-width:0">
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
        <label style="margin:0;font-size:14px;color:#8b7ba8;white-space:nowrap">时间范围</label>
        <select id="days-selector" style="padding:8px 12px;border-radius:12px;border:2px solid rgba(138,103,184,0.25);font-size:14px;background:rgba(255,255,255,0.9);min-width:120px">
          <option value="7">最近 7 天</option>
          <option value="30" selected>最近 30 天</option>
          <option value="90">最近 90 天</option>
          <option value="365">最近 365 天</option>
        </select>
      </div>
      <button id="refresh-btn" style="padding:8px 16px;font-size:14px;white-space:nowrap;flex-shrink:0">🔄 刷新</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:32px">
    <div style="background:linear-gradient(135deg,#9370db,#ba55d3);color:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 24px rgba(147,112,219,0.3);text-align:center">
      <div style="font-size:28px;font-weight:700;margin-bottom:4px" id="total-count">--</div>
      <div style="font-size:14px;opacity:0.9">总胶囊数</div>
    </div>
    <div style="background:linear-gradient(135deg,#6b4ba6,#8b6bb8);color:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 24px rgba(147,112,219,0.3);text-align:center">
      <div style="font-size:28px;font-weight:700;margin-bottom:4px" id="date-range">--</div>
      <div style="font-size:14px;opacity:0.9">统计范围</div>
    </div>
  </div>

  <div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;border:1px solid rgba(138,103,184,0.15);box-shadow:0 4px 16px rgba(147,112,219,0.1);margin-bottom:24px">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <h3 style="margin:0;color:#6b4ba6;font-size:16px;font-weight:600">📅 按接收日期统计 - 热力图</h3>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8b7ba8">
        <span>少</span>
        <div style="display:flex;gap:2px">
          <div style="width:12px;height:12px;background:rgba(147,112,219,0.1);border-radius:2px"></div>
          <div style="width:12px;height:12px;background:rgba(147,112,219,0.3);border-radius:2px"></div>
          <div style="width:12px;height:12px;background:rgba(147,112,219,0.5);border-radius:2px"></div>
          <div style="width:12px;height:12px;background:rgba(147,112,219,0.7);border-radius:2px"></div>
          <div style="width:12px;height:12px;background:#9370db;border-radius:2px"></div>
        </div>
        <span>多</span>
      </div>
    </div>
    <div id="heatmap-container" style="overflow-x:auto;padding:10px 0">
      <div id="heatmap" style="display:flex;flex-direction:column;gap:4px;min-width:fit-content"></div>
    </div>
    <div id="heatmap-tooltip" style="font-size:13px;color:#6b4ba6;font-weight:500;margin-top:8px;min-height:20px"></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
    <div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;border:1px solid rgba(138,103,184,0.15);box-shadow:0 4px 16px rgba(147,112,219,0.1)">
      <h3 style="margin:0 0 16px 0;color:#6b4ba6;font-size:16px;font-weight:600">📈 按接收日期统计 - 趋势图</h3>
      <div style="height:300px;position:relative">
        <canvas id="sendDateChart"></canvas>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;border:1px solid rgba(138,103,184,0.15);box-shadow:0 4px 16px rgba(147,112,219,0.1)">
      <h3 style="margin:0 0 16px 0;color:#6b4ba6;font-size:16px;font-weight:600">📊 状态分布</h3>
      <div style="height:300px;position:relative">
        <canvas id="statusChart"></canvas>
      </div>
    </div>
  </div>

  <div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;border:1px solid rgba(138,103,184,0.15);box-shadow:0 4px 16px rgba(147,112,219,0.1);margin-bottom:32px">
    <h3 style="margin:0 0 16px 0;color:#6b4ba6;font-size:16px;font-weight:600">📧 按接收邮箱统计 (TOP 10)</h3>
    <div style="height:300px;position:relative">
      <canvas id="emailChart"></canvas>
    </div>
  </div>

  <div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;border:1px solid rgba(138,103,184,0.15);box-shadow:0 4px 16px rgba(147,112,219,0.1)">
    <h3 style="margin:0 0 16px 0;color:#6b4ba6;font-size:16px;font-weight:600">🌐 按投递IP统计 (TOP 10)</h3>
    <div style="height:300px;position:relative">
      <canvas id="ipChart"></canvas>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
(function() {
  const statusColors = {
    pending: '#9370db',
    sent: '#6b4ba6',
    delivered: '#10b981',
    bounced: '#ef4444',
    failed: '#f59e0b'
  };

  const statusNames = {
    pending: '⏳ 待发送',
    sent: '📤 已发送',
    delivered: '✅ 已投递',
    bounced: '❌ 拒收',
    failed: '⚠️ 失败'
  };

  let charts = {};

  // 热力图渲染函数
  function renderHeatmap(data) {
    const container = document.getElementById('heatmap');
    const tooltip = document.getElementById('heatmap-tooltip');
    if (!container) return;

    // 清空容器
    container.innerHTML = '';

    // 创建日期到数量的映射
    const dateMap = {};
    let maxCount = 1;
    data.forEach(d => {
      dateMap[d.date] = d.count;
      if (d.count > maxCount) maxCount = d.count;
    });

    // 热力图固定显示一年范围，不受统计口径影响
    const now = new Date();
    const startDate = new Date(now.getTime() - 365 * 24 * 3600 * 1000);

    // 生成所有日期
    const allDates = [];
    const current = new Date(startDate);
    while (current <= now) {
      allDates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    // 按周分组（GitHub 风格：列是周，行是星期几）
    const weeks = [];
    let currentWeek = [];

    // 找到第一个日期是星期几（0=周日，1=周一...）
    const firstDate = new Date(allDates[0]);
    const firstDayOfWeek = firstDate.getDay();

    // 在开头填充空格
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push(null);
    }

    allDates.forEach(date => {
      const d = new Date(date);
      const dayOfWeek = d.getDay();

      if (dayOfWeek === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentWeek.push({
        date: date,
        count: dateMap[date] || 0
      });
    });

    if (currentWeek.length > 0) {
      // 填充最后一周的空格
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    // 转置：按行（星期几）渲染
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:4px;align-items:center';

      // 添加星期标签
      const label = document.createElement('div');
      label.style.cssText = 'width:20px;font-size:11px;color:#8b7ba8;text-align:right;flex-shrink:0';
      label.textContent = dayIndex % 2 === 1 ? weekDays[dayIndex] : '';
      row.appendChild(label);

      // 添加该行的所有格子
      weeks.forEach((week, weekIndex) => {
        const cell = document.createElement('div');
        const dayData = week[dayIndex];

        if (dayData === null) {
          cell.style.cssText = 'width:14px;height:14px;border-radius:3px;background:transparent';
        } else {
          const count = dayData.count;
          let opacity = 0.1;
          if (count > 0) {
            // 根据数量计算透明度
            const ratio = count / maxCount;
            if (ratio <= 0.25) opacity = 0.3;
            else if (ratio <= 0.5) opacity = 0.5;
            else if (ratio <= 0.75) opacity = 0.7;
            else opacity = 1;
          }

          cell.style.cssText = 'width:14px;height:14px;border-radius:3px;cursor:pointer;transition:transform 0.15s ease,box-shadow 0.15s ease;background:' +
            (count === 0 ? 'rgba(147,112,219,0.1)' : 'rgba(147,112,219,' + opacity + ')');
          cell.dataset.date = dayData.date;
          cell.dataset.count = count;

          cell.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.3)';
            this.style.boxShadow = '0 2px 8px rgba(147,112,219,0.4)';
            tooltip.textContent = this.dataset.date + ': ' + this.dataset.count + ' 个胶囊';
          });
          cell.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = 'none';
            tooltip.textContent = '';
          });
        }

        row.appendChild(cell);
      });

      container.appendChild(row);
    }

    // 添加月份标签
    const monthRow = document.createElement('div');
    monthRow.style.cssText = 'display:flex;gap:4px;margin-top:8px;padding-left:24px';

    let lastMonth = -1;
    weeks.forEach((week, weekIndex) => {
      const firstValidDay = week.find(d => d !== null);
      if (firstValidDay) {
        const month = new Date(firstValidDay.date).getMonth();
        if (month !== lastMonth) {
          const monthLabel = document.createElement('div');
          const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
          monthLabel.style.cssText = 'font-size:11px;color:#8b7ba8;position:absolute;margin-left:' + (weekIndex * 18) + 'px';
          monthLabel.textContent = monthNames[month];
          monthRow.appendChild(monthLabel);
          lastMonth = month;
        }
      }
    });

    monthRow.style.position = 'relative';
    monthRow.style.height = '20px';
    container.appendChild(monthRow);
  }

  async function loadStats() {
    const days = document.getElementById('days-selector').value;
    const btn = document.getElementById('refresh-btn');

    btn.disabled = true;
    btn.textContent = '🔄 加载中...';

    try {
      // 并行获取：热力图固定365天，其他统计按选择的天数
      const [heatmapRes, statsRes] = await Promise.all([
        fetch('/api/admin/stats?days=365'),
        fetch('/api/admin/stats?days=' + days)
      ]);

      if (!heatmapRes.ok || !statsRes.ok) {
        throw new Error('获取数据失败');
      }

      const heatmapData = await heatmapRes.json();
      const data = await statsRes.json();

      // 更新概览
      document.getElementById('total-count').textContent = data.totalCount.toLocaleString();
      document.getElementById('date-range').textContent = data.dateRange.days + ' 天';

      // 销毁旧图表
      Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
          chart.destroy();
        }
      });

      // 渲染热力图（使用365天数据）
      renderHeatmap(heatmapData.sendDateStats);

      // 发送日期统计（使用选择的天数）
      const sendDateCtx = document.getElementById('sendDateChart').getContext('2d');
      const sendDateData = data.sendDateStats.reverse(); // 正序显示
      charts.sendDate = new Chart(sendDateCtx, {
        type: 'line',
        data: {
          labels: sendDateData.map(d => d.date.slice(5)), // 显示 MM-DD
          datasets: [{
            label: '胶囊数量',
            data: sendDateData.map(d => d.count),
            borderColor: '#9370db',
            backgroundColor: 'rgba(147,112,219,0.15)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#9370db',
            pointBorderColor: '#fff',
            pointBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(107,75,166,0.9)',
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: '#9370db',
              borderWidth: 1,
              callbacks: {
                title: function(context) {
                  return '日期: ' + context[0].label;
                },
                label: function(context) {
                  return '胶囊: ' + context.parsed.y + ' 个';
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(138,103,184,0.1)' },
              ticks: { color: '#8b7ba8' }
            },
            x: {
              grid: { color: 'rgba(138,103,184,0.1)' },
              ticks: { color: '#8b7ba8' }
            }
          }
        }
      });

      // 状态统计
      const statusCtx = document.getElementById('statusChart').getContext('2d');
      charts.status = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: data.statusStats.map(s => statusNames[s.status] || s.status),
          datasets: [{
            data: data.statusStats.map(s => s.count),
            backgroundColor: data.statusStats.map(s => statusColors[s.status] || '#9370db'),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#6b4ba6',
                padding: 15,
                font: { size: 13 }
              }
            },
            tooltip: {
              backgroundColor: 'rgba(107,75,166,0.9)',
              titleColor: '#fff',
              bodyColor: '#fff',
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a,b) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  return label + ': ' + value + ' (' + percentage + '%)';
                }
              }
            }
          }
        }
      });

      // 邮箱统计
      const emailCtx = document.getElementById('emailChart').getContext('2d');
      const topEmails = data.emailStats.slice(0, 10).reverse(); // 显示前10,倒序让大的在上
      charts.email = new Chart(emailCtx, {
        type: 'bar',
        data: {
          labels: topEmails.map(e => e.email.length > 25 ? e.email.slice(0, 22) + '...' : e.email),
          datasets: [{
            label: '胶囊数量',
            data: topEmails.map(e => e.count),
            backgroundColor: 'linear-gradient(135deg,#9370db,#ba55d3)',
            borderColor: '#9370db',
            borderWidth: 1,
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(107,75,166,0.9)',
              titleColor: '#fff',
              bodyColor: '#fff',
              callbacks: {
                title: function(context) {
                  return '邮箱: ' + topEmails[context[0].dataIndex].email;
                },
                label: function(context) {
                  return '胶囊: ' + context.parsed.x + ' 个';
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: 'rgba(138,103,184,0.1)' },
              ticks: { color: '#8b7ba8' }
            },
            y: {
              grid: { color: 'rgba(138,103,184,0.1)' },
              ticks: { color: '#8b7ba8' }
            }
          }
        }
      });

      // IP统计
      const ipCtx = document.getElementById('ipChart').getContext('2d');
      const topIps = data.ipStats.slice(0, 10).reverse();
      charts.ip = new Chart(ipCtx, {
        type: 'bar',
        data: {
          labels: topIps.map(i => i.ip),
          datasets: [{
            label: '胶囊数量',
            data: topIps.map(i => i.count),
            backgroundColor: 'rgba(147,112,219,0.8)',
            borderColor: '#6b4ba6',
            borderWidth: 1,
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(107,75,166,0.9)',
              titleColor: '#fff',
              bodyColor: '#fff',
              callbacks: {
                label: function(context) {
                  return '胶囊: ' + context.parsed.x + ' 个';
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: 'rgba(138,103,184,0.1)' },
              ticks: { color: '#8b7ba8' }
            },
            y: {
              grid: { color: 'rgba(138,103,184,0.1)' },
              ticks: { color: '#8b7ba8' }
            }
          }
        }
      });
    } catch (e) {
      alert('加载统计数据失败: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 刷新';
    }
  }

  // 事件监听
  document.getElementById('days-selector').addEventListener('change', loadStats);
  document.getElementById('refresh-btn').addEventListener('click', loadStats);

  // 初始加载
  loadStats();
})();
</script>
`);
}

// ---------- helpers ----------
function jsonBad(status: number, message: string) {
  return new Response(JSON.stringify({ ok: false, message }), { status, headers: JSON_TYPE });
}
function markdownToHtml(md: string): string {
  if (!md) return '';
  
  // 1. 先转义 HTML（但保留换行符用于后续处理）
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. 处理表格（在列表之前，按块处理）
  html = html.replace(/(\|.+\|\s*\n)+/g, (tableBlock) => {
    const lines = tableBlock.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return tableBlock; // 至少需要标题+分隔符
    
    // 跳过分隔行（第二行，通常是 |---|---|）
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

  // 3. 处理 TODO 列表（在普通列表之前）
  html = html
    .replace(/^- \[x\] (.*)$/gim, '___TODO_DONE___$1___END_TODO___')
    .replace(/^- \[ \] (.*)$/gim, '___TODO_PENDING___$1___END_TODO___');

  // 4. 处理标题
  html = html
    .replace(/^### (.*$)/gim, '<h3 style="color:#6b4ba6;margin:20px 0 10px 0;font-size:18px;font-weight:600">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="color:#6b4ba6;margin:24px 0 12px 0;font-size:20px;font-weight:600">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="color:#6b4ba6;margin:28px 0 14px 0;font-size:24px;font-weight:700">$1</h1>');

  // 5. 处理行内样式
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#6b4ba6">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="font-style:italic">$1</em>')
    .replace(/~~(.+?)~~/g, '<s style="text-decoration:line-through;opacity:0.7">$1</s>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(147,112,219,0.1);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:14px">$1</code>');

  // 6. 处理链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#9370db;text-decoration:underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // 7. 处理分割线
  html = html.replace(/^---+$/gim, '<hr style="border:0;border-top:2px solid rgba(138,103,184,0.2);margin:20px 0"/>');

  // 8. 处理引用
  html = html.replace(/^&gt; (.*)$/gim, '<blockquote style="border-left:4px solid #9370db;padding:12px 16px;margin:12px 0;color:#6b4ba6;background:rgba(147,112,219,0.05);border-radius:8px">$1</blockquote>');

  // 9. 处理普通无序列表
  html = html.replace(/^\- (.*)$/gim, '___LI___$1___END_LI___');

  // 10. 还原 TODO 和列表项
  html = html
    .replace(/___TODO_DONE___(.+?)___END_TODO___/g, '<li style="list-style:none;margin:4px 0;padding-left:0"><span style="color:#10b981;font-size:16px;margin-right:8px">☑</span><s style="opacity:0.6">$1</s></li>')
    .replace(/___TODO_PENDING___(.+?)___END_TODO___/g, '<li style="list-style:none;margin:4px 0;padding-left:0"><span style="color:#9370db;font-size:16px;margin-right:8px">☐</span>$1</li>')
    .replace(/___LI___(.+?)___END_LI___/g, '<li style="margin:4px 0">$1</li>');

  // 11. 包裹连续的 <li> 为 <ul>
  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, (match) => {
    return `<ul style="margin:4px 0;padding-left:24px;line-height:1.8">${match}</ul>`;
  });

  // 12. 处理段落和换行（最后处理，避免破坏块级元素）
  html = html
    .split('\n\n')
    .map(block => {
      // 跳过已经是块级元素的内容
      if (block.trim().match(/^<(table|h[1-6]|ul|blockquote|hr)/)) {
        return block;
      }
      // 普通段落
      return '<p style="margin:12px 0;line-height:1.8">' + block.replace(/\n/g, '<br/>') + '</p>';
    })
    .join('\n');

  // 13. 清理多余空段落
  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');

  return html;
}

function renderEmailTemplate(params: { content: string; site?: string; capsuleId: string; sendAtShanghai: string; createdAtShanghai: string; signer?: string | null; contact?: string | null; }) {

  const { content, site, capsuleId, sendAtShanghai, createdAtShanghai, signer, contact } = params;
  
  // 渲染 Markdown
  const body = markdownToHtml(content);
  
  const extra = (signer || contact) ? `<div style="margin-top:16px;font-size:14px;color:#6b4ba6">
    ${signer ? `<div>落款：${escapeHtml(signer)}</div>` : ``}
    ${contact ? `<div>联系方式：${escapeHtml(contact)}</div>` : ``}
  </div>` : "";
  const btn = (site && site.length) ? `<a href="${site.replace(/"/g,'&quot;')}/status/${capsuleId}" target="_blank" style="display:inline-block;padding:12px 20px;border-radius:12px;background:linear-gradient(135deg,#9370db,#ba55d3);color:#fff;text-decoration:none;font-weight:600;font-size:15px">查看胶囊状态</a>` : "";
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
