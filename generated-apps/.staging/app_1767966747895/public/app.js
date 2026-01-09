const movies = [
  {
    title: "肖申克的救赎",
    genre: "剧情",
    year: "1994",
    description: "银行家安迪因被误判谋杀妻子及其情人而入狱，在肖申克监狱中，他逐渐获得狱友们的信任，并与瑞德建立了深厚的友谊。"
  },
  {
    title: "盗梦空间",
    genre: "科幻/动作",
    year: "2010",
    description: "多姆·柯布是一名经验丰富的窃贼，他擅长在人们精神最为脆弱的梦境中窃取潜意识中有价值的秘密。"
  },
  {
    title: "阿甘正传",
    genre: "剧情/爱情",
    year: "1994",
    description: "阿甘是一个智商只有75的低能儿，但他善良、真诚、勇敢，经历了美国历史上的许多重大事件。"
  },
  {
    title: "泰坦尼克号",
    genre: "爱情/灾难",
    year: "1997",
    description: "1912年，豪华游轮泰坦尼克号在首航中撞上冰轮沉没，杰克和露丝的爱情故事在灾难中展开。"
  },
  {
    title: "星际穿越",
    genre: "科幻/冒险",
    year: "2014",
    description: "地球面临严重的粮食危机，前NASA飞行员库珀被选中执行一项穿越虫洞的任务，寻找人类的新家园。"
  },
  {
    title: "楚门的世界",
    genre: "剧情/喜剧",
    year: "1998",
    description: "楚门发现自己30年来的人生其实是一场真人秀，他生活的每一刻都被全世界观众直播观看。"
  },
  {
    title: "黑客帝国",
    genre: "科幻/动作",
    year: "1999",
    description: "程序员尼奥发现现实世界其实是由人工智能控制的虚拟世界，他加入了反抗组织，为人类自由而战。"
  },
  {
    title: "千与千寻",
    genre: "动画/奇幻",
    year: "2001",
    description: "10岁的千寻与父母误入神灵世界，父母变成猪，千寻必须在这个奇幻世界中工作并拯救父母。"
  },
  {
    title: "教父",
    genre: "犯罪/剧情",
    year: "1972",
    description: "柯里昂家族是纽约五大黑手党家族之一，家族的兴衰史展现了权力、忠诚与背叛的复杂关系。"
  },
  {
    title: "辛德勒的名单",
    genre: "历史/剧情",
    year: "1993",
    description: "二战期间，德国商人辛德勒拯救了1000多名犹太人的生命，展现了人性中最光辉的一面。"
  },
  {
    title: "这个杀手不太冷",
    genre: "动作/剧情",
    year: "1994",
    description: "职业杀手莱昂收留了全家被杀的小女孩玛蒂尔达，两人之间产生了特殊的情感纽带。"
  },
  {
    title: "美丽人生",
    genre: "剧情/喜剧",
    year: "1997",
    description: "二战期间，一位犹太父亲用想象力为儿子编织了一个美丽的童话，保护他免受集中营的残酷。"
  },
  {
    title: "疯狂动物城",
    genre: "动画/冒险",
    year: "2016",
    description: "在一个所有动物和平共处的城市里，兔子朱迪和狐狸尼克联手揭开了一个惊天阴谋。"
  },
  {
    title: "复仇者联盟",
    genre: "动作/科幻",
    year: "2012",
    description: "地球面临外星入侵，钢铁侠、美国队长、雷神等超级英雄组成复仇者联盟，共同保卫地球。"
  },
  {
    title: "我不是药神",
    genre: "剧情/喜剧",
    year: "2018",
    description: "程勇从印度走私廉价抗癌药，帮助许多患者，但也因此卷入了法律的漩涡。"
  },
  {
    title: "寄生虫",
    genre: "剧情/惊悚",
    year: "2019",
    description: "贫穷的金家四口通过各种手段进入富有的朴家工作，两个家庭的关系逐渐失控。"
  },
  {
    title: "小丑",
    genre: "剧情/犯罪",
    year: "2019",
    description: "哥谭市的小丑亚瑟·弗莱克在社会的冷漠和压迫下，逐渐走向疯狂和犯罪的道路。"
  },
  {
    title: "流浪地球",
    genre: "科幻/冒险",
    year: "2019",
    description: "太阳即将毁灭，人类启动流浪地球计划，推动地球飞向半人马座，寻找新的家园。"
  },
  {
    title: "哪吒之魔童降世",
    genre: "动画/奇幻",
    year: "2019",
    description: "哪吒生来就是魔丸转世，被视为妖怪，但他通过自己的努力和勇敢，最终成为英雄。"
  },
  {
    title: "少年的你",
    genre: "剧情/爱情",
    year: "2019",
    description: "高中生陈念和小北在校园霸凌的阴影下，相互扶持，共同面对成长的痛苦。"
  }
];

let history = [];

function getRandomMovie() {
  const randomIndex = Math.floor(Math.random() * movies.length);
  return movies[randomIndex];
}

function displayMovie(movie) {
  document.getElementById('movieTitle').textContent = movie.title;
  document.getElementById('movieGenre').textContent = movie.genre;
  document.getElementById('movieYear').textContent = `上映年份：${movie.year}`;
  document.getElementById('movieDescription').textContent = movie.description;
  
  const emojis = ['🎬', '🎭', '🎪', '🎯', '🎲', '🎵', '🎹', '🎺', '🎸', '🎻'];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  document.getElementById('moviePoster').textContent = randomEmoji;
}

function addToHistory(movie) {
  history.unshift(movie);
  if (history.length > 10) {
    history.pop();
  }
  renderHistory();
}

function renderHistory() {
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '';

  history.forEach((movie, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="history-title">${index + 1}. ${movie.title}</span>
      <span class="history-meta">${movie.year} · ${movie.genre}</span>
    `;
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => {
      displayMovie(movie);
      li.style.background = '#667eea';
      li.style.color = 'white';
      li.querySelector('.history-meta').style.color = 'rgba(255,255,255,0.8)';
      setTimeout(() => {
        li.style.background = '';
        li.style.color = '';
        li.querySelector('.history-meta').style.color = '';
      }, 300);
    });
    historyList.appendChild(li);
  });
}

document.getElementById('recommendBtn').addEventListener('click', function() {
  const movie = getRandomMovie();
  displayMovie(movie);
  addToHistory(movie);

  this.disabled = true;
  this.textContent = '🎲 推荐中...';
  this.style.transform = 'scale(0.95)';

  setTimeout(() => {
    this.disabled = false;
    this.textContent = '🎲 随机推荐';
    this.style.transform = 'scale(1)';
  }, 500);
});