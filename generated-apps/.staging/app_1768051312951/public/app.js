// 数据存储
let tasks = JSON.parse(localStorage.getItem('qualityTasks')) || [];
let currentFilter = 'all';
let qualityChart = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  renderTasks();
  updateStats();
  initQualityChart();
  setupEventListeners();
});

// 设置事件监听
function setupEventListeners() {
  document.getElementById('taskForm').addEventListener('submit', addTask);
  
  // 质量评分按钮
  document.querySelectorAll('#qualityRating .btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rating = parseInt(e.currentTarget.dataset.rating);
      document.getElementById('actualQuality').value = rating;
      updateQualityRatingUI(rating);
    });
  });
}

// 更新质量评分UI
function updateQualityRatingUI(rating) {
  document.querySelectorAll('#qualityRating .btn').forEach(btn => {
    const btnRating = parseInt(btn.dataset.rating);
    if (btnRating <= rating) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// 添加任务
function addTask(e) {
  e.preventDefault();
  
  const task = {
    id: Date.now(),
    name: document.getElementById('taskName').value.trim(),
    category: document.getElementById('taskCategory').value,
    priority: document.getElementById('taskPriority').value,
    expectedQuality: parseInt(document.getElementById('taskQuality').value),
    actualQuality: null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    completedAt: null,
    notes: ''
  };
  
  tasks.unshift(task);
  saveTasks();
  renderTasks();
  updateStats();
  updateQualityChart();
  
  document.getElementById('taskForm').reset();
  document.getElementById('taskQuality').value = '4';
}

// 保存任务
function saveTasks() {
  localStorage.setItem('qualityTasks', JSON.stringify(tasks));
}

// 渲染任务列表
function renderTasks() {
  const taskList = document.getElementById('taskList');
  const emptyState = document.getElementById('emptyState');
  
  let filteredTasks = tasks;
  if (currentFilter === 'pending') {
    filteredTasks = tasks.filter(t => t.status === 'pending');
  } else if (currentFilter === 'completed') {
    filteredTasks = tasks.filter(t => t.status === 'completed');
  }
  
  if (filteredTasks.length === 0) {
    taskList.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  taskList.innerHTML = filteredTasks.map(task => createTaskHTML(task)).join('');
}

// 创建任务HTML
function createTaskHTML(task) {
  const priorityLabels = { high: '高', medium: '中', low: '低' };
  const isCompleted = task.status === 'completed';
  
  return `
    <div class="task-item ${isCompleted ? 'completed' : ''}" data-id="${task.id}">
      <div class="task-header">
        <h6 class="task-title">${escapeHtml(task.name)}</h6>
        <div class="task-actions">
          ${!isCompleted ? `
            <button class="btn btn-success btn-sm" onclick="openCompleteModal(${task.id})">
              <i class="bi bi-check-lg"></i> 完成
            </button>
          ` : ''}
          <button class="btn btn-outline-danger btn-sm" onclick="deleteTask(${task.id})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      <div class="task-meta">
        <span class="task-badge category">${task.category}</span>
        <span class="task-badge priority-${task.priority}">${priorityLabels[task.priority]}优先级</span>
        ${isCompleted ? `
          <span class="task-badge quality">质量: ${task.actualQuality}/5</span>
        ` : `
          <span class="task-badge quality">预期: ${task.expectedQuality}/5</span>
        `}
        <span><i class="bi bi-clock"></i> ${formatDate(task.createdAt)}</span>
      </div>
      ${task.notes ? `<div class="mt-2 text-muted small"><i class="bi bi-chat-quote"></i> ${escapeHtml(task.notes)}</div>` : ''}
    </div>
  `;
}

// 打开完成模态框
function openCompleteModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  document.getElementById('completeTaskId').value = taskId;
  document.getElementById('completeNotes').value = '';
  document.getElementById('actualQuality').value = task.expectedQuality;
  updateQualityRatingUI(task.expectedQuality);
  
  const modal = new bootstrap.Modal(document.getElementById('completeModal'));
  modal.show();
}

// 确认完成
function confirmComplete() {
  const taskId = parseInt(document.getElementById('completeTaskId').value);
  const actualQuality = parseInt(document.getElementById('actualQuality').value);
  const notes = document.getElementById('completeNotes').value.trim();
  
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;
  
  tasks[taskIndex].status = 'completed';
  tasks[taskIndex].actualQuality = actualQuality;
  tasks[taskIndex].completedAt = new Date().toISOString();
  tasks[taskIndex].notes = notes;
  
  saveTasks();
  renderTasks();
  updateStats();
  updateQualityChart();
  
  bootstrap.Modal.getInstance(document.getElementById('completeModal')).hide();
}

// 删除任务
function deleteTask(taskId) {
  if (!confirm('确定要删除这个任务吗？')) return;
  
  tasks = tasks.filter(t => t.id !== taskId);
  saveTasks();
  renderTasks();
  updateStats();
  updateQualityChart();
}

// 筛选任务
function filterTasks(filter) {
  currentFilter = filter;
  
  document.querySelectorAll('.btn-group .btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  renderTasks();
}

// 更新统计
function updateStats() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const avgQuality = completedTasks.length > 0 
    ? (completedTasks.reduce((sum, t) => sum + t.actualQuality, 0) / completedTasks.length).toFixed(1)
    : 0;
  
  const today = new Date().toDateString();
  const todayCount = tasks.filter(t => new Date(t.createdAt).toDateString() === today).length;
  
  document.getElementById('totalTasks').textContent = total;
  document.getElementById('completedTasks').textContent = completed;
  document.getElementById('avgQuality').textContent = avgQuality;
  document.getElementById('todayTasks').textContent = todayCount;
}

// 初始化质量趋势图
function initQualityChart() {
  const ctx = document.getElementById('qualityChart').getContext('2d');
  
  qualityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: getLast7Days(),
      datasets: [{
        label: '平均质量分',
        data: getQualityData(),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#4f46e5',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 5,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

// 更新质量图表
function updateQualityChart() {
  if (!qualityChart) return;
  
  qualityChart.data.labels = getLast7Days();
  qualityChart.data.datasets[0].data = getQualityData();
  qualityChart.update();
}

// 获取最近7天日期
function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(`${date.getMonth() + 1}/${date.getDate()}`);
  }
  return days;
}

// 获取质量数据
function getQualityData() {
  const data = [];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toDateString();
    
    const dayTasks = tasks.filter(t => 
      t.status === 'completed' && 
      new Date(t.completedAt).toDateString() === dateStr
    );
    
    if (dayTasks.length > 0) {
      const avg = dayTasks.reduce((sum, t) => sum + t.actualQuality, 0) / dayTasks.length;
      data.push(avg.toFixed(1));
    } else {
      data.push(0);
    }
  }
  
  return data;
}

// 格式化日期
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}