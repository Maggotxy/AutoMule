const express = require('express');
const path = require('path');
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// 静态文件托管
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'AI课程学习指南服务运行中' });
});

// 所有其他路由返回 index.html（SPA 支持）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AI课程学习指南服务已启动: http://localhost:${PORT}`);
});