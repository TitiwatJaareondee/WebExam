let state = {
    view: 'landing',
    currentUser: null,
    quizzes: [],
    quiz_results: [],
    activeQuiz: null,
    activeQuestionIndex: 0,
    studentAnswers: {},
    timeLeft: 0,
    timerInterval: null,
    captcha: null,
    captchaFails: 0,
    captchaLocked: false,
    role: null,
    regRole: null,
    editingQuiz: null,
    lastResult: null,
    startTime: null
};

const COMMON_PASSWORDS = ["password", "12345678", "qwerty123"];

function sanitize(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML.substring(0, 100); }

async function initSession() {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
        state.currentUser = JSON.parse(userStr);
        return state.currentUser;
    }
    return null;
}

async function navigate(view, params = {}) {
    const publicViews = ['landing', 'login', 'register'];
    const user = await initSession();
    
    if (!publicViews.includes(view) && !user) {
        state.view = 'landing';
    } else {
        state.view = view;
        if (user) {
            document.getElementById('user-info').innerText = `${user.fullName} (${user.role})`;
        }
    }

    Object.assign(state, params);
    if (view !== 'quiz-player' && state.timerInterval) clearInterval(state.timerInterval);
    
    document.getElementById('top-nav').classList.toggle('hidden', publicViews.includes(state.view));

    // Fetch data based on view
    try {
        if (view === 'student_dash' || view === 'student_quizzes') {
            state.quizzes = await API.quizzes.getAll();
            state.quiz_results = await API.results.getMy();
        } else if (view === 'teacher_dash' || view === 'manage_quizzes') {
            state.quizzes = await API.quizzes.getAll();
            state.quiz_results = await API.results.getAll();
        } else if (view === 'all_results') {
            state.quiz_results = await API.results.getAll();
        }
    } catch (e) {
        console.error("Fetch error:", e);
        if (e.message === 'Forbidden' || e.message === 'Unauthorized') {
            confirmLogout();
            return;
        }
    }

    render();
    window.scrollTo(0, 0);
}

function generateCaptcha() {
    const types = ['math', 'image', 'sequence']; const type = types[Math.floor(Math.random() * types.length)];
    if (type === 'math') {
        const a = Math.floor(Math.random() * 20) + 1, b = Math.floor(Math.random() * 20) + 1;
        state.captcha = { type, question: `คำนวณ: ${a} + ${b} = ?`, answer: (a + b).toString() };
    } else if (type === 'image') {
        const targets = ['🚗', '🍎', '🐱', '⚽'], t = targets[Math.floor(Math.random() * targets.length)];
        const grid = Array.from({length: 9}, () => targets[Math.floor(Math.random() * targets.length)]);
        state.captcha = { type, question: `คลิกทุกช่องที่มี ${t}`, grid, targetIndices: grid.map((e,i) => e === t ? i : null).filter(i => i !== null), selected: [] };
    } else if (type === 'sequence') {
        const s = [{ q: "A B _ D E", a: "C" }, { q: "1 2 _ 4 5", a: "3" }, { q: "10 20 _ 40", a: "30" }][Math.floor(Math.random() * 3)];
        state.captcha = { type, question: `เติมตัวที่หายไป: ${s.q}`, answer: s.a };
    }
}

const Views = {
    landing: () => `
        <div style="text-align:center; padding-top: var(--spacing-64);">
            <span class="caption">Safe Portal</span><h1>QUIZ SECURE</h1><p style="color: var(--text-secondary); margin-bottom: var(--spacing-48);">ระบบข้อสอบออนไลน์ที่ปลอดภัย</p>
            <div class="role-selection">
                <div class="role-card" onclick="navigate('login', {role: 'teacher'})"><span style="font-size:48px;">👩‍🏫</span><h2>ฉันเป็นครู</h2><span class="caption">Teacher Access</span></div>
                <div class="role-card" onclick="navigate('login', {role: 'student'})"><span style="font-size:48px;">👨‍🎓</span><h2>ฉันเป็นนักเรียน</h2><span class="caption">Student Access</span></div>
            </div>
        </div>
    `,
    login: () => {
        const label = state.role === 'teacher' ? 'คุณครู' : 'นักเรียน';
        return `
            <div style="max-width: 400px; margin: 0 auto;">
                <span class="caption">Auth • ${state.role.toUpperCase()}</span><h1>เข้าสู่ระบบ${label}</h1>
                <div class="form-group"><label>Username</label><input type="text" id="loginUser"></div>
                <div class="form-group"><label>Password</label><input type="password" id="loginPass"></div>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <button class="btn btn-primary" onclick="handleLogin()">Login</button>
                    <button class="btn btn-secondary" onclick="navigate('register', {regRole: '${state.role}'})">สมัครสมาชิก</button>
                    <button class="btn btn-secondary" style="border:none;" onclick="navigate('landing')">← ย้อนกลับ</button>
                </div>
            </div>
        `;
    },
    register: () => {
        if (!state.captcha) generateCaptcha(); const label = state.regRole === 'teacher' ? 'คุณครู' : 'นักเรียน';
        return `
            <div style="max-width: 480px; margin: 0 auto;">
                <span class="caption">Reg • ${state.regRole.toUpperCase()}</span><h1>ลงทะเบียน${label}</h1>
                <div class="form-group"><label>ชื่อ-นามสกุล</label><input type="text" id="regFullName"></div>
                <div class="form-group"><label>Username (4-20 ตัว)</label><input type="text" id="regUser" oninput="validateRegUsername(this.value)"><div id="userError" class="error-msg">ใช้ได้เฉพาะ A-Z, 0-9 และ _ (4-20 ตัว)</div></div>
                <div class="form-group"><label>Password (min 8 chars)</label><input type="password" id="regPass" oninput="checkPassStrength(this.value)"><div class="strength-meter" id="strengthMeter"><div id="strengthFill" style="height:100%; width:0%; transition:0.3s;"></div></div><div id="passError" class="error-msg">รหัสผ่านไม่ปลอดภัยพอ</div></div>
                <div class="form-group"><label>Confirm Password</label><input type="password" id="regConfirm"></div>
                ${state.regRole === 'teacher' ? `<div class="form-group"><label>Teacher Secret Code</label><input type="password" id="regTeacherCode" placeholder="รหัสลับสำหรับครู"></div>` : ''}
                <div class="card" style="background:#fff;"><span class="caption">Captcha</span><p style="margin-bottom:12px; font-size:14px;">${state.captcha.question}</p>${renderCaptchaWidget()}<div id="captchaError" class="error-msg">การตรวจสอบล้มเหลว</div></div>
                <div style="display:flex; flex-direction:column; gap:12px; margin-top:24px;">
                    <button class="btn btn-primary" id="regBtn" onclick="handleRegister()" ${state.captchaLocked ? 'disabled' : ''}>${state.captchaLocked ? 'Locked...' : 'Register'}</button>
                    <button class="btn btn-secondary" onclick="navigate('login', {role: '${state.regRole}'})">มีบัญชีแล้ว? เข้าสู่ระบบ</button>
                </div>
            </div>
        `;
    },
    student_dash: () => {
        const h = state.quiz_results;
        return `
            <span class="caption">Student Dash</span><h1>สวัสดี, ${state.currentUser.fullName} 👋</h1>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; margin-bottom:48px;">
                <div class="card" onclick="navigate('student_quizzes')" style="cursor:pointer; border-top:3px solid #000;"><span class="caption">Start</span><h2>ทำข้อสอบ</h2></div>
                <div class="card" style="border-top:3px solid #000;"><span class="caption">Records</span><h2>${h.length} ครั้ง</h2></div>
            </div>
            <h3>ประวัติการสอบล่าสุด</h3>
            <div class="card" style="padding:0; background:#fff;">
                <table><thead><tr><th>ควิซ</th><th>คะแนน</th><th>วันที่</th></tr></thead>
                <tbody>${h.map(r => `<tr><td>${r.quizName}</td><td style="font-weight:700;">${r.score}/${r.maxScore}</td><td style="font-size:12px;">${new Date(r.submittedAt).toLocaleDateString()}</td></tr>`).join('')}</tbody>
                </table>${h.length === 0 ? '<p style="padding:24px; text-align:center; color:var(--text-muted);">ไม่มีข้อมูล</p>' : ''}
            </div>
        `;
    },
    teacher_dash: () => `
        <span class="caption">Teacher Dash</span><h1>สวัสดี, ครู ${state.currentUser.fullName}</h1>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; margin-bottom:48px;">
            <div class="card" onclick="navigate('manage_quizzes')" style="cursor:pointer; border-top:3px solid #000;"><span class="caption">Content</span><h2>จัดการข้อสอบ</h2></div>
            <div class="card" onclick="navigate('all_results')" style="cursor:pointer; border-top:3px solid #000;"><span class="caption">Data</span><h2>ผลสอบทั้งหมด</h2></div>
        </div>
        <div class="card" style="background:#fff;"><span class="caption">Summary</span><p>Quizzes: ${state.quizzes.length} | Attempts: ${state.quiz_results.length}</p></div>
    `,
    manage_quizzes: () => `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;"><h1>จัดการข้อสอบ</h1><button class="btn btn-primary btn-sm" onclick="editQuiz(null)">➕ สร้างควิซใหม่</button></div>
        ${state.quizzes.map(q => `
            <div class="card" style="background:#fff;">
                <h3>${q.title}</h3><p style="font-size:14px; color:var(--text-secondary);">${q.description}</p>
                <div style="margin-top:16px; display:flex; gap:12px;"><button class="btn btn-secondary btn-sm" onclick="editQuiz('${q.id}')">แก้ไข</button><button class="btn btn-danger btn-sm" onclick="deleteQuiz('${q.id}')">ลบ</button></div>
            </div>
        `).join('')}
        <button class="btn btn-secondary" onclick="navigate('teacher_dash')">← Back</button>
    `,
    quiz_editor: () => {
        const q = state.editingQuiz;
        return `
            <h1>${q.id.startsWith('q-') ? 'สร้างควิซ' : 'แก้ไขควิซ'}</h1>
            <div class="card">
                <div class="form-group"><label>ชื่อควิซ</label><input type="text" id="editTitle" value="${q.title}"></div>
                <div class="form-group"><label>รายละเอียด</label><textarea id="editDesc">${q.description}</textarea></div>
                <div class="form-group" style="max-width:150px;"><label>เวลา (นาที)</label><input type="number" id="editTime" value="${q.timeLimit}"></div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
                <h3>คำถาม (${q.questions.length})</h3>
                <button class="btn btn-secondary btn-sm" onclick="addQuestionToEdit()">➕ เพิ่มข้อ</button>
            </div>
            <div id="q-list">${q.questions.map((qn, i) => `
                <div class="card" style="background:#fff; border-left:3px solid #000;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <strong>ข้อที่ ${i+1}</strong>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <select onchange="updateQType(${i}, this.value)" style="padding:4px; border-radius:4px;">
                                <option value="mcq" ${qn.type==='mcq'?'selected':''}>ปรนัย (4 ตัวเลือก)</option>
                                <option value="tf" ${qn.type==='tf'?'selected':''}>ถูก-ผิด</option>
                                <option value="subjective" ${qn.type==='subjective'?'selected':''}>อัตนัย (ตอบสั้น)</option>
                                <option value="long_answer" ${qn.type==='long_answer'?'selected':''}>อัตนัย (ตอบยาว)</option>
                            </select>
                            <button class="btn btn-danger btn-sm" onclick="removeQuestion(${i})">ลบ</button>
                        </div>
                    </div>
                    <div class="form-group"><label>โจทย์</label><input type="text" value="${qn.text}" onchange="updateQData(${i},'text',this.value)"></div>
                    <div id="q-options-${i}">
                        ${renderEditorOptions(i, qn)}
                    </div>
                    <div class="form-group" style="margin-top:12px; max-width:100px;">
                        <label>คะแนน</label>
                        <input type="number" value="${qn.points || 1}" onchange="updateQData(${i},'points',parseInt(this.value))">
                    </div>
                </div>
            `).join('')}</div>
            <div style="display:flex; gap:16px; margin-top:32px;"><button class="btn btn-primary" onclick="saveQuiz()">บันทึก</button><button class="btn btn-secondary" onclick="navigate('manage_quizzes')">ยกเลิก</button></div>
        `;
    },
    student_quizzes: () => `
        <h1>เลือกทำข้อสอบ</h1><div style="display:grid; gap:24px;">
        ${state.quizzes.map(q => `<div class="card" style="background:#fff;"><span class="caption">${q.questions.length} ข้อ • ${q.timeLimit} นาที</span><h2>${q.title}</h2><p style="font-size:14px; color:var(--text-secondary); margin-bottom:24px;">${q.description}</p><button class="btn btn-primary" onclick="startQuiz('${q.id}')">เริ่มทำ</button></div>`).join('')}
        </div><button class="btn btn-secondary" style="margin-top:32px;" onclick="navigate('student_dash')">← Back</button>
    `,
    all_results: () => {
        const res = state.quiz_results;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center;"><h1>ผลคะแนนทั้งหมด</h1><button class="btn btn-primary btn-sm" onclick="exportResultsCSV()">Export CSV</button></div>
            <div class="card" style="padding:0; background:#fff;"><table><thead><tr><th>นักเรียน</th><th>วิชา</th><th>คะแนน</th><th>วันที่</th></tr></thead>
            <tbody>${res.map(r => `<tr><td>${r.fullName}<br><small>${r.username}</small></td><td>${r.quizName}</td><td>${r.score}/${r.maxScore}</td><td>${new Date(r.submittedAt).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>
            <button class="btn btn-secondary" onclick="navigate('teacher_dash')">← Back</button>
        `;
    },
    'quiz-player': () => {
        const q = state.activeQuiz, qn = q.questions[state.activeQuestionIndex], prog = ((state.activeQuestionIndex + 1)/q.questions.length)*100;
        return `
            <div class="quiz-card card"><div class="progress-track"><div class="progress-fill" style="width:${prog}%"></div></div>
            <div style="padding:32px;"><div style="display:flex; justify-content:space-between; margin-bottom:32px;"><div><span class="caption">Q ${state.activeQuestionIndex+1}/${q.questions.length}</span><h2>${q.title}</h2></div><div class="timer-display" id="displayTimer">${formatTime(state.timeLeft)}</div></div>
            <div class="nav-grid">${q.questions.map((_, i) => `<div class="dot ${i===state.activeQuestionIndex?'active':''} ${state.studentAnswers[q.questions[i].id]!==undefined?'answered':''}" onclick="jumpToQuestion(${i})">${i+1}</div>`).join('')}</div>
            <div style="margin-bottom:48px;"><h2>${qn.text}</h2><div id="ans-area">${renderAnswerInput(qn)}</div></div>
            <div style="display:flex; justify-content:space-between;"><button class="btn btn-secondary" onclick="prevQuestion()" ${state.activeQuestionIndex===0?'disabled':''}>ก่อนหน้า</button>${state.activeQuestionIndex===q.questions.length-1?'<button class="btn btn-primary" onclick="submitQuiz()">ส่งคำตอบ</button>':'<button class="btn btn-primary" onclick="nextQuestion()">ถัดไป</button>'}</div></div></div>
        `;
    },
    result: () => {
        const r = state.lastResult, q = state.activeQuiz;
        return `
            <div style="text-align:center;"><span class="caption">Complete</span><h1>คะแนนของคุณคือ ${r.score} / ${r.maxScore}</h1>
            <div style="max-width:480px; margin:48px auto; text-align:left;"><h3>เฉลย</h3>
            ${q.questions.map((qn, i) => { 
                const a = r.answers.find(x => x.questionId === qn.id);
                const ok = a.isCorrect;
                let studentAnsText = '';
                let correctAnsText = '';

                if (qn.type === 'mcq' || qn.type === 'tf') {
                    studentAnsText = qn.options[a.answer] || 'ไม่ได้ตอบ';
                    correctAnsText = qn.options[qn.correctAnswer];
                } else {
                    studentAnsText = a.answer || 'ไม่ได้ตอบ';
                    correctAnsText = qn.correctAnswer;
                }

                return `
                    <div style="margin-bottom:24px;">
                        <p><strong>${i+1}. ${qn.text}</strong></p>
                        <div class="option ${ok?'correct-review':'wrong-review'}">${studentAnsText}</div>
                        ${!ok && qn.type !== 'long_answer' ? `<p style="font-size:12px; color:#555;">เฉลย: ${correctAnsText}</p>` : ''}
                    </div>
                `;
            }).join('')}</div><button class="btn btn-primary" onclick="navigate('student_dash')">Dashboard</button></div>
        `;
    }
};

async function handleLogin() {
    const u = document.getElementById('loginUser').value.trim(), p = document.getElementById('loginPass').value;
    try {
        await API.auth.login(u, p);
        const user = JSON.parse(sessionStorage.getItem('user'));
        navigate(user.role === 'teacher' ? 'teacher_dash' : 'student_dash');
    } catch (e) {
        alert(e.message);
    }
}

async function handleRegister() {
    const fn = document.getElementById('regFullName').value.trim(), un = document.getElementById('regUser').value.trim(), p = document.getElementById('regPass').value, c = document.getElementById('regConfirm').value;
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(un)) { alert("Username ไม่ถูกต้อง"); return; }
    if (COMMON_PASSWORDS.includes(p)) { alert("รหัสผ่านนี้เดาง่ายเกินไป"); return; }
    if (p !== c) { alert("รหัสผ่านไม่ตรงกัน"); return; }
    
    let ok = state.captcha.type === 'image' ? JSON.stringify(state.captcha.selected.sort()) === JSON.stringify(state.captcha.targetIndices.sort()) : document.getElementById('captchaInput').value.trim() === state.captcha.answer;
    if (!ok) { 
        state.captchaFails++; 
        if (state.captchaFails >= 3) { 
            state.captchaLocked = true; 
            setTimeout(() => { state.captchaLocked = false; state.captchaFails = 0; render(); }, 60000); 
        }
        alert("Verification Failed"); generateCaptcha(); render(); return; 
    }

    try {
        const userData = { fullName: sanitize(fn), username: sanitize(un), password: p, role: state.regRole };
        if (state.regRole === 'teacher') userData.teacherCode = document.getElementById('regTeacherCode').value;
        await API.auth.register(userData);
        alert("สำเร็จ!");
        navigate('login', { role: state.regRole });
    } catch (e) {
        alert(e.message);
    }
}

function renderCaptchaWidget() {
    if (state.captcha.type === 'image') return `<div class="captcha-grid">${state.captcha.grid.map((e, i) => `<div class="captcha-cell ${state.captcha.selected.includes(i)?'selected':''}" onclick="state.captcha.selected.includes(${i})?state.captcha.selected.splice(state.captcha.selected.indexOf(${i}),1):state.captcha.selected.push(${i});render();">${e}</div>`).join('')}</div>`;
    return `<input type="text" id="captchaInput" placeholder="คำตอบ">`;
}
function validateRegUsername(v) { const el = document.getElementById('userError'); if(el) el.style.display = /^[a-zA-Z0-9_]{4,20}$/.test(v)?'none':'block'; }
function checkPassStrength(v) {
    let s = 0; if (v.length>=8) s++; if (/[0-9]/.test(v)) s++; if (/[A-Z]/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
    const fill = document.getElementById('strengthFill'), colors = ['#eee','#ff4444','#ffbb33','#00C851'];
    if(fill) { fill.style.width = (s*25)+'%'; fill.style.background = colors[Math.min(s,3)]; }
}
function confirmLogout() { if (confirm("ต้องการออกจากระบบใช่ไหม?")) { API.auth.logout(); navigate('landing'); } }
function editQuiz(id) {
    state.editingQuiz = id ? JSON.parse(JSON.stringify(state.quizzes.find(x => x.id === id))) : { id: 'q-'+Date.now(), title: '', description: '', timeLimit: 20, questions: [] };
    navigate('quiz_editor');
}
async function saveQuiz() {
    const q = state.editingQuiz; q.title = sanitize(document.getElementById('editTitle').value); q.description = sanitize(document.getElementById('editDesc').value); q.timeLimit = parseInt(document.getElementById('editTime').value);
    try {
        await API.quizzes.save(q);
        navigate('manage_quizzes');
    } catch (e) {
        alert(e.message);
    }
}
async function deleteQuiz(id) { 
    if (confirm('ลบควิซนี้?')) { 
        try {
            await API.quizzes.delete(id);
            navigate('manage_quizzes');
        } catch (e) {
            alert(e.message);
        }
    } 
}
function addQuestionToEdit() { state.editingQuiz.questions.push({ id: 'qn-'+Date.now(), type: 'mcq', text: '', options: ['','','',''], correctAnswer: '0', points: 1 }); render(); }
function removeQuestion(i) { state.editingQuiz.questions.splice(i, 1); render(); }
function updateQData(i, k, v) { state.editingQuiz.questions[i][k] = v; }
function updateOption(qi, oi, v) { state.editingQuiz.questions[qi].options[oi] = v; }

function updateQType(i, type) {
    const qn = state.editingQuiz.questions[i];
    qn.type = type;
    if (type === 'mcq') {
        qn.options = ['', '', '', ''];
        qn.correctAnswer = '0';
    } else if (type === 'tf') {
        qn.options = ['ถูก', 'ผิด'];
        qn.correctAnswer = '0';
    } else if (type === 'subjective') {
        qn.options = [];
        qn.correctAnswer = '';
    } else if (type === 'long_answer') {
        qn.options = [];
        qn.correctAnswer = '';
    }
    render();
}

function renderEditorOptions(i, qn) {
    if (qn.type === 'mcq') {
        return `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                ${[0,1,2,3].map(j => `
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="radio" name="c-${i}" ${qn.correctAnswer == j ? 'checked' : ''} onclick="updateQData(${i},'correctAnswer','${j}')">
                        <input type="text" placeholder="ตัวเลือก ${j+1}" value="${qn.options[j] || ''}" onchange="updateOption(${i},${j},this.value)" style="flex:1;">
                    </div>
                `).join('')}
            </div>
        `;
    } else if (qn.type === 'tf') {
        return `
            <div style="display:flex; gap:24px;">
                <label><input type="radio" name="c-${i}" ${qn.correctAnswer == '0' ? 'checked' : ''} onclick="updateQData(${i},'correctAnswer','0')"> ถูก</label>
                <label><input type="radio" name="c-${i}" ${qn.correctAnswer == '1' ? 'checked' : ''} onclick="updateQData(${i},'correctAnswer','1')"> ผิด</label>
            </div>
        `;
    } else if (qn.type === 'subjective') {
        return `
            <div class="form-group">
                <label>คำตอบที่ถูกต้อง (สำหรับการตรวจอัตโนมัติ)</label>
                <input type="text" value="${qn.correctAnswer}" onchange="updateQData(${i},'correctAnswer',this.value)" placeholder="เช่น กล้วย">
            </div>
        `;
    } else if (qn.type === 'long_answer') {
        return `<p style="font-size:12px; color:var(--text-secondary);">อัตนัยแบบตอบยาว จะไม่ถูกตรวจคะแนนอัตโนมัติ</p>`;
    }
    return '';
}

function startQuiz(id) {
    const q = state.quizzes.find(x => x.id === id); state.activeQuiz = q; state.activeQuestionIndex = 0; state.studentAnswers = {}; state.timeLeft = q.timeLimit * 60; state.startTime = Date.now();
    navigate('quiz-player'); state.timerInterval = setInterval(() => { state.timeLeft--; if (state.timeLeft <= 0) submitQuiz(); else { const el = document.getElementById('displayTimer'); if (el) el.innerText = formatTime(state.timeLeft); } }, 1000);
}

function checkCorrectness(qn, studentAns) {
    if (qn.type === 'mcq' || qn.type === 'tf') {
        return studentAns == qn.correctAnswer;
    } else if (qn.type === 'subjective') {
        if (!studentAns || !qn.correctAnswer) return false;
        return studentAns.trim().toLowerCase() === qn.correctAnswer.trim().toLowerCase();
    }
    return false; // long_answer or unknown
}

async function submitQuiz() {
    clearInterval(state.timerInterval); 
    const d = Math.floor((Date.now() - state.startTime)/1000), q = state.activeQuiz; 
    let s = 0;
    const ans = q.questions.map(qn => { 
        const a = state.studentAnswers[qn.id];
        const ok = checkCorrectness(qn, a); 
        if (ok) s += qn.points; 
        return { questionId: qn.id, answer: a, isCorrect: ok }; 
    });
    const res = { 
        quizId: q.id, 
        quizName: q.title, 
        score: s, 
        maxScore: q.questions.reduce((a,x) => a+x.points, 0), 
        timeTaken: formatTime(d), 
        submittedAt: new Date().toISOString(), 
        answers: ans 
    };
    try {
        await API.results.save(res);
        state.lastResult = res;
        navigate('result');
    } catch (e) {
        alert(e.message);
    }
}
function exportResultsCSV() {
    const rows = [["Username", "Full Name", "Quiz", "Score", "Max", "Date", "Time Taken"]];
    state.quiz_results.forEach(r => rows.push([r.username, r.fullName, r.quizName, r.score, r.maxScore, new Date(r.submittedAt).toLocaleDateString(), r.timeTaken]));
    const csv = rows.map(r => r.join(",")).join("\n"), blob = new Blob([csv], { type: 'text/csv' }), url = window.URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `results_${Date.now()}.csv`; a.click();
}

function renderAnswerInput(qn) { 
    const s = state.studentAnswers[qn.id]; 
    if (qn.type === 'mcq') {
        return `<div style="display:flex; flex-direction:column;">${qn.options.map((o, i) => `<div class="option ${s == i ? 'selected' : ''}" onclick="state.studentAnswers['${qn.id}']= ${i}; render();"><span style="font-weight:700; margin-right:12px;">${String.fromCharCode(65+i)}</span> ${o}</div>`).join('')}</div>`; 
    } else if (qn.type === 'tf') {
        return `
            <div style="display:flex; gap:16px;">
                <div class="option ${s == '0' ? 'selected' : ''}" style="flex:1; text-align:center;" onclick="state.studentAnswers['${qn.id}']= '0'; render();">ถูก</div>
                <div class="option ${s == '1' ? 'selected' : ''}" style="flex:1; text-align:center;" onclick="state.studentAnswers['${qn.id}']= '1'; render();">ผิด</div>
            </div>
        `;
    } else if (qn.type === 'subjective') {
        return `
            <div class="form-group">
                <input type="text" class="input" placeholder="พิมพ์คำตอบของคุณที่นี่..." value="${s || ''}" onchange="state.studentAnswers['${qn.id}'] = this.value; render();">
            </div>
        `;
    } else if (qn.type === 'long_answer') {
        return `
            <div class="form-group">
                <textarea class="input" placeholder="พิมพ์คำตอบของคุณที่นี่..." style="min-height:150px;" onchange="state.studentAnswers['${qn.id}'] = this.value; render();">${s || ''}</textarea>
            </div>
        `;
    }
    return '';
}
function formatTime(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }
function jumpToQuestion(i) { state.activeQuestionIndex = i; render(); }
function nextQuestion() { if (state.activeQuestionIndex < state.activeQuiz.questions.length - 1) jumpToQuestion(state.activeQuestionIndex + 1); }
function prevQuestion() { if (state.activeQuestionIndex > 0) jumpToQuestion(state.activeQuestionIndex - 1); }
function render() { document.getElementById('app').innerHTML = Views[state.view](); }

// Start the app
initSession().then(user => {
    if (user) {
        navigate(user.role === 'teacher' ? 'teacher_dash' : 'student_dash');
    } else {
        navigate('landing');
    }
});
