// 文章展开/收起功能
document.addEventListener('DOMContentLoaded', function() {
    const expandButtons = document.querySelectorAll('.expand-btn');

    expandButtons.forEach(button => {
        button.addEventListener('click', function() {
            const article = this.closest('.article');
            const content = article.querySelector('.article-content');
            const isHidden = content.classList.contains('hidden');

            if (isHidden) {
                content.classList.remove('hidden');
                this.textContent = '收起文章';
            } else {
                content.classList.add('hidden');
                this.textContent = '展开阅读';
            }
        });
    });

    // 导航链接点击效果
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            // 这里可以添加页面切换逻辑
            console.log('导航到:', this.textContent);
        });
    });

    // 分类链接点击效果
    const categoryLinks = document.querySelectorAll('.category-link');
    categoryLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('分类筛选:', this.textContent);
        });
    });

    // 标签点击效果
    const tagItems = document.querySelectorAll('.tag-item');
    tagItems.forEach(tag => {
        tag.addEventListener('click', function() {
            console.log('标签筛选:', this.textContent);
        });
    });
});