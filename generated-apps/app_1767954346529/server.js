const express = require('express');
const path = require('path');

const app = express();
const PORT = 3004;

// 托管静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`JSON格式化工具运行在 http://localhost:${PORT}`);
});