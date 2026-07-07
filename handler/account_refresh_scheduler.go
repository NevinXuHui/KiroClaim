package handler

import (
	"log"
	"sync"
	"time"

	"github.com/huey1in/KiroClaim/database"
	"github.com/huey1in/KiroClaim/model"
)

var (
	refreshSchedulerRunning bool
	refreshSchedulerMu      sync.Mutex
	refreshSchedulerStop    chan struct{}
)

// StartAccountRefreshScheduler 启动后台定时刷新任务
func StartAccountRefreshScheduler() {
	refreshSchedulerMu.Lock()
	defer refreshSchedulerMu.Unlock()

	if refreshSchedulerRunning {
		return
	}

	refreshSchedulerStop = make(chan struct{})
	refreshSchedulerRunning = true

	go accountRefreshLoop()
	log.Println("后台账号刷新调度器已启动")
}

// StopAccountRefreshScheduler 停止后台定时刷新任务
func StopAccountRefreshScheduler() {
	refreshSchedulerMu.Lock()
	defer refreshSchedulerMu.Unlock()

	if !refreshSchedulerRunning {
		return
	}

	close(refreshSchedulerStop)
	refreshSchedulerRunning = false
	log.Println("后台账号刷新调度器已停止")
}

// RestartAccountRefreshScheduler 重启后台刷新任务（用于更新配置后）
func RestartAccountRefreshScheduler() {
	StopAccountRefreshScheduler()
	time.Sleep(500 * time.Millisecond)
	StartAccountRefreshScheduler()
}

func accountRefreshLoop() {
	for {
		settings := GetCurrentSettings()
		
		// 如果未启用自动刷新，等待后再检查
		if !settings.AutoRefreshEnabled {
			select {
			case <-refreshSchedulerStop:
				return
			case <-time.After(30 * time.Second):
				continue
			}
		}

		// 执行刷新
		refreshAllActiveAccounts()

		// 等待下一次刷新
		interval := time.Duration(settings.AutoRefreshIntervalMinutes) * time.Minute
		if interval < 5*time.Minute {
			interval = 5 * time.Minute // 最小间隔5分钟
		}

		select {
		case <-refreshSchedulerStop:
			return
		case <-time.After(interval):
			// 继续下一轮
		}
	}
}

// refreshAllActiveAccounts 刷新所有活跃账号（排除封禁账号）
func refreshAllActiveAccounts() {
	var accounts []model.Account
	err := database.DB.Where("status = ?", model.AccountStatusActive).Find(&accounts).Error
	if err != nil {
		log.Printf("后台刷新: 查询账号失败: %v", err)
		return
	}

	if len(accounts) == 0 {
		log.Println("后台刷新: 没有需要刷新的活跃账号")
		return
	}

	log.Printf("后台刷新: 开始刷新 %d 个账号", len(accounts))
	startTime := time.Now()
	
	successCount := 0
	failedCount := 0
	suspendedCount := 0

	for _, account := range accounts {
		result := checkAccountHealth(account)
		if err := applyHealthResult(account.ID, result); err != nil {
			log.Printf("后台刷新: 账号 ID=%d 保存结果失败: %v", account.ID, err)
			failedCount++
			continue
		}

		if result.status == model.AccountStatusSuspended {
			suspendedCount++
			log.Printf("后台刷新: 账号 ID=%d 已被判定封禁", account.ID)
		} else if result.errMsg != "" {
			failedCount++
			log.Printf("后台刷新: 账号 ID=%d 刷新失败: %s", account.ID, result.errMsg)
		} else {
			successCount++
		}
	}

	elapsed := time.Since(startTime)
	log.Printf("后台刷新完成: 总计 %d 个账号, 成功 %d, 失败 %d, 封禁 %d, 耗时 %v",
		len(accounts), successCount, failedCount, suspendedCount, elapsed)
}