// 文本对比工具核心逻辑
class TextDiffTool {
    constructor() {
        this.originalText = document.getElementById('originalText');
        this.modifiedText = document.getElementById('modifiedText');
        this.compareBtn = document.getElementById('compareBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.resultContainer = document.getElementById('resultContainer');
        this.diffOutput = document.getElementById('diffOutput');
        this.diffStats = document.getElementById('diffStats');

        this.bindEvents();
    }

    bindEvents() {
        this.compareBtn.addEventListener('click', () => this.compare());
        this.clearBtn.addEventListener('click', () => this.clear());
    }

    // 简单的 diff 算法实现
    computeDiff(original, modified) {
        const originalLines = original.split('\n');
        const modifiedLines = modified.split('\n');
        
        const result = [];
        let i = 0, j = 0;
        
        while (i < originalLines.length || j < modifiedLines.length) {
            if (i < originalLines.length && j < modifiedLines.length) {
                if (originalLines[i] === modifiedLines[j]) {
                    result.push({
                        type: 'unchanged',
                        content: originalLines[i],
                        originalLine: i + 1,
                        modifiedLine: j + 1
                    });
                    i++;
                    j++;
                } else {
                    // 检查是否是删除
                    const nextMatchInModified = modifiedLines.indexOf(originalLines[i], j);
                    if (nextMatchInModified !== -1 && nextMatchInModified - j < 3) {
                        // 先处理插入
                        for (let k = j; k < nextMatchInModified; k++) {
                            result.push({
                                type: 'added',
                                content: modifiedLines[k],
                                originalLine: null,
                                modifiedLine: k + 1
                            });
                        }
                        j = nextMatchInModified;
                    } else {
                        // 处理删除
                        result.push({
                            type: 'removed',
                            content: originalLines[i],
                            originalLine: i + 1,
                            modifiedLine: null
                        });
                        i++;
                    }
                }
            } else if (i < originalLines.length) {
                // 剩余的都是删除
                result.push({
                    type: 'removed',
                    content: originalLines[i],
                    originalLine: i + 1,
                    modifiedLine: null
                });
                i++;
            } else if (j < modifiedLines.length) {
                // 剩余的都是添加
                result.push({
                    type: 'added',
                    content: modifiedLines[j],
                    originalLine: null,
                    modifiedLine: j + 1
                });
                j++;
            }
        }
        
        return result;
    }

    compare() {
        const original = this.originalText.value;
        const modified = this.modifiedText.value;

        if (!original && !modified) {
            alert('请输入需要对比的文本内容');
            return;
        }

        const diffResult = this.computeDiff(original, modified);
        this.renderDiff(diffResult);
        this.updateStats(diffResult);
        
        this.resultContainer.style.display = 'block';
    }

    renderDiff(diffResult) {
        this.diffOutput.innerHTML = diffResult.map(item => {
            const lineNumber = item.type === 'unchanged' 
                ? `<span class="diff-line-number">${item.originalLine}</span>`
                : `<span class="diff-line-number">${item.originalLine || '-'}</span>`;
            
            const prefix = item.type === 'added' ? '+' : item.type === 'removed' ? '-' : ' ';
            
            return `<div class="diff-line ${item.type}">${lineNumber}${prefix} ${this.escapeHtml(item.content)}</div>`;
        }).join('');
    }

    updateStats(diffResult) {
        const added = diffResult.filter(item => item.type === 'added').length;
        const removed = diffResult.filter(item => item.type === 'removed').length;
        const unchanged = diffResult.filter(item => item.type === 'unchanged').length;

        this.diffStats.innerHTML = `
            <div class="stat added">
                <strong>+${added}</strong> 行新增
            </div>
            <div class="stat removed">
                <strong>-${removed}</strong> 行删除
            </div>
            <div class="stat unchanged">
                <strong>${unchanged}</strong> 行未变
            </div>
        `;
    }

    clear() {
        this.originalText.value = '';
        this.modifiedText.value = '';
        this.resultContainer.style.display = 'none';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new TextDiffTool();
});