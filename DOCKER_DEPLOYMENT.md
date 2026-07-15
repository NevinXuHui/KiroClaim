# Docker 部署说明

## 方式一：使用预构建镜像（推荐）

```bash
# 使用 GitHub 官方镜像
docker-compose up -d
```

## 方式二：本地编译后打包

适用于需要自定义修改或无法访问 GitHub Registry 的场景。

### 步骤

1. **编译并构建镜像**
```bash
# 自动编译 + 构建镜像
./build-local.sh

# 或手动指定版本
VERSION=v1.0.0 ./build-local.sh
```

2. **启动服务**
```bash
# 使用本地镜像启动
docker-compose -f docker-compose.local.yml up -d
```

### 目录结构

```
├── Dockerfile              # 容器内编译（多阶段构建）
├── Dockerfile.local        # 本地编译产物打包
├── docker-compose.yml      # 使用预构建镜像
├── docker-compose.local.yml # 使用本地编译镜像
└── build-local.sh          # 本地编译脚本
```

### 环境变量配置

在项目根目录创建 `.env` 文件：

```bash
# 数据库配置
MYSQL_ROOT_PASSWORD=your_root_password
MYSQL_DATABASE=kiroclaim
MYSQL_USER=kiroclaim
MYSQL_PASSWORD=your_password

# 应用端口
PORT=9527
```

### 查看日志

```bash
docker-compose logs -f kiroclaim
```

### 停止服务

```bash
docker-compose down
```
