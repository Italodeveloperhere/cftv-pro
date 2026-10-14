/* ============================================================
   CFTV — lógica da aplicação
   ============================================================ */
(function () {
'use strict';

var D = window.CFTV || {};
var LOCAL_JSON_URL = D.LOCAL_JSON_URL || 'cameras.json';
var LOCAL_SAVE_URL = D.LOCAL_SAVE_URL || '/salvar';
var FALLBACK_KEY   = D.FALLBACK_KEY || 'cftv_fallback';
var TOTAL_CAMERAS  = D.TOTAL_CAMERAS || 250;
var TOTAL_OFF      = D.TOTAL_OFF || 78;
var GRAVADORES     = D.GRAVADORES || [];
var EQUIPAMENTOS   = D.EQUIPAMENTOS || [];
var ORDEM_LOCAIS   = D.ORDEM_LOCAIS || [];
var MANUAIS        = D.MANUAIS || [];
var NOMES_IP       = D.NOMES_IP || [];
var NOMES_ANALOG   = D.NOMES_ANALOG || [];
var MAPA_REAL      = D.MAPA_REAL || {};
var SWITCHES       = D.SWITCHES || [];
var CREDENCIAIS    = D.CREDENCIAIS || [];
var EQUIPAMENTOS_REDE = D.EQUIPAMENTOS_REDE || [];

var cameras = [];
var filter = 'all';
var search = '';
var floorFilter = 'all';
var legendFilters = {ip:false, analog:false, online:false, offline:false};
var gravFilter = 'all';
var gravSearch = '';
var syncing = false;
var lastSyncTime = null;
var gravExpanded = JSON.parse(localStorage.getItem('cftv_grav_expanded') || '{}');
var manualOpen = null;
var manualSlide = 0;
var manualChk = {};

/* ---------- SYNC ---------- */
function setSyncStatus(s){
  var el = document.getElementById('syncStatus');
  if(!el) return;
  var dot = el.querySelector('.pulse-dot');
  dot.classList.remove('syncing','error');
  if(s === 'syncing') dot.classList.add('syncing');
  else if(s === 'error') dot.classList.add('error');
}

async function carregarDoServidor(){
  setSyncStatus('syncing');
  document.getElementById('syncInfo').textContent = '🔄 Carregando...';
  var carregado = false;

  if(location.protocol !== 'file:'){
    try {
      var res = await fetch(LOCAL_JSON_URL + '?t=' + Date.now());
      if(res.ok){
        var data = await res.json();
        if(Array.isArray(data) && data.length > 0){ cameras = data; carregado = true; }
      }
    } catch(e){ console.warn('fetch falhou:', e); }
  }

  if(!carregado){
    try {
      var s = localStorage.getItem(FALLBACK_KEY);
      if(s){
        var arr = JSON.parse(s);
        if(Array.isArray(arr) && arr.length > 0){ cameras = arr; carregado = true; }
      }
    } catch(e){}
  }

  if(!carregado){ cameras = buildInitial(); salvarLocal(); }

  lastSyncTime = new Date();
  setSyncStatus('ok');
  document.getElementById('syncInfo').textContent = location.protocol === 'file:'
    ? '💾 Modo local — ' + cameras.length + ' câmeras'
    : '✅ Carregado (' + lastSyncTime.toLocaleTimeString('pt-BR') + ')';
}

async function salvarNoServidor(){
  if(syncing) return;
  syncing = true;
  salvarLocal();

  if(location.protocol === 'file:'){
    document.getElementById('syncInfo').textContent = '💾 Salvo localmente (' + new Date().toLocaleTimeString('pt-BR') + ')';
    syncing = false;
    return;
  }

  setSyncStatus('syncing');
  try {
    var res = await fetch(LOCAL_SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cameras)
    });
    if(!res.ok) throw new Error('Servidor ' + res.status);
    lastSyncTime = new Date();
    setSyncStatus('ok');
    document.getElementById('syncInfo').textContent = '💾 Salvo em cameras.json (' + lastSyncTime.toLocaleTimeString('pt-BR') + ')';
  } catch(e){
    setSyncStatus('error');
    document.getElementById('syncInfo').textContent = '⚠️ Erro: ' + e.message;
  } finally { syncing = false; }
}

function salvarLocal(){ try{ localStorage.setItem(FALLBACK_KEY, JSON.stringify(cameras)); }catch(e){} }

async function sincronizarManual(){
  toast('Recarregando...', 'info');
  await carregarDoServidor();
  enriquecerComMapaReal();
  render();
}

/* ---------- BUILD ---------- */
function buildInitial(){
  var total = TOTAL_CAMERAS || 250;
  var off = TOTAL_OFF || 78;
  var now = Date.now();
  var cams = [], id = 1;

  (NOMES_IP || []).forEach(function(item, i){
    cams.push({
      id:id++, n:item[0], ip:'192.168.1.' + (20 + i), t:'IP', s:'ok',
      p:item[1], mod:'ONVIF', local:item[2], statusSince:now
    });
  });
  (NOMES_ANALOG || []).forEach(function(item){
    cams.push({
      id:id++, n:item[0], ip:'', t:'Analogica', s:'ok',
      p:item[1], mod:'', local:item[2], statusSince:now
    });
  });
  while(cams.length < total){
    var idx = cams.length + 1;
    var piso = ['C','M','L','G','T'][idx % 5];
    cams.push({
      id:id++, n:'Câmera Extra ' + idx, ip:'192.168.1.' + (200 + (idx % 50)),
      t: idx % 3 === 0 ? 'Analogica' : 'IP', s:'ok', p:piso,
      mod: idx % 3 === 0 ? '' : 'ONVIF',
      local: piso === 'C' ? 'Piso C' : piso === 'L' ? 'Sala de Segurança' : 'Shaft 1º Andar',
      statusSince: now
    });
  }
  if(cams.length > total) cams.length = total;

  var shuffled = cams.slice().sort(function(){ return Math.random() - 0.5; });
  shuffled.slice(0, Math.min(off, cams.length)).forEach(function(c){
    var idx = cams.findIndex(function(x){ return x.id === c.id; });
    if(idx >= 0){ cams[idx].s = 'Parada'; cams[idx].statusSince = now - (Math.random() * 72 + 1) * 3600000; }
  });
  return cams;
}

/* ---------- HELPERS ---------- */
function timeAgo(ts){
  if(!ts) return '';
  var d = Date.now() - ts, m = Math.floor(d/60000), h = Math.floor(m/60), dy = Math.floor(h/24);
  if(dy > 0) return 'há ' + dy + 'd ' + (h % 24) + 'h';
  if(h > 0) return 'há ' + h + 'h ' + (m % 60) + 'min';
  if(m > 0) return 'há ' + m + 'min';
  return 'agora';
}
function fmtDT(ts){ if(!ts) return '—'; return new Date(ts).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}); }
function durH(ts){ return ts ? (Date.now() - ts) / 3600000 : 0; }
function escapeHtml(s){
  return s == null ? '' : String(s).replace(/[&<>"']/g, function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}
function normalizeStr(s){ return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_\-\.]/g,''); }
function toast(msg, type){
  type = type || 'success';
  var el = document.getElementById('toast');
  el.textContent = (type === 'success' ? '✅ ' : type === 'error' ? '🔴 ' : 'ℹ️ ') + msg;
  el.className = 'toast show' + (type !== 'success' ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.className = 'toast'; }, 2500);
}

/* ---------- ENRIQUECER COM MAPA REAL ---------- */
function enriquecerComMapaReal(){
  cameras.forEach(function(c){
    var key = normalizeStr(c.n).replace(/\s+/g, ' ').trim();
    var ref = MAPA_REAL[key];
    if(!ref) return;
    if(!c.ip && ref.ip) c.ip = ref.ip;
    if(!c.mac) c.mac = ref.mac || '';
    if(!c.modelo) c.modelo = ref.modelo || '';
    if(!c.camNum) c.camNum = ref.camNum || '';
  });
}

/* ---------- AÇÕES ---------- */
function toggleCamera(id){
  var cam = cameras.find(function(c){ return c.id === id; });
  if(!cam) return;
  cam.s = cam.s.toLowerCase() === 'ok' ? 'Parada' : 'ok';
  cam.statusSince = Date.now();
  render();
  salvarNoServidor();
  toast(cam.n + ' → ' + (cam.s === 'ok' ? 'Ligada' : 'Desligada'), cam.s === 'ok' ? 'success' : 'error');
}
function toggleLegend(key){
  legendFilters[key] = !legendFilters[key];
  document.querySelector('[data-legend="' + key + '"]').classList.toggle('active', legendFilters[key]);
  render();
}
function setFilter(f){
  filter = f;
  document.querySelectorAll('[data-filter]').forEach(function(b){ b.classList.toggle('active', b.dataset.filter === f); });
  render();
}
function setGravFilter(f){
  gravFilter = f;
  document.querySelectorAll('[data-grav-filter]').forEach(function(b){ b.classList.toggle('active', b.dataset.gravFilter === f); });
  renderGravadores();
}
function setTab(t){
  document.querySelectorAll('.tab').forEach(function(b){ b.classList.toggle('active', b.dataset.tab === t); });
  ['cameras','gravadores','equipamentos','auditoria','topologia','manual','rede'].forEach(function(name){
    var el = document.getElementById('tab-' + name + '-content');
    if(el) el.style.display = (name === t) ? 'block' : 'none';
  });
  if(t === 'topologia') renderTopologia();
  if(t === 'manual') renderManual();
  if(t === 'rede') renderRede();
}
function resetar(){
  if(!confirm('Restaurar dados com ' + TOTAL_CAMERAS + ' câmeras (' + TOTAL_OFF + ' off-line)?')) return;
  cameras = buildInitial();
  enriquecerComMapaReal();
  render();
  salvarNoServidor();
  toast('Dados restaurados!');
}
function exportarCSV(){
  var headers = ['ID','Nome','Tipo','Status','Piso','IP','MAC','Modelo','Nº Câmera','Local','Desde'];
  var rows = cameras.map(function(c){
    return [c.id, '"' + c.n + '"', c.t, c.s, c.p || '', c.ip || '', c.mac || '', c.modelo || '', c.camNum || '', c.local || '',
            c.s.toLowerCase() === 'ok' ? '' : fmtDT(c.statusSince)].join(',');
  });
  var csv = [headers.join(',')].concat(rows).join('\n');
  var blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cftv_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  toast('CSV exportado!');
}

/* ---------- AUDITORIA ---------- */
function auditar(){
  var dupIP = {}, nomes = {}, semIP = [], semPiso = [], semLocal = [], ipsInv = [];
  cameras.forEach(function(c){
    if(c.ip && c.ip.trim()){
      if(!dupIP[c.ip]) dupIP[c.ip] = [];
      dupIP[c.ip].push(c);
      if(!/^192\.168\.\d{1,3}\.\d{1,3}$/.test(c.ip)) ipsInv.push(c);
    } else semIP.push(c);
    var nm = normalizeStr(c.n);
    if(!nomes[nm]) nomes[nm] = [];
    nomes[nm].push(c);
    if(!c.p || !c.p.trim()) semPiso.push(c);
    if(!c.local || !c.local.trim()) semLocal.push(c);
  });
  var ipsDup = Object.entries(dupIP).filter(function(e){ return e[1].length > 1; });
  var nomesDup = Object.entries(nomes).filter(function(e){ return e[1].length > 1; });
  return {
    ipsDuplicados: ipsDup, nomesDuplicados: nomesDup,
    semIP: semIP, semPiso: semPiso, semLocal: semLocal, ipsInvalidos: ipsInv,
    totalProblemas: ipsDup.length + nomesDup.length + semIP.length + semPiso.length + semLocal.length + ipsInv.length
  };
}

/* ---------- FILTROS ---------- */
function getFiltered(){
  return cameras.filter(function(c){
    if(filter === 'offline' && c.s.toLowerCase() !== 'parada') return false;
    if(filter === 'online' && c.s.toLowerCase() !== 'ok') return false;
    if(floorFilter !== 'all' && (c.p || 'Sem piso') !== floorFilter) return false;
    if(search){
      var q = search.toLowerCase();
      if(c.n.toLowerCase().indexOf(q) < 0 && (c.ip || '').indexOf(q) < 0 &&
         (c.mod || '').toLowerCase().indexOf(q) < 0 && (c.local || '').toLowerCase().indexOf(q) < 0 &&
         (c.mac || '').toLowerCase().indexOf(q) < 0) return false;
    }
    var la = Object.keys(legendFilters).filter(function(k){ return legendFilters[k]; });
    if(la.length > 0){
      var m = false;
      if(legendFilters.ip && c.t === 'IP') m = true;
      if(legendFilters.analog && c.t === 'Analogica') m = true;
      if(legendFilters.online && c.s.toLowerCase() === 'ok') m = true;
      if(legendFilters.offline && c.s.toLowerCase() === 'parada') m = true;
      if(!m) return false;
    }
    return true;
  });
}

/* ---------- RENDER GRAVADORES ---------- */
function renderGravadores(){
  var grid = document.getElementById('gravGrid');
  var camMap = {};
  cameras.forEach(function(c){ camMap[c.n.toLowerCase()] = c; });

  var gravs = GRAVADORES.slice();
  if(gravFilter !== 'all') gravs = gravs.filter(function(g){ return g.tipo.toLowerCase() === gravFilter; });
  if(gravSearch){
    var q = gravSearch.toLowerCase();
    gravs = gravs.filter(function(g){
      return g.nome.toLowerCase().indexOf(q) >= 0 || g.ip.toLowerCase().indexOf(q) >= 0 ||
             g.cameras.some(function(cn){ return cn.toLowerCase().indexOf(q) >= 0; });
    });
  }
  if(gravs.length === 0){
    grid.innerHTML = '<div class="grav-empty" style="grid-column:1/-1">Nenhum gravador encontrado</div>';
    return;
  }
  var forceExpand = gravSearch.trim().length > 0;

  grid.innerHTML = gravs.map(function(g){
    var on = 0, off = 0;
    var camList = g.cameras.map(function(nome, idx){
      var cam = camMap[nome.toLowerCase()];
      var isOn = cam ? cam.s.toLowerCase() === 'ok' : false;
      if(cam){ if(isOn) on++; else off++; }
      return { ch: idx + 1, nome: nome, cam: cam, isOn: isOn };
    });
    var tipoClass = g.tipo.toLowerCase();
    var isExpanded = forceExpand || gravExpanded[g.id] === true;
    var iconFa = g.tipo === 'NVR' ? 'fa-hdd' : g.tipo === 'DVR' ? 'fa-video' : 'fa-server';
    return '<div class="grav-card ' + (isExpanded ? 'expanded' : '') + '" data-grav-id="' + g.id + '">' +
      '<div class="grav-header ' + tipoClass + '" onclick="toggleGravCard(\'' + g.id + '\')">' +
        '<div>' +
          '<div class="grav-title"><i class="fas ' + iconFa + '"></i> ' + escapeHtml(g.nome) + ' <span class="badge ' + tipoClass + '">' + g.tipo + '</span></div>' +
          '<div class="grav-subtitle"><span>📦 ' + escapeHtml(g.modelo) + '</span><span>🌐 <code>' + escapeHtml(g.ip) + '</code> • 📍 ' + escapeHtml(g.local) + '</span></div>' +
        '</div>' +
        '<i class="fas fa-chevron-down grav-chevron"></i>' +
      '</div>' +
      '<div class="grav-stats" onclick="toggleGravCard(\'' + g.id + '\')">' +
        '<div class="grav-stat"><div class="num">' + g.canais + '</div><div class="lbl">Canais</div></div>' +
        '<div class="grav-stat ok"><div class="num">' + on + '</div><div class="lbl">Online</div></div>' +
        '<div class="grav-stat bad"><div class="num">' + off + '</div><div class="lbl">Off-line</div></div>' +
      '</div>' +
      '<div class="grav-cams">' +
        camList.map(function(c){
          var status = c.cam
            ? (c.isOn ? '<span class="status on">● Online</span>' : '<span class="status off">● Off-line</span>')
            : '<span class="status virtual">— Não catalogada</span>';
          return '<div class="grav-cam ' + (c.cam && !c.isOn ? 'off' : '') + '">' +
            '<span class="ch">CH' + String(c.ch).padStart(2,'0') + '</span>' +
            '<span class="name">' + escapeHtml(c.nome) + '</span>' +
            '<span class="ip">' + (c.cam && c.cam.ip ? escapeHtml(c.cam.ip) : '—') + '</span>' +
            status +
          '</div>';
        }).join('') +
        '<div class="grav-hint">👆 Clique no cabeçalho para recolher</div>' +
      '</div>' +
    '</div>';
  }).join('');

  document.getElementById('tab-grav-count').textContent = GRAVADORES.length;
}
function toggleGravCard(gravId){
  var card = document.querySelector('.grav-card[data-grav-id="' + gravId + '"]');
  if(!card) return;
  var isExp = card.classList.contains('expanded');
  if(isExp){ card.classList.remove('expanded'); gravExpanded[gravId] = false; }
  else { card.classList.add('expanded'); gravExpanded[gravId] = true; }
  try{ localStorage.setItem('cftv_grav_expanded', JSON.stringify(gravExpanded)); }catch(e){}
}

/* ============================================================
   TOPOLOGIA — mapa físico em 2.5D
   ============================================================ */
function renderTopologia(){
  var host = document.getElementById('topoHost');
  if(!GRAVADORES.length){
    host.innerHTML = '<div class="empty">Sem gravadores cadastrados</div>';
    return;
  }

  var camMap = {};
  cameras.forEach(function(c){ camMap[c.n.toLowerCase()] = c; });

  var branches = [], locaisUnicos = {}, totalAloc = 0;

  GRAVADORES.forEach(function(g){
    var cams = g.cameras.map(function(nome){ return camMap[nome.toLowerCase()]; }).filter(Boolean);
    if(!cams.length) return;

    var porLocal = {};
    cams.forEach(function(c){
      var loc = c.local || '—';
      if(!porLocal[loc]) porLocal[loc] = [];
      porLocal[loc].push(c);
      locaisUnicos[loc] = 1;
    });

    var arr = Object.keys(porLocal).map(function(loc){
      var lista = porLocal[loc].slice().sort(function(a,b){ return (a.n||'').localeCompare(b.n||'','pt-BR'); });
      var on = lista.filter(function(c){ return c.s.toLowerCase() === 'ok'; }).length;
      return { loc: loc, cams: lista, total: lista.length, on: on, off: lista.length - on };
    }).sort(function(a,b){ return b.total - a.total || a.loc.localeCompare(b.loc,'pt-BR'); });

    branches.push({ g: g, cams: cams, porLocal: arr });
    totalAloc += cams.length;
  });
  branches.sort(function(a,b){ return b.cams.length - a.cams.length; });

  var andarDe = function(local){
    if(local === 'Central de Segurança' || local === 'Sala TI' || local === 'Sala da Diretoria' ||
       local === 'Sala da Gerência' || local === 'Portaria de Serviço') return 'Térreo — Operação';
    if(local === 'Sala Rio de Janeiro') return 'Piso C — Salas';
    if(local === 'Shaft 1º Andar') return 'Shaft 1º — Andares';
    if(local === 'Shaft 10º Andar') return 'Shaft 10º — Andares';
    if(local === '3SUB2') return 'Subsolo';
    if(/^10º/.test(local)) return '10º Andar';
    if(/^13º/.test(local)) return '13º Andar';
    if(/^16º/.test(local)) return '16º Andar';
    if(/^15º/.test(local)) return '15º Andar';
    if(/^S3/.test(local)) return 'Piso S3 — Lazer';
    if(/^S2/.test(local)) return 'Piso S2 — Lazer';
    if(/^Piso L|^L_|^L /.test(local)) return 'Piso L — Lazer';
    if(/^Piso C|^C |^C1|^C_|^C /.test(local)) return 'Piso C — Eventos';
    if(/^Piso M|^M /.test(local)) return 'Piso M — Mezanino';
    if(/^G /.test(local)) return 'Piso G — Golden';
    return 'Outros';
  };

  var ordemAndares = [
    '16º Andar','15º Andar','13º Andar','10º Andar',
    'Shaft 10º — Andares','Shaft 1º — Andares',
    'Piso C — Eventos','Piso G — Golden','Piso M — Mezanino',
    'Piso S3 — Lazer','Piso S2 — Lazer','Piso L — Lazer',
    'Térreo — Operação','Piso C — Salas','Subsolo','Outros'
  ];

  var locais = Object.keys(locaisUnicos);
  var porAndar = {};
  locais.forEach(function(l){
    var a = andarDe(l);
    if(!porAndar[a]) porAndar[a] = [];
    porAndar[a].push(l);
  });

  var semGrav = cameras.filter(function(c){
    return !GRAVADORES.some(function(g){
      return g.cameras.some(function(cn){ return cn.toLowerCase() === c.n.toLowerCase(); });
    });
  });

  var h = '';
  h += '<div class="topo-summary">' +
    '<div class="topo-sum-item"><div class="topo-sum-ic"><i class="fas fa-hdd"></i></div><div><b>' + branches.length + '</b><span>gravador(es)</span></div></div>' +
    '<div class="topo-sum-item"><div class="topo-sum-ic cyan"><i class="fas fa-map-marker-alt"></i></div><div><b>' + locais.length + '</b><span>local(is) físico(s)</span></div></div>' +
    '<div class="topo-sum-item"><div class="topo-sum-ic ok"><i class="fas fa-video"></i></div><div><b>' + totalAloc + '</b><span>câmera(s) alocada(s)</span></div></div>' +
    (semGrav.length ? '<div class="topo-sum-item warn"><div class="topo-sum-ic warn"><i class="fas fa-exclamation-triangle"></i></div><div><b>' + semGrav.length + '</b><span>sem gravador</span></div></div>' : '') +
  '</div>';

  var cores = ['#3b82f6','#8b5cf6','#ec4899','#22d3ee','#f59e0b','#10b981','#f472b6','#06b6d4','#f97316','#a855f7','#0ea5e9'];
  var corDe = {};
  branches.forEach(function(b, i){ corDe[b.g.id] = cores[i % cores.length]; });

  h += '<div class="mapa-legend">';
  branches.forEach(function(b){
    var cor = corDe[b.g.id];
    h += '<div class="mapa-legend-item" data-grav="' + b.g.id + '" style="--cor:' + cor + '">' +
      '<span class="mapa-legend-dot"></span>' +
      '<span class="mapa-legend-nome">' + escapeHtml(b.g.nome) + '</span>' +
      '<span class="mapa-legend-cnt">' + b.cams.length + '</span>' +
    '</div>';
  });
  if(semGrav.length){
    h += '<div class="mapa-legend-item sem-grav" data-grav="none" style="--cor:#f59e0b">' +
      '<span class="mapa-legend-dot"></span>' +
      '<span class="mapa-legend-nome">Sem gravador</span>' +
      '<span class="mapa-legend-cnt">' + semGrav.length + '</span>' +
    '</div>';
  }
  h += '</div>';

  h += '<div class="mapa-wrap" id="mapaWrap">';
  ordemAndares.forEach(function(andar){
    var ls = porAndar[andar];
    if(!ls || !ls.length) return;

    h += '<div class="mapa-andar">' +
      '<div class="mapa-andar-label"><span>' + escapeHtml(andar) + '</span></div>' +
      '<div class="mapa-andar-corpo">';

    ls.sort().forEach(function(loc){
      var gravs = [];
      var camsLocais = [];
      branches.forEach(function(b){
        var it = b.porLocal.filter(function(x){ return x.loc === loc; })[0];
        if(it){
          gravs.push({ g: b.g, qtd: it.total, on: it.on, off: it.off, cor: corDe[b.g.id] });
          it.cams.forEach(function(c){ camsLocais.push({ c: c, cor: corDe[b.g.id] }); });
        }
      });
      var total = camsLocais.length;
      var on = camsLocais.filter(function(x){ return x.c.s.toLowerCase() === 'ok'; }).length;
      var off = total - on;

      h += '<div class="mapa-local" data-local="' + escapeHtml(loc) + '">' +
        '<div class="mapa-local-head">' +
          '<span class="mapa-local-name">' + escapeHtml(loc) + '</span>' +
          '<span class="mapa-local-badges">' +
            '<span class="mapa-badge">' + total + ' cam.</span>' +
            (off ? '<span class="mapa-badge bad">' + off + ' off</span>' : '<span class="mapa-badge ok">' + on + ' on</span>') +
          '</span>' +
        '</div>' +
        '<div class="mapa-local-gravs">' + gravs.map(function(g){
          return '<span class="mapa-local-grav-dot" style="--cor:' + g.cor + '" title="' + escapeHtml(g.g.nome) + '"></span>';
        }).join('') + '</div>' +
        '<div class="mapa-local-cams">' + camsLocais.slice(0, 12).map(function(x){
          var onC = x.c.s.toLowerCase() === 'ok';
          return '<span class="mapa-cam-dot' + (onC ? '' : ' off') + '" style="--cor:' + x.cor + '" title="' + escapeHtml(x.c.n) + '"></span>';
        }).join('') +
        (camsLocais.length > 12 ? '<span class="mapa-cam-more">+' + (camsLocais.length - 12) + '</span>' : '') +
        '</div>' +
      '</div>';
    });

    h += '</div></div>';
  });

  if(semGrav.length){
    h += '<div class="mapa-andar mapa-andar-warn">' +
      '<div class="mapa-andar-label"><span>Sem gravador vinculado</span></div>' +
      '<div class="mapa-andar-corpo">' +
        '<div class="mapa-local">' +
          '<div class="mapa-local-head">' +
            '<span class="mapa-local-name">' + semGrav.length + ' câmera(s)</span>' +
          '</div>' +
          '<div class="mapa-local-cams">' + semGrav.slice(0, 30).map(function(c){
            var onC = c.s.toLowerCase() === 'ok';
            return '<span class="mapa-cam-dot' + (onC ? '' : ' off') + '" style="--cor:#f59e0b" title="' + escapeHtml(c.n) + '"></span>';
          }).join('') +
          (semGrav.length > 30 ? '<span class="mapa-cam-more">+' + (semGrav.length - 30) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  h += '</div>';

  host.innerHTML = h;

  document.querySelectorAll('.mapa-legend-item').forEach(function(el){
    el.onclick = function(){
      var id = el.dataset.grav;
      var wrap = document.getElementById('mapaWrap');
      var jaAtivo = el.classList.contains('on');

      document.querySelectorAll('.mapa-legend-item').forEach(function(x){ x.classList.remove('on'); });
      wrap.classList.remove('dim');
      document.querySelectorAll('.mapa-local').forEach(function(l){
        l.classList.remove('hot','cold');
      });

      if(jaAtivo){ return; }

      el.classList.add('on');
      wrap.classList.add('dim');

      var locaisDoGrav = {};
      var ref = branches.filter(function(b){ return b.g.id === id; })[0];
      if(ref){ ref.porLocal.forEach(function(it){ locaisDoGrav[it.loc] = true; }); }
      if(id === 'none'){ semGrav.forEach(function(c){ locaisDoGrav[c.local || '—'] = true; }); }

      document.querySelectorAll('.mapa-local').forEach(function(l){
        var nome = l.dataset.local;
        if(locaisDoGrav[nome]) l.classList.add('hot');
        else l.classList.add('cold');
      });
    };
  });
}

/* ============================================================
   REDE — switches, IPs, credenciais
   ============================================================ */
function renderRede(){
  var host = document.getElementById('redeHost');
  var h = '';

  h += '<div class="topo-summary">' +
    '<div class="topo-sum-item"><div class="topo-sum-ic"><i class="fas fa-network-wired"></i></div><div><b>' + SWITCHES.length + '</b><span>switches</span></div></div>' +
    '<div class="topo-sum-item"><div class="topo-sum-ic cyan"><i class="fas fa-server"></i></div><div><b>' + EQUIPAMENTOS_REDE.length + '</b><span>equip. de rede</span></div></div>' +
    '<div class="topo-sum-item"><div class="topo-sum-ic ok"><i class="fas fa-key"></i></div><div><b>' + CREDENCIAIS.length + '</b><span>credenciais</span></div></div>' +
  '</div>';

  h += '<div class="sect-head"><h2>🔀 Switches gerenciáveis</h2>' +
       '<span class="hint">' + SWITCHES.length + ' equipamentos</span></div>';
  h += '<div class="grav-grid">';
  SWITCHES.forEach(function(s){
    h += '<div class="grav-card">' +
      '<div class="grav-header srv" style="cursor:default">' +
        '<div>' +
          '<div class="grav-title"><i class="fas fa-network-wired"></i> ' + escapeHtml(s.nome) + '</div>' +
          '<div class="grav-subtitle"><span>🌐 <code>' + escapeHtml(s.ip) + '</code></span>' +
          '<span>📍 ' + escapeHtml(s.local) + ' • ' + s.portas + ' portas</span></div>' +
        '</div>' +
      '</div>' +
      '<div style="padding:12px 20px;font-size:.78rem;color:var(--txt-3)">' +
        '<div style="margin-bottom:4px"><b>Modelo:</b> ' + escapeHtml(s.modelo) + '</div>' +
        (s.mac ? '<div style="margin-bottom:4px"><b>MAC:</b> <span style="font-family:monospace">' + escapeHtml(s.mac) + '</span></div>' : '') +
        '<div><b>Login:</b> ' + escapeHtml(s.user) + ' / ' + escapeHtml(s.pass) + '</div>' +
      '</div>' +
    '</div>';
  });
  h += '</div>';

  h += '<div class="sect-head" style="margin-top:24px"><h2>🖥️ Equipamentos de rede</h2>' +
       '<span class="hint">' + EQUIPAMENTOS_REDE.length + ' itens</span></div>';
  h += '<div class="table-box"><div class="table-scroll"><table><thead><tr>' +
    '<th>Tipo</th><th>Nome</th><th>IP</th><th>MAC</th><th>Local</th><th>Observação</th>' +
    '</tr></thead><tbody>';
  EQUIPAMENTOS_REDE.forEach(function(e){
    h += '<tr>' +
      '<td><span class="badge ' + (e.tipo === 'DVR' ? 'dvr' : e.tipo === 'NVR' ? 'nvr' : e.tipo === 'SRV' ? 'srv' : 'ip') + '">' + escapeHtml(e.tipo) + '</span></td>' +
      '<td class="strong">' + escapeHtml(e.nome) + '</td>' +
      '<td class="mono">' + escapeHtml(e.ip || '—') + '</td>' +
      '<td class="mono" style="font-size:.7rem">' + escapeHtml(e.mac || '—') + '</td>' +
      '<td class="info-cell">' + escapeHtml(e.local) + '</td>' +
      '<td class="info-cell">' + escapeHtml(e.obs || '—') + '</td>' +
    '</tr>';
  });
  h += '</tbody></table></div></div>';

  h += '<div class="sect-head" style="margin-top:24px"><h2>🔑 Credenciais</h2>' +
       '<span class="hint">clique em Mostrar para revelar</span></div>';
  h += '<div class="grav-grid">';
  CREDENCIAIS.forEach(function(c, i){
    h += '<div class="grav-card">' +
      '<div class="grav-header srv" style="cursor:default">' +
        '<div><div class="grav-title"><i class="fas fa-key"></i> ' + escapeHtml(c.alvo) + '</div>' +
        '<div class="grav-subtitle"><span>📍 ' + escapeHtml(c.local) + '</span></div></div>' +
      '</div>' +
      '<div style="padding:12px 20px;font-size:.78rem">' +
        '<div style="margin-bottom:6px"><b>Usuário:</b> <span style="font-family:monospace">' + escapeHtml(c.user) + '</span></div>' +
        '<div style="margin-bottom:8px"><b>Senha:</b> <span id="pass-' + i + '" style="font-family:monospace">•••••••</span>' +
          ' <button class="btn small" onclick="mostrarSenha(' + i + ')">Mostrar</button>' +
        '</div>' +
        (c.obs ? '<div style="color:var(--txt-3)">' + escapeHtml(c.obs) + '</div>' : '') +
      '</div>' +
    '</div>';
  });
  h += '</div>';

  host.innerHTML = h;
}
function mostrarSenha(i){
  var c = CREDENCIAIS[i];
  if(!c) return;
  var el = document.getElementById('pass-' + i);
  if(el) el.textContent = c.pass;
}

/* ---------- MANUAL ---------- */
function renderManual(){
  var host = document.getElementById('manualHost');
  if(manualOpen){
    var m = MANUAIS.find(function(x){ return x.id === manualOpen; });
    if(m){ host.innerHTML = renderManualCarrossel(m); return; }
    manualOpen = null;
  }
  host.innerHTML = renderManualLista();
}
function renderManualLista(){
  var h = '<div class="kpis">' +
    '<div class="kpi purple"><div class="kpi-label">Manuais</div><div class="kpi-value">' + MANUAIS.length + '</div><small>disponíveis</small></div>' +
    '<div class="kpi blue"><div class="kpi-label">Passos</div><div class="kpi-value">' + MANUAIS.reduce(function(a,m){ return a + m.passos.length; }, 0) + '</div><small>no total</small></div>' +
    '<div class="kpi green"><div class="kpi-label">Concluídos</div><div class="kpi-value">' + MANUAIS.filter(function(m){ return progressoManual(m) === 100; }).length + '</div><small>finalizados</small></div>' +
  '</div><div class="manual-grid" style="margin-top:16px">';
  MANUAIS.forEach(function(m){
    var pct = progressoManual(m);
    var feitos = m.passos.filter(function(_, i){ return manualChk[m.id + '|' + i]; }).length;
    h += '<button class="manual-card" onclick="openManual(\'' + m.id + '\')">' +
      '<div class="manual-card-ic"><i class="fas fa-key"></i></div>' +
      '<div class="manual-card-body">' +
        '<div class="manual-card-tag">' + escapeHtml(m.categoria) + '</div>' +
        '<div class="manual-card-t">' + escapeHtml(m.titulo) + '</div>' +
        '<div class="manual-card-d">' + escapeHtml(m.descricao) + '</div>' +
        '<div class="manual-card-progress">' +
          '<div style="flex:1;height:6px;border-radius:5px;background:rgba(100,116,139,.2);overflow:hidden"><i style="display:block;height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);width:' + pct + '%"></i></div>' +
          '<small>' + feitos + '/' + m.passos.length + '</small>' +
        '</div>' +
      '</div>' +
    '</button>';
  });
  h += '</div>';
  return h;
}
function renderManualCarrossel(m){
  var total = m.passos.length;
  var idx = Math.max(0, Math.min(manualSlide, total - 1));
  var p = m.passos[idx];
  var pct = Math.round(((idx + 1) / total) * 100);

  var h = '<div class="carousel-top"><button class="btn small" onclick="closeManual()">✕ Voltar</button>' +
    '<div class="carousel-top-info"><span class="carousel-tag">' + escapeHtml(m.categoria) + '</span><span class="carousel-title">' + escapeHtml(m.titulo) + '</span></div></div>';
  h += '<div class="carousel-progress"><div class="carousel-progress-bar"><i style="width:' + pct + '%"></i></div>' +
    '<span class="carousel-progress-label">Passo ' + (idx + 1) + ' de ' + total + '</span></div>';
  h += '<div class="carousel"><div class="carousel-photo">';
  if(p.img){
    h += '<button class="carousel-img" onclick="zoomImg(\'' + escapeHtml(p.img) + '\', \'' + escapeHtml(p.titulo) + '\')">' +
      '<img src="' + escapeHtml(p.img) + '" alt="' + escapeHtml(p.titulo) + '" onerror="this.parentNode.classList.add(\'noimg\')">' +
      '<span class="carousel-img-hint"><i class="fas fa-search-plus"></i> Ampliar</span></button>';
  } else { h += '<div class="carousel-img noimg"></div>'; }
  h += '<div class="carousel-photo-badge">' + (idx + 1) + '/' + total + '</div></div>';
  h += '<div class="carousel-caption"><div class="carousel-caption-head"><span class="carousel-caption-num">' + (idx + 1) + '</span><h3>' + escapeHtml(p.titulo) + '</h3></div>' +
    '<p>' + escapeHtml(p.desc) + '</p></div>';
  h += '<div class="carousel-nav">' +
    '<button class="carousel-btn"' + (idx === 0 ? ' disabled' : '') + ' onclick="slideManual(' + (idx - 1) + ')"><i class="fas fa-chevron-left"></i> Anterior</button>' +
    '<div class="carousel-dots">' + m.passos.map(function(_, i){
      var cls = i === idx ? ' on' : (i < idx ? ' seen' : '');
      return '<button class="carousel-dot' + cls + '" onclick="slideManual(' + i + ')"></button>';
    }).join('') + '</div>' +
    (idx < total - 1
      ? '<button class="carousel-btn primary" onclick="slideManual(' + (idx + 1) + ')">Próximo <i class="fas fa-chevron-right"></i></button>'
      : '<button class="carousel-btn ok" onclick="finishManual()"><i class="fas fa-check"></i> Concluir</button>') +
    '</div></div>';
  return h;
}
function openManual(id){ manualOpen = id; manualSlide = 0; renderManual(); }
function closeManual(){ manualOpen = null; manualSlide = 0; renderManual(); }
function slideManual(i){
  var m = MANUAIS.find(function(x){ return x.id === manualOpen; });
  if(!m || i < 0 || i >= m.passos.length) return;
  manualChk[m.id + '|' + manualSlide] = true;
  manualSlide = i;
  renderManual();
}
function finishManual(){
  var m = MANUAIS.find(function(x){ return x.id === manualOpen; });
  if(!m) return;
  m.passos.forEach(function(_, i){ manualChk[m.id + '|' + i] = true; });
  toast('Manual concluído!');
  renderManual();
}
function progressoManual(m){
  var feitos = m.passos.filter(function(_, i){ return manualChk[m.id + '|' + i]; }).length;
  return Math.round((feitos / m.passos.length) * 100);
}
function zoomImg(src, alt){
  var host = document.getElementById('modalHost');
  if(!host){ host = document.createElement('div'); host.id = 'modalHost'; document.body.appendChild(host); }
  var bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = '<div class="modal wide"><div class="modal-h"><h3>' + escapeHtml(alt) + '</h3><button class="x" onclick="this.closest(\'.backdrop\').remove()">×</button></div><div class="modal-b"><div class="lightbox"><img src="' + escapeHtml(src) + '"></div></div><div class="modal-f"><button class="btn" onclick="this.closest(\'.backdrop\').remove()">Fechar</button></div></div>';
  bd.onclick = function(e){ if(e.target === bd) bd.remove(); };
  host.appendChild(bd);
}

/* ---------- RENDER PRINCIPAL ---------- */
function render(){
  var total = cameras.length;
  var online = cameras.filter(function(c){ return c.s.toLowerCase() === 'ok'; }).length;
  var offline = total - online;
  var ip = cameras.filter(function(c){ return c.t === 'IP'; }).length;
  var analog = total - ip;
  var comIP = cameras.filter(function(c){ return c.ip && c.ip.trim(); }).length;
  var semIPCount = total - comIP;
  var audit = auditar();

  document.getElementById('kpis').innerHTML =
    '<div class="kpi" onclick="setFilter(\'all\');legendFilters={ip:false,analog:false,online:false,offline:false};document.querySelectorAll(\'[data-legend]\').forEach(function(b){b.classList.remove(\'active\');});render();">' +
      '<div class="kpi-label">Total</div><div class="kpi-value">' + total + '</div><small>Câmeras</small></div>' +
    '<div class="kpi green" onclick="setFilter(\'online\');render();">' +
      '<div class="kpi-label">Online</div><div class="kpi-value">' + online + '</div><small>' + ((online/total)*100).toFixed(1) + '%</small></div>' +
    '<div class="kpi red" onclick="setFilter(\'offline\');render();">' +
      '<div class="kpi-label">Off-line</div><div class="kpi-value">' + offline + '</div><small>' + ((offline/total)*100).toFixed(1) + '%</small></div>' +
    '<div class="kpi blue"><div class="kpi-label">IP</div><div class="kpi-value">' + ip + '</div><small>Câmeras de rede</small></div>' +
    '<div class="kpi purple"><div class="kpi-label">Analógica</div><div class="kpi-value">' + analog + '</div><small>Via DVR</small></div>' +
    '<div class="kpi cyan"><div class="kpi-label">Com IP</div><div class="kpi-value">' + comIP + '</div><small>cadastrado</small></div>' +
    '<div class="kpi amber"><div class="kpi-label">Sem IP</div><div class="kpi-value">' + semIPCount + '</div><small>a preencher</small></div>';

  ['ip:' + ip, 'analog:' + analog, 'online:' + online, 'offline:' + offline].forEach(function(pair){
    var parts = pair.split(':');
    var el = document.getElementById('count-' + parts[0]);
    if(el) el.textContent = parts[1];
  });
  document.getElementById('tab-cam-count').textContent = total;
  document.getElementById('tab-grav-count').textContent = GRAVADORES.length;
  document.getElementById('tab-equip-count').textContent = EQUIPAMENTOS.length;
  document.getElementById('tab-audit-count').textContent = audit.totalProblemas;

  var filtered = getFiltered();
  var tbody = document.getElementById('tbody');
  if(filtered.length === 0){
    tbody.innerHTML = '<tr><td colspan="10" class="empty">Nenhuma câmera encontrada</td></tr>';
  } else {
    tbody.innerHTML = filtered.map(function(c){
      var isOn = c.s.toLowerCase() === 'ok';
      var h = durH(c.statusSince);
      var cls = 'offtime';
      if(h > 72) cls += ' critical'; else if(h > 24) cls += ' long';
      var crit = !isOn && h > 24;
      return '<tr class="' + (crit ? 'row-alert' : '') + '">' +
        '<td><div class="toggle ' + (isOn ? 'on' : '') + '" onclick="toggleCamera(' + c.id + ')"></div></td>' +
        '<td style="font-weight:600">' + escapeHtml(c.n) + '</td>' +
        '<td><span class="badge ' + (c.t === 'IP' ? 'ip' : 'analog') + '">' + c.t + '</span></td>' +
        '<td>' + (c.p ? '<span class="piso">' + escapeHtml(c.p) + '</span>' : '—') + '</td>' +
        '<td class="info-cell">' + escapeHtml(c.local || '—') + '</td>' +
        '<td class="info-cell">' + escapeHtml(c.ip || '—') + '</td>' +
        '<td class="info-cell" style="font-family:monospace;font-size:.68rem">' + escapeHtml(c.mac || '—') + '</td>' +
        '<td><span class="badge ' + (isOn ? 'ok' : 'bad') + '">' + (isOn ? '● Online' : '● Off-line') + '</span></td>' +
        '<td class="info-cell">' + (isOn ? '—' : fmtDT(c.statusSince)) + '</td>' +
        '<td class="' + (isOn ? 'info-cell' : cls) + '">' + (isOn ? '—' : timeAgo(c.statusSince)) + '</td>' +
      '</tr>';
    }).join('');
  }

  var locais = {};
  EQUIPAMENTOS.forEach(function(e){ (locais[e.local] = locais[e.local] || []).push(e); });
  var camPorLocal = {};
  cameras.forEach(function(c){
    var loc = c.local || 'Sem local';
    if(!camPorLocal[loc]) camPorLocal[loc] = {total:0, online:0, offline:0};
    camPorLocal[loc].total++;
    if(c.s.toLowerCase() === 'ok') camPorLocal[loc].online++;
    else camPorLocal[loc].offline++;
  });
  var iconTipo = function(t){ return t === 'SW' ? 'fa-network-wired' : t === 'DVR' ? 'fa-video' : t === 'NVR' ? 'fa-hdd' : t === 'NOB' ? 'fa-battery-full' : t === 'SRV' ? 'fa-server' : t === 'MON' ? 'fa-tv' : 'fa-microchip'; };
  var nomeTipo = function(t){ return t === 'SW' ? 'Switch' : t === 'DVR' ? 'DVR' : t === 'NVR' ? 'NVR' : t === 'NOB' ? 'Nobreak' : t === 'SRV' ? 'Servidor' : t === 'MON' ? 'Monitor' : 'Equip'; };
  var andarDe = function(local){
    if(local === 'Central de Segurança' || local === 'Sala TI' || local === 'Sala da Diretoria' || local === 'Sala da Gerência' || local === 'Portaria de Serviço') return 'Piso L';
    if(local === 'Sala Rio de Janeiro') return 'Piso C';
    if(local === 'Shaft 1º Andar') return '1º Andar';
    if(local === 'Shaft 10º Andar') return '10º Andar';
    if(local === '3SUB2') return 'Subsolo 1';
    return 'Outros';
  };
  var locaisOrdenados = Object.keys(locais).sort(function(a, b){
    var ia = ORDEM_LOCAIS.indexOf(a), ib = ORDEM_LOCAIS.indexOf(b);
    if(ia === -1 && ib === -1) return a.localeCompare(b);
    if(ia === -1) return 1; if(ib === -1) return -1;
    return ia - ib;
  });
  var htmlEquip = '', andarAtual = '';
  locaisOrdenados.forEach(function(local){
    var andar = andarDe(local);
    if(andar !== andarAtual){
      andarAtual = andar;
      htmlEquip += '<div style="grid-column:1/-1;margin-top:' + (htmlEquip ? '20px' : '0') + ';margin-bottom:6px;padding:10px 16px;background:linear-gradient(135deg,rgba(59,130,246,.15),rgba(139,92,246,.1));border-radius:12px;border-left:4px solid #3b82f6;font-weight:800;font-size:1rem;color:#93c5fd;letter-spacing:.05em">🏢 ' + andar + '</div>';
    }
    var equips = locais[local];
    var eolL = equips.filter(function(e){ return e.status === 'eol'; }).length;
    var cams = camPorLocal[local] || {total:0, online:0, offline:0};
    htmlEquip += '<div class="local-card"><div class="local-header"><div class="local-title">📍 ' + escapeHtml(local) + '</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
      (cams.total > 0 ? '<span class="local-count">🎥 ' + cams.total + '</span>' : '') +
      (eolL > 0 ? '<span class="badge eol">⚠ ' + eolL + ' EOL</span>' : '') +
      '</div></div><div class="local-body">' +
      (cams.total > 0 ? '<div class="local-stats">' +
        '<div class="stat-box"><div class="num">' + cams.total + '</div><div class="lbl">Câmeras</div></div>' +
        '<div class="stat-box ok"><div class="num">' + cams.online + '</div><div class="lbl">Online</div></div>' +
        '<div class="stat-box bad"><div class="num">' + cams.offline + '</div><div class="lbl">Off-line</div></div>' +
        '<div class="stat-box"><div class="num">' + equips.length + '</div><div class="lbl">Equip.</div></div></div>' : '') +
      '<div class="equip-list">' + equips.map(function(e){
        return '<div class="equip-item ' + e.tipo.toLowerCase() + ' ' + (e.status === 'eol' ? 'eol' : '') + '">' +
          '<div class="equip-icon"><i class="fas ' + iconTipo(e.tipo) + '"></i></div>' +
          '<div class="equip-info"><div class="equip-name">' + escapeHtml(e.nome) + (e.qtd ? ' (x' + e.qtd + ')' : '') + '</div>' +
          '<div class="equip-meta"><span>📦 ' + escapeHtml(e.modelo) + '</span>' +
          (e.obs ? '<span style="color:#fca5a5">⚠ ' + escapeHtml(e.obs) + '</span>' : '') + '</div></div>' +
          '<span class="equip-tag ' + e.tipo.toLowerCase() + '">' + nomeTipo(e.tipo) + '</span></div>';
      }).join('') + '</div></div></div>';
  });
  document.getElementById('equipGrid').innerHTML = htmlEquip;

  renderAuditoria(audit);
  renderGravadores();

  document.getElementById('totalCount').textContent = total;
  document.getElementById('offCount').textContent = offline;
  document.getElementById('equipCount').textContent = EQUIPAMENTOS.length;
}

function renderAuditoria(a){
  var grid = document.getElementById('auditGrid');
  function card(color, title, items, fn){
    return '<div class="audit-card"><div class="audit-header ' + color + '"><div class="audit-title">' + title + '</div><div class="audit-count">' + items.length + '</div></div>' +
      '<div class="audit-body">' + (items.length === 0 ? '<div class="audit-empty">✅ Nenhum problema</div>' : items.map(fn).join('')) + '</div></div>';
  }
  grid.innerHTML =
    card('red','🔴 IPs Duplicados', a.ipsDuplicados, function(e){
      return '<div class="audit-item red"><div class="audit-item-title">🌐 ' + escapeHtml(e[0]) + ' <span class="badge eol">' + e[1].length + 'x</span></div>' +
        '<div class="audit-item-detail">' + e[1].map(function(c){ return '<span>• ' + escapeHtml(c.n) + '</span>'; }).join('') + '</div></div>';
    }) +
    card('red','🔴 IPs Inválidos', a.ipsInvalidos, function(c){
      return '<div class="audit-item red"><div class="audit-item-title">⚠️ ' + escapeHtml(c.n) + '</div><div class="audit-item-detail"><span>IP: ' + escapeHtml(c.ip) + '</span></div></div>';
    }) +
    card('amber','⚠️ Nomes Similares', a.nomesDuplicados, function(e){
      return '<div class="audit-item amber"><div class="audit-item-title">📛 ' + e[1].length + ' parecidas</div>' +
        '<div class="audit-item-detail">' + e[1].map(function(c){ return '<span>• ' + escapeHtml(c.n) + '</span>'; }).join('') + '</div></div>';
    }) +
    card('blue','📋 Sem IP', a.semIP, function(c){ return '<div class="audit-item"><div class="audit-item-title">' + escapeHtml(c.n) + '</div><div class="audit-item-detail"><span>Piso: ' + escapeHtml(c.p || '—') + '</span></div></div>'; }) +
    card('blue','📋 Sem Piso', a.semPiso, function(c){ return '<div class="audit-item"><div class="audit-item-title">' + escapeHtml(c.n) + '</div></div>'; }) +
    card('blue','📋 Sem Local', a.semLocal, function(c){ return '<div class="audit-item"><div class="audit-item-title">' + escapeHtml(c.n) + '</div></div>'; });
}

/* ---------- ATALHOS ---------- */
document.addEventListener('keydown', function(e){
  if(e.target.matches('input,textarea,select')) return;
  if(manualOpen){
    if(e.key === 'ArrowRight'){ slideManual(manualSlide + 1); e.preventDefault(); return; }
    if(e.key === 'ArrowLeft'){ slideManual(manualSlide - 1); e.preventDefault(); return; }
    if(e.key === 'Escape'){ closeManual(); return; }
  }
  var n = parseInt(e.key, 10);
  if(n >= 1 && n <= 7){
    var tabs = ['cameras','gravadores','equipamentos','auditoria','topologia','manual','rede'];
    setTab(tabs[n - 1]);
  }
});

/* ---------- INIT ---------- */
async function init(){
  await carregarDoServidor();
  enriquecerComMapaReal();

  var floors = [];
  cameras.forEach(function(c){
    var p = c.p || 'Sem piso';
    if(floors.indexOf(p) < 0) floors.push(p);
  });
  floors.sort();
  var sel = document.getElementById('floorFilter');
  sel.innerHTML = '<option value="all">Todos os pisos</option>';
  floors.forEach(function(f){
    var opt = document.createElement('option');
    opt.value = f; opt.textContent = f;
    sel.appendChild(opt);
  });
  sel.onchange = function(e){ floorFilter = e.target.value; render(); };
  document.getElementById('search').oninput = function(e){ search = e.target.value; render(); };
  document.getElementById('gravSearch').oninput = function(e){ gravSearch = e.target.value; renderGravadores(); };

  var modalHost = document.createElement('div');
  modalHost.id = 'modalHost';
  document.body.appendChild(modalHost);

  function relogio(){ document.getElementById('clock').textContent = new Date().toLocaleTimeString('pt-BR'); }
  relogio();
  setInterval(relogio, 1000);
  setInterval(render, 30000);
  render();
}

window.toggleCamera = toggleCamera;
window.toggleLegend = toggleLegend;
window.setFilter = setFilter;
window.setGravFilter = setGravFilter;
window.setTab = setTab;
window.resetar = resetar;
window.exportarCSV = exportarCSV;
window.sincronizarManual = sincronizarManual;
window.toggleGravCard = toggleGravCard;
window.openManual = openManual;
window.closeManual = closeManual;
window.slideManual = slideManual;
window.finishManual = finishManual;
window.zoomImg = zoomImg;
window.renderRede = renderRede;
window.mostrarSenha = mostrarSenha;

init();

})();