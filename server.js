require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Initialize database then start server
async function startServer() {
    try {
        await initDatabase();
        
        const apiRoutes = require('./routes/api');
        const adminRoutes = require('./routes/admin');
        
        app.use('/api', apiRoutes);
        app.use('/api/admin', adminRoutes);
        
        app.listen(PORT, () => {
            console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
            console.log(`📱 Trang điểm danh: http://localhost:${PORT}/scan.html`);
            console.log(`🔧 Trang quản trị: http://localhost:${PORT}/admin/login.html`);
            console.log(`   Tài khoản: admin / adminbp123!@#`);
        });
    } catch (error) {
        console.error('❌ Lỗi khởi động server:', error);
        process.exit(1);
    }
}

startServer();
