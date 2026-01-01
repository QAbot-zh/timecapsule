// ---------- HTML Pages ----------

type Settings = {
  ip_daily_limit: number;
  ip_10min_limit: number;
  min_lead_seconds: number;
  daily_create_limit: number;
};

type CapsulePublic = {
  id: string; status: string; send_at: number;
  sent_at?: number | null; delivered_at?: number | null;
  bounced_at?: number | null; bounce_reason?: string | null;
  now: number;
};

const TZ_OFFSET_SEC = 8 * 3600;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
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

export function settingsOptions(selectedSec: number): string {
  const opts: Array<[number, string]> = [
    [0, '无最小提前量'], [10 * 60, '10 分钟'], [30 * 60, '30 分钟'], [1 * 3600, '1 小时'], [6 * 3600, '6 小时'],
    [12 * 3600, '12 小时'], [24 * 3600, '1 天'], [3 * 24 * 3600, '3 天'], [7 * 24 * 3600, '7 天'], [30 * 24 * 3600, '30 天']
  ];
  return opts.map(([v, label]) => `<option value="${v}" ${v === selectedSec ? 'selected' : ''}>${label}</option>`).join('');
}

export function htmlPage(title: string, body: string): string {
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-size="70" fill="#6b4ba6" transform="translate(0, 5)">✉️</text></svg>`;
  return `<!doctype html><html lang="zh-CN"><head>
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
  }
  #content-preview { font-size: 16px; }
  .fullscreen-preview-overlay {
    position: fixed;top: 0;left: 0;right: 0;bottom: 0;
    background: rgba(107, 75, 166, 0.95);backdrop-filter: blur(10px);
    z-index: 10000;display: none;align-items: center;justify-content: center;padding: 20px;
  }
  .fullscreen-preview-container {
    background: rgba(255, 255, 255, 0.98);color: #2d1b4e;border-radius: 24px;
    border: 2px solid rgba(138, 103, 184, 0.2);box-shadow: 0 20px 60px rgba(107, 75, 166, 0.3);
    max-width: 900px;width: 100%;max-height: 90vh;display: flex;flex-direction: column;
    overflow: hidden;animation: slideIn 0.3s ease-out;
  }
  .fullscreen-preview-header {
    display: flex;justify-content: space-between;align-items: center;
    padding: 20px 24px;border-bottom: 2px solid rgba(138, 103, 184, 0.12);
    background: rgba(147, 112, 219, 0.05);flex-shrink: 0;
  }
  .fullscreen-preview-header h3 {margin: 0;color: #6b4ba6;font-size: 18px;font-weight: 600;}
  .fullscreen-preview-close {
    padding: 8px 16px;font-size: 14px;background: linear-gradient(135deg, #8b7ba8, #9b8bb8);
    border: none;border-radius: 12px;color: white;cursor: pointer;font-weight: 500;transition: all 0.3s ease;
  }
  .fullscreen-preview-close:hover {transform: translateY(-1px);box-shadow: 0 4px 12px rgba(147, 112, 219, 0.3);}
  .fullscreen-preview-content {flex: 1;overflow-y: auto;padding: 32px;line-height: 1.8;font-size: 16px;}
  @keyframes slideIn {from { opacity: 0; transform: scale(0.9); }to { opacity: 1; transform: scale(1); }}
  #content-preview h1, #content-preview h2, #content-preview h3 { color: #6b4ba6; margin-top: 16px; margin-bottom: 8px; }
  #content-preview h1 { font-size: 22px; }
  #content-preview h2 { font-size: 20px; }
  #content-preview h3 { font-size: 18px; }
  #content-preview strong { font-weight: 600; color: #6b4ba6; }
  #content-preview code {background: rgba(147,112,219,0.1);padding: 2px 6px;border-radius: 4px;font-family: monospace;font-size: 14px;}
  #content-preview pre {background: rgba(147,112,219,0.08);padding: 12px;border-radius: 8px;overflow-x: auto;margin: 12px 0;}
  #content-preview pre code {background: none;padding: 0;}
  #content-preview blockquote {border-left: 4px solid #9370db;padding-left: 16px;margin: 12px 0;color: #6b4ba6;background: rgba(147,112,219,0.05);padding: 12px 16px;border-radius: 8px;}
  #content-preview a {color: #9370db;text-decoration: underline;}
  #content-preview ul, #content-preview ol {margin: 12px 0;padding-left: 24px;}
  #content-preview li {margin: 4px 0;}
  #content-preview hr {border: 0;border-top: 2px solid rgba(138,103,184,0.2);margin: 16px 0;}
  #content-preview img {max-width: 100%;border-radius: 8px;margin: 12px 0;}
  #content-preview table {width: 100%;border-collapse: collapse;margin: 12px 0;border: 1px solid rgba(138,103,184,0.2);border-radius: 8px;overflow: hidden;}
  #content-preview th {background: rgba(147,112,219,0.12);color: #6b4ba6;font-weight: 600;padding: 10px 12px;text-align: left;border: 1px solid rgba(138,103,184,0.3);}
  #content-preview td {padding: 8px 12px;border: 1px solid rgba(138,103,184,0.2);}
  #content-preview tbody tr:hover {background: rgba(147,112,219,0.03);}
  #content-preview input[type="checkbox"] {margin-right: 8px;accent-color: #9370db;cursor: default;pointer-events: none;}
  #content-preview input[type="checkbox"]:checked + * {text-decoration: line-through;opacity: 0.6;}
  @media (max-width: 768px) {
    form > div[style*="grid-template-columns"] {grid-template-columns: 1fr !important;}
  }
  .feedback-btn {
    position: fixed;bottom: 24px;right: 24px;width: 48px;height: 48px;border-radius: 50%;
    background: linear-gradient(135deg, #9370db, #ba55d3);color: white;display: flex;align-items: center;
    justify-content: center;text-decoration: none;box-shadow: 0 4px 16px rgba(147, 112, 219, 0.4);
    transition: all 0.3s ease;z-index: 1000;font-size: 22px;
  }
  .feedback-btn:hover {transform: translateY(-3px) scale(1.05);box-shadow: 0 8px 24px rgba(147, 112, 219, 0.5);}
  .feedback-btn:active {transform: translateY(-1px) scale(1.02);}
  .feedback-tooltip {
    position: absolute;right: 56px;background: rgba(45, 27, 78, 0.95);color: white;
    padding: 10px 14px;border-radius: 10px;font-size: 13px;white-space: nowrap;
    opacity: 0;pointer-events: none;transition: opacity 0.2s ease;line-height: 1.5;
  }
  .feedback-btn:hover .feedback-tooltip {opacity: 1;}
  .feedback-tooltip::after {
    content: '';position: absolute;right: -6px;top: 50%;transform: translateY(-50%);
    border: 6px solid transparent;border-left-color: rgba(45, 27, 78, 0.95);
  }
  .feedback-tooltip-title {font-weight: 600;margin-bottom: 4px;font-size: 14px;}
  .feedback-tooltip-desc {opacity: 0.85;font-size: 12px;}
</style></head><body><div class="card">${body}</div>
<a href="https://github.com/QAbot-zh/timecapsule/issues" target="_blank" rel="noopener noreferrer" class="feedback-btn" title="问题反馈 & 功能请求">
  <span class="feedback-tooltip">
    <div class="feedback-tooltip-title">💡 反馈 & 建议</div>
    <div class="feedback-tooltip-desc">问题反馈 · 功能请求 · 想法交流</div>
  </span>
  💬
</a>
</body></html>`;
}

export function indexPage(s: Settings): string {
  const def = defaultFormValueShanghaiPlus(Math.max(s.min_lead_seconds, 10 * 60) + 15 * 60);
  return htmlPage('时间胶囊 - 投递', `
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

<div class="fullscreen-preview-overlay" id="fullscreen-preview-overlay">
  <div class="fullscreen-preview-container">
    <div class="fullscreen-preview-header">
      <h3>📖 全屏预览</h3>
      <button type="button" class="fullscreen-preview-close" id="fullscreen-preview-close">✕ 关闭</button>
    </div>
    <div class="fullscreen-preview-content" id="fullscreen-preview-content"></div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js"></script>

<script>
(function(){
  const CACHE_KEY = 'capsule_draft';
  const CacheManager = {
    save(data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch(e) {} },
    load() { try { const c = localStorage.getItem(CACHE_KEY); return c ? JSON.parse(c) : null; } catch(e) { return null; } },
    clear() { try { localStorage.removeItem(CACHE_KEY); } catch(e) {} }
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

  if (typeof marked !== 'undefined') { marked.setOptions({ breaks: true, gfm: true }); }

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

  function saveFormData() {
    CacheManager.save({
      email: emailEl.value.trim(),
      content: contentEl.value,
      send_at: sendAtEl.value,
      sign: signEl.value.trim(),
      contact: contactEl.value.trim()
    });
  }

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

  let saveTimer = null;
  function debouncedSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveFormData, 500); }

  [emailEl, contentEl, sendAtEl, signEl, contactEl].forEach(el => {
    if (el) el.addEventListener('input', debouncedSave);
  });

  contentEl.addEventListener('input', ()=>{
    const len = contentEl.value.length;
    count.textContent = (len>MAX?MAX:len) + ' / ' + MAX;
    if (len > MAX) contentEl.value = contentEl.value.slice(0, MAX);
    renderMarkdown(contentEl.value);
  });

  restoreFormData();

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

\${new Date().toLocaleDateString('zh-CN')}\`;

      contentEl.value = exampleText;
      const len = exampleText.length;
      count.textContent = (len > MAX ? MAX : len) + ' / ' + MAX;
      renderMarkdown(contentEl.value);
      saveFormData();
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
      const labels = { 30: '1 个月后', 60: '2 个月后', 90: '3 个月后', 180: '6 个月后', 365: '1 年后' };
      showToast('⚡ 已设置投递时间：' + (labels[days] || days + ' 天后'), 'success');
      quickTimeSelect.value = '';
    });
  }

  if (randomTimeBtn && sendAtEl && minLeadSecondsEl) {
    randomTimeBtn.addEventListener('click', () => {
      const minLeadSeconds = parseInt(minLeadSecondsEl.value, 10) || 0;
      const now = Date.now();
      const minTime = now + (minLeadSeconds + 300) * 1000;
      const maxTime = now + 365 * 24 * 3600 * 1000;
      const randomTime = minTime + Math.random() * (maxTime - minTime);
      const shanghaiOffset = 8 * 3600 * 1000;
      const shanghaiTime = new Date(randomTime + shanghaiOffset);
      const formatted = shanghaiTime.toISOString().slice(0, 16);
      sendAtEl.value = formatted;
      debouncedSave();
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

  const fullscreenPreviewBtn = document.getElementById('fullscreen-preview-btn');
  const fullscreenOverlay = document.getElementById('fullscreen-preview-overlay');
  const fullscreenContent = document.getElementById('fullscreen-preview-content');
  const fullscreenClose = document.getElementById('fullscreen-preview-close');

  if (fullscreenPreviewBtn && fullscreenOverlay && fullscreenContent && fullscreenClose) {
    fullscreenPreviewBtn.addEventListener('click', () => {
      const content = contentEl.value;
      if (!content.trim()) { showToast('❌ 请先输入一些内容再预览', 'error'); return; }
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
      fullscreenOverlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    });

    function closeFullscreenPreview() {
      fullscreenOverlay.style.display = 'none';
      document.body.style.overflow = '';
    }
    fullscreenClose.addEventListener('click', closeFullscreenPreview);
    fullscreenOverlay.addEventListener('click', (e) => { if (e.target === fullscreenOverlay) closeFullscreenPreview(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fullscreenOverlay.style.display === 'flex') closeFullscreenPreview(); });
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
    const close = () => { wrap.style.display = 'none'; wrap.innerHTML = ''; };
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

    if (!email.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)) { showToast('❌ 邮箱格式不正确', 'error'); emailEl.focus(); return; }
    if (!content) { showToast('❌ 内容不能为空', 'error'); contentEl.focus(); return; }

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
      CacheManager.clear();
      showToast('✅ 投递成功！正在跳转...', 'success');
      setTimeout(() => { location.href = data.status_url || ('/thanks?id=' + data.id); }, 1000);
    } catch(err){
      showToast('❌ 网络异常，请稍后再试', 'error');
      btn.disabled = false;
      btn.textContent = '🚀 投递胶囊';
    }
  });
})();
</script>

<p class="muted" style="margin-top:20px;text-align:center">投递时间到点后系统自动发信，请保存好胶囊链接 🔗</p>

<div style="margin-top:40px;padding-top:24px;border-top:2px solid rgba(138,103,184,0.15);text-align:center">
  <p style="margin:0;font-size:15px;color:#8b7ba8;font-style:italic">© ${new Date().getUTCFullYear()} 时光会替你守护这份心意 💜
    <a href="https://github.com/QAbot-zh/timecapsule" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-left:10px;text-decoration:none;vertical-align:middle;font-size:20px;font-style:normal;transition:transform 0.3s">✉️</a>
  </p>
</div>
`);
}

export function thanksPage(id?: string): string {
  const idHtml = id ? `<p style="font-size:16px">你的胶囊 ID：<code style="background:rgba(147,112,219,0.1);padding:4px 8px;border-radius:6px;color:#6b4ba6">${id}</code></p><p><a href="/status/${id}" style="color:#9370db;text-decoration:none;font-weight:500">📊 查看投递状态</a></p>` : '';
  return htmlPage('投递成功', `
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

export function renderNotFoundPage(): string {
  return htmlPage('未找到 - 时光胶囊', `
<style>
  .empty-icon { font-size: 64px; margin-bottom: 20px; opacity: 0.8; text-align: center; }
  .empty-title { font-size: 26px; font-weight: 600; color: #a67c6d; margin: 0 0 12px; text-align: center; }
  .empty-desc { font-size: 15px; color: #6b5d4d; line-height: 1.8; margin: 0 0 32px; text-align: center; }
  .back-btn { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #a67c6d 0%, #8b6b5d 100%); color: white; text-decoration: none; border-radius: 30px; font-size: 15px; }
</style>
<div style="text-align:center;padding:40px 0">
  <div class="empty-icon">📭</div>
  <h1 class="empty-title">无迹可寻</h1>
  <p class="empty-desc">
    这枚时光胶囊不存在，或已随时光消逝。<br>
    请确认胶囊 ID/链接是否正确。
  </p>
  <a href="/" class="back-btn">返回首页</a>
</div>`);
}

export function renderStatusPage(c: CapsulePublic, contactEmail?: string): string {
  const now = c.now, left = Math.max(0, c.send_at - now);
  const shSend = fmtShanghai(c.send_at);

  const statusConfig: Record<string, { icon: string; title: string; desc: string; accent: string }> = {
    pending: { icon: '⏳', title: left > 0 ? '封印中' : '即将启封', desc: left > 0 ? `这枚时光胶囊将于 ${shSend} 启封寄出` : '封印时刻已至，静候系统唤醒', accent: '#8b7355' },
    sent: { icon: '📜', title: '已启封', desc: `信笺已于 ${c.sent_at ? fmtShanghai(c.sent_at) : shSend} 飞向远方，等待抵达`, accent: '#6b8e7d' },
    delivered: { icon: '✉️', title: '已送达', desc: `信笺已于 ${c.delivered_at ? fmtShanghai(c.delivered_at) : ''} 安然抵达`, accent: '#5d7a5d' },
    bounced: { icon: '📭', title: '未能送达', desc: c.bounce_reason ? `原因：${escapeHtml(c.bounce_reason)}` : '信笺被退回，未能抵达目的地', accent: '#a67c6d' },
    failed: { icon: '⚠️', title: '发送受阻', desc: '系统遇到了一些问题，请稍后再试', accent: '#a67c6d' }
  };

  const cfg = statusConfig[c.status] || { icon: '📦', title: c.status, desc: '', accent: '#8b7355' };

  return htmlPage(`时光胶囊 - ${c.id}`, `
<style>
  .status-card { text-align: center; padding: 40px 20px; }
  .status-icon { font-size: 64px; margin-bottom: 16px; }
  .status-title { font-size: 28px; font-weight: 600; color: ${cfg.accent}; margin: 0 0 8px; }
  .status-desc { font-size: 15px; color: #6b5d4d; margin: 0 0 32px; }
  .countdown-section { margin: 36px 0; padding: 32px 20px; background: rgba(147,112,219,0.08); border-radius: 16px; }
  .countdown-label { text-align: center; font-size: 13px; color: #8b7ba8; letter-spacing: 3px; margin-bottom: 20px; }
  .countdown-grid { display: flex; justify-content: center; gap: 12px; }
  .countdown-item { display: flex; flex-direction: column; align-items: center; min-width: 72px; }
  .countdown-value { font-size: 42px; font-weight: 600; color: #2d1b4e; line-height: 1; }
  .countdown-unit { font-size: 12px; color: #8b7ba8; margin-top: 6px; }
  .countdown-separator { font-size: 32px; color: #9370db; align-self: flex-start; margin-top: 4px; opacity: 0.6; }
  .capsule-id { text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px dashed rgba(138,103,184,0.2); }
  .capsule-id-label { font-size: 11px; color: #8b7ba8; letter-spacing: 2px; }
  .capsule-id-value { font-family: monospace; font-size: 13px; color: #6b4ba6; background: rgba(147,112,219,0.1); padding: 6px 14px; border-radius: 6px; margin-top: 6px; display: inline-block; }
</style>

<div class="status-card">
  <div class="status-icon">${cfg.icon}</div>
  <h1 class="status-title">${cfg.title}</h1>
  <p class="status-desc">${cfg.desc}</p>

  ${c.status === 'pending' ? `
  <div class="countdown-section">
    <div class="countdown-label">距 离 启 封</div>
    <div id="countdown" class="countdown-grid">
      <div class="countdown-item"><span class="countdown-value" id="cd-days">--</span><span class="countdown-unit">天</span></div>
      <span class="countdown-separator">:</span>
      <div class="countdown-item"><span class="countdown-value" id="cd-hours">--</span><span class="countdown-unit">时</span></div>
      <span class="countdown-separator">:</span>
      <div class="countdown-item"><span class="countdown-value" id="cd-mins">--</span><span class="countdown-unit">分</span></div>
      <span class="countdown-separator">:</span>
      <div class="countdown-item"><span class="countdown-value" id="cd-secs">--</span><span class="countdown-unit">秒</span></div>
    </div>
  </div>
  ` : ''}

  <div class="info-box">
    <p style="margin:0"><strong>💡 温馨提示</strong><br>请妥善保存此页面链接，以便随时查看胶囊投递状态。</p>
  </div>

  ${(contactEmail && contactEmail.trim()) ? `
  <div class="info-box" style="margin-top:16px;border-left-color:#a67c6d">
    <p style="margin:0"><strong>📮 撤销说明</strong><br>如需撤销这枚胶囊，请在投递前发送邮件至 <a href="mailto:${escapeHtml(contactEmail)}" style="color:#9370db">${escapeHtml(contactEmail)}</a>，并注明胶囊 ID。</p>
  </div>
  ` : ''}

  <div class="capsule-id">
    <div class="capsule-id-label">CAPSULE ID</div>
    <div class="capsule-id-value">${c.id}</div>
  </div>

  <p style="margin-top:24px"><a href="/" style="color:#9370db;text-decoration:none;font-weight:500">← 返回首页</a></p>
</div>

<script>
(function(){
  var sendAt = ${c.send_at};
  var status = ${JSON.stringify(c.status)};
  function pad(n) { return n < 10 ? '0' + n : n; }
  function tick() {
    if (status !== 'pending') return;
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
      container.innerHTML = '<div style="text-align:center;font-size:18px;color:#6b4ba6;padding:20px">✨ 封印时刻已至，静候启封 ✨</div>';
    }
  }
  tick();
  setInterval(tick, 1000);
  setInterval(function(){ location.reload(); }, 30000);
})();
</script>`);
}

export function adminPage(authed: boolean, results: any[] | null, s: Settings, statusFilter = '', searchEmail = '', searchId = ''): string {
  if (!authed) {
    return htmlPage('管理登录', `
<h1>🔐 管理登录</h1>
<form method="post" action="/admin/login">
  <label>管理密码</label>
  <input type="password" name="password" required autocomplete="off" />
  <div style="margin-top:16px"><button type="submit">登录</button></div>
</form>`);
  }

  const rows = (results || []).map(r => {
    const sendAt = fmtShanghai(r.send_at as number);
    const createdAt = fmtShanghai(r.created_at as number);
    const signer = (r.signer ?? '').toString().trim();
    const contact = (r.contact ?? '').toString().trim();
    const ip = (r.ip_addr ?? '').toString().trim();
    const email = (r.email ?? '').toString().trim();

    const statusMap: Record<string, string> = {
      pending: '⏳ 待发送', sent: '📤 已发送', delivered: '✅ 已投递', bounced: '❌ 被拒收', failed: '⚠️ 失败',
    };
    const statusZh = statusMap[String(r.status)] || String(r.status);
    const err = r.last_error ? `<div class="muted" style="font-size:13px;margin-top:4px">错误：${escapeHtml(r.last_error)}</div>` : '';

    return `<tr>
      <td class="td-id" title="${r.id}">${r.id}</td>
      <td class="td-clip"><span class="expand" data-full="${escapeHtml(email)}">展开</span></td>
      <td class="td-clip"><span class="expand" data-full="${escapeHtml(String(r.content))}">展开</span></td>
      ${signer ? `<td class="td-clip"><span class="expand" data-full="${escapeHtml(signer)}">展开</span></td>` : '<td class="muted">—</td>'}
      ${contact ? `<td class="td-clip"><span class="expand" data-full="${escapeHtml(contact)}">展开</span></td>` : '<td class="muted">—</td>'}
      <td class="td-ip">${ip || '—'}</td>
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
  }).join('');

  const statusOptions = ['', 'pending', 'sent', 'delivered', 'bounced', 'failed'].map(st => {
    const labels: Record<string, string> = { '': '全部状态', 'pending': '⏳ 待发送', 'sent': '📤 已发送', 'delivered': '✅ 已投递', 'bounced': '❌ 被拒收', 'failed': '⚠️ 失败' };
    return `<option value="${st}" ${st === statusFilter ? 'selected' : ''}>${labels[st]}</option>`;
  }).join('');

  return htmlPage('管理面板', `
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
        <button type="submit" style="padding:10px 16px;font-size:14px;flex:1">🔍 筛选</button>
        <a href="/admin" style="text-decoration:none;flex:1"><button type="button" style="padding:10px 16px;font-size:14px;width:100%;background:linear-gradient(135deg,#8b7ba8,#9b8bb8)">🔄 重置</button></a>
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
      const full = t.getAttribute('data-full') || t.textContent || '';
      const ov = document.getElementById('ov');
      const txt = document.getElementById('ov-text');
      txt.textContent = full;
      ov.style.display = 'flex';
    }
  });

  async function fetchData() {
    const params = new URLSearchParams(window.location.search);
    const res = await fetch('/api/admin/capsules?' + params.toString());
    if (!res.ok) { alert('获取数据失败'); return null; }
    return await res.json();
  }

  window.exportCSV = async function() {
    const data = await fetchData();
    if (!data) return;
    const headers = ['ID', '邮箱', '内容', '落款', '联系方式', 'IP', '投递时间', '创建时间', '状态', '错误'];
    const rows = data.map(r => [
      r.id, r.email, (r.content || '').replace(/"/g, '""'), r.signer || '', r.contact || '',
      r.ip_addr || '', r.send_at_shanghai, r.created_at_shanghai, r.status, (r.last_error || '').replace(/"/g, '""')
    ]);
    const csv = [headers.map(h => '"' + h + '"').join(','), ...rows.map(row => row.map(cell => '"' + cell + '"').join(','))].join('\\n');
    const blob = new Blob(['\\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
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

export function adminStatsPage(): string {
  return htmlPage('统计面板', `
<div class="admin-header">
  <h1>📊 统计面板</h1>
  <a href="/admin"><button class="logout-btn">← 返回管理</button></a>
</div>

<div class="section">
  <div class="settings-header" style="flex-wrap:wrap;gap:16px">
    <h2>数据概览</h2>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="display:flex;gap:8px;align-items:center">
        <label style="margin:0;font-size:14px;color:#8b7ba8">时间范围</label>
        <select id="days-selector" style="padding:8px 12px;border-radius:12px;border:2px solid rgba(138,103,184,0.25);font-size:14px;background:rgba(255,255,255,0.9)">
          <option value="7">最近 7 天</option>
          <option value="30" selected>最近 30 天</option>
          <option value="90">最近 90 天</option>
          <option value="365">最近 365 天</option>
        </select>
      </div>
      <button id="refresh-btn" style="padding:8px 16px;font-size:14px">🔄 刷新</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:32px">
    <div style="background:linear-gradient(135deg,#9370db,#ba55d3);color:#fff;padding:24px;border-radius:16px;text-align:center">
      <div style="font-size:28px;font-weight:700;margin-bottom:4px" id="total-count">--</div>
      <div style="font-size:14px;opacity:0.9">总胶囊数</div>
    </div>
    <div style="background:linear-gradient(135deg,#6b4ba6,#8b6bb8);color:#fff;padding:24px;border-radius:16px;text-align:center">
      <div style="font-size:28px;font-weight:700;margin-bottom:4px" id="date-range">--</div>
      <div style="font-size:14px;opacity:0.9">统计范围</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
    <div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;border:1px solid rgba(138,103,184,0.15)">
      <h3 style="margin:0 0 16px 0;color:#6b4ba6;font-size:16px">📈 按接收日期统计</h3>
      <div style="height:300px"><canvas id="sendDateChart"></canvas></div>
    </div>
    <div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;border:1px solid rgba(138,103,184,0.15)">
      <h3 style="margin:0 0 16px 0;color:#6b4ba6;font-size:16px">📊 状态分布</h3>
      <div style="height:300px"><canvas id="statusChart"></canvas></div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
    <div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;border:1px solid rgba(138,103,184,0.15)">
      <h3 style="margin:0 0 16px 0;color:#6b4ba6;font-size:16px">📧 按邮箱统计 (TOP 10)</h3>
      <div style="height:300px"><canvas id="emailChart"></canvas></div>
    </div>
    <div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;border:1px solid rgba(138,103,184,0.15)">
      <h3 style="margin:0 0 16px 0;color:#6b4ba6;font-size:16px">🌐 按IP统计 (TOP 10)</h3>
      <div style="height:300px"><canvas id="ipChart"></canvas></div>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
(function() {
  const statusColors = { pending: '#9370db', sent: '#6b4ba6', delivered: '#10b981', bounced: '#ef4444', failed: '#f59e0b' };
  const statusNames = { pending: '⏳ 待发送', sent: '📤 已发送', delivered: '✅ 已投递', bounced: '❌ 拒收', failed: '⚠️ 失败' };
  let charts = {};

  async function loadStats() {
    const days = document.getElementById('days-selector').value;
    const btn = document.getElementById('refresh-btn');
    btn.disabled = true;
    btn.textContent = '🔄 加载中...';

    try {
      const res = await fetch('/api/admin/stats?days=' + days);
      if (!res.ok) throw new Error('获取数据失败');
      const data = await res.json();

      document.getElementById('total-count').textContent = data.totalCount.toLocaleString();
      document.getElementById('date-range').textContent = data.dateRange.days + ' 天';

      Object.values(charts).forEach(chart => { if (chart && typeof chart.destroy === 'function') chart.destroy(); });

      const sendDateCtx = document.getElementById('sendDateChart').getContext('2d');
      const sendDateData = data.sendDateStats.reverse();
      charts.sendDate = new Chart(sendDateCtx, {
        type: 'line',
        data: {
          labels: sendDateData.map(d => d.date.slice(5)),
          datasets: [{ label: '胶囊数量', data: sendDateData.map(d => d.count), borderColor: '#9370db', backgroundColor: 'rgba(147,112,219,0.15)', borderWidth: 3, fill: true, tension: 0.4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });

      const statusCtx = document.getElementById('statusChart').getContext('2d');
      charts.status = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: data.statusStats.map(s => statusNames[s.status] || s.status),
          datasets: [{ data: data.statusStats.map(s => s.count), backgroundColor: data.statusStats.map(s => statusColors[s.status] || '#9370db'), borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });

      const emailCtx = document.getElementById('emailChart').getContext('2d');
      const topEmails = data.emailStats.slice(0, 10).reverse();
      charts.email = new Chart(emailCtx, {
        type: 'bar',
        data: {
          labels: topEmails.map(e => e.email.length > 25 ? e.email.slice(0, 22) + '...' : e.email),
          datasets: [{ label: '胶囊数量', data: topEmails.map(e => e.count), backgroundColor: 'rgba(147,112,219,0.8)', borderRadius: 6 }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
      });

      const ipCtx = document.getElementById('ipChart').getContext('2d');
      const topIps = data.ipStats.slice(0, 10).reverse();
      charts.ip = new Chart(ipCtx, {
        type: 'bar',
        data: {
          labels: topIps.map(i => i.ip),
          datasets: [{ label: '胶囊数量', data: topIps.map(i => i.count), backgroundColor: 'rgba(147,112,219,0.8)', borderRadius: 6 }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
      });
    } catch (e) {
      alert('加载统计数据失败: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 刷新';
    }
  }

  document.getElementById('days-selector').addEventListener('change', loadStats);
  document.getElementById('refresh-btn').addEventListener('click', loadStats);
  loadStats();
})();
</script>
`);
}
