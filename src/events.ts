import { Context, h, Logger, Session } from 'koishi'
import {} from 'koishi-plugin-adapter-onebot'
import { Config, VerifyType } from './types'
import { DatabaseService } from './database'
import { Verifier, renderTemplate } from './verifier'

const logger = new Logger('chiral-carbon-verifier:events')

/** 事件工具类 */
export class EventUtils {
  constructor(
    private ctx: Context,
    private config: Config,
    private db: DatabaseService,
    private verifier: Verifier
  ) {}

  /** 踢出用户 */
  async kickUser(session: Session, userId: string): Promise<boolean> {
    try {
      // 使用 onebot 原生 API
      if (session.onebot) {
        await session.onebot.setGroupKick(session.guildId, userId, false)
        logger.info(`已踢出用户 ${userId} 从群 ${session.guildId}`)
        return true
      }
      
      // 尝试使用标准 API（通过 any 类型绕过检查）
      const bot = session.bot as any
      if (typeof bot.kickGuildMember === 'function') {
        await bot.kickGuildMember(session.guildId, userId)
        logger.info(`已踢出用户 ${userId} 从群 ${session.guildId}`)
        return true
      }

      logger.warn(`无法踢出用户 ${userId}，当前适配器不支持`)
      return false
    } catch (error) {
      logger.error(`踢出用户 ${userId} 失败:`, error)
      return false
    }
  }

  /** 撤回消息 */
  async recallMessage(session: Session, messageId: string): Promise<boolean> {
    try {
      await session.bot.deleteMessage(session.channelId, messageId)
      return true
    } catch (error) {
      logger.warn(`撤回消息 ${messageId} 失败:`, error)
      return false
    }
  }
}

/** 注册事件监听器 */
export function registerEvents(
  ctx: Context,
  config: Config,
  db: DatabaseService,
  verifier: Verifier
): EventUtils {
  const utils = new EventUtils(ctx, config, db, verifier)

  // ==================== 群成员增加事件 ====================
  ctx.on('guild-member-added', async (session) => {
    const { guildId, userId, platform } = session

    logger.info(`[guild-member-added] 群 ${guildId} 新成员 ${userId}`)

    // 检查是否为 bot 自己
    if (userId === session.selfId) {
      logger.info('新成员是 bot 自己，跳过验证')
      return
    }

    // 检查是否为主人
    if (verifier.isMaster(platform, userId)) {
      logger.info(`用户 ${userId} 是主人，跳过验证`)
      return
    }

    // 获取群配置
    const groupConfig = await verifier.getGroupConfig(guildId)
    if (!groupConfig.enabled) {
      logger.info(`群 ${guildId} 未启用验证`)
      return
    }

    // 检查是否已在验证中
    if (verifier.isVerifying(guildId, userId)) {
      logger.info(`用户 ${userId} 已在验证中`)
      return
    }

    // 开始验证
    logger.info(`开始对用户 ${userId} 进行入群验证`)
    const result = await verifier.startVerify(guildId, userId, platform)

    if (!result.success) {
      logger.error('启动验证失败')
      return
    }

    // 发送验证消息
    await session.send(result.message)

    // 设置超时提醒
    if (config.reminderBeforeTimeout > 0 && config.verifyTimeout > config.reminderBeforeTimeout) {
      const reminderDelay = (config.verifyTimeout - config.reminderBeforeTimeout) * 1000
      
      ctx.setTimeout(async () => {
        if (verifier.isVerifying(guildId, userId)) {
          await session.send([
            h.at(userId),
            h.text('\n' + renderTemplate(config.messages.timeoutReminder, { seconds: config.reminderBeforeTimeout })),
          ])
        }
      }, reminderDelay)
    }

    // 设置超时处理
    ctx.setTimeout(async () => {
      if (verifier.isVerifying(guildId, userId)) {
        await verifier.handleTimeout(guildId, userId)
        
        await session.send([
          h.at(userId),
          h.text('\n' + config.messages.verifyTimeout),
        ])

        if (config.kickOnFail) {
          await utils.kickUser(session, userId)
        }
      }
    }, config.verifyTimeout * 1000)
  })

  // ==================== 群成员减少事件 ====================
  ctx.on('guild-member-removed', async (session) => {
    const { guildId, userId } = session

    // 如果用户正在验证中，清理会话
    if (verifier.isVerifying(guildId, userId)) {
      verifier.removeSession(guildId, userId)
      logger.info(`用户 ${userId} 主动退群，验证流程结束`)
      
      await session.send(config.messages.memberLeft)
    }
  })

  // ==================== 群消息监听（答题） ====================
  ctx.middleware(async (session, next) => {
    // 只处理群消息
    if (!session.guildId || session.isDirect) {
      return next()
    }

    const { guildId, userId, content, messageId } = session

    // 检查是否在验证中
    const verifySession = verifier.getSession(guildId, userId)
    if (!verifySession) {
      return next()
    }

    // 提取纯文本答案
    const textContent = h.select(session.elements, 'text')
      .map(el => el.attrs.content)
      .join('')
      .trim()

    if (!textContent) {
      return next()
    }

    // 验证答案
    const result = await verifier.checkAnswer(guildId, userId, textContent)

    if (result.passed) {
      // 验证通过
      await session.send([
        h.at(userId),
        h.text(`\n${result.message}`),
      ])
      return
    }

    if (result.failed) {
      // 验证失败
      if (config.recallWrongAnswer) {
        await utils.recallMessage(session, messageId)
      }
      
      await session.send([
        h.at(userId),
        h.text(`\n${result.message}`),
      ])

      if (config.kickOnFail) {
        await utils.kickUser(session, userId)
      }
      return
    }

    // 答错但还有机会
    if (config.recallWrongAnswer) {
      await utils.recallMessage(session, messageId)
    }

    await session.send([
      h.at(userId),
      h.text(`\n${result.message}`),
    ])

    // 不调用 next()，拦截这条消息
  }, true) // true 表示前置中间件

  return utils
}
