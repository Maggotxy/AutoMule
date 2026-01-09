const express = require('express');
const path = require('path');

const app = express();
const PORT = 3003;

// 静态文件托管
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: '像素牛马展示' });
});

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`像素牛马展示服务运行在 http://localhost:${PORT}`);
});