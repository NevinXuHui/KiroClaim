#!/bin/bash
set -e

# 本地编译脚本
VERSION=${VERSION:-dev}

echo "开始本地编译..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -trimpath \
    -ldflags="-s -w -X github.com/huey1in/KiroClaim/utils.AppVersion=${VERSION}" \
    -o kiroclaim .

if [ ! -f kiroclaim ]; then
    echo "错误：编译失败，未生成 kiroclaim 文件"
    exit 1
fi

echo "编译完成，构建 Docker 镜像..."
docker build -f Dockerfile.local -t kiroclaim:local .

echo "清理编译产物..."
rm -f kiroclaim

echo "构建完成: kiroclaim:local"
