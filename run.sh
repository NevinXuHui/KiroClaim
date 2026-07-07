#!/bin/bash

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# 显示帮助信息
show_help() {
    cat << EOF
KiroClaim 启动脚本

用法: $0 [选项]

选项:
    dev         本地开发模式（SQLite）
    build       编译 Go 二进制
    prod        生产环境（Docker Compose）
    stop        停止所有服务（生产环境和开发进程）
    restart     重启生产环境
    logs        查看生产环境日志
    clean       清理编译产物
    status      查看服务状态
    help        显示此帮助信息

示例:
    $0 dev          # 本地开发模式启动
    $0 build        # 仅编译
    $0 prod         # Docker Compose 启动
    $0 logs         # 查看日志
    $0 stop         # 停止所有服务
    $0 status       # 查看服务状态

EOF
}

# 检查 .env 文件
check_env() {
    if [ ! -f .env ]; then
        print_warn ".env 文件不存在，从 .env.example 创建"
        if [ -f .env.example ]; then
            cp .env.example .env
            print_info "已创建 .env 文件，请根据需要修改配置"
        else
            print_error ".env.example 文件也不存在"
            exit 1
        fi
    fi
}

# 检查 Go 环境
check_go() {
    if ! command -v go &> /dev/null; then
        print_error "未找到 Go 环境，请先安装 Go"
        exit 1
    fi
    print_info "Go 版本: $(go version)"
}

# 检查 Docker 环境
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "未找到 Docker，请先安装 Docker"
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "未找到 docker-compose，请先安装 docker-compose"
        exit 1
    fi
    print_info "Docker 环境检查通过"
}

# 获取端口号（从 .env 文件或使用默认值）
get_port() {
    local port=9527
    if [ -f .env ]; then
        local env_port=$(grep "^PORT=" .env | cut -d '=' -f2 | tr -d ' ')
        if [ -n "$env_port" ]; then
            port=$env_port
        fi
    fi
    echo $port
}

# 检查端口是否被占用
check_port() {
    local port=$(get_port)
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0  # 端口被占用
    else
        return 1  # 端口空闲
    fi
}

# 查找并停止占用端口的 KiroClaim 进程
kill_old_process() {
    local port=$(get_port)
    print_info "检查端口 $port 占用情况..."
    
    # 查找占用端口的进程
    local pid=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pid" ]; then
        # 检查是否是 KiroClaim 相关进程
        local process_info=$(ps -p $pid -o comm= 2>/dev/null || echo "")
        if [[ "$process_info" == *"KiroClaim"* ]] || [[ "$process_info" == *"kiroclaim"* ]] || [[ "$process_info" == *"exe"* ]]; then
            print_warn "发现旧的 KiroClaim 进程 (PID: $pid)，正在停止..."
            kill $pid 2>/dev/null || kill -9 $pid 2>/dev/null
            sleep 2
            if ps -p $pid > /dev/null 2>&1; then
                print_error "无法停止进程 $pid"
                exit 1
            else
                print_info "旧进程已停止"
            fi
        else
            print_warn "端口 $port 被其他程序占用 (PID: $pid)"
            print_error "请手动停止该进程或更改 .env 中的 PORT 配置"
            exit 1
        fi
    else
        print_debug "端口 $port 空闲"
    fi
}

# 停止所有 KiroClaim 相关进程
stop_all_processes() {
    print_info "查找并停止所有 KiroClaim 进程..."
    
    # 查找所有 KiroClaim 相关进程
    local pids=$(ps aux | grep -E '[K]iroClaim|[k]iroclaim-dev|go-build.*KiroClaim' | awk '{print $2}')
    
    if [ -z "$pids" ]; then
        print_info "没有运行中的 KiroClaim 开发进程"
    else
        for pid in $pids; do
            print_warn "停止进程 $pid"
            kill $pid 2>/dev/null || kill -9 $pid 2>/dev/null
        done
        sleep 1
        print_info "所有开发进程已停止"
    fi
}

# 本地开发模式
run_dev() {
    print_info "启动本地开发模式（SQLite）"
    check_env
    check_go
    
    # 停止旧进程
    kill_old_process
    
    # 确保使用 SQLite 配置
    export DB_TYPE=sqlite
    export DB_PATH=app.db
    export GIN_MODE=debug
    
    # 创建日志目录
    mkdir -p logs
    
    print_info "开始编译..."
    go build -o kiroclaim-dev main.go
    
    local port=$(get_port)
    print_info "启动服务（端口: $port）..."
    print_info "按 Ctrl+C 停止服务"
    ./kiroclaim-dev
}

# 编译二进制
build_binary() {
    print_info "编译 Go 二进制文件"
    check_go
    
    mkdir -p build
    
    print_info "编译 Linux 版本..."
    GOOS=linux GOARCH=amd64 go build -o build/kiroclaim-linux-amd64 main.go
    
    print_info "编译 macOS 版本..."
    GOOS=darwin GOARCH=amd64 go build -o build/kiroclaim-darwin-amd64 main.go
    GOOS=darwin GOARCH=arm64 go build -o build/kiroclaim-darwin-arm64 main.go
    
    print_info "编译 Windows 版本..."
    GOOS=windows GOARCH=amd64 go build -o build/kiroclaim-windows-amd64.exe main.go
    
    print_info "编译完成！二进制文件位于 build/ 目录"
    ls -lh build/
}

# 生产环境（Docker Compose）
run_prod() {
    print_info "启动生产环境（Docker Compose）"
    check_docker
    check_env
    
    # 检查 docker-compose.yml
    if [ ! -f docker-compose.yml ]; then
        print_error "未找到 docker-compose.yml 文件"
        exit 1
    fi
    
    print_info "拉取最新镜像..."
    if docker compose version &> /dev/null; then
        docker compose pull
        print_info "启动服务..."
        docker compose up -d
    else
        docker-compose pull
        print_info "启动服务..."
        docker-compose up -d
    fi
    
    print_info "服务启动成功！"
    print_info "访问地址: http://localhost:${PORT:-9527}"
    print_info "查看日志: $0 logs"
}

# 停止生产环境
stop_prod() {
    print_info "停止生产环境"
    check_docker
    
    if docker compose version &> /dev/null; then
        docker compose down
    else
        docker-compose down
    fi
    
    print_info "Docker 服务已停止"
}

# 停止所有服务
stop_all() {
    print_info "停止所有 KiroClaim 服务"
    
    # 停止 Docker 服务
    if [ -f docker-compose.yml ] && command -v docker &> /dev/null; then
        print_info "停止 Docker Compose 服务..."
        stop_prod 2>/dev/null || true
    fi
    
    # 停止开发进程
    stop_all_processes
    
    print_info "所有服务已停止"
}

# 重启生产环境
restart_prod() {
    print_info "重启生产环境"
    stop_prod
    sleep 2
    run_prod
}

# 查看日志
show_logs() {
    check_docker
    
    if docker compose version &> /dev/null; then
        docker compose logs -f --tail=100
    else
        docker-compose logs -f --tail=100
    fi
}

# 清理编译产物
clean() {
    print_info "清理编译产物"
    
    rm -f kiroclaim-dev
    rm -rf build/
    
    print_info "清理完成"
}

# 查看服务状态
show_status() {
    print_info "检查服务状态"
    echo ""
    
    local port=$(get_port)
    
    # 检查端口占用
    if check_port; then
        local pid=$(lsof -ti:$port 2>/dev/null)
        print_info "端口 $port 正在使用中 (PID: $pid)"
        ps -p $pid -o pid,comm,args 2>/dev/null | tail -n +2 || true
    else
        print_warn "端口 $port 空闲，没有服务运行"
    fi
    
    echo ""
    
    # 检查开发进程
    local dev_pids=$(ps aux | grep -E '[k]iroclaim-dev' | awk '{print $2}')
    if [ -n "$dev_pids" ]; then
        print_info "开发进程:"
        ps aux | grep -E '[k]iroclaim-dev'
    fi
    
    echo ""
    
    # 检查 Docker 容器
    if command -v docker &> /dev/null; then
        local containers=$(docker ps -a --filter "name=kiroclaim" --format "{{.Names}}" 2>/dev/null)
        if [ -n "$containers" ]; then
            print_info "Docker 容器状态:"
            docker ps -a --filter "name=kiroclaim" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        else
            print_warn "没有 KiroClaim Docker 容器"
        fi
    fi
}

# 主逻辑
case "${1:-help}" in
    dev)
        run_dev
        ;;
    build)
        build_binary
        ;;
    prod)
        run_prod
        ;;
    stop)
        stop_all
        ;;
    restart)
        restart_prod
        ;;
    logs)
        show_logs
        ;;
    clean)
        clean
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "未知选项: $1"
        echo ""
        show_help
        exit 1
        ;;
esac