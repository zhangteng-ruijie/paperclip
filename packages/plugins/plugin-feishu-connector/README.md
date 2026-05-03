# Paperclip 飞书连接器

这个插件让 Paperclip 智能体可以通过飞书机器人收消息、回消息，并把需求写入飞书多维表格。

它不重新造一套飞书 API，而是复用飞书官方 `lark-cli`。插件只负责 Paperclip 这边的事情：哪个飞书机器人对应哪个智能体、消息怎么路由、怎么去重、是否写入多维表格、什么时候唤醒智能体。

## 普通用户怎么配

进入 `Settings -> Plugins -> 飞书连接器 -> Configuration` 后，按页面向导配置。

### 0. 先接好飞书应用

飞书连接器复用飞书官方 `lark-cli`。`lark-cli profile` 不是“用户电脑配置”的产品概念，而是 **Paperclip 当前运行环境里的飞书应用配置**：

- 本地测试：Paperclip 跑在你的 Mac 上，所以读取这台 Mac 上的 `lark-cli profile`。
- 云端正式部署：Paperclip 跑在云服务器上，所以读取服务器上的 `lark-cli profile` 或密钥管理配置。

App ID 和 App Secret 在飞书开放平台应用的“凭证与基础信息”里。插件现在支持两种绑定方式：

- **飞书授权链接**：普通用户优先用这个。页面会生成飞书官方授权链接，完成后回到 Paperclip 确认。
- **App ID / App Secret**：管理员已经拿到凭证时使用。App Secret 只在本次绑定时通过 `lark-cli --app-secret-stdin` 写入当前运行环境的 profile，不会保存到 Paperclip 配置里。

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

正式部署至少要确认：

- 云服务器安装了 `lark-cli`。
- 云服务器上创建了对应 profile，或接入了服务器密钥管理。
- 飞书应用已启用机器人能力。
- 飞书应用已订阅 `im.message.receive_v1`。
- 应用权限已按实际报错补齐并发布。
- 机器人已被添加到需要服务的群或会话。
- 生产监控里“机器人、入口、监听、真实回复、最近错误”没有阻塞项。

后续如果要代表某个用户访问个人文档、日历、邮箱，再做用户 OAuth 授权；普通机器人收消息、发消息、写多维表格优先使用应用身份。
