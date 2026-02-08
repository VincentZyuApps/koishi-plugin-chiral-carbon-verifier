import { Context } from 'koishi'
import {} from 'koishi-plugin-adapter-onebot'
import { Config } from './types'
import { extendDatabase, DatabaseService } from './database'
import { Verifier } from './verifier'
import { registerEvents } from './events'
import { registerCommands } from './commands'

export const name = 'chiral-carbon-verifier'

export const inject = {
  required: ['database', 'http'],
}

export { Config } from './types'

export const usage = `
## 🧪 手性碳入群验证插件

基于 [crystelf-plugin](https://github.com/crystelf/crystelf-plugin) 的入群验证功能移植。

### 🎯 功能特点

1. **双模式验证**
   - 🧪 **手性碳验证**：发送有机化学分子图，要求识别手性碳区域
   - 🔢 **数字验证**：简单的数学计算题（自动降级备选）

2. **自动降级机制**
   - 优先使用手性碳 API
   - API 失败时自动切换为数字验证

3. **灵活配置**
   - 全局配置 + 群单独配置
   - 支持困难模式（需答出所有区域）
   - 可配置超时时间、尝试次数、是否踢出等

### 📝 可用命令

| 命令 | 别名 | 说明 |
|------|------|------|
| \`chiral.bypass @用户\` | 绕过验证 | 管理员绕过指定用户的验证 |
| \`chiral.reverify @用户\` | 重新验证 | 对指定用户重新发起验证 |
| \`chiral.enable\` | 开启验证 | 开启本群入群验证 |
| \`chiral.disable\` | 关闭验证 | 关闭本群入群验证 |
| \`chiral.mode [carbon/math]\` | 切换验证模式 | 切换验证模式 |
| \`chiral.hard [true/false]\` | 设置困难模式 | 设置手性碳困难模式 |
| \`chiral.stats\` | 验证统计 | 查看本群验证统计 |
| \`chiral.config\` | 验证配置 | 查看本群验证配置 |

### ⚠️ 注意事项

- 需要 bot 有群管理员权限才能踢人
- 手性碳 API 默认使用 \`https://api.crystelf.com\`，可在配置中修改
- 主人账号可自动绕过验证

### 📜 许可证

本插件参考 crystelf-plugin（MIT License）的业务逻辑实现。
`

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('chiral-carbon-verifier')

  logger.info('插件正在加载...')

  // 扩展数据库
  extendDatabase(ctx)
  logger.info('已扩展数据库模型')

  // 创建服务实例
  const db = new DatabaseService(ctx)
  const verifier = new Verifier(ctx, config, db)

  // 注册事件监听器
  const utils = registerEvents(ctx, config, db, verifier)

  // 注册命令
  registerCommands(ctx, config, db, verifier, utils)

  // 定时清理过期记录（每小时清理 30 天前的记录）
  ctx.setInterval(async () => {
    const beforeTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000
    const count = await db.cleanupOldRecords(beforeTimestamp)
    if (count > 0) {
      logger.info(`已清理 ${count} 条过期验证记录`)
    }
  }, 60 * 60 * 1000)

  logger.info('插件加载完成 ✅')
}
