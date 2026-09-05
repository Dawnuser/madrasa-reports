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
      category: r.category,
      type: r.type || null,
      shift: r.shift || null,
      inviteCode: r.invite_code || null,
      parentId: r.parent_id || null,
      fromStart: r.from_start,
      fromEnd: r.from_end,
      testsPassed: r.tests_passed || 0
    };
  }
  function unmapStudent(st) {
    const o = {
      class_id: st.classId,
      name: st.name,
      age: st.age,
      para: st.para,
      current_page: st.currentPage,
      full_time: st.fullTime,
      parent_name: st.parentName,
      parent_number: st.parentNumber,
      category: st.category,
      from_start: st.fromStart,
      from_end: st.fromEnd,
      tests_passed: st.testsPassed || 0
    };
    if (st.type) o.type = st.type;
    if (st.shift) o.shift = st.shift;
    return o;
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
      manzilPara: r.manzil_para,
      manzilPages: r.manzil_pages,
      manzilLines: r.manzil_lines,
      comment: r.comment,
      reason: r.reason
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
      manzil_para: rep.manzilPara,
      manzil_pages: rep.manzilPages,
      manzil_lines: rep.manzilLines,
      comment: rep.comment,
      reason: rep.reason
    };
  }
  function mapClass(r) {
    return { id: r.id, name: r.name, qariId: null, type: r.type || null };
  }
  function mapHafiz(r) {
    return {
      id: r.id,
      name: r.name,
      graduationYear: r.graduation_year,
      parentName: r.parent_name,
      parentNumber: r.parent_number,
      completedUnder: r.completed_under,
      notes: r.notes
    };
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

  const CATEGORIES = { A: '10', B: '20', C: '30', D: '40', E: '60' };

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
        role: prof.role === 'admin' ? 'principal' : (prof.role === 'parent' ? 'parent' : 'qari'),
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
    async updateParentProfile(userId, fields) {
      const c = client();
      const patch = {};
      if (fields.name != null) patch.name = String(fields.name).trim();
      if (fields.phone != null) patch.phone = String(fields.phone).trim();
      if (!Object.keys(patch).length) return { ok: true };
      const { error } = await c.from('profiles').update(patch).eq('id', userId);
      if (error) return { ok: false, error: error.message };
      /* keep the cached session name in sync */
      const s = api.getSession();
      if (s && patch.name && s.id === userId) {
        s.name = patch.name;
        persistSession(s);
      }
      return { ok: true };
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
              role: prof.role === 'admin' ? 'principal' : (prof.role === 'parent' ? 'parent' : 'qari'),
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
    async changePassword(oldPassword, newPassword) {
      const c = client();
      const { data: { user } } = await c.auth.getUser();
      if (!user) return { ok: false, error: 'not_logged_in' };
      const { error: verr } = await c.auth.signInWithPassword({ email: user.email, password: oldPassword });
      if (verr) return { ok: false, error: 'wrong_password' };
      const { error } = await c.auth.updateUser({ password: newPassword });
      return error ? { ok: false, error: error.message } : { ok: true };
    },

    /* users */
    async getUsers() {
      const c = client();
      const { data, error } = await c.from('profiles').select('*');
      const out = {};
      (data || []).forEach(function (p) {
        out[p.id] = { id: p.id, name: p.name, role: p.role === 'admin' ? 'principal' : (p.role === 'parent' ? 'parent' : 'qari'), classId: p.class_id };
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
        const { data, error } = await c.from('classes').update({ name: cls.name, qari_name: cls.name, type: cls.type || null }).eq('id', cls.id).select().single();
        return data ? mapClass(data) : cls;
      } else {
        const { data, error } = await c.from('classes').insert({ name: cls.name, qari_name: cls.name, category: 'A', type: cls.type || 'hifz' }).select().single();
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
      let reports = {}, weekly = {}, monthly = {}, fees = {};
      if (studentIds.length) {
        const { data: repRows } = await c.from('reports').select('*').in('student_id', studentIds);
        (repRows || []).forEach(function (r) { reports[r.student_id + '|' + dstr(new Date(r.date))] = mapReport(r); });
        const { data: wkRows } = await c.from('weekly_reports').select('*').in('student_id', studentIds);
        (wkRows || []).forEach(function (r) { weekly[r.student_id + '|' + r.week_key] = r.data; });
        const { data: moRows } = await c.from('monthly_reports').select('*').in('student_id', studentIds);
        (moRows || []).forEach(function (r) { monthly[r.student_id + '|' + r.ym] = r.data; });
        const { data: fsRows } = await c.from('fee_settings').select('*').in('student_id', studentIds);
        const { data: fpRows } = await c.from('fee_payments').select('*').in('student_id', studentIds);
        (fsRows || []).forEach(function (f) { if (!fees[f.student_id]) fees[f.student_id] = { amount: f.amount, payments: {} }; });
        (fpRows || []).forEach(function (p) {
          const ym = ymStr(new Date(p.month));
          if (!fees[p.student_id]) fees[p.student_id] = { amount: null, payments: {} };
          fees[p.student_id].payments[ym] = { paid: p.paid, markedBy: p.marked_by, markedAt: p.marked_at ? Date.parse(p.marked_at) : null };
        });
      }
      await api.pushTrash({
        kind: 'class',
        payload: { cls: { id: id, name: cls.name }, students: students, reports: reports, weekly: weekly, monthly: monthly, fees: fees }
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
      let reports = {}, weekly = {}, monthly = {};
      const { data: repRows } = await c.from('reports').select('*').eq('student_id', id);
      (repRows || []).forEach(function (r) { reports[r.student_id + '|' + dstr(new Date(r.date))] = mapReport(r); });
      const { data: wkRows } = await c.from('weekly_reports').select('*').eq('student_id', id);
      (wkRows || []).forEach(function (r) { weekly[r.student_id + '|' + r.week_key] = r.data; });
      const { data: moRows } = await c.from('monthly_reports').select('*').eq('student_id', id);
      (moRows || []).forEach(function (r) { monthly[r.student_id + '|' + r.ym] = r.data; });
      const { data: f } = await c.from('fee_settings').select('*').eq('student_id', id).maybeSingle();
      const fees = f ? { amount: f.amount, payments: {} } : null;
      const { data: fpRows } = await c.from('fee_payments').select('*').eq('student_id', id);
      if (fees && fpRows) {
        fpRows.forEach(function (p) {
          fees.payments[ymStr(new Date(p.month))] = { paid: p.paid, markedBy: p.marked_by, markedAt: p.marked_at ? Date.parse(p.marked_at) : null };
        });
      }
      await api.pushTrash({ kind: 'student', payload: { st: st, reports: reports, weekly: weekly, monthly: monthly, fees: fees } });
      await c.from('students').delete().eq('id', id);
      return { ok: true };
    },

    /* huffaz (graduated Hafiz students — principal only, no class) */
    async getHuffaz() {
      const c = client();
      const { data } = await c.from('huffaz').select('*').order('name');
      return (data || []).map(mapHafiz);
    },
    async saveHafiz(h) {
      const c = client();
      const row = {
        name: h.name,
        graduation_year: h.graduationYear,
        parent_name: h.parentName,
        parent_number: h.parentNumber,
        completed_under: h.completedUnder,
        notes: h.notes
      };
      if (h.id) {
        const { data } = await c.from('huffaz').update(row).eq('id', h.id).select().single();
        return data ? mapHafiz(data) : h;
      } else {
        const { data } = await c.from('huffaz').insert(row).select().single();
        return data ? mapHafiz(data) : h;
      }
    },
    async deleteHafiz(id) {
      const c = client();
      await c.from('huffaz').delete().eq('id', id);
      return { ok: true };
    },

    /* parent portal */
    async lookupInvite(code) {
      const c = client();
      const { data, error } = await c.rpc('lookup_invite', { code: String(code || '').trim().toUpperCase() });
      if (error || !data || !data.length) return null;
      const row = data[0];
      return { id: row.sid, name: row.sname, classId: row.scid };
    },
    async claimInvite(code) {
      const c = client();
      const { data, error } = await c.rpc('claim_invite', { code: String(code || '').trim().toUpperCase() });
      return error ? { ok: false } : { ok: !!data };
    },
    /* self-signup: create a parent account, auto-confirm, claim the invite, and log in */
    async signupParent(code, name, phone, email, password) {
      const c = client();
      const normEmail = String(email || '').trim().toLowerCase();
      if (!/^[^@\s]+@madrasa\.com$/i.test(normEmail)) return { ok: false, error: 'bad_email' };
      const stu = await api.lookupInvite(code);
      if (!stu) return { ok: false, error: 'invalid_code' };
      const { data, error } = await c.auth.signUp({
        email: normEmail,
        password: password,
        options: { data: { name: String(name || '').trim(), role: 'parent', phone: String(phone || '').trim() } }
      });
      if (error || !data.user) return { ok: false, error: (error && error.message) || 'signup_failed' };
      let session = data.session;
      if (!session) {
        const s = await c.auth.signInWithPassword({ email: normEmail, password: password });
        if (!s.error && s.data && s.data.session) session = s.data.session;
      }
      const claim = await api.claimInvite(code);
      if (!claim.ok) return { ok: false, error: 'claim_failed' };
      /* sync parent contact info to the linked student so admin/qari see it */
      const contact = { parent_name: String(name || '').trim() };
      if (phone) contact.parent_number = String(phone).trim();
      await c.from('students').update(contact).eq('id', stu.id);
      /* also store phone on the profile for later editing */
      if (phone) await c.from('profiles').update({ phone: String(phone).trim() }).eq('id', data.user.id);
      const prof = await api.getProfile(data.user.id);
      const s = {
        id: data.user.id,
        name: (prof && prof.name) || name || normEmail.split('@')[0],
        role: 'parent',
        classId: null
      };
      persistSession(s);
      return { ok: true, session: s };
    },
    async getParentStudents() {
      const c = client();
      const { data, error } = await c.from('students').select('*');
      const out = [];
      if (error) return out;
      const sess = api.getSession();
      (data || []).forEach(function (r) {
        if (r.parent_id && r.parent_id === (sess && sess.id)) out.push(mapStudent(r));
      });
      return out;
    },
    async getParentClasses() {
      const c = client();
      const { data } = await c.from('classes').select('*');
      const out = {};
      (data || []).forEach(function (r) { out[r.id] = mapClass(r); });
      return out;
    },
    async getParentReportRange(studentId, fromDs, toDs) {
      return api.getReportRange(studentId, fromDs, toDs);
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
    async getTrashRaw() {
      const c = client();
      const { data } = await c.from('trash').select('*');
      return (data || []).map(function (r) {
        return { tid: r.tid, kind: r.kind, payload: r.payload, deleted_at: r.deleted_at };
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
          const savedFee = p.fees && p.fees[s.id];
          await c.from('fee_settings').insert({ student_id: s.id, amount: (savedFee && savedFee.amount != null) ? savedFee.amount : defaultFee(s) });
        }
        for (const k of Object.keys(p.reports)) {
          const parts = k.split('|');
          await c.from('reports').upsert(Object.assign({ student_id: parts[0], date: parts[1] }, unmapReport(p.reports[k])), { onConflict: 'student_id,date' });
        }
        for (const k of Object.keys(p.weekly || {})) {
          const parts = k.split('|');
          await c.from('weekly_reports').upsert({ student_id: parts[0], week_key: parts[1], data: p.weekly[k] }, { onConflict: 'student_id,week_key' });
        }
        for (const k of Object.keys(p.monthly || {})) {
          const parts = k.split('|');
          await c.from('monthly_reports').upsert({ student_id: parts[0], ym: parts[1], data: p.monthly[k] }, { onConflict: 'student_id,ym' });
        }
        for (const sid of Object.keys(p.fees || {})) {
          const f = p.fees[sid];
          for (const ym of Object.keys(f.payments || {})) {
            const pay = f.payments[ym];
            await c.from('fee_payments').upsert({ student_id: sid, month: ym + '-01', paid: !!pay.paid, marked_by: pay.markedBy || null, marked_at: pay.markedAt ? new Date(pay.markedAt).toISOString() : null }, { onConflict: 'student_id,month' });
          }
        }
      } else {
        const { data: existing } = await c.from('students').select('id').eq('id', p.st.id);
        if (existing && existing.length) return { ok: false, error: 'exists' };
        await c.from('students').insert(Object.assign({ id: p.st.id }, unmapStudent(p.st)));
        if (p.fees) await c.from('fee_settings').insert({ student_id: p.st.id, amount: p.fees.amount || defaultFee(p.st) });
        for (const k of Object.keys(p.reports)) {
          const parts = k.split('|');
          await c.from('reports').upsert(Object.assign({ student_id: parts[0], date: parts[1] }, unmapReport(p.reports[k])), { onConflict: 'student_id,date' });
        }
        for (const k of Object.keys(p.weekly || {})) {
          const parts = k.split('|');
          await c.from('weekly_reports').upsert({ student_id: parts[0], week_key: parts[1], data: p.weekly[k] }, { onConflict: 'student_id,week_key' });
        }
        for (const k of Object.keys(p.monthly || {})) {
          const parts = k.split('|');
          await c.from('monthly_reports').upsert({ student_id: parts[0], ym: parts[1], data: p.monthly[k] }, { onConflict: 'student_id,ym' });
        }
        if (p.fees) {
          for (const ym of Object.keys(p.fees.payments || {})) {
            const pay = p.fees.payments[ym];
            await c.from('fee_payments').upsert({ student_id: p.st.id, month: ym + '-01', paid: !!pay.paid, marked_by: pay.markedBy || null, marked_at: pay.markedAt ? new Date(pay.markedAt).toISOString() : null }, { onConflict: 'student_id,month' });
          }
        }
      }
      await c.from('trash').delete().eq('tid', tid);
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
      const { error } = await c.from('reports').upsert(Object.assign({ student_id: studentId, date: ds }, unmapReport(rep)), { onConflict: 'student_id,date' });
      if (error) console.error('saveReport', error);
      return error ? { ok: false } : { ok: true };
    },
    async getMonthReports(studentId, year, month) {
      const c = client();
      const y = String(year);
      const m = String(month).padStart(2, '0');
      const last = String(new Date(year, month, 0).getDate()).padStart(2, '0');
      const { data } = await c.from('reports').select('*').eq('student_id', studentId)
        .gte('date', y + '-' + m + '-01').lte('date', y + '-' + m + '-' + last);
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
      const last = String(new Date(year, month, 0).getDate()).padStart(2, '0');
      const { data } = await c.from('reports').select('*').in('student_id', studentIds)
        .gte('date', y + '-' + m + '-01').lte('date', y + '-' + m + '-' + last);
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
      if (amount == null) {
        if (existing && existing.length) await c.from('fee_settings').delete().eq('student_id', studentId);
        return { ok: true };
      }
      let error = null;
      if (existing && existing.length) {
        ({ error } = await c.from('fee_settings').update({ amount: amount }).eq('student_id', studentId));
      } else {
        ({ error } = await c.from('fee_settings').insert({ student_id: studentId, amount: amount }));
      }
      if (error) console.error('setFeeAmount', error);
      return error ? { ok: false } : { ok: true };
    },
    async markFee(studentId, ym, paid, markedBy) {
      const c = client();
      const month = ym + '-01';
      const { error } = await c.from('fee_payments').upsert(
        { student_id: studentId, month: month, paid: paid, marked_by: markedBy, marked_at: new Date().toISOString() },
        { onConflict: 'student_id,month' }
      );
      if (error) console.error('markFee', error);
    },

    /* weekly + monthly reports */
    async getWeekReport(studentId, weekKey) {
      const c = client();
      const { data } = await c.from('weekly_reports').select('data').eq('student_id', studentId).eq('week_key', weekKey).maybeSingle();
      return data && data.data ? data.data : null;
    },
    async saveWeekReport(studentId, weekKey, rep) {
      const c = client();
      const { error } = await c.from('weekly_reports').upsert({ student_id: studentId, week_key: weekKey, data: rep }, { onConflict: 'student_id,week_key' });
      if (error) console.error('saveWeekReport', error);
      return error ? { ok: false } : { ok: true };
    },
    async getMonthReport(studentId, ym) {
      const c = client();
      const { data } = await c.from('monthly_reports').select('data').eq('student_id', studentId).eq('ym', ym).maybeSingle();
      return data && data.data ? data.data : null;
    },
    async saveMonthReport(studentId, ym, rep) {
      const c = client();
      const { error } = await c.from('monthly_reports').upsert({ student_id: studentId, ym: ym, data: rep }, { onConflict: 'student_id,ym' });
      if (error) console.error('saveMonthReport', error);
      return error ? { ok: false } : { ok: true };
    },

    /* weekly + monthly reports (aliases used by reports hub) */
    async getWeekly(studentId, weekKey) { return api.getWeekReport(studentId, weekKey); },
    async saveWeekly(studentId, weekKey, data) {
      return api.saveWeekReport(studentId, weekKey, Object.assign({}, data, { savedAt: Date.now() }));
    },
    async getMonthlyReport(studentId, ym) { return api.getMonthReport(studentId, ym); },
    async saveMonthlyReport(studentId, ym, data) {
      return api.saveMonthReport(studentId, ym, Object.assign({}, data, { savedAt: Date.now() }));
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
      const weekly = {};
      const monthly = {};
      const ids = students.map(function (s) { return s.id; });
      if (ids.length) {
        const { data: repRows } = await client().from('reports').select('*').in('student_id', ids);
        (repRows || []).forEach(function (r) { reports[r.student_id + '|' + dstr(new Date(r.date))] = mapReport(r); });
        const { data: wkRows } = await client().from('weekly_reports').select('*').in('student_id', ids);
        (wkRows || []).forEach(function (r) { weekly[r.student_id + '|' + r.week_key] = r.data; });
        const { data: moRows } = await client().from('monthly_reports').select('*').in('student_id', ids);
        (moRows || []).forEach(function (r) { monthly[r.student_id + '|' + r.ym] = r.data; });
      }
      return { classes: classes, users: users, students: students, reports: reports, fees: fees, weekly: weekly, monthly: monthly, trash: await api.getTrashRaw(), huffaz: (await client().from('huffaz').select('*')).data || [] };
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
        await c.from('reports').upsert(Object.assign({ student_id: parts[0], date: parts[1] }, unmapReport(data.reports[k])), { onConflict: 'student_id,date' });
      }
      for (const sid of Object.keys(data.fees || {})) {
        const f = data.fees[sid];
        for (const ym of Object.keys(f.payments || {})) {
          const pay = f.payments[ym];
          await c.from('fee_payments').upsert({ student_id: sid, month: ym + '-01', paid: !!pay.paid, marked_by: pay.markedBy || null, marked_at: pay.markedAt ? new Date(pay.markedAt).toISOString() : null }, { onConflict: 'student_id,month' });
        }
      }
      for (const k of Object.keys(data.weekly || {})) {
        const parts = k.split('|');
        await c.from('weekly_reports').upsert({ student_id: parts[0], week_key: parts[1], data: data.weekly[k] }, { onConflict: 'student_id,week_key' });
      }
      for (const k of Object.keys(data.monthly || {})) {
        const parts = k.split('|');
        await c.from('monthly_reports').upsert({ student_id: parts[0], ym: parts[1], data: data.monthly[k] }, { onConflict: 'student_id,ym' });
      }
      for (const t of (data.trash || [])) {
        const { data: ex } = await c.from('trash').select('tid').eq('tid', t.tid);
        if (ex && ex.length) continue;
        await c.from('trash').insert({ tid: t.tid, kind: t.kind, payload: t.payload, deleted_at: t.deleted_at || undefined });
      }
      for (const h of (data.huffaz || [])) {
        if (!h.id) continue;
        const { data: ex } = await c.from('huffaz').select('id').eq('id', h.id);
        if (ex && ex.length) continue;
        await c.from('huffaz').insert({ id: h.id, name: h.name, graduation_year: h.graduation_year || null, parent_name: h.parent_name || null, parent_number: h.parent_number || null, completed_under: h.completed_under || null, notes: h.notes || null });
      }
      return { ok: true };
    },

    /* dates */
    todayStr: todayStr,
    addDays: addDays,

    /* PWA / web push (client side) */
    deferredInstallPrompt: null,
    installable: function () {
      return !!this.deferredInstallPrompt;
    },
    installHint: function () {
      if (this.installable()) return 'native';
      const ua = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
      return isIOS ? 'ios' : 'browser';
    },
    captureInstallPrompt: function (e) {
      e.preventDefault();
      api.deferredInstallPrompt = e;
    },
    installApp: async function () {
      const p = api.deferredInstallPrompt;
      if (!p) return false;
      try {
        p.prompt();
        const choice = await p.userChoice;
        api.deferredInstallPrompt = null;
        return !!(choice && choice.outcome === 'accepted');
      } catch (e) {
        return false;
      }
    },
    registerPush: async function () {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
        await navigator.serviceWorker.register('sw.js');
        return true;
      } catch (e) {
        console.warn('registerPush failed', e);
        return false;
      }
    },

    /* meta */
    categories: CATEGORIES,
    isSupabase: true
  };

  return api;
})();
