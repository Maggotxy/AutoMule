const express = require('express');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3004', 10);

// 静态文件托管
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`像素电商服务运行在 http://localhost:${PORT}`);
});