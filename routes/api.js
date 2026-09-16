const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// POST /check-device
router.post('/check-device', (req, res) => {
    try {
        const db = getDb();
        const { deviceFingerprint } = req.body;
        if (!deviceFingerprint) {
            return res.status(400).json({ error: 'Thiếu thông tin thiết bị' });
        }

        const device = db.prepare(`
            SELECT d.*, s.student_code, s.full_name, s.class_name
            FROM devices d
            JOIN students s ON d.student_id = s.id
            WHERE d.device_fingerprint = ?
        `).get(deviceFingerprint);

        if (device) {
            db.prepare('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(device.id);
            return res.json({
                registered: true,
                student: {
                    id: device.student_id,
                    student_code: device.student_code,
                    full_name: device.full_name,
                    class_name: device.class_name
                }
            });
        }
        return res.json({ registered: false });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// POST /register-device
router.post('/register-device', (req, res) => {
    try {
        const db = getDb();
        const { deviceFingerprint, studentCode, full_name, email, deviceInfo } = req.body;
        if (!deviceFingerprint || !studentCode || !full_name) {
            return res.status(400).json({ error: 'Thiếu thông tin yêu cầu' });
        }

        let student = db.prepare('SELECT * FROM students WHERE student_code = ?').get(studentCode);
        
        // TỰ ĐỘNG THÊM SINH VIÊN MỚI NẾU CHƯA TỒN TẠI
        if (!student) {
            const result = db.prepare('INSERT INTO students (student_code, full_name, email) VALUES (?, ?, ?)')
                             .run(studentCode, full_name, email || null);
            student = {
                id: result.lastInsertRowid,
                student_code: studentCode,
                full_name: full_name,
                class_name: null
            };
        } else {
            // Cập nhật email nếu có và chưa có email
            if (email && !student.email) {
                db.prepare('UPDATE students SET email = ? WHERE id = ?').run(email, student.id);
            }
        }

        // CHỐNG ĐIỂM DANH HỘ: Kiểm tra xem sinh viên này đã đăng ký thiết bị nào chưa
        const studentDevice = db.prepare('SELECT device_fingerprint FROM devices WHERE student_id = ?').get(student.id);
        if (studentDevice && studentDevice.device_fingerprint !== deviceFingerprint) {
            return res.status(403).json({ error: 'Mã sinh viên này đã được đăng ký trên thiết bị khác' });
        }

        const existingDevice = db.prepare('SELECT id FROM devices WHERE device_fingerprint = ?').get(deviceFingerprint);
        
        const deviceInfoStr = deviceInfo ? JSON.stringify(deviceInfo) : null;
        
        if (existingDevice) {
            db.prepare('UPDATE devices SET student_id = ?, device_info = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?')
              .run(student.id, deviceInfoStr, existingDevice.id);
        } else {
            db.prepare('INSERT INTO devices (device_fingerprint, student_id, device_info) VALUES (?, ?, ?)')
              .run(deviceFingerprint, student.id, deviceInfoStr);
        }

        res.json({
            success: true,
            student: {
                id: student.id,
                student_code: student.student_code,
                full_name: student.full_name,
                class_name: student.class_name
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// POST /attendance/check-in
router.post('/attendance/check-in', (req, res) => {
    try {
        const db = getDb();
        const { deviceFingerprint, qrToken } = req.body;
        if (!deviceFingerprint || !qrToken) {
            return res.status(400).json({ error: 'Thiếu thông tin check-in' });
        }

        // Validate session
        const session = db.prepare(`
            SELECT s.*, sub.subject_name 
            FROM sessions s
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.qr_token = ?
        `).get(qrToken);

        if (!session) {
            return res.status(404).json({ error: 'Không tìm thấy buổi học' });
        }

        if (session.status !== 'active') {
            return res.status(400).json({ error: 'Buổi học đã đóng' });
        }
        
        const vnTime = new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"});
        const vnDateObj = new Date(vnTime);
        const today = `${vnDateObj.getFullYear()}-${String(vnDateObj.getMonth() + 1).padStart(2, '0')}-${String(vnDateObj.getDate()).padStart(2, '0')}`;
        
        if (session.session_date !== today) {
            return res.status(400).json({ error: 'Buổi học không diễn ra vào hôm nay' });
        }

        // Get student from device
        const device = db.prepare(`
            SELECT d.*, st.student_code, st.full_name, st.class_name
            FROM devices d
            JOIN students st ON d.student_id = st.id
            WHERE d.device_fingerprint = ?
        `).get(deviceFingerprint);

        if (!device) {
            return res.status(403).json({ error: 'Thiết bị chưa được đăng ký' });
        }

        // Check already checked in
        const existingAttendance = db.prepare('SELECT id FROM attendance WHERE student_id = ? AND session_id = ?')
            .get(device.student_id, session.id);

        if (existingAttendance) {
            return res.status(400).json({ error: 'Sinh viên đã điểm danh trong buổi học này' });
        }

        // Insert attendance
        db.prepare(`
            INSERT INTO attendance (student_id, session_id, device_fingerprint, status) 
            VALUES (?, ?, ?, 'present')
        `).run(device.student_id, session.id, deviceFingerprint);

        res.json({
            success: true,
            student: {
                student_code: device.student_code,
                full_name: device.full_name,
                class_name: device.class_name
            },
            checkInTime: new Date().toISOString()
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// GET /student/:code
router.get('/student/:code', (req, res) => {
    try {
        const db = getDb();
        const student = db.prepare('SELECT * FROM students WHERE student_code = ?').get(req.params.code);
        if (!student) {
            return res.status(404).json({ error: 'Không tìm thấy sinh viên' });
        }
        res.json(student);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

// GET /session/:token
router.get('/session/:token', (req, res) => {
    try {
        const db = getDb();
        const session = db.prepare(`
            SELECT s.*, sub.subject_name, sub.subject_code
            FROM sessions s
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.qr_token = ?
        `).get(req.params.token);
        
        if (!session) {
            return res.status(404).json({ error: 'Không tìm thấy buổi học' });
        }
        res.json(session);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

module.exports = router;
