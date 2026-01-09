// 颜色工具函数
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function adjustBrightness(hex, percent) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    
    return rgbToHex(
        rgb.r * (1 + percent / 100),
        rgb.g * (1 + percent / 100),
        rgb.b * (1 + percent / 100)
    );
}

function getComplementaryColor(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    
    return rgbToHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b);
}

function getAnalogousColors(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return [hex, hex, hex];
    
    // HSL 转换和调整
    const toHsl = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: h * 360, s, l };
    };
    
    const toRgb = (h, s, l) => {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h / 360 + 1/3);
            g = hue2rgb(p, q, h / 360);
            b = hue2rgb(p, q, h / 360 - 1/3);
        }
        return rgbToHex(r * 255, g * 255, b * 255);
    };
    
    const hsl = toHsl(rgb.r, rgb.g, rgb.b);
    return [
        toRgb((hsl.h + 30) % 360, hsl.s, hsl.l),
        toRgb((hsl.h + 330) % 360, hsl.s, hsl.l)
    ];
}

// DOM 元素
const colorInputsContainer = document.getElementById('colorInputs');
const gradientPreview = document.getElementById('gradientPreview');
const gradientCode = document.getElementById('gradientCode');
const angleInput = document.getElementById('angle');
const angleValue = document.getElementById('angleValue');
const palettesContainer = document.getElementById('palettes');
const addColorBtn = document.getElementById('addColor');
const removeColorBtn = document.getElementById('removeColor');
const copyGradientBtn = document.getElementById('copyGradient');
const toast = document.getElementById('toast');

// 显示 Toast
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// 复制到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`已复制: ${text}`);
    }).catch(() => {
        showToast('复制失败');
    });
}

// 获取所有颜色值
function getColors() {
    const colorInputs = colorInputsContainer.querySelectorAll('input[type="color"]');
    return Array.from(colorInputs).map(input => input.value);
}

// 更新渐变预览
function updateGradient() {
    const colors = getColors();
    const angle = angleInput.value;
    
    const gradient = `linear-gradient(${angle}deg, ${colors.join(', ')})`;
    gradientPreview.style.background = gradient;
    gradientCode.textContent = `background: ${gradient};`;
    
    // 更新页面背景
    document.body.style.background = gradient;
    
    // 生成色板
    generatePalettes(colors);
}

// 添加颜色输入
function addColorInput() {
    const colorInputs = colorInputsContainer.querySelectorAll('input[type="color"]');
    if (colorInputs.length >= 5) {
        showToast('最多支持 5 个颜色');
        return;
    }
    
    const wrapper = document.createElement('div');
    wrapper.className = 'color-input-wrapper';
    wrapper.innerHTML = `
        <input type="color" value="#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}">
        <input type="text" class="color-text" value="" readonly>
    `;
    
    colorInputsContainer.appendChild(wrapper);
    
    const colorInput = wrapper.querySelector('input[type="color"]');
    const textInput = wrapper.querySelector('.color-text');
    textInput.value = colorInput.value;
    
    colorInput.addEventListener('input', () => {
        textInput.value = colorInput.value;
        updateGradient();
    });
    
    updateGradient();
}

// 移除颜色输入
function removeColorInput() {
    const colorInputs = colorInputsContainer.querySelectorAll('input[type="color"]');
    if (colorInputs.length <= 2) {
        showToast('至少需要 2 个颜色');
        return;
    }
    
    colorInputsContainer.removeChild(colorInputsContainer.lastElementChild);
    updateGradient();
}

// 生成色板
function generatePalettes(colors) {
    palettesContainer.innerHTML = '';
    
    // 基于中间颜色生成色板
    const midIndex = Math.floor(colors.length / 2);
    const baseColor = colors[midIndex];
    
    // 1. 亮度变化色板
    const brightnessPalette = document.createElement('div');
    brightnessPalette.className = 'palette';
    brightnessPalette.innerHTML = `
        <div class="palette-title">亮度变化</div>
        <div class="palette-colors"></div>
    `;
    const brightnessColors = brightnessPalette.querySelector('.palette-colors');
    
    [-40, -20, 0, 20, 40].forEach(percent => {
        const color = adjustBrightness(baseColor, percent);
        const colorDiv = document.createElement('div');
        colorDiv.className = 'palette-color';
        colorDiv.style.background = color;
        colorDiv.setAttribute('data-color', color);
        colorDiv.addEventListener('click', () => copyToClipboard(color));
        brightnessColors.appendChild(colorDiv);
    });
    
    palettesContainer.appendChild(brightnessPalette);
    
    // 2. 互补色色板
    const complementaryPalette = document.createElement('div');
    complementaryPalette.className = 'palette';
    complementaryPalette.innerHTML = `
        <div class="palette-title">互补色</div>
        <div class="palette-colors"></div>
    `;
    const complementaryColors = complementaryPalette.querySelector('.palette-colors');
    
    colors.forEach(color => {
        const complementary = getComplementaryColor(color);
        const colorDiv = document.createElement('div');
        colorDiv.className = 'palette-color';
        colorDiv.style.background = complementary;
        colorDiv.setAttribute('data-color', complementary);
        colorDiv.addEventListener('click', () => copyToClipboard(complementary));
        complementaryColors.appendChild(colorDiv);
    });
    
    palettesContainer.appendChild(complementaryPalette);
    
    // 3. 类似色色板
    const analogousPalette = document.createElement('div');
    analogousPalette.className = 'palette';
    analogousPalette.innerHTML = `
        <div class="palette-title">类似色</div>
        <div class="palette-colors"></div>
    `;
    const analogousColors = analogousPalette.querySelector('.palette-colors');
    
    const analogous = getAnalogousColors(baseColor);
    analogous.unshift(baseColor);
    analogous.forEach(color => {
        const colorDiv = document.createElement('div');
        colorDiv.className = 'palette-color';
        colorDiv.style.background = color;
        colorDiv.setAttribute('data-color', color);
        colorDiv.addEventListener('click', () => copyToClipboard(color));
        analogousColors.appendChild(colorDiv);
    });
    
    palettesContainer.appendChild(analogousPalette);
    
    // 4. 渐变衍生色板
    const derivedPalette = document.createElement('div');
    derivedPalette.className = 'palette';
    derivedPalette.innerHTML = `
        <div class="palette-title">渐变衍生</div>
        <div class="palette-colors"></div>
    `;
    const derivedColors = derivedPalette.querySelector('.palette-colors');
    
    colors.forEach(color => {
        const lighter = adjustBrightness(color, 30);
        const darker = adjustBrightness(color, -30);
        
        [lighter, color, darker].forEach(c => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'palette-color';
            colorDiv.style.background = c;
            colorDiv.setAttribute('data-color', c);
            colorDiv.addEventListener('click', () => copyToClipboard(c));
            derivedColors.appendChild(colorDiv);
        });
    });
    
    palettesContainer.appendChild(derivedPalette);
}

// 事件监听
document.querySelectorAll('.color-input-wrapper').forEach(wrapper => {
    const colorInput = wrapper.querySelector('input[type="color"]');
    const textInput = wrapper.querySelector('.color-text');
    
    colorInput.addEventListener('input', () => {
        textInput.value = colorInput.value;
        updateGradient();
    });
});

angleInput.addEventListener('input', () => {
    angleValue.textContent = angleInput.value;
    updateGradient();
});

addColorBtn.addEventListener('click', addColorInput);
removeColorBtn.addEventListener('click', removeColorInput);
copyGradientBtn.addEventListener('click', () => {
    copyToClipboard(gradientCode.textContent);
});

// 初始化
updateGradient();