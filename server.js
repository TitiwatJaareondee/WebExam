require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Middleware: Auth
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- AUTH ROUTES ---

app.post('/api/auth/register', async (req, res) => {
    const { fullName, username, password, role, teacherCode } = req.body;
    
    if (role === 'teacher' && teacherCode !== process.env.TEACHER_CODE) {
        return res.status(400).json({ error: 'รหัสครูไม่ถูกต้อง' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const stmt = db.prepare('INSERT INTO users (fullName, username, passwordHash, role) VALUES (?, ?, ?, ?)');
        stmt.run(fullName, username, passwordHash, role);
        res.status(201).json({ message: 'ลงทะเบียนสำเร็จ' });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Username นี้ถูกใช้แล้ว' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, user: { fullName: user.fullName, username: user.username, role: user.role } });
});

// --- QUIZ ROUTES ---

app.get('/api/quizzes', authenticateToken, (req, res) => {
    const quizzes = db.prepare('SELECT * FROM quizzes').all();
    const results = quizzes.map(q => {
        const questions = db.prepare('SELECT * FROM questions WHERE quizId = ?').all(q.id);
        return { ...q, questions: questions.map(qn => ({ ...qn, options: JSON.parse(qn.options) })) };
    });
    res.json(results);
});

app.post('/api/quizzes', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);

    const { id, title, description, timeLimit, questions } = req.body;
    
    const transaction = db.transaction(() => {
        db.prepare('INSERT OR REPLACE INTO quizzes (id, title, description, timeLimit, createdBy) VALUES (?, ?, ?, ?, ?)')
          .run(id, title, description, timeLimit, req.user.id);
        
        db.prepare('DELETE FROM questions WHERE quizId = ?').run(id);
        
        const insertQ = db.prepare('INSERT INTO questions (id, quizId, type, text, options, correctAnswer, points) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const q of questions) {
            insertQ.run(q.id, id, q.type, q.text, JSON.stringify(q.options), q.correctAnswer, q.points);
        }
    });

    try {
        transaction();
        res.status(201).json({ message: 'บันทึกควิซสำเร็จ' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/quizzes/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
    res.json({ message: 'ลบควิซสำเร็จ' });
});

// --- RESULT ROUTES ---

app.post('/api/results', authenticateToken, (req, res) => {
    const { quizId, quizName, score, maxScore, timeTaken, submittedAt, answers } = req.body;
    const stmt = db.prepare('INSERT INTO results (userId, quizId, quizName, score, maxScore, timeTaken, submittedAt, answers) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(req.user.id, quizId, quizName, score, maxScore, timeTaken, submittedAt, JSON.stringify(answers));
    res.status(201).json({ message: 'บันทึกคะแนนสำเร็จ' });
});

app.get('/api/results/my', authenticateToken, (req, res) => {
    const results = db.prepare('SELECT * FROM results WHERE userId = ? ORDER BY submittedAt DESC').all(req.user.id);
    res.json(results);
});

app.get('/api/results/all', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const results = db.prepare(`
        SELECT r.*, u.username, u.fullName 
        FROM results r 
        JOIN users u ON r.userId = u.id 
        ORDER BY r.submittedAt DESC
    `).all();
    res.json(results);
});

// Seed sample quiz if empty
const seed = () => {
    const count = db.prepare('SELECT COUNT(*) as count FROM quizzes').get().count;
    if (count === 0) {
        const id = 'sample-1';
        db.prepare('INSERT INTO quizzes (id, title, description, timeLimit) VALUES (?, ?, ?, ?)').run(
            id, "ควิซด้านความรู้เรื่องอาหารและการแช่ตู้เย็น", "ทดสอบความรู้พื้นฐานเกี่ยวกับการเก็บรักษาอาหารที่ถูกต้อง", 20
        );
        const questions = [
            { id: "q1", type: "mcq", text: "1. การแช่อาหารในตู้เย็นช่องธรรมดา (ประมาณ 4°C) ส่งผลต่อแบคทีเรียอย่างไร", options: ["ก. ฆ่าแบคทีเรียให้ตายทั้งหมด", "ข. ทำให้แบคทีเรียหยุดการเจริญเติบโตอย่างถาวร", "ค. ชะลอการเจริญเติบโตของแบคทีเรียเท่านั้น", "ง. ไม่มีผลใด ๆ ต่อแบคทีเรีย"], correctAnswer: "2", points: 1 },
            { id: "q2", type: "tf", text: "2. การวางเนื้อสัตว์ดิบไว้ชั้นบนสุดของตู้เย็นช่วยป้องกันการปนเปื้อนข้าม", options: ["ถูก", "ผิด"], correctAnswer: "1", points: 1 },
            { id: "q3", type: "subjective", text: "3. อุณหภูมิที่เหมาะสมสำหรับช่องแช่แข็งคือติดลบกี่องศาเซลเซียส (ตอบเป็นตัวเลข)", options: [], correctAnswer: "18", points: 1 },
            { id: "q4", type: "mcq", text: "4. การแช่อาหารในตู้เย็นจนแน่นเกินไปส่งผลอย่างไร", options: ["ก. ทำให้ตู้เย็นส่งเสียงดัง", "ข. ทำให้หาของยากและเสียเวลา", "ค. ขัดขวางการไหลเวียนลมเย็นทำให้อุณหภูมิไม่คงที่", "ง. ทำให้ค่าไฟลดลงเนื่องจากไม่มีที่ว่าง"], correctAnswer: "2", points: 1 },
            { id: "q5", type: "long_answer", text: "5. จงอธิบายวิธีการเก็บรักษาผักสดในตู้เย็นให้คงความสดได้นานที่สุด", options: [], correctAnswer: "", points: 1 }
        ];
        const insertQ = db.prepare('INSERT INTO questions (id, quizId, type, text, options, correctAnswer, points) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const q of questions) {
            insertQ.run(q.id, id, q.type, q.text, JSON.stringify(q.options), q.correctAnswer, q.points);
        }
    }
};
seed();

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
