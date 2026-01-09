// 博客文章数据（静态数据）
const posts = [
  {
    id: 1,
    title: '像素艺术的复兴',
    excerpt: '探索 8-bit 美学在现代设计中的回归，从游戏到网页设计的像素风潮。',
    date: '2026-01-09',
    tag: '设计',
    content: `<p>像素艺术，这个诞生于 8-bit 时代的视觉语言，正在经历一场前所未有的复兴。</p>
    <p>从《我的世界》到《星露谷物语》，从独立游戏到大型商业作品，像素风格已经超越了技术限制，成为一种独特的艺术表达方式。</p>
    <p>在网页设计领域，像素风格也正在重新流行。设计师们发现，这种看似粗糙的视觉语言，实际上蕴含着极强的表现力和情感共鸣。</p>
    <p>像素艺术的魅力在于它的纯粹性。每一个像素都是经过精心设计的，没有任何多余的元素。这种"少即是多"的设计哲学，与现代极简主义设计理念不谋而合。</p>
    <p>更重要的是，像素风格承载着一代人的集体记忆。对于 80、90 后来说，像素不仅仅是视觉风格，更是童年游戏时光的象征。这种情感连接，是其他任何视觉风格都无法替代的。</p>`
  },
  {
    id: 2,
    title: '极简主义与黑白配色',
    excerpt: '黑白配色如何传达高级感，探讨极简主义设计在数字时代的应用。',
    date: '2026-01-08',
    tag: '色彩',
    content: `<p>黑白配色，这种最简单的色彩组合，却能够传达出最强烈的高级感。</p>
    <p>在极简主义设计中，黑白配色的运用是一门艺术。它要求设计师在有限的色彩范围内，通过对比、层次和空间关系来创造视觉冲击力。</p>
    <p>黑白配色的优势在于它的永恒性和普适性。无论时代如何变迁，黑白色永远不会过时。它能够适应任何风格、任何场景，展现出独特的魅力。</p>
    <p>在数字时代，黑白配色更是被赋予了新的意义。在信息过载的环境中，简洁的黑白界面能够帮助用户专注于内容本身，减少视觉干扰。</p>
    <p>当然，黑白配色并不意味着完全放弃色彩。相反，它要求设计师更加谨慎地使用色彩，让每一个色彩元素都发挥最大的作用。</p>`
  },
  {
    id: 3,
    title: '复古游戏美学',
    excerpt: '从 FC 到独立游戏，像素风格如何承载一代人的集体记忆。',
    date: '2026-01-07',
    tag: '游戏',
    content: `<p>复古游戏美学，这个词汇本身就充满了怀旧的味道。</p>
    <p>从 FC 时代的《超级马里奥兄弟》，到 SFC 时代的《最终幻想》，再到 PS 时代的《勇者斗恶龙》，像素风格陪伴了一代人的成长。</p>
    <p>这些游戏不仅仅是娱乐产品，更是艺术品。每一个像素都凝聚着设计师的心血，每一个场景都讲述着一个故事。</p>
    <p>如今，独立游戏开发者们正在重新发现像素艺术的价值。他们用现代的技术，创造出既怀旧又新颖的视觉体验。</p>
    <p>复古游戏美学的复兴，不仅仅是对过去的致敬，更是对未来的探索。它告诉我们，技术的进步并不意味着要抛弃传统，相反，传统可以成为创新的源泉。</p>`
  },
  {
    id: 4,
    title: 'CSS 像素风实现技巧',
    excerpt: '使用纯 CSS 实现像素风格效果，无需图片资源，打造独特的视觉体验。',
    date: '2026-01-06',
    tag: '技术',
    content: `<p>CSS 像素风，这是一个充满挑战但也极具创意的设计方向。</p>
    <p>实现像素风效果，关键在于几个 CSS 属性的巧妙运用。首先是 <code>image-rendering: pixelated</code>，这个属性可以让图像保持像素化的效果，不会模糊。</p>
    <p>其次是边框和阴影的运用。通过多层阴影的叠加，可以创造出立体的像素效果。这种技巧在按钮、卡片等元素上特别有效。</p>
    <p>字体选择也很重要。等宽字体如 Courier New、Consolas 等天然具有像素风格，配合适当的字间距和行高，可以营造出复古的氛围。</p>
    <p>色彩方面，像素风通常使用 limited color palette。通过限制颜色的数量，可以强化像素的感觉，同时也更容易保持视觉的一致性。</p>
    <p>最后，动画效果也要符合像素风格。避免使用平滑的过渡，改用阶梯式的变化，这样整体效果会更加协调。</p>`
  },
  {
    id: 5,
    title: '数字时代的复古情怀',
    excerpt: '为什么在高清时代我们依然迷恋像素？探讨技术与情感的微妙关系。',
    date: '2026-01-05',
    tag: '思考',
    content: `<p>这是一个有趣的问题：在 4K、8K 时代，为什么我们依然迷恋像素？</p>
    <p>答案或许在于，像素不仅仅是技术限制的产物，更是一种情感的表达。</p>
    <p>像素风格让我们想起童年时光，想起那些和朋友一起玩游戏的下午。这种情感连接，是高清图像无法替代的。</p>
    <p>从心理学角度来看，像素风格触发了我们的怀旧情绪。怀旧是一种积极的情感，它能够带来安全感、归属感和幸福感。</p>
    <p>此外，像素风格也代表了一种反叛精神。在追求完美的时代，像素风格告诉我们，不完美也可以是美的。这种理念，与当代年轻人追求个性、拒绝从众的价值观高度契合。</p>
    <p>所以，像素风格的流行，不是技术的倒退，而是情感的回归。它提醒我们，在数字化的世界里，情感和记忆依然是最珍贵的东西。</p>`
  },
  {
    id: 6,
    title: '像素风 UI 设计指南',
    excerpt: '从按钮到图标，全面解析像素风 UI 的设计原则和实现方法。',
    date: '2026-01-04',
    tag: '设计',
    content: `<p>像素风 UI 设计，这是一门需要耐心和技巧的艺术。</p>
    <p>设计像素风 UI，首先要理解像素的局限性。每一个像素都很重要，没有"差不多"这个概念。这种精确性，正是像素风设计的魅力所在。</p>
    <p>按钮设计是像素风 UI 的基础。一个像素风按钮通常包含：主体、边框、阴影三个层次。通过这三层的设计，可以创造出立体的效果。</p>
    <p>图标设计则需要更多的创意。在有限的像素空间内，如何表达清晰的概念？这需要设计师具备极强的概括能力和想象力。</p>
    <p>布局方面，像素风 UI 倾向于使用网格系统。这不仅符合像素的特点，也能够保证界面的整洁和有序。</p>
    <p>最后，交互设计也很重要。像素风 UI 的交互应该与视觉风格保持一致。例如，按钮的 hover 效果可以使用像素化的变化，而不是平滑的过渡。</p>`
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
  initTagFilters();
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
      document.getElementById('modal-body').innerHTML = post.content || `<p>${post.excerpt}</p><p>这里是文章的详细内容区域。在实际应用中，这里会显示完整的文章内容，支持 Markdown 渲染和丰富的排版效果。</p>`;

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

// 标签筛选功能
function initTagFilters() {
  const tagFilters = document.querySelectorAll('.tag-filter');
  tagFilters.forEach(filter => {
    filter.addEventListener('click', () => {
      // 更新筛选按钮状态
      tagFilters.forEach(f => f.classList.remove('active'));
      filter.classList.add('active');

      // 筛选文章
      const tag = filter.dataset.tag;
      filterPostsByTag(tag);
    });
  });
}

// 根据标签筛选文章
function filterPostsByTag(tag) {
  let filteredPosts = posts;
  if (tag !== 'all') {
    filteredPosts = posts.filter(post => post.tag === tag);
  }
  renderPosts(filteredPosts, allPostsList);
}