// 全局变量
let behaviorCount = 0;

// DOM 元素
const textInput = document.getElementById('textInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const analysisResult = document.getElementById('analysisResult');
const scoreValue = document.getElementById('scoreValue');
const insightsList = document.getElementById('insightsList');
const demoArea = document.getElementById('demoArea');
const logList = document.getElementById('logList');
const recommendationBox = document.getElementById('recommendationBox');
const recommendationText = document.getElementById('recommendationText');
const nextActions = document.getElementById('nextActions');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('智能体验增强演示应用已加载');
});

// 文本分析功能
analyzeBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    
    if (!text) {
        alert('请输入要分析的文本内容');
        return;
    }
    
    analyzeBtn.textContent = '分析中...';
    analyzeBtn.disabled = true;
    
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text, type: 'general' })
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayAnalysisResult(result.data);
        } else {
            alert('分析失败，请重试');
        }
    } catch (error) {
        console.error('分析错误:', error);
        alert('分析过程中出现错误');
    } finally {
        analyzeBtn.textContent = '开始分析';
        analyzeBtn.disabled = false;
    }
});

// 显示分析结果
function displayAnalysisResult(data) {
    analysisResult.classList.remove('hidden');
    
    // 设置评分
    scoreValue.textContent = data.score;
    scoreValue.style.color = getScoreColor(data.score);
    
    // 清空并显示洞察
    insightsList.innerHTML = '';
    
    if (data.insights && data.insights.length > 0) {
        data.insights.forEach(insight => {
            const insightItem = document.createElement('div');
            insightItem.className = 'insight-item';
            
            let valueHtml = '';
            if (Array.isArray(insight.value)) {
                valueHtml = insight.value.map(v => `<span class="insight-value">${v}</span>`).join(', ');
            } else {
                valueHtml = `<span class="insight-value">${insight.value}</span>`;
            }
            
            insightItem.innerHTML = `
                <div class="insight-label">${insight.label}</div>
                ${valueHtml}
                ${insight.suggestion ? `<div class="insight-suggestion">💡 ${insight.suggestion}</div>` : ''}
                ${insight.confidence ? `<div class="insight-suggestion">置信度: ${insight.confidence}%</div>` : ''}
            `;
            
            insightsList.appendChild(insightItem);
        });
    } else {
        insightsList.innerHTML = '<div class="insight-item"><span class="insight-value">暂无显著洞察</span></div>';
    }
}

// 获取评分颜色
function getScoreColor(score) {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#667eea';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
}

// 用户行为追踪
demoArea.addEventListener('click', () => trackBehavior('click'));
demoArea.addEventListener('mouseenter', () => trackBehavior('hover'));
demoArea.addEventListener('mousemove', debounce(() => trackBehavior('scroll'), 500));

// 追踪行为
async function trackBehavior(action) {
    behaviorCount++;
    
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.innerHTML = `<strong>${behaviorCount}.</strong> ${getActionLabel(action)} - ${new Date().toLocaleTimeString()}`;
    logList.insertBefore(logItem, logList.firstChild);
    
    // 限制日志数量
    if (logList.children.length > 10) {
        logList.removeChild(logList.lastChild);
    }
    
    try {
        const response = await fetch('/api/behavior', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                action, 
                context: { 
                    count: behaviorCount,
                    timestamp: Date.now()
                }
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayRecommendation(result.recommendation);
        }
    } catch (error) {
        console.error('行为分析错误:', error);
    }
}

// 显示推荐
function displayRecommendation(recommendation) {
    recommendationBox.classList.remove('hidden');
    recommendationText.textContent = recommendation.suggestion;
    nextActions.textContent = recommendation.nextActions.map(a => getActionLabel(a)).join(' → ');
}

// 获取操作标签
function getActionLabel(action) {
    const labels = {
        'click': '🖱️ 点击',
        'hover': '👆 悬停',
        'scroll': '📜 滚动',
        'input': '⌨️ 输入',
        'submit': '✅ 提交'
    };
    return labels[action] || action;
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 自动演示（可选）
setTimeout(() => {
    if (behaviorCount === 0) {
        demoArea.style.animation = 'pulse 2s infinite';
    }
}, 3000);