# Paperclip 飞书连接器

这个插件让 Paperclip 智能体可以通过飞书机器人收消息、回消息，并把需求写入飞书多维表格。

它不重新造一套飞书 API，而是复用飞书官方 `lark-cli`。插件只负责 Paperclip 这边的事情：哪个飞书机器人对应哪个智能体、消息怎么路由、怎么去重、是否写入多维表格、什么时候唤醒智能体。

## 产品定位

飞书连接器不是“发通知”的小工具，而是 Paperclip 的外部工作入口层：

```text
飞书消息 -> 业务入口 -> Paperclip Issue -> Agent 执行 -> 原飞书会话回执
```

产品化后的核心对象只有两个：

- **机器人池**：一个 Paperclip 实例可以同时绑定多个飞书机器人，例如“小锐”“找人专家”“老板资讯机器人”。
- **业务入口**：每条入口单独选择“哪个机器人、哪类飞书消息、交给哪个公司和智能体、完成后怎么回复”。

普通用户不需要记 `chat-team-to-liu` 这类内部代号。页面会显示业务语言，例如：

```text
包含“小思”的飞书消息 -> 张工
IT-AI 应用组入口 -> 平台工程师
老板资讯群入口 -> 刘总
```

## Agent 能用的受控飞书工具

插件给 Agent 暴露的是受控工具，不建议让 Agent 直接随意运行 `lark-cli`：

| 工具 | 用途 |
| --- | --- |
| `feishu.reply_source_thread` | 把结果回复到这次任务来源的原飞书消息线程 |
| `feishu.reply_original_thread` | 兼容旧 Agent 的原线程回复工具名 |
| `feishu.ask_clarification` | 信息不足时，回到原飞书线程追问用户 |
| `feishu.send_message` | 向指定飞书会话发送消息 |
| `feishu.send_card` | 向指定飞书会话发送结构化卡片 |
| `feishu.download_attachments` | 下载原飞书消息附件并挂到 Issue |
| `feishu.write_base_record` | 把需求或结果写入飞书多维表格 |
| `feishu.lookup_user` | 按姓名、邮箱或工号搜索飞书用户 |
| `feishu.fetch_doc` | 读取飞书云文档内容 |
| `feishu.run_lark_cli_capability` | 高级兜底：只允许运行能力中心已开启且 allowlist 命中的 lark-cli 命令 |

### `lark-cli`、`lark-* skills` 和 Paperclip skill 的关系

这三者不是同一个东西：

- `lark-cli` 是运行时 API 客户端。插件在服务器或本机调用它访问飞书 OpenAPI。
- `lark-* skills` 是本机 Agent 的操作说明和命令手册，例如 `lark-im`、`lark-base`、`lark-doc`。它们不会因为插件更新 `@larksuite/cli` 而自动同步到 Paperclip。
- Paperclip Agent tools 是插件显式注册给 Agent 的受控工具，例如 `feishu.reply_source_thread`、`feishu.lookup_user`。

因此：

- 云端安装这个插件时，会把 `@larksuite/cli` 作为 npm 依赖一起安装。
- 更新插件或更新 CLI，不等于自动更新本机 `lark-* skills`。
- 如果要同步本机 `lark-* skills`，仍需在对应 Agent 环境里单独跑 skill 同步流程。
- 如果要让 Paperclip Agent 拥有新的飞书能力，应该优先在插件里注册受控 tool，再由插件内部调用 `lark-cli` 或 Feishu OpenAPI。
- 能力中心会在正式运行环境里扫描 `lark-cli schema` 和 CLI help，提示当前 CLI 能发现哪些 service/命令；这只是发现和诊断，不会自动把新 `lark-* skill` 变成 Paperclip tool。

从飞书进入 Paperclip 的 Issue 会自动带上来源上下文，Agent 不需要猜：

```text
来源：飞书
接收入口：包含“小思”的飞书消息 -> 张工
飞书会话：IT-AI应用组
提出人：张腾
飞书消息：om_xxx
```

## 飞书应用推荐权限

如果希望第一次创建飞书应用后少补权限，建议默认申请这些权限，并在飞书开放平台发布：

```json
{
  "scopes": {
    "tenant": [
      "base:app:readonly",
      "base:record:create",
      "base:record:update",
      "contact:user.base:readonly",
      "docx:document:readonly",
      "drive:drive:readonly",
      "drive:file:readonly",
      "im:chat:readonly",
      "im:message:readonly",
      "im:message:send_as_bot"
    ],
    "user": [
      "contact:user.base:readonly",
      "docx:document:readonly",
      "drive:drive:readonly",
      "drive:file:readonly"
    ]
  }
}
```

说明：

- 机器人收消息、回消息、下载消息附件，优先走应用身份。
- 写多维表格需要 `bitable` 相关权限。
- 查人需要通讯录权限；不同企业可能需要管理员审批。
- 访问个人文档、日历、邮箱时，才需要单独做用户授权。
- 审批、任务、邮箱默认关闭，只有在能力中心手动开启后再补对应权限。

## 普通用户怎么配

进入 `Settings -> Plugins -> 飞书连接器 -> 配置` 后，按页面向导配置。普通用户只看前 4 个页签即可：

```text
总览 | 入口 | 机器人 | 测试
```

`高级` 页只给管理员或工程师处理 App Secret、lark-cli、事件订阅、日志和云端部署。

### 0. 先接好飞书应用

飞书连接器复用飞书官方 `lark-cli`。云端安装包会把 `@larksuite/cli` 作为插件依赖安装，插件会优先使用包内自带的 CLI；如果管理员在高级页指定了命令路径，或设置了 `PAPERCLIP_FEISHU_LARK_CLI_BIN`，则使用指定路径；最后才回退到系统 `PATH` 里的 `lark-cli`。

`lark-cli profile` 不是“用户电脑配置”的产品概念，而是 **Paperclip 当前运行环境里的飞书应用配置**：

- 本地测试：Paperclip 跑在你的 Mac 上，所以读取这台 Mac 上的 `lark-cli profile`。
- 云端正式部署：Paperclip 跑在云服务器上，所以读取服务器上的 `lark-cli profile` 或密钥管理配置。

App ID 和 App Secret 在飞书开放平台应用的“凭证与基础信息”里。插件现在支持三种绑定方式：

- **飞书授权链接**：普通用户优先用这个。页面会生成飞书官方授权链接，完成后回到 Paperclip 确认。
- **App ID / App Secret**：管理员已经拿到凭证时使用。App Secret 只在本次绑定时通过 `lark-cli --app-secret-stdin` 写入当前运行环境的 profile，不会保存到 Paperclip 配置里。
- **Paperclip Secret Ref / Vault**：云端建议方式。先把 App Secret 存到 Paperclip Secret/Vault，再在绑定窗口填写 Secret Ref；插件通过 `ctx.secrets.resolve()` 在执行时取出密文值并通过 stdin 交给 `lark-cli`，不会把解析后的 Secret 写回配置、状态或日志。

如果需要在服务器上手动创建 profile，可以执行：

```bash
lark-cli config init --new --name paperclip-feishu-bot
```

如果已经拿到 App ID / App Secret，可以用安全输入方式创建：

```bash
printf '<App Secret>' | lark-cli profile add --name paperclip-feishu-bot --app-id '<App ID>' --app-secret-stdin
```

### 1. 飞书机器人账号

填一个机器人账号。普通用户只需要关注：
   - `连接代号`：自己起一个短名字，例如 `boss-news-bot`。
   - `页面显示名称`：例如 `老板资讯机器人`。
   - `飞书应用配置`：当前运行环境里已经绑定好的 `lark-cli profile` 名。
   - `飞书 App ID`：只用于人工核对是哪一个飞书应用，不填 App Secret。

### 2. 飞书消息交给哪个智能体

一条规则代表一个业务场景。常见例子：
   - 老板单聊机器人，交给 `资讯数字人`。
   - 某个飞书群里的需求，交给 `专题研究官`。
   - 包含关键词 `资讯` 的消息，交给指定智能体。

普通用户优先填这些字段：
   - `使用哪个飞书机器人`：填第 1 步的连接代号。
   - `监听方式`：最常用是 `指定飞书群/会话`。
   - `Paperclip 公司`：从下拉框选择，例如 `锐捷网络（CMP）`。
   - `交给哪个智能体`：从下拉框选择，例如 `刘总 - 锐捷网络总裁`。
   - `智能体处理后怎么回复飞书`：通常选 `在原消息线程里回复`。

带 `高级` 的字段一般不用填，除非工程师排障。

### 3. 可选：写入飞书多维表格

只有需要把需求沉淀到多维表格时才填。普通用户主要填：
   - `多维表格规则代号`：例如 `boss-demand-base`。
   - `多维表格 base token`：飞书多维表格链接里的 token。
   - `数据表 ID 或表名`：例如 `需求池`。
   - `写入哪些字段`：默认字段适合普通需求池。

## 测试模式

新安装默认打开 `测试模式：先不真的发飞书消息`。

这个开关打开时，插件只生成将要调用的 `lark-cli` 命令，不会真的发飞书消息，也不会真的写入多维表格。确认规则正确后，再关闭测试模式进入正式发送。

## 本地开发

```bash
pnpm --filter @paperclipai/plugin-feishu-connector test
pnpm --filter @paperclipai/plugin-feishu-connector typecheck
pnpm --filter @paperclipai/plugin-feishu-connector build
pnpm --filter @paperclipai/plugin-feishu-connector pack:cloud
pnpm paperclipai plugin install ./packages/plugins/plugin-feishu-connector --local
```

`pack:cloud` 会生成一个去掉 `workspace:*` 依赖的云端安装包，并做一次 `npm install` + manifest 加载校验。产物在：

```bash
output/plugin-feishu-connector-cloud/paperclipai-plugin-feishu-connector-0.1.0.tgz
```

如果云端 Paperclip 只能填写 npm 包名，请先把这个包发布到你们的私有 npm registry，再在插件安装框填写 `@paperclipai/plugin-feishu-connector`。如果云端支持本地路径安装，则把 `.tgz` 上传到服务器，并通过插件安装 API 或支持 tarball 的安装界面安装。

如果插件已经安装过，并且 manifest 权限或配置结构变了，可以先卸载再安装：

```bash
pnpm paperclipai plugin uninstall paperclipai.feishu-connector
pnpm paperclipai plugin install ./packages/plugins/plugin-feishu-connector --local
```

## 云服务器部署提醒

本地测试可以打开 `自动监听飞书新消息`。云服务器部署时，同一个飞书应用只能由一个监听实例消费事件，否则飞书长连接可能随机分流事件，导致重复或漏处理。

云端也可以用 Paperclip 插件公网 webhook 接收飞书事件：

```text
POST https://<paperclip-domain>/api/plugins/paperclipai.feishu-connector/webhooks/feishu-events
```

这个入口会复用同一套路由、去重、冲突检测和 Issue 创建逻辑。注意：飞书 URL 验证如果要求回显 `challenge`，当前 Paperclip webhook 宿主返回的是固定成功响应；遇到验证失败时，先用长连接监听或等宿主提供可自定义响应的公开回调入口。

插件还暴露了一个 board 鉴权的 scoped API route，便于研发或自动化在不发真实飞书消息时验证入口规则：

```text
POST https://<paperclip-domain>/api/plugins/paperclipai.feishu-connector/api/simulate-inbound-message
```

请求体必须包含当前公司 `companyId`，并传入 `connectionId` 和 `raw` 飞书消息样例。它和页面“模拟测试”一样只走 Paperclip 受控入口，不是公开 webhook，也不会绕过权限。

公网 webhook 的安全配置在 `高级 -> 事件订阅与日志 -> 公网回调安全`：

- `Verification Token Secret Ref`：把飞书事件订阅里的 Verification Token 存到 Paperclip Secret/Vault，只在这里填写引用名。
- `Encrypt Key Secret Ref`：把飞书事件订阅里的 Encrypt Key 存到 Paperclip Secret/Vault。插件会用它解密飞书加密事件，也可用于签名校验。
- `公网回调必须校验 x-lark-signature`：云端生产建议开启。开启后，缺少签名头或签名不匹配的请求会被拒绝。

正式部署至少要确认：

- 插件高级页显示 `lark-cli` 可执行；默认应使用插件包内自带 CLI，只有自带 CLI 不可用时才需要配置服务器全局 `lark-cli` 路径。
- 云服务器上创建了对应 profile，或接入了服务器密钥管理。
- App Secret 通过页面一次性绑定，或通过 Paperclip Secret Ref / Vault 托管后再绑定 profile；不要写进截图和文档。
- 公网 webhook 已配置 Verification Token 或 Encrypt Key Secret Ref；生产环境建议同时配置并开启签名校验。
- 飞书应用已启用机器人能力。
- 飞书应用已订阅 `im.message.receive_v1`，并选择长连接监听或配置上面的公网 webhook。
- 应用权限已按实际报错补齐并发布。
- 机器人已被添加到需要服务的群或会话。
- 生产监控里“机器人、入口、监听、真实回复、最近错误”没有阻塞项。

飞书回执或多维表格写入失败时，插件会把失败投递放入高级页的“事件订阅与日志 -> 重试队列”。管理员修复权限、网络或 profile 后，可以在这里点击“重试失败投递”。重试队列只保存将要执行的受控 `lark-cli` 参数和错误摘要，不保存 App Secret。

插件也会把运行事件和冲突写入 Paperclip 插件实体记录：`feishu_event_logs` 保存事件日志，`feishu_conflicts` 保存多入口命中、其他机器人抢答等冲突。高级页仍展示最近事件，工程排障时可以从插件实体记录追溯更完整的审计线索。

同时，插件声明了自有数据库 namespace：`feishu_connector`。安装时会运行 `migrations/001_feishu_connector.sql`，创建机器人池、入口、能力、会话、消息路由、事件日志、冲突和权限检查等表。运行时会把配置、消息路由、事件、冲突和权限检查同步到这些表；插件实体记录仍保留为兼容的 UI/审计索引。

后续如果要代表某个用户访问个人文档、日历、邮箱，再做用户 OAuth 授权；普通机器人收消息、发消息、写多维表格优先使用应用身份。

## 验收清单

上线前至少验证：

- 飞书群里发消息，3 秒内收到“已收到 + 任务编号 + 预计耗时”。
- Paperclip 创建的 Issue 顶部能看到业务入口、机器人、会话、提出人、原飞书消息。
- Agent 完成后，优先用最终评论正文回到原飞书线程；`run.finished` 只作为兜底。
- 长结果在飞书里发摘要，完整内容保留在 Paperclip Issue。
- `@小锐` 不会被配置成“锐思”的机器人接走；机器人 @ 名称必须填写准确。
- 同一条消息被多个入口或其他机器人抢答时，测试页和状态页能提示冲突。
- 附件会进入 Paperclip Issue，Agent 能看到并处理。
- 飞书回执失败会进入重试队列；修复权限或网络后可从高级页重试。
- 云端环境重启后不会重复创建同一条飞书消息对应的 Issue。
