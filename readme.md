![koishi-plugin-chiral-carbon-verifier](https://socialify.git.ci/VincentZyuApps/koishi-plugin-chiral-carbon-verifier/image?description=1&font=Bitter&forks=1&issues=1&language=1&logo=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2Ff%2Ff3%2FKoishi.js_Logo.png&name=1&owner=1&pattern=Plus&pulls=1&stargazers=1&theme=Auto)

# koishi-plugin-chiral-carbon-verifier

[![npm](https://img.shields.io/npm/v/koishi-plugin-chiral-carbon-verifier?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-chiral-carbon-verifier)
[![npm-download](https://img.shields.io/npm/dm/koishi-plugin-chiral-carbon-verifier?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-chiral-carbon-verifier)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/VincentZyuApps/koishi-plugin-chiral-carbon-verifier)
[![Gitee](https://img.shields.io/badge/Gitee-C71D23?style=for-the-badge&logo=gitee&logoColor=white)](https://gitee.com/vincent-zyu/koishi-plugin-chiral-carbon-verifier)

<p><del>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>259248174</b>   🎉（这个群G了）</del></p> 
<p>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入新QQ群：<b>1085190201</b> 🎉</p>
<p>💡 在群里直接艾特我，回复的更快哦~ ✨</p>

# 🧪 手性碳入群验证 - 用有机化学知识守护你的群聊

## ✨ 功能特点

- 🧪 **手性碳验证**：发送有机化学分子结构图，要求新成员识别手性碳原子所在区域
- 🔢 **数字验证**：简单的数学计算题作为备选方案
- 🔄 **自动降级**：当手性碳 API 不可用时，自动切换为数字验证
- ⚙️ **灵活配置**：支持全局配置 + 群单独配置
- 💪 **困难模式**：可要求答出所有手性碳区域
- 📊 **统计功能**：记录验证历史，可查看通过率
- 👢 **自动踢人**：验证失败或超时可自动踢出

## 📦 安装

```bash
npm install koishi-plugin-chiral-carbon-verifier
# 或
yarn add koishi-plugin-chiral-carbon-verifier
```

## 🔧 配置项

### 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否全局启用入群验证 |
| `carbonApiUrl` | string | `https://carbon.crystelf.top` | 手性碳验证 API 地址 |
| `apiTimeout` | number | `10000` | API 请求超时时间（毫秒） |

### 验证行为配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `verifyTimeout` | number | `120` | 验证超时时间（秒） |
| `maxAttempts` | number | `3` | 最大尝试次数 |
| `recallWrongAnswer` | boolean | `true` | 是否撤回错误回答 |
| `kickOnFail` | boolean | `true` | 验证失败是否踢出群 |
| `reminderBeforeTimeout` | number | `60` | 超时前提醒时间（秒），0 为不提醒 |

### 主人账号配置

配置主人账号可自动绕过验证：

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string | 平台名称，如 `onebot` |
| `userId` | string | 用户 ID |
| `enabled` | boolean | 是否启用 |

### 群单独配置

可为每个群设置不同的验证模式：

| 字段 | 类型 | 说明 |
|------|------|------|
| `guildId` | string | 群号 |
| `enabled` | boolean | 是否启用验证 |
| `useCarbonMode` | boolean | 是否使用手性碳模式 |
| `hardMode` | boolean | 困难模式（需答出所有区域） |
| `showHint` | boolean | 是否显示提示 |

## 📝 可用命令

| 命令 | 别名 | 说明 |
|------|------|------|
| `chiral.bypass <@用户>` | 绕过验证 | 管理员绕过指定用户的验证 |
| `chiral.reverify <@用户>` | 重新验证 | 对指定用户重新发起验证 |
| `chiral.enable` | 开启验证 | 开启本群入群验证 |
| `chiral.disable` | 关闭验证 | 关闭本群入群验证 |
| `chiral.mode [carbon/math]` | 切换验证模式 | 切换验证模式 |
| `chiral.hard [true/false]` | 设置困难模式 | 设置手性碳困难模式 |
| `chiral.stats` | 验证统计 | 查看本群验证统计 |
| `chiral.config` | 验证配置 | 查看本群验证配置 |

## 🎯 工作流程

```
新成员入群
    ↓
检查是否为主人 → 是 → 跳过验证
    ↓ 否
检查群是否启用验证 → 否 → 跳过验证
    ↓ 是
尝试请求手性碳 API
    ↓
┌─ 成功 → 发送分子结构图 + 验证提示
│
└─ 失败 → 降级为数字验证（发送数学题）
    ↓
等待用户回答
    ↓
┌─ 答对 → 验证通过，欢迎入群
│
├─ 答错 → 减少剩余次数，提示重试
│   └─ 次数用完 → 验证失败，踢出群
│
└─ 超时 → 验证超时，踢出群
```

## 🧪 手性碳是什么？

**手性碳**（Chiral Carbon）是有机化学中的概念，指连接四个不同基团的碳原子。这种碳原子具有"手性"，即镜像不能重合，就像左手和右手一样。

本插件利用这一化学知识点作为入群验证，既有趣又能筛选出具有一定化学基础的成员~

## ⚠️ 注意事项

- 需要 bot 具有群管理员权限才能踢人
- 手性碳 API 默认使用 `https://carbon.crystelf.top`，可在配置中修改
- 主人账号会自动绕过验证
- 建议将 `verifyTimeout` 设置为 120 秒以上，给新成员足够的答题时间

## 📜 致谢

本插件参考 [crystelf-plugin](github.com/Jerryplusy/crystelf-plugin) 的业务逻辑实现，感谢原作者的创意！

## 📄 许可证

MIT License
