const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class CodeRepository {
  constructor(config) {
    this.config = config;
    this.outputDirectory = config.codeRepository.outputDirectory;

    this.initializeRepository();
  }

  initializeRepository() {
    try {
      if (!fs.existsSync(this.outputDirectory)) {
        fs.mkdirSync(this.outputDirectory, { recursive: true });
        logger.info(`创建输出目录: ${this.outputDirectory}`);
      } else {
        logger.info('输出目录已存在');
      }
    } catch (error) {
      logger.error('初始化代码仓库失败', { error: error.message });
    }
  }

  saveCode(task, result) {
    const taskId = task.id;
    const idea = task.idea;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${taskId}_${timestamp}.md`;
      const filePath = path.join(this.outputDirectory, fileName);

      const content = this.formatCodeFile(task, result);

      fs.writeFileSync(filePath, content, 'utf-8');
      logger.info(`代码文件已保存`, { taskId, filePath });

      return {
        success: true,
        filePath,
        fileName
      };
    } catch (error) {
      logger.error('保存代码文件失败', { taskId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  formatCodeFile(task, result) {
    const idea = task.idea;

    return `# iFlow 自动生成代码

## 任务信息
- 任务ID: ${task.id}
- 想法ID: ${idea.id}
- 来源: ${idea.source}
- 优先级: ${idea.priority}
- 创建时间: ${task.createdAt}
- 完成时间: ${task.completedAt}

## 用户想法
${idea.content}

## 执行结果
${result.success ? '✅ 成功' : '❌ 失败'}

${result.success ? `
## 生成的代码解决方案

${result.output.stdout || '无输出'}
` : `
## 错误信息
${result.error || '未知错误'}
`}

## 元数据
\`\`\`json
${JSON.stringify({
  taskId: task.id,
  ideaId: idea.id,
  source: idea.source,
  priority: idea.priority,
  timestamp: idea.timestamp,
  createdAt: task.createdAt,
  completedAt: task.completedAt,
  attempts: task.attempts,
  success: result.success
}, null, 2)}
\`\`\`

---
*此文件由 iFlow Continuous Development System 自动生成*
*生成时间: ${new Date().toISOString()}*
`;
  }

  getRepositoryStats() {
    try {
      const stats = {
        totalFiles: 0,
        directorySize: 0
      };

      if (fs.existsSync(this.outputDirectory)) {
        const files = fs.readdirSync(this.outputDirectory);
        stats.totalFiles = files.filter(f => f.endsWith('.md')).length;

        const size = this.getDirectorySize(this.outputDirectory);
        stats.directorySize = size;
      }

      return stats;
    } catch (error) {
      logger.error('获取仓库统计信息失败', { error: error.message });
      return null;
    }
  }

  getDirectorySize(dirPath) {
    let size = 0;
    try {
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          size += this.getDirectorySize(filePath);
        } else {
          size += stats.size;
        }
      });
    } catch (error) {
      logger.error('计算目录大小失败', { dirPath, error: error.message });
    }
    return size;
  }

  cleanupOldFiles(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.outputDirectory);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let deletedCount = 0;

      files.forEach(file => {
        if (file.endsWith('.md') && file !== 'README.md') {
          const filePath = path.join(this.outputDirectory, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            deletedCount++;
            logger.info('删除旧文件', { file, mtime: stats.mtime });
          }
        }
      });

      return deletedCount;
    } catch (error) {
      logger.error('清理旧文件失败', { error: error.message });
      return 0;
    }
  }
}

module.exports = CodeRepository;