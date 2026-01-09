// DOM 元素
const jsonInput = document.getElementById('jsonInput');
const jsonOutput = document.getElementById('jsonOutput');
const statusEl = document.getElementById('status');
const formatBtn = document.getElementById('formatBtn');
const minifyBtn = document.getElementById('minifyBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const sampleBtn = document.getElementById('sampleBtn');

// 示例 JSON
const sampleJSON = {
  "name": "JSON 格式化工具",
  "version": "1.0.0",
  "features": ["格式化", "压缩", "语法高亮", "错误检测"],
  "settings": {
    "indent": 2,
    "sortKeys": false
  },
  "active": true,
  "count": 42
};

// 格式化 JSON
function formatJSON() {
  const input = jsonInput.value.trim();
  
  if (!input) {
    setStatus('请输入 JSON', 'invalid');
    jsonOutput.innerHTML = '';
    return;
  }

  try {
    const parsed = JSON.parse(input);
    const formatted = JSON.stringify(parsed, null, 2);
    jsonOutput.innerHTML = syntaxHighlight(formatted);
    setStatus('✓ JSON 有效', 'valid');
  } catch (e) {
    setStatus('✗ JSON 无效: ' + e.message, 'invalid');
    jsonOutput.innerHTML = '';
  }
}

// 压缩 JSON
function minifyJSON() {
  const input = jsonInput.value.trim();
  
  if (!input) {
    setStatus('请输入 JSON', 'invalid');
    jsonOutput.innerHTML = '';
    return;
  }

  try {
    const parsed = JSON.parse(input);
    const minified = JSON.stringify(parsed);
    jsonOutput.textContent = minified;
    setStatus('✓ JSON 有效 (已压缩)', 'valid');
  } catch (e) {
    setStatus('✗ JSON 无效: ' + e.message, 'invalid');
    jsonOutput.innerHTML = '';
  }
}

// 语法高亮
function syntaxHighlight(json) {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

// 设置状态
function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
}

// 清空输入
function clearInput() {
  jsonInput.value = '';
  jsonOutput.innerHTML = '';
  setStatus('', '');
}

// 复制输出
function copyOutput() {
  const text = jsonOutput.textContent;
  if (!text) {
    alert('没有可复制的内容');
    return;
  }
  
  navigator.clipboard.writeText(text).then(() => {
    const originalText = copyBtn.textContent;
    copyBtn.textContent = '已复制!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 1500);
  }).catch(() => {
    alert('复制失败');
  });
}

// 加载示例
function loadSample() {
  jsonInput.value = JSON.stringify(sampleJSON, null, 2);
  formatJSON();
}

// 事件监听
formatBtn.addEventListener('click', formatJSON);
minifyBtn.addEventListener('click', minifyJSON);
clearBtn.addEventListener('click', clearInput);
copyBtn.addEventListener('click', copyOutput);
sampleBtn.addEventListener('click', loadSample);

// 输入时实时校验
jsonInput.addEventListener('input', () => {
  const input = jsonInput.value.trim();
  if (!input) {
    setStatus('', '');
    jsonOutput.innerHTML = '';
    return;
  }
  
  try {
    JSON.parse(input);
    setStatus('✓ JSON 有效', 'valid');
  } catch (e) {
    setStatus('✗ JSON 无效', 'invalid');
  }
});