// 像素牛马展示 - 交互逻辑

// 游戏状态
const gameState = {
  workTime: 0,
  fishCount: 0,
  currentLevel: 1,
  energy: 100,
  isWorking: false,
  workTimer: null
};

// DOM 元素
const elements = {
  workTime: document.getElementById('workTime'),
  fishCount: document.getElementById('fishCount'),
  currentLevel: document.getElementById('currentLevel'),
  energy: document.getElementById('energy'),
  messageBox: document.getElementById('messageBox'),
  btnWork: document.getElementById('btnWork'),
  btnFish: document.getElementById('btnFish'),
  btnRest: document.getElementById('btnRest'),
  btnLevelUp: document.getElementById('btnLevelUp')
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  // 加载保存的状态
  loadGameState();
  updateDisplay();

  // 绑定事件
  bindEvents();

  // 为像素卡片添加点击效果
  const cards = document.querySelectorAll('.pixel-card');
  cards.forEach(card => {
    card.addEventListener('click', function() {
      this.style.transform = 'scale(0.95)';
      setTimeout(() => {
        this.style.transform = '';
      }, 100);
    });
  });

  // 为等级项添加悬停效果
  const levelItems = document.querySelectorAll('.pixel-level-item');
  levelItems.forEach(item => {
    item.addEventListener('mouseenter', function() {
      this.style.borderColor = '#ff6b6b';
    });

    item.addEventListener('mouseleave', function() {
      this.style.borderColor = '#4ecdc4';
    });
  });

  // 为语录添加随机高亮效果
  const quotes = document.querySelectorAll('.pixel-quote');
  quotes.forEach(quote => {
    quote.addEventListener('click', function() {
      const colors = ['#ff6b6b', '#ffd93d', '#4ecdc4', '#a8dadc'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      this.style.borderLeftColor = randomColor;
      this.style.backgroundColor = '#2d2d44';

      setTimeout(() => {
        this.style.borderLeftColor = '#ff6b6b';
        this.style.backgroundColor = '#22223b';
      }, 500);
    });
  });

  // 控制台欢迎信息
  console.log('%c🐮🐴 像素牛马展示已加载', 'color: #ff6b6b; font-size: 20px; font-weight: bold;');
  console.log('%c致敬每一位努力工作的打工人！', 'color: #4ecdc4; font-size: 14px;');
});

// 绑定事件
function bindEvents() {
  elements.btnWork.addEventListener('click', toggleWork);
  elements.btnFish.addEventListener('click', fish);
  elements.btnRest.addEventListener('click', rest);
  elements.btnLevelUp.addEventListener('click', levelUp);
}

// 切换工作状态
function toggleWork() {
  if (gameState.isWorking) {
    stopWork();
  } else {
    startWork();
  }
}

// 开始工作
function startWork() {
  if (gameState.energy < 10) {
    showMessage('精力不足，先休息一下吧！☕');
    return;
  }

  gameState.isWorking = true;
  elements.btnWork.querySelector('.pixel-btn-text').textContent = '停止工作';
  elements.btnWork.classList.add('pixel-pulse');
  showMessage('开始工作！加油牛马！💪');

  gameState.workTimer = setInterval(() => {
    gameState.workTime++;
    gameState.energy = Math.max(0, gameState.energy - 0.5);
    updateDisplay();
    saveGameState();
  }, 1000);
}

// 停止工作
function stopWork() {
  gameState.isWorking = false;
  elements.btnWork.querySelector('.pixel-btn-text').textContent = '开始工作';
  elements.btnWork.classList.remove('pixel-pulse');
  showMessage('工作暂停，休息一下吧！😊');

  if (gameState.workTimer) {
    clearInterval(gameState.workTimer);
    gameState.workTimer = null;
  }
}

// 摸鱼
function fish() {
  if (gameState.isWorking) {
    showMessage('正在工作中，不能摸鱼！🚫');
    return;
  }

  gameState.fishCount++;
  gameState.energy = Math.min(100, gameState.energy + 5);
  showMessage('摸鱼成功！精力+5 🐟');
  updateDisplay();
  saveGameState();

  // 添加动画效果
  elements.btnFish.classList.add('pixel-bounce');
  setTimeout(() => {
    elements.btnFish.classList.remove('pixel-bounce');
  }, 300);
}

// 休息
function rest() {
  if (gameState.isWorking) {
    stopWork();
  }

  gameState.energy = Math.min(100, gameState.energy + 20);
  showMessage('休息完毕，精力+20！☕');
  updateDisplay();
  saveGameState();

  // 添加动画效果
  elements.btnRest.classList.add('pixel-bounce');
  setTimeout(() => {
    elements.btnRest.classList.remove('pixel-bounce');
  }, 300);
}

// 升级
function levelUp() {
  const requiredTime = gameState.currentLevel * 3600; // 每级需要的工作时长（秒）

  if (gameState.workTime < requiredTime) {
    const remaining = Math.ceil((requiredTime - gameState.workTime) / 60);
    showMessage(`工作时长不足！还需要 ${remaining} 分钟才能升级 ⏱️`);
    return;
  }

  if (gameState.currentLevel >= 4) {
    showMessage('已经是最高等级了！你是传说牛马！🏆');
    return;
  }

  gameState.currentLevel++;
  showMessage(`恭喜升级！现在是 LV.${gameState.currentLevel}！🎉`);
  updateDisplay();
  saveGameState();

  // 添加动画效果
  elements.btnLevelUp.classList.add('pixel-bounce');
  setTimeout(() => {
    elements.btnLevelUp.classList.remove('pixel-bounce');
  }, 300);

  // 闪烁效果
  elements.currentLevel.classList.add('pixel-flash');
  setTimeout(() => {
    elements.currentLevel.classList.remove('pixel-flash');
  }, 300);
}

// 更新显示
function updateDisplay() {
  // 更新工时
  const hours = Math.floor(gameState.workTime / 3600);
  const minutes = Math.floor((gameState.workTime % 3600) / 60);
  const seconds = gameState.workTime % 60;
  elements.workTime.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // 更新摸鱼次数
  elements.fishCount.textContent = gameState.fishCount;

  // 更新等级
  elements.currentLevel.textContent = `LV.${gameState.currentLevel}`;

  // 更新精力
  elements.energy.textContent = `${Math.floor(gameState.energy)}%`;
  if (gameState.energy < 20) {
    elements.energy.style.color = '#ff6b6b';
  } else if (gameState.energy < 50) {
    elements.energy.style.color = '#ffd93d';
  } else {
    elements.energy.style.color = '#4ecdc4';
  }
}

// 显示消息
function showMessage(message) {
  elements.messageBox.textContent = message;
  elements.messageBox.classList.add('pixel-flash');
  setTimeout(() => {
    elements.messageBox.classList.remove('pixel-flash');
  }, 300);
}

// 保存游戏状态
function saveGameState() {
  localStorage.setItem('pixelNiumaState', JSON.stringify(gameState));
}

// 加载游戏状态
function loadGameState() {
  const saved = localStorage.getItem('pixelNiumaState');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      Object.assign(gameState, parsed);
      // 重置工作状态
      gameState.isWorking = false;
      gameState.workTimer = null;
    } catch (e) {
      console.error('加载状态失败', e);
    }
  }
}

// 导出供外部调用
window.pixelNiuma = {
  showMessage: function(message) {
    showMessage(message);
  },
  getState: function() {
    return { ...gameState };
  }
};