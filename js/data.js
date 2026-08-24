/* ============================================================
   Data layer — SUPABASE MODE
   Replaces localStorage with a shared Supabase database.
   Same public API surface as the sample layer (see git history).
   ============================================================ */
const DB = (function () {
  const SUPABASE_URL = 'https://xalvjslloofelcftqwqp.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_Gru4M7oK7lP-mako8r6zmQ_Anr0dYXs';
  const SESSION_KEY = 'mdm_session';
  let memSession = null;
  let sb = null;

  /* fee defaults — part time 18, full time 25 (OMR) */
  const PART_TIME_FEE = 18;
  const FULL_TIME_FEE = 25;
  const LEGACY_SEED_FEE = 5;
  function defaultFee(st) {
    return st && st.fullTime ? FULL_TIME_FEE : PART_TIME_FEE;
  }

  function client() {
    if (!sb) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return sb;
  }

  /* session helpers (sync — the UI reads them synchronously) */
  function persistSession(s) {
    memSession = s;
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }
  function getCachedSession() {
    if (memSession) return memSession;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) { memSession = JSON.parse(raw); return memSession; }
    } catch (e) {}
    return null;
  }

  /* ---------- row mapping ---------- */
  function mapStudent(r) {
    return {
      id: r.id,
      classId: r.class_id,
      name: r.name,
      age: r.age,
      para: r.para,
      currentPage: r.current_page,
      fullTime: r.full_time,
      parentName: r.parent_name,
      parentNumber: r.parent_number,
      omanId: r.oman_id,
      category: r.category
    };
  }
  function unmapStudent(st) {
    return {
      class_id: st.classId,
      name: st.name,
      age: st.age,
      para: st.para,
      current_page: st.currentPage,
      full_time: st.fullTime,
      parent_name: st.parentName,
      parent_number: st.parentNumber,
      oman_id: st.omanId,
      category: st.category
    };
  }
  function mapReport(r) {
    return {
      present: r.present,
      sabaqDone: r.sabaq_done,
      pages: r.pages,
      lines: r.lines,
      sabqiDone: r.sabqi_done,
      manzilDone: r.manzil_done,
      manzil: r.manzil,
      comment: r.comment
    };
  }
  function unmapReport(rep) {
    return {
      present: rep.present,
      sabaq_done: rep.sabaqDone,
      pages: rep.pages,
      lines: rep.lines,
      sabqi_done: rep.sabqiDone,
      manzil_done: rep.manzilDone,
      manzil: rep.manzil,
      comment: rep.comment
    };
  }
  function mapClass(r) {
    return { id: r.id, name: r.name, qariId: null };
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
  function ymStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  const CATEGORIES = { A: '10', B: '20', C: '30', D: '40' };

  /* ---------- public API ---------- */
  const api = {
    /* auth */
    async login(identifier, password) {
      const c = client();
      const { data, error } = await c.auth.signInWithPassword({
        email: String(identifier).trim().toLowerCase(),
        password: password
      });
      if (error || !data.user) return null;
      let prof = await api.getProfile(data.user.id);
      if (!prof) return null;
      /* self-heal: if there is no admin anywhere yet, promote the first user to admin */
      if (prof.role !== 'admin') {
        const { data: admins } = await c.from('profiles').select('id').eq('role', 'admin').limit(1);
        if (!admins || !admins.length) {
          await c.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
          prof = await api.getProfile(data.user.id);
        }
      }
      const session = {
        id: data.user.id,
        name: prof.name || data.user.email,
        role: prof.role === 'admin' ? 'principal' : 'qari',
        classId: prof.class_id || null
      };
      persistSession(session);
      return session;
    },
    async getProfile(userId) {
      const c = client();
      const { data, error } = await c.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error || !data) return null;
      return data;
    },
    /* sync view of current session (the UI reads it synchronously) */
    getSession() {
      return getCachedSession();
    },
    /* called once at boot — rebuild cached session from Supabase's persisted session */
    async restoreSession() {
      try {
        const { data } = await client().auth.getSession();
        if (data && data.session) {
          const prof = await api.getProfile(data.session.user.id);
          if (prof) {
            const s = {
              id: data.session.user.id,
              name: prof.name || data.session.user.email,
              role: prof.role === 'admin' ? 'principal' : 'qari',
              classId: prof.class_id || null
            };
            persistSession(s);
            return s;
          }
        }
      } catch (e) {}
      return getCachedSession();
    },
    async logout() {
      persistSession(null);
      try { await client().auth.signOut(); } catch (e) {}
    },

    /* users */
    async getUsers() {
      const c = client();
      const { data, error } = await c.from('profiles').select('*');
      const out = {};
      (data || []).forEach(function (p) {
        out[p.id] = { id: p.id, name: p.name, role: p.role === 'admin' ? 'principal' : 'qari', classId: p.class_id };
      });
      return out;
    },

    /* classes — one class per qari; the class name IS the qari's name */
    async getClasses() {
      const c = client();
      const { data, error } = await c.from('classes').select('*').order('created_at');
      return (data || []).map(mapClass);
    },
    async getClass(id) {
      const c = client();
      const { data, error } = await c.from('classes').select('*').eq('id', id).maybeSingle();
      return data ? mapClass(data) : null;
    },
    async saveClass(cls) {
      const c = client();
      if (cls.id) {
        const { data, error } = await c.from('classes').update({ name: cls.name, qari_name: cls.name }).eq('id', cls.id).select().single();
        return data ? mapClass(data) : cls;
      } else {
        const { data, error } = await c.from('classes').insert({ name: cls.name, qari_name: cls.name, category: 'A' }).select().single();
        return data ? mapClass(data) : cls;
      }
    },
    async deleteClass(id) {
      const c = client();
      const cls = await api.getClass(id);
      if (!cls) return { ok: false };
      const { data: studs } = await c.from('students').select('*').eq('class_id', id);
      const students = (studs || []).map(mapStudent);
      const studentIds = students.map(function (s) { return s.id; });
      let reports = {}, fees = {};
      if (studentIds.length) {
        const { data: repRows } = await c.from('reports').select('*').in('student_id', studentIds);
        (repRows || []).forEach(function (r) { reports[r.student_id + '|' + dstr(new Date(r.date))] = mapReport(r); });
        const { data: fsRows } = await c.from('fee_settings').select('*').in('student_id', studentIds);
        const { data: fpRows } = await c.from('fee_payments').select('*').in('student_id', studentIds);
        fsRows.forEach(function (f) { if (!fees[f.student_id]) fees[f.student_id] = { amount: f.amount, payments: {} }; });
        fpRows.forEach(function (p) {
          const ym = ymStr(new Date(p.month));
          if (!fees[p.student_id]) fees[p.student_id] = { amount: null, payments: {} };
          fees[p.student_id].payments[ym] = { paid: p.paid, markedBy: p.marked_by, markedAt: p.marked_at ? Date.parse(p.marked_at) : null };
        });
      }
      await api.pushTrash({
        kind: 'class',
        payload: { cls: { id: id, name: cls.name }, students: students, reports: reports, fees: fees }
      });
      await c.from('classes').delete().eq('id', id);
      return { ok: true };
    },

    /* students */
    async getStudents(classId) {
      const c = client();
      const { data, error } = await c.from('students').select('*').eq('class_id', classId).order('name');
      return (data || []).map(mapStudent);
    },
    async getStudentsByClass(ids) {
      const c = client();
      if (!ids || !ids.length) return {};
      const { data } = await c.from('students').select('*').in('class_id', ids).order('name');
      const out = {};
      (data || []).forEach(function (r) {
        if (!out[r.class_id]) out[r.class_id] = [];
        out[r.class_id].push(mapStudent(r));
      });
      return out;
    },
    async getStudent(id) {
      const c = client();
      const { data, error } = await c.from('students').select('*').eq('id', id).maybeSingle();
      return data ? mapStudent(data) : null;
    },
    async saveStudent(st) {
      const c = client();
      if (st.id) {
        const { data: oldRow } = await c.from('students').select('*').eq('id', st.id).maybeSingle();
        const old = oldRow ? mapStudent(oldRow) : null;
        const { data, error } = await c.from('students').update(unmapStudent(st)).eq('id', st.id).select().single();
        if (old) {
          const oldDefault = defaultFee(old);
          const { data: f } = await c.from('fee_settings').select('*').eq('student_id', st.id).maybeSingle();
          if (f) {
            if (old.fullTime !== st.fullTime && (f.amount == null || Number(f.amount) === oldDefault || Number(f.amount) === LEGACY_SEED_FEE)) {
              await c.from('fee_settings').update({ amount: defaultFee(st) }).eq('student_id', st.id);
            }
          } else {
            await c.from('fee_settings').insert({ student_id: st.id, amount: defaultFee(st) });
          }
        }
        return data ? mapStudent(data) : st;
      } else {
        const { data, error } = await c.from('students').insert(unmapStudent(st)).select().single();
        const created = data ? mapStudent(data) : st;
        await c.from('fee_settings').insert({ student_id: created.id, amount: defaultFee(created) });
        return created;
      }
    },
    async deleteStudent(id) {
      const c = client();
      const st = await api.getStudent(id);
      if (!st) return { ok: false };
      let reports = {};
      const { data: repRows } = await c.from('reports').select('*').eq('student_id', id);
      (repRows || []).forEach(function (r) { reports[r.student_id + '|' + dstr(new Date(r.date))] = mapReport(r); });
      const { data: f } = await c.from('fee_settings').select('*').eq('student_id', id).maybeSingle();
      const fees = f ? { amount: f.amount, payments: {} } : null;
      const { data: fpRows } = await c.from('fee_payments').select('*').eq('student_id', id);
      if (fees && fpRows) {
        fpRows.forEach(function (p) {
          fees.payments[ymStr(new Date(p.month))] = { paid: p.paid, markedBy: p.marked_by, markedAt: p.marked_at ? Date.parse(p.marked_at) : null };
        });
      }
      await api.pushTrash({ kind: 'student', payload: { st: st, reports: reports, fees: fees } });
      await c.from('students').delete().eq('id', id);
      return { ok: true };
    },

    /* trash */
    async pushTrash(item) {
      const c = client();
      await c.from('trash').insert({
        tid: 't' + Date.now(),
        kind: item.kind,
        payload: item.payload
      });
    },
    async getTrash() {
      const c = client();
      const { data } = await c.from('trash').select('*').order('deleted_at', { ascending: false });
      return (data || []).map(function (r) {
        return { id: r.tid, kind: r.kind, deletedAt: Date.parse(r.deleted_at), payload: r.payload };
      });
    },
    async restoreTrashItem(tid) {
      const c = client();
      const { data: rows } = await c.from('trash').select('*').eq('tid', tid);
      const row = rows && rows[0];
      if (!row) return { ok: false };
      const p = row.payload;
      if (row.kind === 'class') {
        const { data: existing } = await c.from('classes').select('id').eq('id', p.cls.id);
        if (existing && existing.length) return { ok: false, error: 'exists' };
        await c.from('classes').insert({ id: p.cls.id, name: p.cls.name, qari_name: p.cls.name });
        for (const s of p.students) {
          const { data: ex } = await c.from('students').select('id').eq('id', s.id);
          if (ex && ex.length) continue;
          await c.from('students').insert(Object.assign({ id: s.id }, unmapStudent(s)));
          await c.from('fee_settings').insert({ student_id: s.id, amount: defaultFee(s) });
        }
        for (const k of Object.keys(p.reports)) {
          const parts = k.split('|');
          await c.from('reports').upsert({ student_id: parts[0], date: parts[1], present: true });
        }
      } else {
        const { data: existing } = await c.from('students').select('id').eq('id', p.st.id);
        if (existing && existing.length) return { ok: false, error: 'exists' };
        await c.from('students').insert(Object.assign({ id: p.st.id }, unmapStudent(p.st)));
        if (p.fees) await c.from('fee_settings').insert({ student_id: p.st.id, amount: p.fees.amount || defaultFee(p.st) });
        for (const k of Object.keys(p.reports)) {
          const parts = k.split('|');
          await c.from('reports').upsert({ student_id: parts[0], date: parts[1], present: true });
        }
      }
      await c.from('trash').delete().eq('tid', tid);
      return { ok: true };
    },
    async purgeTrashItem(tid) {
      const c = client();
      await c.from('trash').delete().eq('tid', tid);
      return { ok: true };
    },
    async emptyTrash() {
      const c = client();
      await c.from('trash').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      return { ok: true };
    },

    /* reports */
    async getReport(studentId, ds) {
      const c = client();
      const { data } = await c.from('reports').select('*').eq('student_id', studentId).eq('date', ds).maybeSingle();
      return data ? mapReport(data) : null;
    },
    async saveReport(studentId, ds, rep) {
      const c = client();
      const { error } = await c.from('reports').upsert(Object.assign({ student_id: studentId, date: ds }, unmapReport(rep)));
      if (error) console.error('saveReport', error);
    },
    async getMonthReports(studentId, year, month) {
      const c = client();
      const y = String(year);
      const m = String(month).padStart(2, '0');
      const { data } = await c.from('reports').select('*').eq('student_id', studentId)
        .gte('date', y + '-' + m + '-01').lte('date', y + '-' + m + '-31');
      const out = {};
      (data || []).forEach(function (r) { out[dstr(new Date(r.date))] = mapReport(r); });
      return out;
    },
    /* batch helpers — collapse N+1 report queries into single calls */
    async getDayReports(studentIds, ds) {
      const c = client();
      if (!studentIds || !studentIds.length) return {};
      const { data } = await c.from('reports').select('*').in('student_id', studentIds).eq('date', ds);
      const out = {};
      (data || []).forEach(function (r) { out[r.student_id] = mapReport(r); });
      return out;
    },
    async getMonthReportsForStudents(studentIds, year, month) {
      const c = client();
      if (!studentIds || !studentIds.length) return {};
      const y = String(year);
      const m = String(month).padStart(2, '0');
      const { data } = await c.from('reports').select('*').in('student_id', studentIds)
        .gte('date', y + '-' + m + '-01').lte('date', y + '-' + m + '-31');
      const out = {};
      (data || []).forEach(function (r) {
        const ds = dstr(new Date(r.date));
        if (!out[r.student_id]) out[r.student_id] = {};
        out[r.student_id][ds] = mapReport(r);
      });
      return out;
    },
    async getReportRange(studentId, fromDs, toDs) {
      const c = client();
      const { data } = await c.from('reports').select('*').eq('student_id', studentId)
        .gte('date', fromDs).lte('date', toDs);
      const out = {};
      (data || []).forEach(function (r) { out[dstr(new Date(r.date))] = mapReport(r); });
      return out;
    },

    /* fees */
    async getAllFees() {
      const c = client();
      const { data: fs } = await c.from('fee_settings').select('*');
      const { data: fp } = await c.from('fee_payments').select('*');
      const out = {};
      (fs || []).forEach(function (f) { out[f.student_id] = { amount: f.amount == null ? null : Number(f.amount), payments: {} }; });
      (fp || []).forEach(function (p) {
        const ym = ymStr(new Date(p.month));
        if (!out[p.student_id]) out[p.student_id] = { amount: null, payments: {} };
        out[p.student_id].payments[ym] = { paid: p.paid, markedBy: p.marked_by, markedAt: p.marked_at ? Date.parse(p.marked_at) : null };
      });
      return out;
    },
    async setFeeAmount(studentId, amount) {
      const c = client();
      const { data: existing } = await c.from('fee_settings').select('student_id').eq('student_id', studentId);
      if (existing && existing.length) {
        await c.from('fee_settings').update({ amount: amount }).eq('student_id', studentId);
      } else {
        await c.from('fee_settings').insert({ student_id: studentId, amount: amount });
      }
    },
    async markFee(studentId, ym, paid, markedBy) {
      const c = client();
      const month = ym + '-01';
      const { data: existing } = await c.from('fee_payments').select('id').eq('student_id', studentId).eq('month', month);
      if (existing && existing.length) {
        await c.from('fee_payments').update({ paid: paid, marked_by: markedBy, marked_at: new Date().toISOString() }).eq('student_id', studentId).eq('month', month);
      } else {
        await c.from('fee_payments').insert({ student_id: studentId, month: month, paid: paid, marked_by: markedBy, marked_at: new Date().toISOString() });
      }
    },

    /* weekly + monthly reports */
    async getWeekReport(studentId, weekKey) {
      const c = client();
      const { data } = await c.from('weekly_reports').select('data').eq('student_id', studentId).eq('week_key', weekKey).maybeSingle();
      return data && data.data ? data.data : null;
    },
    async saveWeekReport(studentId, weekKey, rep) {
      const c = client();
      await c.from('weekly_reports').upsert({ student_id: studentId, week_key: weekKey, data: rep }, { onConflict: 'student_id,week_key' });
    },
    async getMonthReport(studentId, ym) {
      const c = client();
      const { data } = await c.from('monthly_reports').select('data').eq('student_id', studentId).eq('ym', ym).maybeSingle();
      return data && data.data ? data.data : null;
    },
    async saveMonthReport(studentId, ym, rep) {
      const c = client();
      await c.from('monthly_reports').upsert({ student_id: studentId, ym: ym, data: rep }, { onConflict: 'student_id,ym' });
    },

    /* weekly + monthly reports (aliases used by reports hub) */
    async getWeekly(studentId, weekKey) { return api.getWeekReport(studentId, weekKey); },
    async saveWeekly(studentId, weekKey, data) {
      await api.saveWeekReport(studentId, weekKey, Object.assign({}, data, { savedAt: Date.now() }));
    },
    async getMonthlyReport(studentId, ym) { return api.getMonthReport(studentId, ym); },
    async saveMonthlyReport(studentId, ym, data) {
      await api.saveMonthReport(studentId, ym, Object.assign({}, data, { savedAt: Date.now() }));
    },

    /* full dump (export) */
    async getAllData() {
      const classes = await api.getClasses();
      const byClass = await api.getStudentsByClass(classes.map(function (c) { return c.id; }));
      const students = [];
      (Object.keys(byClass)).forEach(function (cid) { students.push.apply(students, byClass[cid]); });
      const users = await api.getUsers();
      const fees = await api.getAllFees();
      const reports = {};
      const ids = students.map(function (s) { return s.id; });
      if (ids.length) {
        const { data } = await client().from('reports').select('*').in('student_id', ids);
        (data || []).forEach(function (r) { reports[r.student_id + '|' + dstr(new Date(r.date))] = mapReport(r); });
      }
      return { classes: classes, users: users, students: students, reports: reports, fees: fees, weekly: {}, monthly: {} };
    },

    /* full restore (import) — inserts into supabase */
    async importData(payload) {
      let data = payload;
      if (data && data.app === 'madrasa-reports' && data.data) data = data.data;
      if (!data || typeof data !== 'object') return { ok: false, error: 'shape' };
      if (!Array.isArray(data.classes) || !Array.isArray(data.students) || typeof data.users !== 'object') {
        return { ok: false, error: 'shape' };
      }
      const c = client();
      for (const cls of data.classes) {
        const { data: ex } = await c.from('classes').select('id').eq('id', cls.id);
        if (!ex || !ex.length) await c.from('classes').insert({ id: cls.id, name: cls.name, qari_name: cls.name });
      }
      for (const s of data.students) {
        const { data: ex } = await c.from('students').select('id').eq('id', s.id);
        if (ex && ex.length) continue;
        await c.from('students').insert(Object.assign({ id: s.id }, unmapStudent(s)));
        const f = data.fees && data.fees[s.id];
        await c.from('fee_settings').insert({ student_id: s.id, amount: f && f.amount != null ? f.amount : defaultFee(s) });
      }
      for (const k of Object.keys(data.reports || {})) {
        const parts = k.split('|');
        await c.from('reports').upsert(Object.assign({ student_id: parts[0], date: parts[1] }, unmapReport(data.reports[k])));
      }
      return { ok: true };
    },

    /* dates */
    todayStr: todayStr,
    addDays: addDays,

    /* meta */
    categories: CATEGORIES,
    isSupabase: true
  };

  return api;
})();
