const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// 静态文件托管
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Gradient Palette Generator is running' });
});

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gradient Palette Generator is running at http://localhost:${PORT}`);
});