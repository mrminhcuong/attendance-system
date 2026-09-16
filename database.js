const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'attendance.db');

// Wrapper class to mimic better-sqlite3 API using sql.js
class DatabaseWrapper {
    constructor(sqlDb) {
        this.db = sqlDb;
        this.dbPath = dbPath;
    }

    // Save database to file
    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }

    // Execute raw SQL (no return)
    exec(sql) {
        this.db.run(sql);
        this.save();
    }

    // Prepare a statement - returns a statement-like object
    prepare(sql) {
        const self = this;
        return {
            // Get single row
            get(...params) {
                const stmt = self.db.prepare(sql);
                stmt.bind(params.length > 0 ? params : undefined);
                if (stmt.step()) {
                    const row = stmt.getAsObject();
                    stmt.free();
                    return row;
                }
                stmt.free();
                return undefined;
            },
            // Get all rows
            all(...params) {
                const results = [];
                const stmt = self.db.prepare(sql);
                stmt.bind(params.length > 0 ? params : undefined);
                while (stmt.step()) {
                    results.push(stmt.getAsObject());
                }
                stmt.free();
                return results;
            },
            // Run (insert/update/delete)
            run(...params) {
                self.db.run(sql, params);
                self.save();
                return {
                    changes: self.db.getRowsModified(),
                    lastInsertRowid: getLastInsertRowId(self.db)
                };
            }
        };
    }

    // Transaction support
    transaction(fn) {
        const self = this;
        return function (...args) {
            self.db.run('BEGIN TRANSACTION');
            try {
                const result = fn(...args);
                self.db.run('COMMIT');
                self.save();
                return result;
            } catch (e) {
                self.db.run('ROLLBACK');
                throw e;
            }
        };
    }

    // Run raw SQL with params (used inside transactions)
    run(sql, params = []) {
        this.db.run(sql, params);
    }

    close() {
        this.save();
        this.db.close();
    }
}

function getLastInsertRowId(db) {
    const stmt = db.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result.id;
}

// Global db instance
let dbWrapper = null;

async function initDatabase() {
    const SQL = await initSqlJs();

    let sqlDb;
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        sqlDb = new SQL.Database(fileBuffer);
    } else {
        sqlDb = new SQL.Database();
    }

    dbWrapper = new DatabaseWrapper(sqlDb);

    // Enable WAL mode for better performance
    dbWrapper.db.run('PRAGMA journal_mode=WAL');

    // Create tables
    dbWrapper.db.run(`
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_code TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            class_name TEXT,
            email TEXT,
            phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    dbWrapper.db.run(`
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_code TEXT UNIQUE NOT NULL,
            subject_name TEXT NOT NULL,
            credits INTEGER DEFAULT 3,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    dbWrapper.db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER REFERENCES subjects(id),
            session_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            qr_token TEXT UNIQUE NOT NULL,
            status TEXT DEFAULT 'active' CHECK(status IN ('active','closed')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    dbWrapper.db.run(`
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER REFERENCES students(id),
            session_id INTEGER REFERENCES sessions(id),
            device_fingerprint TEXT,
            check_in_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'present' CHECK(status IN ('present','late','absent')),
            UNIQUE(student_id, session_id)
        )
    `);

    dbWrapper.db.run(`
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_fingerprint TEXT NOT NULL UNIQUE,
            student_id INTEGER REFERENCES students(id),
            device_info TEXT,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    dbWrapper.db.run(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Seed Admin
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'adminbp123!@#';
    const hash = bcrypt.hashSync(defaultPassword, 10);
    
    const checkAdmin = dbWrapper.prepare('SELECT * FROM admins WHERE username = ?').get('admin');
    if (!checkAdmin) {
        dbWrapper.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('admin', hash);
    } else {
        dbWrapper.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(hash, 'admin');
    }

    // Seed Subjects
    const checkSubjects = dbWrapper.prepare('SELECT COUNT(*) as count FROM subjects').get();
    if (checkSubjects.count === 0) {
        const subjects = [
            { code: 'IT001', name: 'Lập trình Web', credits: 3 },
            { code: 'IT002', name: 'Cơ sở dữ liệu', credits: 3 },
            { code: 'IT003', name: 'Mạng máy tính', credits: 3 },
            { code: 'IT004', name: 'Toán rời rạc', credits: 3 },
            { code: 'IT005', name: 'Trí tuệ nhân tạo', credits: 3 }
        ];
        for (const sub of subjects) {
            dbWrapper.prepare('INSERT INTO subjects (subject_code, subject_name, credits) VALUES (?, ?, ?)').run(sub.code, sub.name, sub.credits);
        }
    }

    dbWrapper.save();
    console.log('✅ Database initialized successfully');
    return dbWrapper;
}

// Export init function and a getter for the db
module.exports = { initDatabase, getDb: () => dbWrapper };
