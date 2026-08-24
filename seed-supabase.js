/* ============================================================
   Seed script — inserts sample data into Supabase Madrasa DB
   Run: node seed-supabase.js
   ============================================================ */
const https = require('https');
const SUPABASE_URL = 'https://xalvjslloofelcftqwqp.supabase.co';
const ANON_KEY = 'sb_publishable_Gru4M7oK7lP-mako8r6zmQ_Anr0dYXs';

async function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'xalvjslloofelcftqwqp.supabase.co',
      path: '/rest/v1/' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: 'Bearer ' + token,
        Prefer: 'return=representation'
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function login() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email: 'admin@madrasa.com', password: 'admin@2008' });
    const opts = {
      hostname: 'xalvjslloofelcftqwqp.supabase.co',
      path: '/auth/v1/token?grant_type=password',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const j = JSON.parse(data);
        if (j.access_token) resolve(j.access_token);
        else reject(new Error('Login failed: ' + data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function dstr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function ymStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

async function main() {
  console.log('Logging in as admin...');
  const token = await login();
  console.log('Token obtained.');

  const today = new Date();

  // === CLASSES ===
  const classNames = [
    'Sheikh Atta-ul-Rahman',
    'Sheikh Anees',
    'Sheikh Hussain',
    'Sheikh Bilal'
  ];
  const classes = [];
  for (const name of classNames) {
    const c = await api('POST', 'classes', { name, qari_name: name, category: 'A' }, token);
    classes.push(c[0]);
    console.log('Class:', c[0].name, c[0].id);
  }

  // === STUDENTS ===
  const namePool = [
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
    ['Mansoor Ali', 14, 16, 'D', 'Ali Saeed'],
    ['Tariq Mehmood', 11, 8, 'B', 'Mehmood Ahmed'],
    ['Fahad Khan', 10, 6, 'A', 'Khan Rahim'],
    ['Omar Farooq', 13, 13, 'C', 'Farooq Sultan'],
    ['Nabeel Ahmed', 9, 5, 'A', 'Ahmed Hussain'],
    ['Hasan Abbas', 12, 10, 'B', 'Abbas Javed'],
    ['Sameer Ali', 11, 7, 'A', 'Ali Asghar'],
    ['Khalid Waleed', 14, 15, 'D', 'Waleed Ahmed'],
    ['Rashid Noor', 10, 9, 'B', 'Noor Hassan']
  ];

  const students = [];
  let si = 0;
  for (const cls of classes) {
    const count = cls.name === 'Sheikh Bilal' ? 4 : 6;
    for (let i = 0; i < count; i++) {
      const row = namePool[si % namePool.length];
      const s = [cls, row];
      const st = await api('POST', 'students', {
        class_id: cls.id,
        name: row[0],
        age: row[1] + (classes.indexOf(cls)),
        para: row[2],
        current_page: (row[2] - 1) * 20 + 1 + ((si * 3 + classes.indexOf(cls)) % 20),
        full_time: (si % 3 !== 0),
        parent_name: row[4],
        parent_number: '96895455137',
        category: row[3]
      }, token);
      if (st && st[0]) {
        students.push(st[0]);
        console.log('Student:', st[0].name, st[0].id);
      }
      si++;
    }
  }

  // === FEE SETTINGS ===
  for (const st of students) {
    const amount = st.full_time ? 25 : 18;
    await api('POST', 'fee_settings', { student_id: st.id, amount }, token);
    console.log('Fee:', st.name, amount);
  }

  // === REPORTS (14 days) ===
  let reportCount = 0;
  for (let d = 14; d >= 1; d--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    const ds = dstr(date);
    for (const st of students) {
      const rnd = (students.indexOf(st) * 7 + d * 5 + students.indexOf(st) * d * 3) % 100;
      const absent = rnd < 12;
      const rep = { present: !absent };
      if (!absent) {
        rep.sabaq_done = (rnd % 17) !== 3;
        if (rep.sabaq_done) {
          rep.pages = 1 + (rnd % 3);
          rep.lines = (rnd % 5 === 0) ? 1 + (rnd % 5) : null;
        } else {
          rep.pages = null; rep.lines = null;
        }
        rep.sabqi_done = (rnd % 13) !== 5;
        rep.manzil_done = (rnd % 11) !== 4;
        rep.manzil = rep.manzil_done ? ['half', 'third', 'full'][(students.indexOf(st) + d) % 3] : null;
        if (students.indexOf(st) % 5 === 2 && (rnd % 3) === 0) rep.comment = 'Great progress today, keep it up!';
      }
      await api('POST', 'reports', { student_id: st.id, date: ds, ...rep }, token);
      reportCount++;
      if (reportCount % 100 === 0) console.log('Reports:', reportCount);
    }
  }
  console.log('Reports done:', reportCount);

  // === FEE PAYMENTS (current month, some paid) ===
  const curYm = ymStr(today);
  for (const st of students) {
    if (students.indexOf(st) % 2 === 0) {
      await api('POST', 'fee_payments', {
        student_id: st.id,
        month: curYm + '-01',
        paid: true,
        marked_by: '808c49d5-1e11-4948-b62c-14f1df83a3c0',
        marked_at: new Date(Date.now() - 86400000).toISOString()
      }, token);
    }
  }

  console.log('\n========================================');
  console.log('SEED COMPLETE');
  console.log('Classes:', classes.length);
  console.log('Students:', students.length);
  console.log('Reports:', reportCount);
  console.log('========================================');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });