# DevOps Requirements - Docker Compose Development Environment

## 1. 现有 Docker Compose 配置分析

### 1.1 配置文件清单

| 文件 | 用途 | 服务 |
|------|------|------|
| `docker-compose.yml` | 生产/完整堆栈 | db (Postgres) + server |
| `docker-compose.quickstart.yml` | 快速启动单服务 | paperclip (无数据库) |
| `docker-compose.untrusted-review.yml` | 安全审查环境 | review (隔离容器) |
| `docker/quadlet/*` | systemd podman 集成 | db + paperclip pod |

### 1.2 当前配置问题

#### docker-compose.yml
- **端口硬编码**: `5432:5432`, `3100:3100` 无法通过环境变量覆盖
- **缺少 UI 开发端口**: Vite 开发服务器需要 `5173` 端口
- **无热重载配置**: 没有 volume 挂载源代码
- **健康检查不完整**: server 服务缺少健康检查
- **无 profile 支持**: 无法选择性地启动服务

#### docker-compose.quickstart.yml
- **无数据库服务**: 依赖外部 Postgres 或嵌入式 PGlite
- **无卷挂载**: 开发时代码修改不会生效
- **缺少环境变量文件**: 没有 `env_file` 配置
- **单端口暴露**: 只暴露 `3100`，缺少 `5173` (Vite)

#### docker-compose.untrusted-review.yml
- **安全配置完善**: 有 `cap_drop`, `security_opt`, `tmpfs`
- **但不适合开发**: 没有开发相关配置

### 1.3 Dockerfile 分析

- **多阶段构建**: base → deps → build → production
- **ARG 支持 UID/GID 映射**: 便于匹配主机用户
- **ENTRYPOINT 使用 docker-entrypoint.sh**: 动态调整 node 用户 UID/GID
- **问题**: development 场景没有专门的 Dockerfile.dev

---

## 2. 开发环境问题清单

### 高优先级

| # | 问题 | 影响 |
|---|------|------|
| P1 | 无热重载支持 | 代码修改后需要手动重建镜像 |
| P2 | 缺少 docker-compose.dev.yml | 没有专门针对开发场景的配置 |
| P3 | UI 开发端口未暴露 | 无法访问 Vite 热重载服务器 |
| P4 | quickstart 缺少数据库 | 无法独立运行完整应用 |

### 中优先级

| # | 问题 | 影响 |
|---|------|------|
| M1 | 端口配置硬编码 | 无法同时运行多个实例 |
| M2 | 无 profile 机制 | 启动时无法选择服务组合 |
| M3 | 环境变量分散 | 不同配置使用不同的 env var 名称 |
| M4 | 缺少 docker-compose.dev.yml | 没有标准的开发启动方式 |

### 低优先级

| # | 问题 | 影响 |
|---|------|------|
| L1 | 无 README 说明快速启动 | 新贡献者不知道如何启动 |
| L2 | Quadlet 文件与 Compose 不一致 | 使用 podman 时配置不同步 |
| L3 | 无 docker-compose.override.yml | 无法通过 gitignore 忽略本地覆盖 |

---

## 3. 改进建议（按优先级排序）

### P1: 创建 docker-compose.dev.yml

```yaml
# docker-compose.dev.yml
services:
  db:
    profiles: [full]
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: paperclip
      POSTGRES_PASSWORD: paperclip
      POSTGRES_DB: paperclip
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U paperclip -d paperclip"]
      interval: 2s
      timeout: 5s
      retries: 30
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  server:
    build:
      context: ..
      dockerfile: Dockerfile.dev  # 新建开发用 Dockerfile
    ports:
      - "${PAPERCLIP_PORT:-3100}:3100"
      - "${VITE_PORT:-5173}:5173"
    environment:
      DATABASE_URL: postgres://paperclip:paperclip@db:5432/paperclip
      HOST: "0.0.0.0"
      PAPERCLIP_HOME: "/paperclip"
      SERVE_UI: "true"
      PAPERCLIP_DEPLOYMENT_MODE: "authenticated"
      PAPERCLIP_DEPLOYMENT_EXPOSURE: "private"
      PAPERCLIP_PUBLIC_URL: "${PAPERCLIP_PUBLIC_URL:-http://localhost:3100}"
      BETTER_AUTH_SECRET: "${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET must be set}"
    volumes:
      - ../server:/app/server:ro
      - ../ui:/app/ui:ro
      - ../packages:/app/packages:ro
      - paperclip-data:/paperclip
    depends_on:
      db:
        condition: service_healthy
    profiles: [full]

  paperclip-dev:
    build:
      context: ..
      dockerfile: Dockerfile.dev
    ports:
      - "${PAPERCLIP_PORT:-3100}:3100"
      - "${VITE_PORT:-5173}:5173"
    environment:
      HOST: "0.0.0.0"
      PAPERCLIP_HOME: "/paperclip"
      SERVE_UI: "true"
      PAPERCLIP_DEPLOYMENT_MODE: "authenticated"
      PAPERCLIP_DEPLOYMENT_EXPOSURE: "private"
      PAPERCLIP_PUBLIC_URL: "${PAPERCLIP_PUBLIC_URL:-http://localhost:3100}"
      BETTER_AUTH_SECRET: "${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET must be set}"
    volumes:
      - ../server:/app/server
      - ../ui:/app/ui
      - ../packages:/app/packages
      - ../cli:/app/cli
      - ../scripts:/app/scripts
      - paperclip-data:/paperclip
    profiles: [dev]

volumes:
  pgdata:
  paperclip-data:
```

### P2: 创建 Dockerfile.dev

```dockerfile
# Dockerfile.dev
FROM node:lts-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates gosu curl git

WORKDIR /app

# 全局安装依赖
RUN corepack enable && npm install -g pnpm@9

# 复制 package 文件
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY cli/package.json cli/
COPY server/package.json server/
COPY ui/package.json ui/
COPY packages/*/package.json packages/

# 安装依赖（保留 devDependencies 用于 tsx 等工具）
RUN pnpm install --frozen-lockfile || pnpm install

# 复制源码
COPY . .

CMD ["pnpm", "dev"]
```

### P3: 更新 docker-compose.yml 使用环境变量

```yaml
services:
  db:
    # ... 保持不变，但端口改为可配置
    ports:
      - "${POSTGRES_PORT:-5432}:5432"

  server:
    # ... 保持不变，但端口改为可配置
    ports:
      - "${PAPERCLIP_PORT:-3100}:3100"
      - "${VITE_PORT:-5173}:5173"  # 添加 Vite 端口
```

### P4: 更新 .env.example

```env
# Database
DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip
POSTGRES_PORT=5432

# Server
PORT=3100
PAPERCLIP_PORT=3100
VITE_PORT=5173

# UI
SERVE_UI=true

# Security
BETTER_AUTH_SECRET=paperclip-dev-secret

# Deployment
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=private
PAPERCLIP_PUBLIC_URL=http://localhost:3100
```

---

## 4. 建议的新配置结构

```
docker/
├── docker-compose.yml          # 生产/完整堆栈 (db + server)
├── docker-compose.quickstart.yml # 快速启动 (单 paperclip 服务)
├── docker-compose.dev.yml       # 开发环境 (热重载、源码挂载)
├── docker-compose.untrusted-review.yml
├── Dockerfile                   # 生产镜像
├── Dockerfile.dev               # 开发镜像
└── quadlet/                      # systemd podman 集成
    ├── paperclip.pod
    ├── paperclip.container
    └── paperclip-db.container
```

### Profile 使用方式

```bash
# 仅启动 paperclip (使用嵌入式 PGlite 或外部数据库)
docker compose up paperclip

# 完整开发环境 (db + server + 热重载)
docker compose --profile dev up

# 生产部署
docker compose up -d
```

---

## 5. 实施计划

| 阶段 | 任务 | 优先级 |
|------|------|--------|
| 1 | 创建 `docker-compose.dev.yml` | P1 |
| 2 | 创建 `Dockerfile.dev` | P1 |
| 3 | 更新 `docker-compose.yml` 端口为环境变量 | P1 |
| 4 | 更新 `.env.example` 添加所有开发相关变量 | P2 |
| 5 | 添加 `docker-compose.override.yml.example` | M3 |
| 6 | 文档: 更新 CONTRIBUTING.md 说明开发启动方式 | L1 |

---

## 6. 验收标准

- [ ] `docker compose -f docker-compose.dev.yml --profile dev up` 能启动完整开发环境
- [ ] 修改 server/ui 代码后，Vite 热重载生效
- [ ] 所有端口可通过环境变量配置
- [ ] `docker compose up` (无 profile) 启动单 paperclip 服务
- [ ] `docker compose --profile full up` 启动完整堆栈 (db + server)
