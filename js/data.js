/* ============================================================
   Data layer — SAMPLE MODE
   Everything runs on localStorage with seeded demo data.
   The API surface below is identical to the Supabase-backed
   layer we'll swap in once the real database exists.
   ============================================================ */
const DB = (function () {
  const KEY = 'mdm_db_v3';
  const SESSION_KEY = 'mdm_session';
  let memSession = null;

  const DEFAULT_QARI_PASS = 'qari123';
  const CATEGORIES = { A: '10', B: '20', C: '30', D: '40' };

  function nextQariId(db) {
    let n = 1;
    while (db.users['qari' + n]) n++;
    return 'qari' + n;
  }

  function ymStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /* ---------- seed ---------- */
  function seed() {
    const classes = [
      { id: 'c1', name: 'Sheikh Atta-ul-Rahman', qariId: 'qari1' },
      { id: 'c2', name: 'Sheikh Anees', qariId: 'qari2' },
      { id: 'c3', name: 'Sheikh Hussain', qariId: 'qari3' }
    ];
    const users = {
      qari1: { id: 'qari1', name: 'Sheikh Atta-ul-Rahman', role: 'qari', classId: 'c1', pass: DEFAULT_QARI_PASS },
      qari2: { id: 'qari2', name: 'Sheikh Anees', role: 'qari', classId: 'c2', pass: DEFAULT_QARI_PASS },
      qari3: { id: 'qari3', name: 'Sheikh Hussain', role: 'qari', classId: 'c3', pass: DEFAULT_QARI_PASS },
      admin: { id: 'admin', name: 'Sheikh Naseer Ahmed', role: 'principal', pass: 'admin@2008' }
    };
    const names = [
      ['Ahmad Raza', 13, 12, 'A', 'Muhammad Raza'],
      ['Muhammad Usman', 11, 8, 'B', 'Usman Khan'],
      ['Abdul Rahman', 9, 5, 'A', 'Rahman Ali'],
      ['Hamza Siddiqui', 14, 15, 'B', 'Siddiqui Ahmed'],
      ['Ibrahim Khalil', 10, 6, 'C', 'Khalil Khan'],
      ['Yusuf Ansari', 12, 10, 'A', 'Ansari Muhammad'],
      ['Bilal Qureshi', 11, 9, 'B', 'Qureshi Abdul'],
      ['Zaid Farooq', 13, 14, 'A', 'Farooq Aslam'],
      ['Ayaan Malik', 9, 4, 'C', 'Malik Nasir'],
      ['Sulaiman Haq', 12, 11, 'B', 'Haq Tariq'],
      ['Haris Shah', 10, 7, 'A', 'Shah Javed'],
      ['Mansoor Ali', 14, 16, 'D', 'Ali Saeed']
    ];
    let sid = 1;
    const students = [];
    classes.forEach(function (cls, ci) {
      for (let i = 0; i < 6; i++) {
        const row = names[(ci * 6 + i) % names.length];
        students.push({
          id: 's' + sid,
          classId: cls.id,
          name: row[0],
          age: row[1] + ci,
          para: row[2],
          currentPage: (row[2] - 1) * 20 + 1 + ((sid * 3 + ci) % 20),
          fullTime: (sid % 3 !== 0),
          parentName: row[4],
          parentNumber: '96895455137',
          omanId: '',
          category: row[3]
        });
        sid++;
      }
    });

    /* deterministic pseudo-random reports for the last 14 days (ends yesterday,
       so today starts blank — the qari enters today's reports in the demo) */
    const reports = {};
    const today = new Date();
    for (let d = 14; d >= 1; d--) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
      const ds = dstr(date);
      students.forEach(function (st, si) {
        const rnd = (si * 7 + d * 5 + si * d * 3) % 100;
        const absent = rnd < 12;
        const rep = { present: !absent };
        if (!absent) {
          rep.sabaqDone = (rnd % 17) !== 3;
          if (rep.sabaqDone) {
            rep.pages = 1 + (rnd % 3);
            rep.lines = (rnd % 5 === 0) ? 1 + (rnd % 5) : null;
          } else {
            rep.pages = null; rep.lines = null;
          }
          rep.sabqiDone = (rnd % 13) !== 5;
          rep.manzilDone = (rnd % 11) !== 4;
          rep.manzil = rep.manzilDone ? ['half', 'third', 'full'][(si + d) % 3] : null;
          if (si % 5 === 2 && (rnd % 3) === 0) rep.comment = 'Great progress today, keep it up!';
        }
        reports[st.id + '|' + ds] = rep;
      });
    }

    /* fees — principal sets amount per student; payments keyed by YYYY-MM */
    const fees = {};
    students.forEach(function (st) {
      fees[st.id] = { amount: 5, payments: {} };
    });
    const curYm = ymStr(new Date());
    students.forEach(function (st, i) {
      if (i % 2 === 0) {
        const qariId = st.classId === 'c1' ? 'qari1' : st.classId === 'c2' ? 'qari2' : 'qari3';
        fees[st.id].payments[curYm] = { paid: true, markedBy: qariId, markedAt: Date.now() - 86400000 };
      }
    });

    /* weekly + monthly reports — keyed by studentId|weekKey and studentId|YYYY-MM */
    const weekly = {};
    const monthly = {};

    return { classes: classes, users: users, students: students, reports: reports, fees: fees, weekly: weekly, monthly: monthly, trash: [], createdAt: Date.now() };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const db = JSON.parse(raw);
        if (!db.trash) db.trash = [];
        pruneTrash(db);
        return db;
      }
    } catch (e) {}
    const db = seed();
    save(db);
    return db;
  }

  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  }

  /* remove trash entries older than 30 days */
  function pruneTrash(db) {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - THIRTY_DAYS;
    db.trash = db.trash.filter(function (item) { return item.deletedAt > cutoff; });
  }

  /* ---------- date helpers ---------- */
  function dstr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function todayStr() { return dstr(new Date()); }
  function addDays(ds, n) {
    const parts = ds.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] + n);
    return dstr(d);
  }

  /* ---------- public API (Supabase will replace the bodies) ---------- */
  const api = {
    /* auth */
    async login(username, password) {
      const db = load();
      const u = db.users[String(username).trim().toLowerCase()];
      if (u && u.pass === password) {
        const session = { id: u.id, name: u.name, role: u.role, classId: u.classId };
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
        memSession = session;
        return session;
      }
      return null;
    },
    getSession() {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return memSession;
    },
    logout() {
      memSession = null;
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    },

    /* users */
    async getUsers() { return load().users; },

    /* classes — one class per qari; the class name IS the qari's name */
    async getClasses() { return load().classes; },
    async getClass(id) {
      return load().classes.find(function (c) { return c.id === id; }) || null;
    },
    async saveClass(cls) {
      const db = load();
      if (cls.id) {
        /* edit — rename the class and its qari together */
        const i = db.classes.findIndex(function (c) { return c.id === cls.id; });
        if (i >= 0) {
          const old = db.classes[i];
          db.classes[i] = { id: old.id, name: cls.name, qariId: old.qariId };
          const q = db.users[old.qariId];
          if (q) q.name = cls.name;
        }
      } else {
        /* add — create a fresh qari account + class from the name */
        const qariId = nextQariId(db);
        const cid = 'c' + Date.now();
        db.classes.push({ id: cid, name: cls.name, qariId: qariId });
        db.users[qariId] = { id: qariId, name: cls.name, role: 'qari', classId: cid, pass: DEFAULT_QARI_PASS };
      }
      save(db);
      return cls;
    },
    async deleteClass(id) {
      const db = load();
      const cls = db.classes.find(function (c) { return c.id === id; });
      if (!cls) return { ok: false };
      const doomed = db.students.filter(function (s) { return s.classId === id; });
      const doomedIds = doomed.map(function (s) { return s.id; });
      const reports = {};
      Object.keys(db.reports).forEach(function (k) {
        if (doomedIds.some(function (did) { return k.indexOf(did + '|') === 0; })) reports[k] = db.reports[k];
      });
      const fees = {};
      doomedIds.forEach(function (did) { if (db.fees[did]) fees[did] = db.fees[did]; });
      const qari = cls.qariId ? db.users[cls.qariId] : null;
      db.trash.push({
        id: 't' + Date.now(),
        kind: 'class',
        deletedAt: Date.now(),
        payload: { cls: cls, qari: qari, students: doomed, reports: reports, fees: fees }
      });
      db.classes = db.classes.filter(function (c) { return c.id !== id; });
      if (cls && cls.qariId) delete db.users[cls.qariId];
      db.students = db.students.filter(function (s) { return s.classId !== id; });
      Object.keys(reports).forEach(function (k) { delete db.reports[k]; });
      doomedIds.forEach(function (did) { delete db.fees[did]; });
      save(db);
      return { ok: true };
    },

    /* students */
    async getStudents(classId) {
      return load().students.filter(function (s) { return s.classId === classId; });
    },
    async getStudent(id) {
      return load().students.find(function (s) { return s.id === id; }) || null;
    },
    async saveStudent(st) {
      const db = load();
      if (st.id) {
        const i = db.students.findIndex(function (s) { return s.id === st.id; });
        if (i >= 0) db.students[i] = st;
        if (!db.fees[st.id]) db.fees[st.id] = { amount: null, payments: {} };
      } else {
        st.id = 's' + Date.now();
        db.students.push(st);
        if (!db.fees[st.id]) db.fees[st.id] = { amount: null, payments: {} };
      }
      save(db);
      return st;
    },
    async deleteStudent(id) {
      const db = load();
      const st = db.students.find(function (s) { return s.id === id; });
      if (!st) return { ok: false };
      const reports = {};
      Object.keys(db.reports).forEach(function (k) {
        if (k.indexOf(id + '|') === 0) reports[k] = db.reports[k];
      });
      db.trash.push({
        id: 't' + Date.now(),
        kind: 'student',
        deletedAt: Date.now(),
        payload: { st: st, reports: reports, fees: db.fees[id] || null }
      });
      db.students = db.students.filter(function (s) { return s.id !== id; });
      Object.keys(reports).forEach(function (k) { delete db.reports[k]; });
      delete db.fees[id];
      save(db);
      return { ok: true };
    },

    /* ---------- trash (recently deleted, kept 30 days) ---------- */
    async getTrash() {
      const db = load();
      pruneTrash(db);
      return db.trash.slice().sort(function (a, b) { return b.deletedAt - a.deletedAt; });
    },
    async restoreTrashItem(tid) {
      const db = load();
      const idx = db.trash.findIndex(function (t) { return t.id === tid; });
      if (idx < 0) return { ok: false };
      const item = db.trash[idx];
      const p = item.payload;
      if (item.kind === 'class') {
        if (db.classes.some(function (c) { return c.id === p.cls.id; })) return { ok: false, error: 'exists' };
        db.classes.push(p.cls);
        if (p.qari && !db.users[p.qari.id]) db.users[p.qari.id] = p.qari;
        p.students.forEach(function (s) { if (!db.students.some(function (x) { return x.id === s.id; })) db.students.push(s); });
        Object.assign(db.reports, p.reports);
        Object.assign(db.fees, p.fees);
      } else {
        if (db.students.some(function (s) { return s.id === p.st.id; })) return { ok: false, error: 'exists' };
        db.students.push(p.st);
        Object.assign(db.reports, p.reports);
        if (p.fees) db.fees[p.st.id] = p.fees;
      }
      db.trash.splice(idx, 1);
      save(db);
      return { ok: true };
    },
    async purgeTrashItem(tid) {
      const db = load();
      db.trash = db.trash.filter(function (t) { return t.id !== tid; });
      save(db);
      return { ok: true };
    },
    async emptyTrash() {
      const db = load();
      db.trash = [];
      save(db);
      return { ok: true };
    },

    /* reports */
    async getReport(studentId, ds) {
      return load().reports[studentId + '|' + ds] || null;
    },
    async saveReport(studentId, ds, rep) {
      const db = load();
      db.reports[studentId + '|' + ds] = rep;
      save(db);
    },
    async getMonthReports(studentId, year, month) {
      const db = load();
      const prefix = studentId + '|' + year + '-' + String(month).padStart(2, '0');
      const out = {};
      Object.keys(db.reports).forEach(function (k) {
        if (k.indexOf(prefix) === 0) out[k.split('|')[1]] = db.reports[k];
      });
      return out;
    },

    /* fees */
    async getAllFees() { return load().fees; },
    async setFeeAmount(studentId, amount) {
      const db = load();
      if (!db.fees[studentId]) db.fees[studentId] = { amount: null, payments: {} };
      db.fees[studentId].amount = amount;
      save(db);
    },
    async markFee(studentId, ym, paid, markedBy) {
      const db = load();
      if (!db.fees[studentId]) db.fees[studentId] = { amount: null, payments: {} };
      db.fees[studentId].payments[ym] = { paid: paid, markedBy: markedBy, markedAt: Date.now() };
      save(db);
    },

    /* weekly + monthly reports */
    async getWeekReport(studentId, weekKey) {
      return load().weekly[studentId + '|' + weekKey] || null;
    },
    async saveWeekReport(studentId, weekKey, rep) {
      const db = load();
      db.weekly[studentId + '|' + weekKey] = rep;
      save(db);
    },
    async getMonthReport(studentId, ym) {
      return load().monthly[studentId + '|' + ym] || null;
    },
    async saveMonthReport(studentId, ym, rep) {
      const db = load();
      db.monthly[studentId + '|' + ym] = rep;
      save(db);
    },

    /* weekly + monthly reports */
    async getWeekly(studentId, weekKey) {
      return load().weekly[studentId + '|' + weekKey] || null;
    },
    async saveWeekly(studentId, weekKey, data) {
      const db = load();
      db.weekly[studentId + '|' + weekKey] = Object.assign({}, data, { savedAt: Date.now() });
      save(db);
    },
    async getMonthlyReport(studentId, ym) {
      return load().monthly[studentId + '|' + ym] || null;
    },
    async saveMonthlyReport(studentId, ym, data) {
      const db = load();
      db.monthly[studentId + '|' + ym] = Object.assign({}, data, { savedAt: Date.now() });
      save(db);
    },

    /* full dump (export) */
    async getAllData() {
      const db = load();
      return { classes: db.classes, users: db.users, students: db.students, reports: db.reports, fees: db.fees, weekly: db.weekly, monthly: db.monthly };
    },

    /* full restore (import) — accepts the JSON dump from getAllData()/exportData, with or without the wrapper */
    async importData(payload) {
      let data = payload;
      if (data && data.app === 'madrasa-reports' && data.data) data = data.data;
      if (!data || typeof data !== 'object') return { ok: false, error: 'shape' };
      if (!Array.isArray(data.classes) || !Array.isArray(data.students) || typeof data.users !== 'object') {
        return { ok: false, error: 'shape' };
      }
      const db = {
        classes: data.classes,
        users: data.users || {},
        students: data.students,
        reports: data.reports || {},
        fees: data.fees || {},
        weekly: data.weekly || {},
        monthly: data.monthly || {},
        createdAt: data.createdAt || Date.now()
      };
      save(db);
      return { ok: true };
    },

    /* dates */
    todayStr: todayStr,
    addDays: addDays,

    /* meta */
    categories: CATEGORIES
  };

  return api;
})();
