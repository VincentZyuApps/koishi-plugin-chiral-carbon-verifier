import { Context } from 'koishi'
import {} from 'koishi-plugin-adapter-onebot'
import { Config } from './types'
import { extendDatabase, DatabaseService } from './database'
import { Verifier } from './verifier'
import { registerEvents } from './events'
import { registerCommands } from './commands'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export const name = 'chiral-carbon-verifier'

const PLUGIN_NAME = name
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
)

export const inject = {
  required: ['database', 'http'],
}

export { Config } from './types'

export const usage = `
<h1>🧪 Koishi 插件: 手性碳入群验证 ${PLUGIN_NAME} 🧪</h1>
<h2>🎯 插件版本：v${pkg.version}</h2>

<p>基于 <a href="github.com/Jerryplusy/crystelf-plugin">crystelf-plugin</a> 的入群验证功能移植。</p>

<h2 style="color: #ff4444; font-weight: 900; font-size: 22px; margin: 20px 0;">⚠️ 重要提示：需要开启 <b>database</b> 和 <b>http</b> 插件，本插件才能正常使用捏！</h2>

<p><del>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>259248174</b>   🎉（这个群G了</del> </p> 
<p>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>1085190201</b> 🎉</p>
<p>💡 在群里直接艾特我，回复的更快哦~ ✨</p>

<hr>

<h3>🎯 功能特点</h3>
<ul>
  <li>🧪 <b>手性碳验证</b>：发送有机化学分子图，要求识别手性碳区域</li>
  <li>🔢 <b>数字验证</b>：简单的数学计算题（自动降级备选）</li>
  <li>🔄 <b>自动降级</b>：优先使用手性碳 API，失败时自动切换为数字验证</li>
  <li>⚙️ <b>灵活配置</b>：全局配置 + 群单独配置，支持困难模式</li>
  <li>💬 <b>自定义文案</b>：验证通过/失败/超时等所有文案均可自定义，支持模板变量</li>
</ul>

<hr>

<h3>📝 可用命令</h3>
<table>
  <tr><th>命令</th><th>别名</th><th>说明</th></tr>
  <tr><td><code>chiral.bypass @用户</code></td><td>绕过验证</td><td>管理员绕过指定用户的验证</td></tr>
  <tr><td><code>chiral.reverify @用户</code></td><td>重新验证</td><td>对指定用户重新发起验证</td></tr>
  <tr><td><code>chiral.enable</code></td><td>开启验证</td><td>开启本群入群验证</td></tr>
  <tr><td><code>chiral.disable</code></td><td>关闭验证</td><td>关闭本群入群验证</td></tr>
  <tr><td><code>chiral.mode [carbon/math]</code></td><td>切换验证模式</td><td>切换验证模式</td></tr>
  <tr><td><code>chiral.hard [true/false]</code></td><td>设置困难模式</td><td>设置手性碳困难模式</td></tr>
  <tr><td><code>chiral.stats</code></td><td>验证统计</td><td>查看本群验证统计</td></tr>
  <tr><td><code>chiral.config</code></td><td>验证配置</td><td>查看本群验证配置</td></tr>
</table>

<hr>

<h3>💬 自定义文案模板变量说明</h3>
<table>
  <tr><th>配置项</th><th>可用变量</th><th>说明</th></tr>
  <tr><td><code>mathPrompt</code></td><td><code>{timeout}</code> <code>{expression}</code></td><td>数学验证提示</td></tr>
  <tr><td><code>carbonPrompt</code></td><td><code>{timeout}</code> <code>{modeHint}</code> <code>{regionCount}</code></td><td>手性碳验证提示</td></tr>
  <tr><td><code>wrongAnswer</code></td><td><code>{remaining}</code></td><td>答错提醒</td></tr>
  <tr><td><code>timeoutReminder</code></td><td><code>{seconds}</code></td><td>超时前提醒</td></tr>
</table>

<hr>

<h3>⚠️ 注意事项</h3>
<ul>
  <li>需要 bot 有群管理员权限才能踢人</li>
  <li>手性碳 API 默认使用 <code>https://carbon.crystelf.top</code>，可在配置中修改</li>
  <li>主人账号可自动绕过验证</li>
</ul>

<hr>

<h3>📜 许可证</h3>
<p>本插件参考 crystelf-plugin（MIT License）的业务逻辑实现。</p>
<p>🆓 本插件为开源免费项目，基于 MIT 协议开放。</p>
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
