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
router.post('/login', async (req, res) => {
    try {
        const db = getDb();
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập tài khoản và mật khẩu' });
        }

        const admin = await db.get('SELECT * FROM admins WHERE username = ?', username);
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
router.get('/dashboard', async (req, res) => {
    try {
        const db = getDb();
        const vnTime = new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"});
        const vnDateObj = new Date(vnTime);
        const today = `${vnDateObj.getFullYear()}-${String(vnDateObj.getMonth() + 1).padStart(2, '0')}-${String(vnDateObj.getDate()).padStart(2, '0')}`;
        
        const totalStudents = (await db.get('SELECT COUNT(*) as count FROM students')).count;
        const totalSubjects = (await db.get('SELECT COUNT(*) as count FROM subjects')).count;
        const todaySessions = (await db.get('SELECT COUNT(*) as count FROM sessions WHERE session_date = ?', today)).count;
        const todayAttendance = (await db.get(`
            SELECT COUNT(*) as count 
            FROM attendance a
            JOIN sessions s ON a.session_id = s.id
            WHERE s.session_date = ?
        `, today)).count;

        const recentAttendance = await db.all(`
            SELECT a.check_in_time, a.status, st.full_name, st.student_code, sub.subject_name
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            JOIN sessions s ON a.session_id = s.id
            JOIN subjects sub ON s.subject_id = sub.id
            ORDER BY a.check_in_time DESC
            LIMIT 10
        `);

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
router.get('/students', async (req, res) => {
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

        const total = (await db.get(countQuery, ...params)).count;

        query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        const students = await db.all(query, ...params, limit, offset);

        res.json({ students, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.post('/students', async (req, res) => {
    try {
        const db = getDb();
        const { student_code, full_name, class_name, email, phone } = req.body;
        const result = await db.run(`
            INSERT INTO students (student_code, full_name, class_name, email, phone) 
            VALUES (?, ?, ?, ?, ?)
        `, student_code, full_name, class_name, email, phone);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        if (error.message && error.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Mã sinh viên đã tồn tại' });
        }
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.get('/students/:id', async (req, res) => {
    try {
        const db = getDb();
        const student = await db.get('SELECT * FROM students WHERE id = ?', parseInt(req.params.id));
        if (!student) return res.status(404).json({ error: 'Không tìm thấy sinh viên' });

        const attendance = await db.all(`
            SELECT a.*, s.session_date, sub.subject_name
            FROM attendance a
            JOIN sessions s ON a.session_id = s.id
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE a.student_id = ?
            ORDER BY s.session_date DESC
        `, parseInt(req.params.id));

        res.json({ ...student, attendanceHistory: attendance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.put('/students/:id', async (req, res) => {
    try {
        const db = getDb();
        const { full_name, class_name, email, phone } = req.body;
        await db.run(`
            UPDATE students SET full_name = ?, class_name = ?, email = ?, phone = ? WHERE id = ?
        `, full_name, class_name, email, phone, parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.delete('/students/:id', async (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id);
        await db.run('DELETE FROM devices WHERE student_id = ?', id);
        await db.run('DELETE FROM attendance WHERE student_id = ?', id);
        await db.run('DELETE FROM students WHERE id = ?', id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.post('/students/import', async (req, res) => {
    try {
        const db = getDb();
        const { students } = req.body;
        if (!Array.isArray(students)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });

        let count = 0;
        for (const s of students) {
            try {
                await db.run(`
                    INSERT INTO students (student_code, full_name, class_name, email, phone) 
                    VALUES (?, ?, ?, ?, ?)
                `, s.student_code, s.full_name, s.class_name || '', s.email || '', s.phone || '');
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
router.get('/subjects', async (req, res) => {
    try {
        const db = getDb();
        const subjects = await db.all('SELECT * FROM subjects');
        res.json(subjects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.post('/subjects', async (req, res) => {
    try {
        const db = getDb();
        const { subject_code, subject_name, credits } = req.body;
        const result = await db.run(`
            INSERT INTO subjects (subject_code, subject_name, credits) VALUES (?, ?, ?)
        `, subject_code, subject_name, credits || 3);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.put('/subjects/:id', async (req, res) => {
    try {
        const db = getDb();
        const { subject_code, subject_name, credits } = req.body;
        await db.run(`
            UPDATE subjects SET subject_code = ?, subject_name = ?, credits = ? WHERE id = ?
        `, subject_code, subject_name, credits, parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.delete('/subjects/:id', async (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id);
        const sessions = await db.all('SELECT id FROM sessions WHERE subject_id = ?', id);
        for (const s of sessions) {
            await db.run('DELETE FROM attendance WHERE session_id = ?', s.id);
        }
        await db.run('DELETE FROM sessions WHERE subject_id = ?', id);
        await db.run('DELETE FROM subjects WHERE id = ?', id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// Sessions
router.get('/sessions', async (req, res) => {
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

        const sessions = await db.all(query, ...params);
        res.json(sessions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.post('/sessions', async (req, res) => {
    try {
        const db = getDb();
        const { subject_id, session_date, start_time, end_time } = req.body;
        const qr_token = uuidv4();
        const result = await db.run(`
            INSERT INTO sessions (subject_id, session_date, start_time, end_time, qr_token) 
            VALUES (?, ?, ?, ?, ?)
        `, parseInt(subject_id), session_date, start_time, end_time, qr_token);
        res.json({ id: result.lastInsertRowid, qr_token, success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.get('/sessions/:id', async (req, res) => {
    try {
        const db = getDb();
        const session = await db.get(`
            SELECT s.*, sub.subject_name, sub.subject_code
            FROM sessions s
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.id = ?
        `, parseInt(req.params.id));

        if (!session) return res.status(404).json({ error: 'Không tìm thấy buổi học' });

        const attendance = await db.all(`
            SELECT a.*, st.student_code, st.full_name
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            WHERE a.session_id = ?
        `, session.id);

        res.json({ ...session, attendance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.put('/sessions/:id/close', async (req, res) => {
    try {
        const db = getDb();
        await db.run("UPDATE sessions SET status = 'closed' WHERE id = ?", parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.delete('/sessions/:id', async (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id);
        await db.run('DELETE FROM attendance WHERE session_id = ?', id);
        await db.run('DELETE FROM sessions WHERE id = ?', id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.get('/sessions/:id/qr', async (req, res) => {
    try {
        const db = getDb();
        const session = await db.get('SELECT id, qr_token FROM sessions WHERE id = ?', parseInt(req.params.id));
        if (!session) return res.status(404).json({ error: 'Không tìm thấy buổi học' });

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['host'];
        const fullUrl = `${protocol}://${host}/scan.html?token=${session.qr_token}`;
        
        const qrCode = await QRCode.toDataURL(fullUrl, { width: 400, margin: 2 });

        res.json({ qrCode, session });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// Attendance
router.get('/attendance', async (req, res) => {
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
        const records = await db.all(query, ...params);
        res.json(records);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

router.get('/attendance/export', async (req, res) => {
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

        const records = await db.all(query, ...params);
        
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

router.get('/attendance/report', async (req, res) => {
    try {
        const db = getDb();
        const { subject_id } = req.query;
        if (!subject_id) return res.status(400).json({ error: 'Thiếu mã môn học' });

        const report = await db.all(`
            SELECT st.student_code, st.full_name, st.class_name,
                   SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
                   SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_count,
                   SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            JOIN sessions s ON a.session_id = s.id
            WHERE s.subject_id = ?
            GROUP BY st.id
        `, parseInt(subject_id));

        res.json(report);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

module.exports = router;
