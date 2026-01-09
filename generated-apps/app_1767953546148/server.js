const express = require('express');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3003', 10);

// 静态文件托管
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 默认路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务
app.listen(PORT, () => {
  console.log(`文本对比工具服务已启动: http://localhost:${PORT}`);
});