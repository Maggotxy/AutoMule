const express = require('express');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3005', 10);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '随机电影推荐器运行中' });
});

app.listen(PORT, () => {
  console.log(`随机电影推荐器已启动：http://localhost:${PORT}`);
});