const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// 静态文件托管
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 智能分析 API - 模拟机器学习分析
app.post('/api/analyze', express.json(), (req, res) => {
  const { text, type } = req.body;
  
  // 模拟基于规则的智能分析
  const result = analyzeContent(text, type);
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
});

// 用户行为记录 API
app.post('/api/behavior', express.json(), (req, res) => {
  const { action, context } = req.body;
  
  // 模拟行为分析和推荐
  const recommendation = analyzeBehavior(action, context);
  
  res.json({
    success: true,
    recommendation: recommendation,
    timestamp: new Date().toISOString()
  });
});

// 内容分析函数（模拟机器学习）
function analyzeContent(text, type) {
  if (!text) return { score: 0, insights: [] };
  
  const insights = [];
  let score = 50;
  
  // 情感分析（简单规则）
  const positiveWords = ['好', '优秀', '棒', '喜欢', '爱', '开心', '满意', '成功', '精彩', '完美'];
  const negativeWords = ['差', '不好', '讨厌', '难过', '失败', '糟糕', '失望', '痛苦', '糟糕', '问题'];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  positiveWords.forEach(word => {
    if (text.includes(word)) positiveCount++;
  });
  
  negativeWords.forEach(word => {
    if (text.includes(word)) negativeCount++;
  });
  
  if (positiveCount > 0 || negativeCount > 0) {
    const sentiment = positiveCount > negativeCount ? '积极' : (negativeCount > positiveCount ? '消极' : '中性');
    score = 50 + (positiveCount - negativeCount) * 10;
    insights.push({
      type: 'sentiment',
      label: '情感倾向',
      value: sentiment,
      confidence: Math.min(90, 60 + Math.abs(positiveCount - negativeCount) * 5)
    });
  }
  
  // 文本复杂度分析
  const avgLength = text.length / text.split('').length;
  if (text.length > 100) {
    insights.push({
      type: 'complexity',
      label: '内容复杂度',
      value: avgLength > 2 ? '高' : '中',
      suggestion: '建议分段展示以提高可读性'
    });
  }
  
  // 关键词提取
  const keywords = extractKeywords(text);
  if (keywords.length > 0) {
    insights.push({
      type: 'keywords',
      label: '关键词',
      value: keywords.slice(0, 3)
    });
  }
  
  return {
    score: Math.max(0, Math.min(100, score)),
    insights: insights,
    summary: generateSummary(insights)
  };
}

// 行为分析函数
function analyzeBehavior(action, context) {
  const patterns = {
    'click': { type: 'interaction', priority: 'medium' },
    'scroll': { type: 'engagement', priority: 'low' },
    'input': { type: 'creation', priority: 'high' },
    'hover': { type: 'interest', priority: 'low' }
  };
  
  const pattern = patterns[action] || { type: 'general', priority: 'low' };
  
  return {
    action: action,
    pattern: pattern.type,
    suggestion: generateSuggestion(action, context),
    nextActions: predictNextActions(action)
  };
}

// 简单的关键词提取
function extractKeywords(text) {
  const words = text.split(/[\s,，.。!！?？;；]+/);
  const stopWords = ['的', '了', '是', '在', '和', '有', '我', '你', '他', '这', '那', '个'];
  
  return words
    .filter(word => word.length > 1 && !stopWords.includes(word))
    .slice(0, 5);
}

// 生成摘要
function generateSummary(insights) {
  if (insights.length === 0) return '内容分析完成';
  
  const types = insights.map(i => i.type);
  if (types.includes('sentiment')) {
    const sentiment = insights.find(i => i.type === 'sentiment').value;
    return `检测到${sentiment}情感倾向，内容分析完成`;
  }
  return `发现 ${insights.length} 个洞察点`;
}

// 生成建议
function generateSuggestion(action, context) {
  const suggestions = {
    'click': '检测到交互行为，建议提供更多相关信息',
    'scroll': '用户正在浏览内容，考虑添加导航提示',
    'input': '用户正在输入，可以提供智能补全建议',
    'hover': '用户表现出兴趣，可以显示详细说明'
  };
  
  return suggestions[action] || '继续观察用户行为模式';
}

// 预测下一步行为
function predictNextActions(currentAction) {
  const predictions = {
    'click': ['scroll', 'input', 'click'],
    'scroll': ['click', 'hover'],
    'input': ['click', 'submit'],
    'hover': ['click', 'scroll']
  };
  
  return predictions[currentAction] || ['click', 'scroll'];
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`智能体验增强演示应用运行在 http://localhost:${PORT}`);
});