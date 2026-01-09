const express = require('express');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// 静态文件托管
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '记忆翻牌游戏服务运行中' });
});

// 默认路由返回 index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`记忆翻牌游戏运行在 http://localhost:${PORT}`);
});