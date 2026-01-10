// 移动端菜单切换
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        mobileMenuBtn.classList.toggle('active');
    });

    // 点击导航链接后关闭菜单
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            mobileMenuBtn.classList.remove('active');
        });
    });
}

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

// 导航栏滚动效果
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        navbar.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
    } else {
        navbar.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
    }

    lastScroll = currentScroll;
});

// 元素进入视口动画
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// 为所有卡片添加动画
document.querySelectorAll('.intro-card, .course-card, .feature-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// 表单提交处理
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = signupForm.querySelector('.cta-input').value;
        
        // 模拟提交成功
        const btn = signupForm.querySelector('button');
        const originalText = btn.textContent;
        btn.textContent = '提交中...';
        btn.disabled = true;

        setTimeout(() => {
            btn.textContent = '✓ 注册成功！';
            btn.style.background = '#10b981';
            signupForm.querySelector('.cta-input').value = '';
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
                btn.disabled = false;
            }, 2000);
        }, 1000);
    });
}

// 课程卡片悬停效果增强
document.querySelectorAll('.course-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-5px) scale(1.02)';
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0) scale(1)';
    });
});

// 简介卡片悬停效果增强
document.querySelectorAll('.intro-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        const icon = card.querySelector('.intro-icon');
        icon.style.transform = 'scale(1.2) rotate(10deg)';
    });

    card.addEventListener('mouseleave', () => {
        const icon = card.querySelector('.intro-icon');
        icon.style.transform = 'scale(1) rotate(0deg)';
    });
});

// 添加图标过渡效果
document.querySelectorAll('.intro-icon').forEach(icon => {
    icon.style.transition = 'transform 0.3s ease';
});

// 页面加载完成后的初始动画
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});