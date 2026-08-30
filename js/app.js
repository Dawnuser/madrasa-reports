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
  function nameDisplay(s) {
    return esc(String(s == null ? '' : s).replace(/Sheikh\s*/gi, 'Ustad ')).replace(/\s+/g, ' ').trim();
  }
  function nameClean(s) {
    return String(s == null ? '' : s).replace(/Sheikh\s*/gi, 'Ustad ').replace(/\s+/g, ' ').trim();
  }

  function num(n) {
    return I18N.digits(n);
  }

  const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_UR = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
  const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  function fmtDate(ds) {
    const p = ds.split('-').map(Number);
    const m = p[1] - 1;
    if (I18N.get() === 'ur') {
      return I18N.urDigits(p[2]) + ' ' + MONTHS_UR[m] + ' ' + I18N.urDigits(p[0]);
    }
    if (I18N.get() === 'ar') {
      return I18N.arDigits(p[2]) + ' ' + MONTHS_AR[m] + ' ' + I18N.arDigits(p[0]);
    }
    return p[2] + ' ' + MONTHS_EN[m] + ' ' + p[0];
  }

  function monthLabel(y, m) {
    if (I18N.get() === 'ur') return MONTHS_UR[m - 1] + ' ' + I18N.urDigits(y);
    if (I18N.get() === 'ar') return MONTHS_AR[m - 1] + ' ' + I18N.arDigits(y);
    return MONTHS_EN[m - 1] + ' ' + y;
  }

  function todayDs() { return DB.todayStr(); }
  function yesterdayDs() { return DB.addDays(todayDs(), -1); }

  function dstr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

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

  let suppressRecord = false;
  function redirect(path) {
    const target = '#/' + path;
    if (location.hash !== target) {
      suppressRecord = true;
      location.replace(target);
    }
  }

  /* ---------- export group (one Export button that expands to options) ---------- */
  function exportGroup(items) {
    return '<span class="export-group no-print">' +
      '<button class="btn btn-ghost btn-sm" data-action="export-menu">⬇ ' + I18N.t('export') + '<span class="export-caret">▾</span></button>' +
      '<span class="export-menu">' +
        items.map(function (it) {
          return '<button class="export-item" data-action="' + it.action + '">' + it.label + '</button>';
        }).join('') +
      '</span>' +
    '</span>';
  }

  function exportButton(action, label) {
    return '<button class="btn btn-ghost btn-sm" data-action="' + action + '">⬇ ' + label + '</button>';
  }

  function importButton() {
    return '<button class="btn btn-ghost btn-sm" data-action="import-data">⬆ ' + I18N.t('import') + '</button>';
  }

  /* ---------- action registries (replaced on every render → no stacking) ---------- */
  let viewActions = {};
  let changeActions = {};

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    /* close all open export menus (except for export-menu which toggles) */
    if (!btn || btn.getAttribute('data-action') !== 'export-menu') {
      document.querySelectorAll('.export-group.open').forEach(function (g) { g.classList.remove('open'); });
    }
    if (!btn) return;
    const a = btn.getAttribute('data-action');
    if (viewActions[a]) { viewActions[a](btn, e); return; }
    if (a === 'toggle-lang') {
      const langs = ['en', 'ur', 'ar'];
      const cur = I18N.get();
      const next = langs[(langs.indexOf(cur) + 1) % langs.length];
      I18N.set(next);
      route();
    } else if (a === 'toggle-theme') {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('mdm_theme', cur); } catch (e) {}
      applyLangTheme();
      route();
    } else if (a === 'home') {
      const s = DB.getSession();
      redirect(s && s.role === 'principal' ? 'principal' : 'dashboard');
    } else if (a === 'logout') {
      DB.logout();
      nav('login');
    } else if (a === 'back') {
      if (lastRouteHash && lastRouteHash !== location.hash) {
        isBackNav = true;
        location.hash = lastRouteHash;
      } else {
        const s = DB.getSession();
        redirect(s && s.role === 'principal' ? 'principal' : 'dashboard');
      }
    } else if (a === 'export-menu') {
      document.querySelectorAll('.export-group.open').forEach(function (g) {
        if (g !== btn.closest('.export-group')) g.classList.remove('open');
      });
      const group = btn.closest('.export-group');
      if (group) group.classList.toggle('open');
    } else if (a === 'import-data') {
      const input = document.getElementById('import-file');
      if (input) input.click();
    } else if (a === 'export-excel') {
      exportAllExcel();
    } else if (a === 'export-pdf') {
      exportAllPdf();
    } else if (a === 'export-data') {
      exportData();
    } else if (a === 'go-password') {
      nav('password');
    } else if (a === 'install-app') {
      DB.installApp();
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'import-file') {
      handleImportFile(e.target);
      return;
    }
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = changeActions[el.getAttribute('data-change')];
    if (fn) fn(el, e);
  });

  function applyLangTheme() {
    document.documentElement.setAttribute('lang', I18N.get());
    document.documentElement.setAttribute('dir', I18N.get() === 'ur' || I18N.get() === 'ar' ? 'rtl' : 'ltr');
    let theme = 'light';
    try { theme = localStorage.getItem('mdm_theme') || 'light'; } catch (e) {}
    document.documentElement.setAttribute('data-theme', theme);
  }

  /* ---------- main render ---------- */
  const app = document.getElementById('app');

  async function route() {
    const { seg, q } = parseHash();
    viewActions = {};
    changeActions = {};
    const session = DB.getSession();
    if (seg.length === 0 || seg[0] === 'login') {
      if (session) redirect('dashboard');
      else renderLogin();
      return;
    }
    if (!session) { redirect('login'); return; }

    /* parents only see their own portal */
    if (session.role === 'parent' && seg[0] !== 'parent' && seg[0] !== 'invite') {
      redirect('parent');
      return;
    }
    if (session.role !== 'parent' && (seg[0] === 'parent' || seg[0] === 'invite')) {
      redirect('dashboard');
      return;
    }

    try {
      if (seg[0] === 'dashboard') await renderDashboard(session);
      else if (seg[0] === 'student' && seg[1]) await renderStudentForm(session, seg[1], q.date || todayDs());
      else if (seg[0] === 'history' && seg[1]) await renderHistory(session, seg[1], q);
      else if (seg[0] === 'principal') await renderPrincipal(session);
      else if (seg[0] === 'classes') await renderClasses(session);
      else if (seg[0] === 'class' && seg[1]) await renderClass(session, seg[1]);
      else if (seg[0] === 'pfees') await renderPrincipalFees(session);
      else if (seg[0] === 'fees') await renderQariFees(session);
      else if (seg[0] === 'reports') await renderReports(session);
      else if (seg[0] === 'weekly' && seg[1]) await renderWeekly(session, seg[1]);
      else if (seg[0] === 'monthly' && seg[1]) await renderMonthly(session, seg[1]);
      else if (seg[0] === 'attendance' && seg[1]) await renderAttendance(session, seg[1]);
      else if (seg[0] === 'attendance-class') await renderClassAttendance(session);
      else if (seg[0] === 'quick') await renderQuickEntry(session);
      else if (seg[0] === 'progress' && seg[1]) await renderClassProgress(session, seg[1]);
      else if (seg[0] === 'trash') await renderTrash(session);
      else if (seg[0] === 'password') await renderChangePassword(session);
      else if (seg[0] === 'invite') await renderInvite(session);
      else if (seg[0] === 'parent') await renderParentDashboard(session);
      else redirect('dashboard');
    } catch (e) {
      console.error('Route render failed:', e);
      toast(I18N.get() === 'ur' ? 'کچھ غلط ہو گیا، دوبارہ کوشش کریں' : 'Something went wrong, try again');
      redirect('dashboard');
    }
  }

  let lastRouteHash = null;
  let isBackNav = false;
  window.addEventListener('hashchange', function (e) {
    const old = e.oldURL ? e.oldURL.split('#')[1] : null;
    if (old && old !== 'login' && !isBackNav && !suppressRecord) lastRouteHash = '#' + old;
    isBackNav = false;
    suppressRecord = false;
    route();
  });

  /* ---------- LOGIN ---------- */
  async function renderLogin() {
    applyLangTheme();
    const t = I18N.t;
    app.innerHTML = '' +
      '<div class="login-wrap">' +
        '<div style="position:fixed;top:14px;inset-inline-end:14px;display:flex;gap:8px">' +
          '<button class="icon-btn" data-action="toggle-lang">' + nextLangLabel() + '</button>' +
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
            '<input id="uid" name="uid" autocomplete="username" inputmode="email" placeholder="you@madrasa.com" required>' +
          '</div>' +
          '<div class="field">' +
            '<label for="pwd">' + t('password') + '</label>' +
            '<input id="pwd" name="pwd" type="password" autocomplete="current-password" required>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block">' + t('login') + '</button>' +
        '</form>' +
        '<div style="margin-top:10px;text-align:center">' +
          '<a href="#/parent" style="font-size:.85rem;color:var(--gold)">👨‍👩‍👧 ' + t('invite') + '</a>' +
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

  /* ---------- CHANGE PASSWORD ---------- */
  async function renderChangePassword(session) {
    const t = I18N.t;
    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">🔐</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + t('changePassword') + '</h1>' +
        '<div class="card" style="margin-top:14px">' +
          '<div class="field">' +
            '<label for="cp-cur">' + t('currentPassword') + '</label>' +
            '<input id="cp-cur" type="password" autocomplete="current-password">' +
          '</div>' +
          '<div class="field">' +
            '<label for="cp-new">' + t('newPassword') + '</label>' +
            '<input id="cp-new" type="password" autocomplete="new-password">' +
          '</div>' +
          '<div class="field">' +
            '<label for="cp-conf">' + t('confirmPassword') + '</label>' +
            '<input id="cp-conf" type="password" autocomplete="new-password">' +
          '</div>' +
          '<button class="btn btn-primary btn-block" data-action="cp-save">' + t('changePassword') + '</button>' +
        '</div>' +
      '</main>';

    viewActions['cp-save'] = async function () {
      const cur = document.getElementById('cp-cur').value;
      const nw = document.getElementById('cp-new').value;
      const conf = document.getElementById('cp-conf').value;
      if (nw.length < 6) { toast(t('passwordShort')); return; }
      if (nw !== conf) { toast(t('passwordMismatch')); return; }
      const res = await DB.changePassword(cur, nw);
      if (!res.ok) {
        if (res.error === 'wrong_password') toast(t('wrongPassword'));
        else toast(t('saveFailed'));
        return;
      }
      toast(t('passwordChanged'));
      nav('dashboard');
    };
  }

  /* ---------- INVITE (parent onboarding) ---------- */
  async function renderInvite(session) {
    const t = I18N.t;
    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('invite') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + t('inviteTitle') + '</h1>' +
        '<div class="card" style="margin-top:14px">' +
          '<div style="font-size:.9rem;color:var(--ink-soft);margin-bottom:10px">' + t('inviteSub') + '</div>' +
          '<div class="field">' +
            '<label for="iv-code">' + t('inviteCode') + '</label>' +
            '<input id="iv-code" placeholder="' + t('inviteCodePlaceholder') + '" style="text-transform:uppercase">' +
          '</div>' +
          '<button class="btn btn-primary btn-block" data-action="iv-lookup">' + t('inviteLookup') + '</button>' +
        '</div>' +
        '<div id="iv-result"></div>' +
      '</main>';

    viewActions['iv-lookup'] = async function () {
      const code = document.getElementById('iv-code').value.trim();
      if (!code) return;
      const stu = await DB.lookupInvite(code);
      const box = document.getElementById('iv-result');
      if (!stu) {
        box.innerHTML = '<div class="card" style="margin-top:14px;border-color:var(--bad)">' + t('inviteNotFound') + '</div>';
        return;
      }
      box.innerHTML =
        '<div class="card" style="margin-top:14px">' +
          '<div class="section-title">' + t('inviteConfirmTitle') + '</div>' +
          '<div style="font-size:.9rem;color:var(--ink-soft);margin-bottom:10px">' + t('inviteConfirmSub') + '</div>' +
          '<div class="student-row" style="padding:12px"><div>' +
            '<div style="font-weight:600">' + nameDisplay(stu.name) + '</div>' +
          '</div></div>' +
          '<button class="btn btn-primary btn-block" data-action="iv-claim" style="margin-top:10px">' + t('inviteCreateAccount') + '</button>' +
          '<div style="font-size:.8rem;color:var(--ink-soft);margin-top:8px">' + t('inviteAccountSub') + '</div>' +
        '</div>';
      viewActions['iv-claim'] = async function () {
        const res = await DB.claimInvite(code);
        if (!res.ok) { toast(t('saveFailed')); return; }
        toast(t('inviteLinked'));
        nav('parent');
      };
    };
  }

  /* ---------- PARENT DASHBOARD ---------- */
  async function renderParentDashboard(session) {
    const t = I18N.t;
    const students = await DB.getParentStudents();
    const classes = await DB.getParentClasses();
    const fees = await DB.getAllFees();
    const now = new Date();
    const ym = ymOf(now.getFullYear(), now.getMonth() + 1);
    const daysBack = 13;
    const fromDs = DB.addDays(todayDs(), -daysBack);

    async function childBlock(st) {
      const cls = classes[st.classId];
      const reps = await DB.getParentReportRange(st.id, fromDs, todayDs());
      const keys = Object.keys(reps).sort();
      let present = 0, absent = 0;
      keys.forEach(function (k) { if (reps[k].present) present++; else absent++; });
      const fee = fees[st.id];
      const cur = fee && fee.payments && fee.payments[ym] ? fee.payments[ym].paid : null;
      const rows = keys.slice(-10).reverse().map(function (k) {
        const r = reps[k];
        return '<div class="rep-row">' +
          '<span>' + fmtDate(k) + '</span>' +
          '<span>' + (r.present ? (r.late ? '🕐 ' + t('present') : '✓ ' + t('present')) : '✗ ' + t('absent')) + '</span>' +
          (r.sabaqDone ? '<span class="badge badge-ok">' + t('sabaq') + ': ' + (r.pages || 0) + 'p' + (r.lines ? '+' + r.lines + 'l' : '') + '</span>' : '<span>—</span>') +
          (r.sabqiDone ? '<span class="badge">' + t('sabqi') + '</span>' : '') +
          (r.manzilDone ? '<span class="badge badge-ok">' + t('manzil') + '</span>' : '') +
        '</div>';
      }).join('');
      return (
        '<div class="card" style="margin-top:14px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<div>' +
              '<div style="font-weight:700">' + nameDisplay(st.name) + '</div>' +
              '<div class="meta">' + t('parentClass') + ': ' + nameDisplay(cls ? cls.name : '—') + ' · ' + t('para') + ' ' + num(st.para) + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
              '<span class="badge badge-ok">' + t('parentPresentDays') + ': ' + num(present) + '</span>' +
              '<span class="badge">' + t('parentAbsentDays') + ': ' + num(absent) + '</span>' +
              (fee && fee.amount != null ?
                '<span class="badge' + (cur === true ? ' badge-ok' : '') + '">' + t('parentFeeCurrent') + ': ' + (cur === null ? t('parentFeeNotSet') : cur ? t('parentFeePaid') : t('parentFeeUnpaid')) + '</span>' : '') +
            '</div>' +
          '</div>' +
          (rows ? '<div style="margin-top:10px">' + rows + '</div>' : '<div class="meta" style="margin-top:10px">' + t('noReports') + '</div>') +
        '</div>'
      );
    }

    const blocks = [];
    for (const st of students) blocks.push(await childBlock(st));

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('parentPortal') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + nameDisplay(session.name) + '</h1>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" class="no-print">' +
          '<button class="btn btn-primary btn-sm" data-action="invite-more">+ ' + t('invite') + '</button>' +
          '<a class="btn btn-ghost btn-sm" href="#/password">🔐 ' + t('changePassword') + '</a>' +
          (DB.installable && typeof DB.installable === 'function' && DB.installable() ?
            '<button class="btn btn-ghost btn-sm" data-action="install-app">📲 ' + t('parentInstallApp') + '</button>' : '') +
        '</div>' +
        (blocks.length === 0 ?
          '<div class="card" style="margin-top:14px;border-color:var(--gold);background:var(--gold-soft)">' + t('parentNoStudents') + '</div>' : blocks.join('')) +
      '</main>';

    viewActions['invite-more'] = function () { nav('invite'); };
    viewActions['install-app'] = function () { DB.installApp(); };
  }

  /* ---------- DASHBOARD (qari) ---------- */
  async function renderDashboard(session) {
    const t = I18N.t;
    if (session.role === 'principal') { redirect('principal'); return; }
    const cls = await DB.getClass(session.classId);
    if (!cls) {
      app.innerHTML = '' +
        topbar(false) +
        '<main class="app-main">' +
          '<div class="greet">' +
            '<span class="eyebrow">' + t('welcome') + '</span>' +
            '<h1>' + nameDisplay(session.name) + '</h1>' +
          '</div>' +
          '<div class="empty-note">' + t('noClassAssigned') + '</div>' +
        '</main>';
      return;
    }
    const students = await DB.getStudents(session.classId);
    const today = todayDs();
    const dayReps = await DB.getDayReports(students.map(function (s) { return s.id; }), today);
    let todayReportCount = 0, presentCount = 0;
    const hasReports = {};
    for (const s of students) {
      const rep = dayReps[s.id];
      if (rep) { todayReportCount++; if (rep.present) presentCount++; hasReports[s.id] = true; }
      else hasReports[s.id] = false;
    }

    app.innerHTML = '' +
      topbar(false) +
      '<main class="app-main">' +
        '<div class="greet">' +
          '<span class="eyebrow">' + t('welcome') + '</span>' +
          '<h1>' + nameDisplay(session.name) + '</h1>' +
          '<span class="pill">' + nameDisplay(cls.name) + '</span>' +
        '</div>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="n">' + num(students.length) + '</div><div class="l">' + t('students') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(presentCount) + '</div><div class="l">' + t('presentToday') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(students.length - todayReportCount) + '</div><div class="l">' + t('pendingToday') + '</div></div>' +
        '</div>' +
        '<div class="dash-actions">' +
          '<a class="btn btn-red btn-block" href="#/reports">📊 ' + t('reports') + '</a>' +
          '<a class="btn btn-blue btn-block" href="#/attendance-class">📅 ' + t('attendance') + '</a>' +
          '<a class="btn btn-gold btn-block" href="#/fees">💰 ' + t('qariFees') + '</a>' +
          '<a class="btn btn-ghost btn-block" href="#/quick">⚡ ' + t('quickEntry') + '</a>' +
        '</div>' +
        (students.length - todayReportCount > 0 ?
          '<div class="card" style="margin-top:14px;border-color:var(--gold);background:var(--gold-soft)">' +
            '<div style="font-weight:700;font-size:.95rem;margin-bottom:6px">⚠️ ' + t('reminder') + '</div>' +
            '<div style="margin-bottom:6px;font-size:.85rem">' + t('reminderSub') + '</div>' +
            '<div style="margin-bottom:8px">' +
              students.filter(function (s) { return !hasReports[s.id]; }).map(function (s) {
                return '<a href="#/student/' + s.id + '?date=' + today + '" style="color:var(--link);text-decoration:underline;margin-right:10px;font-size:.85rem">' + nameDisplay(s.name) + '</a>';
              }).join('') +
            '</div>' +
            '<a class="btn btn-primary btn-sm" href="#/quick">⚡ ' + t('enterNow') + '</a>' +
          '</div>' : '') +
        '<div class="section-title">' + t('myStudents') + '</div>' +
        '<div class="student-grid">' +
          students.map(function (s) {
            const done = hasReports[s.id];
            const stTrack = s.type || cls.type || 'hifz';
            return (
              '<a class="student-card" href="#/student/' + s.id + '?date=' + today + '">' +
                '<span class="avatar">' + esc(s.name.charAt(0)) + '</span>' +
                '<span class="s-card-body">' +
                  '<span class="n">' + nameDisplay(s.name) + '</span><br>' +
                  '<span class="m">' + t('para') + ' ' + num(s.para) + ' · ' + t('page') + ' ' + num(s.currentPage || '—') +
                  ' · ' + (stTrack === 'hifz' ? (s.fullTime ? t('fullTime') : t('partTime')) : (s.shift ? (t('shift' + s.shift.replace('sh', '')) + ' (' + (s.shift === 'sh1' ? '8-10' : s.shift === 'sh2' ? '10-12' : s.shift === 'sh3' ? '4-6' : '6-8') + ')') : t('shiftNone'))) + '</span>' +
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

  function draftKey(sid, ds) { return 'md-draft:' + sid + ':' + ds; }

  function loadDraft(sid, ds) {
    try {
      const raw = localStorage.getItem(draftKey(sid, ds));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveDraft(d) {
    if (!d) return;
    try { localStorage.setItem(draftKey(d.sid, d.ds), JSON.stringify(d)); }
    catch (e) { /* storage full/unavailable — ignore */ }
  }

  function clearDraft(sid, ds) {
    try { localStorage.removeItem(draftKey(sid, ds)); } catch (e) { /* ignore */ }
  }

  function buildDraft(sid, ds, existing) {
    const saved = loadDraft(sid, ds);
    if (saved && saved.sid === sid && saved.ds === ds) return saved;
    const r = existing || {};
    return {
      sid: sid, ds: ds,
      present: r.present !== undefined ? r.present : true,
      late: !!r.late,
      sabaqDone: !!r.sabaqDone,
      sabqiDone: !!r.sabqiDone,
      manzilDone: !!r.manzilDone,
      manzil: r.manzil || 'half',
      pages: r.pages || 0,
      lines: r.lines || 0,
      manzilPages: r.manzilPages || 0,
      manzilLines: r.manzilLines || 0,
      comment: r.comment || ''
    };
  }

  function captureWidgets() {
    const g = function (id) { return document.getElementById(id); };
    const s1 = g('sw-sabaq'), s2 = g('sw-sabqi'), s3 = g('sw-manzil'), s4 = g('sw-late');
    if (s1) draft.sabaqDone = s1.checked;
    if (s2) draft.sabqiDone = s2.checked;
    if (s3) draft.manzilDone = s3.checked;
    if (s4) draft.late = s4.checked;
    const pg = g('f-pages'), ln = g('f-lines');
    if (pg) draft.pages = parseInt(pg.value, 10) || 0;
    if (ln) draft.lines = parseInt(ln.value, 10) || 0;
    const mpg = g('f-mpages'), mln = g('f-mlines');
    if (mpg) draft.manzilPages = parseInt(mpg.value, 10) || 0;
    if (mln) draft.manzilLines = parseInt(mln.value, 10) || 0;
    const mp = app.querySelector('.seg.tri .opt.on');
    if (mp) draft.manzil = mp.getAttribute('data-v');
    const cm = g('f-comment');
    if (cm) draft.comment = cm.value;
    saveDraft(draft);
  }

  function wireDraftAutosave() {
    const ids = ['sw-sabaq', 'sw-sabqi', 'sw-manzil', 'sw-late', 'f-pages', 'f-lines', 'f-mpages', 'f-mlines', 'f-comment'];
    ids.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        if (draft && draft.sid) {
          captureWidgets();
          const badge = document.getElementById('draft-badge');
          if (badge) badge.style.display = 'inline-flex';
        }
      });
      el.addEventListener('input', function () {
        if (draft && draft.sid) {
          captureWidgets();
          const badge = document.getElementById('draft-badge');
          if (badge) badge.style.display = 'inline-flex';
        }
      });
    });
  }

  async function renderStudentForm(session, sid, ds) {
    const t = I18N.t;
    if (session.role === 'principal') { redirect('history/' + sid); return; }
    const student = await DB.getStudent(sid);
    if (!student) { redirect('dashboard'); return; }
    if (session.role === 'qari' && session.classId !== student.classId) { redirect('dashboard'); return; }
    const cls = await DB.getClass(student.classId);
    const track = student.type || (cls && cls.type) || 'hifz';

    const existing = await DB.getReport(sid, ds);
    if (!draft || draft.sid !== sid || draft.ds !== ds) draft = buildDraft(sid, ds, existing);
    const rep = draft;
    const today = todayDs();
    const yest = yesterdayDs();
    const locked = ds < yest;
    const manzilOpts = [['half', t('halfPara')], ['third', t('thirdPara')], ['full', t('fullPara')]];

    /* which fields a student of this track gets */
    const showSabqi = track === 'hifz';
    const showManzil = track !== 'qaida';
    const manzilIsTri = track === 'hifz';
    const trackLabel = t(track === 'hifz' ? 'hifz' : track === 'tilawa' ? 'tilawa' : 'qaida');

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('reportFor') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + nameDisplay(student.name) + '</h1>' +
        '<div class="pill" style="margin-top:8px">' + t('para') + ' ' + num(student.para) + ' · ' + t('category') + ' ' + esc(student.category) + ' · ' + esc(trackLabel) +
          (track !== 'hifz' && student.shift ? ' · 🕗 ' + esc(t('shift' + student.shift.replace('sh', '')) + ' (' + (student.shift === 'sh1' ? '8-10' : student.shift === 'sh2' ? '10-12' : student.shift === 'sh3' ? '4-6' : '6-8') + ')') : '') + '</div>' +
        (locked ? '<div class="card" style="margin-top:14px;border-color:var(--bad)">' + t('locked') + '</div>' : '') +
        (!existing ? '<div class="card" style="margin-top:14px;border-color:var(--gold);background:var(--gold-soft)">' + t('noReportForDay') + '</div>' : '') +
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
          (rep.present ?
            '<div class="tick-row" style="margin-top:8px">' +
              '<div><div class="lbl">' + t('late') + '</div><div class="sub">' + t('lateSub') + '</div></div>' +
              '<label class="switch"><input type="checkbox" id="sw-late"' + (rep.late ? ' checked' : '') + (locked ? ' disabled' : '') + '><span class="track"></span></label>' +
            '</div>' : '') +
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
            (showSabqi ?
              '<div class="tick-row">' +
                '<div><div class="lbl">' + t('sabqi') + '</div><div class="sub">' + t('sabqiSub') + '</div></div>' +
                '<label class="switch"><input type="checkbox" id="sw-sabqi"' + (rep.sabqiDone ? ' checked' : '') + (locked ? ' disabled' : '') + '><span class="track"></span></label>' +
              '</div>' : '') +
            (showManzil ?
              '<div class="tick-row">' +
                '<div><div class="lbl">' + t('manzil') + '</div><div class="sub">' + t('manzilSub') + '</div></div>' +
                '<label class="switch"><input type="checkbox" id="sw-manzil"' + (rep.manzilDone ? ' checked' : '') + (locked ? ' disabled' : '') + '><span class="track"></span></label>' +
              '</div>' : '') +
            (showManzil && manzilIsTri ?
              '<div class="reveal' + (rep.manzilDone ? ' open' : '') + '" id="reveal-manzil">' +
                '<div class="seg tri">' +
                  manzilOpts.map(function (o) {
                    return '<button type="button" class="opt' + (rep.manzil === o[0] ? ' on' : '') + '" data-action="set-manzil" data-v="' + o[0] + '"' + (locked ? ' disabled' : '') + '>' + o[1] + '</button>';
                  }).join('') +
                '</div>' +
              '</div>' : '') +
            (showManzil && !manzilIsTri ?
              '<div class="reveal' + (rep.manzilDone ? ' open' : '') + '" id="reveal-manzil">' +
                '<div class="sub-row">' +
                  '<div class="field"><label for="f-mpages">' + t('pages') + '</label>' +
                    '<select id="f-mpages"' + (locked ? ' disabled' : '') + '>' + rangeOpts(10, rep.manzilPages) + '</select></div>' +
                  '<div class="field"><label for="f-mlines">' + t('lines') + '</label>' +
                    '<select id="f-mlines"' + (locked ? ' disabled' : '') + '>' + rangeOpts(20, rep.manzilLines) + '</select></div>' +
                '</div>' +
              '</div>' : '') +
            '<div class="field" style="margin-top:12px">' +
              '<label for="f-comment">' + t('commentForParents') + ' <small style="color:var(--ink-soft)">' + t('commentHint') + '</small></label>' +
              '<textarea id="f-comment" rows="2" placeholder="' + t('commentHint') + '"' + (locked ? ' disabled' : '') + '>' + esc(rep.comment || '') + '</textarea>' +
            '</div>' +
          '</div>' : '') +
        '<div style="display:flex;gap:10px;margin-top:16px;align-items:center">' +
          (!locked ? '<button class="btn btn-primary btn-block" data-action="save-report">' + t('save') + '</button>' : '') +
          '<a class="btn btn-ghost" href="#/history/' + sid + '">' + t('viewHistory') + '</a>' +
        '</div>' +
        '<div id="draft-badge" style="display:none;margin-top:10px;align-items:center;gap:6px;color:var(--gold);font-size:.8rem">💾 ' + t('draftSaved') + '</div>' +
      '</main>';

    changeActions['f-date'] = function (el) {
      draft = null;
      const v = el.value;
      if (v) nav('student/' + sid + '?date=' + v);
    };
    if (rep.present) {
      document.getElementById('sw-late').addEventListener('change', function () { draft.late = this.checked; });
      document.getElementById('sw-sabaq').addEventListener('change', function () {
        draft.sabaqDone = this.checked;
        document.getElementById('reveal-sabaq').classList.toggle('open', this.checked);
      });
      if (showSabqi) {
        document.getElementById('sw-sabqi').addEventListener('change', function () { draft.sabqiDone = this.checked; });
      }
      if (showManzil) {
        document.getElementById('sw-manzil').addEventListener('change', function () {
          draft.manzilDone = this.checked;
          document.getElementById('reveal-manzil').classList.toggle('open', this.checked);
        });
      }
    }
    wireDraftAutosave();

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
      saveDraft(draft);
      const badge = document.getElementById('draft-badge');
      if (badge) badge.style.display = 'inline-flex';
    };
    viewActions['save-report'] = function () {
      captureWidgets();
      const rep2 = {
        present: draft.present,
        late: draft.present && draft.late,
        sabaqDone: draft.present && draft.sabaqDone,
        pages: draft.present && draft.sabaqDone ? (draft.pages || null) : null,
        lines: draft.present && draft.sabaqDone ? (draft.lines || null) : null,
        sabqiDone: draft.present && draft.sabqiDone,
        manzilDone: draft.present && draft.manzilDone,
        manzil: draft.present && draft.manzilDone && manzilIsTri ? draft.manzil : null,
        manzilPages: draft.present && draft.manzilDone && !manzilIsTri ? (draft.manzilPages || null) : null,
        manzilLines: draft.present && draft.manzilDone && !manzilIsTri ? (draft.manzilLines || null) : null,
        comment: draft.present ? (draft.comment.trim() || null) : null
      };
      if (rep2.sabaqDone && !rep2.pages && !rep2.lines) {
        toast(I18N.get() === 'ur' ? 'سبق کے لیے صفحات یا سطریں منتخب کریں' : 'Select pages or lines for Sabaq.');
        return;
      }
      DB.saveReport(sid, ds, rep2).then(function (res) {
        if (res && res.ok === false) { toast(t('saveFailed')); return; }
        clearDraft(sid, ds);
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

  function progressChart(rows, y, m) {
    const days = [];
    for (let i = 1; i <= 31; i++) {
      const ds = y + '-' + String(m).padStart(2, '0') + '-' + String(i).padStart(2, '0');
      days.push(ds);
    }
    const vals = days.map(function (ds) {
      const r = rows.find(function (x) { return x.ds === ds; });
      if (!r || !r.r.present || !r.r.sabaqDone) return 0;
      return (r.r.pages || 0) + (r.r.lines > 0 ? r.r.lines / 20 : 0);
    });
    const max = Math.max.apply(null, vals);
    if (!max) return '';
    const W = 260, H = 80, PAD = 4, BW = Math.max(4, Math.floor((W - PAD * 2) / vals.length));
    let bars = '';
    vals.forEach(function (v, i) {
      const bh = v > 0 ? Math.max(2, Math.round((v / max) * (H - PAD * 2))) : 0;
      const x = PAD + i * BW;
      const yb = H - PAD - bh;
      bars += '<rect x="' + x + '" y="' + yb + '" width="' + Math.max(1, BW - 1) + '" height="' + bh + '" fill="' + (v > 0 ? '#0E6B3C' : '#e0d8c8') + '" rx="1"/>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:320px;display:block;margin:0 auto">' +
      '<text x="2" y="12" font-size="9" fill="#888">' + (Math.round(max * 10) / 10) + '</text>' +
      '<text x="2" y="' + (H - 2) + '" font-size="9" fill="#888">0</text>' +
      bars +
      '</svg>';
  }

  /* ---------- HISTORY ---------- */
  async function renderHistory(session, sid, q) {
    const t = I18N.t;
    const student = await DB.getStudent(sid);
    if (!student) { redirect('dashboard'); return; }
    if (session.role === 'qari' && session.classId !== student.classId) { redirect('dashboard'); return; }
    const clsH = await DB.getClass(student.classId);
    const trackH = student.type || (clsH && clsH.type) || 'hifz';
    const manzilIsTri = trackH === 'hifz';

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
    const canEdit = session.role !== 'principal';
    const rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = sel.y + '-' + String(sel.m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      if (ds > today) continue;
      const r = reps[ds];
      if (!r) continue;
      if (r.present) presentCount++; else absentCount++;
      rows.push({ ds: ds, r: r });
    }

    const manzilName = function (r) {
      if (!r.present || !r.manzilDone) return '—';
      if (manzilIsTri) {
        if (r.manzil === 'half') return t('halfPara');
        if (r.manzil === 'third') return t('thirdPara');
        if (r.manzil === 'full') return t('fullPara');
        return '—';
      }
      const parts = [];
      if (r.manzilPages) parts.push(num(r.manzilPages) + 'p');
      if (r.manzilLines) parts.push(num(r.manzilLines) + 'l');
      return parts.join('+') || '—';
    };
    const sabaqCell = function (r) {
      if (!r.present) return '—';
      if (!r.sabaqDone) return t('notDone');
      const parts = [];
      if (r.pages) parts.push(num(r.pages) + 'p');
      if (r.lines) parts.push(num(r.lines) + 'l');
      return parts.join('+') || '—';
    };

    const chart = progressChart(rows, sel.y, sel.m);

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('historyTitle') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + nameDisplay(student.name) + '</h1>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" class="no-print">' +
          '<a class="btn btn-ghost btn-sm" href="#/attendance/' + sid + '">📅 ' + t('attendance') + '</a>' +
          '<button class="btn btn-ghost btn-sm" data-action="report-card">🖨 ' + t('reportCard') + '</button>' +
        '</div>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="n">' + num(presentCount) + '</div><div class="l">' + t('presentCount') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(absentCount) + '</div><div class="l">' + t('absentDays') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(rows.length) + '</div><div class="l">' + t('totalDays') + '</div></div>' +
        '</div>' +
        (chart ? '<div class="card" style="margin-top:14px;padding:14px">' +
          '<div class="section-title" style="margin-bottom:6px">📈 ' + t('progressChart') + '</div>' +
          chart +
        '</div>' : '') +
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
            '<thead><tr><th>' + t('day') + '</th><th>' + t('date') + '</th><th>' + t('status') + '</th><th>' + t('sabaq') + '</th><th>' + t('sabqi') + '</th><th>' + t('manzil') + '</th><th>' + t('comment') + '</th></tr></thead>' +
            '<tbody>' +
              rows.map(function (row) {
                const r = row.r;
                return (
                  '<tr class="' + (r.present ? '' : 'absent') + '"' + (canEdit ? ' style="cursor:pointer" data-row="' + row.ds + '" data-action="row-open"' : '') + '>' +
                    '<td class="num">' + num(parseInt(row.ds.slice(8), 10)) + '</td>' +
                    '<td>' + fmtDate(row.ds) + '</td>' +
                    '<td>' + (r.present ? '✓ ' + t('present') : '✗ ' + t('absent')) + '</td>' +
                    '<td>' + sabaqCell(r) + '</td>' +
                    '<td>' + (r.present ? (r.sabqiDone ? '✓' : '—') : '—') + '</td>' +
                    '<td>' + (r.present ? manzilName(r) : '—') + '</td>' +
                    '<td class="cmt">' + (r.comment ? esc(r.comment) : '—') + '</td>' +
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
      if (!canEdit) return;
      const tr = btn.closest('[data-row]');
      if (tr) nav('student/' + sid + '?date=' + tr.getAttribute('data-row'));
    };
    viewActions['report-card'] = function () {
      exportStudentReportCard(sid);
    };
  }

  /* ---------- PRINCIPAL hub ---------- */
  async function renderPrincipal(session) {
    const t = I18N.t;
    if (session.role !== 'principal') { redirect('dashboard'); return; }
    const classes = await DB.getClasses();

    app.innerHTML = '' +
      topbar(false) +
      '<main class="app-main">' +
        '<div class="greet">' +
          '<span class="eyebrow">' + t('welcome') + '</span>' +
          '<h1>' + nameDisplay(session.name) + '</h1>' +
          '<span class="pill">' + t('principal') + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center" class="no-print">' +
          exportGroup([
            { action: 'export-excel', label: '⬇ ' + t('exportExcel') },
            { action: 'export-pdf', label: '⬇ ' + t('exportPdf') },
            { action: 'export-data', label: '⬇ ' + t('exportData') }
          ]) +
          importButton() +
        '</div>' +
        '<div style="display:grid;gap:10px;margin-top:18px">' +
          '<a class="class-row" href="#/classes">' +
            '<span class="avatar">🗂</span>' +
            '<span><span class="nm">' + t('classes') + '</span><br><span class="sub">' + num(classes.length) + ' ' + t('classes') + '</span></span>' +
            '<span style="margin-inline-start:auto;color:var(--gold)">&rsaquo;</span>' +
          '</a>' +
          '<a class="class-row" href="#/reports">' +
            '<span class="avatar">📊</span>' +
            '<span><span class="nm">' + t('reports') + '</span><br><span class="sub">' + t('reportsSub') + '</span></span>' +
            '<span style="margin-inline-start:auto;color:var(--gold)">&rsaquo;</span>' +
          '</a>' +
          '<a class="class-row" href="#/pfees">' +
            '<span class="avatar">💰</span>' +
            '<span><span class="nm">' + t('fees') + '</span><br><span class="sub">' + t('principalFees') + '</span></span>' +
            '<span style="margin-inline-start:auto;color:var(--gold)">&rsaquo;</span>' +
          '</a>' +
          '<a class="class-row" href="#/trash">' +
            '<span class="avatar">🗃</span>' +
            '<span><span class="nm">' + t('trash') + '</span><br><span class="sub">' + t('trashSub') + '</span></span>' +
            '<span style="margin-inline-start:auto;color:var(--gold)">&rsaquo;</span>' +
          '</a>' +
        '</div>' +
      '</main>';
  }

  /* ---------- CLASS LIST (principal, full management) ---------- */
  async function renderClasses(session) {
    const t = I18N.t;
    if (session.role !== 'principal') { redirect('dashboard'); return; }
    const classes = await DB.getClasses();
    const classOrder = ['atta','anees','hussain','taj','ahsan','osama'];
    classes.sort(function (a, b) {
      var ia = classOrder.indexOf(a.name.toLowerCase());
      var ib = classOrder.indexOf(b.name.toLowerCase());
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      var ta = a.type === 'hifz' ? 0 : a.type === 'tilawa' ? 1 : 2;
      var tb = b.type === 'hifz' ? 0 : b.type === 'tilawa' ? 1 : 2;
      return ta - tb;
    });
    const studentsByClass = await DB.getStudentsByClass(classes.map(function (c) { return c.id; }));
    const counts = {};
    for (const c of classes) {
      counts[c.id] = (studentsByClass[c.id] || []).length;
    }

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<div class="greet">' +
          '<span class="eyebrow">' + t('welcome') + '</span>' +
          '<h1>' + nameDisplay(session.name) + '</h1>' +
          '<span class="pill">' + t('principal') + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" class="no-print">' +
          '<button class="btn btn-primary btn-sm" data-action="add-class">+ ' + t('addClass') + '</button>' +
        '</div>' +
        '<div class="section-title">' + t('classes') + '</div>' +
        classes.map(function (c) {
          const typeLabel = t(c.type === 'hifz' ? 'hifz' : c.type === 'tilawa' ? 'tilawa' : c.type === 'qaida' ? 'qaida' : 'hifz');
          return (
            '<div class="class-card" style="margin-bottom:10px">' +
              '<a class="class-row" href="#/class/' + c.id + '" style="flex:1">' +
                '<span class="avatar">' + esc(c.name.charAt(c.name.length - 1)) + '</span>' +
                '<span><span class="nm">' + nameDisplay(c.name) + '</span><br><span class="sub">' + num(counts[c.id]) + ' ' + t('students') + ' · ' + esc(typeLabel) + '</span></span>' +
                '<span style="color:var(--gold)">&rsaquo;</span>' +
              '</a>' +
              '<div class="row-actions" style="padding:10px">' +
                '<button class="icon-mini" data-action="edit-class" data-id="' + c.id + '" title="' + t('editClass') + '">✎</button>' +
                '<button class="icon-mini danger" data-action="del-class" data-id="' + c.id + '" title="' + t('deleteClass') + '">🗑</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</main>';

    const openClassModal = function (cls) {
      const isEdit = !!cls;
      const b = document.createElement('div');
      b.className = 'modal-back';
      b.innerHTML =
          '<div class="modal">' +
          '<h3>' + (isEdit ? t('editClass') : t('addClass')) + '</h3>' +
          '<div class="field"><label>' + t('classQari') + '</label><input id="m-cname" value="' + esc(cls ? cls.name : '') + '" placeholder="Ustad ' + t('name') + '"></div>' +
          '<div class="field"><label>' + t('classType') + '</label>' +
            '<select id="m-ctype">' +
              '<option value="hifz"' + ((cls ? cls.type : 'hifz') === 'hifz' ? ' selected' : '') + '>' + t('hifz') + '</option>' +
              '<option value="tilawa"' + ((cls ? cls.type : '') === 'tilawa' ? ' selected' : '') + '>' + t('tilawa') + '</option>' +
              '<option value="qaida"' + ((cls ? cls.type : '') === 'qaida' ? ' selected' : '') + '>' + t('qaida') + '</option>' +
            '</select>' +
          '</div>' +
          '<div style="display:flex;gap:10px">' +
            '<button class="btn btn-primary btn-block" data-action="m-c-save">' + t('saveOk') + '</button>' +
            '<button class="btn btn-ghost" data-action="m-c-cancel">' + t('cancel') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(b);
      b.addEventListener('click', function (e) {
        const a = e.target.closest('[data-action]');
        if (!a) return;
        if (a.getAttribute('data-action') === 'm-c-cancel' || e.target === b) {
          b.remove();
          return;
        }
        if (a.getAttribute('data-action') === 'm-c-save') {
          const name = document.getElementById('m-cname').value.trim();
          if (!name) { toast(I18N.get() === 'ur' ? 'قاری صاحب کا نام درج کریں' : 'Enter the Qari Sahab name'); return; }
          if (!isEdit && classes.some(function (c) { return c.name.toLowerCase() === name.toLowerCase(); })) {
            toast(I18N.get() === 'ur' ? 'یہ قاری صاحب پہلے سے موجود ہیں' : 'This Qari Sahab already has a class');
            return;
          }
          const ctype = document.getElementById('m-ctype').value;
          DB.saveClass(Object.assign({}, cls || {}, { name: name, type: ctype })).then(function () {
            b.remove();
            renderClasses(session);
          });
        }
      });
    };

    viewActions['add-class'] = function () { openClassModal(null); };
    viewActions['edit-class'] = function (btn) {
      const c = classes.find(function (x) { return x.id === btn.getAttribute('data-id'); });
      if (c) openClassModal(c);
    };
    viewActions['del-class'] = function (btn) {
      const c = classes.find(function (x) { return x.id === btn.getAttribute('data-id'); });
      if (!c) return;
      if (!confirm(t('confirmFirstDelete') + '\n\n' + c.name)) return;
      if (!confirm(t('confirmSecondDelete'))) return;
      DB.deleteClass(c.id).then(function () { renderClasses(session); });
    };
  }

  /* ---------- RECENTLY DELETED (TRASH) ---------- */
  async function renderTrash(session) {
    const t = I18N.t;
    if (session.role !== 'principal') { redirect('dashboard'); return; }
    const items = await DB.getTrash();

    function fmtDate(ts) {
      const d = new Date(ts);
      return d.toLocaleDateString(I18N.get() === 'ur' ? 'ur-PK' : I18N.get() === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('principal') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">🗃 ' + esc(t('trash')) + '</h1>' +
        '<div class="meta" style="margin-bottom:16px">' + t('trashSub') + '</div>' +
        (items.length === 0 ?
          '<div class="empty-note">' + t('trashEmpty') + '</div>' :
            items.map(function (item) {
              const p = item.payload;
              const label = item.kind === 'class' ? (p.cls ? nameDisplay(p.cls.name) : '?') : (p.st ? nameDisplay(p.st.name) : '?');
              const sub = item.kind === 'class' ? t('trashClass') + ' · ' + (p.students ? p.students.length : 0) + ' ' + t('students') : t('trashStudent');
              return (
                '<div class="class-card" style="margin-bottom:10px">' +
                  '<div class="class-row" style="flex:1;padding:14px">' +
                    '<span class="avatar" style="background:var(--ink-soft);color:#fff">' + (item.kind === 'class' ? '🏫' : '👤') + '</span>' +
                    '<span>' +
                      '<span class="nm">' + label + '</span><br>' +
                      '<span class="sub">' + sub + ' · ' + t('deletedOn') + ' ' + fmtDate(item.deletedAt) + '</span>' +
                    '</span>' +
                  '</div>' +
                  '<div class="row-actions" style="padding:10px">' +
                    '<button class="icon-mini" data-action="restore-item" data-id="' + item.id + '" title="' + t('restore') + '">↩</button>' +
                  '</div>' +
                '</div>'
              );
            }).join('')
        ) +
      '</main>';

    viewActions['restore-item'] = function (btn) {
      const id = btn.getAttribute('data-id');
      DB.restoreTrashItem(id).then(function (r) {
        if (r.ok) { toast(t('restoreOk')); renderTrash(session); }
        else toast(r.error === 'exists' ? (I18N.get() === 'ur' ? 'یہ آئٹم پہلے سے موجود ہے' : 'Item already exists') : (I18N.get() === 'ur' ? 'بحال نہیں ہو سکا' : 'Could not restore'));
      });
    };
  }

  /* ---------- CLASS VIEW (principal) ---------- */
  async function renderClass(session, cid) {
    const t = I18N.t;
    if (session.role !== 'principal') { redirect('dashboard'); return; }
    const cls = await DB.getClass(cid);
    if (!cls) { redirect('principal'); return; }
    const students = await DB.getStudents(cid);
    const typeLabel = function (c) { return t(c.type === 'hifz' ? 'hifz' : c.type === 'tilawa' ? 'tilawa' : c.type === 'qaida' ? 'qaida' : 'hifz'); };
    const trackLabel = function (st) { var ty = st.type || cls.type || 'hifz'; return t(ty === 'hifz' ? 'hifz' : ty === 'tilawa' ? 'tilawa' : 'qaida'); };

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('classes') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + nameDisplay(cls.name) + '</h1>' +
        '<div class="pill" style="margin-top:8px">' + typeLabel(cls) + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center" class="no-print">' +
          '<button class="btn btn-primary btn-sm" data-action="add-student">+ ' + t('addStudent') + '</button>' +
          '<a class="btn btn-ghost btn-sm" href="#/progress/' + cid + '">📈 ' + t('classProgress') + '</a>' +
          exportGroup([
            { action: 'export-excel-class', label: '⬇ ' + t('exportExcel') },
            { action: 'export-pdf-class', label: '⬇ ' + t('exportPdf') }
          ]) +
        '</div>' +
        '<div class="section-title">' + t('students') + '</div>' +
        (students.length === 0 ?
          '<div class="empty-note">' + t('noStudents') + ' — <a href="#" data-action="add-student">' + t('addFirst') + '</a></div>' :
          renderStudentGroups(students)) +
      '</main>';

    function renderStudentGroups(list) {
      const shifts = [
        { key: 'sh1', label: t('shift1') + ' (8-10)' },
        { key: 'sh2', label: t('shift2') + ' (10-12)' },
        { key: 'sh3', label: t('shift3') + ' (4-6)' },
        { key: 'sh4', label: t('shift4') + ' (6-8)' }
      ];
      if ((cls.type || 'hifz') === 'hifz') {
        return list.map(studentRow).join('');
      }
      var out = '';
      shifts.forEach(function (sh) {
        var grp = list.filter(function (s) { return (s.shift || '') === sh.key; });
        if (!grp.length) return;
        out += '<div class="shift-group">' +
               '<div class="shift-header">🕗 ' + sh.label + ' <span class="badge">' + grp.length + ' ' + t('shiftStudents') + '</span></div>' +
               grp.map(studentRow).join('') +
               '</div>';
      });
      var unassigned = list.filter(function (s) {
        return !s.shift;
      });
      if (unassigned.length) {
        out += '<div class="shift-group">' +
               '<div class="shift-header">— ' + t('shiftNone') + ' <span class="badge">' + unassigned.length + ' ' + t('shiftStudents') + '</span></div>' +
               unassigned.map(studentRow).join('') +
               '</div>';
      }
      return out;
    }

    function studentRow(s) {
      var ty = s.type || cls.type || 'hifz';
      return (
        '<div class="student-row">' +
          '<div>' +
            '<div style="font-weight:600">' + nameDisplay(s.name) + ' <span class="badge badge-cat">' + esc(s.category) + '</span> ' +
              (ty === 'hifz'
                ? '<span class="badge">' + (s.fullTime ? t('fullTime') : t('partTime')) + '</span>'
                : '<span class="badge badge-shift">' + esc(s.shift ? (t('shift' + s.shift.replace('sh', '')) + ' (' + (s.shift === 'sh1' ? '8-10' : s.shift === 'sh2' ? '10-12' : s.shift === 'sh3' ? '4-6' : '6-8') + ')') : t('shiftNone')) + '</span>') +
              ' <span class="badge badge-track">' + esc(trackLabel(s)) + '</span></div>' +
            '<div class="meta">' + t('para') + ' ' + num(s.para) + ' · ' + t('page') + ' ' + num(s.currentPage || '—') + ' · ' + t('age') + ' ' + num(s.age) + ' · ' + esc(s.parentName) + ' · ' + esc(s.parentNumber) + '</div>' +
          '</div>' +
          '<div class="row-actions">' +
            '<a class="icon-mini" href="#/attendance/' + s.id + '" title="' + t('attendance') + '">📅</a>' +
            '<button class="icon-mini" data-action="view-student" data-id="' + s.id + '" title="' + t('view') + '">👁</button>' +
            '<button class="icon-mini" data-action="edit-student" data-id="' + s.id + '" title="' + t('edit') + '">✎</button>' +
            '<button class="icon-mini danger" data-action="del-student" data-id="' + s.id + '" title="' + t('remove') + '">🗑</button>' +
          '</div>' +
        '</div>'
      );
    }


    viewActions['add-student'] = function () { openModal({ classId: cid, category: 'A' }); };
    viewActions['edit-student'] = function (btn) {
      const st = students.find(function (s) { return s.id === btn.getAttribute('data-id'); });
      if (st) openModal(st);
    };
    viewActions['del-student'] = function (btn) {
      const st = students.find(function (s) { return s.id === btn.getAttribute('data-id'); });
      if (!st) return;
      if (!confirm(t('confirmFirstDelete') + '\n\n' + nameClean(st.name))) return;
      if (!confirm(t('confirmSecondDelete'))) return;
      DB.deleteStudent(st.id).then(function () { renderClass(session, cid); });
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
      const fullSel = function (full) {
        return '<option value="full"' + (full !== false ? ' selected' : '') + '>' + t('fullTime') + '</option>' +
               '<option value="part"' + (full === false ? ' selected' : '') + '>' + t('partTime') + '</option>';
      };
      const trackOpts = function (cur) {
        return '<option value=""' + (!cur ? ' selected' : '') + '>' + t('trackDefault') + ' (' + t(cls.type === 'hifz' ? 'hifz' : cls.type === 'tilawa' ? 'tilawa' : cls.type === 'qaida' ? 'qaida' : 'hifz') + ')</option>' +
               '<option value="hifz"' + (cur === 'hifz' ? ' selected' : '') + '>' + t('hifz') + '</option>' +
               '<option value="tilawa"' + (cur === 'tilawa' ? ' selected' : '') + '>' + t('tilawa') + '</option>' +
               '<option value="qaida"' + (cur === 'qaida' ? ' selected' : '') + '>' + t('qaida') + '</option>';
      };
      const shiftSel = function (cur) {
        return '<option value=""' + (!cur ? ' selected' : '') + '>' + t('shiftNone') + '</option>' +
               '<option value="sh1"' + (cur === 'sh1' ? ' selected' : '') + '>' + t('shift1') + ' (8-10)</option>' +
               '<option value="sh2"' + (cur === 'sh2' ? ' selected' : '') + '>' + t('shift2') + ' (10-12)</option>' +
               '<option value="sh3"' + (cur === 'sh3' ? ' selected' : '') + '>' + t('shift3') + ' (4-6)</option>' +
               '<option value="sh4"' + (cur === 'sh4' ? ' selected' : '') + '>' + t('shift4') + ' (6-8)</option>';
      };
      const defTrack = st.type || cls.type || 'hifz';
      const applyTrackUi = function () {
        const tr = (document.getElementById('m-track').value || defTrack) === 'hifz';
        document.getElementById('m-full-wrap').style.display = tr ? '' : 'none';
        document.getElementById('m-shift-wrap').style.display = tr ? 'none' : '';
      };
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
          '<div class="field"><label>' + t('currentPage') + ' — <small style="color:var(--ink-soft)">' + t('currentPageHint') + '</small></label>' +
            '<input id="m-page" type="number" min="1" max="604" value="' + (st.currentPage || '') + '"></div>' +
          '<div class="field" id="m-full-wrap"><label>' + t('fullTime') + ' / ' + t('partTime') + '</label>' +
            '<select id="m-full">' + fullSel(st.fullTime) + '</select></div>' +
          '<div class="field" id="m-shift-wrap" style="display:none"><label>' + t('shift') + ' — <small style="color:var(--ink-soft)">' + t('shiftHint') + '</small></label>' +
            '<select id="m-shift">' + shiftSel(st.shift) + '</select></div>' +
          '<div class="field"><label>' + t('trackLabel') + ' — <small style="color:var(--ink-soft)">' + t('trackHint') + '</small></label>' +
            '<select id="m-track">' + trackOpts(st.type) + '</select></div>' +
          (st.inviteCode ?
            '<div class="field"><label>' + t('inviteCode') + '</label>' +
              '<div style="display:flex;gap:8px">' +
                '<input id="m-invite" value="' + esc(st.inviteCode) + '" readonly style="background:var(--surface-2)">' +
                '<button class="btn btn-ghost btn-sm" data-action="m-copy-invite">📋</button>' +
              '</div>' +
            '</div>' : '') +
          '<div class="field"><label>' + t('parentName') + '</label><input id="m-pname" value="' + esc(st.parentName || '') + '"></div>' +
          '<div class="field"><label>' + t('parentNumber') + '</label><input id="m-pphone" type="tel" value="' + esc(st.parentNumber || '') + '"></div>' +
          '<div class="field"><label>' + t('category') + ' — <small style="color:var(--ink-soft)">' + t('catHint') + '</small></label>' +
            '<select id="m-cat">' + opts + '</select></div>' +
          '<div style="display:flex;gap:10px">' +
            '<button class="btn btn-primary btn-block" data-action="m-save">' + t('saveOk') + '</button>' +
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
        if (a.getAttribute('data-action') === 'm-copy-invite') {
          const iv = document.getElementById('m-invite');
          if (iv && iv.value) {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(iv.value);
            toast(I18N.t('inviteCopied'));
          }
          return;
        }
        if (a.getAttribute('data-action') === 'm-save') {
          const st2 = Object.assign({}, currentEdit, {
            name: document.getElementById('m-name').value.trim(),
            age: parseInt(document.getElementById('m-age').value, 10) || null,
            para: parseInt(document.getElementById('m-para').value, 10) || null,
            currentPage: parseInt(document.getElementById('m-page').value, 10) || null,
            fullTime: document.getElementById('m-full').value === 'full',
            type: document.getElementById('m-track').value || null,
            shift: document.getElementById('m-shift').value || null,
            parentName: document.getElementById('m-pname').value.trim(),
            parentNumber: document.getElementById('m-pphone').value.replace(/\D/g, ''),
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

  /* ---------- FEES — qari (mark paid, amounts hidden) ---------- */
  function feeMonths(count) {
    const now = new Date();
    const out = [];
    const n = count || 6;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
    }
    return out;
  }

  function ymOf(y, m) {
    return y + '-' + String(m).padStart(2, '0');
  }

  /* shared in-place button painter */
  function paintFeeBtns(row, paid, t) {
    const btns = row.querySelectorAll('[data-v]');
    const b1 = btns[0], b2 = btns[1];
    if (b1) {
      b1.className = 'btn btn-sm ' + (paid ? 'btn-ok' : 'btn-ghost');
      b1.innerHTML = (paid ? '✓ ' : '') + t('paid');
    }
    if (b2) {
      b2.className = 'btn btn-sm ' + (!paid ? 'btn-bad' : 'btn-ghost');
      b2.innerHTML = (!paid ? '✗ ' : '') + t('unpaid');
    }
  }

  async function renderQariFees(session) {
    const t = I18N.t;
    if (session.role !== 'qari') { redirect('dashboard'); return; }
    const cls = await DB.getClass(session.classId);
    const students = await DB.getStudents(session.classId);
    const fees = await DB.getAllFees();
    const months = feeMonths(12);
    const now = new Date();
    let sel = { y: now.getFullYear(), m: now.getMonth() + 1 };
    const { q } = parseHash();
    if (q && q.ym) {
      const p = q.ym.split('-').map(Number);
      sel = { y: p[0], m: p[1] };
    }
    const ym = ymOf(sel.y, sel.m);

    const payStatus = function (sid) {
      const f = fees[sid] || {};
      return f.payments && f.payments[ym];
    };
    let paidCount = 0;
    students.forEach(function (s) { if (payStatus(s.id) && payStatus(s.id).paid) paidCount++; });

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('fees') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + t('qariFees') + '</h1>' +
        '<p style="color:var(--ink-soft);font-size:.88rem;margin-top:6px">' + t('qariFeesSub') + '</p>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="n">' + num(students.length) + '</div><div class="l">' + t('students') + '</div></div>' +
          '<div class="stat"><div class="n" id="paid-count">' + num(paidCount) + '</div><div class="l">' + t('paid') + '</div></div>' +
          '<div class="stat"><div class="n" id="unpaid-count">' + num(students.length - paidCount) + '</div><div class="l">' + t('unpaid') + '</div></div>' +
        '</div>' +
        '<div class="field">' +
          '<label>' + t('month') + '</label>' +
          '<select id="f-month" data-change="f-month">' +
            months.map(function (mo) {
              return '<option value="' + ymOf(mo.y, mo.m) + '"' + (mo.y === sel.y && mo.m === sel.m ? ' selected' : '') + '>' + monthLabel(mo.y, mo.m) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<div class="section-title">' + nameDisplay(cls.name) + '</div>' +
        (students.length === 0 ?
          '<div class="empty-note">' + t('noStudents') + '</div>' :
          students.map(function (s) {
            const ps = payStatus(s.id);
            const paid = ps && ps.paid;
            return (
              '<div class="student-row fee-row" data-sid="' + s.id + '">' +
                '<div>' +
                  '<div style="font-weight:600"><button class="linky" data-action="fee-history" data-sid="' + s.id + '">' + nameDisplay(s.name) + '</button></div>' +
                '</div>' +
                '<div class="fee-toggle">' +
                  '<button class="btn btn-sm ' + (paid ? 'btn-ok' : 'btn-ghost') + '" data-action="set-fee" data-v="1">' + (paid ? '✓ ' : '') + t('paid') + '</button>' +
                  '<button class="btn btn-sm ' + (!paid ? 'btn-bad' : 'btn-ghost') + '" data-action="set-fee" data-v="0">' + (!paid ? '✗ ' : '') + t('unpaid') + '</button>' +
                '</div>' +
              '</div>'
            );
          }).join('')) +
      '</main>';

    changeActions['f-month'] = function (el) {
      nav('fees?ym=' + el.value);
    };
    viewActions['set-fee'] = function (btn) {
      const row = btn.closest('.fee-row');
      const sid = row.getAttribute('data-sid');
      const paid = btn.getAttribute('data-v') === '1';
      DB.markFee(sid, ym, paid, session.id).then(function (res) {
        if (res && res.ok === false) { toast(t('saveFailed')); return; }
        paintFeeBtns(row, paid, t);
        paidCount += paid ? 1 : -1;
        const pc = document.getElementById('paid-count');
        const uc = document.getElementById('unpaid-count');
        pc.textContent = num(paidCount);
        uc.textContent = num(students.length - paidCount);
        toast(paid ? t('markPaid') : t('markUnpaid'));
      });
    };
    viewActions['fee-history'] = function (btn) {
      const sid = btn.getAttribute('data-sid');
      openFeeHistory(session, sid, false);
    };
  }

  /* ---------- FEES — principal (define amounts + see all payments) ---------- */
  async function renderPrincipalFees(session) {
    const t = I18N.t;
    if (session.role !== 'principal') { redirect('dashboard'); return; }
    const classes = await DB.getClasses();
    const fees = await DB.getAllFees();
    const months = feeMonths(12);
    const now = new Date();
    let sel = { y: now.getFullYear(), m: now.getMonth() + 1 };
    const { q } = parseHash();
    if (q && q.ym) {
      const p = q.ym.split('-').map(Number);
      sel = { y: p[0], m: p[1] };
    }
    const ym = ymOf(sel.y, sel.m);
    let cid = (q && q.cid) || (classes[0] ? classes[0].id : '');
    const students = cid ? await DB.getStudents(cid) : [];

    let totalAmt = 0, totalPaid = 0, totalCount = 0;
    students.forEach(function (s) {
      const f = fees[s.id] || {};
      if (f.amount != null) { totalAmt += f.amount; totalCount++; }
      if (f.payments && f.payments[ym] && f.payments[ym].paid) totalPaid += (f.amount || 0);
    });
    let totalOut = totalAmt - totalPaid;
    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('fees') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + t('principalFees') + '</h1>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center" class="no-print">' +
          exportGroup([
            { action: 'export-data', label: '⬇ ' + t('exportData') }
          ]) +
          importButton() +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">' +
          '<div class="field"><label>' + t('classes') + '</label>' +
            '<select id="f-class" data-change="f-class">' +
              classes.map(function (c) {
                return '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + nameDisplay(c.name) + '</option>';
              }).join('') +
            '</select></div>' +
          '<div class="field"><label>' + t('month') + '</label>' +
            '<select id="f-month" data-change="f-month">' +
              months.map(function (mo) {
                return '<option value="' + ymOf(mo.y, mo.m) + '"' + (mo.y === sel.y && mo.m === sel.m ? ' selected' : '') + '>' + monthLabel(mo.y, mo.m) + '</option>';
              }).join('') +
            '</select></div>' +
        '</div>' +
        (students.length ? '<div class="card" style="margin-top:14px;padding:14px">' +
          '<div class="section-title" style="margin-bottom:8px">💰 ' + t('feeSummary') + ' — ' + monthLabel(sel.y, sel.m) + '</div>' +
          '<div class="stat-row">' +
            '<div class="stat"><div class="n">' + num(totalAmt) + '</div><div class="l">' + t('totalFees') + '</div></div>' +
            '<div class="stat"><div class="n" id="p-sum-collected" style="color:var(--ok)">' + num(totalPaid) + '</div><div class="l">' + t('collected') + '</div></div>' +
            '<div class="stat"><div class="n" id="p-sum-outstanding" style="color:' + (totalOut > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + num(totalOut) + '</div><div class="l">' + t('outstanding') + '</div></div>' +
          '</div>' +
          '<div class="meta" style="margin-top:6px">' + num(totalCount) + ' ' + t('studentsWithFees') + ' · ' + t('unit') + '</div>' +
        '</div>' : '') +
        '<div class="section-title">' + t('students') + '</div>' +
        (students.length === 0 ?
          '<div class="empty-note">' + t('noStudents') + '</div>' :
          '<div class="tbl-wrap"><table class="tbl">' +
            '<thead><tr><th>' + t('student') + '</th><th>' + t('feeAmount') + '</th><th>' + monthLabel(sel.y, sel.m) + '</th></tr></thead>' +
            '<tbody>' +
              students.map(function (s) {
                const f = fees[s.id] || {};
                const amt = f.amount != null ? f.amount : '';
                const ps = f.payments && f.payments[ym];
                const paid = ps && ps.paid;
                return (
                  '<tr data-sid="' + s.id + '">' +
                    '<td><button class="linky" data-action="p-fee-history" data-sid="' + s.id + '">' + nameDisplay(s.name) + '</button></td>' +
                    '<td><input class="amt-in" type="number" step="0.5" min="0" data-sid="' + s.id + '" value="' + amt + '" placeholder="—"></td>' +
                    '<td>' +
                      '<button class="btn btn-sm ' + (paid ? 'btn-ok' : 'btn-ghost') + '" data-action="p-fee" data-v="1">' + (paid ? '✓ ' : '') + t('paid') + '</button>' +
                      '<button class="btn btn-sm ' + (!paid ? 'btn-bad' : 'btn-ghost') + '" data-action="p-fee" data-v="0">' + (!paid ? '✗ ' : '') + t('unpaid') + '</button>' +
                    '</td>' +
                  '</tr>'
                );
              }).join('') +
            '</tbody></table></div>') +
      '</main>';

    changeActions['f-class'] = function (el) {
      nav('pfees?cid=' + el.value + '&ym=' + ym);
    };
    changeActions['f-month'] = function (el) {
      nav('pfees?cid=' + cid + '&ym=' + el.value);
    };
    viewActions['p-fee'] = function (btn) {
      const tr = btn.closest('tr');
      const sid = tr.getAttribute('data-sid');
      const paid = btn.getAttribute('data-v') === '1';
      const wasPaid = (fees[sid] && fees[sid].payments && fees[sid].payments[ym] && fees[sid].payments[ym].paid) ? true : false;
      DB.markFee(sid, ym, paid, session.id).then(function (res) {
        if (res && res.ok === false) { toast(t('saveFailed')); return; }
        paintFeeBtns(tr, paid, t);
        if (wasPaid !== paid) {
          const amt = (fees[sid] && fees[sid].amount != null) ? fees[sid].amount : 0;
          if (paid) { totalPaid += amt; totalOut -= amt; }
          else { totalPaid -= amt; totalOut += amt; }
          const c = document.getElementById('p-sum-collected');
          const o = document.getElementById('p-sum-outstanding');
          if (c) c.textContent = num(totalPaid);
          if (o) { o.textContent = num(totalOut); o.style.color = totalOut > 0 ? 'var(--bad)' : 'var(--ok)'; }
        }
        toast(paid ? t('markPaid') : t('markUnpaid'));
      });
    };
    viewActions['p-fee-history'] = function (btn) {
      const sid = btn.getAttribute('data-sid');
      openFeeHistory(session, sid, true);
    };
    app.querySelectorAll('.amt-in').forEach(function (inp) {
      inp.addEventListener('change', function () {
        const sid = inp.getAttribute('data-sid');
        const v = inp.value === '' ? null : parseFloat(inp.value);
        DB.setFeeAmount(sid, v).then(function () {
          toast(t('saved'));
        });
      });
    });
  }

  /* ---------- FEES — student history modal (last 12 months) ---------- */
  async function openFeeHistory(session, sid, isPrincipal) {
    const t = I18N.t;
    const student = await DB.getStudent(sid);
    if (!student) return;
    const fees = await DB.getAllFees();
    const f = fees[sid] || {};
    const users = await DB.getUsers();
    const months = feeMonths(12);
    const now = new Date();

    const rows = months.map(function (mo) {
      const ym = ymOf(mo.y, mo.m);
      const ps = (f.payments || {})[ym];
      const paid = ps && ps.paid;
      const who = ps && ps.markedBy ? (users[ps.markedBy] ? nameDisplay(users[ps.markedBy].name) : ps.markedBy) : '—';
      const when = ps && ps.markedAt ? new Date(ps.markedAt).toLocaleDateString() : '—';
      return { ym: ym, paid: paid, who: who, when: when, label: monthLabel(mo.y, mo.m) };
    });

    const b = document.createElement('div');
    b.className = 'modal-back';
    b.innerHTML =
      '<div class="modal modal-wide">' +
        '<h3>' + nameDisplay(student.name) + ' — ' + t('feeHistory') + '</h3>' +
        '<p style="color:var(--ink-soft);font-size:.85rem">' + t('feeHistorySub') + (isPrincipal && f.amount != null ? ' · ' + t('feeAmount') + ' ' + f.amount : '') + '</p>' +
        '<div class="tbl-wrap" style="max-height:60vh;overflow:auto">' +
          '<table class="tbl">' +
            '<thead><tr><th>' + t('month') + '</th><th>' + t('feePaidMark') + ' / ' + t('feeUnpaidMark') + '</th>' +
              (isPrincipal ? '<th>' + t('markedBy') + '</th><th>' + t('markedAt') + '</th>' : '') +
            '</tr></thead>' +
            '<tbody>' +
              rows.map(function (r) {
                return (
                  '<tr class="' + (r.paid ? '' : (r.paid === false ? 'absent' : '')) + '">' +
                    '<td>' + esc(r.label) + '</td>' +
                    '<td>' + (r.paid === undefined ? '—' : (r.paid ? '✓ ' + t('feePaidMark') : '✗ ' + t('feeUnpaidMark'))) + '</td>' +
                    (isPrincipal ? '<td>' + esc(r.who) + '</td><td>' + esc(r.when) + '</td>' : '') +
                  '</tr>'
                );
              }).join('') +
            '</tbody></table>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:12px">' +
          '<button class="btn btn-ghost" data-action="m-fh-close">' + t('close') + '</button>' +
        '</div>' +
      '</div>';
      document.body.appendChild(b);
      applyTrackUi();
      b.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'm-track') applyTrackUi();
      });
      b.addEventListener('click', function (e) {
      const a = e.target.closest('[data-action]');
      if ((a && a.getAttribute('data-action') === 'm-fh-close') || e.target === b) b.remove();
    });
  }

  /* ---------- ATTENDANCE — per student, monthly grid ---------- */
  async function renderAttendance(session, sid) {
    const t = I18N.t;
    const student = await DB.getStudent(sid);
    if (!student) { redirect('dashboard'); return; }
    if (session.role === 'qari' && session.classId !== student.classId) { redirect('dashboard'); return; }

    const now = new Date();
    const months = feeMonths(6);
    let sel = { y: now.getFullYear(), m: now.getMonth() + 1 };
    const { q } = parseHash();
    if (q && q.ym) {
      const p = q.ym.split('-').map(Number);
      sel = { y: p[0], m: p[1] };
    }
    const reps = await DB.getMonthReports(sid, sel.y, sel.m);
    const daysInMonth = new Date(sel.y, sel.m, 0).getDate();
    const today = todayDs();
    const firstDay = new Date(sel.y, sel.m - 1, 1).getDay();
    const firstCol = (firstDay + 6) % 7;

    let presentCount = 0, absentCount = 0, marked = 0;
    const cells = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = sel.y + '-' + String(sel.m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      let state = null;
      if (ds <= today) {
        const r = reps[ds];
        if (r) {
          state = r.present ? 'p' : 'a';
          if (r.present) presentCount++; else absentCount++;
          marked++;
        }
      }
      cells.push({ d: d, state: state, future: ds > today });
    }

    const grid = [];
    for (let i = 0; i < firstCol; i++) grid.push('<span class="att-cell empty"></span>');
    cells.forEach(function (c) {
      const cls = c.future ? 'empty' : (c.state === 'p' ? 'ok' : c.state === 'a' ? 'bad' : 'none');
      grid.push('<span class="att-cell ' + cls + '"><b>' + num(c.d) + '</b></span>');
    });

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('attendance') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + nameDisplay(student.name) + '</h1>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="n">' + num(presentCount) + '</div><div class="l">' + t('presentCount') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(absentCount) + '</div><div class="l">' + t('absentDays') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(marked) + '</div><div class="l">' + t('totalDays') + '</div></div>' +
        '</div>' +
        '<div class="field">' +
          '<label>' + t('month') + '</label>' +
          '<select id="f-month" data-change="f-month">' +
            months.map(function (mo) {
              return '<option value="' + ymOf(mo.y, mo.m) + '"' + (mo.y === sel.y && mo.m === sel.m ? ' selected' : '') + '>' + monthLabel(mo.y, mo.m) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<div class="att-grid">' + grid.join('') + '</div>' +
        '<div style="display:flex;gap:14px;margin-top:10px;font-size:.8rem;color:var(--ink-soft);flex-wrap:wrap">' +
          '<span><span class="att-key ok"></span> ' + t('present') + '</span>' +
          '<span><span class="att-key bad"></span> ' + t('absent') + '</span>' +
          '<span><span class="att-key none"></span> ' + t('noMark') + '</span>' +
        '</div>' +
      '</main>';

    changeActions['f-month'] = function (el) {
      nav('attendance/' + sid + '?ym=' + el.value);
    };
  }

  /* ---------- REPORTS hub ---------- */
  async function renderReports(session) {
    const t = I18N.t;
    const users = await DB.getUsers();
    let students = [];
    let classes = [];
    let title = t('reports');
    let cid = null;
    const { q } = parseHash();

    if (session.role === 'qari') {
      students = await DB.getStudents(session.classId);
      title = (users[session.id] ? nameDisplay(users[session.id].name) : t('reports'));
    } else {
      classes = await DB.getClasses();
      cid = (q && q.cid) || (classes[0] ? classes[0].id : '');
      students = cid ? await DB.getStudents(cid) : [];
    }

    const studentRows = students.map(function (s) {
      return (
        '<div class="student-row">' +
          '<div>' +
            '<div style="font-weight:600">' + nameDisplay(s.name) + '</div>' +
            '<div class="meta">' + t('para') + ' ' + num(s.para) + ' · ' + t('page') + ' ' + num(s.currentPage || '—') + '</div>' +
          '</div>' +
          '<div class="row-actions" style="flex-wrap:wrap">' +
            '<a class="btn btn-sm btn-ghost" href="#/' + (session.role === 'principal' ? 'history' : 'student') + '/' + s.id + '">📋 ' + t('dailyReport') + '</a>' +
            '<a class="btn btn-sm btn-ghost" href="#/weekly/' + s.id + '">🗓 ' + t('weeklyReport') + '</a>' +
            '<a class="btn btn-sm btn-ghost" href="#/monthly/' + s.id + '">📆 ' + t('monthlyReport') + '</a>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('reports') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + esc(title) + '</h1>' +
        '<p style="color:var(--ink-soft);font-size:.88rem;margin-top:6px">' + t('reportsSub') + '</p>' +
        (session.role === 'principal' ?
          '<div class="field" style="margin-top:10px"><label>' + t('classes') + '</label>' +
            '<select id="f-class" data-change="f-class">' +
              classes.map(function (c) {
                return '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + nameDisplay(c.name) + '</option>';
              }).join('') +
            '</select></div>' : '') +
        '<div class="section-title">' + t('students') + '</div>' +
        (students.length === 0 ? '<div class="empty-note">' + t('noStudents') + '</div>' : studentRows) +
      '</main>';

    changeActions['f-class'] = function (el) {
      nav('reports?cid=' + el.value);
    };
  }

  /* ---------- WEEKLY report ---------- */
  function weekOfMonday(ds) {
    const parts = ds.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return dstr(d);
  }

  function lastNMondays(n) {
    const out = [];
    const today = new Date();
    const thisMonday = weekOfMonday(todayDs());
    const parts = thisMonday.split('-').map(Number);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(parts[0], parts[1] - 1, parts[2] - 7 * i);
      out.push(dstr(d));
    }
    return out;
  }

  function weekLabel(mondayDs) {
    const parts = mondayDs.split('-').map(Number);
    const start = new Date(parts[0], parts[1] - 1, parts[2]);
    const end = new Date(parts[0], parts[1] - 1, parts[2] + 6);
    return monthLabel(start.getFullYear(), start.getMonth() + 1) + ' ' + start.getDate() + ' – ' +
      monthLabel(end.getFullYear(), end.getMonth() + 1) + ' ' + end.getDate() + ', ' + end.getFullYear();
  }

  async function renderWeekly(session, sid) {
    const t = I18N.t;
    const student = await DB.getStudent(sid);
    if (!student) { redirect('dashboard'); return; }
    const isQari = session.role === 'qari' && session.classId === student.classId;
    const isPrincipal = session.role === 'principal';
    if (!isQari && !isPrincipal) { redirect('dashboard'); return; }

    const mondays = lastNMondays(6);
    let wk = weekOfMonday(todayDs());
    const { q } = parseHash();
    if (q && q.wk) wk = q.wk;

    const auto = { newSafa: 0, sabaqDays: 0 };
    const weekReps = await DB.getReportRange(sid, wk, DB.addDays(wk, 6));
    for (let i = 0; i < 7; i++) {
      const ds = DB.addDays(wk, i);
      const rep = weekReps[ds];
      if (rep && rep.present && rep.sabaqDone) {
        auto.newSafa += (rep.pages || 0);
        auto.sabaqDays++;
      }
    }
    const saved = await DB.getWeekly(sid, wk);

    const f = function (name, value) {
      const v = saved && saved[name] != null ? saved[name] : (auto[name] != null ? auto[name] : value);
      return '<div class="field"><label>' + t(name) + '</label>' +
        '<input id="w-' + name + '" type="number" min="0" value="' + v + '"' + (isPrincipal ? ' disabled' : '') + '></div>';
    };
    const ta = function (name, hint) {
      const v = saved && saved[name] ? saved[name] : '';
      return '<div class="field"><label>' + t(name) + '</label>' +
        '<textarea id="w-' + name + '" rows="3" placeholder="' + hint + '"' + (isPrincipal ? ' disabled' : '') + '>' + esc(v) + '</textarea></div>';
    };

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('weeklyReport') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + nameDisplay(student.name) + '</h1>' +
        '<p style="color:var(--ink-soft);font-size:.88rem;margin-top:6px">' + t('weeklySub') + '</p>' +
        '<div class="field" style="margin-top:10px"><label>' + t('weekOf') + '</label>' +
          '<select id="w-week" data-change="w-week">' +
            mondays.map(function (m) {
              return '<option value="' + m + '"' + (m === wk ? ' selected' : '') + '>' + weekLabel(m) + '</option>';
            }).join('') +
          '</select></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + f('newSafa', 0) + f('sabaqDays', 0) + '</div>' +
        '<p style="color:var(--ink-soft);font-size:.8rem;margin:4px 0 10px">' + t('autoFilled') + '</p>' +
        ta('manzilComment', t('manzilComment')) +
        ta('bigComment', t('bigComment')) +
        (isQari ? '<button class="btn btn-gold btn-block" data-action="save-weekly">' + t('save') + '</button>' : '') +
        '<p style="color:var(--ink-soft);font-size:.8rem;margin-top:8px">' + (saved ? t('savedReport') : t('noWeekData')) + '</p>' +
      '</main>';

    changeActions['w-week'] = function (el) {
      nav('weekly/' + sid + '?wk=' + el.value);
    };
    viewActions['save-weekly'] = function () {
      DB.saveWeekly(sid, wk, {
        newSafa: parseInt(document.getElementById('w-newSafa').value, 10) || 0,
        sabaqDays: parseInt(document.getElementById('w-sabaqDays').value, 10) || 0,
        manzilComment: document.getElementById('w-manzilComment').value.trim(),
        bigComment: document.getElementById('w-bigComment').value.trim()
      }).then(function (res) {
        if (res && res.ok === false) { toast(t('saveFailed')); return; }
        toast(t('savedReport'));
        renderWeekly(session, sid);
      });
    };
  }

  /* ---------- MONTHLY report ---------- */
  async function renderMonthly(session, sid) {
    const t = I18N.t;
    const student = await DB.getStudent(sid);
    if (!student) { redirect('dashboard'); return; }
    const isQari = session.role === 'qari' && session.classId === student.classId;
    const isPrincipal = session.role === 'principal';
    if (!isQari && !isPrincipal) { redirect('dashboard'); return; }

    const now = new Date();
    let ym = ymOf(now.getFullYear(), now.getMonth() + 1);
    const { q } = parseHash();
    if (q && q.ym) ym = q.ym;

    const p = ym.split('-').map(Number);
    const reps = await DB.getMonthReports(sid, p[0], p[1]);
    let present = 0, absent = 0, total = 0;
    Object.keys(reps).forEach(function (ds) {
      const r = reps[ds];
      if (r.present) present++; else absent++;
      total++;
    });
    const saved = await DB.getMonthlyReport(sid, ym);

    const months = feeMonths(6);

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('monthlyReport') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + nameDisplay(student.name) + '</h1>' +
        '<p style="color:var(--ink-soft);font-size:.88rem;margin-top:6px">' + t('monthlySub') + '</p>' +
        '<div class="field" style="margin-top:10px"><label>' + t('month') + '</label>' +
          '<select id="m-month" data-change="m-month">' +
            months.map(function (mo) {
              const mv = ymOf(mo.y, mo.m);
              return '<option value="' + mv + '"' + (mv === ym ? ' selected' : '') + '>' + monthLabel(mo.y, mo.m) + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="section-title">' + t('attendanceSummary') + '</div>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="n">' + num(present) + '</div><div class="l">' + t('presentDaysShort') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(absent) + '</div><div class="l">' + t('absentDaysShort') + '</div></div>' +
          '<div class="stat"><div class="n">' + num(total) + '</div><div class="l">' + t('totalDaysShort') + '</div></div>' +
        '</div>' +
        '<div class="section-title">' + t('educationalSituation') + '</div>' +
        '<div class="field">' +
          '<textarea id="m-comment" rows="4" placeholder="' + t('educationalSituation') + '"' + (isPrincipal ? ' disabled' : '') + '>' + esc(saved ? (saved.comment || '') : '') + '</textarea>' +
        '</div>' +
        (isQari ? '<button class="btn btn-gold btn-block" data-action="save-monthly">' + t('save') + '</button>' : '') +
        '<p style="color:var(--ink-soft);font-size:.8rem;margin-top:8px">' + (saved ? t('savedReport') : t('noMonthData')) + '</p>' +
      '</main>';

    changeActions['m-month'] = function (el) {
      nav('monthly/' + sid + '?ym=' + el.value);
    };
    viewActions['save-monthly'] = function () {
      DB.saveMonthlyReport(sid, ym, {
        present: present,
        absent: absent,
        total: total,
        comment: document.getElementById('m-comment').value.trim()
      }).then(function (res) {
        if (res && res.ok === false) { toast(t('saveFailed')); return; }
        toast(t('savedReport'));
        renderMonthly(session, sid);
      });
    };
  }

  /* ---------- CLASS ATTENDANCE grid ---------- */
  async function renderClassAttendance(session) {
    const t = I18N.t;
    let classes = [];
    let cid = null;
    const { q } = parseHash();

    if (session.role === 'qari') {
      cid = session.classId;
    } else {
      classes = await DB.getClasses();
      cid = (q && q.cid) || (classes[0] ? classes[0].id : '');
    }
    const students = await DB.getStudents(cid);
    const now = new Date();
    let sel = { y: now.getFullYear(), m: now.getMonth() + 1 };
    if (q && q.ym) {
      const pp = q.ym.split('-').map(Number);
      sel = { y: pp[0], m: pp[1] };
    }
    const ym = ymOf(sel.y, sel.m);
    const months = feeMonths(6);
    const daysInMonth = new Date(sel.y, sel.m, 0).getDate();
    const today = todayDs();

    const gridRows = [];
    const monthReps = await DB.getMonthReportsForStudents(students.map(function (s) { return s.id; }), sel.y, sel.m);
    for (const s of students) {
      const reps = monthReps[s.id] || {};
      let present = 0, absent = 0;
      let cells = '';
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = sel.y + '-' + String(sel.m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const r = reps[ds];
        if (ds <= today) {
          if (r) {
            if (r.present) { present++; cells += '<span class="att-cell ok" style="aspect-ratio:auto;min-height:22px">' + num(d) + '</span>'; }
            else { absent++; cells += '<span class="att-cell bad" style="aspect-ratio:auto;min-height:22px">' + num(d) + '</span>'; }
          } else {
            cells += '<span class="att-cell none" style="aspect-ratio:auto;min-height:22px">' + num(d) + '</span>';
          }
        } else {
          cells += '<span class="att-cell empty" style="aspect-ratio:auto;min-height:22px"></span>';
        }
      }
      gridRows.push(
        '<div class="class-att-row">' +
          '<div class="ca-name"><span style="font-weight:600">' + nameDisplay(s.name) + '</span>' +
            '<span class="ca-stats">' + num(present) + '✓ · ' + num(absent) + '✗</span></div>' +
          '<div class="att-grid">' + cells + '</div>' +
        '</div>'
      );
    }

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">' + t('attendance') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + t('attendance') + '</h1>' +
        '<div style="display:grid;grid-template-columns:' + (session.role === 'principal' ? '1fr 1fr' : '1fr') + ';gap:10px;margin-top:12px">' +
          (session.role === 'principal' ?
            '<div class="field"><label>' + t('classes') + '</label>' +
              '<select id="f-class" data-change="f-class">' +
                classes.map(function (c) {
                  return '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + nameDisplay(c.name) + '</option>';
                }).join('') +
              '</select></div>' : '') +
          '<div class="field"><label>' + t('month') + '</label>' +
            '<select id="f-month" data-change="f-month">' +
              months.map(function (mo) {
                const mv = ymOf(mo.y, mo.m);
                return '<option value="' + mv + '"' + (mv === ym ? ' selected' : '') + '>' + monthLabel(mo.y, mo.m) + '</option>';
              }).join('') +
            '</select></div>' +
        '</div>' +
        '<div style="display:flex;gap:14px;margin:12px 0;font-size:.8rem;color:var(--ink-soft)">' +
          '<span><span class="att-key ok"></span> ' + t('present') + '</span>' +
          '<span><span class="att-key bad"></span> ' + t('absent') + '</span>' +
          '<span><span class="att-key none"></span> ' + t('noMark') + '</span>' +
        '</div>' +
        gridRows.join('') +
      '</main>';

    changeActions['f-class'] = function (el) {
      nav('attendance-class?cid=' + el.value + '&ym=' + ym);
    };
    changeActions['f-month'] = function (el) {
      nav('attendance-class?cid=' + (cid || '') + '&ym=' + el.value);
    };
  }

  /* ---------- QUICK ENTRY (qari) ---------- */
  async function renderQuickEntry(session) {
    const t = I18N.t;
    if (session.role === 'principal') { redirect('dashboard'); return; }
    const cls = await DB.getClass(session.classId);
    if (!cls) { redirect('dashboard'); return; }
    const students = await DB.getStudents(session.classId);
    const today = todayDs();
    const dayReps = await DB.getDayReports(students.map(function (s) { return s.id; }), today);
    const manzilOpts = [['half', t('halfPara')], ['third', t('thirdPara')], ['full', t('fullPara')]];
    const trackOf = function (s) { return s.type || cls.type || 'hifz'; };
    const savedIds = new Set(students.filter(function (s) { return dayReps[s.id]; }).map(function (s) { return s.id; }));
    const state = {};
    students.forEach(function (s) {
      const r = dayReps[s.id] || {};
      state[s.id] = {
        present: r.present !== undefined ? r.present : true,
        late: !!r.late,
        sabqiDone: !!r.sabqiDone,
        manzilDone: !!r.manzilDone,
        manzil: r.manzil || 'half',
        pages: r.pages || 0,
        lines: r.lines || 0,
        manzilPages: r.manzilPages || 0,
        manzilLines: r.manzilLines || 0,
        comment: r.comment || ''
      };
    });

    const bodyFor = function (s) {
      const st = state[s.id];
      const track = trackOf(s);
      const manzilIsTri = track === 'hifz';
      const sw = function (id, field, checked, label) {
        return '<div style="display:inline-flex;align-items:center;gap:8px">' +
          '<label class="switch"><input type="checkbox" id="' + id + '" data-qe="' + field + '" data-sid="' + s.id + '"' + (checked ? ' checked' : '') + '><span class="track"></span></label>' +
          '<span class="lbl" style="font-size:.88rem">' + label + '</span>' +
        '</div>';
      };
      let out = '';
      out += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="field"><label for="qe-pages-' + s.id + '">' + t('sabaq') + ' — ' + t('pages') + '</label>' +
          '<select id="qe-pages-' + s.id + '" data-qe="pages" data-sid="' + s.id + '">' + rangeOpts(10, st.pages) + '</select></div>' +
        '<div class="field"><label for="qe-lines-' + s.id + '">' + t('lines') + '</label>' +
          '<select id="qe-lines-' + s.id + '" data-qe="lines" data-sid="' + s.id + '">' + rangeOpts(20, st.lines) + '</select></div>' +
      '</div>';
      out += '<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap">';
      if (track === 'hifz') out += sw('qe-sabqi-' + s.id, 'sabqi', st.sabqiDone, t('sabqi'));
      if (track !== 'qaida') out += sw('qe-manzil-' + s.id, 'manzil', st.manzilDone, t('manzil'));
      out += '</div>';
      if (track !== 'qaida') {
        if (manzilIsTri) {
          out += '<div class="seg tri"' + (st.manzilDone ? ' style="margin-top:8px"' : ' style="margin-top:8px;display:none"') + ' id="qe-trim-' + s.id + '">' +
            manzilOpts.map(function (o) {
              return '<button type="button" class="opt' + (st.manzil === o[0] ? ' on' : '') + '" data-action="qe-manzil" data-sid="' + s.id + '" data-v="' + o[0] + '">' + o[1] + '</button>';
            }).join('') +
          '</div>';
        } else {
          out += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"' + (st.manzilDone ? '' : ' style="display:none;margin-top:8px"') + ' id="qe-trim-' + s.id + '">' +
            '<div class="field"><label for="qe-mpages-' + s.id + '">' + t('manzil') + ' — ' + t('pages') + '</label>' +
              '<select id="qe-mpages-' + s.id + '" data-qe="manzilPages" data-sid="' + s.id + '">' + rangeOpts(10, st.manzilPages) + '</select></div>' +
            '<div class="field"><label for="qe-mlines-' + s.id + '">' + t('lines') + '</label>' +
              '<select id="qe-mlines-' + s.id + '" data-qe="manzilLines" data-sid="' + s.id + '">' + rangeOpts(20, st.manzilLines) + '</select></div>' +
          '</div>';
        }
      }
      out += '<div class="field" style="margin-top:8px">' +
        '<input id="qe-comment-' + s.id + '" data-qe="comment" data-sid="' + s.id + '" placeholder="' + t('commentHint') + '" value="' + esc(st.comment) + '">' +
      '</div>';
      return (
        '<div style="margin-top:10px' + (st.present ? '' : ';display:none') + '" id="qe-body-' + s.id + '">' +
          '<div class="tick-row" style="margin-bottom:6px">' +
            '<div><div class="lbl" style="font-size:.88rem">' + t('late') + '</div><div class="sub">' + t('lateSub') + '</div></div>' +
            '<label class="switch"><input type="checkbox" id="qe-late-' + s.id + '" data-qe="late" data-sid="' + s.id + '"' + (st.late ? ' checked' : '') + '><span class="track"></span></label>' +
          '</div>' +
          out +
        '</div>'
      );
    };

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">⚡ ' + t('quickEntry') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + nameDisplay(cls.name) + '</h1>' +
        '<div class="pill" style="margin-top:8px">' + t('date') + ' ' + esc(today) + '</div>' +
        '<div class="card" style="margin-top:14px;border-color:var(--gold);background:var(--gold-soft)">' + t('quickEntrySub') + '</div>' +
        '<button class="btn btn-primary btn-block" data-action="qe-save-all" style="margin-top:14px">💾 ' + t('saveAll') + '</button>' +
        quickEntryGroups() +
        '<button class="btn btn-primary btn-block" data-action="qe-save-all" style="margin-top:14px">💾 ' + t('saveAll') + '</button>' +
      '</main>';

    function quickEntryGroups() {
      const shifts = [
        { key: 'sh1', label: t('shift1') + ' (8-10)' },
        { key: 'sh2', label: t('shift2') + ' (10-12)' },
        { key: 'sh3', label: t('shift3') + ' (4-6)' },
        { key: 'sh4', label: t('shift4') + ' (6-8)' }
      ];
      const hasShiftStudents = cls.type !== 'hifz';
      const cardFor = function (s) {
        return (
          '<div class="card" style="margin-top:12px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
              '<div>' +
                '<div style="font-weight:700">' + nameDisplay(s.name) + '</div>' +
                '<div class="meta">' + t('para') + ' ' + num(s.para) + ' · ' + t('page') + ' ' + num(s.currentPage || '—') + '</div>' +
              '</div>' +
              '<div class="seg">' +
                '<button type="button" class="opt present' + (st(s.id).present ? ' on' : '') + '" data-action="qe-present" data-sid="' + s.id + '" data-v="1">' + t('present') + '</button>' +
                '<button type="button" class="opt absent' + (!st(s.id).present ? ' on' : '') + '" data-action="qe-present" data-sid="' + s.id + '" data-v="0">' + t('absent') + '</button>' +
              '</div>' +
            '</div>' +
            bodyFor(s) +
          '</div>'
        );
      };
      if (!hasShiftStudents) return students.map(cardFor).join('');
      var out = '';
      shifts.forEach(function (sh) {
        var grp = students.filter(function (s) { return (s.shift || '') === sh.key; });
        if (!grp.length) return;
        out += '<div class="shift-group" data-shift="' + sh.key + '">' +
               '<div class="shift-header">🕗 ' + sh.label + ' <span class="badge">' + grp.length + ' ' + t('shiftStudents') + '</span>' +
               ' <span class="shift-done-badge">' + shiftStatusBadge(sh.key) + '</span></div>' +
               grp.map(cardFor).join('') +
               '</div>';
      });
      var unassigned = students.filter(function (s) { return !s.shift; });
      if (unassigned.length) {
        out += '<div class="shift-group" data-shift="un">' +
               '<div class="shift-header">— ' + t('shiftNone') + ' <span class="badge">' + unassigned.length + ' ' + t('shiftStudents') + '</span>' +
               ' <span class="shift-done-badge">' + shiftStatusBadge('un') + '</span></div>' +
               unassigned.map(cardFor).join('') +
               '</div>';
      }
      return out;
    }

    function shiftStatusBadge(key) {
      var ids = key === 'un'
        ? students.filter(function (s) { return !s.shift; }).map(function (s) { return s.id; })
        : students.filter(function (s) { return (s.shift || '') === key; }).map(function (s) { return s.id; });
      if (!ids.length) return '';
      var done = ids.filter(function (id) { return savedIds.has(id); }).length;
      var all = done === ids.length;
      return all
        ? '<span class="badge badge-done">✅ ' + done + '/' + ids.length + ' ' + t('shiftDone') + '</span>'
        : '<span class="badge badge-pending">' + done + '/' + ids.length + '</span>';
    }

    function updateShiftBadges() {
      document.querySelectorAll('.shift-group').forEach(function (g) {
        var key = g.getAttribute('data-shift');
        var el = g.querySelector('.shift-done-badge');
        if (el) el.innerHTML = shiftStatusBadge(key);
      });
    }

    function st(sid) { return state[sid]; }

    /* keep DOM widgets in sync with state so a present/absent toggle never loses data */
    function wireWidgets() {
      students.forEach(function (s) {
        const ids = ['qe-pages-' + s.id, 'qe-lines-' + s.id, 'qe-mpages-' + s.id, 'qe-mlines-' + s.id, 'qe-comment-' + s.id];
        ids.forEach(function (id) {
          const el = document.getElementById(id);
          if (el) {
            el.addEventListener('input', function () {
              if (id.indexOf('comment') > -1) state[s.id].comment = el.value;
              else if (id.indexOf('mpages') > -1) state[s.id].manzilPages = parseInt(el.value, 10) || 0;
              else if (id.indexOf('mlines') > -1) state[s.id].manzilLines = parseInt(el.value, 10) || 0;
              else state[s.id][id.indexOf('pages') > -1 ? 'pages' : 'lines'] = parseInt(el.value, 10) || 0;
            });
            el.addEventListener('change', function () {
              if (id.indexOf('comment') > -1) state[s.id].comment = el.value;
              else if (id.indexOf('mpages') > -1) state[s.id].manzilPages = parseInt(el.value, 10) || 0;
              else if (id.indexOf('mlines') > -1) state[s.id].manzilLines = parseInt(el.value, 10) || 0;
              else state[s.id][id.indexOf('pages') > -1 ? 'pages' : 'lines'] = parseInt(el.value, 10) || 0;
            });
          }
        });
        const sabqi = document.getElementById('qe-sabqi-' + s.id);
        if (sabqi) sabqi.addEventListener('change', function () { state[s.id].sabqiDone = sabqi.checked; });
        const late = document.getElementById('qe-late-' + s.id);
        if (late) late.addEventListener('change', function () { state[s.id].late = late.checked; });
        const manzil = document.getElementById('qe-manzil-' + s.id);
        if (manzil) manzil.addEventListener('change', function () {
          state[s.id].manzilDone = manzil.checked;
          const tri = document.getElementById('qe-trim-' + s.id);
          if (tri) tri.style.display = manzil.checked ? '' : 'none';
        });
      });
    }
    wireWidgets();

    viewActions['qe-present'] = function (btn) {
      const sid = btn.getAttribute('data-sid');
      state[sid].present = btn.getAttribute('data-v') === '1';
      const seg = btn.closest('.seg');
      if (seg) {
        seg.querySelectorAll('[data-action="qe-present"]').forEach(function (b) {
          b.classList.toggle('on', b === btn);
        });
      }
      const body = document.getElementById('qe-body-' + sid);
      if (body) body.style.display = state[sid].present ? '' : 'none';
    };
    viewActions['qe-manzil'] = function (btn) {
      const sid = btn.getAttribute('data-sid');
      state[sid].manzil = btn.getAttribute('data-v');
      const tri = document.getElementById('qe-trim-' + sid);
      if (tri) {
        tri.querySelectorAll('[data-action="qe-manzil"]').forEach(function (b) {
          b.classList.toggle('on', b === btn);
        });
      }
    };
    viewActions['qe-save-all'] = function () {
      const today2 = todayDs();
      const jobs = students.map(function (s) {
        const st2 = state[s.id];
        const track = trackOf(s);
        const manzilIsTri = track === 'hifz';
        const rep = {
          present: st2.present,
          late: st2.present && st2.late,
          sabaqDone: st2.present && st2.pages + st2.lines > 0,
          pages: st2.present && st2.pages > 0 ? st2.pages : null,
          lines: st2.present && st2.lines > 0 ? st2.lines : null,
          sabqiDone: st2.present && st2.sabqiDone,
          manzilDone: st2.present && st2.manzilDone,
          manzil: st2.present && st2.manzilDone && manzilIsTri ? st2.manzil : null,
          manzilPages: st2.present && st2.manzilDone && !manzilIsTri ? (st2.manzilPages > 0 ? st2.manzilPages : null) : null,
          manzilLines: st2.present && st2.manzilDone && !manzilIsTri ? (st2.manzilLines > 0 ? st2.manzilLines : null) : null,
          comment: st2.present && st2.comment.trim() ? st2.comment.trim() : null
        };
        return DB.saveReport(s.id, today2, rep);
      });
      Promise.all(jobs).then(function (results) {
        const failed = results.filter(function (r) { return r && r.ok === false; }).length;
        if (failed) { toast(t('saveFailed')); return; }
        toast(t('savedAll'));
        students.forEach(function (s) { savedIds.add(s.id); });
        updateShiftBadges();
        nav('dashboard');
      });
    };
  }

  /* ---------- CLASS PROGRESS (principal) ---------- */
  async function renderClassProgress(session, cid) {
    const t = I18N.t;
    if (session.role === 'principal') {
      if (!cid) { redirect('principal'); return; }
    } else {
      redirect('dashboard');
      return;
    }
    const cls = await DB.getClass(cid);
    if (!cls) { redirect('principal'); return; }
    const students = await DB.getStudents(cid);
    const now = new Date();
    let sel = { y: now.getFullYear(), m: now.getMonth() + 1 };
    const { q } = parseHash();
    if (q && q.ym) {
      const pp = q.ym.split('-').map(Number);
      sel = { y: pp[0], m: pp[1] };
    }
    const ym = ymOf(sel.y, sel.m);
    const months = feeMonths(6);
    const today = todayDs();
    const monthReps = await DB.getMonthReportsForStudents(students.map(function (s) { return s.id; }), sel.y, sel.m);

    const cards = students.map(function (s) {
      const reps = monthReps[s.id] || {};
      const rows = [];
      let present = 0, total = 0, pages = 0;
      Object.keys(reps).forEach(function (ds) {
        if (ds > today) return;
        const r = reps[ds];
        total++;
        if (r.present) present++;
        if (r.present && r.sabaqDone) pages += (r.pages || 0) + (r.lines > 0 ? r.lines / 20 : 0);
        rows.push({ ds: ds, r: r });
      });
      rows.sort(function (a, b) { return a.ds < b.ds ? -1 : 1; });
      const rate = total ? Math.round(present / total * 100) : 0;
      const chart = progressChart(rows, sel.y, sel.m);
      return (
        '<div class="student-row" style="display:block;padding:14px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<div>' +
              '<div style="font-weight:700">' + nameDisplay(s.name) + ' <span class="badge badge-cat">' + esc(s.category) + '</span></div>' +
              '<div class="meta">' + t('para') + ' ' + num(s.para) + ' · ' + t('page') + ' ' + num(s.currentPage || '—') + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
              '<span class="pill" style="background:var(--gold-soft);color:var(--ink)">' + t('attendanceRate') + ': ' + num(rate) + '%</span>' +
              '<span class="badge badge-ok">' + t('pagesMemorized') + ': ' + num(Math.round(pages)) + '</span>' +
            '</div>' +
          '</div>' +
          (chart ? '<div style="margin-top:10px">' + chart + '</div>' : '<div class="meta" style="margin-top:8px">' + t('noReports') + '</div>') +
        '</div>'
      );
    }).join('');

    app.innerHTML = '' +
      topbar(true) +
      '<main class="app-main">' +
        '<span class="eyebrow">📈 ' + t('classProgress') + '</span>' +
        '<h1 class="h-display" style="font-size:1.3rem">' + nameDisplay(cls.name) + '</h1>' +
        '<div class="field" style="margin-top:12px">' +
          '<label>' + t('month') + '</label>' +
          '<select id="f-month" data-change="f-month">' +
            months.map(function (mo) {
              const mv = ymOf(mo.y, mo.m);
              return '<option value="' + mv + '"' + (mv === ym ? ' selected' : '') + '>' + monthLabel(mo.y, mo.m) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        (students.length === 0 ? '<div class="empty-note" style="margin-top:14px">' + t('noStudents') + '</div>' : cards) +
      '</main>';

    changeActions['f-month'] = function (el) {
      nav('progress/' + cid + '?ym=' + el.value);
    };
  }

  /* ---------- EXPORTS ---------- */
  function manzilEn(rep, manzilIsTri) {
    if (!rep.manzilDone) return 'Not done';
    if (manzilIsTri) {
      if (rep.manzil === 'half') return 'Half para';
      if (rep.manzil === 'third') return 'One-third para';
      return 'Full para';
    }
    const parts = [];
    if (rep.manzilPages) parts.push(rep.manzilPages + 'p');
    if (rep.manzilLines) parts.push(rep.manzilLines + 'l');
    return parts.join('+') || 'Not done';
  }

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

  function shiftEn(sh) {
    if (!sh) return '';
    return sh === 'sh1' ? '8-10' : sh === 'sh2' ? '10-12' : sh === 'sh3' ? '4-6' : sh === 'sh4' ? '6-8' : '';
  }

  function buildCsvRows(all, cid) {
    const rows = [];
    all.students.forEach(function (s) {
      if (cid && s.classId !== cid) return;
      const cls = all.classes.find(function (c) { return c.id === s.classId; });
      const track = s.type || (cls && cls.type) || 'hifz';
      const manzilIsTri = track === 'hifz';
      Object.keys(all.reports).forEach(function (k) {
        if (k.indexOf(s.id + '|') !== 0) return;
        const ds = k.split('|')[1];
        const r = all.reports[k];
        rows.push([nameClean(cls.name), nameClean(s.name), s.para, s.currentPage || '', s.fullTime ? 'Full Time' : 'Part Time', shiftEn(s.shift), s.category, s.parentName, s.parentNumber, ds,
          r.present ? (r.late ? 'Present (Late)' : 'Present') : 'Absent', r.pages || '', r.lines || '',
          r.present ? (r.sabqiDone ? 'Done' : 'Not done') : '',
          r.present ? manzilEn(r, manzilIsTri) : '',
          !manzilIsTri && r.present ? (r.manzilPages || '') : '',
          !manzilIsTri && r.present ? (r.manzilLines || '') : '',
          r.comment || ''].map(csvCell).join(','));
      });
    });
    return rows;
  }

  async function exportClassExcel(cid) {
    const all = await DB.getAllData();
    const cls = all.classes.find(function (c) { return c.id === cid; });
    const csv = '\uFEFFClass,Student,Para,Current Page,Type,Shift,Category,Parent Name,Parent Number,Date,Present,Sabaq Pages,Sabaq Lines,Sabqi,Manzil,Manzil Pages,Manzil Lines,Comment\n' +
      buildCsvRows(all, cid).join('\n');
    download('madrasa-' + nameClean(cls.name).replace(/\s+/g, '-') + '-reports.csv', csv);
    toast(I18N.t('exportExcel'));
  }

  async function exportAllExcel() {
    const all = await DB.getAllData();
    const csv = '\uFEFFClass,Student,Para,Current Page,Type,Shift,Category,Parent Name,Parent Number,Date,Present,Sabaq Pages,Sabaq Lines,Sabqi,Manzil,Manzil Pages,Manzil Lines,Comment\n' +
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
    const track = cls && cls.type || 'hifz';
    const manzilIsTri = track === 'hifz';
    let rows = '';
    students.forEach(function (s) {
      Object.keys(all.reports).forEach(function (k) {
        if (k.indexOf(s.id + '|') !== 0) return;
        const ds = k.split('|')[1];
        const r = all.reports[k];
        rows += '<tr><td>' + nameDisplay(s.name) + (s.shift ? ' <span class="sh">(' + shiftEn(s.shift) + ')</span>' : '') + '</td><td>' + ds + '</td><td>' + (r.present ? (r.late ? 'Present (Late)' : 'Present') : 'Absent') + '</td>' +
          '<td>' + (r.pages || '') + (r.lines ? '+' + r.lines : '') + '</td>' +
          '<td>' + (r.sabqiDone ? '✓' : '') + '</td><td>' + manzilEn(r, manzilIsTri) + '</td></tr>';
      });
    });
    printHtml(nameDisplay(cls.name) + ' — Reports', rows, '<tr><th>Student</th><th>Date</th><th>Status</th><th>Sabaq</th><th>Sabqi</th><th>Manzil</th></tr>');
  }

  async function exportAllPdf() {
    const all = await DB.getAllData();
    let rows = '';
    all.students.forEach(function (s) {
      const cls = all.classes.find(function (c) { return c.id === s.classId; });
      const track = s.type || (cls && cls.type) || 'hifz';
      const manzilIsTri = track === 'hifz';
      Object.keys(all.reports).forEach(function (k) {
        if (k.indexOf(s.id + '|') !== 0) return;
        const ds = k.split('|')[1];
        const r = all.reports[k];
        rows += '<tr><td>' + nameDisplay(cls.name) + '</td><td>' + nameDisplay(s.name) + (s.shift ? ' <span class="sh">(' + shiftEn(s.shift) + ')</span>' : '') + '</td><td>' + ds + '</td>' +
          '<td>' + (r.present ? (r.late ? 'Present (Late)' : 'Present') : 'Absent') + '</td>' +
          '<td>' + (r.pages || '') + (r.lines ? '+' + r.lines : '') + '</td>' +
          '<td>' + (r.sabqiDone ? '✓' : '') + '</td><td>' + manzilEn(r, manzilIsTri) + '</td></tr>';
      });
    });
    printHtml('All Classes — Reports', rows, '<tr><th>Class</th><th>Student</th><th>Date</th><th>Status</th><th>Sabaq</th><th>Sabqi</th><th>Manzil</th></tr>');
  }

  async function exportStudentReportCard(sid) {
    const all = await DB.getAllData();
    const st = all.students.find(function (s) { return s.id === sid; });
    if (!st) return;
    const cls = all.classes.find(function (c) { return c.id === st.classId; });
    const trackRc = st.type || (cls && cls.type) || 'hifz';
    const manzilIsTri = trackRc === 'hifz';
    const reps = [];
    let presentCount = 0, absentCount = 0, sabaqDays = 0, sabqiDays = 0, manzilDays = 0, totalPages = 0, totalLines = 0;
    Object.keys(all.reports).forEach(function (k) {
      if (k.indexOf(sid + '|') !== 0) return;
      const r = all.reports[k];
      reps.push({ ds: k.split('|')[1], r: r });
      if (r.present) { presentCount++; if (r.sabaqDone) { sabaqDays++; totalPages += r.pages || 0; totalLines += r.lines || 0; } if (r.sabqiDone) sabqiDays++; if (r.manzilDone) { manzilDays++; if (!manzilIsTri) { totalPages += r.manzilPages || 0; totalLines += r.manzilLines || 0; } } }
      else absentCount++;
    });
    reps.sort(function (a, b) { return a.ds < b.ds ? -1 : 1; });
    const fees = all.fees[sid];
    const nowD = new Date();
    const curYm = ymOf(nowD.getFullYear(), nowD.getMonth() + 1);
    const curPaid = fees && fees.payments && fees.payments[curYm] ? fees.payments[curYm].paid : null;

    let repRows = '';
    reps.forEach(function (x) {
      const r = x.r;
      repRows += '<tr>' +
        '<td>' + x.ds + '</td>' +
        '<td>' + (r.present ? (r.late ? 'Present (Late)' : 'Present') : 'Absent') + '</td>' +
        '<td>' + (r.present && r.sabaqDone ? (r.pages ? r.pages + 'p' : '') + (r.lines ? '+' + r.lines + 'l' : '') : '—') + '</td>' +
        '<td>' + (r.present ? (r.sabqiDone ? '✓' : '—') : '—') + '</td>' +
        '<td>' + (r.present ? (r.manzilDone ? manzilEn(r, manzilIsTri) : '—') : '—') + '</td>' +
        '<td>' + (r.comment ? esc(r.comment) : '—') + '</td>' +
      '</tr>';
    });

    const w = window.open('', '_blank');
    w.document.write('<!DOCTYPE html><html><head><title>' + nameDisplay(st.name) + ' — Report Card</title><style>' +
      'body{font-family:Georgia,serif;color:#111;padding:26px 30px}' +
      '.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0E6B3C;padding-bottom:8px}' +
      'h1{font-size:22px;margin:0;color:#0E6B3C}' +
      '.sub{font-size:12px;color:#555;margin-top:4px}' +
      '.right{font-size:11px;color:#666;text-align:right}' +
      'h2{font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#0E6B3C;border-bottom:1px solid #ccc;padding-bottom:3px;margin:18px 0 8px}' +
      '.grid{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px}' +
      '.g{font-size:12px}.g b{display:block;font-size:15px}' +
      '.box{border:1px solid #ccc;padding:8px 10px;border-radius:4px;font-size:12px;display:flex;justify-content:space-between;margin-top:6px}' +
      'table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}' +
      'th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f0ead7}' +
      '.absent{background:#fdf0f0}' +
      '.foot{margin-top:20px;font-size:10px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:6px}' +
      '@media print{.no-print{display:none}}' +
      '</style></head><body>' +
      '<div class="head"><div>' +
        '<h1>Madrasa Dar ul Ma\'arij</h1>' +
        '<div class="sub">Report Card — ' + nameDisplay(cls.name) + '</div>' +
      '</div><div class="right">Generated: ' + new Date().toLocaleDateString() + '</div></div>' +

      '<h2>Student</h2>' +
      '<div class="grid">' +
        '<div class="g"><b>' + nameDisplay(st.name) + '</b>' + 'Student Name</div>' +
        '<div class="g"><b>' + st.para + '</b>Current Para</div>' +
        '<div class="g"><b>' + (st.currentPage || '—') + '</b>Current Page</div>' +
        '<div class="g"><b>' + (st.fullTime ? 'Full-time' : 'Part-time') + '</b>Type</div>' +
        (st.shift ? '<div class="g"><b>' + shiftEn(st.shift) + '</b>Shift</div>' : '') +
        '<div class="g"><b>' + esc(st.parentName || '—') + '</b>Parent</div>' +
        '<div class="g"><b>' + esc(st.parentNumber || '—') + '</b>Contact</div>' +
      '</div>' +

      '<h2>Attendance & Memorization</h2>' +
      '<div class="grid">' +
        '<div class="g"><b>' + presentCount + '</b>Present Days</div>' +
        '<div class="g"><b>' + absentCount + '</b>Absent Days</div>' +
        '<div class="g"><b>' + (presentCount + absentCount) + '</b>Total Days</div>' +
        '<div class="g"><b>' + sabaqDays + '</b>Sabaq Days</div>' +
        '<div class="g"><b>' + sabqiDays + '</b>Sabqi Days</div>' +
        '<div class="g"><b>' + manzilDays + '</b>Manzil Days</div>' +
        '<div class="g"><b>' + totalPages + 'p + ' + totalLines + 'l</b>Total Memorized</div>' +
      '</div>' +

      (fees ? '<h2>Fees (' + (fees.amount != null ? fees.amount + ' OMR' : 'not set') + ')</h2>' +
        '<div class="box"><span>This month (current):</span><b>' + (curPaid === null ? 'Not marked' : curPaid ? 'PAID ✓' : 'Unpaid ✗') + '</b></div>' : '') +

      '<h2>Daily Records' + (reps.length ? ' (' + reps.length + ')' : '') + '</h2>' +
      (reps.length === 0 ? '<div style="font-size:12px;color:#666">No daily reports recorded.</div>' :
      '<table><thead><tr><th>Date</th><th>Status</th><th>Sabaq</th><th>Sabqi</th><th>Manzil</th><th>Comment</th></tr></thead><tbody>' +
      repRows + '</tbody></table>') +

      '<div class="foot">Madrasa Dar ul Ma\'arij — Student Report Card</div>' +
      '</body></html>');
    w.document.close();
    setTimeout(function () { w.print(); }, 300);
    toast(I18N.t('reportCard'));
  }

  /* ---------- Export Data (JSON dump for the database) ---------- */
  function exportData() {
    DB.getAllData().then(function (all) {
      const payload = {
        app: 'madrasa-reports',
        version: 2,
        exportedAt: new Date().toISOString(),
        data: all
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'madrasa-data-' + todayDs() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast(I18N.t('exportData'));
    });
  }

  function handleImportFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const text = String(reader.result || '');
      try {
        const parsed = JSON.parse(text.trim());
        DB.importData(parsed).then(function (res) {
          if (res.ok) {
            toast(I18N.t('importOk'));
            setTimeout(function () { route(); }, 500);
          } else {
            toast(I18N.t('importBad'));
          }
        });
      } catch (e) {
        toast(I18N.t('importBad'));
      }
    };
    reader.readAsText(file);
  }

  /* ---------- topbar ---------- */
  function nextLangLabel() {
    const langs = ['en', 'ur', 'ar'];
    const next = langs[(langs.indexOf(I18N.get()) + 1) % langs.length];
    if (next === 'ur') return I18N.t('urdu');
    if (next === 'ar') return I18N.t('arabic');
    return I18N.t('english');
  }

  function topbar(showBack) {
    return '' +
      '<header class="topbar no-print">' +
        (showBack ? '<button class="icon-btn" data-action="back" aria-label="back">&larr;</button>' : '') +
        '<div class="brand" data-action="home" style="cursor:pointer" title="Home">' +
          '<img src="assets/logo.png" alt="">' +
          '<span class="t1">' + esc(I18N.t('appName')) + '</span>' +
        '</div>' +
        '<div class="spacer"></div>' +
        (DB.installable && typeof DB.installable === 'function' && DB.installable() ?
          '<button class="icon-btn" data-action="install-app" title="' + esc(I18N.t('parentInstallApp')) + '">📲</button>' : '') +
        '<button class="icon-btn" data-action="go-password" title="' + esc(I18N.t('changePassword')) + '">🔐</button>' +
        '<button class="icon-btn" data-action="toggle-lang" title="Language">' +
          esc(nextLangLabel()) +
        '</button>' +
        '<button class="icon-btn" data-action="toggle-theme" title="Theme">' +
          (document.documentElement.getAttribute('data-theme') === 'dark' ? '☀' : '☾') +
        '</button>' +
        '<button class="icon-btn" data-action="logout">' + esc(I18N.t('logout')) + '</button>' +
      '</header>';
  }

  /* ---------- boot ---------- */
  (async function boot() {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'import-file';
    input.accept = '*';
    input.style.display = 'none';
    document.body.appendChild(input);

    window.addEventListener('beforeinstallprompt', function (e) { DB.captureInstallPrompt(e); });
    if (DB.registerPush) DB.registerPush();

    applyLangTheme();
    if (DB.restoreSession) await DB.restoreSession();
    await route();
  })();
})();
