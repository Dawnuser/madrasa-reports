/* ============================================================
   Madrasa Reports — app (SAMPLE)
   Hash router + views. Talks only to DB (data.js), so the
   Supabase swap later touches nothing here.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(n) {
    return I18N.get() === 'ur' ? I18N.urDigits(n) : String(n);
  }

  const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_UR = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];

  function fmtDate(ds) {
    const p = ds.split('-').map(Number);
    const m = p[1] - 1;
    if (I18N.get() === 'ur') {
      return I18N.urDigits(p[2]) + ' ' + MONTHS_UR[m] + ' ' + I18N.urDigits(p[0]);
    }
    return p[2] + ' ' + MONTHS_EN[m] + ' ' + p[0];
  }

  function monthLabel(y, m) {
    return I18N.get() === 'ur' ? MONTHS_UR[m - 1] + ' ' + I18N.urDigits(y) : MONTHS_EN[m - 1] + ' ' + y;
  }

  function todayDs() { return DB.todayStr(); }
  function yesterdayDs() { return DB.addDays(todayDs(), -1); }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------- router ---------- */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split('?');
    const seg = parts[0].split('/').filter(Boolean);
    const q = {};
    if (parts[1]) parts[1].split('&').forEach(function (kv) {
      const i = kv.indexOf('=');
      if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    return { seg: seg, q: q };
  }

  function nav(path) {
    location.hash = '#/' + path;
  }

  /* ---------- action registries (replaced on every render → no stacking) ---------- */
  let viewActions = {};
  let changeActions = {};

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.getAttribute('data-action');
    if (viewActions[a]) { viewActions[a](btn, e); return; }
    if (a === 'toggle-lang') {
      I18N.set(I18N.get() === 'en' ? 'ur' : 'en');
      route();
    } else if (a === 'toggle-theme') {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      localStorage.setItem('mdm_theme', cur);
      applyLangTheme();
      route();
    } else if (a === 'logout') {
      DB.logout();
      nav('login');
    } else if (a === 'back') {
      if (history.length > 1) history.back(); else nav('dashboard');
    } else if (a === 'go-send') {
      nav('send');
    } else if (a === 'export-excel') {
      exportAllExcel();
    } else if (a === 'export-pdf') {
      exportAllPdf();
    }
  });

  document.addEventListener('change', function (e) {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = changeActions[el.getAttribute('data-change')];
    if (fn) fn(el, e);
  });

  function applyLangTheme() {
    document.documentElement.setAttribute('lang', I18N.get());
    document.documentElement.setAttribute('dir', I18N.get() === 'ur' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('data-theme', localStorage.getItem('mdm_theme') || 'light');
  }

  /* ---------- main render ---------- */
  const app = document.getElementById('app');

  async function route() {
    const { seg, q } = parseHash();
    viewActions = {};
    changeActions = {};
    const session = DB.getSession();
    if (seg.length === 0 || seg[0] === 'login') {
      if (session) nav('dashboard');
      else renderLogin();
      return;
    }
    if (!session) { nav('login'); return; }

    if (seg[0] === 'dashboard') renderDashboard(session);
    else if (seg[0] === 'student' && seg[1]) renderStudentForm(session, seg[1], q.date || todayDs());
    else if (seg[0] === 'history' && seg[1]) renderHistory(session, seg[1], q);
    else if (seg[0] === 'principal') renderPrincipal(session);
    else if (seg[0] === 'send') renderSend(session);
    else if (seg[0] === 'class' && seg[1]) renderClass(session, seg[1]);
    else nav('dashboard');
  }

  window.addEventListener('hashchange', route);

  /* ---------- LOGIN ---------- */
  async function renderLogin() {
    applyLangTheme();
    const isUr = I18N.get() === 'ur';
    const t = I18N.t;
    app.innerHTML = '' +
      '<div class="login-wrap">' +
        '<div style="position:fixed;top:14px;inset-inline-end:14px;display:flex;gap:8px">' +
          '<button class="icon-btn" data-action="toggle-lang">' + (isUr ? t('english') : t('urdu')) + '</button>' +
          '<button class="icon-btn" data-action="toggle-theme">' + (document.documentElement.getAttribute('data-theme') === 'dark' ? '☀' : '☾') + '</button>' +
        '</div>' +
        '<div class="plaque"><img src="assets/logo.png" alt="' + esc(t('appName')) + '"></div>' +
        '<div class="login-title">' +
          '<span class="urdu">' + t('urduName') + '</span>' +
          '<div class="h-display" style="margin-top:4px">' + esc(t('appName')) + '</div>' +
          '<div class="tag">' + esc(t('tagline')) + '</div>' +
        '</div>' +
        '<form class="card login-card" id="login-form">' +
          '<div class="field">' +
            '<label for="uid">' + t('userId') + '</label>' +
            '<input id="uid" name="uid" autocomplete="username" placeholder="qari1" required>' +
          '</div>' +
          '<div class="field">' +
            '<label for="pwd">' + t('password') + '</label>' +
            '<input id="pwd" name="pwd" type="password" autocomplete="current-password" required>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block">' + t('login') + '</button>' +
        '</form>' +
        '<div class="demo-box">' +
          '<strong>' + t('demoNote') + '</strong><br>' +
          t('demoNote2') + ' <code>qari1</code> / <code>qari123</code> · ' +
          t('principal') + ': <code>principal</code> / <code>principal123</code>' +
        '</div>' +
        '<div class="login-foot">' + t('sampleOnly') + '</div>' +
      '</div>';

    document.getElementById('login-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const uid = document.getElementById('uid').value.trim();
      const pwd = document.getElementById('pwd').value;
      const session = await DB.login(uid, pwd);
      if (!session) { toast(t('loginError')); return; }
      nav('dashboard');
    });
  }

  /* ---------- DASHBOARD (qari) ---------- */
  async function renderDashboard(session) {
    const t = I18N.t;
    if (session.role === 'principal') { nav('principal'); return; }
    const cls = await DB.getClass(session.classId);
    const students = await DB.getStudents(session.classId);
    const today = todayDs();
    let todayReportCount = 0, presentCount = 0;
    const hasReports = {};
    for (const s of students) {
      const rep = await DB.getReport(s.id, today);
      if (rep) { todayReportCount++; if (rep.present) presentCount++; hasReports[s.id] = true; }
      else hasReports[s.id] = false;
    }

    app.innerHTML = '' +
      topbar(false) +
      '<main class="app-main">' +
        '<div class="greet">' +
          '<span class="eyebrow">' + t('welcome') + '</span>' +
          '<h1>' + esc(session.name) + '</h1>' +
          '<span class="pill">' + esc(cls.name) + '</span>' +
        '</div>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="n">' + num(students.length) + '</div><div class="l">' + t('students') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(presentCount) + '</div><div class="l">' + t('presentToday') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(students.length - todayReportCount) + '</div><div class="l">' + t('pendingToday') + '</div></div>' +
        '</div>' +
        '<button class="btn btn-gold btn-block" data-action="go-send">📲 ' + t('sendReports') + '</button>' +
        '<div class="section-title">' + t('myStudents') + '</div>' +
        '<div class="student-grid">' +
          students.map(function (s) {
            const done = hasReports[s.id];
            return (
              '<a class="student-card" href="#/student/' + s.id + '?date=' + today + '">' +
                '<span class="avatar">' + esc(s.name.charAt(0)) + '</span>' +
                '<span class="s-card-body">' +
                  '<span class="n">' + esc(s.name) + '</span><br>' +
                  '<span class="m">' + t('para') + ' ' + num(s.para) + ' · ' + t('category') + ' ' + esc(s.category) +
                  ' · ' + esc(s.parentName) + '</span>' +
                '</span>' +
                '<span class="status-dot' + (done ? ' done' : '') + '" title="' + (done ? t('done') : t('pendingToday')) + '"></span>' +
              '</a>'
            );
          }).join('') +
        '</div>' +
      '</main>';
  }

  /* ---------- STUDENT FORM ---------- */
  let draft = null;

  function buildDraft(sid, ds, existing) {
    const r = existing || {};
    return {
      sid: sid, ds: ds,
      present: r.present !== undefined ? r.present : true,
      sabaqDone: !!r.sabaqDone,
      sabqiDone: !!r.sabqiDone,
      manzilDone: !!r.manzilDone,
      manzil: r.manzil || 'half',
      pages: r.pages || 0,
      lines: r.lines || 0
    };
  }

  function captureWidgets() {
    const g = function (id) { return document.getElementById(id); };
    const s1 = g('sw-sabaq'), s2 = g('sw-sabqi'), s3 = g('sw-manzil');
    if (s1) draft.sabaqDone = s1.checked;
    if (s2) draft.sabqiDone = s2.checked;
    if (s3) draft.manzilDone = s3.checked;
    const pg = g('f-pages'), ln = g('f-lines');
    if (pg) draft.pages = parseInt(pg.value, 10) || 0;
    if (ln) draft.lines = parseInt(ln.value, 10) || 0;
    const mp = app.querySelector('.seg.tri .opt.on');
    if (mp) draft.manzil = mp.getAttribute('data-v');
  }

  async function renderStudentForm(session, sid, ds) {
    const t = I18N.t;
    if (session.role === 'principal') { nav('history/' + sid); return; }
    const student = await DB.getStudent(sid);
    if (!student) { nav('dashboard'); return; }
    if (session.role === 'qari' && session.classId !== student.classId) { nav('dashboard'); return; }

    const existing = await DB.getReport(sid, ds);
    if (!draft || draft.sid !== sid || draft.ds !== ds) draft = buildDraft(sid, ds, existing);
    const rep = draft;
    const today = todayDs();
    const yest = yesterdayDs();
    const locked = ds < yest;
    const manzilOpts = [['half', t('halfPara')], ['third', t('thirdPara')], ['full', t('fullPara')]];

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('reportFor') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + esc(student.name) + '</h1>' +
        '<div class="pill" style="margin-top:8px">' + t('para') + ' ' + num(student.para) + ' · ' + t('category') + ' ' + esc(student.category) + '</div>' +
        (locked ? '<div class="card" style="margin-top:14px;border-color:var(--bad)">' + t('locked') + '</div>' : '') +
        '<div class="card" style="margin-top:14px">' +
          '<div class="field">' +
            '<label for="f-date">' + t('date') + '</label>' +
            '<input type="date" id="f-date" data-change="f-date" value="' + ds + '" max="' + today + '" min="' + yest + '"' + (locked ? ' disabled' : '') + '>' +
          '</div>' +
          '<div class="section-title" style="margin-top:6px">' + t('attendance') + '</div>' +
          '<div class="seg">' +
            '<button type="button" class="opt present' + (rep.present ? ' on present' : '') + '" data-action="set-present" data-v="1">' + t('present') + '</button>' +
            '<button type="button" class="opt absent' + (!rep.present ? ' on absent' : '') + '" data-action="set-present" data-v="0">' + t('absent') + '</button>' +
          '</div>' +
        '</div>' +
        (rep.present ?
          '<div class="card" style="margin-top:14px">' +
            '<div class="tick-row">' +
              '<div><div class="lbl">' + t('sabaq') + '</div><div class="sub">' + t('sabaqSub') + '</div></div>' +
              '<label class="switch"><input type="checkbox" id="sw-sabaq"' + (rep.sabaqDone ? ' checked' : '') + (locked ? ' disabled' : '') + '><span class="track"></span></label>' +
            '</div>' +
            '<div class="reveal' + (rep.sabaqDone ? ' open' : '') + '" id="reveal-sabaq">' +
              '<div class="sub-row">' +
                '<div class="field"><label for="f-pages">' + t('pages') + '</label>' +
                  '<select id="f-pages"' + (locked ? ' disabled' : '') + '>' + rangeOpts(10, rep.pages) + '</select></div>' +
                '<div class="field"><label for="f-lines">' + t('lines') + '</label>' +
                  '<select id="f-lines"' + (locked ? ' disabled' : '') + '>' + rangeOpts(20, rep.lines) + '</select></div>' +
              '</div>' +
            '</div>' +
            '<div class="tick-row">' +
              '<div><div class="lbl">' + t('sabqi') + '</div><div class="sub">' + t('sabqiSub') + '</div></div>' +
              '<label class="switch"><input type="checkbox" id="sw-sabqi"' + (rep.sabqiDone ? ' checked' : '') + (locked ? ' disabled' : '') + '><span class="track"></span></label>' +
            '</div>' +
            '<div class="tick-row">' +
              '<div><div class="lbl">' + t('manzil') + '</div><div class="sub">' + t('manzilSub') + '</div></div>' +
              '<label class="switch"><input type="checkbox" id="sw-manzil"' + (rep.manzilDone ? ' checked' : '') + (locked ? ' disabled' : '') + '><span class="track"></span></label>' +
            '</div>' +
            '<div class="reveal' + (rep.manzilDone ? ' open' : '') + '" id="reveal-manzil">' +
              '<div class="seg tri">' +
                manzilOpts.map(function (o) {
                  return '<button type="button" class="opt' + (rep.manzil === o[0] ? ' on' : '') + '" data-action="set-manzil" data-v="' + o[0] + '"' + (locked ? ' disabled' : '') + '>' + o[1] + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
          '</div>' : '') +
        '<div style="display:flex;gap:10px;margin-top:16px">' +
          (!locked ? '<button class="btn btn-primary btn-block" data-action="save-report">' + t('save') + '</button>' : '') +
          '<a class="btn btn-ghost" href="#/history/' + sid + '">' + t('viewHistory') + '</a>' +
        '</div>' +
      '</main>';

    changeActions['f-date'] = function (el) {
      draft = null;
      const v = el.value;
      if (v) nav('student/' + sid + '?date=' + v);
    };
    if (rep.present) {
      document.getElementById('sw-sabaq').addEventListener('change', function () {
        draft.sabaqDone = this.checked;
        document.getElementById('reveal-sabaq').classList.toggle('open', this.checked);
      });
      document.getElementById('sw-sabqi').addEventListener('change', function () { draft.sabqiDone = this.checked; });
      document.getElementById('sw-manzil').addEventListener('change', function () {
        draft.manzilDone = this.checked;
        document.getElementById('reveal-manzil').classList.toggle('open', this.checked);
      });
    }

    viewActions['set-present'] = function (btn) {
      captureWidgets();
      draft.present = btn.getAttribute('data-v') === '1';
      renderStudentForm(session, sid, ds);
    };
    viewActions['set-manzil'] = function (btn) {
      draft.manzil = btn.getAttribute('data-v');
      app.querySelectorAll('[data-action="set-manzil"]').forEach(function (b) {
        b.classList.toggle('on', b === btn);
      });
    };
    viewActions['save-report'] = function () {
      captureWidgets();
      const rep2 = {
        present: draft.present,
        sabaqDone: draft.present && draft.sabaqDone,
        pages: draft.present && draft.sabaqDone ? (draft.pages || null) : null,
        lines: draft.present && draft.sabaqDone ? (draft.lines || null) : null,
        sabqiDone: draft.present && draft.sabqiDone,
        manzilDone: draft.present && draft.manzilDone,
        manzil: draft.present && draft.manzilDone ? draft.manzil : null
      };
      if (rep2.sabaqDone && !rep2.pages && !rep2.lines) {
        toast(I18N.get() === 'ur' ? 'سبق کے لیے صفحات یا سطریں منتخب کریں' : 'Select pages or lines for Sabaq.');
        return;
      }
      DB.saveReport(sid, ds, rep2).then(function () {
        draft = null;
        toast(t('saved'));
        nav('dashboard');
      });
    };
  }

  function rangeOpts(max, selected) {
    let out = '<option value="0">—</option>';
    for (let i = 1; i <= max; i++) {
      out += '<option value="' + i + '"' + (selected === i ? ' selected' : '') + '>' + num(i) + '</option>';
    }
    return out;
  }

  /* ---------- HISTORY ---------- */
  async function renderHistory(session, sid, q) {
    const t = I18N.t;
    const student = await DB.getStudent(sid);
    if (!student) { nav('dashboard'); return; }
    if (session.role === 'qari' && session.classId !== student.classId) { nav('dashboard'); return; }

    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
    }
    let sel = { y: now.getFullYear(), m: now.getMonth() + 1 };
    if (q && q.ym) {
      const parts = q.ym.split('-').map(Number);
      sel = { y: parts[0], m: parts[1] };
    }
    const reps = await DB.getMonthReports(sid, sel.y, sel.m);
    const daysInMonth = new Date(sel.y, sel.m, 0).getDate();
    const today = todayDs();

    let presentCount = 0, absentCount = 0;
    const rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = sel.y + '-' + String(sel.m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      if (ds > today) continue;
      const r = reps[ds];
      if (!r) continue;
      if (r.present) presentCount++; else absentCount++;
      rows.push({ ds: ds, r: r });
    }

    const manzilName = function (m) {
      if (m === 'half') return t('halfPara');
      if (m === 'third') return t('thirdPara');
      if (m === 'full') return t('fullPara');
      return '—';
    };
    const sabaqCell = function (r) {
      if (!r.present) return '—';
      if (!r.sabaqDone) return t('notDone');
      const parts = [];
      if (r.pages) parts.push(num(r.pages) + 'p');
      if (r.lines) parts.push(num(r.lines) + 'l');
      return parts.join('+') || '—';
    };

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('historyTitle') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + esc(student.name) + '</h1>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="n">' + num(presentCount) + '</div><div class="l">' + t('presentCount') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(absentCount) + '</div><div class="l">' + t('absentDays') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(rows.length) + '</div><div class="l">' + t('totalDays') + '</div></div>' +
        '</div>' +
        '<div class="field">' +
          '<label>' + t('month') + '</label>' +
          '<select id="f-month" data-change="f-month">' +
            months.map(function (mo) {
              return '<option value="' + mo.y + '-' + mo.m + '"' + (mo.y === sel.y && mo.m === sel.m ? ' selected' : '') + '>' + monthLabel(mo.y, mo.m) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        (rows.length === 0 ?
          '<div class="empty-note">' + t('noReports') + '</div>' :
          '<div class="tbl-wrap"><table class="tbl">' +
            '<thead><tr><th>' + t('day') + '</th><th>' + t('date') + '</th><th>' + t('status') + '</th><th>' + t('sabaq') + '</th><th>' + t('sabqi') + '</th><th>' + t('manzil') + '</th></tr></thead>' +
            '<tbody>' +
              rows.map(function (row) {
                const r = row.r;
                return (
                  '<tr class="' + (r.present ? '' : 'absent') + '" style="cursor:pointer" data-row="' + row.ds + '" data-action="row-open">' +
                    '<td class="num">' + num(parseInt(row.ds.slice(8), 10)) + '</td>' +
                    '<td>' + fmtDate(row.ds) + '</td>' +
                    '<td>' + (r.present ? '✓ ' + t('present') : '✗ ' + t('absent')) + '</td>' +
                    '<td>' + sabaqCell(r) + '</td>' +
                    '<td>' + (r.present ? (r.sabqiDone ? '✓' : '—') : '—') + '</td>' +
                    '<td>' + (r.present ? manzilName(r.manzil) : '—') + '</td>' +
                  '</tr>'
                );
              }).join('') +
            '</tbody></table></div>') +
      '</main>';

    changeActions['f-month'] = function (el) {
      const parts = el.value.split('-');
      nav('history/' + sid + '?ym=' + parts[0] + '-' + parts[1]);
    };
    viewActions['row-open'] = function (btn) {
      const tr = btn.closest('[data-row]');
      if (tr) nav('student/' + sid + '?date=' + tr.getAttribute('data-row'));
    };
  }

  /* ---------- PRINCIPAL (class list) ---------- */
  async function renderPrincipal(session) {
    const t = I18N.t;
    if (session.role !== 'principal') { nav('dashboard'); return; }
    const classes = await DB.getClasses();
    const counts = {};
    for (const c of classes) {
      counts[c.id] = (await DB.getStudents(c.id)).length;
    }

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('principal') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + t('principalTitle') + '</h1>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" class="no-print">' +
          '<button class="btn btn-ghost btn-sm" data-action="export-excel">⬇ ' + t('exportExcel') + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="export-pdf">⬇ ' + t('exportPdf') + '</button>' +
        '</div>' +
        '<div class="section-title">' + t('classes') + '</div>' +
        classes.map(function (c) {
          return (
            '<div style="margin-bottom:10px">' +
              '<a class="class-row" href="#/class/' + c.id + '">' +
                '<span class="avatar">' + esc(c.name.charAt(c.name.length - 1)) + '</span>' +
                '<span><span class="nm">' + esc(c.name) + '</span><br><span class="sub">' + num(counts[c.id]) + ' ' + t('students') + '</span></span>' +
                '<span style="margin-inline-start:auto;color:var(--gold)">&rsaquo;</span>' +
              '</a>' +
            '</div>'
          );
        }).join('') +
      '</main>';
  }

  /* ---------- CLASS VIEW (principal) ---------- */
  async function renderClass(session, cid) {
    const t = I18N.t;
    if (session.role !== 'principal') { nav('dashboard'); return; }
    const cls = await DB.getClass(cid);
    if (!cls) { nav('principal'); return; }
    const students = await DB.getStudents(cid);

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('classes') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + esc(cls.name) + '</h1>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" class="no-print">' +
          '<button class="btn btn-primary btn-sm" data-action="add-student">+ ' + t('addStudent') + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="export-excel-class">⬇ ' + t('exportExcel') + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="export-pdf-class">⬇ ' + t('exportPdf') + '</button>' +
        '</div>' +
        '<div class="section-title">' + t('students') + '</div>' +
        (students.length === 0 ?
          '<div class="empty-note">' + t('noStudents') + ' — <a href="#" data-action="add-student">' + t('addFirst') + '</a></div>' :
          students.map(function (s) {
            return (
              '<div class="student-row">' +
                '<div>' +
                  '<div style="font-weight:600">' + esc(s.name) + ' <span class="badge badge-cat">' + esc(s.category) + '</span></div>' +
                  '<div class="meta">' + t('para') + ' ' + num(s.para) + ' · ' + t('age') + ' ' + num(s.age) + ' · ' + esc(s.parentName) + ' · ' + esc(s.parentPhone) + '</div>' +
                '</div>' +
                '<div class="row-actions">' +
                  '<button class="icon-mini" data-action="view-student" data-id="' + s.id + '" title="' + t('view') + '">👁</button>' +
                  '<button class="icon-mini" data-action="edit-student" data-id="' + s.id + '" title="' + t('edit') + '">✎</button>' +
                  '<button class="icon-mini danger" data-action="del-student" data-id="' + s.id + '" title="' + t('remove') + '">🗑</button>' +
                '</div>' +
              '</div>'
            );
          }).join('')) +
      '</main>';

    viewActions['add-student'] = function () { openModal({ classId: cid, category: 'A' }); };
    viewActions['edit-student'] = function (btn) {
      const st = students.find(function (s) { return s.id === btn.getAttribute('data-id'); });
      if (st) openModal(st);
    };
    viewActions['del-student'] = function (btn) {
      const st = students.find(function (s) { return s.id === btn.getAttribute('data-id'); });
      if (st && confirm(t('confirmDelete') + '\n\n' + st.name)) {
        DB.deleteStudent(st.id).then(function () { renderClass(session, cid); });
      }
    };
    viewActions['view-student'] = function (btn) {
      nav('history/' + btn.getAttribute('data-id'));
    };
    viewActions['export-excel-class'] = function () { exportClassExcel(cid); };
    viewActions['export-pdf-class'] = function () { exportClassPdf(cid); };

    let currentEdit = null;
    const openModal = function (st) {
      currentEdit = st;
      const isEdit = !!st.id;
      const opts = Object.keys(DB.categories).map(function (c) {
        return '<option value="' + c + '"' + (st.category === c ? ' selected' : '') + '>' + c + ' (' + DB.categories[c] + ' ' + t('day') + ')</option>';
      }).join('');
      const b = document.createElement('div');
      b.className = 'modal-back';
      b.innerHTML =
        '<div class="modal">' +
          '<h3>' + (isEdit ? t('editStudent') : t('addStudent')) + '</h3>' +
          '<div class="field"><label>' + t('name') + '</label><input id="m-name" value="' + esc(st.name || '') + '"></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
            '<div class="field"><label>' + t('age') + '</label><input id="m-age" type="number" min="3" max="30" value="' + (st.age || '') + '"></div>' +
            '<div class="field"><label>' + t('currentPara') + '</label><input id="m-para" type="number" min="1" max="30" value="' + (st.para || '') + '"></div>' +
          '</div>' +
          '<div class="field"><label>' + t('parentName') + '</label><input id="m-pname" value="' + esc(st.parentName || '') + '"></div>' +
          '<div class="field"><label>' + t('parentPhone') + '</label><input id="m-pphone" type="tel" value="' + esc(st.parentPhone || '') + '"></div>' +
          '<div class="field"><label>' + t('category') + ' — <small style="color:var(--ink-soft)">' + t('catHint') + '</small></label>' +
            '<select id="m-cat">' + opts + '</select></div>' +
          '<div style="display:flex;gap:10px">' +
            '<button class="btn btn-primary btn-block" data-action="m-save">' + t('save') + '</button>' +
            '<button class="btn btn-ghost" data-action="m-cancel">' + t('cancel') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(b);
      b.addEventListener('click', function (e) {
        const a = e.target.closest('[data-action]');
        if (!a) return;
        if (a.getAttribute('data-action') === 'm-cancel' || e.target === b) {
          b.remove();
          return;
        }
        if (a.getAttribute('data-action') === 'm-save') {
          const st2 = Object.assign({}, currentEdit, {
            name: document.getElementById('m-name').value.trim(),
            age: parseInt(document.getElementById('m-age').value, 10) || null,
            para: parseInt(document.getElementById('m-para').value, 10) || null,
            parentName: document.getElementById('m-pname').value.trim(),
            parentPhone: document.getElementById('m-pphone').value.replace(/\D/g, ''),
            category: document.getElementById('m-cat').value
          });
          if (!st2.name) { toast(I18N.get() === 'ur' ? 'نام درج کریں' : 'Enter a name'); return; }
          DB.saveStudent(st2).then(function () {
            b.remove();
            renderClass(session, cid);
          });
        }
      });
    };
  }

  /* ---------- SEND (WhatsApp) ---------- */
  async function renderSend(session) {
    const t = I18N.t;
    if (session.role !== 'qari') { nav('dashboard'); return; }
    const cls = await DB.getClass(session.classId);
    const students = await DB.getStudents(session.classId);
    const today = todayDs();

    const items = [];
    for (const s of students) {
      const rep = await DB.getReport(s.id, today);
      items.push({ s: s, rep: rep });
    }
    const done = items.filter(function (i) { return i.rep; });
    const pending = items.filter(function (i) { return !i.rep; });
    const sentKey = 'mdm_sent_' + session.id + '_' + today;
    let sentList = [];
    try { sentList = JSON.parse(localStorage.getItem(sentKey)) || []; } catch (e) {}

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('sendPageTitle') + '</span>' +
        '<h1 class="h-display" style="font-size:1.25rem">' + t('sendPageTitle') + '</h1>' +
        '<p style="color:var(--ink-soft);font-size:.88rem;margin-top:6px">' + t('sendPageSub') + '</p>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="n">' + num(done.length) + '</div><div class="l">' + t('students') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(sentList.length) + '</div><div class="l">' + t('sent') + '</div></div>' +
        '</div>' +
        (done.length === 0 ?
          '<div class="empty-note">' + t('nothingToSend') + '</div>' :
          done.map(function (item) {
            const sent = sentList.indexOf(item.s.id) >= 0;
            return (
              '<div class="card msg-card' + (sent ? ' sent' : '') + '" data-sid="' + item.s.id + '">' +
                '<div class="msg-head" data-action="toggle-msg">' +
                  '<span class="avatar" style="width:36px;height:36px;font-size:.9rem">' + esc(item.s.name.charAt(0)) + '</span>' +
                  '<span class="nm">' + esc(item.s.name) + '</span>' +
                  '<span class="badge ' + (item.rep.present ? 'badge-ok' : 'badge-miss') + '">' + (item.rep.present ? t('present') : t('absent')) + '</span>' +
                '</div>' +
                '<div class="msg-body">' + esc(waMessage(item.s, item.rep)) + '</div>' +
                '<div style="display:flex;gap:8px;margin-top:10px">' +
                  '<button class="btn btn-gold btn-sm" data-action="open-wa" data-id="' + item.s.id + '" data-phone="' + esc(item.s.parentPhone) + '">' + t('openWhatsApp') + '</button>' +
                  '<button class="btn btn-ghost btn-sm" data-action="toggle-msg">' + t('view') + '</button>' +
                '</div>' +
              '</div>'
            );
          }).join('')) +
        (pending.length > 0 ?
          '<div class="pending-note" style="margin-top:14px">' +
            '<strong>' + t('pendingStudents') + '</strong> ' +
            pending.map(function (i) { return esc(i.s.name); }).join(', ') +
          '</div>' : '') +
      '</main>';

    viewActions['toggle-msg'] = function (btn) {
      btn.closest('.msg-card').classList.toggle('open');
    };
    viewActions['open-wa'] = function (btn) {
      const id = btn.getAttribute('data-id');
      const phone = btn.getAttribute('data-phone');
      const item = done.find(function (i) { return i.s.id === id; });
      if (!item) return;
      const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(waMessage(item.s, item.rep));
      window.open(url, '_blank');
      if (sentList.indexOf(id) < 0) sentList.push(id);
      localStorage.setItem(sentKey, JSON.stringify(sentList));
      btn.closest('.msg-card').classList.add('sent');
    };
  }

  /* ---------- WhatsApp message ---------- */
  function waMessage(student, rep) {
    const rawDs = todayDs();
    const dateStr = fmtDate(rawDs);
    const lines = [];
    lines.push('Assalamu Alaikum, ' + (student.parentName || 'Parent'));
    lines.push('');
    lines.push('Madrasa Dar ul Ma\'arij — Daily Report');
    lines.push('Date: ' + dateStr);
    lines.push('');
    if (rep.present) {
      lines.push(student.name + ' — Present ✓');
      lines.push('Sabaq: ' + sabaqEn(rep));
      lines.push('Sabqi: ' + (rep.sabqiDone ? 'Done ✓' : 'Not done'));
      lines.push('Manzil: ' + manzilEn(rep));
    } else {
      lines.push(student.name + ' — Absent ✗');
    }
    lines.push('');
    lines.push('— — — — — — — — — —');
    lines.push('');
    lines.push('السلام علیکم، ' + (student.parentName || 'والد صاحب'));
    lines.push('');
    lines.push('مدرسہ دار المعارف — یومیہ رپورٹ');
    lines.push('تاریخ: ' + fmtDateUr(rawDs));
    lines.push('');
    if (rep.present) {
      lines.push(student.name + ' — حاضر ✓');
      lines.push('سبق: ' + sabaqUr(rep));
      lines.push('سبقی: ' + (rep.sabqiDone ? 'مکمل ✓' : 'نہیں ہوئی'));
      lines.push('منزل: ' + manzilUr(rep));
    } else {
      lines.push(student.name + ' — غیر حاضر ✗');
    }
    return lines.join('\n');
  }

  function fmtDateUr(ds) {
    const p = ds.split('-').map(Number);
    return I18N.urDigits(p[2]) + ' ' + MONTHS_UR[p[1] - 1] + ' ' + I18N.urDigits(p[0]);
  }

  function sabaqEn(rep) {
    if (!rep.sabaqDone) return 'Not done';
    const parts = [];
    if (rep.pages) parts.push(rep.pages + (rep.pages === 1 ? ' page' : ' pages'));
    if (rep.lines) parts.push(rep.lines + (rep.lines === 1 ? ' line' : ' lines'));
    return parts.length ? parts.join(', ') : '—';
  }

  function sabaqUr(rep) {
    if (!rep.sabaqDone) return 'نہیں ہوا';
    const parts = [];
    if (rep.pages) parts.push(I18N.urDigits(rep.pages) + ' صفحے');
    if (rep.lines) parts.push(I18N.urDigits(rep.lines) + ' سطریں');
    return parts.length ? parts.join('، ') : '—';
  }

  function manzilEn(rep) {
    if (!rep.manzilDone || !rep.manzil) return 'Not done';
    if (rep.manzil === 'half') return 'Half para';
    if (rep.manzil === 'third') return 'One-third para';
    return 'Full para';
  }

  function manzilUr(rep) {
    if (!rep.manzilDone || !rep.manzil) return 'نہیں ہوئی';
    if (rep.manzil === 'half') return 'آدھا پارہ';
    if (rep.manzil === 'third') return 'تہائی پارہ';
    return 'ایک پارہ';
  }

  /* ---------- EXPORTS ---------- */
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function download(name, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function buildCsvRows(all, cid) {
    const rows = [];
    all.students.forEach(function (s) {
      if (cid && s.classId !== cid) return;
      const cls = all.classes.find(function (c) { return c.id === s.classId; });
      Object.keys(all.reports).forEach(function (k) {
        if (k.indexOf(s.id + '|') !== 0) return;
        const ds = k.split('|')[1];
        const r = all.reports[k];
        rows.push([cls.name, s.name, s.para, s.category, s.parentName, s.parentPhone, ds,
          r.present ? 'Present' : 'Absent', r.pages || '', r.lines || '',
          r.present ? (r.sabqiDone ? 'Done' : 'Not done') : '',
          r.present ? manzilEn(r) : ''].map(csvCell).join(','));
      });
    });
    return rows;
  }

  async function exportClassExcel(cid) {
    const all = await DB.getAllData();
    const cls = all.classes.find(function (c) { return c.id === cid; });
    const csv = '\uFEFFClass,Student,Para,Category,Parent Name,Parent Phone,Date,Present,Sabaq Pages,Sabaq Lines,Sabqi,Manzil\n' +
      buildCsvRows(all, cid).join('\n');
    download('madrasa-' + cls.name.replace(/\s+/g, '-') + '-reports.csv', csv);
    toast(I18N.t('exportExcel'));
  }

  async function exportAllExcel() {
    const all = await DB.getAllData();
    const csv = '\uFEFFClass,Student,Para,Category,Parent Name,Parent Phone,Date,Present,Sabaq Pages,Sabaq Lines,Sabqi,Manzil\n' +
      buildCsvRows(all, null).join('\n');
    download('madrasa-all-reports.csv', csv);
    toast(I18N.t('exportExcel'));
  }

  function printHtml(title, rows, thead) {
    const w = window.open('', '_blank');
    w.document.write('<!DOCTYPE html><html><head><title>' + title + '</title><style>' +
      'body{font-family:Georgia,serif;color:#111;padding:30px}h1{font-size:20px;border-bottom:2px solid #0E6B3C;padding-bottom:8px}' +
      'table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}' +
      'th,td{border:1px solid #bbb;padding:6px 8px;text-align:left}th{background:#f0ead7}' +
      '.head{margin-top:24px;font-size:11px;color:#666}</style></head><body>' +
      '<h1>Madrasa Dar ul Ma\'arij — ' + esc(title) + '</h1>' +
      '<div class="head">Generated: ' + new Date().toLocaleString() + '</div>' +
      '<table><thead>' + thead + '</thead><tbody>' + rows + '</tbody></table>' +
      '</body></html>');
    w.document.close();
    setTimeout(function () { w.print(); }, 300);
  }

  async function exportClassPdf(cid) {
    const all = await DB.getAllData();
    const students = all.students.filter(function (s) { return s.classId === cid; });
    const cls = all.classes.find(function (c) { return c.id === cid; });
    let rows = '';
    students.forEach(function (s) {
      Object.keys(all.reports).forEach(function (k) {
        if (k.indexOf(s.id + '|') !== 0) return;
        const ds = k.split('|')[1];
        const r = all.reports[k];
        rows += '<tr><td>' + esc(s.name) + '</td><td>' + ds + '</td><td>' + (r.present ? 'Present' : 'Absent') + '</td>' +
          '<td>' + (r.pages || '') + (r.lines ? '+' + r.lines : '') + '</td>' +
          '<td>' + (r.sabqiDone ? '✓' : '') + '</td><td>' + manzilEn(r) + '</td></tr>';
      });
    });
    printHtml(cls.name + ' — Reports', rows, '<tr><th>Student</th><th>Date</th><th>Status</th><th>Sabaq</th><th>Sabqi</th><th>Manzil</th></tr>');
  }

  async function exportAllPdf() {
    const all = await DB.getAllData();
    let rows = '';
    all.students.forEach(function (s) {
      const cls = all.classes.find(function (c) { return c.id === s.classId; });
      Object.keys(all.reports).forEach(function (k) {
        if (k.indexOf(s.id + '|') !== 0) return;
        const ds = k.split('|')[1];
        const r = all.reports[k];
        rows += '<tr><td>' + esc(cls.name) + '</td><td>' + esc(s.name) + '</td><td>' + ds + '</td>' +
          '<td>' + (r.present ? 'Present' : 'Absent') + '</td>' +
          '<td>' + (r.pages || '') + (r.lines ? '+' + r.lines : '') + '</td>' +
          '<td>' + (r.sabqiDone ? '✓' : '') + '</td><td>' + manzilEn(r) + '</td></tr>';
      });
    });
    printHtml('All Classes — Reports', rows, '<tr><th>Class</th><th>Student</th><th>Date</th><th>Status</th><th>Sabaq</th><th>Sabqi</th><th>Manzil</th></tr>');
  }

  /* ---------- topbar ---------- */
  function topbar(showBack) {
    const isUr = I18N.get() === 'ur';
    return '' +
      '<header class="topbar no-print">' +
        (showBack ? '<button class="icon-btn" data-action="back" aria-label="back">&larr;</button>' : '') +
        '<div class="brand">' +
          '<img src="assets/logo.png" alt="">' +
          '<span class="t1">' + esc(I18N.t('appName')) + '</span>' +
        '</div>' +
        '<div class="spacer"></div>' +
        '<button class="icon-btn" data-action="toggle-lang" title="Language">' +
          (isUr ? esc(I18N.t('english')) : esc(I18N.t('urdu'))) +
        '</button>' +
        '<button class="icon-btn" data-action="toggle-theme" title="Theme">' +
          (document.documentElement.getAttribute('data-theme') === 'dark' ? '☀' : '☾') +
        '</button>' +
        '<button class="icon-btn" data-action="logout">' + esc(I18N.t('logout')) + '</button>' +
      '</header>';
  }

  /* ---------- boot ---------- */
  (async function boot() {
    applyLangTheme();
    await route();
  })();
})();
