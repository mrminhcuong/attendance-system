const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

let client = null;

function getDb() {
    if (!client) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return {
        async get(sql, ...params) {
            const result = await client.execute({ sql, args: params });
            return result.rows.length > 0 ? result.rows[0] : undefined;
        },
        async all(sql, ...params) {
            const result = await client.execute({ sql, args: params });
            return result.rows;
        },
        async run(sql, ...params) {
            const result = await client.execute({ sql, args: params });
            return {
                changes: result.rowsAffected,
                lastInsertRowid: Number(result.lastInsertRowid)
            };
        },
        async exec(sql) {
            await client.executeMultiple(sql);
        }
    };
}

async function initDatabase() {
    client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    // Create tables
    await client.executeMultiple(`
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_code TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            class_name TEXT,
            email TEXT,
            phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_code TEXT UNIQUE NOT NULL,
            subject_name TEXT NOT NULL,
            credits INTEGER DEFAULT 3,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER REFERENCES subjects(id),
            session_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            qr_token TEXT UNIQUE NOT NULL,
            status TEXT DEFAULT 'active' CHECK(status IN ('active','closed')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER REFERENCES students(id),
            session_id INTEGER REFERENCES sessions(id),
            device_fingerprint TEXT,
            check_in_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'present' CHECK(status IN ('present','late','absent')),
            UNIQUE(student_id, session_id)
        );

        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_fingerprint TEXT NOT NULL UNIQUE,
            student_id INTEGER REFERENCES students(id),
            device_info TEXT,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const db = getDb();

    // Seed Admin
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'adminbp123!@#';
    const hash = bcrypt.hashSync(defaultPassword, 10);

    const checkAdmin = await db.get('SELECT * FROM admins WHERE username = ?', 'admin');
    if (!checkAdmin) {
        await db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', 'admin', hash);
    } else {
        await db.run('UPDATE admins SET password_hash = ? WHERE username = ?', hash, 'admin');
    }

    // Seed Subjects
    const checkSubjects = await db.get('SELECT COUNT(*) as count FROM subjects');
    if (checkSubjects.count === 0) {
        const subjects = [
            { code: 'IT001', name: 'Lập trình Web', credits: 3 },
            { code: 'IT002', name: 'Cơ sở dữ liệu', credits: 3 },
            { code: 'IT003', name: 'Mạng máy tính', credits: 3 },
            { code: 'IT004', name: 'Toán rời rạc', credits: 3 },
            { code: 'IT005', name: 'Trí tuệ nhân tạo', credits: 3 }
        ];
        for (const sub of subjects) {
            await db.run('INSERT INTO subjects (subject_code, subject_name, credits) VALUES (?, ?, ?)', sub.code, sub.name, sub.credits);
        }
    }

    console.log('✅ Database initialized successfully (Turso)');
}

module.exports = { initDatabase, getDb };
