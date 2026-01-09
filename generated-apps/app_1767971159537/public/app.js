// 平滑滚动
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// 导航高亮
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('.nav-links a');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.clientHeight;
    if (scrollY >= sectionTop - 100) {
      current = section.getAttribute('id');
    }
  });

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
});

// 购物车计数
let cartCount = 0;
const cartIcon = document.querySelector('.cart-icon');

document.querySelectorAll('.pixel-btn.small').forEach(btn => {
  btn.addEventListener('click', function() {
    cartCount++;
    cartIcon.textContent = `🛒(${cartCount})`;
    
    // 添加点击动画
    const originalText = this.textContent;
    this.textContent = '已添加 ✓';
    this.style.backgroundColor = 'var(--accent)';
    this.style.color = 'var(--white)';
    this.style.borderColor = 'var(--accent)';
    this.style.boxShadow = '2px 2px 0 var(--accent-dark)';
    this.style.transform = 'translate(2px, 2px)';
    
    // 购物车图标动画
    cartIcon.style.animation = 'cartBounce 0.3s ease';
    setTimeout(() => {
      cartIcon.style.animation = '';
    }, 300);
    
    setTimeout(() => {
      this.textContent = originalText;
      this.style.backgroundColor = '';
      this.style.color = '';
      this.style.borderColor = '';
      this.style.boxShadow = '';
      this.style.transform = '';
    }, 1500);
  });
});

// 表单提交
document.querySelector('.pixel-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const inputs = this.querySelectorAll('input, textarea');
  let filled = true;
  
  inputs.forEach(input => {
    if (!input.value.trim()) {
      filled = false;
      input.style.borderColor = '#ff4444';
    } else {
      input.style.borderColor = 'var(--gray)';
    }
  });
  
  if (filled) {
    alert('消息已发送！我们会尽快回复您。');
    this.reset();
  }
});

// Hero 按钮交互
document.querySelectorAll('.hero .pixel-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    if (this.classList.contains('primary')) {
      document.getElementById('products').scrollIntoView({
        behavior: 'smooth'
      });
    }
  });
});

// 滚动时导航栏阴影效果已在 CSS 中实现固定像素阴影

// 移动端菜单切换
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    mobileMenuBtn.classList.toggle('active');
    navLinks.classList.toggle('active');
  });

  // 点击导航链接后关闭菜单
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenuBtn.classList.remove('active');
      navLinks.classList.remove('active');
    });
  });
}

// 滚动触发动画
const observerOptions = {
  root: null,
  rootMargin: '0px',
  threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// 观察需要动画的元素
document.querySelectorAll('.product-card, .about-text, .about-visual, .contact-info, .pixel-form').forEach(el => {
  observer.observe(el);
});