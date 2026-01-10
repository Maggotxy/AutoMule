class TodoApp {
  constructor() {
    this.tasks = this.loadTasks();
    this.currentFilter = 'all';
    this.initElements();
    this.bindEvents();
    this.render();
  }

  initElements() {
    this.taskInput = document.getElementById('taskInput');
    this.prioritySelect = document.getElementById('prioritySelect');
    this.dueDateInput = document.getElementById('dueDateInput');
    this.addTaskBtn = document.getElementById('addTaskBtn');
    this.taskList = document.getElementById('taskList');
    this.filterBtns = document.querySelectorAll('.filter-btn');
    this.clearCompletedBtn = document.getElementById('clearCompletedBtn');
    this.clearAllBtn = document.getElementById('clearAllBtn');
    this.totalTasksEl = document.getElementById('totalTasks');
    this.pendingTasksEl = document.getElementById('pendingTasks');
    this.completedTasksEl = document.getElementById('completedTasks');
  }

  bindEvents() {
    this.addTaskBtn.addEventListener('click', () => this.addTask());
    this.taskInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addTask();
    });

    this.filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.render();
      });
    });

    this.clearCompletedBtn.addEventListener('click', () => this.clearCompleted());
    this.clearAllBtn.addEventListener('click', () => this.clearAll());
  }

  addTask() {
    const text = this.taskInput.value.trim();
    if (!text) {
      alert('请输入任务内容');
      return;
    }

    const task = {
      id: Date.now(),
      text,
      priority: this.prioritySelect.value,
      dueDate: this.dueDateInput.value,
      completed: false,
      createdAt: new Date().toISOString()
    };

    this.tasks.unshift(task);
    this.saveTasks();
    this.taskInput.value = '';
    this.dueDateInput.value = '';
    this.render();
  }

  toggleTask(id) {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
      this.render();
    }
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
    this.saveTasks();
    this.render();
  }

  clearCompleted() {
    if (confirm('确定要清除所有已完成的任务吗？')) {
      this.tasks = this.tasks.filter(t => !t.completed);
      this.saveTasks();
      this.render();
    }
  }

  clearAll() {
    if (confirm('确定要清空所有任务吗？此操作不可恢复！')) {
      this.tasks = [];
      this.saveTasks();
      this.render();
    }
  }

  getFilteredTasks() {
    switch (this.currentFilter) {
      case 'pending':
        return this.tasks.filter(t => !t.completed);
      case 'completed':
        return this.tasks.filter(t => t.completed);
      case 'high':
        return this.tasks.filter(t => t.priority === 'high');
      default:
        return this.tasks;
    }
  }

  isOverdue(dueDate) {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dueDate) < today;
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  updateStats() {
    const total = this.tasks.length;
    const completed = this.tasks.filter(t => t.completed).length;
    const pending = total - completed;

    this.totalTasksEl.textContent = total;
    this.completedTasksEl.textContent = completed;
    this.pendingTasksEl.textContent = pending;
  }

  render() {
    const filteredTasks = this.getFilteredTasks();

    if (filteredTasks.length === 0) {
      this.taskList.innerHTML = `
        <li class="empty-state">
          <p>暂无任务</p>
        </li>
      `;
    } else {
      this.taskList.innerHTML = filteredTasks.map(task => {
        const priorityLabels = {
          high: '高',
          medium: '中',
          low: '低'
        };

        const isOverdue = this.isOverdue(task.dueDate) && !task.completed;

        return `
          <li class="task-item ${task.completed ? 'completed' : ''}">
            <input type="checkbox" class="task-checkbox" 
                   ${task.completed ? 'checked' : ''} 
                   onchange="app.toggleTask(${task.id})">
            <span class="task-text">${this.escapeHtml(task.text)}</span>
            <div class="task-meta">
              <span class="priority-badge priority-${task.priority}">
                ${priorityLabels[task.priority]}
              </span>
              ${task.dueDate ? `
                <span class="due-date ${isOverdue ? 'overdue' : ''}">
                  📅 ${this.formatDate(task.dueDate)}
                  ${isOverdue ? ' (已过期)' : ''}
                </span>
              ` : ''}
            </div>
            <button class="delete-btn" onclick="app.deleteTask(${task.id})">删除</button>
          </li>
        `;
      }).join('');
    }

    this.updateStats();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  saveTasks() {
    localStorage.setItem('todoTasks', JSON.stringify(this.tasks));
  }

  loadTasks() {
    const saved = localStorage.getItem('todoTasks');
    return saved ? JSON.parse(saved) : [];
  }
}

const app = new TodoApp();