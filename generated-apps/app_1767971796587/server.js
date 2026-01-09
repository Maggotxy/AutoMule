const express = require('express');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: '像素校园外卖' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`像素校园外卖服务运行中: http://localhost:${PORT}`);
});