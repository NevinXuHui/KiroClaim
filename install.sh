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

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查是否以 root 运行
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "请使用 root 权限运行此脚本"
        echo "使用方法: sudo $0"
        exit 1
    fi
}

# 检查系统
check_system() {
    print_step "检查系统环境..."
    
    if ! command -v systemctl &> /dev/null; then
        print_error "系统不支持 systemd"
        exit 1
    fi
    
    print_info "系统检查通过"
}

# 检查 Go 环境
check_go() {
    if ! command -v go &> /dev/null; then
        print_error "未找到 Go 环境"
        print_info "正在尝试安装 Go..."
        install_go
    else
        print_info "Go 版本: $(go version)"
    fi
}

# 安装 Go（可选）
install_go() {
    print_warn "请手动安装 Go 1.20+ 后再运行此脚本"
    print_info "安装方法: https://golang.org/doc/install"
    exit 1
}

# 显示帮助信息
show_help() {
    cat << EOF
KiroClaim 系统安装脚本

用法: sudo $0 [选项]

选项:
    install     安装 KiroClaim 服务
    uninstall   卸载 KiroClaim 服务
    status      查看服务状态
    help        显示此帮助信息

示例:
    sudo $0 install      # 安装并启动服务
    sudo $0 uninstall    # 卸载服务
    sudo $0 status       # 查看服务状态

EOF
}

# 获取安装配置
get_install_config() {
    print_step "配置安装参数..."
    
    # 安装目录
    read -p "安装目录 (默认: /opt/kiroclaim): " INSTALL_DIR
    INSTALL_DIR=${INSTALL_DIR:-/opt/kiroclaim}
    
    # 运行用户
    read -p "运行用户 (默认: kiroclaim): " RUN_USER
    RUN_USER=${RUN_USER:-kiroclaim}
    
    # 端口
    read -p "监听端口 (默认: 9527): " PORT
    PORT=${PORT:-9527}
    
    # 数据库类型
    echo ""
    echo "数据库类型:"
    echo "  1) SQLite (推荐，适合小规模部署)"
    echo "  2) MySQL (适合生产环境)"
    read -p "选择 [1-2] (默认: 1): " DB_CHOICE
    DB_CHOICE=${DB_CHOICE:-1}
    
    if [ "$DB_CHOICE" = "2" ]; then
        DB_TYPE="mysql"
        read -p "MySQL 地址 (如 localhost:3306): " MYSQL_HOST
        read -p "MySQL 数据库名: " MYSQL_DB
        read -p "MySQL 用户名: " MYSQL_USER
        read -s -p "MySQL 密码: " MYSQL_PASS
        echo ""
        DB_DSN="${MYSQL_USER}:${MYSQL_PASS}@tcp(${MYSQL_HOST})/${MYSQL_DB}?charset=utf8mb4&parseTime=True&loc=Local"
    else
        DB_TYPE="sqlite"
        DB_PATH="${INSTALL_DIR}/data/app.db"
    fi
    
    echo ""
    print_info "配置完成:"
    print_info "  安装目录: $INSTALL_DIR"
    print_info "  运行用户: $RUN_USER"
    print_info "  监听端口: $PORT"
    print_info "  数据库类型: $DB_TYPE"
    echo ""
    read -p "确认安装？[y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warn "安装已取消"
        exit 0
    fi
}

# 创建系统用户
create_user() {
    print_step "创建系统用户..."
    
    if id "$RUN_USER" &>/dev/null; then
        print_warn "用户 $RUN_USER 已存在"
    else
        useradd --system --no-create-home --shell /bin/false "$RUN_USER"
        print_info "已创建用户: $RUN_USER"
    fi
}

# 创建目录结构
create_directories() {
    print_step "创建目录结构..."
    
    mkdir -p "$INSTALL_DIR"/{bin,data,logs,static}
    mkdir -p "$INSTALL_DIR/static"/{css,js,font}
    
    print_info "目录创建完成"
}

# 编译程序
build_program() {
    print_step "编译 KiroClaim..."
    
    CURRENT_DIR=$(pwd)
    
    if [ ! -f "main.go" ]; then
        print_error "未找到 main.go，请在项目根目录运行此脚本"
        exit 1
    fi
    
    # 删除旧的二进制文件（如果存在）
    if [ -f "$INSTALL_DIR/bin/kiroclaim" ]; then
        print_info "删除旧的二进制文件"
        rm -f "$INSTALL_DIR/bin/kiroclaim"
    fi
    
    print_info "重新编译项目..."
    if go build -o "$INSTALL_DIR/bin/kiroclaim" main.go; then
        print_info "编译成功"
        chmod +x "$INSTALL_DIR/bin/kiroclaim"
    else
        print_error "编译失败"
        exit 1
    fi
}

# 复制静态文件
copy_files() {
    print_step "复制文件..."
    
    # 复制静态资源
    if [ -d "static" ]; then
        cp -r static/* "$INSTALL_DIR/static/"
        print_info "静态文件复制完成"
    fi
    
    # 创建 .env 文件
    cat > "$INSTALL_DIR/.env" << EOF
# KiroClaim 配置文件
PORT=$PORT
GIN_MODE=release

# Database
DB_TYPE=$DB_TYPE
EOF

    if [ "$DB_TYPE" = "mysql" ]; then
        echo "DB_DSN=$DB_DSN" >> "$INSTALL_DIR/.env"
    else
        echo "DB_PATH=$DB_PATH" >> "$INSTALL_DIR/.env"
    fi
    
    cat >> "$INSTALL_DIR/.env" << 'EOF'

# Log settings
LOG_FILE_ENABLED=true
LOG_FILE_PATH=logs/app.log
LOG_MAX_SIZE_MB=50
LOG_MAX_BACKUPS=10
LOG_MAX_AGE_DAYS=30
LOG_COMPRESS=true
EOF
    
    print_info "配置文件创建完成"
}

# 创建 systemd 服务
create_systemd_service() {
    print_step "创建 systemd 服务..."
    
    cat > /etc/systemd/system/kiroclaim.service << EOF
[Unit]
Description=KiroClaim - Account Management Service
Documentation=https://github.com/huey1in/KiroClaim
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/bin/kiroclaim
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30s
Restart=always
RestartSec=10s

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR/data $INSTALL_DIR/logs
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

# Limits
LimitNOFILE=65536
LimitNPROC=512

# Environment
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

[Install]
WantedBy=multi-user.target
EOF
    
    print_info "systemd 服务文件创建完成"
}

# 设置权限
set_permissions() {
    print_step "设置文件权限..."
    
    chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR"
    chmod 750 "$INSTALL_DIR"
    chmod 640 "$INSTALL_DIR/.env"
    chmod 755 "$INSTALL_DIR/bin/kiroclaim"
    
    print_info "权限设置完成"
}

# 检查并停止占用端口的进程
check_and_stop_port() {
    print_step "检查端口占用..."

    # 检查端口是否被占用
    if command -v lsof &> /dev/null; then
        PORT_PID=$(lsof -ti :$PORT 2>/dev/null || true)
        if [ -n "$PORT_PID" ]; then
            print_warn "端口 $PORT 已被进程 $PORT_PID 占用"

            # 检查是否是旧的 KiroClaim 进程
            PROCESS_NAME=$(ps -p $PORT_PID -o comm= 2>/dev/null || true)
            if [[ "$PROCESS_NAME" == *"kiroclaim"* ]] || [[ "$PROCESS_NAME" == *"KiroClaim"* ]]; then
                print_info "检测到旧的 KiroClaim 进程，正在停止..."
                kill $PORT_PID 2>/dev/null || true
                sleep 2

                # 如果进程仍在运行，强制终止
                if kill -0 $PORT_PID 2>/dev/null; then
                    print_warn "强制终止进程 $PORT_PID"
                    kill -9 $PORT_PID 2>/dev/null || true
                    sleep 1
                fi
                print_info "旧进程已停止"
            else
                print_error "端口 $PORT 被其他程序 ($PROCESS_NAME) 占用"
                print_info "请修改配置使用其他端口，或停止占用端口的程序"
                exit 1
            fi
        else
            print_info "端口 $PORT 可用"
        fi
    else
        print_warn "lsof 命令不可用，跳过端口检查"
    fi
}

# 启动服务
start_service() {
    print_step "启动服务..."

    # 检查并处理端口占用
    check_and_stop_port

    systemctl daemon-reload
    systemctl enable kiroclaim
    systemctl start kiroclaim

    sleep 2

    if systemctl is-active --quiet kiroclaim; then
        print_info "KiroClaim 服务启动成功！"
        echo ""
        print_info "访问地址: http://localhost:$PORT"
        print_info "服务管理命令:"
        echo "  启动: sudo systemctl start kiroclaim"
        echo "  停止: sudo systemctl stop kiroclaim"
        echo "  重启: sudo systemctl restart kiroclaim"
        echo "  状态: sudo systemctl status kiroclaim"
        echo "  日志: sudo journalctl -u kiroclaim -f"
        echo ""
        print_info "首次使用请访问 /setup 进行初始化设置"
    else
        print_error "服务启动失败"
        echo "查看日志: sudo journalctl -u kiroclaim -n 50"
        exit 1
    fi
}

# 安装函数
do_install() {
    print_info "开始安装 KiroClaim..."
    echo ""
    
    check_root
    check_system
    check_go
    get_install_config
    create_user
    create_directories
    build_program
    copy_files
    create_systemd_service
    set_permissions
    start_service
    
    echo ""
    print_info "================================================"
    print_info "  KiroClaim 安装完成！"
    print_info "================================================"
}

# 卸载函数
do_uninstall() {
    print_warn "开始卸载 KiroClaim..."
    
    check_root
    
    read -p "确认卸载 KiroClaim？这将删除所有数据！[y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "卸载已取消"
        exit 0
    fi
    
    print_step "停止服务..."
    systemctl stop kiroclaim 2>/dev/null || true
    systemctl disable kiroclaim 2>/dev/null || true
    
    print_step "删除服务文件..."
    rm -f /etc/systemd/system/kiroclaim.service
    systemctl daemon-reload
    
    print_step "删除安装目录..."
    INSTALL_DIR=${INSTALL_DIR:-/opt/kiroclaim}
    if [ -d "$INSTALL_DIR" ]; then
        read -p "删除数据目录 $INSTALL_DIR？[y/N] " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
            print_info "已删除: $INSTALL_DIR"
        fi
    fi
    
    print_step "删除系统用户..."
    RUN_USER=${RUN_USER:-kiroclaim}
    if id "$RUN_USER" &>/dev/null; then
        read -p "删除用户 $RUN_USER？[y/N] " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            userdel "$RUN_USER" 2>/dev/null || true
            print_info "已删除用户: $RUN_USER"
        fi
    fi
    
    print_info "KiroClaim 卸载完成"
}

# 查看状态
show_status() {
    check_root
    
    print_info "KiroClaim 服务状态:"
    echo ""
    systemctl status kiroclaim --no-pager
    echo ""
    
    if systemctl is-active --quiet kiroclaim; then
        print_info "服务运行中"
        echo ""
        print_info "最近日志:"
        journalctl -u kiroclaim -n 20 --no-pager
    else
        print_warn "服务未运行"
    fi
}

# 主逻辑
case "${1:-help}" in
    install)
        do_install
        ;;
    uninstall)
        do_uninstall
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