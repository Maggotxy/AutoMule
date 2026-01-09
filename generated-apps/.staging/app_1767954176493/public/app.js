const inputJson = document.getElementById('inputJson');
const outputJson = document.getElementById('outputJson');
const inputError = document.getElementById('inputError');
const outputStatus = document.getElementById('outputStatus');

const formatBtn = document.getElementById('formatBtn');
const minifyBtn = document.getElementById('minifyBtn');
const validateBtn = document.getElementById('validateBtn');
const clearBtn = document.getElementById('clearBtn');
const sampleBtn = document.getElementById('sampleBtn');
const copyBtn = document.getElementById('copyBtn');

function showError(message, element) {
  element.textContent = message;
  element.classList.add('show');
}

function hideError(element) {
  element.textContent = '';
  element.classList.remove('show');
}

function showStatus(message, element) {
  element.textContent = message;
  element.classList.add('show');
}

function hideStatus(element) {
  element.textContent = '';
  element.classList.remove('show');
}

function parseJson(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`JSON 语法错误: ${error.message}`);
  }
}

function syntaxHighlight(json) {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }

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

function formatJson() {
  hideError(inputError);
  hideStatus(outputStatus);

  const input = inputJson.value.trim();

  if (!input) {
    showError('请输入 JSON 内容', inputError);
    return;
  }

  try {
    const parsed = parseJson(input);
    const formatted = JSON.stringify(parsed, null, 2);
    outputJson.innerHTML = syntaxHighlight(formatted);
    showStatus('格式化成功！', outputStatus);
  } catch (error) {
    showError(error.message, inputError);
    outputJson.innerHTML = '';
  }
}

function minifyJson() {
  hideError(inputError);
  hideStatus(outputStatus);

  const input = inputJson.value.trim();

  if (!input) {
    showError('请输入 JSON 内容', inputError);
    return;
  }

  try {
    const parsed = parseJson(input);
    const minified = JSON.stringify(parsed);
    outputJson.innerHTML = syntaxHighlight(minified);
    showStatus('压缩成功！', outputStatus);
  } catch (error) {
    showError(error.message, inputError);
    outputJson.innerHTML = '';
  }
}

function validateJson() {
  hideError(inputError);
  hideStatus(outputStatus);

  const input = inputJson.value.trim();

  if (!input) {
    showError('请输入 JSON 内容', inputError);
    return;
  }

  try {
    const parsed = parseJson(input);
    outputJson.innerHTML = syntaxHighlight(JSON.stringify(parsed, null, 2));
    showStatus('JSON 格式正确！', outputStatus);
  } catch (error) {
    showError(error.message, inputError);
    outputJson.innerHTML = '';
  }
}

function clearInput() {
  inputJson.value = '';
  outputJson.innerHTML = '';
  hideError(inputError);
  hideStatus(outputStatus);
}

function loadSample() {
  const sample = {
    "name": "JSON 格式化工具",
    "version": "1.0.0",
    "features": [
      "格式化",
      "压缩",
      "校验",
      "语法高亮"
    ],
    "settings": {
      "indentSize": 2,
      "theme": "dark",
      "autoFormat": true
    },
    "active": true,
    "downloads": null
  };

  inputJson.value = JSON.stringify(sample, null, 2);
  hideError(inputError);
  hideStatus(outputStatus);
  outputJson.innerHTML = '';
}

function copyOutput() {
  const outputText = outputJson.textContent;

  if (!outputText) {
    showStatus('没有可复制的内容', outputStatus);
    return;
  }

  navigator.clipboard.writeText(outputText).then(() => {
    showStatus('已复制到剪贴板！', outputStatus);
    setTimeout(() => hideStatus(outputStatus), 2000);
  }).catch(() => {
    showStatus('复制失败', outputStatus);
  });
}

formatBtn.addEventListener('click', formatJson);
minifyBtn.addEventListener('click', minifyJson);
validateBtn.addEventListener('click', validateJson);
clearBtn.addEventListener('click', clearInput);
sampleBtn.addEventListener('click', loadSample);
copyBtn.addEventListener('click', copyOutput);

inputJson.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = inputJson.selectionStart;
    const end = inputJson.selectionEnd;
    inputJson.value = inputJson.value.substring(0, start) + '  ' + inputJson.value.substring(end);
    inputJson.selectionStart = inputJson.selectionEnd = start + 2;
  }
});