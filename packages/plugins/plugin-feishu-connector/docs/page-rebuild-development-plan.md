# 飞书连接器页面重构与研发方案

状态：已确认进入设计落地
范围：重构插件配置页与相关 worker 能力，不先改 Paperclip 核心产品模型
目标：普通用户配置“飞书入口”，管理员管理“飞书机器人”，工程师处理“高级设置”

## 1. 目标体验

用户打开插件后，第一眼看到的不是 App ID、profile、regex，而是：

```text
当前可用状态：可用
飞书入口：2 个运行中
默认机器人：锐捷智能体助手
最近一次飞书消息：已创建任务并回复
下一步：新增入口 / 发送测试消息 / 查看运行状态
```

插件要把底层三类配置重新包装成业务对象：

| 业务对象 | 当前配置 | 用户理解 |
| --- | --- | --- |
| 飞书机器人 | `connections[]` | Paperclip 在飞书里用哪个机器人收发消息 |
| 飞书入口 | `routes[]` | 哪些飞书消息会进入哪个智能体 |
| 多维表格沉淀 | `baseSinks[]` | 是否把需求同步写入飞书 Base |

## 2. 页面结构

保留一个插件设置页，但内部拆成 5 个清晰区域：

1. 首页总览
2. 新增入口向导
3. 飞书机器人管理
4. 授权与运行状态
5. 工程师高级设置

推荐默认只展示前 2 个区域；机器人管理、授权状态和高级设置通过折叠区或二级 tab 进入。

## 3. 首页总览

### 3.1 顶部状态卡

展示：

- 当前状态：可用 / 需要处理 / 暂停 / 错误
- 默认飞书机器人
- 监听状态
- 真实回复状态
- 最近一次成功处理时间

主按钮：

- 新增飞书入口
- 发送测试消息
- 查看运行状态

### 3.2 飞书入口列表

入口卡片示例：

```text
老板资讯群里的消息
当消息 @小锐 或包含“资讯”时
交给：刘总 - 锐捷网络总裁
完成后：在原消息线程回复
沉淀：资讯需求池
状态：运行中 · 最近 15:19 成功
```

入口卡片操作：

- 测试
- 编辑
- 暂停 / 启用
- 删除
- 查看记录

### 3.3 空状态

没有入口时显示：

```text
还没有飞书入口。
你可以把一个飞书群、一个机器人单聊，或一类关键词消息接到 Paperclip 智能体。
[新增飞书入口]
```

## 4. 新增入口向导

向导采用 5 步，每步只问一个业务问题。

### Step 1：你想怎么接入飞书？

选项：

1. 使用公司已配置机器人（默认推荐）
2. 绑定新的专属机器人
3. 工程师手动配置

逻辑：

- 如果已有可用机器人，默认选 1。
- 如果没有机器人，提示管理员绑定。
- 手动配置只在高级入口展示。

### Step 2：哪些飞书消息进入 Paperclip？

字段：

- 飞书机器人
- 飞书群/单聊
- 触发方式
  - @机器人
  - 消息包含关键词
  - 指定发起人
  - 接收所有消息
- 附件接收
  - 图片
  - 文件
  - 音频/视频

支撑能力：

- `lark-cli im +chat-search` 搜群聊
- `lark-cli contact +search-user --as user` 搜发起人，需用户授权
- 当前 `routes.matchType` 支撑 chat/user/keyword/regex/default
- 当前附件解析和资源下载逻辑支撑 image/file/audio/video

### Step 3：交给哪个 Paperclip 智能体？

字段：

- Paperclip 公司
- 智能体
- 可选：任务模板

支撑能力：

- `ctx.companies.list`
- `ctx.agents.list`
- 当前 route 支撑 `companyId/companyRef` 和 `targetAgentId/targetAgentName`

### Step 4：处理后怎么回飞书？

字段：

- 收到后是否先回“已收到”
- 完成后回复方式
  - 原消息线程回复（推荐）
  - 发一条新消息
  - 不自动回复
- 是否同步多维表格
  - 不同步
  - 选择已有需求池
  - 新增写入规则

支撑能力：

- `lark-cli im +messages-reply`
- `lark-cli im +messages-send`
- `lark-cli base +record-upsert`
- 当前 `ackOnInbound`、`replyMode`、`baseSinkId`

### Step 5：测试并上线

测试动作：

- 生成测试说明：告诉用户去哪个飞书群发什么
- 快捷测试：模拟一条入站消息
- 真实测试：检测监听、机器人回复、任务创建、agent 唤起

支撑能力：

- 当前 `simulateInboundMessage`
- 新增 `test-entry` action
- 当前 `recentRecords` 可做测试结果展示

## 5. 飞书机器人管理

### 5.1 机器人列表

字段：

- 显示名称
- 类型：公司通用 / 项目专属 / 本地测试
- App ID
- 授权用户
- profile 状态
- 监听状态
- 被几个入口使用

操作：

- 设为默认
- 绑定新机器人
- 重新授权
- 权限检查
- 暂停监听
- 删除绑定

### 5.2 绑定新机器人

主路径：

```text
点击“绑定新的飞书机器人”
-> 调用 lark-cli config init --new --name <profile>
-> 页面显示飞书官方绑定链接/二维码
-> 用户完成飞书页面操作
-> 页面刷新 profile list
-> 新机器人可用于入口
```

兜底路径：

- App ID
- App Secret
- profile 名
- brand

默认折叠为“工程师手动绑定”。

## 6. 授权中心

明确区分两种授权：

### 6.1 机器人授权

默认路径，用于：

- 收消息
- 发消息
- 下载附件
- 写多维表格

### 6.2 用户授权

第二阶段能力，用于：

- 搜用户可见群聊/聊天记录
- 访问个人文档
- 访问日历、邮箱、审批

支撑能力：

- `lark-cli auth login --no-wait --json`
- `lark-cli auth login --device-code`

用户授权不和机器人绑定混在同一个向导里，避免普通用户误以为必须授权个人数据。

## 7. 工程师高级设置

默认折叠。包括：

- lark-cli 命令路径
- dry-run 测试模式
- 监听开关
- event types
- quick reply regex
- route regex
- route priority
- Base 字段映射
- 原始 JSON 配置
- 最近 50 条日志

## 8. Worker 数据接口设计

### 8.1 新增 data

```ts
DATA_KEYS.entryOverview = "entry-overview";
DATA_KEYS.robots = "robots";
DATA_KEYS.entries = "entries";
DATA_KEYS.diagnostics = "diagnostics";
DATA_KEYS.chatSearch = "chat-search";
DATA_KEYS.userSearch = "user-search";
```

### 8.2 新增 actions

```ts
ACTION_KEYS.createEntry = "create-entry";
ACTION_KEYS.updateEntry = "update-entry";
ACTION_KEYS.pauseEntry = "pause-entry";
ACTION_KEYS.resumeEntry = "resume-entry";
ACTION_KEYS.deleteEntry = "delete-entry";
ACTION_KEYS.testEntry = "test-entry";
ACTION_KEYS.startUserAuth = "start-user-auth";
ACTION_KEYS.completeUserAuth = "complete-user-auth";
ACTION_KEYS.checkPermissions = "check-permissions";
ACTION_KEYS.searchChats = "search-chats";
ACTION_KEYS.searchUsers = "search-users";
```

## 9. UI 组件拆分

`src/ui/index.tsx` 不再继续变成一个巨大文件，拆分为：

```text
src/ui/
  index.tsx
  components/
    StatusHero.tsx
    EntryList.tsx
    EntryCard.tsx
    EntryWizard.tsx
    RobotManager.tsx
    AuthorizationCenter.tsx
    DiagnosticsPanel.tsx
    AdvancedSettings.tsx
    CommonFields.tsx
  model/
    view-model.ts
    config-mapping.ts
```

## 10. 配置兼容策略

第一阶段不改现有存储结构，避免破坏已配置用户。

映射关系：

- `connections[]` -> robots
- `routes[]` -> entries
- `baseSinks[]` -> sinks
- `dryRunCli/enableEventSubscriber/ackOnInbound` -> runtime settings

新增字段如果需要，采用可选字段：

```ts
interface FeishuConnectionConfig {
  kind?: "company_default" | "dedicated" | "local_test";
  description?: string;
  isDefault?: boolean;
}

interface FeishuRouteConfig {
  displayName?: string;
  sourceLabel?: string;
  triggerLabel?: string;
  attachmentPolicy?: {
    images?: boolean;
    files?: boolean;
    audioVideo?: boolean;
  };
}
```

## 11. 可支撑性结论

| 功能 | 支撑情况 |
| --- | --- |
| 自定义完整设置页 | Paperclip `settingsPage` 支撑 |
| 读取公司和智能体 | Paperclip SDK 支撑 |
| 创建任务和唤起智能体 | Paperclip SDK 支撑 |
| 附件进入任务 | 当前插件已有资源下载和 attachment create |
| 机器人绑定向导 | `lark-cli config init --new` 支撑 |
| 手动绑定 | `lark-cli profile add --app-secret-stdin` 支撑 |
| 列出机器人 | `lark-cli profile list` 支撑 |
| 搜群 | `lark-cli im +chat-search` 支撑 |
| 搜人 | `lark-cli contact +search-user` 支撑，但需要用户授权 |
| 监听消息 | `lark-cli event +subscribe` 支撑 |
| 回复消息 | `lark-cli im +messages-reply` 支撑 |
| 发送消息 | `lark-cli im +messages-send` 支撑 |
| 写 Base | `lark-cli base +record-upsert` 支撑 |
| 用户授权 | `lark-cli auth login --no-wait` 支撑 |
| 扫码列出所有开发者机器人 | 不作为 MVP 承诺 |

## 12. 开发阶段

### Phase 1：页面信息架构重构

- 拆组件
- 首页总览
- 入口列表
- 高级设置折叠
- 保持现有功能不变

### Phase 2：新增入口向导

- 5 步向导
- 入口创建/编辑映射到 `routes[]`
- 机器人选择映射到 `connections[]`
- 多维表格选择映射到 `baseSinks[]`

### Phase 3：机器人管理与绑定

- 机器人列表
- 官方绑定向导
- 手动绑定折叠入口
- profile 刷新与状态展示

### Phase 4：测试与诊断

- 一键测试入口
- 最近记录展示
- lark-cli 诊断
- 权限检查

### Phase 5：用户授权

- 用户授权中心
- 搜群/搜人增强
- 与机器人授权分离展示

## 13. 验收标准

普通用户验收：

- 不需要理解 App ID / Secret 就能新增入口
- 能看懂“哪条飞书消息交给哪个智能体”
- 能知道为什么没有生效
- 能一键测试

管理员验收：

- 能管理公司通用机器人和专属机器人
- 能看到机器人是否被入口使用
- 能重新授权和检查权限

工程师验收：

- 高级字段没有丢失
- 原有配置能正常迁移显示
- 测试、typecheck、build 全部通过

## 14. 测试计划

自动化：

- routing 单测
- worker action 单测
- config mapping 单测
- UI view model 单测
- Playwright 截图检查

手工：

- 已有机器人 + 已有入口
- 无机器人空状态
- 新增入口
- 暂停入口
- 测试模式
- 真实飞书回复
- lark-cli 不存在
- profile token 失效
