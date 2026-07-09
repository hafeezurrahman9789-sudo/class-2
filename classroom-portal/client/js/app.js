/* ===================== ANIMATED BACKGROUND ===================== */
(function setupBackgroundFx() {
  const motesHost = document.getElementById('bg-motes');
  const bgFx = document.getElementById('bg-fx');
  if (!motesHost || !bgFx) return;

  const MOTE_COUNT = 16;
  for (let i = 0; i < MOTE_COUNT; i++) {
    const m = document.createElement('div');
    m.className = 'mote';
    const size = 2 + Math.random() * 3;
    m.style.width = m.style.height = size + 'px';
    m.style.left = Math.random() * 100 + '%';
    m.style.setProperty('--drift', (Math.random() * 80 - 40) + 'px');
    m.style.animationDuration = (14 + Math.random() * 16) + 's';
    m.style.animationDelay = (Math.random() * 20) + 's';
    motesHost.appendChild(m);
  }

  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    window.addEventListener('mousemove', (e) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * -24;
      targetY = (e.clientY / window.innerHeight - 0.5) * -24;
    });
    (function tick() {
      curX += (targetX - curX) * 0.04;
      curY += (targetY - curY) * 0.04;
      bgFx.style.transform = `translate(${curX.toFixed(1)}px, ${curY.toFixed(1)}px)`;
      requestAnimationFrame(tick);
    })();
  }
})();

/* ===================== PWA INSTALL PROMPT ===================== */
// Install button disabled
let deferredInstallPrompt = null;

function installButton(extraClass) {
  return '';
}

/* ===================== API HELPER ===================== */
async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch('/api' + path, {
    credentials: 'include',
    method: opts.method || 'GET',
    headers: isForm ? {} : (opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: isForm ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  let payload = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) payload = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error((payload && payload.error) || 'Something went wrong.');
    e.code = payload && payload.code;
    throw e;
  }
  return payload;
}
function fileUrl(store, id, download) {
  return `/api/${store}/${id}/file${download ? '?download=1' : ''}`;
}
function viewFile(store, id) { window.open(fileUrl(store, id), '_blank'); }
function downloadFile(store, id) { window.location.href = fileUrl(store, id, true); }

/* ===================== UTILS ===================== */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(iso) { try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso || ''; } }
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ===================== STATE ===================== */
let state = {
  screen: 'login', loginRole: 'student', role: null, user: null,
  section: null, data: null, loading: false, error: '', adminModal: false, adminError: '', adminForgot: false,
  cgpaSemesters: [{ name: 'Semester 1', rows: [{ subject: '', credit: '', gp: '' }] }],
  cgpaResult: null, adminContentTab: 'notes',
  backStack: [],
  // Drill-down state: which subject/section/quiz is currently open within a top-level tab.
  notesSubject: null, assignmentSubject: null, practicalSubject: null, quizId: null,
};

/* ===================== BACK NAVIGATION ===================== */
function snapshot() {
  return {
    screen: state.screen, role: state.role, section: state.section, adminContentTab: state.adminContentTab,
    notesSubject: state.notesSubject, assignmentSubject: state.assignmentSubject,
    practicalSubject: state.practicalSubject, quizId: state.quizId,
  };
}
function pushBack() { state.backStack.push(snapshot()); }
async function goBack() {
  const prev = state.backStack.pop();
  if (!prev) return;
  state.screen = prev.screen; state.role = prev.role; state.adminContentTab = prev.adminContentTab;
  state.notesSubject = prev.notesSubject; state.assignmentSubject = prev.assignmentSubject;
  state.practicalSubject = prev.practicalSubject; state.quizId = prev.quizId;
  state.error = ''; state.adminModal = false;
  if (state.role && prev.section) await loadSection(prev.section);
  else paint();
}
function backButton() {
  if (!state.backStack.length) return '';
  return `<button class="btn btn-ghost btn-sm back-btn" data-act="go-back">← Back</button>`;
}

/* ===================== BOOT: resume session if cookie is valid ===================== */
(async function boot() {
  try {
    const me = await api('/auth/me');
    state.role = me.role; state.user = me; state.screen = me.role;
    await loadSection(me.role === 'admin' ? 'users' : 'notes');
  } catch (e) {
    paint();
  }
})();

/* ===================== SECTION DATA LOADERS ===================== */
async function loadSection(sec) {
  state.section = sec; state.loading = true; state.error = ''; paint();
  const data = {};
  try {
    if (state.role === 'student' || state.role === 'staff') {
      if (sec === 'notes') { data.subjects = await api('/subjects'); data.notes = await api('/notes'); }
      if (sec === 'attendance') data.attendance = await api('/attendance');
      if (sec === 'assignment') {
        data.subjects = await api('/subjects');
        data.assignments = await api('/assignments');
        data.submissions = await api('/submissions');
      }
      if (sec === 'practical') {
        data.practicalSubjects = await api('/practicals/subjects');
        data.practicalFiles = await api('/practicals/files');
      }
      if (sec === 'quiz') {
        data.quizzes = await api('/quizzes');
        if (state.role === 'student') {
          data.quizScoresByQuiz = {};
          await Promise.all(data.quizzes.map(async (q) => {
            data.quizScoresByQuiz[q.id] = await api(`/quizzes/${q.id}/scores`);
          }));
        }
        if (state.quizId) data.quizScores = await api(`/quizzes/${state.quizId}/scores`);
      }
      if (sec === 'tests') {
        data.testpdfs = await api('/testpdfs');
        data.semresults = await api('/semresults');
        if (state.role === 'student') {
          const saved = await api('/cgpa');
          if (saved) state.cgpaSemesters = saved;
        }
      }
    } else if (state.role === 'admin') {
      if (sec === 'users') { const u = await api('/admin/users'); data.students = u.students; data.staff = u.staff; data.logs = await api('/admin/logs'); }
      if (sec === 'content') {
        data.notes = await api('/notes'); data.testpdfs = await api('/testpdfs');
        data.assignments = await api('/assignments'); data.submissions = await api('/submissions');
        data.attendance = await api('/attendance'); data.semresults = await api('/semresults');
      }
    }
  } catch (e) { toast(e.message); }
  state.data = data; state.loading = false; paint();
}

/* ===================== RENDER: LOGIN ===================== */
function renderLogin() {
  const role = state.loginRole;
  return `
  <div class="login-shell">
    <button class="admin-corner" data-act="open-admin">Admin</button>
    <div class="login-grid">
      <div class="brand-panel">
        <div class="eyebrow">Register No. · Login</div>
        <h1>The&nbsp;Register</h1>
        <p>A single, shared record of notes, attendance, assignments and marks — kept the way a good classroom always has: by register number.</p>
        <img class="hero" src="/assets/hero.svg" alt="">
      </div>
      <div class="login-panel">
        <div class="brand-logo"><img src="/assets/favicon.svg" alt=""><span>The Register</span><span class="side-spacer"></span>${installButton()}</div>
        <div class="tabs">
          <button class="tab ${role === 'student' ? 'active' : ''}" data-act="switch-role" data-role="student">Student Login</button>
          <button class="tab ${role === 'staff' ? 'active' : ''}" data-act="switch-role" data-role="staff">Staff Login</button>
        </div>
        ${state.error ? `<div class="error-box">${esc(state.error)}</div>` : ''}
        <form data-act="do-login">
          <div class="field"><label>Register Number</label><input class="mono" id="li-reg" placeholder="e.g. 22CS045" required></div>
          <div class="field"><label>Full Name</label><input id="li-name" placeholder="As it should appear on your profile" required></div>
          <div class="hint">First time here? This creates your account. After that, this same register number and name signs you straight in.</div>
          <button class="btn btn-primary" type="submit" ${state.loggingIn?'disabled':''}>${state.loggingIn?'Signing in…':`Continue · ${role === 'student' ? 'Student' : 'Staff'}`}</button>
        </form>
      </div>
    </div>
  </div>
  ${state.adminModal ? renderAdminModal() : ''}`;
}
function renderAdminModal() {
  return `
  <div class="modal-bg" data-act="close-admin-bg">
    <div class="modal" onclick="event.stopPropagation()">
      <h3 style="margin-top:0">Administrator Access</h3>
      ${state.adminError ? `<div class="error-box">${esc(state.adminError)}</div>` : ''}
      <form data-act="admin-login">
        <div class="field"><label>Name</label><input id="ad-name" placeholder="Administrator" required></div>
        <div class="field"><label>Password</label><input id="ad-pass" type="password" placeholder="••••••••" required></div>
        <button class="btn btn-primary" type="submit">Enter Admin Panel</button>
      </form>
      <button class="btn btn-ghost btn-sm" style="margin-top:10px;width:100%" data-act="toggle-admin-forgot">Forgot the password?</button>
      ${state.adminForgot ? `<div class="hint" style="margin-top:8px">Admin credentials are set on the server, not through this page. Whoever has terminal access to the server can run <code>npm run admin:reset</code> to set a new name and password, then restart the app.</div>` : ''}
      <button class="btn btn-ghost btn-sm" style="margin-top:10px;width:100%" data-act="close-admin">Cancel</button>
    </div>
  </div>`;
}

/* ===================== SHELL ===================== */
function sideNav() {
  const items = {
    student: [['notes','▤','Notes'],['attendance','◔','Attendance'],['assignment','✎','Assignments'],['practical','⚙','Practicals'],['quiz','★','Quizzes'],['tests','Σ','Tests & CGPA']],
    staff: [['notes','▤','Notes'],['attendance','◔','Attendance'],['assignment','✎','Assignments'],['practical','⚙','Practicals'],['quiz','★','Quizzes'],['tests','Σ','Tests']],
    admin: [['users','☺','Users & Logins'],['content','⌂','Content Control']],
  }[state.role];
  return items.map(([key,ico,label]) => `
    <button class="nav-item ${state.section===key?'active':''}" data-act="nav" data-section="${key}"><span class="ico">${ico}</span>${label}</button>`).join('');
}
function shell(inner) {
  const u = state.user;
  return `
  <div class="app-shell">
    <div class="side-spacer"></div>

<div class="id-chip">
    <div class="name">${esc(u.name || '')}</div>
    <div class="reg">${state.role === 'admin' ? 'ADMINISTRATOR' : esc(u.regNo)}</div>
    <div class="role">${esc(state.role)}</div>
</div>

<button class="btn btn-danger btn-sm full-width" data-act="logout">
    🚪 Log Out
</button>
    </div>
    <div class="main">${inner}</div>
  </div>`;
}
function pageHead(eyebrow, title) {
  return `<div class="page-head">${backButton()}<div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2></div>`;
}
function loadingBlock() { return `<div class="card"><div class="empty">Loading…</div></div>`; }
function subjectAddForm(scope, placeholder) {
  return `<form data-act="create-subject" data-scope="${scope}" style="display:flex;gap:8px;flex-wrap:wrap">
    <input id="new-subj-${scope}" placeholder="${placeholder}" style="flex:1;min-width:180px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:13px">
    <button class="btn btn-gold btn-sm" type="submit">+ Add</button>
  </form>`;
}

/* ===================== NOTES (subject-classified) ===================== */
function subjectListRow(subject, count, scope, canManage) {
  return `
    <div class="item-row">
      <div><div class="item-title">${esc(subject.name)}</div><div class="item-meta">${count} file${count===1?'':'s'}</div></div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-act="open-subject" data-scope="${scope}" data-id="${subject.id}">Open</button>
        ${canManage ? `
          <button class="btn btn-ghost btn-sm" data-act="rename-subject" data-scope="${scope}" data-id="${subject.id}">Rename</button>
          <button class="btn btn-danger btn-sm" data-act="delete-subject" data-scope="${scope}" data-id="${subject.id}">Delete</button>
        ` : ''}
      </div>
    </div>`;
}

function notesSection() {
  const subjects = state.data.subjects || [];
  const notes = state.data.notes || [];
  const isStaff = state.role === 'staff';

  if (!state.notesSubject) {
    return pageHead('Section 01','Notes') + `
    <div class="card">
      <div class="card-row"><h3>Subjects</h3></div>
      ${isStaff ? `<div style="margin-bottom:16px">${subjectAddForm('notes','e.g. Thermodynamics')}</div>` : ''}
      ${subjects.length ? subjects.map(s => subjectListRow(s, notes.filter(n=>n.subject_id===s.id).length, 'notes', isStaff)).join('')
        : `<div class="empty">${isStaff ? 'No subjects yet — add one above to start uploading notes.' : 'No subjects have been added yet.'}</div>`}
    </div>`;
  }

  const subject = subjects.find(s => s.id === state.notesSubject);
  const items = notes.filter(n => n.subject_id === state.notesSubject);
  return pageHead('Notes', subject ? subject.name : 'Subject') + `
  <div class="card">
    <div class="card-row"><h3>Files</h3>
      ${isStaff ? `<label class="btn btn-gold btn-sm file-input-wrap">Upload PDF<input type="file" accept="application/pdf" data-act="upload-note" data-subject="${state.notesSubject}"></label>` : ''}
    </div>
    ${items.length ? items.map(n => `
      <div class="item-row">
        <div><div class="item-title">${esc(n.original_name)}</div><div class="item-meta">by ${esc(n.uploader)} · ${fmtDate(n.date)}</div></div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-act="view-file" data-store="notes" data-id="${n.id}">Open</button>
          <button class="btn btn-gold btn-sm" data-act="download-file" data-store="notes" data-id="${n.id}">Save</button>
          ${isStaff ? `
            <button class="btn btn-ghost btn-sm" data-act="rename-item" data-store="notes" data-id="${n.id}">Rename</button>
            <label class="btn btn-ghost btn-sm file-input-wrap">Replace<input type="file" accept="application/pdf" data-act="replace-item" data-store="notes" data-id="${n.id}"></label>
            <button class="btn btn-danger btn-sm" data-act="delete-item" data-store="notes" data-id="${n.id}">Delete</button>
          ` : ''}
        </div>
      </div>`).join('') : `<div class="empty">${isStaff ? 'Nothing uploaded yet — add your first PDF above.' : 'No notes here yet.'}</div>`}
  </div>`;
}

/* ===================== ASSIGNMENTS (same shared subjects) ===================== */
function assignmentSection() {
  const subjects = state.data.subjects || [];
  const assignments = state.data.assignments || [];
  const subs = state.data.submissions || [];
  const isStaff = state.role === 'staff';

  if (!state.assignmentSubject) {
    return pageHead('Section 03','Assignments') + `
    <div class="card">
      <div class="card-row"><h3>Subjects</h3></div>
      ${isStaff ? `<div style="margin-bottom:16px">${subjectAddForm('assignment','e.g. Thermodynamics')}</div>` : ''}
      ${subjects.length ? subjects.map(s => subjectListRow(s, assignments.filter(a=>a.subject_id===s.id).length, 'assignment', isStaff)).join('')
        : `<div class="empty">${isStaff ? 'No subjects yet — add one above (subjects are shared with Notes).' : 'No subjects have been added yet.'}</div>`}
    </div>`;
  }

  const subject = subjects.find(s => s.id === state.assignmentSubject);
  const items = assignments.filter(a => a.subject_id === state.assignmentSubject);

  if (isStaff) {
    return pageHead('Assignments', subject ? subject.name : 'Subject') + `
    <div class="card">
      <div class="card-row"><h3>Post a new assignment</h3></div>
      <form data-act="create-assignment">
        <div class="grid-2">
          <div class="field"><label>Title</label><input id="as-title" required></div>
          <div class="field"><label>Due date</label><input id="as-due" type="date"></div>
        </div>
        <div class="field"><label>Description</label><input id="as-desc" placeholder="What should students do?"></div>
        <button class="btn btn-gold btn-sm" type="submit">Post assignment</button>
      </form>
    </div>
    ${items.length ? items.map(a => {
      const mySubs = subs.filter(s => s.assignment_id === a.id);
      return `
      <div class="card">
        <div class="card-row"><h3>${esc(a.title)}</h3><button class="btn btn-danger btn-sm" data-act="delete-item" data-store="assignments" data-id="${a.id}">Delete</button></div>
        <div class="item-meta" style="margin-bottom:12px">Due ${esc(a.due_date||'—')}</div>
        ${mySubs.length ? `<table><thead><tr><th>Reg No</th><th>File</th><th>Review</th><th>Marks</th><th></th></tr></thead><tbody>
          ${mySubs.map(s => `<tr>
            <td class="mono">${esc(s.reg_no)}</td>
            <td><button class="btn btn-ghost btn-sm" data-act="view-file" data-store="submissions" data-id="${s.id}">${esc(s.original_name)}</button></td>
            <td><textarea class="review-box" data-review-id="${s.id}" placeholder="Feedback...">${esc(s.review||'')}</textarea></td>
            <td><input class="marks-input mono" data-marks-id="${s.id}" value="${esc(s.marks||'')}" placeholder="—"></td>
            <td><button class="btn btn-gold btn-sm" data-act="save-review" data-id="${s.id}">Save</button></td>
          </tr>`).join('')}</tbody></table>` : `<div class="empty">No submissions yet.</div>`}
      </div>`;
    }).join('') : `<div class="empty" style="margin-top:8px">No assignments in this subject yet.</div>`}`;
  }

  // Student view
  return pageHead('Assignments', subject ? subject.name : 'Subject') + (items.length ? items.map(a => {
    const mine = subs.find(s => s.assignment_id === a.id);
    return `
    <div class="card">
      <div class="card-row"><h3>${esc(a.title)}</h3>
        ${mine ? (mine.marks ? `<span class="status-pill pill-done">Reviewed</span>` : `<span class="status-pill pill-pending">Submitted</span>`) : `<span class="status-pill pill-pending">Pending</span>`}
      </div>
      <p style="font-size:13.5px;color:var(--slate);margin-top:0">${esc(a.description||'')}</p>
      <div class="item-meta" style="margin-bottom:10px">Due ${esc(a.due_date||'—')} · posted by ${esc(a.uploader)}</div>
      ${mine ? `
        <div class="item-row" style="border-top:1px dashed var(--line)">
          <div><div class="item-title">${esc(mine.original_name)}</div><div class="item-meta">submitted ${fmtDate(mine.date)}</div></div>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-act="view-file" data-store="submissions" data-id="${mine.id}">Open</button>
            <label class="btn btn-gold btn-sm file-input-wrap">Resubmit<input type="file" accept="application/pdf" data-act="submit-assignment" data-id="${a.id}"></label>
          </div>
        </div>
        ${mine.review ? `<div class="card" style="background:#F7F5EE;margin-top:12px;box-shadow:none">
            <div class="item-meta" style="margin-bottom:4px">Staff review${mine.marks?' · Marks: '+esc(mine.marks):''}</div>
            <div style="font-size:13.5px">${esc(mine.review)}</div></div>` : ''}
      ` : `<label class="btn btn-gold btn-sm file-input-wrap">Upload submission (PDF)<input type="file" accept="application/pdf" data-act="submit-assignment" data-id="${a.id}"></label>`}
    </div>`;
  }).join('') : `<div class="card"><div class="empty">No assignments in this subject yet.</div></div>`);
}

/* ===================== PRACTICALS (independent subject list) ===================== */
function practicalSection() {
  const subjects = state.data.practicalSubjects || [];
  const files = state.data.practicalFiles || [];
  const isStaff = state.role === 'staff';

  if (!state.practicalSubject) {
    return pageHead('Practicals','Sections') + `
    <div class="card">
      <div class="card-row"><h3>Sections</h3></div>
      ${isStaff ? `<div style="margin-bottom:16px">${subjectAddForm('practical','e.g. Physics Lab')}</div>` : ''}
      ${subjects.length ? subjects.map(s => subjectListRow(s, files.filter(f=>f.subject_id===s.id).length, 'practical', isStaff)).join('')
        : `<div class="empty">${isStaff ? 'No sections yet — add one above to start uploading practical files.' : 'No sections have been added yet.'}</div>`}
    </div>`;
  }

  const subject = subjects.find(s => s.id === state.practicalSubject);
  const items = files.filter(f => f.subject_id === state.practicalSubject);
  return pageHead('Practicals', subject ? subject.name : 'Section') + `
  <div class="card">
    <div class="card-row"><h3>Files</h3>
      ${isStaff ? `<label class="btn btn-gold btn-sm file-input-wrap">Upload PDF<input type="file" accept="application/pdf" data-act="upload-practical" data-subject="${state.practicalSubject}"></label>` : ''}
    </div>
    ${items.length ? items.map(f => `
      <div class="item-row">
        <div><div class="item-title">${esc(f.original_name)}</div><div class="item-meta">by ${esc(f.uploader)} · ${fmtDate(f.date)}</div></div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-act="view-file" data-store="practicals/files" data-id="${f.id}">Open</button>
          <button class="btn btn-gold btn-sm" data-act="download-file" data-store="practicals/files" data-id="${f.id}">Save</button>
          ${isStaff ? `
            <button class="btn btn-ghost btn-sm" data-act="rename-practical-file" data-id="${f.id}">Rename</button>
            <label class="btn btn-ghost btn-sm file-input-wrap">Replace<input type="file" accept="application/pdf" data-act="replace-practical-file" data-id="${f.id}"></label>
            <button class="btn btn-danger btn-sm" data-act="delete-practical-file" data-id="${f.id}">Delete</button>
          ` : ''}
        </div>
      </div>`).join('') : `<div class="empty">${isStaff ? 'Nothing uploaded yet — add your first PDF above.' : 'No files here yet.'}</div>`}
  </div>`;
}

/* ===================== QUIZZES (form link + staff-entered scores + leaderboard) ===================== */
function leaderboardTable(rows, highlightRegNo) {
  const sorted = [...rows].sort((a,b) => (parseFloat(b.score)||-Infinity) - (parseFloat(a.score)||-Infinity));
  if (!sorted.length) return `<div class="empty">No scores entered yet.</div>`;
  return `<table><thead><tr><th>Rank</th><th>Name</th><th>Score</th></tr></thead><tbody>
    ${sorted.map((r,i) => `<tr style="${highlightRegNo && r.reg_no===highlightRegNo ? 'background:#FDF1DA' : ''}">
      <td class="mono">#${i+1}</td><td>${esc(r.name)}</td><td class="mono">${esc(r.score||'—')}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

function quizSection() {
  const quizzes = state.data.quizzes || [];
  const isStaff = state.role === 'staff';

  if (!state.quizId) {
    if (isStaff) {
      return pageHead('Weekly Quizzes','All quizzes') + `
      <div class="card">
        <div class="card-row"><h3>Post a new quiz</h3></div>
        <form data-act="create-quiz">
          <div class="grid-2">
            <div class="field"><label>Title</label><input id="qz-title" placeholder="Week 6 — Kinematics" required></div>
            <div class="field"><label>Date</label><input id="qz-date" type="date"></div>
          </div>
          <div class="field"><label>Google Form link</label><input id="qz-url" type="url" placeholder="https://forms.gle/..."></div>
          <div class="field"><label>Description</label><input id="qz-desc" placeholder="What does this quiz cover?"></div>
          <button class="btn btn-gold btn-sm" type="submit">Post quiz</button>
        </form>
      </div>
      ${quizzes.length ? quizzes.map(q => `
        <div class="item-row"><div><div class="item-title">${esc(q.title)}</div><div class="item-meta">${esc(q.date||'no date set')}</div></div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-act="open-subject" data-scope="quiz" data-id="${q.id}">Manage scores</button>
          <button class="btn btn-danger btn-sm" data-act="delete-item" data-store="quizzes" data-id="${q.id}">Delete</button>
        </div></div>`).join('') : `<div class="card"><div class="empty">No quizzes posted yet.</div></div>`}`;
    }
    // Student list view: form link + own score + leaderboard, all inline.
    const scoresByQuiz = state.data.quizScoresByQuiz || {};
    return pageHead('Weekly Quizzes','All quizzes') + (quizzes.length ? quizzes.map(q => {
      const rows = scoresByQuiz[q.id] || [];
      const mine = rows.find(r => r.reg_no === state.user.regNo);
      return `
      <div class="card">
        <div class="card-row"><h3>${esc(q.title)}</h3>${mine ? `<span class="status-pill pill-done">Your score: ${esc(mine.score)}</span>` : `<span class="status-pill pill-pending">Not scored yet</span>`}</div>
        <p style="font-size:13.5px;color:var(--slate);margin-top:0">${esc(q.description||'')}</p>
        <div class="item-meta" style="margin-bottom:12px">${esc(q.date||'')}</div>
        ${q.form_url ? `<button class="btn btn-gold btn-sm" data-act="open-quiz-form" data-url="${esc(q.form_url)}" style="margin-bottom:14px">Open quiz form ↗</button>` : ''}
        <div class="item-meta" style="margin-bottom:6px;font-weight:600;color:var(--ink)">Leaderboard</div>
        ${leaderboardTable(rows, state.user.regNo)}
      </div>`;
    }).join('') : `<div class="card"><div class="empty">No quizzes posted yet.</div></div>`);
  }

  // Drilled into one quiz (staff-only: manage the score sheet)
  const quiz = quizzes.find(q => q.id === state.quizId);
  const scoreRows = state.data.quizScores || [];
  return pageHead('Manage scores', quiz ? quiz.title : 'Quiz') + `
  <div class="card">
    <div class="card-row"><h3>Score sheet</h3>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-act="add-row" data-store="quizscores">+ Add row</button>
        <button class="btn btn-gold btn-sm" data-act="save-quiz-scores">Save changes</button>
      </div>
    </div>
    ${editableQuizScoreTable(scoreRows)}
  </div>
  <div class="card">
    <div class="card-row"><h3>Live leaderboard</h3></div>
    ${leaderboardTable(scoreRows)}
  </div>`;
}
function editableQuizScoreTable(rows) {
  return `<table><thead><tr><th>Reg No</th><th>Name</th><th>Score</th><th></th></tr></thead>
  <tbody>
  ${rows.map((r,i) => `<tr>
    <td contenteditable="true" data-f="regNo">${esc(r.reg_no)}</td>
    <td contenteditable="true" data-f="name">${esc(r.name)}</td>
    <td contenteditable="true" class="mono" data-f="score">${esc(r.score)}</td>
    <td><button class="btn btn-ghost btn-sm" data-act="delete-row" data-store="quizscores" data-idx="${i}">✕</button></td>
  </tr>`).join('')}
  </tbody></table>`;
}

/* ===================== ATTENDANCE (unchanged) ===================== */
function attendanceSection() {
  if (state.role === 'student') {
    const row = (state.data.attendance || [])[0];
    if (!row) return pageHead('Section 02','Attendance') + `<div class="card"><div class="empty">Your attendance record hasn't been uploaded yet.</div></div>`;
    const total = Number(row.total) || (Number(row.present)||0)+(Number(row.absent)||0);
    const present = Number(row.present) || 0, absent = Number(row.absent) || Math.max(total-present,0);
    const pct = total ? Math.round((present/total)*1000)/10 : 0;
    return pageHead('Section 02','Attendance') + `
    <div class="card"><div class="attend-flex">
      <div class="pie" style="background:conic-gradient(var(--green) 0% ${pct}%, var(--rust) ${pct}% 100%)"></div>
      <div><div class="big-pct">${pct}%</div><div class="item-meta" style="margin-bottom:14px">overall attendance</div>
        <div class="legend">
          <div><span class="dot" style="background:var(--green)"></span>Present — ${present} day${present===1?'':'s'}</div>
          <div><span class="dot" style="background:var(--rust)"></span>Absent — ${absent} day${absent===1?'':'s'}</div>
          <div style="color:var(--slate)">Total working days: ${total}</div>
        </div>
      </div>
    </div></div>`;
  }
  const rows = state.data.attendance || [];
  return pageHead('Section 02','Attendance') + `
  <div class="card">
    <div class="card-row"><h3>Attendance sheet</h3>
      <div class="row-actions">
        <label class="btn btn-ghost btn-sm file-input-wrap">Upload Excel<input type="file" accept=".xlsx,.xls,.csv" data-act="upload-attendance"></label>
        <button class="btn btn-ghost btn-sm" data-act="add-row" data-store="attendance">+ Add row</button>
        <button class="btn btn-gold btn-sm" data-act="save-attendance">Save changes</button>
      </div>
    </div>
    ${rows.length ? editableAttendanceTable(rows) : `<div class="empty">No attendance sheet uploaded yet. Expected columns: Reg No, Name, Total, Present, Absent.</div>`}
  </div>`;
}
function editableAttendanceTable(rows) {
  return `<table><thead><tr><th>Reg No</th><th>Name</th><th>Total</th><th>Present</th><th>Absent</th><th></th></tr></thead>
  <tbody>
  ${rows.map((r,i) => `<tr>
    <td contenteditable="true" data-f="regNo">${esc(r.reg_no)}</td>
    <td contenteditable="true" data-f="name">${esc(r.name)}</td>
    <td contenteditable="true" class="mono" data-f="total">${esc(r.total)}</td>
    <td contenteditable="true" class="mono" data-f="present">${esc(r.present)}</td>
    <td contenteditable="true" class="mono" data-f="absent">${esc(r.absent)}</td>
    <td><button class="btn btn-ghost btn-sm" data-act="delete-row" data-store="attendance" data-idx="${i}">✕</button></td>
  </tr>`).join('')}
  </tbody></table>`;
}

/* ===================== TESTS & CGPA (unchanged) ===================== */
function editableSemTable(rows) {
  return `<table><thead><tr><th>Reg No</th><th>Name</th><th>Semester</th><th>SGPA</th><th>Credits</th><th></th></tr></thead>
  <tbody>
  ${rows.map((r,i) => `<tr>
    <td contenteditable="true" data-f="regNo">${esc(r.reg_no)}</td>
    <td contenteditable="true" data-f="name">${esc(r.name)}</td>
    <td contenteditable="true" data-f="sem">${esc(r.semester)}</td>
    <td contenteditable="true" class="mono" data-f="sgpa">${esc(r.sgpa)}</td>
    <td contenteditable="true" class="mono" data-f="credits">${esc(r.credits)}</td>
    <td><button class="btn btn-ghost btn-sm" data-act="delete-row" data-store="semresults" data-idx="${i}">✕</button></td>
  </tr>`).join('')}
  </tbody></table>`;
}
function testsSection() {
  const pdfs = state.data.testpdfs || [];
  const sem = state.data.semresults || [];
  const isStaff = state.role === 'staff';

  if (isStaff) {
    return pageHead('Section 04','Tests') + `
    <div class="card">
      <div class="card-row"><h3>Internal exam mark sheets</h3><label class="btn btn-gold btn-sm file-input-wrap">Upload PDF<input type="file" accept="application/pdf" data-act="upload-testpdf"></label></div>
      ${pdfs.length ? pdfs.map(n => `
        <div class="item-row"><div><div class="item-title">${esc(n.original_name)}</div><div class="item-meta">${fmtDate(n.date)}</div></div>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-act="view-file" data-store="testpdfs" data-id="${n.id}">Open</button>
            <button class="btn btn-ghost btn-sm" data-act="rename-item" data-store="testpdfs" data-id="${n.id}">Rename</button>
            <button class="btn btn-danger btn-sm" data-act="delete-item" data-store="testpdfs" data-id="${n.id}">Delete</button>
          </div></div>`).join('') : `<div class="empty">No mark sheets uploaded yet.</div>`}
    </div>
    <div class="card">
      <div class="card-row"><h3>Previous semester results</h3>
        <div class="row-actions">
          <label class="btn btn-ghost btn-sm file-input-wrap">Upload Excel<input type="file" accept=".xlsx,.xls,.csv" data-act="upload-semresults"></label>
          <button class="btn btn-ghost btn-sm" data-act="add-row" data-store="semresults">+ Add row</button>
          <button class="btn btn-gold btn-sm" data-act="save-semresults">Save changes</button>
        </div>
      </div>
      ${sem.length ? editableSemTable(sem) : `<div class="empty">No results uploaded yet. Expected columns: Reg No, Name, Semester, SGPA, Credits.</div>`}
    </div>`;
  }

  return pageHead('Section 04','Tests & CGPA') + `
  <div class="grid-2">
    <div class="card"><div class="card-row"><h3>Internal exam marks</h3></div>
      ${pdfs.length ? pdfs.map(n => `
        <div class="item-row"><div><div class="item-title">${esc(n.original_name)}</div><div class="item-meta">by ${esc(n.uploader)} · ${fmtDate(n.date)}</div></div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-act="view-file" data-store="testpdfs" data-id="${n.id}">Open</button>
          <button class="btn btn-gold btn-sm" data-act="download-file" data-store="testpdfs" data-id="${n.id}">Save</button>
        </div></div>`).join('') : `<div class="empty">No mark sheets uploaded yet.</div>`}
    </div>
    <div class="card"><div class="card-row"><h3>Previous semester results</h3></div>
      ${sem.length ? `<table><thead><tr><th>Semester</th><th>SGPA</th><th>Credits</th></tr></thead><tbody>
        ${sem.map(r => `<tr><td>${esc(r.semester)}</td><td class="mono">${esc(r.sgpa)}</td><td class="mono">${esc(r.credits)}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">No results on file yet.</div>`}
    </div>
  </div>
  <div class="card">
    <div class="card-row"><h3>CGPA calculator</h3><button class="btn btn-ghost btn-sm" data-act="cgpa-add-sem">+ Add semester</button></div>
    ${state.cgpaSemesters.map((sem,si) => `
      <div style="margin-bottom:18px">
        <div class="item-meta" style="margin-bottom:8px;font-weight:600;color:var(--ink)">${esc(sem.name)}</div>
        ${sem.rows.map((r,ri) => `
          <div class="cgpa-row">
            <input placeholder="Subject" value="${esc(r.subject)}" data-act="cgpa-edit" data-si="${si}" data-ri="${ri}" data-field="subject">
            <input placeholder="Credits" type="number" min="0" value="${esc(r.credit)}" data-act="cgpa-edit" data-si="${si}" data-ri="${ri}" data-field="credit">
            <input placeholder="Grade point (0-10)" type="number" min="0" max="10" value="${esc(r.gp)}" data-act="cgpa-edit" data-si="${si}" data-ri="${ri}" data-field="gp">
            <button class="btn btn-ghost btn-sm" data-act="cgpa-remove-row" data-si="${si}" data-ri="${ri}">✕</button>
          </div>`).join('')}
        <button class="btn btn-ghost btn-sm" data-act="cgpa-add-row" data-si="${si}">+ Add subject</button>
      </div>`).join('')}
    <div class="row-actions">
      <button class="btn btn-gold btn-sm" data-act="cgpa-calc">Calculate CGPA</button>
      <button class="btn btn-ghost btn-sm" data-act="cgpa-save">Save my entries</button>
    </div>
    ${state.cgpaResult !== null ? `
      <div class="result-banner">
        <div><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#B9C0D6">Cumulative GPA</div>
        <div style="font-size:12.5px;color:#B9C0D6;margin-top:2px">across ${state.cgpaSemesters.length} semester(s)</div></div>
        <div class="num">${state.cgpaResult}</div>
      </div>` : ''}
  </div>`;
}

/* ===================== ADMIN (unchanged) ===================== */
function adminUsers() {
  const students = state.data.students || [], staff = state.data.staff || [], logs = state.data.logs || [];
  return pageHead('Control','Users & Logins') + `
  <div class="card">
    <div class="card-row"><h3>Pre-register an account</h3></div>
    <p style="font-size:12.5px;color:var(--slate);margin-top:-6px">Add someone's register number and name here so they don't have to register themselves.</p>
    <form data-act="admin-add-user">
      <div class="grid-2">
        <div class="field"><label>Role</label>
          <select id="au-role" style="width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px;background:#FAFBFD">
            <option value="students">Student</option>
            <option value="staff">Staff</option>
          </select>
        </div>
        <div class="field"><label>Register Number</label><input class="mono" id="au-reg" required></div>
      </div>
      <div class="field"><label>Full Name</label><input id="au-name" required></div>
      <button class="btn btn-gold btn-sm" type="submit">Add account</button>
    </form>
  </div>
  <div class="grid-2">
    <div class="card"><div class="card-row"><h3>Students</h3><span class="item-meta">${students.length}</span></div>
      ${students.length ? students.map(s => `
        <div class="item-row"><div><div class="item-title">${esc(s.name)}</div><div class="item-meta mono">${esc(s.reg_no)}</div></div>
        <button class="btn btn-danger btn-sm" data-act="remove-user" data-role="students" data-reg="${esc(s.reg_no)}">Remove</button></div>`).join('') : `<div class="empty">None registered yet.</div>`}
    </div>
    <div class="card"><div class="card-row"><h3>Staff</h3><span class="item-meta">${staff.length}</span></div>
      ${staff.length ? staff.map(s => `
        <div class="item-row"><div><div class="item-title">${esc(s.name)}</div><div class="item-meta mono">${esc(s.reg_no)}</div></div>
        <button class="btn btn-danger btn-sm" data-act="remove-user" data-role="staff" data-reg="${esc(s.reg_no)}">Remove</button></div>`).join('') : `<div class="empty">None registered yet.</div>`}
    </div>
  </div>
  <div class="card"><div class="card-row"><h3>Login activity</h3></div>
    ${logs.length ? `<table><thead><tr><th>When</th><th>Role</th><th>Reg No</th><th>Name</th></tr></thead><tbody>
      ${logs.slice(0,50).map(l => `<tr><td>${fmtDate(l.time)}</td><td style="text-transform:capitalize">${esc(l.role)}</td><td class="mono">${esc(l.reg_no||'—')}</td><td>${esc(l.name)}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">No logins recorded yet.</div>`}
  </div>`;
}
function adminContent() {
  const tab = state.adminContentTab || 'notes';
  const d = state.data;
  const tabs = [['notes','Notes'],['testpdfs','Test Sheets'],['assignments','Assignments'],['submissions','Submissions'],['attendance','Attendance'],['semresults','Sem. Results']];
  let body = '';
  if (tab === 'notes' || tab === 'testpdfs') {
    const items = d[tab] || [];
    body = items.length ? items.map(n => `
      <div class="item-row"><div><div class="item-title">${esc(n.original_name)}</div><div class="item-meta">by ${esc(n.uploader)} · ${fmtDate(n.date)}</div></div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-act="view-file" data-store="${tab}" data-id="${n.id}">Open</button>
        <button class="btn btn-danger btn-sm" data-act="delete-item" data-store="${tab}" data-id="${n.id}">Delete</button>
      </div></div>`).join('') : `<div class="empty">Nothing here.</div>`;
  } else if (tab === 'assignments') {
    const items = d.assignments || [];
    body = items.length ? items.map(a => `
      <div class="item-row"><div><div class="item-title">${esc(a.title)}</div><div class="item-meta">due ${esc(a.due_date||'—')} · by ${esc(a.uploader)}</div></div>
      <button class="btn btn-danger btn-sm" data-act="delete-item" data-store="assignments" data-id="${a.id}">Delete</button></div>`).join('') : `<div class="empty">Nothing here.</div>`;
  } else if (tab === 'submissions') {
    const items = d.submissions || [];
    body = items.length ? items.map(s => `
      <div class="item-row"><div><div class="item-title">${esc(s.original_name)}</div><div class="item-meta mono">${esc(s.reg_no)} · ${fmtDate(s.date)}</div></div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-act="view-file" data-store="submissions" data-id="${s.id}">Open</button>
        <button class="btn btn-danger btn-sm" data-act="delete-item" data-store="submissions" data-id="${s.id}">Delete</button>
      </div></div>`).join('') : `<div class="empty">Nothing here.</div>`;
  } else if (tab === 'attendance') {
    body = (d.attendance||[]).length ? editableAttendanceTable(d.attendance) + `<div style="margin-top:14px"><button class="btn btn-gold btn-sm" data-act="save-attendance">Save changes</button></div>` : `<div class="empty">Nothing here.</div>`;
  } else if (tab === 'semresults') {
    body = (d.semresults||[]).length ? editableSemTable(d.semresults) + `<div style="margin-top:14px"><button class="btn btn-gold btn-sm" data-act="save-semresults">Save changes</button></div>` : `<div class="empty">Nothing here.</div>`;
  }
  return pageHead('Control','Content Control') + `
  <div class="subtabs">${tabs.map(([k,l]) => `<button class="subtab ${tab===k?'active':''}" data-act="admin-content-tab" data-tab="${k}">${l}</button>`).join('')}</div>
  <div class="card">${body}</div>`;
}

/* ===================== MASTER PAINT ===================== */
function paint() {
  const app = document.getElementById('app');
  if (state.screen === 'login') { app.innerHTML = renderLogin(); attachEvents(); return; }
  let inner = state.loading ? loadingBlock() : '';
  if (!state.loading) {
    if (state.role === 'student' || state.role === 'staff') {
      if (state.section === 'notes') inner = notesSection();
      else if (state.section === 'attendance') inner = attendanceSection();
      else if (state.section === 'assignment') inner = assignmentSection();
      else if (state.section === 'practical') inner = practicalSection();
      else if (state.section === 'quiz') inner = quizSection();
      else if (state.section === 'tests') inner = testsSection();
    } else if (state.role === 'admin') {
      if (state.section === 'users') inner = adminUsers();
      else if (state.section === 'content') inner = adminContent();
    }
  }
  app.innerHTML = shell(inner);
  attachEvents();
}

/* ===================== EVENTS ===================== */
function resetDrillState() {
  state.notesSubject = null; state.assignmentSubject = null; state.practicalSubject = null; state.quizId = null;
}

function attachEvents() {
  const app = document.getElementById('app');

  app.onclick = async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    try {
      if (act === 'switch-role') { state.loginRole = t.dataset.role; state.error=''; paint(); }
      else if (act === 'open-admin') { state.adminModal = true; state.adminError=''; state.adminForgot=false; paint(); }
      else if (act === 'close-admin' || act === 'close-admin-bg') { state.adminModal = false; state.adminForgot=false; paint(); }
      else if (act === 'toggle-admin-forgot') { state.adminForgot = !state.adminForgot; paint(); }
      else if (act === 'logout') {
        await api('/auth/logout', { method:'POST' });
        state = {...state, screen:'login', role:null, user:null, section:null, data:null, error:'', backStack:[]};
        resetDrillState();
        paint();
      }
      else if (act === 'install-app') {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        paint();
      }
      else if (act === 'nav') {
        if (t.dataset.section !== state.section) { pushBack(); resetDrillState(); }
        await loadSection(t.dataset.section);
      }
      else if (act === 'go-back') { await goBack(); }
      else if (act === 'open-subject') {
        pushBack();
        const scope = t.dataset.scope, id = t.dataset.id;
        if (scope === 'notes') state.notesSubject = id;
        else if (scope === 'assignment') state.assignmentSubject = id;
        else if (scope === 'practical') state.practicalSubject = id;
        else if (scope === 'quiz') { state.quizId = id; state.data.quizScores = await api(`/quizzes/${id}/scores`); }
        paint();
      }
      else if (act === 'rename-subject') {
        const newName = prompt('New name:');
        if (!newName) return;
        const scope = t.dataset.scope, id = t.dataset.id;
        const path = scope === 'practical' ? `/practicals/subjects/${id}` : `/subjects/${id}`;
        await api(path, { method:'PUT', body:{ name:newName } });
        await loadSection(state.section);
      }
      else if (act === 'delete-subject') {
        if (!confirm('Delete this subject? Everything inside it will be deleted too.')) return;
        const scope = t.dataset.scope, id = t.dataset.id;
        const path = scope === 'practical' ? `/practicals/subjects/${id}` : `/subjects/${id}`;
        await api(path, { method:'DELETE' });
        await loadSection(state.section);
      }
      else if (act === 'rename-practical-file') {
        const newName = prompt('New file name:');
        if (!newName) return;
        await api(`/practicals/files/${t.dataset.id}/rename`, { method:'PUT', body:{ name:newName } });
        await loadSection(state.section);
      }
      else if (act === 'delete-practical-file') {
        if (!confirm('Delete this file permanently?')) return;
        await api(`/practicals/files/${t.dataset.id}`, { method:'DELETE' });
        await loadSection(state.section);
      }
      else if (act === 'open-quiz-form') { window.open(t.dataset.url, '_blank'); }
      else if (act === 'remove-user') {
        if (!confirm('Remove this user? They will need to register again to log back in.')) return;
        await api(`/admin/users/${t.dataset.role}/${encodeURIComponent(t.dataset.reg)}`, { method:'DELETE' });
        await loadSection('users');
      }
      else if (act === 'view-file') viewFile(t.dataset.store, t.dataset.id);
      else if (act === 'download-file') downloadFile(t.dataset.store, t.dataset.id);
      else if (act === 'delete-item') {
        if (!confirm('Delete this item permanently?')) return;
        await api(`/${t.dataset.store}/${t.dataset.id}`, { method:'DELETE' });
        await loadSection(state.section);
      }
      else if (act === 'rename-item') {
        const newName = prompt('New file name:');
        if (!newName) return;
        await api(`/${t.dataset.store}/${t.dataset.id}/rename`, { method:'PUT', body:{ name:newName } });
        await loadSection(state.section);
      }
      else if (act === 'delete-row') {
        const store = t.dataset.store, idx = Number(t.dataset.idx);
        const rows = readEditableRows();
        rows.splice(idx,1);
        const apiPath = store === 'attendance' ? '/attendance' : store === 'semresults' ? '/semresults' : `/quizzes/${state.quizId}/scores`;
        await api(apiPath, { method:'PUT', body:{ rows } });
        await loadSection(state.section);
      }
      else if (act === 'add-row') {
        const store = t.dataset.store;
        if (store === 'attendance') state.data.attendance.push({ reg_no:'', name:'', total:'', present:'', absent:'' });
        else if (store === 'semresults') state.data.semresults.push({ reg_no:'', name:'', semester:'', sgpa:'', credits:'' });
        else if (store === 'quizscores') state.data.quizScores.push({ reg_no:'', name:'', score:'' });
        paint();
      }
      else if (act === 'save-attendance') { await saveEditableTable('/attendance'); }
      else if (act === 'save-semresults') { await saveEditableTable('/semresults'); }
      else if (act === 'save-quiz-scores') { await saveEditableTable(`/quizzes/${state.quizId}/scores`); }
      else if (act === 'save-review') {
        const id = t.dataset.id;
        const review = app.querySelector(`[data-review-id="${id}"]`).value;
        const marks = app.querySelector(`[data-marks-id="${id}"]`).value;
        await api(`/submissions/${id}/review`, { method:'PUT', body:{ review, marks } });
        await loadSection('assignment');
      }
      else if (act === 'cgpa-add-sem') { state.cgpaSemesters.push({ name:'Semester '+(state.cgpaSemesters.length+1), rows:[{subject:'',credit:'',gp:''}] }); paint(); }
      else if (act === 'cgpa-add-row') { state.cgpaSemesters[Number(t.dataset.si)].rows.push({subject:'',credit:'',gp:''}); paint(); }
      else if (act === 'cgpa-remove-row') { state.cgpaSemesters[Number(t.dataset.si)].rows.splice(Number(t.dataset.ri),1); paint(); }
      else if (act === 'cgpa-calc') {
        let totalCredits=0, totalPoints=0;
        state.cgpaSemesters.forEach(sem => sem.rows.forEach(r => { const c=parseFloat(r.credit)||0, g=parseFloat(r.gp)||0; totalCredits+=c; totalPoints+=c*g; }));
        state.cgpaResult = totalCredits ? (totalPoints/totalCredits).toFixed(2) : '0.00';
        paint();
      }
      else if (act === 'cgpa-save') { await api('/cgpa', { method:'PUT', body:{ semesters: state.cgpaSemesters } }); toast('Saved. Your entries will be here next time you log in.'); }
      else if (act === 'admin-content-tab') { state.adminContentTab = t.dataset.tab; paint(); }
    } catch (err) { toast(err.message); }
  };

  app.onsubmit = async (e) => {
    e.preventDefault();
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    try {
      if (act === 'do-login') {
        const regNo = document.getElementById('li-reg').value.trim();
        const name = document.getElementById('li-name').value.trim();
        const role = state.loginRole;
        state.loggingIn = true; state.error = ''; paint();
        const me = await api('/auth/login', { method:'POST', body:{ role, regNo, name } });
        state.loggingIn = false;
        state.role = role; state.user = me; state.screen = role; state.error='';
        state.backStack = []; resetDrillState();
        await loadSection('notes');
      } else if (act === 'admin-login') {
        const name = document.getElementById('ad-name').value.trim();
        const password = document.getElementById('ad-pass').value;
        const me = await api('/auth/admin-login', { method:'POST', body:{ name, password } });
        state.role='admin'; state.user=me; state.screen='admin'; state.adminModal=false; state.adminError='';
        await loadSection('users');
      } else if (act === 'create-subject') {
        const scope = t.dataset.scope;
        const input = document.getElementById(`new-subj-${scope}`);
        const name = input.value.trim();
        if (!name) return;
        const path = scope === 'practical' ? '/practicals/subjects' : '/subjects';
        await api(path, { method:'POST', body:{ name } });
        await loadSection(state.section);
      } else if (act === 'create-assignment') {
        const title = document.getElementById('as-title').value.trim();
        const due = document.getElementById('as-due').value;
        const description = document.getElementById('as-desc').value.trim();
        if (!title) return;
        await api('/assignments', { method:'POST', body:{ title, description, due, subjectId: state.assignmentSubject } });
        await loadSection('assignment');
      } else if (act === 'create-quiz') {
        const title = document.getElementById('qz-title').value.trim();
        const date = document.getElementById('qz-date').value;
        const formUrl = document.getElementById('qz-url').value.trim();
        const description = document.getElementById('qz-desc').value.trim();
        if (!title) return;
        await api('/quizzes', { method:'POST', body:{ title, date, formUrl, description } });
        await loadSection('quiz');
      } else if (act === 'admin-add-user') {
        const role = document.getElementById('au-role').value;
        const regNo = document.getElementById('au-reg').value.trim();
        const name = document.getElementById('au-name').value.trim();
        await api('/admin/users', { method:'POST', body:{ role, regNo, name } });
        e.target.reset();
        toast('Account added.');
        await loadSection('users');
      }
    } catch (err) {
      if (act === 'do-login') { state.loggingIn = false; state.error = err.message; paint(); }
      else if (act === 'admin-login') { state.adminError = err.message; paint(); }
      else toast(err.message);
    }
  };

  app.onchange = async (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.act) return;
    const act = t.dataset.act;
    try {
      if (act === 'upload-note') {
        const file = t.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file); fd.append('subjectId', t.dataset.subject);
        await api('/notes', { method:'POST', body: fd });
        await loadSection(state.section);
      } else if (act === 'upload-testpdf') {
        const file = t.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file);
        await api('/testpdfs', { method:'POST', body: fd });
        await loadSection(state.section);
      } else if (act === 'upload-practical') {
        const file = t.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file); fd.append('subjectId', t.dataset.subject);
        await api('/practicals/files', { method:'POST', body: fd });
        await loadSection(state.section);
      } else if (act === 'replace-item') {
        const file = t.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file);
        await api(`/${t.dataset.store}/${t.dataset.id}/replace`, { method:'PUT', body: fd });
        await loadSection(state.section);
      } else if (act === 'replace-practical-file') {
        const file = t.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file);
        await api(`/practicals/files/${t.dataset.id}/replace`, { method:'PUT', body: fd });
        await loadSection(state.section);
      } else if (act === 'submit-assignment') {
        const file = t.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file); fd.append('assignmentId', t.dataset.id);
        await api('/submissions', { method:'POST', body: fd });
        await loadSection('assignment');
      } else if (act === 'upload-attendance') {
        const file = t.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file);
        await api('/attendance/upload', { method:'POST', body: fd });
        await loadSection('attendance');
      } else if (act === 'upload-semresults') {
        const file = t.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file);
        await api('/semresults/upload', { method:'POST', body: fd });
        await loadSection(state.section);
      } else if (act === 'cgpa-edit') {
        const si = Number(t.dataset.si), ri = Number(t.dataset.ri), field = t.dataset.field;
        state.cgpaSemesters[si].rows[ri][field] = t.value;
      }
    } catch (err) { toast(err.message); }
  };
}

function readEditableRows() {
  const tbody = document.querySelector('table tbody');
  const trs = tbody ? tbody.querySelectorAll('tr') : [];
  const rows = [];
  trs.forEach((tr) => {
    const row = {};
    tr.querySelectorAll('[data-f]').forEach((cell) => { row[cell.dataset.f] = cell.innerText.trim(); });
    rows.push(row);
  });
  return rows.filter((r) => r.regNo);
}
async function saveEditableTable(apiPath) {
  const rows = readEditableRows();
  await api(apiPath, { method:'PUT', body:{ rows } });
  await loadSection(state.section);
  toast('Changes saved.');
}
