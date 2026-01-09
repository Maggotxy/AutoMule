// 像素博客交互逻辑

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initForm();
  initAnimations();
});

// 导航功能
function initNavigation() {
  const navButtons = document.querySelectorAll('.pixel-nav-btn');
  const sections = document.querySelectorAll('.pixel-section');

  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetSection = button.dataset.section;

      // 更新按钮状态
      navButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // 切换内容区域
      sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === targetSection) {
          section.classList.add('active');
        }
      });

      // 添加点击音效（可选）
      playPixelSound();
    });
  });
}

// 表单功能
function initForm() {
  const form = document.querySelector('.pixel-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // 获取表单数据
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);
      
      // 显示成功消息
      showPixelMessage('消息已发送！感谢你的联系 🎮');
      
      // 重置表单
      form.reset();
    });
  }
}

// 像素音效（模拟）
function playPixelSound() {
  // 这里可以添加实际的音效
  // 为了简化，我们只添加视觉反馈
  document.body.style.transform = 'scale(0.99)';
  setTimeout(() => {
    document.body.style.transform = 'scale(1)';
  }, 50);
}

// 显示像素风格消息
function showPixelMessage(message) {
  // 创建消息元素
  const messageEl = document.createElement('div');
  messageEl.className = 'pixel-message';
  messageEl.textContent = message;
  messageEl.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #e94560;
    color: #fff;
    padding: 15px 30px;
    border: 4px solid #ffd700;
    box-shadow: 6px 6px 0 #0f3460;
    z-index: 1000;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 2px;
    animation: pixelSlideDown 0.3s step-end;
  `;

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pixelSlideDown {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  `;
  document.head.appendChild(style);

  // 添加到页面
  document.body.appendChild(messageEl);

  // 3秒后移除
  setTimeout(() => {
    messageEl.style.animation = 'pixelSlideDown 0.3s step-end reverse';
    setTimeout(() => {
      document.body.removeChild(messageEl);
    }, 300);
  }, 3000);
}

// 初始化动画效果
function initAnimations() {
  // 为所有按钮添加悬停效果
  const buttons = document.querySelectorAll('.pixel-btn');
  buttons.forEach(button => {
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translate(-2px, -2px)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translate(0, 0)';
    });
  });

  // 为文章卡片添加交互动画
  const articles = document.querySelectorAll('.pixel-article-item');
  articles.forEach(article => {
    article.addEventListener('mouseenter', () => {
      article.style.borderColor = '#ffd700';
    });
    article.addEventListener('mouseleave', () => {
      article.style.borderColor = '#e94560';
    });
  });

  // 为技能条添加动态效果
  const skillBars = document.querySelectorAll('.pixel-bar-fill');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const width = entry.target.style.width;
        entry.target.style.width = '0%';
        setTimeout(() => {
          entry.target.style.width = width;
        }, 100);
      }
    });
  });

  skillBars.forEach(bar => observer.observe(bar));

  // 添加页面加载动画
  document.body.style.opacity = '0';
  setTimeout(() => {
    document.body.style.transition = 'opacity 0.5s step-end';
    document.body.style.opacity = '1';
  }, 100);
}

// 导航滚动效果（可选）
window.addEventListener('scroll', () => {
  const header = document.querySelector('.pixel-header');
  if (window.scrollY > 50) {
    header.style.transform = 'translateY(-5px)';
    header.style.opacity = '0.95';
  } else {
    header.style.transform = 'translateY(0)';
    header.style.opacity = '1';
  }
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
  // 按 1-4 切换导航
  if (e.key >= '1' && e.key <= '4') {
    const navButtons = document.querySelectorAll('.pixel-nav-btn');
    const index = parseInt(e.key) - 1;
    if (navButtons[index]) {
      navButtons[index].click();
    }
  }
});

// 控制台彩蛋
console.log('%c🎮 欢迎来到像素博客！', 'font-size: 24px; color: #e94560; font-weight: bold;');
console.log('%c按 1-4 数字键可以快速切换页面', 'font-size: 14px; color: #ffd700;');