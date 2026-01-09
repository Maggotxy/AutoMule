const express = require('express');
const path = require('path');

const app = express();
const PORT = 3002;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'JSON 格式化工具' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`JSON 格式化工具已启动: http://localhost:${PORT}`);
});