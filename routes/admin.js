const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

// Auth Middleware
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Không có quyền truy cập' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
    }
};

// POST /login
router.post('/login', (req, res) => {
    try {
        const db = getDb();
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập tài khoản và mật khẩu' });
        }

        const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
        if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
            return res.status(401).json({ error: 'Tài khoản hoặc mật khẩu không đúng' });
        }

        const token = jwt.sign({ id: admin.id, username: admin.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// Apply auth middleware for all routes below
router.use(authMiddleware);

// GET /dashboard
router.get('/dashboard', (req, res) => {
    try {
        const db = getDb();
        const today = new Date().toISOString().split('T')[0];
        
        const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
        const totalSubjects = db.prepare('SELECT COUNT(*) as count FROM subjects').get().count;
        const todaySessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE session_date = ?').get(today).count;
        const todayAttendance = db.prepare(`
            SELECT COUNT(*) as count 
            FROM attendance a
            JOIN sessions s ON a.session_id = s.id
            WHERE s.session_date = ?
        `).get(today).count;

        const recentAttendance = db.prepare(`
            SELECT a.check_in_time, a.status, st.full_name, st.student_code, sub.subject_name
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            JOIN sessions s ON a.session_id = s.id
            JOIN subjects sub ON s.subject_id = sub.id
            ORDER BY a.check_in_time DESC
            LIMIT 10
        `).all();

        res.json({
            stats: { totalStudents, totalSubjects, todaySessions, todayAttendance },
            recentAttendance
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// CRUD /students
router.get('/students', (req, res) => {
    try {
        const db = getDb();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search;

        let query = 'SELECT * FROM students';
        let countQuery = 'SELECT COUNT(*) as count FROM students';
        let params = [];

        if (search) {
            query += ' WHERE student_code LIKE ? OR full_name LIKE ?';
            countQuery += ' WHERE student_code LIKE ? OR full_name LIKE ?';
            params = [`%${search}%`, `%${search}%`];
        }

        const total = db.prepare(countQuery).get(...params).count;

        query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        const students = db.prepare(query).all(...params, limit, offset);

        res.json({ students, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.post('/students', (req, res) => {
    try {
        const db = getDb();
        const { student_code, full_name, class_name, email, phone } = req.body;
        const result = db.prepare(`
            INSERT INTO students (student_code, full_name, class_name, email, phone) 
            VALUES (?, ?, ?, ?, ?)
        `).run(student_code, full_name, class_name, email, phone);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        if (error.message && error.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Mã sinh viên đã tồn tại' });
        }
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.get('/students/:id', (req, res) => {
    try {
        const db = getDb();
        const student = db.prepare('SELECT * FROM students WHERE id = ?').get(parseInt(req.params.id));
        if (!student) return res.status(404).json({ error: 'Không tìm thấy sinh viên' });

        const attendance = db.prepare(`
            SELECT a.*, s.session_date, sub.subject_name
            FROM attendance a
            JOIN sessions s ON a.session_id = s.id
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE a.student_id = ?
            ORDER BY s.session_date DESC
        `).all(parseInt(req.params.id));

        res.json({ ...student, attendanceHistory: attendance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.put('/students/:id', (req, res) => {
    try {
        const db = getDb();
        const { full_name, class_name, email, phone } = req.body;
        db.prepare(`
            UPDATE students SET full_name = ?, class_name = ?, email = ?, phone = ? WHERE id = ?
        `).run(full_name, class_name, email, phone, parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.delete('/students/:id', (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id);
        db.prepare('DELETE FROM devices WHERE student_id = ?').run(id);
        db.prepare('DELETE FROM attendance WHERE student_id = ?').run(id);
        db.prepare('DELETE FROM students WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.post('/students/import', (req, res) => {
    try {
        const db = getDb();
        const { students } = req.body;
        if (!Array.isArray(students)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });

        let count = 0;
        for (const s of students) {
            try {
                db.prepare(`
                    INSERT INTO students (student_code, full_name, class_name, email, phone) 
                    VALUES (?, ?, ?, ?, ?)
                `).run(s.student_code, s.full_name, s.class_name || '', s.email || '', s.phone || '');
                count++;
            } catch (e) {
                // Skip duplicates
            }
        }

        res.json({ success: true, insertedCount: count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// CRUD /subjects
router.get('/subjects', (req, res) => {
    try {
        const db = getDb();
        const subjects = db.prepare('SELECT * FROM subjects').all();
        res.json(subjects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.post('/subjects', (req, res) => {
    try {
        const db = getDb();
        const { subject_code, subject_name, credits } = req.body;
        const result = db.prepare(`
            INSERT INTO subjects (subject_code, subject_name, credits) VALUES (?, ?, ?)
        `).run(subject_code, subject_name, credits || 3);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.put('/subjects/:id', (req, res) => {
    try {
        const db = getDb();
        const { subject_code, subject_name, credits } = req.body;
        db.prepare(`
            UPDATE subjects SET subject_code = ?, subject_name = ?, credits = ? WHERE id = ?
        `).run(subject_code, subject_name, credits, parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.delete('/subjects/:id', (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id);
        const sessions = db.prepare('SELECT id FROM sessions WHERE subject_id = ?').all(id);
        for (const s of sessions) {
            db.prepare('DELETE FROM attendance WHERE session_id = ?').run(s.id);
        }
        db.prepare('DELETE FROM sessions WHERE subject_id = ?').run(id);
        db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// Sessions
router.get('/sessions', (req, res) => {
    try {
        const db = getDb();
        const { subject_id, date } = req.query;
        let query = `
            SELECT s.*, sub.subject_name, sub.subject_code,
                   (SELECT COUNT(*) FROM attendance WHERE session_id = s.id) as attendance_count
            FROM sessions s
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE 1=1
        `;
        const params = [];
        if (subject_id) { query += ' AND s.subject_id = ?'; params.push(parseInt(subject_id)); }
        if (date) { query += ' AND s.session_date = ?'; params.push(date); }
        query += ' ORDER BY s.session_date DESC, s.start_time DESC';

        const sessions = db.prepare(query).all(...params);
        res.json(sessions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.post('/sessions', (req, res) => {
    try {
        const db = getDb();
        const { subject_id, session_date, start_time, end_time } = req.body;
        const qr_token = uuidv4();
        const result = db.prepare(`
            INSERT INTO sessions (subject_id, session_date, start_time, end_time, qr_token) 
            VALUES (?, ?, ?, ?, ?)
        `).run(parseInt(subject_id), session_date, start_time, end_time, qr_token);
        res.json({ id: result.lastInsertRowid, qr_token, success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.get('/sessions/:id', (req, res) => {
    try {
        const db = getDb();
        const session = db.prepare(`
            SELECT s.*, sub.subject_name, sub.subject_code
            FROM sessions s
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.id = ?
        `).get(parseInt(req.params.id));

        if (!session) return res.status(404).json({ error: 'Không tìm thấy buổi học' });

        const attendance = db.prepare(`
            SELECT a.*, st.student_code, st.full_name
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            WHERE a.session_id = ?
        `).all(session.id);

        res.json({ ...session, attendance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.put('/sessions/:id/close', (req, res) => {
    try {
        const db = getDb();
        db.prepare("UPDATE sessions SET status = 'closed' WHERE id = ?").run(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.delete('/sessions/:id', (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id);
        db.prepare('DELETE FROM attendance WHERE session_id = ?').run(id);
        db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.get('/sessions/:id/qr', async (req, res) => {
    try {
        const db = getDb();
        const session = db.prepare('SELECT id, qr_token FROM sessions WHERE id = ?').get(parseInt(req.params.id));
        if (!session) return res.status(404).json({ error: 'Không tìm thấy buổi học' });

        const qrData = JSON.stringify({ token: session.qr_token, session_id: session.id });
        const qrCode = await QRCode.toDataURL(qrData, { width: 400, margin: 2 });

        res.json({ qrCode, session });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// Attendance
router.get('/attendance', (req, res) => {
    try {
        const db = getDb();
        const { session_id, subject_id, date, student_id } = req.query;
        let query = `
            SELECT a.*, st.student_code, st.full_name, st.class_name, 
                   s.session_date, sub.subject_name
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            JOIN sessions s ON a.session_id = s.id
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE 1=1
        `;
        const params = [];
        if (session_id) { query += ' AND a.session_id = ?'; params.push(parseInt(session_id)); }
        if (subject_id) { query += ' AND s.subject_id = ?'; params.push(parseInt(subject_id)); }
        if (date) { query += ' AND s.session_date = ?'; params.push(date); }
        if (student_id) { query += ' AND a.student_id = ?'; params.push(parseInt(student_id)); }

        query += ' ORDER BY a.check_in_time DESC';
        const records = db.prepare(query).all(...params);
        res.json(records);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.get('/attendance/export', (req, res) => {
    try {
        const db = getDb();
        const { session_id, subject_id, date, student_id } = req.query;
        let query = `
            SELECT st.student_code, st.full_name, st.class_name, 
                   sub.subject_name, s.session_date, a.check_in_time, a.status
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            JOIN sessions s ON a.session_id = s.id
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE 1=1
        `;
        const params = [];
        if (session_id) { query += ' AND a.session_id = ?'; params.push(parseInt(session_id)); }
        if (subject_id) { query += ' AND s.subject_id = ?'; params.push(parseInt(subject_id)); }
        if (date) { query += ' AND s.session_date = ?'; params.push(date); }
        if (student_id) { query += ' AND a.student_id = ?'; params.push(parseInt(student_id)); }

        const records = db.prepare(query).all(...params);
        
        let csv = 'Mã SV,Họ tên,Lớp,Môn học,Ngày học,Thời gian điểm danh,Trạng thái\n';
        for (const r of records) {
            csv += `"${r.student_code}","${r.full_name}","${r.class_name || ''}","${r.subject_name}","${r.session_date}","${r.check_in_time}","${r.status}"\n`;
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
        res.send('\uFEFF' + csv); // BOM for Excel
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.get('/attendance/report', (req, res) => {
    try {
        const db = getDb();
        const { subject_id } = req.query;
        if (!subject_id) return res.status(400).json({ error: 'Thiếu mã môn học' });

        const report = db.prepare(`
            SELECT st.student_code, st.full_name, st.class_name,
                   SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
                   SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_count,
                   SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            JOIN sessions s ON a.session_id = s.id
            WHERE s.subject_id = ?
            GROUP BY st.id
        `).all(parseInt(subject_id));

        res.json(report);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

module.exports = router;
