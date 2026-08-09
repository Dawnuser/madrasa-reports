/* ============================================================
   Data layer — SAMPLE MODE
   Everything runs on localStorage with seeded demo data.
   The API surface below is identical to the Supabase-backed
   layer we'll swap in once the real database exists.
   ============================================================ */
const DB = (function () {
  const KEY = 'mdm_db_v1';
  const SESSION_KEY = 'mdm_session';
  let memSession = null;

  const USERS = {
    qari1: { id: 'qari1', name: 'Qari Sahab 1', role: 'qari', classId: 'c1', pass: 'qari123' },
    qari2: { id: 'qari2', name: 'Qari Sahab 2', role: 'qari', classId: 'c2', pass: 'qari123' },
    qari3: { id: 'qari3', name: 'Qari Sahab 3', role: 'qari', classId: 'c3', pass: 'qari123' },
    principal: { id: 'principal', name: 'Principal', role: 'principal', pass: 'principal123' }
  };

  const CATEGORIES = { A: '10', B: '20', C: '30', D: '40' };

  /* ---------- seed ---------- */
  function seed() {
    const classes = [
      { id: 'c1', name: 'Hifz Class 1', qariId: 'qari1' },
      { id: 'c2', name: 'Hifz Class 2', qariId: 'qari2' },
      { id: 'c3', name: 'Hifz Class 3', qariId: 'qari3' }
    ];
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
          parentName: row[4],
          parentPhone: '96895455137',
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
        }
        reports[st.id + '|' + ds] = rep;
      });
    }
    return { classes: classes, students: students, reports: reports, createdAt: Date.now() };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const db = seed();
    save(db);
    return db;
  }

  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
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
      const u = USERS[String(username).trim().toLowerCase()];
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

    /* classes & students */
    async getClasses() { return load().classes; },
    async getClass(id) {
      return load().classes.find(function (c) { return c.id === id; }) || null;
    },
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
      } else {
        st.id = 's' + Date.now();
        db.students.push(st);
      }
      save(db);
      return st;
    },
    async deleteStudent(id) {
      const db = load();
      db.students = db.students.filter(function (s) { return s.id !== id; });
      Object.keys(db.reports).forEach(function (k) {
        if (k.indexOf(id + '|') === 0) delete db.reports[k];
      });
      save(db);
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
    async getAllData() {
      const db = load();
      return { classes: db.classes, students: db.students, reports: db.reports };
    },

    /* dates */
    todayStr: todayStr,
    addDays: addDays,

    /* meta */
    categories: CATEGORIES,
    usersMeta: USERS
  };

  return api;
})();
