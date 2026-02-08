import { Context } from 'koishi'
import { VerifyRecord, VerifyStatus, GroupConfig } from './types'

/** 扩展数据库模型 */
export function extendDatabase(ctx: Context) {
  // 验证记录表
  ctx.model.extend('chiral_verify_records', {
    id: 'unsigned',
    guildId: 'string',
    userId: 'string',
    platform: 'string',
    type: 'string',
    attempts: 'unsigned',
    status: 'string',
    createdAt: 'unsigned',
    completedAt: 'unsigned',
  }, {
    autoInc: true,
  })

  // 群配置表（持久化群单独设置）
  ctx.model.extend('chiral_group_configs', {
    id: 'unsigned',
    guildId: 'string',
    enabled: 'boolean',
    useCarbonMode: 'boolean',
    hardMode: 'boolean',
    showHint: 'boolean',
  }, {
    autoInc: true,
    unique: ['guildId'],
  })
}

/** 数据库操作类 */
export class DatabaseService {
  constructor(private ctx: Context) {}

  // ==================== 验证记录 ====================

  /** 创建验证记录 */
  async createVerifyRecord(data: Omit<VerifyRecord, 'id'>): Promise<VerifyRecord> {
    return await this.ctx.database.create('chiral_verify_records', data)
  }

  /** 更新验证记录状态 */
  async updateVerifyRecordStatus(
    guildId: string,
    userId: string,
    status: VerifyStatus,
    attempts?: number
  ): Promise<void> {
    const records = await this.ctx.database.get('chiral_verify_records', {
      guildId,
      userId,
      status: VerifyStatus.PENDING,
    })
    
    if (records.length > 0) {
      const record = records[records.length - 1] // 取最新的
      await this.ctx.database.set('chiral_verify_records', record.id, {
        status,
        completedAt: Date.now(),
        ...(attempts !== undefined ? { attempts } : {}),
      })
    }
  }

  /** 获取用户验证历史 */
  async getUserVerifyHistory(
    guildId: string,
    userId: string,
    limit = 10
  ): Promise<VerifyRecord[]> {
    return await this.ctx.database
      .select('chiral_verify_records')
      .where({ guildId, userId })
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute()
  }

  /** 获取群验证统计 */
  async getGuildStats(guildId: string): Promise<{
    total: number
    passed: number
    failed: number
    expired: number
  }> {
    const records = await this.ctx.database.get('chiral_verify_records', { guildId })
    
    return {
      total: records.length,
      passed: records.filter(r => r.status === VerifyStatus.PASSED).length,
      failed: records.filter(r => r.status === VerifyStatus.FAILED).length,
      expired: records.filter(r => r.status === VerifyStatus.EXPIRED).length,
    }
  }

  /** 清理过期记录（可选，定期调用） */
  async cleanupOldRecords(beforeTimestamp: number): Promise<number> {
    const oldRecords = await this.ctx.database.get('chiral_verify_records', {
      createdAt: { $lt: beforeTimestamp },
    })
    
    if (oldRecords.length > 0) {
      await this.ctx.database.remove('chiral_verify_records', {
        createdAt: { $lt: beforeTimestamp },
      })
    }
    
    return oldRecords.length
  }

  // ==================== 群配置 ====================

  /** 获取群配置 */
  async getGroupConfig(guildId: string): Promise<GroupConfig | null> {
    const configs = await this.ctx.database.get('chiral_group_configs', { guildId })
    return configs.length > 0 ? configs[0] : null
  }

  /** 保存群配置 */
  async saveGroupConfig(config: GroupConfig): Promise<void> {
    const existing = await this.getGroupConfig(config.guildId)
    
    if (existing) {
      await this.ctx.database.set('chiral_group_configs', { guildId: config.guildId }, {
        enabled: config.enabled,
        useCarbonMode: config.useCarbonMode,
        hardMode: config.hardMode,
        showHint: config.showHint,
      })
    } else {
      await this.ctx.database.create('chiral_group_configs', config)
    }
  }

  /** 删除群配置 */
  async deleteGroupConfig(guildId: string): Promise<void> {
    await this.ctx.database.remove('chiral_group_configs', { guildId })
  }
}
