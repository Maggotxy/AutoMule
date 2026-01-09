// 游戏状态
let gameState = {
  currentIdiom: '',
  lastCharacter: '',
  score: 0,
  chainCount: 0,
  isPlaying: false,
  history: []
};

// DOM 元素
const elements = {
  currentIdiom: document.getElementById('currentIdiom'),
  idiomInput: document.getElementById('idiomInput'),
  submitBtn: document.getElementById('submitBtn'),
  startBtn: document.getElementById('startBtn'),
  restartBtn: document.getElementById('restartBtn'),
  hintBtn: document.getElementById('hintBtn'),
  hintResult: document.getElementById('hintResult'),
  message: document.getElementById('message'),
  score: document.getElementById('score'),
  chainCount: document.getElementById('chainCount'),
  historyList: document.getElementById('historyList')
};

// 显示消息
function showMessage(text, type = 'info') {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`;
  
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      elements.message.className = 'message';
    }, 3000);
  }
}

// 更新UI
function updateUI() {
  elements.score.textContent = gameState.score;
  elements.chainCount.textContent = gameState.chainCount;
  elements.currentIdiom.textContent = gameState.currentIdiom || '点击开始游戏';
  
  // 更新历史记录
  elements.historyList.innerHTML = '';
  gameState.history.forEach((idiom, index) => {
    const item = document.createElement('span');
    item.className = 'history-item';
    item.textContent = idiom;
    elements.historyList.appendChild(item);
  });
}

// 开始游戏
async function startGame() {
  try {
    const response = await fetch('/api/idiom/random');
    const data = await response.json();
    
    gameState.currentIdiom = data.idiom;
    gameState.lastCharacter = data.idiom[3];
    gameState.score = 0;
    gameState.chainCount = 1;
    gameState.isPlaying = true;
    gameState.history = [data.idiom];
    
    elements.startBtn.style.display = 'none';
    elements.restartBtn.style.display = 'inline-block';
    elements.idiomInput.disabled = false;
    elements.submitBtn.disabled = false;
    elements.hintBtn.disabled = false;
    elements.idiomInput.value = '';
    elements.hintResult.innerHTML = '';
    
    updateUI();
    showMessage('游戏开始！请输入接龙成语', 'info');
    elements.idiomInput.focus();
  } catch (error) {
    showMessage('获取成语失败，请重试', 'error');
  }
}

// 验证成语
async function validateIdiom() {
  const idiom = elements.idiomInput.value.trim();
  
  if (!idiom) {
    showMessage('请输入成语', 'error');
    return;
  }
  
  if (!gameState.isPlaying) {
    showMessage('请先开始游戏', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/idiom/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        idiom: idiom,
        lastCharacter: gameState.lastCharacter
      })
    });
    
    const data = await response.json();
    
    if (data.valid) {
      // 更新游戏状态
      gameState.currentIdiom = idiom;
      gameState.lastCharacter = data.lastCharacter;
      gameState.score += 10;
      gameState.chainCount++;
      gameState.history.push(idiom);
      
      elements.idiomInput.value = '';
      elements.hintResult.innerHTML = '';
      
      updateUI();
      showMessage('正确！继续接龙', 'success');
      elements.idiomInput.focus();
    } else {
      showMessage(data.message, 'error');
    }
  } catch (error) {
    showMessage('验证失败，请重试', 'error');
  }
}

// 获取提示
async function getHint() {
  if (!gameState.isPlaying) {
    showMessage('请先开始游戏', 'error');
    return;
  }
  
  try {
    const response = await fetch(`/api/idiom/hint/${gameState.lastCharacter}`);
    const data = await response.json();
    
    if (data.hints.length > 0) {
      elements.hintResult.innerHTML = data.hints
        .map(hint => `<span class="hint-item">${hint}</span>`)
        .join('');
      showMessage('已显示提示', 'info');
    } else {
      showMessage('没有找到提示', 'error');
    }
  } catch (error) {
    showMessage('获取提示失败', 'error');
  }
}

// 重新开始
function restartGame() {
  gameState = {
    currentIdiom: '',
    lastCharacter: '',
    score: 0,
    chainCount: 0,
    isPlaying: false,
    history: []
  };
  
  elements.startBtn.style.display = 'inline-block';
  elements.restartBtn.style.display = 'none';
  elements.idiomInput.disabled = true;
  elements.submitBtn.disabled = true;
  elements.hintBtn.disabled = true;
  elements.idiomInput.value = '';
  elements.hintResult.innerHTML = '';
  
  updateUI();
  showMessage('游戏已重置', 'info');
}

// 事件监听
elements.startBtn.addEventListener('click', startGame);
elements.restartBtn.addEventListener('click', restartGame);
elements.submitBtn.addEventListener('click', validateIdiom);
elements.hintBtn.addEventListener('click', getHint);

elements.idiomInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    validateIdiom();
  }
});

// 初始化
elements.idiomInput.disabled = true;
elements.submitBtn.disabled = true;
elements.hintBtn.disabled = true;