// 博客文章数据（静态数据）
const posts = [
  {
    id: 1,
    title: '像素艺术的复兴',
    excerpt: '探索 8-bit 美学在现代设计中的回归，从游戏到网页设计的像素风潮。',
    date: '2026-01-09',
    tag: '设计'
  },
  {
    id: 2,
    title: '极简主义与黑白配色',
    excerpt: '黑白配色如何传达高级感，探讨极简主义设计在数字时代的应用。',
    date: '2026-01-08',
    tag: '色彩'
  },
  {
    id: 3,
    title: '复古游戏美学',
    excerpt: '从 FC 到独立游戏，像素风格如何承载一代人的集体记忆。',
    date: '2026-01-07',
    tag: '游戏'
  },
  {
    id: 4,
    title: 'CSS 像素风实现技巧',
    excerpt: '使用纯 CSS 实现像素风格效果，无需图片资源，打造独特的视觉体验。',
    date: '2026-01-06',
    tag: '技术'
  },
  {
    id: 5,
    title: '数字时代的复古情怀',
    excerpt: '为什么在高清时代我们依然迷恋像素？探讨技术与情感的微妙关系。',
    date: '2026-01-05',
    tag: '思考'
  },
  {
    id: 6,
    title: '像素风 UI 设计指南',
    excerpt: '从按钮到图标，全面解析像素风 UI 的设计原则和实现方法。',
    date: '2026-01-04',
    tag: '设计'
  }
];

// DOM 元素
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.section');
const latestPostsList = document.getElementById('latest-posts-list');
const allPostsList = document.getElementById('all-posts-list');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadLatestPosts();
  loadAllPosts();
});

// 导航功能
function initNavigation() {
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      
      // 更新导航状态
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      // 切换内容区域
      sections.forEach(s => s.classList.remove('active'));
      const targetSection = document.getElementById(`${section}-section`);
      if (targetSection) {
        targetSection.classList.add('active');
      }
    });
  });
}

// 加载最新文章（显示前3篇）
function loadLatestPosts() {
  const latestPosts = posts.slice(0, 3);
  renderPosts(latestPosts, latestPostsList);
}

// 加载所有文章
function loadAllPosts() {
  renderPosts(posts, allPostsList);
}

// 渲染文章列表
function renderPosts(postArray, container) {
  container.innerHTML = postArray.map(post => `
    <article class="post-card" onclick="showPostDetail(${post.id})">
      <h4 class="post-title">${post.title}</h4>
      <p class="post-excerpt">${post.excerpt}</p>
      <div class="post-meta">
        <span class="post-date">${post.date}</span>
        <span class="post-tag">${post.tag}</span>
      </div>
    </article>
  `).join('');
}

// 显示文章详情（使用模态框）
function showPostDetail(postId) {
  const post = posts.find(p => p.id === postId);
  if (post) {
    // 显示加载状态
    const clickedCard = event.currentTarget;
    clickedCard.classList.add('loading');

    // 模拟加载延迟（提升用户体验）
    setTimeout(() => {
      // 填充模态框内容
      document.getElementById('modal-title').textContent = post.title;
      document.getElementById('modal-date').textContent = post.date;
      document.getElementById('modal-tag').textContent = post.tag;
      document.getElementById('modal-body').innerHTML = `<p>${post.excerpt}</p><p>这里是文章的详细内容区域。在实际应用中，这里会显示完整的文章内容，支持 Markdown 渲染和丰富的排版效果。</p>`;

      // 显示模态框
      document.getElementById('post-modal').classList.add('active');

      // 移除加载状态
      clickedCard.classList.remove('loading');
    }, 300);
  }
}

// 关闭模态框
function closeModal() {
  document.getElementById('post-modal').classList.remove('active');
}

// 点击模态框外部关闭
document.addEventListener('click', (e) => {
  const modal = document.getElementById('post-modal');
  if (e.target === modal) {
    closeModal();
  }
});

// ESC 键关闭模态框
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
  }
});

// 导出函数供全局调用
window.showPostDetail = showPostDetail;
window.closeModal = closeModal;