import { Context, Logger, h } from 'koishi'
import { Config, VerifyType, VerifySession, VerifyStatus, GroupConfig } from './types'
import { DatabaseService } from './database'

const logger = new Logger('chiral-carbon-verifier:verifier')

/** 手性碳 API 响应类型 */
interface CarbonApiResponse {
  code?: number
  data?: {
    data?: {
      base64: string
      regions: string[]
    }
  }
}

/** 验证器核心类 */
export class Verifier {
  /** 活跃的验证会话 Map<guildId_userId, VerifySession> */
  private sessions = new Map<string, VerifySession>()

  constructor(
    private ctx: Context,
    private config: Config,
    private db: DatabaseService
  ) {}

  /** 生成会话 key */
  private getSessionKey(guildId: string, userId: string): string {
    return `${guildId}_${userId}`
  }

  /** 获取群配置（优先数据库配置，其次全局配置） */
  async getGroupConfig(guildId: string): Promise<{
    enabled: boolean
    useCarbonMode: boolean
    hardMode: boolean
    showHint: boolean
  }> {
    // 先查配置项中的群配置
    const configGroup = this.config.groupConfigs.find(g => g.guildId === guildId)
    if (configGroup) {
      return configGroup
    }

    // 再查数据库中的群配置
    const dbConfig = await this.db.getGroupConfig(guildId)
    if (dbConfig) {
      return dbConfig
    }

    // 返回默认配置
    return {
      enabled: this.config.enabled,
      useCarbonMode: true,
      hardMode: false,
      showHint: true,
    }
  }

  /** 检查用户是否为主人 */
  isMaster(platform: string, userId: string): boolean {
    return this.config.masterAccounts.some(
      m => m.enabled && m.platform === platform && m.userId === userId
    )
  }

  /** 检查用户是否正在验证中 */
  isVerifying(guildId: string, userId: string): boolean {
    return this.sessions.has(this.getSessionKey(guildId, userId))
  }

  /** 获取验证会话 */
  getSession(guildId: string, userId: string): VerifySession | undefined {
    return this.sessions.get(this.getSessionKey(guildId, userId))
  }

  /** 删除验证会话 */
  removeSession(guildId: string, userId: string): void {
    this.sessions.delete(this.getSessionKey(guildId, userId))
  }

  /** 开始验证流程 */
  async startVerify(
    guildId: string,
    userId: string,
    platform: string
  ): Promise<{
    success: boolean
    type: VerifyType
    message: h[]
    imageBase64?: string
  }> {
    const key = this.getSessionKey(guildId, userId)
    const groupConfig = await this.getGroupConfig(guildId)

    // 如果已有会话，先删除
    if (this.sessions.has(key)) {
      this.sessions.delete(key)
    }

    const now = Date.now()
    const expiresAt = now + this.config.verifyTimeout * 1000

    // 尝试使用手性碳验证
    if (groupConfig.useCarbonMode) {
      try {
        const carbonResult = await this.fetchCarbonQuestion(groupConfig.showHint)
        
        if (carbonResult) {
          const session: VerifySession = {
            guildId,
            userId,
            type: VerifyType.CARBON,
            answer: carbonResult.regions,
            attempts: 0,
            createdAt: now,
            expiresAt,
            imageBase64: carbonResult.base64,
          }
          this.sessions.set(key, session)

          // 创建数据库记录
          await this.db.createVerifyRecord({
            guildId,
            userId,
            platform,
            type: VerifyType.CARBON,
            attempts: 0,
            status: VerifyStatus.PENDING,
            createdAt: now,
          })

          const regionCount = carbonResult.regions.length
          const modeHint = groupConfig.hardMode
            ? '全部含有手性碳的区域'
            : '其中任意一块包含手性碳的区域'

          return {
            success: true,
            type: VerifyType.CARBON,
            imageBase64: carbonResult.base64,
            message: [
              h.at(userId),
              h.text('\n'),
              h.image(`base64://${carbonResult.base64}`),
              h.text(`\n上图中有一块或多块区域含有手性碳原子`),
              h.text(`\n为了加入本群，你需要在 ${this.config.verifyTimeout} 秒内正确找出${modeHint}`),
              h.text(`\n回答时，直接发送区域代号即可，多个区域用逗号隔开`),
              h.text(`\n提示：本图共有 ${regionCount} 块手性碳区域~`),
            ],
          }
        }
      } catch (error) {
        logger.warn('手性碳 API 请求失败，降级为数字验证:', error)
      }
    }

    // 降级为数字验证
    return this.startMathVerify(guildId, userId, platform, now, expiresAt)
  }

  /** 开始数字验证 */
  private async startMathVerify(
    guildId: string,
    userId: string,
    platform: string,
    now: number,
    expiresAt: number
  ): Promise<{
    success: boolean
    type: VerifyType
    message: h[]
  }> {
    const key = this.getSessionKey(guildId, userId)
    
    // 生成数学题
    const a = Math.floor(Math.random() * 100)
    const b = Math.floor(Math.random() * 100)
    const op = Math.random() > 0.5 ? '+' : '-'
    const answer = op === '+' ? a + b : a - b

    const session: VerifySession = {
      guildId,
      userId,
      type: VerifyType.MATH,
      answer,
      attempts: 0,
      createdAt: now,
      expiresAt,
    }
    this.sessions.set(key, session)

    // 创建数据库记录
    await this.db.createVerifyRecord({
      guildId,
      userId,
      platform,
      type: VerifyType.MATH,
      attempts: 0,
      status: VerifyStatus.PENDING,
      createdAt: now,
    })

    return {
      success: true,
      type: VerifyType.MATH,
      message: [
        h.at(userId),
        h.text(`\n请在 ${this.config.verifyTimeout} 秒内发送 ${a} ${op} ${b} 的计算结果~`),
      ],
    }
  }

  /** 请求手性碳题目 */
  private async fetchCarbonQuestion(showHint: boolean): Promise<{
    base64: string
    regions: string[]
  } | null> {
    try {
      const response = await this.ctx.http.post<any>(
        `${this.config.carbonApiUrl}/captcha/chiralCarbon/getChiralCarbonCaptcha`,
        {
          answer: true,
          hint: showHint,
        },
        {
          timeout: this.config.apiTimeout,
        }
      )

      // 响应格式: { status, code, message, data: { data: { regions, base64 } } }
      // koishi http 返回的是 body，所以是 response.data.xxx
      const carbonData = response?.data?.data || response?.data
      if (carbonData?.base64 && carbonData?.regions) {
        // base64 可能包含 data:image/png;base64, 前缀，需要处理
        let base64Str = carbonData.base64 as string
        if (base64Str.startsWith('data:')) {
          base64Str = base64Str.split(',')[1] || base64Str
        }
        return {
          base64: base64Str,
          regions: carbonData.regions as string[],
        }
      }

      logger.warn('手性碳 API 返回格式异常:', response)
      return null
    } catch (error) {
      logger.error('手性碳 API 请求失败:', error)
      throw error
    }
  }

  /** 验证答案 */
  async checkAnswer(
    guildId: string,
    userId: string,
    userAnswer: string
  ): Promise<{
    correct: boolean
    passed: boolean
    failed: boolean
    remainingAttempts: number
    message: string
  }> {
    const session = this.getSession(guildId, userId)
    
    if (!session) {
      return {
        correct: false,
        passed: false,
        failed: false,
        remainingAttempts: 0,
        message: '你没有正在进行的验证',
      }
    }

    session.attempts++
    const remainingAttempts = this.config.maxAttempts - session.attempts

    let correct = false

    if (session.type === VerifyType.MATH) {
      // 数字验证
      const num = parseInt(userAnswer.trim(), 10)
      correct = !isNaN(num) && num === session.answer
    } else {
      // 手性碳验证
      const groupConfig = await this.getGroupConfig(guildId)
      const userRegions = userAnswer
        .toUpperCase()
        .replace(/，/g, ',')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const correctRegions = (session.answer as string[]).map(r => r.toUpperCase())

      if (groupConfig.hardMode) {
        // 困难模式：需要答出所有区域
        correct = correctRegions.every(r => userRegions.includes(r))
      } else {
        // 简单模式：答对任意一个即可
        correct = correctRegions.some(r => userRegions.includes(r))
      }
    }

    if (correct) {
      // 验证通过
      this.removeSession(guildId, userId)
      await this.db.updateVerifyRecordStatus(guildId, userId, VerifyStatus.PASSED, session.attempts)
      
      return {
        correct: true,
        passed: true,
        failed: false,
        remainingAttempts,
        message: '验证通过，欢迎加入本群~',
      }
    }

    if (remainingAttempts <= 0) {
      // 验证失败
      this.removeSession(guildId, userId)
      await this.db.updateVerifyRecordStatus(guildId, userId, VerifyStatus.FAILED, session.attempts)
      
      return {
        correct: false,
        passed: false,
        failed: true,
        remainingAttempts: 0,
        message: '验证失败，你错太多次啦！',
      }
    }

    // 还有机会
    return {
      correct: false,
      passed: false,
      failed: false,
      remainingAttempts,
      message: `回答错了呢，你还有 ${remainingAttempts} 次机会，再试试看？`,
    }
  }

  /** 处理验证超时 */
  async handleTimeout(guildId: string, userId: string): Promise<void> {
    const session = this.getSession(guildId, userId)
    if (session) {
      this.removeSession(guildId, userId)
      await this.db.updateVerifyRecordStatus(guildId, userId, VerifyStatus.EXPIRED, session.attempts)
    }
  }

  /** 绕过验证 */
  async bypassVerify(guildId: string, userId: string): Promise<void> {
    this.removeSession(guildId, userId)
    // 如果有 pending 记录，标记为通过
    await this.db.updateVerifyRecordStatus(guildId, userId, VerifyStatus.PASSED, 0)
  }
}
