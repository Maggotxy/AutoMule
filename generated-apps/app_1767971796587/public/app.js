document.addEventListener('DOMContentLoaded', function() {
    const orderBtn = document.getElementById('orderBtn');
    const foodItems = document.querySelectorAll('.food-item');
    const featureCards = document.querySelectorAll('.feature-card');

    orderBtn.addEventListener('click', function() {
        alert('🎮 像素校园外卖APP即将上线！敬请期待...');
    });

    foodItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });

    featureCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            const icon = this.querySelector('.pixel-icon');
            icon.style.transform = 'scale(1.2) rotate(10deg)';
        });
        
        card.addEventListener('mouseleave', function() {
            const icon = this.querySelector('.pixel-icon');
            icon.style.transform = 'scale(1) rotate(0deg)';
        });
    });

    console.log('🍜 像素校园外卖页面加载完成');
});