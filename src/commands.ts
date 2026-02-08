import { Context, h } from 'koishi'
import {} from 'koishi-plugin-adapter-onebot'
import { Config, VerifyStatus } from './types'
import { DatabaseService } from './database'
import { Verifier } from './verifier'
import { EventUtils } from './events'

/** 注册命令 */
export function registerCommands(
  ctx: Context,
  config: Config,
  db: DatabaseService,
  verifier: Verifier,
  utils: EventUtils
) {
  const cmd = ctx.command('chiral', '手性碳入群验证管理')

  // ==================== 绕过验证 ====================
  cmd.subcommand('.bypass <user:user>', '绕过指定用户的验证')
    .alias('绕过验证')
    .usage('需要群管理员权限')
    .example('chiral.bypass @用户')
    .action(async ({ session }, user) => {
      if (!session.guildId) {
        return '此命令只能在群聊中使用'
      }

      // 检查权限
      const isAdmin = await checkIsAdmin(session)
      const isMaster = verifier.isMaster(session.platform, session.userId)
      
      if (!isAdmin && !isMaster) {
        return '只有群主或管理员可以使用此命令'
      }

      if (!user) {
        return '请指定要绕过验证的用户，例如：chiral.bypass @用户'
      }

      // 解析用户 ID
      const targetUserId = user.split(':')[1]
      if (!targetUserId) {
        return '无法解析用户 ID'
      }

      // 检查用户是否在验证中
      if (!verifier.isVerifying(session.guildId, targetUserId)) {
        return [
          h.at(targetUserId),
          h.text(' 当前没有正在进行的验证'),
        ]
      }

      // 绕过验证
      await verifier.bypassVerify(session.guildId, targetUserId)

      return [
        h.at(targetUserId),
        h.text(' 已绕过验证，欢迎加入本群~'),
      ]
    })

  // ==================== 重新验证 ====================
  cmd.subcommand('.reverify <user:user>', '对指定用户重新发起验证')
    .alias('重新验证')
    .usage('需要群管理员权限')
    .example('chiral.reverify @用户')
    .action(async ({ session }, user) => {
      if (!session.guildId) {
        return '此命令只能在群聊中使用'
      }

      // 检查权限
      const isAdmin = await checkIsAdmin(session)
      const isMaster = verifier.isMaster(session.platform, session.userId)
      
      if (!isAdmin && !isMaster) {
        return '只有群主或管理员可以使用此命令'
      }

      if (!user) {
        return '请指定要重新验证的用户，例如：chiral.reverify @用户'
      }

      // 解析用户 ID
      const targetUserId = user.split(':')[1]
      if (!targetUserId) {
        return '无法解析用户 ID'
      }

      // 检查是否已在验证中
      if (verifier.isVerifying(session.guildId, targetUserId)) {
        return '该用户已在验证中..'
      }

      // 开始验证
      const result = await verifier.startVerify(session.guildId, targetUserId, session.platform)
      
      if (!result.success) {
        return '启动验证失败'
      }

      // 发送验证消息
      await session.send(result.message)

      // 设置超时处理
      ctx.setTimeout(async () => {
        if (verifier.isVerifying(session.guildId, targetUserId)) {
          await verifier.handleTimeout(session.guildId, targetUserId)
          
          await session.send([
            h.at(targetUserId),
            h.text('\n验证超时啦！'),
          ])

          if (config.kickOnFail) {
            await utils.kickUser(session, targetUserId)
          }
        }
      }, config.verifyTimeout * 1000)
    })

  // ==================== 开启/关闭验证 ====================
  cmd.subcommand('.enable', '开启本群入群验证')
    .alias('开启验证')
    .action(async ({ session }) => {
      if (!session.guildId) {
        return '此命令只能在群聊中使用'
      }

      const isAdmin = await checkIsAdmin(session)
      const isMaster = verifier.isMaster(session.platform, session.userId)
      
      if (!isAdmin && !isMaster) {
        return '只有群主或管理员可以设置验证'
      }

      await db.saveGroupConfig({
        guildId: session.guildId,
        enabled: true,
        useCarbonMode: true,
        hardMode: false,
        showHint: true,
      })

      return '本群已开启入群验证~'
    })

  cmd.subcommand('.disable', '关闭本群入群验证')
    .alias('关闭验证')
    .action(async ({ session }) => {
      if (!session.guildId) {
        return '此命令只能在群聊中使用'
      }

      const isAdmin = await checkIsAdmin(session)
      const isMaster = verifier.isMaster(session.platform, session.userId)
      
      if (!isAdmin && !isMaster) {
        return '只有群主或管理员可以设置验证'
      }

      const currentConfig = await verifier.getGroupConfig(session.guildId)
      await db.saveGroupConfig({
        guildId: session.guildId,
        enabled: false,
        useCarbonMode: currentConfig.useCarbonMode,
        hardMode: currentConfig.hardMode,
        showHint: currentConfig.showHint,
      })

      return '已关闭本群入群验证'
    })

  // ==================== 切换验证模式 ====================
  cmd.subcommand('.mode [mode:string]', '切换验证模式')
    .alias('切换验证模式')
    .usage('可选模式：carbon（手性碳）/ math（数字）')
    .example('chiral.mode carbon')
    .action(async ({ session }, mode) => {
      if (!session.guildId) {
        return '此命令只能在群聊中使用'
      }

      const isAdmin = await checkIsAdmin(session)
      const isMaster = verifier.isMaster(session.platform, session.userId)
      
      if (!isAdmin && !isMaster) {
        return '只有群主或管理员可以设置验证'
      }

      const currentConfig = await verifier.getGroupConfig(session.guildId)
      
      if (!mode) {
        // 切换模式
        const newUseCarbonMode = !currentConfig.useCarbonMode
        await db.saveGroupConfig({
          guildId: session.guildId,
          enabled: currentConfig.enabled,
          useCarbonMode: newUseCarbonMode,
          hardMode: currentConfig.hardMode,
          showHint: currentConfig.showHint,
        })
        return newUseCarbonMode ? '已切换为手性碳验证模式~' : '已切换为数字验证模式'
      }

      // 指定模式
      const useCarbonMode = mode.toLowerCase() === 'carbon'
      await db.saveGroupConfig({
        guildId: session.guildId,
        enabled: currentConfig.enabled,
        useCarbonMode,
        hardMode: currentConfig.hardMode,
        showHint: currentConfig.showHint,
      })

      return useCarbonMode ? '已切换为手性碳验证模式~' : '已切换为数字验证模式'
    })

  // ==================== 设置困难模式 ====================
  cmd.subcommand('.hard [enable:boolean]', '设置手性碳困难模式')
    .alias('设置困难模式')
    .usage('困难模式需要答出所有手性碳区域')
    .action(async ({ session }, enable) => {
      if (!session.guildId) {
        return '此命令只能在群聊中使用'
      }

      const isAdmin = await checkIsAdmin(session)
      const isMaster = verifier.isMaster(session.platform, session.userId)
      
      if (!isAdmin && !isMaster) {
        return '只有群主或管理员可以设置验证'
      }

      const currentConfig = await verifier.getGroupConfig(session.guildId)
      const newHardMode = enable !== undefined ? enable : !currentConfig.hardMode

      await db.saveGroupConfig({
        guildId: session.guildId,
        enabled: currentConfig.enabled,
        useCarbonMode: currentConfig.useCarbonMode,
        hardMode: newHardMode,
        showHint: currentConfig.showHint,
      })

      return newHardMode ? '已开启手性碳困难模式' : '已关闭手性碳困难模式'
    })

  // ==================== 查看统计 ====================
  cmd.subcommand('.stats', '查看本群验证统计')
    .alias('验证统计')
    .action(async ({ session }) => {
      if (!session.guildId) {
        return '此命令只能在群聊中使用'
      }

      const stats = await db.getGuildStats(session.guildId)
      const groupConfig = await verifier.getGroupConfig(session.guildId)

      return [
        `📊 本群验证统计`,
        `━━━━━━━━━━━━━━`,
        `📌 验证状态: ${groupConfig.enabled ? '✅ 已开启' : '❌ 已关闭'}`,
        `🧪 验证模式: ${groupConfig.useCarbonMode ? '手性碳' : '数字'}`,
        `💪 困难模式: ${groupConfig.hardMode ? '是' : '否'}`,
        `━━━━━━━━━━━━━━`,
        `📈 总验证次数: ${stats.total}`,
        `✅ 通过: ${stats.passed}`,
        `❌ 失败: ${stats.failed}`,
        `⏰ 超时: ${stats.expired}`,
        `📊 通过率: ${stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0}%`,
      ].join('\n')
    })

  // ==================== 查看当前配置 ====================
  cmd.subcommand('.config', '查看本群验证配置')
    .alias('验证配置')
    .action(async ({ session }) => {
      if (!session.guildId) {
        return '此命令只能在群聊中使用'
      }

      const groupConfig = await verifier.getGroupConfig(session.guildId)

      return [
        `⚙️ 本群验证配置`,
        `━━━━━━━━━━━━━━`,
        `📌 启用验证: ${groupConfig.enabled ? '是' : '否'}`,
        `🧪 使用手性碳: ${groupConfig.useCarbonMode ? '是' : '否'}`,
        `💪 困难模式: ${groupConfig.hardMode ? '是' : '否'}`,
        `💡 显示提示: ${groupConfig.showHint ? '是' : '否'}`,
        `━━━━━━━━━━━━━━`,
        `⏱️ 超时时间: ${config.verifyTimeout} 秒`,
        `🔢 最大尝试: ${config.maxAttempts} 次`,
        `🗑️ 撤回错误: ${config.recallWrongAnswer ? '是' : '否'}`,
        `👢 失败踢出: ${config.kickOnFail ? '是' : '否'}`,
      ].join('\n')
    })
}

/** 检查是否为群管理员 */
async function checkIsAdmin(session: any): Promise<boolean> {
  try {
    // OneBot 适配器
    if (session.onebot) {
      const info = await session.onebot.getGroupMemberInfo(session.guildId, session.userId)
      return info.role === 'owner' || info.role === 'admin'
    }

    // 标准 API（如果有）
    if (session.author?.roles) {
      return session.author.roles.includes('admin') || session.author.roles.includes('owner')
    }

    return false
  } catch {
    return false
  }
}
