(function(){
"use strict";

/* =========================================================
   GLOBAL ERROR SURFACING
   Any uncaught JS error or rejected promise becomes a visible
   on-screen toast, so problems don't fail silently.
   ========================================================= */
window.addEventListener('error', function(e){
  try{
    console.error('[CRM uncaught error]', e.message, e.filename, e.lineno, e.colno, e.error);
    showFatalToast('Erro de script: ' + e.message + ' (linha ' + e.lineno + ')');
  }catch(_){}
});
window.addEventListener('unhandledrejection', function(e){
  try{
    var reason = e.reason;
    var msg = (reason && (reason.message || reason.code)) || String(reason);
    console.error('[CRM unhandled promise rejection]', reason);
    showFatalToast('Erro assíncrono: ' + msg);
  }catch(_){}
});
function showFatalToast(msg){
  var stack = document.getElementById('toastStack');
  if(!stack){ alert(msg); return; }
  var el = document.createElement('div');
  el.className = 'toast';
  el.style.background = '#9C2B2B';
  el.textContent = '⚠️ ' + msg;
  stack.appendChild(el);
  setTimeout(function(){
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(function(){ el.remove(); }, 260);
  }, 9000);
}

/* =========================================================
   CONSTANTS
   ========================================================= */
var STAGES = [
  { key:'novo_lead',         label:'Novo Lead',            emoji:'🆕', color:'var(--col-novo)' },
  { key:'em_atendimento',    label:'Em Atendimento',       emoji:'💬', color:'var(--col-atend)' },
  { key:'aguardando_cliente',label:'Aguardando Cliente',   emoji:'⏳', color:'var(--col-aguard)' },
  { key:'fechado',           label:'Fechado',              emoji:'✅', color:'var(--col-fechado)' },
  { key:'entregue',          label:'Cliente já Entregue',  emoji:'📬', color:'var(--col-entregue)' },
  { key:'pequeno_repassado', label:'Pequeno — Repassado',  emoji:'📦', color:'var(--col-repasse)' }
];
var STAGE_MAP = {};
STAGES.forEach(function(s){ STAGE_MAP[s.key] = s; });

var TAG_OPTIONS = [
  { id:'CATALOGO_ENVIADO',   label:'🏷️ Catálogo enviado' },
  { id:'AGUARDANDO_LOGO',    label:'🏷️ Aguardando logo' },
  { id:'ORCAMENTO_ENVIADO',  label:'🏷️ Orçamento enviado' },
  { id:'BORDADO',            label:'🏷️ Bordado' },
  { id:'ESTAMPA',            label:'🏷️ Estampa' },
  { id:'PRONTA_ENTREGA',     label:'🏷️ Pronta entrega' },
  { id:'PRODUCAO',           label:'🏷️ Produção' },
  { id:'FAIXA_6_20',         label:'🏷️ 6–20 peças' },
  { id:'FAIXA_20MAIS',       label:'🏷️ 20+ peças' },
  { id:'URGENTE',            label:'🏷️ Urgente' }
];
var TAG_LABEL = {};
TAG_OPTIONS.forEach(function(t){ TAG_LABEL[t.id] = t.label; });

var RESPONSIBLE_OPTIONS = [
  { id:'samuel',   name:'Samuel',   color:'var(--resp-samuel)',   bg:'var(--resp-samuel-bg)' },
  { id:'danilo',   name:'Danilo',   color:'var(--resp-danilo)',   bg:'var(--resp-danilo-bg)' },
  { id:'emanuele', name:'Emanuele', color:'var(--resp-emanuele)', bg:'var(--resp-emanuele-bg)' }
];
var RESPONSIBLE_MAP = {};
RESPONSIBLE_OPTIONS.forEach(function(r){ RESPONSIBLE_MAP[r.id] = r; });

// Backward-compatible lookup: matches by id, or by a previously free-typed name.
function responsibleInfo(value){
  if(!value) return null;
  if(RESPONSIBLE_MAP[value]) return RESPONSIBLE_MAP[value];
  var lower = String(value).toLowerCase().trim();
  var found = RESPONSIBLE_OPTIONS.filter(function(r){ return r.name.toLowerCase()===lower; })[0];
  if(found) return found;
  return { id:value, name:value, color:'var(--muted)', bg:'var(--paper-sunken)' };
}
function responsibleToggleHtml(inputId, currentValue){
  var current = currentValue || '';
  var opts = RESPONSIBLE_OPTIONS.map(function(r){
    var active = current===r.id;
    return '<button type="button" class="resp-toggle'+(active?' active':'')+'" data-resp-id="'+r.id+'" '+
      'style="'+(active?('--resp-color:'+r.color+';--resp-bg:'+r.bg+';'):'')+'">'+
      '<span class="resp-dot" style="background:'+r.color+'"></span>'+r.name+'</button>';
  }).join('');
  opts += '<button type="button" class="resp-toggle clear'+(current===''?' active':'')+'" data-resp-id="">Ninguém / limpar</button>';
  return '<div class="resp-toggle-grid" id="'+inputId+'" data-selected="'+escapeHtml(current)+'">'+opts+'</div>';
}
function wireResponsibleToggle(containerId){
  var container = document.getElementById(containerId);
  if(!container) return;
  container.addEventListener('click', function(e){
    var btn = e.target.closest('[data-resp-id]');
    if(!btn) return;
    var id = btn.getAttribute('data-resp-id');
    container.setAttribute('data-selected', id);
    Array.prototype.forEach.call(container.querySelectorAll('.resp-toggle'), function(b){
      var bId = b.getAttribute('data-resp-id');
      var active = bId===id;
      b.classList.toggle('active', active);
      if(active && bId){
        var info = RESPONSIBLE_MAP[bId];
        b.style.setProperty('--resp-color', info.color);
        b.style.setProperty('--resp-bg', info.bg);
      } else {
        b.style.removeProperty('--resp-color');
        b.style.removeProperty('--resp-bg');
      }
    });
  });
}
function getResponsibleToggleValue(containerId){
  var container = document.getElementById(containerId);
  return container ? (container.getAttribute('data-selected') || '') : '';
}
function responsibleBadgeHtml(value){
  var info = responsibleInfo(value);
  if(!info) return '';
  return '<span class="resp-badge" style="color:'+info.color+'"><span class="resp-dot" style="background:'+info.color+'"></span>'+escapeHtml(info.name)+'</span>';
}

// ---- Avatar (iniciais coloridas) ----
// Não usamos foto real do WhatsApp: a API oficial do WhatsApp Business não
// expõe foto de perfil do contato (bloqueado por política de privacidade da
// Meta), e não usamos scraping. Em vez disso geramos um avatar com as
// iniciais do nome do cliente, com uma cor determinística (sempre a mesma
// cor para o mesmo nome), para identificação visual rápida no card.
var AVATAR_PALETTE = [
  '#2563eb','#7c3aed','#db2777','#dc2626','#ea580c',
  '#d97706','#65a30d','#16a34a','#0d9488','#0891b2',
  '#4338ca','#9333ea','#c026d3','#e11d48','#0369a1'
];
function avatarInitials(name){
  var n = (name || '').trim();
  if(!n) return '?';
  var parts = n.split(/\s+/).filter(Boolean);
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}
function avatarColorForName(name){
  var n = (name || '').trim();
  var hash = 0;
  for(var i=0;i<n.length;i++){ hash = (hash*31 + n.charCodeAt(i)) >>> 0; }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
function avatarHtml(lead, size){
  size = size || 28;
  var initials = avatarInitials(lead && lead.name);
  var color = avatarColorForName(lead && lead.name);
  return '<span class="lead-avatar" style="width:'+size+'px;height:'+size+'px;line-height:'+size+'px;font-size:'+Math.round(size*0.4)+'px;background:'+color+'">'+escapeHtml(initials)+'</span>';
}

var DEFAULT_SETTINGS = {
  repassThreshold: 5,
  repassContact: '',
  followUpWindows: { t1:24, t2:48, t3:72, t4:168 }
};

var LOCAL_LEADS_KEY = 'casualcrm_leads_v1';
var LOCAL_SETTINGS_KEY = 'casualcrm_settings_v1';

// Banco real (Supabase). Chave publicável — segura para uso no navegador
// (protegida por Row Level Security no lado do banco).
var SUPABASE_URL = 'https://dqxuoqfwwntpxvhfhmyy.supabase.co';
var SUPABASE_KEY = 'sb_publishable_9zkNNA325auwdbf6etUsdQ_aQ0sGyGC';
// As tabelas do CRM ficam no schema "crm" (nao no "public").
var SUPABASE_SCHEMA = 'crm';

/* =========================================================
   AUTENTICAÇÃO — login por código enviado por e-mail
   (Supabase Auth). Só e-mails já cadastrados como usuário no
   projeto recebem código (create_user:false), então dá pra
   controlar quem acessa direto pelo painel do Supabase.
   ========================================================= */
var AUTH_STORAGE_KEY = 'casualcrm_session_v1';
var currentSession = null;

function loadStoredSession(){
  try{
    var raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function storeSession(session){
  try{ localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session)); }catch(e){}
}
function clearStoredSession(){
  try{ localStorage.removeItem(AUTH_STORAGE_KEY); }catch(e){}
}
function sessionIsValid(s){
  return !!(s && s.access_token && s.expires_at && s.expires_at > Date.now() + 30000);
}

async function authFetch(path, body){
  var res = await fetch(SUPABASE_URL + '/auth/v1/' + path, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var data = null;
  try{ data = await res.json(); }catch(e){}
  if(!res.ok){
    var msg = (data && (data.error_description || data.msg || data.error)) || ('Erro ' + res.status);
    var err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function requestLoginCode(email){
  return authFetch('otp', { email: email, create_user: false });
}

async function verifyLoginCode(email, token){
  var data = await authFetch('verify', { email: email, token: token, type: 'email' });
  var session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
    email: (data.user && data.user.email) || email
  };
  currentSession = session;
  storeSession(session);
  return session;
}

async function refreshSession(){
  if(!currentSession || !currentSession.refresh_token) return null;
  try{
    var data = await authFetch('token?grant_type=refresh_token', { refresh_token: currentSession.refresh_token });
    var session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      email: currentSession.email
    };
    currentSession = session;
    storeSession(session);
    return session;
  }catch(e){
    currentSession = null;
    clearStoredSession();
    return null;
  }
}

async function ensureSession(){
  if(sessionIsValid(currentSession)) return currentSession;
  return await refreshSession();
}

function signOut(){
  currentSession = null;
  clearStoredSession();
  location.reload();
}

/* =========================================================
   STATE
   ========================================================= */
var dbAvailable = true;
var leadsCache = {};        // id -> lead object
var settingsCache = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
var pollTimer = null;
var renderQueued = false;
var settingsLoaded = false;
var leadsLoaded = false;
var connectionStatus = 'connecting'; // 'connecting' | 'connected' | 'local' | 'read_error'
var lastWriteError = null; // { message, code, at } | null

var state = {
  search:'',
  dateFilter:null,       // 'hoje' | 'ontem' | 'd7' | 'd30' | null
  statusFilters:new Set() // subset of filter keys
};

var draggingId = null;
var pendingStageChange = null; // {id, targetStage}

/* =========================================================
   UTIL
   ========================================================= */
function uid(){
  return 'lead_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9);
}
function nowIso(){ return new Date().toISOString(); }
function escapeHtml(str){
  if(str===undefined || str===null) return '';
  return String(str).replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}
function onlyDigits(str){ return (str||'').replace(/\D/g,''); }
function normalizePhoneBR(phone){
  var d = onlyDigits(phone);
  if(!d) return '';
  // Drop an accidental trunk "0" some people dial before the area code
  // (e.g. "0 77 99999-9999"), so it doesn't get mistaken for part of the number.
  if(d.charAt(0)==='0' && (d.length===11 || d.length===12)) d = d.slice(1);
  // No country code typed (10 = DDD + 8-digit landline, 11 = DDD + 9-digit mobile) → assume Brazil.
  if(d.length===10 || d.length===11) d = '55' + d;
  return d;
}
function waLink(phone){
  var d = normalizePhoneBR(phone);
  if(!d) return '#';
  // api.whatsapp.com is WhatsApp's own click-to-chat endpoint — this skips
  // the wa.me redirect hop and, per WhatsApp's own client behavior, opens
  // the installed app directly on phones/tablets, falling back to
  // WhatsApp Web only when no app is available to handle it.
  return 'https://api.whatsapp.com/send?phone=' + d;
}
// NOTE: a whatsapp:// custom-protocol link was tried here to launch WhatsApp
// Desktop directly, but this sandboxed preview environment blocks all
// custom URI schemes for security ("Este conteúdo está bloqueado"). That
// path isn't available here — https://api.whatsapp.com/... above is the
// most direct option this environment allows.

// IMPORTANT: any JS-driven window.open()/location control on a WhatsApp
// link triggers WhatsApp's Cross-Origin-Opener-Policy protection and blocks
// the page (ERR_BLOCKED_BY_RESPONSE) inside this sandboxed preview. A plain
// native <a target="_blank" rel="noopener"> click — with NO JavaScript in
// the middle — is the only method that has tested reliably. Do not
// reintroduce a JS click handler for this link.
function formatBRL(v){
  var n = Number(v)||0;
  return n.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
function formatDateShort(iso){
  if(!iso) return '—';
  var d = new Date(iso);
  if(isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}
function formatDateTimeShort(iso){
  if(!iso) return '—';
  var d = new Date(iso);
  if(isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}
function hoursSince(iso){
  if(!iso) return Infinity;
  var d = new Date(iso).getTime();
  if(isNaN(d)) return Infinity;
  return (Date.now() - d) / 36e5;
}
function formatRelative(iso){
  if(!iso) return '—';
  var h = hoursSince(iso);
  if(h === Infinity) return '—';
  var mins = Math.round(h*60);
  if(mins < 1) return 'agora mesmo';
  if(mins < 60) return 'há ' + mins + ' min';
  var hrs = Math.round(h);
  if(hrs < 24) return 'há ' + hrs + (hrs===1?' hora':' horas');
  var days = Math.floor(h/24);
  if(days < 30) return 'há ' + days + (days===1?' dia':' dias');
  var months = Math.floor(days/30);
  return 'há ' + months + (months===1?' mês':' meses');
}
function isSameLocalDay(iso, refDate){
  if(!iso) return false;
  var d = new Date(iso);
  if(isNaN(d.getTime())) return false;
  return d.getFullYear()===refDate.getFullYear() && d.getMonth()===refDate.getMonth() && d.getDate()===refDate.getDate();
}
function isToday(iso){ return isSameLocalDay(iso, new Date()); }
function isYesterday(iso){
  var y = new Date(); y.setDate(y.getDate()-1);
  return isSameLocalDay(iso, y);
}
function withinDays(iso, days){
  if(!iso) return false;
  var h = hoursSince(iso);
  return h <= days*24;
}
function toast(msg, durationMs){
  var stack = document.getElementById('toastStack');
  var el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(function(){
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(function(){ el.remove(); }, 260);
  }, durationMs || 2400);
}

/* =========================================================
   STORE INIT (Supabase, com fallback local se offline)
   ========================================================= */
function loadLocalLeads(){
  try{
    var raw = localStorage.getItem(LOCAL_LEADS_KEY);
    leadsCache = raw ? JSON.parse(raw) : {};
  }catch(e){ leadsCache = {}; }
}
function saveLocalLeads(){
  try{ localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(leadsCache)); }catch(e){}
}
function loadLocalSettings(){
  try{
    var raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    settingsCache = raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }catch(e){ settingsCache = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
}
function saveLocalSettings(){
  try{ localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settingsCache)); }catch(e){}
}

function scheduleRender(){
  if(renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(function(){
    renderQueued = false;
    if(leadsLoaded && settingsLoaded){
      renderCounters();
      renderFilters();
      renderBoard();
      updateSyncPill();
    }
  });
}

/* ---- Mapeamento camelCase (app) <-> snake_case (Postgres) ---- */
function toDbLead(l){
  return {
    id: l.id,
    name: l.name || '',
    phone: l.phone || '',
    origin: l.origin || '',
    stage: l.stage,
    responsible: l.responsible || '',
    tags: l.tags || [],
    quantity: (l.quantity===undefined || l.quantity===null || l.quantity==='') ? null : Number(l.quantity),
    size_grid: l.sizeGrid || '',
    product: l.product || '',
    fabric: l.fabric || '',
    color: l.color || '',
    customization: l.customization || '',
    has_logo: l.hasLogo || '',
    deadline: l.desiredDeadline || null,
    created_at: l.createdAt || nowIso(),
    stage_entered_at: l.stageEnteredAt || nowIso(),
    last_message_at: l.lastMessageAt || null,
    wait_reason: l.waitingReason || '',
    next_follow_up_at: l.nextFollowUpAt || null,
    notes: l.notes || '',
    closed: l.closed || null,
    repass: l.repass || null,
    delivery: l.delivery || null,
    history: l.history || [],
    photos: l.photos || [],
    updated_at: nowIso()
  };
}
function fromDbLead(r){
  return {
    id: r.id,
    name: r.name || '',
    phone: r.phone || '',
    origin: r.origin || '',
    stage: r.stage,
    responsible: r.responsible || '',
    tags: r.tags || [],
    quantity: (r.quantity===null || r.quantity===undefined) ? null : Number(r.quantity),
    sizeGrid: r.size_grid || '',
    product: r.product || '',
    fabric: r.fabric || '',
    color: r.color || '',
    customization: r.customization || '',
    hasLogo: r.has_logo || '',
    desiredDeadline: r.deadline || null,
    createdAt: r.created_at,
    stageEnteredAt: r.stage_entered_at,
    lastMessageAt: r.last_message_at || null,
    waitingReason: r.wait_reason || '',
    nextFollowUpAt: r.next_follow_up_at || null,
    notes: r.notes || '',
    closed: r.closed || null,
    repass: r.repass || null,
    delivery: r.delivery || null,
    history: r.history || [],
    photos: r.photos || []
  };
}

async function supaFetch(path, opts){
  opts = opts || {};
  var session = await ensureSession();
  if(!session){ signOut(); throw new Error('Sessão expirada, faça login de novo.'); }
  var headers = Object.assign({
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + session.access_token,
    'Content-Type': 'application/json',
    'Accept-Profile': SUPABASE_SCHEMA,
    'Content-Profile': SUPABASE_SCHEMA
  }, opts.headers || {});
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if(!res.ok){
    var text = '';
    try{ text = await res.text(); }catch(e){}
    var err = new Error('Supabase ' + res.status + ' ' + text);
    err.code = res.status;
    throw err;
  }
  if(res.status === 204) return null;
  var ct = res.headers.get('content-type') || '';
  if(ct.indexOf('application/json') === -1) return null;
  return res.json();
}

/* ---- Fotos do pedido (Supabase Storage) ---- */
var PHOTOS_BUCKET = 'lead-photos';
var MAX_PHOTO_MB = 8;
function sanitizeFileName(name){
  return (name || 'foto').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
}
async function uploadLeadPhoto(leadId, file){
  if(!dbAvailable) throw new Error('Upload de fotos requer conexão com o banco.');
  if(file.size > MAX_PHOTO_MB * 1024 * 1024){
    throw new Error('Arquivo maior que ' + MAX_PHOTO_MB + 'MB.');
  }
  var session = await ensureSession();
  if(!session){ signOut(); throw new Error('Sessão expirada, faça login de novo.'); }
  var path = leadId + '/' + Date.now() + '_' + sanitizeFileName(file.name);
  var res = await fetch(SUPABASE_URL + '/storage/v1/object/' + PHOTOS_BUCKET + '/' + path, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false'
    },
    body: file
  });
  if(!res.ok){
    var text = '';
    try{ text = await res.text(); }catch(e){}
    var err = new Error('Falha no upload: ' + res.status + ' ' + text);
    err.code = res.status;
    throw err;
  }
  var publicUrl = SUPABASE_URL + '/storage/v1/object/public/' + PHOTOS_BUCKET + '/' + path;
  return { url: publicUrl, path: path, name: file.name, uploadedAt: nowIso() };
}
async function deleteLeadPhotoFile(path){
  try{
    var session = await ensureSession();
    if(!session) return;
    await fetch(SUPABASE_URL + '/storage/v1/object/' + PHOTOS_BUCKET + '/' + path, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + session.access_token }
    });
  }catch(e){ console.error('Falha ao excluir arquivo de foto', e); }
}

async function refreshLeadsFromServer(){
  var rows = await supaFetch('leads?select=*&order=created_at.desc&limit=1000');
  var map = {};
  (rows||[]).forEach(function(r){ map[r.id] = fromDbLead(r); });
  leadsCache = map;
  leadsLoaded = true;
  connectionStatus = 'connected';
  scheduleRender();
}

async function refreshSettingsFromServer(){
  var rows = await supaFetch('settings?select=*&id=eq.default&limit=1');
  if(rows && rows[0]){
    var r = rows[0];
    settingsCache = {
      repassThreshold: r.repass_threshold===null || r.repass_threshold===undefined ? DEFAULT_SETTINGS.repassThreshold : Number(r.repass_threshold),
      repassContact: r.repass_contact || '',
      followUpWindows: Object.assign({}, DEFAULT_SETTINGS.followUpWindows, r.follow_up_windows||{})
    };
  } else {
    settingsCache = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  settingsLoaded = true;
  scheduleRender();
}

function startPolling(){
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(function(){
    if(document.hidden) return;
    Promise.all([refreshLeadsFromServer(), refreshSettingsFromServer()]).catch(function(err){
      console.error('poll error', err);
      connectionStatus = 'read_error';
      scheduleRender();
    });
  }, 15000);
}

async function initStore(){
  if(!SUPABASE_URL || !SUPABASE_KEY){
    dbAvailable = false;
    connectionStatus = 'local';
    loadLocalLeads();
    loadLocalSettings();
    leadsLoaded = true;
    settingsLoaded = true;
    scheduleRender();
    return;
  }

  dbAvailable = true;
  try{
    await Promise.all([refreshLeadsFromServer(), refreshSettingsFromServer()]);
    startPolling();
  }catch(e){
    console.error('initStore error', e);
    connectionStatus = 'read_error';
    if(!leadsLoaded){ leadsLoaded = true; leadsCache = {}; }
    if(!settingsLoaded){ settingsLoaded = true; settingsCache = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
    scheduleRender();
    toast('Erro de sincronização com o banco de dados. Toque no indicador no topo para tentar de novo.', 6000);
    startPolling();
  }
}

function updateSyncPill(){
  var pill = document.getElementById('syncPill');
  var dot = document.getElementById('syncDot');
  var text = document.getElementById('syncText');
  if(!pill) return;

  pill.classList.remove('error');
  dot.classList.remove('off','error');

  if(lastWriteError && (Date.now() - lastWriteError.at) < 20000){
    pill.classList.add('error');
    dot.classList.add('error');
    text.textContent = 'Erro ao salvar (' + (lastWriteError.code||'ver console') + ') — toque aqui';
    return;
  }
  if(connectionStatus==='connecting'){
    dot.classList.add('off');
    text.textContent = 'Conectando…';
  } else if(connectionStatus==='connected'){
    text.textContent = 'Sincronizado';
  } else if(connectionStatus==='local'){
    dot.classList.add('off');
    text.textContent = 'Salvando neste navegador';
  } else if(connectionStatus==='read_error'){
    pill.classList.add('error');
    dot.classList.add('error');
    text.textContent = 'Sem conexão — toque para recarregar';
  }
}

document.getElementById('syncPill').addEventListener('click', function(){
  if(lastWriteError){
    lastWriteError = null;
    scheduleRender();
    return;
  }
  if(connectionStatus==='read_error'){
    window.location.reload();
    return;
  }
  toast(connectionStatus==='local' ? 'Os dados estão sendo salvos apenas neste navegador.' : 'Tudo certo, dados sincronizados.');
});

/* =========================================================
   MUTATIONS
   ========================================================= */
function registerWriteError(e, contextLabel){
  var code = (e && e.code) || 'unknown';
  var message = (e && e.message) || String(e);
  console.error('[CRM write error] ' + contextLabel, code, message);
  lastWriteError = { code:code, message:message, at:Date.now() };
  toast('⚠️ Falha ao salvar "' + contextLabel + '" (' + code + '). Toque no indicador no topo para detalhes.', 6000);
  scheduleRender();
}

async function persistLead(id, fullData){
  leadsCache[id] = fullData; // optimistic
  scheduleRender();
  if(dbAvailable){
    try{
      await supaFetch('leads?on_conflict=id', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: [toDbLead(fullData)]
      });
      lastWriteError = null;
    }catch(e){
      registerWriteError(e, 'cliente: ' + (fullData.name||id));
    }
  } else {
    saveLocalLeads();
  }
  scheduleRender();
}
async function removeLead(id){
  var name = leadsCache[id] ? leadsCache[id].name : id;
  delete leadsCache[id];
  scheduleRender();
  if(dbAvailable){
    try{
      await supaFetch('leads?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'Prefer': 'return=minimal' }
      });
      lastWriteError = null;
    }
    catch(e){ registerWriteError(e, 'excluir ' + name); }
  } else {
    saveLocalLeads();
  }
  scheduleRender();
}
async function persistSettings(){
  if(dbAvailable){
    try{
      await supaFetch('settings?on_conflict=id', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: [{
          id: 'default',
          repass_threshold: settingsCache.repassThreshold,
          repass_contact: settingsCache.repassContact || '',
          follow_up_windows: settingsCache.followUpWindows,
          updated_at: nowIso()
        }]
      });
      lastWriteError = null;
    }catch(e){
      registerWriteError(e, 'configurações');
    }
  } else {
    saveLocalSettings();
  }
  scheduleRender();
}

function pushHistory(lead, text){
  var h = (lead.history || []).slice();
  h.push({ at: nowIso(), text: text });
  if(h.length > 40) h = h.slice(h.length-40);
  lead.history = h;
}

function createLead(input){
  var id = uid();
  var lead = {
    id:id,
    name: input.name,
    phone: input.phone,
    origin: input.origin || 'WhatsApp direto',
    stage: 'novo_lead',
    createdAt: nowIso(),
    stageEnteredAt: nowIso(),
    quantity: input.quantity!==undefined && input.quantity!=='' ? Number(input.quantity) : null,
    product: input.product || '',
    sizeGrid: '',
    fabric: '',
    color: '',
    customization: '',
    hasLogo: '',
    desiredDeadline: null,
    tags: [],
    waitingReason: '',
    lastMessageAt: null,
    nextFollowUpAt: null,
    notes: '',
    responsible: '',
    closed: null,
    repass: null,
    delivery: null,
    history: [{ at: nowIso(), text: 'Lead criado (' + (input.origin||'WhatsApp direto') + ')' }],
    photos: []
  };
  persistLead(id, lead);
  toast('Lead adicionado: ' + input.name);
  return id;
}

function moveStageDirect(id, newStage){
  var lead = leadsCache[id];
  if(!lead) return;
  var old = STAGE_MAP[lead.stage] ? STAGE_MAP[lead.stage].label : lead.stage;
  lead.stage = newStage;
  lead.stageEnteredAt = nowIso();
  pushHistory(lead, 'Movido de "' + old + '" para "' + STAGE_MAP[newStage].label + '"');
  persistLead(id, lead);
}

/* =========================================================
   WAITING / URGENCY LEVEL
   ========================================================= */
function waitingInfo(lead){
  var ref = lead.lastMessageAt || lead.stageEnteredAt;
  var h = hoursSince(ref);
  var w = settingsCache.followUpWindows || DEFAULT_SETTINGS.followUpWindows;
  var level = 0, cls = 'badge-ok', label;
  if(h >= w.t4){ level=4; cls='badge-maroon'; }
  else if(h >= w.t3){ level=3; cls='badge-critical'; }
  else if(h >= w.t2){ level=2; cls='badge-warning'; }
  else if(h >= w.t1){ level=1; cls='badge-caution'; }
  else { level=0; cls='badge-ok'; }
  if(h===Infinity){ label='sem registro'; }
  else if(h < 1){ label = 'sem resposta há ' + Math.max(1,Math.round(h*60)) + ' min'; }
  else if(h < 24){ label = 'sem resposta há ' + Math.round(h) + 'h'; }
  else { label = 'sem resposta há ' + Math.floor(h/24) + ' dia' + (Math.floor(h/24)===1?'':'s'); }
  return { level:level, cls:cls, label:label, hours:h };
}

function newLeadUrgency(lead){
  var h = hoursSince(lead.createdAt);
  if(h >= 1) return 'badge-critical';
  if(h*60 >= 15) return 'badge-caution';
  return 'badge-neutral';
}

function isFollowUpToday(lead){
  return lead.nextFollowUpAt ? isSameLocalDay(lead.nextFollowUpAt, new Date()) : false;
}
function isFollowUpOverdue(lead){
  if(!lead.nextFollowUpAt) return false;
  var d = new Date(lead.nextFollowUpAt);
  var today = new Date(); today.setHours(0,0,0,0);
  return d < today;
}

/* =========================================================
   COUNTS
   ========================================================= */
function allLeads(){
  return Object.keys(leadsCache).map(function(k){ return leadsCache[k]; });
}
function computeCounts(){
  var leads = allLeads();
  var c = { novo_lead:0, em_atendimento:0, aguardando_cliente:0, fechado:0, entregue:0, pequeno_repassado:0, followupHoje:0 };
  leads.forEach(function(l){
    if(c[l.stage]!==undefined) c[l.stage]++;
    if(isFollowUpToday(l) || isFollowUpOverdue(l)) c.followupHoje++;
  });
  return c;
}

/* =========================================================
   FILTER PREDICATES
   ========================================================= */
function matchesDateFilter(l){
  if(!state.dateFilter) return true;
  if(state.dateFilter==='hoje') return isToday(l.createdAt);
  if(state.dateFilter==='ontem') return isYesterday(l.createdAt);
  if(state.dateFilter==='d7') return withinDays(l.createdAt,7);
  if(state.dateFilter==='d30') return withinDays(l.createdAt,30);
  return true;
}
var STATUS_PREDICATES = {
  novos: function(l){ return l.stage==='novo_lead'; },
  emAtendimento: function(l){ return l.stage==='em_atendimento'; },
  aguardando: function(l){ return l.stage==='aguardando_cliente'; },
  sem24: function(l){ return l.stage==='aguardando_cliente' && hoursSince(l.lastMessageAt||l.stageEnteredAt) >= 24; },
  sem48: function(l){ return l.stage==='aguardando_cliente' && hoursSince(l.lastMessageAt||l.stageEnteredAt) >= 48; },
  followuphoje: function(l){ return isFollowUpToday(l) || isFollowUpOverdue(l); },
  orcamento: function(l){ return (l.tags||[]).indexOf('ORCAMENTO_ENVIADO')>=0; },
  catalogo: function(l){ return (l.tags||[]).indexOf('CATALOGO_ENVIADO')>=0; },
  aguardandologo: function(l){ return (l.tags||[]).indexOf('AGUARDANDO_LOGO')>=0; },
  q6_20: function(l){ return typeof l.quantity==='number' && l.quantity>=6 && l.quantity<=20; },
  q20plus: function(l){ return typeof l.quantity==='number' && l.quantity>20; },
  fechados: function(l){ return l.stage==='fechado'; },
  entregues: function(l){ return l.stage==='entregue'; },
  repassados: function(l){ return l.stage==='pequeno_repassado'; }
};
function matchesStatusFilters(l){
  if(state.statusFilters.size===0) return true;
  var pass = true;
  state.statusFilters.forEach(function(key){
    if(STATUS_PREDICATES[key] && !STATUS_PREDICATES[key](l)) pass = false;
  });
  return pass;
}
function matchesSearch(l){
  if(!state.search) return true;
  var q = state.search.toLowerCase();
  return (l.name||'').toLowerCase().indexOf(q)>=0 || onlyDigits(l.phone).indexOf(onlyDigits(q))>=0 && onlyDigits(q).length>0 || (l.phone||'').toLowerCase().indexOf(q)>=0;
}
function filteredLeads(){
  return allLeads().filter(function(l){
    return matchesDateFilter(l) && matchesStatusFilters(l) && matchesSearch(l);
  });
}

/* =========================================================
   RENDER: COUNTERS
   ========================================================= */
var COUNTER_DEFS = [
  { key:'novo_lead', emoji:'🆕', label:'Novos', filterKey:'novos' },
  { key:'em_atendimento', emoji:'💬', label:'Atendimento', filterKey:'emAtendimento' },
  { key:'aguardando_cliente', emoji:'⏳', label:'Aguardando', filterKey:'aguardando' },
  { key:'followupHoje', emoji:'🔥', label:'Follow-up hoje', filterKey:'followuphoje', hot:true },
  { key:'fechado', emoji:'✅', label:'Fechados', filterKey:'fechados' },
  { key:'pequeno_repassado', emoji:'📦', label:'Repassados', filterKey:'repassados' }
];
function renderCounters(){
  var counts = computeCounts();
  var row = document.getElementById('countersRow');
  row.innerHTML = COUNTER_DEFS.map(function(c){
    var active = c.filterKey && state.statusFilters.has(c.filterKey);
    var hotClass = c.hot && counts[c.key] > 0 ? ' hot' : '';
    return '<div class="counter-chip'+(active?' active':'')+hotClass+'" data-filterkey="'+(c.filterKey||'')+'">'+
      '<span class="counter-emoji">'+c.emoji+'</span>'+
      '<span class="counter-text"><span class="counter-num">'+counts[c.key]+'</span><span class="counter-label">'+c.label+'</span></span>'+
    '</div>';
  }).join('');
  Array.prototype.forEach.call(row.querySelectorAll('.counter-chip'), function(el){
    el.addEventListener('click', function(){
      var fk = el.getAttribute('data-filterkey');
      if(!fk) return;
      if(state.statusFilters.has(fk) && state.statusFilters.size===1){
        state.statusFilters.clear();
      } else {
        state.statusFilters.clear();
        state.statusFilters.add(fk);
      }
      scheduleRender();
    });
  });
}

/* =========================================================
   RENDER: FILTERS
   ========================================================= */
var DATE_FILTERS = [
  {key:'hoje', label:'Hoje'}, {key:'ontem', label:'Ontem'}, {key:'d7', label:'7 dias'}, {key:'d30', label:'30 dias'}
];
var STATUS_FILTER_CHIPS = [
  {key:'novos', label:'Novos'},
  {key:'sem24', label:'Sem resposta 24h+'},
  {key:'sem48', label:'Sem resposta 48h+'},
  {key:'followuphoje', label:'Follow-up hoje'},
  {key:'orcamento', label:'Orçamento enviado'},
  {key:'catalogo', label:'Catálogo enviado'},
  {key:'aguardandologo', label:'Aguardando logo'},
  {key:'q6_20', label:'6–20 peças'},
  {key:'q20plus', label:'20+ peças'},
  {key:'fechados', label:'Fechados'},
  {key:'entregues', label:'Já entregues'},
  {key:'repassados', label:'Repassados'}
];
function renderFilters(){
  var dRow = document.getElementById('dateFilterRow');
  dRow.innerHTML = '<span class="filter-row-label">Período</span>' + DATE_FILTERS.map(function(f){
    return '<button class="chip'+(state.dateFilter===f.key?' active':'')+'" data-date="'+f.key+'">'+f.label+'</button>';
  }).join('') + (state.dateFilter ? '<button class="chip-clear" id="clearDateFilter">limpar período</button>' : '');
  Array.prototype.forEach.call(dRow.querySelectorAll('[data-date]'), function(el){
    el.addEventListener('click', function(){
      var k = el.getAttribute('data-date');
      state.dateFilter = state.dateFilter===k ? null : k;
      scheduleRender();
    });
  });
  var cd = document.getElementById('clearDateFilter');
  if(cd) cd.addEventListener('click', function(){ state.dateFilter=null; scheduleRender(); });

  var sRow = document.getElementById('statusFilterRow');
  sRow.innerHTML = '<span class="filter-row-label">Filtros</span>' + STATUS_FILTER_CHIPS.map(function(f){
    return '<button class="chip'+(state.statusFilters.has(f.key)?' active':'')+'" data-status="'+f.key+'">'+f.label+'</button>';
  }).join('') + (state.statusFilters.size ? '<button class="chip-clear" id="clearStatusFilter">limpar filtros</button>' : '');
  Array.prototype.forEach.call(sRow.querySelectorAll('[data-status]'), function(el){
    el.addEventListener('click', function(){
      var k = el.getAttribute('data-status');
      if(state.statusFilters.has(k)) state.statusFilters.delete(k); else state.statusFilters.add(k);
      scheduleRender();
    });
  });
  var cs = document.getElementById('clearStatusFilter');
  if(cs) cs.addEventListener('click', function(){ state.statusFilters.clear(); scheduleRender(); });
}

/* =========================================================
   RENDER: BOARD
   ========================================================= */
function sortForColumn(stage, leads){
  var arr = leads.slice();
  if(stage==='novo_lead'){
    arr.sort(function(a,b){ return new Date(a.createdAt) - new Date(b.createdAt); });
  } else if(stage==='aguardando_cliente'){
    arr.sort(function(a,b){
      var ha = hoursSince(a.lastMessageAt||a.stageEnteredAt);
      var hb = hoursSince(b.lastMessageAt||b.stageEnteredAt);
      return hb - ha;
    });
  } else if(stage==='em_atendimento'){
    arr.sort(function(a,b){ return new Date(a.stageEnteredAt) - new Date(b.stageEnteredAt); });
  } else if(stage==='fechado'){
    arr.sort(function(a,b){
      var da = a.closed && a.closed.closedAt ? new Date(a.closed.closedAt) : new Date(a.stageEnteredAt);
      var db_ = b.closed && b.closed.closedAt ? new Date(b.closed.closedAt) : new Date(b.stageEnteredAt);
      return db_ - da;
    });
  } else if(stage==='pequeno_repassado'){
    arr.sort(function(a,b){
      var ra = a.repass && a.repass.repassAt ? new Date(a.repass.repassAt) : new Date(a.stageEnteredAt);
      var rb = b.repass && b.repass.repassAt ? new Date(b.repass.repassAt) : new Date(b.stageEnteredAt);
      return rb - ra;
    });
  } else if(stage==='entregue'){
    arr.sort(function(a,b){
      var da = a.delivery && a.delivery.deliveredAt ? new Date(a.delivery.deliveredAt) : new Date(a.stageEnteredAt);
      var db_ = b.delivery && b.delivery.deliveredAt ? new Date(b.delivery.deliveredAt) : new Date(b.stageEnteredAt);
      return db_ - da;
    });
  }
  return arr;
}

function cardHtml(lead){
  var tagsHtml = (lead.tags||[]).slice(0,4).map(function(t){
    return '<span class="tag-pill">'+ escapeHtml(TAG_LABEL[t] || t) +'</span>';
  }).join('');
  var extra = (lead.tags||[]).length > 4 ? '<span class="tag-pill">+'+((lead.tags||[]).length-4)+'</span>' : '';

  var metaBits = [];
  if(lead.quantity) metaBits.push('<b>'+lead.quantity+'</b> peças');
  if(lead.product) metaBits.push(escapeHtml(lead.product));
  if(lead.color) metaBits.push(escapeHtml(lead.color));
  if(lead.fabric) metaBits.push(escapeHtml(lead.fabric));
  if(lead.origin) metaBits.push(escapeHtml(lead.origin));

  var badgeHtml = '';
  if(lead.stage==='novo_lead'){
    badgeHtml = '<span class="badge '+newLeadUrgency(lead)+'">Chegou '+formatRelative(lead.createdAt)+'</span>';
  } else if(lead.stage==='em_atendimento'){
    badgeHtml = '<span class="badge badge-neutral">Em atendimento '+formatRelative(lead.stageEnteredAt)+'</span>';
  } else if(lead.stage==='aguardando_cliente'){
    var wi = waitingInfo(lead);
    badgeHtml = '<span class="badge '+wi.cls+'">'+wi.label+'</span>';
  } else if(lead.stage==='fechado'){
    var val = lead.closed && lead.closed.value ? formatBRL(lead.closed.value) : '';
    badgeHtml = '<span class="badge badge-ok">'+ (val || 'Fechado') +'</span>';
  } else if(lead.stage==='pequeno_repassado'){
    badgeHtml = '<span class="badge badge-neutral">Repassado '+formatRelative(lead.repass && lead.repass.repassAt || lead.stageEnteredAt)+'</span>';
  } else if(lead.stage==='entregue'){
    badgeHtml = '<span class="badge badge-ok">📬 Entregue '+formatRelative(lead.delivery && lead.delivery.deliveredAt || lead.stageEnteredAt)+'</span>';
  }

  var followBit = '';
  if(lead.nextFollowUpAt){
    if(isFollowUpOverdue(lead)){
      followBit = '<div class="card-followup badge-critical">🔥 Follow-up atrasado ('+formatDateShort(lead.nextFollowUpAt)+')</div>';
    } else if(isFollowUpToday(lead)){
      followBit = '<div class="card-followup badge-warning">🔥 Follow-up hoje</div>';
    } else {
      followBit = '<div class="card-followup badge-neutral">Follow-up '+formatDateShort(lead.nextFollowUpAt)+'</div>';
    }
  }

  var moveOptions = STAGES.filter(function(s){ return s.key !== lead.stage; }).map(function(s){
    return '<div class="move-menu-item" data-move="'+s.key+'" data-id="'+lead.id+'">'+s.emoji+' Mover para '+s.label+'</div>';
  }).join('') + '<div class="move-menu-item danger" data-delete="1" data-id="'+lead.id+'">🗑 Excluir lead</div>';

  return (
    '<div class="card" draggable="true" data-id="'+lead.id+'">'+
      '<div class="card-top">'+
        '<span class="card-name">'+avatarHtml(lead,24)+'<span>'+escapeHtml(lead.name)+'</span></span>'+
        '<div class="card-move">'+
          '<button class="card-menu-btn" data-menu-toggle="'+lead.id+'" aria-label="Mais opções">⋮</button>'+
          '<div class="move-menu" id="movemenu-'+lead.id+'">'+moveOptions+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="card-meta">'+metaBits.join(' · ')+'</div>'+
      (lead.responsible ? '<div class="card-meta" style="margin-top:-3px;">'+responsibleBadgeHtml(lead.responsible)+'</div>' : '')+
      (tagsHtml || extra ? '<div class="card-tags">'+tagsHtml+extra+'</div>' : '')+
      '<div class="card-footer">'+
        badgeHtml+
        '<a class="card-wa" href="'+waLink(lead.phone)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">'+
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.1 1.6 5.9L0 24l6.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S18.6 0 12 0zm0 22c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-3.7 1 1-3.6-.2-.4C2.5 15.7 2 13.9 2 12 2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z"/></svg>'+
          'WhatsApp'+
        '</a>'+
      '</div>'+
      followBit+
    '</div>'
  );
}

function renderBoard(){
  var area = document.getElementById('boardArea');
  var leads = filteredLeads();
  var total = allLeads().length;

  if(total===0){
    area.innerHTML = '<div class="state-screen"><div class="big">Nenhum cliente cadastrado ainda</div><div>Clique em "＋ Novo lead" para começar a organizar o atendimento.</div></div>';
    return;
  }

  var byStage = {};
  STAGES.forEach(function(s){ byStage[s.key] = []; });
  leads.forEach(function(l){ if(byStage[l.stage]) byStage[l.stage].push(l); });

  var html = '<div class="board">';
  STAGES.forEach(function(s){
    var list = sortForColumn(s.key, byStage[s.key]);
    html += '<div class="column">'+
      '<div class="column-head">'+
        '<span class="column-dot" style="background:'+s.color+'"></span>'+
        '<span class="column-title">'+s.emoji+' '+s.label+'</span>'+
        '<span class="column-count">'+list.length+'</span>'+
      '</div>'+
      '<div class="column-body" data-stage="'+s.key+'">'+
        (list.length ? list.map(cardHtml).join('') : '<div class="column-empty">Nenhum cliente aqui'+(state.search||state.dateFilter||state.statusFilters.size?' com esse filtro':'')+'.</div>')+
      '</div>'+
    '</div>';
  });
  html += '</div>';
  area.innerHTML = html;

  wireBoardEvents();
}

function wireBoardEvents(){
  // card click -> open modal
  Array.prototype.forEach.call(document.querySelectorAll('.card'), function(card){
    card.addEventListener('click', function(e){
      if(e.target.closest('.card-move') || e.target.closest('.card-wa')) return;
      openLeadModal(card.getAttribute('data-id'));
    });
    card.addEventListener('dragstart', function(e){
      draggingId = card.getAttribute('data-id');
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try{ e.dataTransfer.setData('text/plain', draggingId); }catch(err){}
    });
    card.addEventListener('dragend', function(){
      card.classList.remove('dragging');
      draggingId = null;
    });
  });

  // menu toggles
  Array.prototype.forEach.call(document.querySelectorAll('[data-menu-toggle]'), function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var id = btn.getAttribute('data-menu-toggle');
      var menu = document.getElementById('movemenu-'+id);
      var wasOpen = menu.classList.contains('open');
      closeAllMoveMenus();
      if(!wasOpen) menu.classList.add('open');
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-move]'), function(item){
    item.addEventListener('click', function(e){
      e.stopPropagation();
      closeAllMoveMenus();
      requestStageChange(item.getAttribute('data-id'), item.getAttribute('data-move'));
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-delete]'), function(item){
    item.addEventListener('click', function(e){
      e.stopPropagation();
      closeAllMoveMenus();
      var id = item.getAttribute('data-id');
      confirmDeleteLead(id);
    });
  });

  // drop zones
  Array.prototype.forEach.call(document.querySelectorAll('.column-body'), function(zone){
    zone.addEventListener('dragover', function(e){
      e.preventDefault();
      zone.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    });
    zone.addEventListener('dragleave', function(){ zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function(e){
      e.preventDefault();
      zone.classList.remove('drag-over');
      var id = draggingId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
      var targetStage = zone.getAttribute('data-stage');
      if(id) requestStageChange(id, targetStage);
    });
  });
}
function closeAllMoveMenus(){
  Array.prototype.forEach.call(document.querySelectorAll('.move-menu.open'), function(m){ m.classList.remove('open'); });
}
document.addEventListener('click', closeAllMoveMenus);

function requestStageChange(id, targetStage){
  var lead = leadsCache[id];
  if(!lead || lead.stage===targetStage) return;
  if(targetStage==='fechado'){
    openCloseModal(id);
  } else if(targetStage==='entregue'){
    openDeliveredModal(id);
  } else if(targetStage==='pequeno_repassado'){
    openRepassModal(id);
  } else if(targetStage==='aguardando_cliente'){
    openWaitingModal(id);
  } else if(targetStage==='em_atendimento' && !lead.responsible){
    openAttendingModal(id);
  } else {
    moveStageDirect(id, targetStage);
    toast(lead.name + ' movido para ' + STAGE_MAP[targetStage].label);
  }
}

/* =========================================================
   MODAL: NEW LEAD
   ========================================================= */
var newLeadOverlay = document.getElementById('newLeadOverlay');
document.getElementById('newLeadBtn').addEventListener('click', function(){
  document.getElementById('nlName').value='';
  document.getElementById('nlPhone').value='';
  document.getElementById('nlOrigin').value='WhatsApp direto';
  document.getElementById('nlQuantity').value='';
  document.getElementById('nlProduct').value='';
  newLeadOverlay.classList.remove('hidden');
  setTimeout(function(){ document.getElementById('nlName').focus(); }, 50);
});
function closeNewLead(){ newLeadOverlay.classList.add('hidden'); }
document.getElementById('newLeadClose').addEventListener('click', closeNewLead);
document.getElementById('nlCancel').addEventListener('click', closeNewLead);
newLeadOverlay.addEventListener('click', function(e){ if(e.target===newLeadOverlay) closeNewLead(); });
document.getElementById('nlSave').addEventListener('click', function(){
  var name = document.getElementById('nlName').value.trim();
  var phone = document.getElementById('nlPhone').value.trim();
  if(!name || !phone){
    toast('Preencha nome e WhatsApp.');
    return;
  }
  createLead({
    name:name, phone:phone,
    origin: document.getElementById('nlOrigin').value,
    quantity: document.getElementById('nlQuantity').value,
    product: document.getElementById('nlProduct').value.trim()
  });
  closeNewLead();
});

/* =========================================================
   MODAL: START ATTENDING (RESPONSÁVEL)
   ========================================================= */
var attendingOverlay = document.getElementById('attendingOverlay');
var attendingTargetId = null;
function openAttendingModal(id){
  attendingTargetId = id;
  document.getElementById('aResponsibleToggle').innerHTML = responsibleToggleHtml('aResponsibleToggleGrid', '');
  wireResponsibleToggle('aResponsibleToggleGrid');
  attendingOverlay.classList.remove('hidden');
}
function closeAttendingModal(){ attendingOverlay.classList.add('hidden'); attendingTargetId=null; }
document.getElementById('attendingClose').addEventListener('click', closeAttendingModal);
attendingOverlay.addEventListener('click', function(e){ if(e.target===attendingOverlay) closeAttendingModal(); });
function confirmStartAttending(withResponsible){
  if(!attendingTargetId) return;
  var lead = leadsCache[attendingTargetId];
  var old = STAGE_MAP[lead.stage].label;
  var respId = withResponsible ? getResponsibleToggleValue('aResponsibleToggleGrid') : '';
  var respName = respId ? RESPONSIBLE_MAP[respId].name : '';
  lead.stage = 'em_atendimento';
  lead.stageEnteredAt = nowIso();
  if(respId) lead.responsible = respId;
  pushHistory(lead, respName ? ('Atendimento iniciado por ' + respName) : ('Movido de "'+old+'" para "Em Atendimento"'));
  persistLead(attendingTargetId, lead);
  toast(respName ? ('Atendimento de ' + lead.name + ' iniciado por ' + respName) : (lead.name + ' movido para Em Atendimento'));
  closeAttendingModal();
  refreshLeadModalIfOpen(attendingTargetId);
}
document.getElementById('aSave').addEventListener('click', function(){ confirmStartAttending(true); });
document.getElementById('aSkip').addEventListener('click', function(){ confirmStartAttending(false); });

/* =========================================================
   MODAL: WAITING (AGUARDANDO CLIENTE)
   ========================================================= */
var waitingOverlay = document.getElementById('waitingOverlay');
var waitingTargetId = null;
function openWaitingModal(id){
  waitingTargetId = id;
  var lead = leadsCache[id];
  document.getElementById('wReason').value = lead.waitingReason || 'Orçamento enviado';
  var d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  document.getElementById('wLastMsg').value = d.toISOString().slice(0,16);
  document.getElementById('wFollowUp').value = lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0,10) : '';
  waitingOverlay.classList.remove('hidden');
}
function closeWaitingModal(){ waitingOverlay.classList.add('hidden'); waitingTargetId=null; }
document.getElementById('waitingClose').addEventListener('click', closeWaitingModal);
document.getElementById('wCancel').addEventListener('click', closeWaitingModal);
waitingOverlay.addEventListener('click', function(e){ if(e.target===waitingOverlay) closeWaitingModal(); });
document.getElementById('wSave').addEventListener('click', function(){
  if(!waitingTargetId) return;
  var lead = leadsCache[waitingTargetId];
  var reason = document.getElementById('wReason').value;
  var lastMsgRaw = document.getElementById('wLastMsg').value;
  var followUp = document.getElementById('wFollowUp').value;
  var old = STAGE_MAP[lead.stage].label;
  lead.stage = 'aguardando_cliente';
  lead.stageEnteredAt = nowIso();
  lead.waitingReason = reason;
  lead.lastMessageAt = lastMsgRaw ? new Date(lastMsgRaw).toISOString() : nowIso();
  lead.nextFollowUpAt = followUp || null;
  pushHistory(lead, 'Movido de "'+old+'" para "Aguardando Cliente" — '+reason);
  persistLead(waitingTargetId, lead);
  toast(lead.name + ' movido para Aguardando Cliente');
  closeWaitingModal();
  refreshLeadModalIfOpen(waitingTargetId);
});

/* =========================================================
   MODAL: CLOSE (FECHADO)
   ========================================================= */
var closeOverlay = document.getElementById('closeOverlay');
var closeTargetId = null;
function openCloseModal(id){
  closeTargetId = id;
  var lead = leadsCache[id];
  document.getElementById('cValue').value = lead.closed ? lead.closed.value : '';
  document.getElementById('cPayment').value = lead.closed ? lead.closed.paymentMethod : 'Pix';
  document.getElementById('cDate').value = new Date().toISOString().slice(0,10);
  var preset = (lead.closed && lead.closed.responsible) || lead.responsible || '';
  document.getElementById('cRespToggle').innerHTML = responsibleToggleHtml('cRespToggleGrid', preset);
  wireResponsibleToggle('cRespToggleGrid');
  document.getElementById('cNotes').value = lead.closed ? lead.closed.notes : '';
  closeOverlay.classList.remove('hidden');
}
function closeCloseModal(){ closeOverlay.classList.add('hidden'); closeTargetId=null; }
document.getElementById('closeOverlayClose').addEventListener('click', closeCloseModal);
document.getElementById('cCancel').addEventListener('click', closeCloseModal);
closeOverlay.addEventListener('click', function(e){ if(e.target===closeOverlay) closeCloseModal(); });
document.getElementById('cSave').addEventListener('click', function(){
  if(!closeTargetId) return;
  var value = document.getElementById('cValue').value;
  if(!value){ toast('Informe o valor fechado.'); return; }
  var lead = leadsCache[closeTargetId];
  var old = STAGE_MAP[lead.stage].label;
  var respId = getResponsibleToggleValue('cRespToggleGrid');
  lead.stage = 'fechado';
  lead.stageEnteredAt = nowIso();
  if(!lead.responsible) lead.responsible = respId;
  lead.closed = {
    value: Number(value),
    paymentMethod: document.getElementById('cPayment').value,
    closedAt: document.getElementById('cDate').value ? new Date(document.getElementById('cDate').value+'T12:00:00').toISOString() : nowIso(),
    responsible: respId,
    notes: document.getElementById('cNotes').value.trim()
  };
  pushHistory(lead, 'Movido de "'+old+'" para "Fechado" — '+formatBRL(value));
  persistLead(closeTargetId, lead);
  toast('🎉 Venda fechada: ' + lead.name);
  closeCloseModal();
  refreshLeadModalIfOpen(closeTargetId);
});

/* =========================================================
   MODAL: REPASSE (PEQUENO PEDIDO)
   ========================================================= */
var repassOverlay = document.getElementById('repassOverlay');
var repassTargetId = null;
function repassMessage(name, contact){
  var threshold = settingsCache.repassThreshold || 5;
  var who = contact ? (' com ' + contact) : '';
  return 'Olá, '+name+'! Para pedidos de até '+threshold+' peças, nosso atendimento especializado é feito'+who+'. Vou te conectar por lá, combinado?';
}
function openRepassModal(id){
  repassTargetId = id;
  var lead = leadsCache[id];
  document.getElementById('rQuantity').value = lead.quantity || '';
  document.getElementById('rContact').value = settingsCache.repassContact || '';
  document.getElementById('rNotes').value = '';
  updateRepassPreview();
  repassOverlay.classList.remove('hidden');
}
function updateRepassPreview(){
  var lead = leadsCache[repassTargetId];
  if(!lead) return;
  var contact = document.getElementById('rContact').value.trim();
  document.getElementById('rMsgPreview').textContent = repassMessage(lead.name, contact);
}
document.getElementById('rQuantity').addEventListener('input', updateRepassPreview);
document.getElementById('rContact').addEventListener('input', updateRepassPreview);
function closeRepassModal(){ repassOverlay.classList.add('hidden'); repassTargetId=null; }
document.getElementById('repassOverlayClose').addEventListener('click', closeRepassModal);
document.getElementById('rCancel').addEventListener('click', closeRepassModal);
repassOverlay.addEventListener('click', function(e){ if(e.target===repassOverlay) closeRepassModal(); });
document.getElementById('rCopyBtn').addEventListener('click', function(){
  var text = document.getElementById('rMsgPreview').textContent;
  copyToClipboard(text);
});
function copyToClipboard(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){
      toast('Mensagem copiada!');
    }).catch(function(){ fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text){
  try{
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Mensagem copiada!');
  }catch(e){
    toast('Não foi possível copiar automaticamente. Selecione o texto manualmente.');
  }
}
document.getElementById('rSave').addEventListener('click', function(){
  if(!repassTargetId) return;
  var lead = leadsCache[repassTargetId];
  var old = STAGE_MAP[lead.stage].label;
  var qty = document.getElementById('rQuantity').value;
  var contact = document.getElementById('rContact').value.trim();
  var notes = document.getElementById('rNotes').value.trim();
  lead.stage = 'pequeno_repassado';
  lead.stageEnteredAt = nowIso();
  if(qty!=='') lead.quantity = Number(qty);
  lead.repass = {
    quantity: qty!=='' ? Number(qty) : (lead.quantity||null),
    repassAt: nowIso(),
    contact: contact,
    notes: notes,
    status: 'Repassado'
  };
  pushHistory(lead, 'Movido de "'+old+'" para "Pequeno — Repassado" ('+(qty||'?')+' peças → '+(contact||'contato não definido')+')');
  persistLead(repassTargetId, lead);
  toast('📦 ' + lead.name + ' repassado.');
  closeRepassModal();
  refreshLeadModalIfOpen(repassTargetId);
});

/* =========================================================
   MODAL: DELIVERED (ENTREGUE)
   ========================================================= */
var deliveredOverlay = document.getElementById('deliveredOverlay');
var deliveredTargetId = null;
function openDeliveredModal(id){
  deliveredTargetId = id;
  var lead = leadsCache[id];
  document.getElementById('dDate').value = (lead.delivery && lead.delivery.deliveredAt) ? lead.delivery.deliveredAt.slice(0,10) : new Date().toISOString().slice(0,10);
  document.getElementById('dNotes').value = (lead.delivery && lead.delivery.notes) || '';
  deliveredOverlay.classList.remove('hidden');
}
function closeDeliveredModal(){ deliveredOverlay.classList.add('hidden'); deliveredTargetId=null; }
document.getElementById('deliveredOverlayClose').addEventListener('click', closeDeliveredModal);
document.getElementById('dCancel').addEventListener('click', closeDeliveredModal);
deliveredOverlay.addEventListener('click', function(e){ if(e.target===deliveredOverlay) closeDeliveredModal(); });
document.getElementById('dSave').addEventListener('click', function(){
  if(!deliveredTargetId) return;
  var lead = leadsCache[deliveredTargetId];
  var old = STAGE_MAP[lead.stage].label;
  var dateVal = document.getElementById('dDate').value;
  var notes = document.getElementById('dNotes').value.trim();
  lead.stage = 'entregue';
  lead.stageEnteredAt = nowIso();
  lead.delivery = {
    deliveredAt: dateVal ? new Date(dateVal+'T12:00:00').toISOString() : nowIso(),
    notes: notes
  };
  pushHistory(lead, 'Movido de "'+old+'" para "Cliente já Entregue"'+(notes?(' — '+notes):''));
  persistLead(deliveredTargetId, lead);
  toast('📬 ' + lead.name + ' marcado como entregue.');
  closeDeliveredModal();
  refreshLeadModalIfOpen(deliveredTargetId);
});

/* =========================================================
   MODAL: LEAD DETAIL
   ========================================================= */
var leadModalOverlay = document.getElementById('leadModalOverlay');
var currentLeadId = null;

function refreshLeadModalIfOpen(id){
  if(currentLeadId===id && !leadModalOverlay.classList.contains('hidden')){
    renderLeadModal(id);
  }
}

function openLeadModal(id){
  currentLeadId = id;
  renderLeadModal(id);
  leadModalOverlay.classList.remove('hidden');
}
function closeLeadModal(){
  leadModalOverlay.classList.add('hidden');
  currentLeadId = null;
}
document.getElementById('leadModalClose').addEventListener('click', closeLeadModal);
leadModalOverlay.addEventListener('click', function(e){ if(e.target===leadModalOverlay) closeLeadModal(); });

function renderLeadModal(id){
  var lead = leadsCache[id];
  if(!lead){ closeLeadModal(); return; }
  document.getElementById('leadModalTitleText').textContent = lead.name;
  document.getElementById('leadModalAvatar').innerHTML = avatarHtml(lead, 32);

  var threshold = settingsCache.repassThreshold || 5;
  var showRepassSuggestion = lead.stage!=='pequeno_repassado' && lead.stage!=='fechado' && typeof lead.quantity==='number' && lead.quantity>0 && lead.quantity<=threshold;

  var body = document.getElementById('leadModalBody');
  var html = '';

  if(showRepassSuggestion){
    html += '<div class="info-banner"><div>'+
      '<b>Pedido pequeno detectado</b>'+
      'Esse cliente pediu '+lead.quantity+' peças (≤ '+threshold+'). Pode repassar para o contato responsável.'+
    '</div><button class="btn btn-sm" id="bannerRepassBtn">Repassar</button></div>';
  }

  html += '<div class="section-title">Dados do cliente</div>';
  html += '<div class="field-row">'+
    '<div class="field"><label>Nome</label><input type="text" id="edName" value="'+escapeHtml(lead.name)+'"></div>'+
    '<div class="field"><label>WhatsApp</label><input type="tel" id="edPhone" value="'+escapeHtml(lead.phone)+'"></div>'+
  '</div>';
  html += '<div class="field"><label>Origem</label><input type="text" id="edOrigin" value="'+escapeHtml(lead.origin||'')+'"></div>';
  html += '<div class="field"><label>Responsável pelo atendimento</label>'+responsibleToggleHtml('edResponsibleToggleGrid', lead.responsible||'')+'</div>';

  html += '<div class="section-title">📋 Necessidade do cliente</div>';
  html += '<div class="field-row">'+
    '<div class="field"><label>Quantidade de peças</label><input type="number" min="0" id="edQuantity" value="'+(lead.quantity!==null && lead.quantity!==undefined ? lead.quantity : '')+'"></div>'+
    '<div class="field"><label>Grade de tamanhos</label><input type="text" id="edSizeGrid" placeholder="Ex.: P:5 M:10 G:8 GG:2" value="'+escapeHtml(lead.sizeGrid||'')+'"></div>'+
  '</div>';
  html += '<div class="field-row">'+
    '<div class="field"><label>Modelo / produto desejado</label><input type="text" id="edProduct" placeholder="Ex.: Polo piquet" value="'+escapeHtml(lead.product||'')+'"></div>'+
    '<div class="field"><label>Tecido</label><input type="text" id="edFabric" placeholder="Ex.: Piquet, Dry fit…" value="'+escapeHtml(lead.fabric||'')+'"></div>'+
  '</div>';
  html += '<div class="field-row">'+
    '<div class="field"><label>Cor</label><input type="text" id="edColor" placeholder="Ex.: Azul-marinho" value="'+escapeHtml(lead.color||'')+'"></div>'+
    '<div class="field"><label>Tipo de personalização</label><select id="edCustomization">'+
      ['', 'Bordado', 'Estampa', 'Bordado e estampa', 'Nenhuma'].map(function(opt){
        var sel = (lead.customization||'')===opt ? ' selected' : '';
        var text = opt === '' ? 'Não definido' : opt;
        return '<option value="'+escapeHtml(opt)+'"'+sel+'>'+escapeHtml(text)+'</option>';
      }).join('') +
    '</select></div>'+
  '</div>';
  html += '<div class="field-row">'+
    '<div class="field"><label>Possui logo?</label><select id="edHasLogo">'+
      [['','Não perguntado ainda'],['Sim','Sim'],['Não','Não']].map(function(opt){
        var sel = (lead.hasLogo||'')===opt[0] ? ' selected' : '';
        return '<option value="'+escapeHtml(opt[0])+'"'+sel+'>'+escapeHtml(opt[1])+'</option>';
      }).join('') +
    '</select></div>'+
    '<div class="field"><label>Prazo desejado</label><input type="date" id="edDeadline" value="'+(lead.desiredDeadline ? String(lead.desiredDeadline).slice(0,10) : '')+'"></div>'+
  '</div>';

  html += '<div class="section-title">📷 Fotos do pedido</div>';
  html += '<div class="field-hint" style="margin-top:-6px;margin-bottom:10px;">Referências, artes aprovadas, prints que o cliente mandou etc. Formatos de imagem, até '+MAX_PHOTO_MB+'MB cada.</div>';
  html += '<div class="photo-gallery" id="leadPhotoGallery">' + renderPhotoGalleryHtml(lead) + '</div>';

  html += '<div class="section-title">Etapa atual</div>';
  html += '<div class="stage-select-grid">' + STAGES.map(function(s){
    return '<button class="stage-btn'+(lead.stage===s.key?' active':'')+'" data-stagebtn="'+s.key+'">'+
      '<span class="stage-dot" style="background:'+s.color+'"></span>'+s.emoji+' '+s.label+'</button>';
  }).join('') + '</div>';

  if(lead.stage==='aguardando_cliente'){
    html += '<div class="field-row" style="margin-top:14px;">'+
      '<div class="field"><label>Motivo da espera</label><input type="text" id="edWaitReason" value="'+escapeHtml(lead.waitingReason||'')+'"></div>'+
      '<div class="field"><label>Última mensagem</label><input type="datetime-local" id="edLastMsg" value="'+(lead.lastMessageAt ? toLocalInputValue(lead.lastMessageAt) : '')+'"></div>'+
    '</div>'+
    '<div class="field"><label>Próximo follow-up</label><input type="date" id="edFollowUp" value="'+(lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0,10) : '')+'"></div>';
  } else {
    html += '<div class="field" style="margin-top:14px;"><label>Próximo follow-up (opcional)</label><input type="date" id="edFollowUp" value="'+(lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0,10) : '')+'"></div>';
  }

  html += '<div class="section-title">Tags</div>';
  html += '<div class="tag-toggle-grid" id="tagToggleGrid">' + TAG_OPTIONS.map(function(t){
    var active = (lead.tags||[]).indexOf(t.id)>=0;
    return '<button type="button" class="tag-toggle'+(active?' active':'')+'" data-tag="'+t.id+'">'+t.label+'</button>';
  }).join('') + '</div>';
  html += '<div class="custom-tag-row"><input type="text" id="customTagInput" placeholder="Tag personalizada… (Enter para adicionar)"></div>';
  html += '<div class="tag-toggle-grid" id="customTagsList" style="margin-top:8px;">' + (lead.tags||[]).filter(function(t){ return !TAG_LABEL[t]; }).map(function(t){
    return '<button type="button" class="tag-toggle active" data-customtag="'+escapeHtml(t)+'">🏷️ '+escapeHtml(t)+' ✕</button>';
  }).join('') + '</div>';

  if(lead.stage==='fechado' && lead.closed){
    html += '<div class="section-title">Detalhes do fechamento</div>';
    html += '<div class="field-row">'+
      '<div class="field"><label>Valor</label><input type="text" readonly value="'+formatBRL(lead.closed.value)+'"></div>'+
      '<div class="field"><label>Forma de pagamento</label><input type="text" readonly value="'+escapeHtml(lead.closed.paymentMethod||'')+'"></div>'+
    '</div>'+
    '<div class="field-row">'+
      '<div class="field"><label>Data</label><input type="text" readonly value="'+formatDateShort(lead.closed.closedAt)+'"></div>'+
      '<div class="field"><label>Responsável</label><div style="padding-top:6px;">'+(lead.closed.responsible ? responsibleBadgeHtml(lead.closed.responsible) : '<span style="color:var(--muted);font-size:12.5px;">—</span>')+'</div></div>'+
    '</div>';
  }
  if(lead.stage==='pequeno_repassado' && lead.repass){
    html += '<div class="section-title">Detalhes do repasse</div>';
    html += '<div class="field-row">'+
      '<div class="field"><label>Quantidade</label><input type="text" readonly value="'+(lead.repass.quantity||'—')+'"></div>'+
      '<div class="field"><label>Repassado para</label><input type="text" readonly value="'+escapeHtml(lead.repass.contact||'—')+'"></div>'+
    '</div>'+
    '<div class="field"><label>Data do repasse</label><input type="text" readonly value="'+formatDateTimeShort(lead.repass.repassAt)+'"></div>';
  }
  if(lead.stage==='entregue' && lead.delivery){
    html += '<div class="section-title">Detalhes da entrega</div>';
    html += '<div class="field"><label>Data da entrega</label><input type="text" readonly value="'+formatDateShort(lead.delivery.deliveredAt)+'"></div>';
    if(lead.delivery.notes){
      html += '<div class="field"><label>Observações da entrega</label><textarea readonly>'+escapeHtml(lead.delivery.notes)+'</textarea></div>';
    }
  }

  html += '<div class="section-title">Observações</div>';
  html += '<div class="field"><textarea id="edNotes" placeholder="Anotações internas sobre esse cliente…">'+escapeHtml(lead.notes||'')+'</textarea></div>';

  html += '<div class="section-title">Histórico</div>';
  var hist = (lead.history||[]).slice().reverse();
  html += '<div class="history-list">' + (hist.length ? hist.map(function(h){
    return '<div class="history-item"><span class="history-dot"></span><div><span class="history-text">'+escapeHtml(h.text)+'</span><span class="history-time">'+formatDateTimeShort(h.at)+'</span></div></div>';
  }).join('') : '<div style="color:var(--muted);font-size:12.5px;">Sem registros ainda.</div>') + '</div>';

  body.innerHTML = html;

  // footer
  var foot = document.getElementById('leadModalFoot');
  foot.innerHTML = '<button class="btn btn-danger btn-sm" id="delLeadBtn">Excluir</button>'+
    '<span class="spacer"></span>'+
    '<button class="btn btn-ghost" id="cancelLeadEdit">Fechar</button>'+
    '<button class="btn" id="saveLeadEdit">Salvar alterações</button>';

  wireLeadModalEvents(id);
}

function toLocalInputValue(iso){
  var d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}

function renderPhotoGalleryHtml(lead){
  var photos = lead.photos || [];
  var thumbs = photos.map(function(p, idx){
    return '<div class="photo-thumb">'+
      '<img src="'+escapeHtml(p.url)+'" data-photo-view="'+idx+'" alt="Foto do pedido">'+
      '<button type="button" class="photo-remove" data-photo-remove="'+idx+'" title="Excluir foto" aria-label="Excluir foto">✕</button>'+
    '</div>';
  }).join('');
  var addBtn = '<label class="photo-add" id="photoAddBtn">'+
    '<span style="font-size:20px;">＋</span><span>Adicionar</span>'+
    '<input type="file" accept="image/*" multiple id="photoFileInput" style="display:none;">'+
  '</label>';
  return thumbs + addBtn;
}

function openPhotoLightbox(url){
  var el = document.createElement('div');
  el.className = 'photo-lightbox-overlay';
  el.innerHTML = '<button class="modal-close" aria-label="Fechar">✕</button><img src="'+escapeHtml(url)+'" alt="Foto do pedido ampliada">';
  el.addEventListener('click', function(e){ if(e.target===el || e.target.closest('.modal-close')) el.remove(); });
  document.body.appendChild(el);
}

function wirePhotoGallery(id){
  var gallery = document.getElementById('leadPhotoGallery');
  if(!gallery) return;

  gallery.addEventListener('click', function(e){
    var viewBtn = e.target.closest('[data-photo-view]');
    if(viewBtn){ openPhotoLightbox(viewBtn.getAttribute('src')); return; }
    var rmBtn = e.target.closest('[data-photo-remove]');
    if(rmBtn){
      var idx = Number(rmBtn.getAttribute('data-photo-remove'));
      var lead = leadsCache[id];
      if(!lead) return;
      var photo = (lead.photos||[])[idx];
      if(!photo) return;
      lead.photos = (lead.photos||[]).filter(function(_, i){ return i!==idx; });
      pushHistory(lead, 'Foto removida do pedido');
      persistLead(id, lead);
      if(photo.path) deleteLeadPhotoFile(photo.path);
      gallery.innerHTML = renderPhotoGalleryHtml(lead);
      wirePhotoFileInput(id);
      return;
    }
  });

  wirePhotoFileInput(id);
}

function wirePhotoFileInput(id){
  var input = document.getElementById('photoFileInput');
  var addBtn = document.getElementById('photoAddBtn');
  if(!input) return;
  input.addEventListener('change', async function(){
    var files = Array.prototype.slice.call(input.files || []);
    if(!files.length) return;
    addBtn.classList.add('uploading');
    for(var i=0;i<files.length;i++){
      var file = files[i];
      try{
        var uploaded = await uploadLeadPhoto(id, file);
        var lead = leadsCache[id];
        if(!lead) break;
        lead.photos = (lead.photos||[]).concat([uploaded]);
        pushHistory(lead, 'Foto adicionada ao pedido: ' + uploaded.name);
        await persistLead(id, lead);
      }catch(e){
        toast('⚠️ Falha ao enviar "' + file.name + '": ' + (e.message||e));
      }
    }
    var gallery = document.getElementById('leadPhotoGallery');
    var leadNow = leadsCache[id];
    if(gallery && leadNow){
      gallery.innerHTML = renderPhotoGalleryHtml(leadNow);
      wirePhotoFileInput(id);
    }
  });
}

function wireLeadModalEvents(id){
  wirePhotoGallery(id);

  var bannerBtn = document.getElementById('bannerRepassBtn');
  if(bannerBtn) bannerBtn.addEventListener('click', function(){ closeLeadModal(); openRepassModal(id); });

  wireResponsibleToggle('edResponsibleToggleGrid');

  Array.prototype.forEach.call(document.querySelectorAll('[data-stagebtn]'), function(btn){
    btn.addEventListener('click', function(){
      var target = btn.getAttribute('data-stagebtn');
      var lead = leadsCache[id];
      if(target===lead.stage) return;
      closeLeadModal();
      requestStageChange(id, target);
    });
  });

  var tagGrid = document.getElementById('tagToggleGrid');
  tagGrid.addEventListener('click', function(e){
    var btn = e.target.closest('[data-tag]');
    if(!btn) return;
    btn.classList.toggle('active');
  });

  var customList = document.getElementById('customTagsList');
  customList.addEventListener('click', function(e){
    var btn = e.target.closest('[data-customtag]');
    if(!btn) return;
    btn.remove();
  });

  document.getElementById('customTagInput').addEventListener('keydown', function(e){
    if(e.key==='Enter'){
      e.preventDefault();
      var val = e.target.value.trim();
      if(!val) return;
      var el = document.createElement('button');
      el.type='button'; el.className='tag-toggle active';
      el.setAttribute('data-customtag', val);
      el.textContent = '🏷️ ' + val + ' ✕';
      el.addEventListener('click', function(){ el.remove(); });
      document.getElementById('customTagsList').appendChild(el);
      e.target.value='';
    }
  });

  document.getElementById('delLeadBtn').addEventListener('click', function(){
    confirmDeleteLead(id, true);
  });
  document.getElementById('cancelLeadEdit').addEventListener('click', closeLeadModal);
  document.getElementById('saveLeadEdit').addEventListener('click', function(){ saveLeadEdits(id); });
}

function saveLeadEdits(id){
  var lead = leadsCache[id];
  if(!lead) return;
  var name = document.getElementById('edName').value.trim();
  var phone = document.getElementById('edPhone').value.trim();
  if(!name || !phone){ toast('Nome e WhatsApp são obrigatórios.'); return; }

  var changes = [];
  if(name !== lead.name) changes.push('nome atualizado');
  if(phone !== lead.phone) changes.push('WhatsApp atualizado');

  lead.name = name;
  lead.phone = phone;
  lead.origin = document.getElementById('edOrigin').value.trim();
  lead.responsible = getResponsibleToggleValue('edResponsibleToggleGrid');
  var qtyVal = document.getElementById('edQuantity').value;
  lead.quantity = qtyVal!=='' ? Number(qtyVal) : null;
  lead.product = document.getElementById('edProduct').value.trim();
  lead.sizeGrid = document.getElementById('edSizeGrid').value.trim();
  lead.fabric = document.getElementById('edFabric').value.trim();
  lead.color = document.getElementById('edColor').value.trim();
  lead.customization = document.getElementById('edCustomization').value;
  lead.hasLogo = document.getElementById('edHasLogo').value;
  var deadlineVal = document.getElementById('edDeadline').value;
  lead.desiredDeadline = deadlineVal || null;
  lead.notes = document.getElementById('edNotes').value.trim();

  var followEl = document.getElementById('edFollowUp');
  if(followEl) lead.nextFollowUpAt = followEl.value || null;

  var waitReasonEl = document.getElementById('edWaitReason');
  var lastMsgEl = document.getElementById('edLastMsg');
  if(waitReasonEl) lead.waitingReason = waitReasonEl.value.trim();
  if(lastMsgEl && lastMsgEl.value) lead.lastMessageAt = new Date(lastMsgEl.value).toISOString();

  var tags = [];
  Array.prototype.forEach.call(document.querySelectorAll('#tagToggleGrid [data-tag].active'), function(el){
    tags.push(el.getAttribute('data-tag'));
  });
  Array.prototype.forEach.call(document.querySelectorAll('#customTagsList [data-customtag]'), function(el){
    tags.push(el.getAttribute('data-customtag'));
  });
  lead.tags = tags;

  if(changes.length) pushHistory(lead, 'Dados atualizados: ' + changes.join(', '));
  else pushHistory(lead, 'Detalhes atualizados');

  persistLead(id, lead);
  toast('Alterações salvas.');
  closeLeadModal();
}

/* =========================================================
   DELETE CONFIRM
   ========================================================= */
var confirmOverlay = document.getElementById('confirmOverlay');
var confirmTargetId = null;
var confirmAlsoCloseLead = false;
function confirmDeleteLead(id, alsoCloseLeadModal){
  confirmTargetId = id;
  confirmAlsoCloseLead = !!alsoCloseLeadModal;
  var lead = leadsCache[id];
  document.getElementById('confirmTitle').textContent = 'Excluir cliente';
  document.getElementById('confirmBody').textContent = 'Tem certeza de que deseja excluir "'+ (lead?lead.name:'') +'"? Essa ação não pode ser desfeita.';
  confirmOverlay.classList.remove('hidden');
}
document.getElementById('confirmClose').addEventListener('click', function(){ confirmOverlay.classList.add('hidden'); });
document.getElementById('confirmCancel').addEventListener('click', function(){ confirmOverlay.classList.add('hidden'); });
confirmOverlay.addEventListener('click', function(e){ if(e.target===confirmOverlay) confirmOverlay.classList.add('hidden'); });
document.getElementById('confirmOk').addEventListener('click', function(){
  if(confirmTargetId){
    var name = leadsCache[confirmTargetId] ? leadsCache[confirmTargetId].name : '';
    removeLead(confirmTargetId);
    toast('Cliente excluído: ' + name);
  }
  confirmOverlay.classList.add('hidden');
  if(confirmAlsoCloseLead) closeLeadModal();
  confirmTargetId = null;
});

/* =========================================================
   SETTINGS MODAL
   ========================================================= */
var settingsOverlay = document.getElementById('settingsOverlay');
document.getElementById('settingsBtn').addEventListener('click', function(){
  document.getElementById('sThreshold').value = settingsCache.repassThreshold;
  document.getElementById('sContact').value = settingsCache.repassContact;
  document.getElementById('sT1').value = settingsCache.followUpWindows.t1;
  document.getElementById('sT2').value = settingsCache.followUpWindows.t2;
  document.getElementById('sT3').value = settingsCache.followUpWindows.t3;
  document.getElementById('sT4').value = settingsCache.followUpWindows.t4;
  settingsOverlay.classList.remove('hidden');
});
function closeSettings(){ settingsOverlay.classList.add('hidden'); }
document.getElementById('settingsClose').addEventListener('click', closeSettings);
document.getElementById('settingsCancel').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', function(e){ if(e.target===settingsOverlay) closeSettings(); });
document.getElementById('settingsSave').addEventListener('click', function(){
  var th = Number(document.getElementById('sThreshold').value) || DEFAULT_SETTINGS.repassThreshold;
  var t1 = Number(document.getElementById('sT1').value) || DEFAULT_SETTINGS.followUpWindows.t1;
  var t2 = Number(document.getElementById('sT2').value) || DEFAULT_SETTINGS.followUpWindows.t2;
  var t3 = Number(document.getElementById('sT3').value) || DEFAULT_SETTINGS.followUpWindows.t3;
  var t4 = Number(document.getElementById('sT4').value) || DEFAULT_SETTINGS.followUpWindows.t4;
  settingsCache = {
    repassThreshold: th,
    repassContact: document.getElementById('sContact').value.trim(),
    followUpWindows: { t1:t1, t2:t2, t3:t3, t4:t4 }
  };
  persistSettings();
  toast('Configurações salvas.');
  closeSettings();
});

/* =========================================================
   SEARCH
   ========================================================= */
var searchDebounce = null;
document.getElementById('searchInput').addEventListener('input', function(e){
  var val = e.target.value;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(function(){
    state.search = val.trim();
    scheduleRender();
  }, 150);
});

/* =========================================================
   LIVE TIME REFRESH (re-render badges periodically)
   ========================================================= */
setInterval(function(){
  if(leadsLoaded && settingsLoaded) scheduleRender();
}, 60000);

/* =========================================================
   LOGIN
   ========================================================= */
var loginStep = 1;
var loginEmailValue = '';

function showLoginError(msg){
  var el = document.getElementById('loginError');
  el.textContent = msg;
  el.style.display = '';
}
function hideLoginError(){
  document.getElementById('loginError').style.display = 'none';
}
function showApp(){
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('app').style.display = '';
}

async function handleLoginSubmit(){
  hideLoginError();
  var btn = document.getElementById('loginSubmit');
  if(loginStep === 1){
    var email = document.getElementById('loginEmail').value.trim();
    if(!email){ showLoginError('Digite seu e-mail.'); return; }
    btn.disabled = true; btn.textContent = 'Enviando…';
    try{
      await requestLoginCode(email);
      loginEmailValue = email;
      loginStep = 2;
      document.getElementById('loginEmailEcho').textContent = email;
      document.getElementById('loginStep1').style.display = 'none';
      document.getElementById('loginStep2').style.display = '';
      document.getElementById('loginBack').style.display = '';
      btn.textContent = 'Confirmar código';
      document.getElementById('loginCode').focus();
    }catch(e){
      showLoginError('Não foi possível enviar o código (e-mail não autorizado ou fora do ar).');
    }finally{
      btn.disabled = false;
    }
  } else {
    var code = document.getElementById('loginCode').value.trim();
    if(!code){ showLoginError('Digite o código recebido.'); return; }
    btn.disabled = true; btn.textContent = 'Confirmando…';
    try{
      await verifyLoginCode(loginEmailValue, code);
      showApp();
      initStore();
    }catch(e){
      showLoginError('Código inválido ou expirado.');
    }finally{
      btn.disabled = false;
      btn.textContent = 'Confirmar código';
    }
  }
}

document.getElementById('loginSubmit').addEventListener('click', handleLoginSubmit);
document.getElementById('loginBack').addEventListener('click', function(){
  loginStep = 1;
  document.getElementById('loginStep1').style.display = '';
  document.getElementById('loginStep2').style.display = 'none';
  document.getElementById('loginBack').style.display = 'none';
  document.getElementById('loginSubmit').textContent = 'Enviar código';
  hideLoginError();
});
document.getElementById('loginEmail').addEventListener('keydown', function(e){ if(e.key==='Enter') handleLoginSubmit(); });
document.getElementById('loginCode').addEventListener('keydown', function(e){ if(e.key==='Enter') handleLoginSubmit(); });
document.getElementById('logoutBtn').addEventListener('click', function(){
  if(confirm('Sair da conta?')) signOut();
});

/* =========================================================
   BOOT
   ========================================================= */
async function boot(){
  currentSession = loadStoredSession();
  var session = await ensureSession();
  if(session){
    showApp();
    initStore();
  }
  // se nao tem sessao valida, fica no login (ja visivel por padrao no HTML)
}
boot();

})();