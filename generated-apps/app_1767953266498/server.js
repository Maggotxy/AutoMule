const express = require('express');
const path = require('path');
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// 成语数据库（常用成语）
const idioms = [
  '一马当先', '先入为主', '主客颠倒', '倒背如流', '流连忘返',
  '返璞归真', '真心实意', '意气风发', '发扬光大', '大显身手',
  '手不释卷', '卷土重来', '来日方长', '长治久安', '安居乐业',
  '业精于勤', '勤能补拙', '拙嘴笨舌', '舌战群儒', '儒雅风流',
  '流芳百世', '世外桃源', '源远流长', '长驱直入', '入木三分',
  '分秒必争', '争分夺秒', '妙笔生花', '花言巧语', '语重心长',
  '长篇大论', '论功行赏', '赏心悦目', '目不转睛', '精益求精',
  '精益求精', '精神抖擞', '擐甲执锐', '锐不可当', '当机立断',
  '断章取义', '义不容辞', '辞旧迎新', '新婚燕尔', '尔虞我诈',
  '诈败佯输', '输财助边', '边尘不惊', '惊弓之鸟', '鸟尽弓藏',
  '藏龙卧虎', '虎口拔牙', '牙牙学语', '语无伦次', '次序井然',
  '然荻读书', '书香门第', '第宅连云', '云开见日', '日新月异',
  '异口同声', '声东击西', '西窗剪烛', '烛照数计', '计日程功',
  '功德无量', '量入为出', '出人头地', '地久天长', '长年累月',
  '月下老人', '人山人海', '海纳百川', '川流不息', '息息相通',
  '通情达理', '理直气壮', '壮志凌云', '云淡风轻', '轻举妄动',
  '动人心弦', '弦外之音', '音容笑貌', '貌合神离', '离经叛道',
  '道听途说', '说三道四', '四面楚歌', '歌舞升平', '平步青云',
  '云蒸霞蔚', '蔚为大观', '观眉说眼', '眼花缭乱', '乱七八糟',
  '糟糠之妻', '妻离子散', '散兵游勇', '勇往直前', '前功尽弃',
  '弃暗投明', '明察秋毫', '毫发不爽', '爽然若失', '失道寡助',
  '助人为乐', '乐极生悲', '悲喜交加', '加官进爵', '爵禄比天',
  '天下太平', '平易近人', '人定胜天', '天伦之乐', '乐此不疲'
];

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '成语接龙游戏运行中' });
});

// 获取随机起始成语
app.get('/api/idiom/random', (req, res) => {
  const randomIndex = Math.floor(Math.random() * idioms.length);
  res.json({ idiom: idioms[randomIndex] });
});

// 验证成语
app.post('/api/idiom/validate', (req, res) => {
  const { idiom, lastCharacter } = req.body;

  if (!idiom || typeof idiom !== 'string') {
    return res.status(400).json({ valid: false, message: '成语不能为空' });
  }

  // 检查是否为4个字
  if (idiom.length !== 4) {
    return res.status(400).json({ valid: false, message: '成语必须是4个字' });
  }

  // 检查是否以指定字符开头
  if (lastCharacter && idiom[0] !== lastCharacter) {
    return res.status(400).json({ 
      valid: false, 
      message: `成语必须以"${lastCharacter}"开头` 
    });
  }

  // 检查是否在成语库中
  if (!idioms.includes(idiom)) {
    return res.status(400).json({ valid: false, message: '成语不在库中' });
  }

  res.json({ 
    valid: true, 
    message: '验证通过',
    lastCharacter: idiom[3]
  });
});

// 获取提示（以指定字符开头的成语）
app.get('/api/idiom/hint/:character', (req, res) => {
  const { character } = req.params;
  const hints = idioms.filter(idiom => idiom[0] === character);
  
  if (hints.length === 0) {
    return res.json({ hints: [] });
  }

  // 随机返回3个提示
  const shuffled = hints.sort(() => 0.5 - Math.random());
  res.json({ hints: shuffled.slice(0, 3) });
});

app.listen(PORT, () => {
  console.log(`成语接龙游戏运行在 http://localhost:${PORT}`);
});