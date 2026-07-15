package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/huey1in/KiroClaim/database"
	"github.com/huey1in/KiroClaim/model"

	"github.com/gin-gonic/gin"
)

type cardListItem struct {
	ID                  uint
	CreatedAt           time.Time
	UpdatedAt           time.Time
	Code                string
	UsedAt              *time.Time
	AccountCount        int
	Subscription        string
	Status              string
	AllowedEmailDomains string
	AvgUsage            int `json:"AvgUsage"`
	SuspendedCount      int `json:"SuspendedCount"`
}

func buildCardListItem(card model.Card) cardListItem {
	item := cardListItem{
		ID:                  card.ID,
		CreatedAt:           card.CreatedAt,
		UpdatedAt:           card.UpdatedAt,
		Code:                card.Code,
		UsedAt:              card.UsedAt,
		AccountCount:        card.AccountCount,
		Subscription:        card.Subscription,
		Status:              cardStatusFromUsedAt(card.UsedAt),
		AllowedEmailDomains: card.AllowedEmailDomains,
	}

	// 如果是使用中的卡密，计算平均用量和封号数
	if card.UsedAt != nil {
		avgUsage, suspendedCount := calculateCardStats(card.ID)
		item.AvgUsage = avgUsage
		item.SuspendedCount = suspendedCount
	}

	return item
}

func GenerateCards(c *gin.Context) {
	var req struct {
		Count               int    `json:"count" binding:"required,min=1,max=500"`
		Subscription        string `json:"subscription"`
		AccountCount        int    `json:"account_count" binding:"required,min=1"`
		AllowedEmailDomains string `json:"allowed_email_domains"` // 允许的邮箱域名，逗号分隔
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": err.Error()})
		return
	}

	subscription := strings.TrimSpace(req.Subscription)
	if subscription == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请选择账号订阅"})
		return
	}
	var subscriptionCount int64
	if err := database.DB.Model(&model.Account{}).Where("subscription = ?", subscription).Count(&subscriptionCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "订阅校验失败: " + err.Error()})
		return
	}
	if subscriptionCount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "账号订阅不存在"})
		return
	}

	// 规范化邮箱域名
	allowedEmailDomains := normalizeEmailDomains(req.AllowedEmailDomains)

	codes := make([]string, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		code := "KIRO-" + generateCode("upper", 12, "-", 4)
		card := model.Card{
			Code:                code,
			AccountCount:        req.AccountCount,
			Subscription:        subscription,
			AllowedEmailDomains: allowedEmailDomains,
		}
		if err := database.DB.Create(&card).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "写入失败: " + err.Error()})
			return
		}
		codes = append(codes, code)
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "生成成功", "data": gin.H{"codes": codes, "count": len(codes)}})
	AddOpLogWithCtx(c, "generate", "生成卡密 "+strconv.Itoa(len(codes))+" 张", "admin")
}

func ListCards(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	statusFilter := c.Query("status")
	keyword := c.Query("keyword")
	createdFrom := c.Query("created_from")
	createdTo := c.Query("created_to")
	accountCountFilter := c.Query("account_count")
	sortBy := c.DefaultQuery("sort_by", "id")
	order := c.DefaultQuery("order", "desc")
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	if size > 1000 {
		size = 1000
	}

	var total int64
	var cards []model.Card
	q := database.DB.Model(&model.Card{})

	if statusFilter != "" {
		switch statusFilter {
		case cardStatusUnused:
			q = q.Where("used_at IS NULL")
		case cardStatusActive:
			q = q.Where("used_at IS NOT NULL")
		default:
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "状态只能是 unused / active"})
			return
		}
	}
	if keyword != "" {
		q = q.Where("code LIKE ?", "%"+keyword+"%")
	}
	if createdFrom != "" {
		if t, err := time.Parse("2006-01-02", createdFrom); err == nil {
			q = q.Where("created_at >= ?", t)
		}
	}
	if createdTo != "" {
		if t, err := time.Parse("2006-01-02", createdTo); err == nil {
			q = q.Where("created_at < ?", t.AddDate(0, 0, 1))
		}
	}
	if accountCountFilter != "" {
		if count, err := strconv.Atoi(accountCountFilter); err == nil && count > 0 {
			q = q.Where("account_count = ?", count)
		}
	}

	q.Count(&total)

	// 构建排序条件
	var orderClause string
	switch sortBy {
	case "id":
		orderClause = "id"
	case "created_at":
		orderClause = "created_at"
	case "used_at":
		orderClause = "used_at"
	default:
		orderClause = "id"
	}
	if order == "asc" {
		orderClause += " asc"
	} else {
		orderClause += " desc"
	}

	q.Order(orderClause).Offset((page - 1) * size).Limit(size).Find(&cards)

	list := make([]cardListItem, 0, len(cards))
	for _, card := range cards {
		list = append(list, buildCardListItem(card))
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{
		"total": total, "page": page, "size": size, "list": list,
	}})
}

func DeleteCard(c *gin.Context) {
	id := c.Param("id")
	cardID64, err := strconv.ParseUint(id, 10, 64)
	if err != nil || cardID64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "无效的 ID"})
		return
	}
	if err := releaseAccountsForCards([]uint{uint(cardID64)}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if err := database.DB.Delete(&model.Card{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": err.Error()})
		return
	}
	AddOpLogWithCtx(c, "delete", "删除卡密 ID:"+id, "admin")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已删除"})
}

func BatchDeleteCards(c *gin.Context) {
	var req struct {
		IDs []uint `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误: " + err.Error()})
		return
	}
	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请选择要删除的卡密"})
		return
	}
	if err := releaseAccountsForCards(req.IDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": err.Error()})
		return
	}
	result := database.DB.Where("id IN ?", req.IDs).Delete(&model.Card{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": result.Error.Error()})
		return
	}
	AddOpLogWithCtx(c, "delete", "批量删除卡密 "+strconv.Itoa(len(req.IDs))+" 张，实际删除 "+strconv.FormatInt(result.RowsAffected, 10)+" 张", "admin")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已删除", "data": gin.H{"deleted": result.RowsAffected}})
}

func generateCode(charset string, length int, separator string, groupSize int) string {
	var alphabet string
	switch charset {
	case "upper":
		alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	case "alnum":
		alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	default:
		b := make([]byte, (length+1)/2)
		rand.Read(b)
		raw := hex.EncodeToString(b)[:length]
		if separator == "" {
			return raw
		}
		return splitGroups(raw, groupSize, separator)
	}

	result := make([]byte, 0, length)
	buf := make([]byte, length*2)
	for len(result) < length {
		rand.Read(buf)
		for _, c := range buf {
			if len(result) >= length {
				break
			}
			idx := int(c) % len(alphabet)
			result = append(result, alphabet[idx])
		}
	}
	raw := string(result)
	if separator == "" {
		return raw
	}
	return splitGroups(raw, groupSize, separator)
}

func splitGroups(s string, size int, sep string) string {
	var parts []string
	for i := 0; i < len(s); i += size {
		end := i + size
		if end > len(s) {
			end = len(s)
		}
		parts = append(parts, s[i:end])
	}
	return strings.Join(parts, sep)
}

// parseEmailDomainRestriction 解析域名限制。
// 支持：
//   - 白名单: "gmail.com,outlook.com"
//   - 黑名单: "!qq.com,!163.com"（任一域名以 ! 开头则整体视为排除模式）
func parseEmailDomainRestriction(raw string) (deny bool, domains []string) {
	if strings.TrimSpace(raw) == "" {
		return false, nil
	}
	parts := strings.Split(raw, ",")
	seen := make(map[string]bool)
	domains = make([]string, 0, len(parts))
	denyCount := 0
	for _, part := range parts {
		item := strings.ToLower(strings.TrimSpace(part))
		if item == "" {
			continue
		}
		isDeny := strings.HasPrefix(item, "!")
		if isDeny {
			denyCount++
			item = strings.TrimPrefix(item, "!")
		}
		item = strings.TrimPrefix(item, "@")
		item = strings.TrimSpace(item)
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		domains = append(domains, item)
	}
	// 只要出现排除标记，整组按排除模式处理（兼容历史纯白名单）
	deny = denyCount > 0
	return deny, domains
}

// normalizeEmailDomains 规范化邮箱域名列表（保留 ! 排除前缀）
func normalizeEmailDomains(domains string) string {
	deny, list := parseEmailDomainRestriction(domains)
	if len(list) == 0 {
		return ""
	}
	result := make([]string, 0, len(list))
	for _, d := range list {
		if deny {
			result = append(result, "!"+d)
		} else {
			result = append(result, d)
		}
	}
	return strings.Join(result, ",")
}

// emailMatchesDomains 检查邮箱是否满足域名限制（允许/排除）
func emailMatchesDomains(email string, allowedDomains string) bool {
	deny, domains := parseEmailDomainRestriction(allowedDomains)
	if len(domains) == 0 {
		return true // 没有限制
	}
	if email == "" {
		return false
	}
	email = strings.ToLower(strings.TrimSpace(email))
	matched := false
	for _, domain := range domains {
		if strings.HasSuffix(email, "@"+domain) {
			matched = true
			break
		}
	}
	if deny {
		return !matched // 排除模式：命中则不可用
	}
	return matched // 允许模式：必须命中
}

func ListCardLogs(c *gin.Context) {
	cardID := c.Param("id")
	var logs []model.CardLog
	database.DB.Where("card_id = ?", cardID).Order("id desc").Find(&logs)

	// 为每条日志关联查询账号详细信息
	type LogWithAccountInfo struct {
		model.CardLog
		AccountStatus      string  `json:"AccountStatus,omitempty"`
		AccountCreditUsed  float64 `json:"AccountCreditUsed,omitempty"`
		AccountCreditLimit float64 `json:"AccountCreditLimit,omitempty"`
	}

	logsWithInfo := make([]LogWithAccountInfo, 0, len(logs))
	for _, log := range logs {
		lwi := LogWithAccountInfo{CardLog: log}
		if log.AccountID > 0 {
			var account model.Account
			if err := database.DB.Select("status, credit_used, credit_limit").Where("id = ?", log.AccountID).First(&account).Error; err == nil {
				lwi.AccountStatus = string(account.Status)
				lwi.AccountCreditUsed = account.CreditUsed
				lwi.AccountCreditLimit = account.CreditLimit
			}
		}
		logsWithInfo = append(logsWithInfo, lwi)
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": logsWithInfo})
}

// calculateCardStats 计算单个卡密的统计数据
func calculateCardStats(cardID uint) (avgUsage int, suspendedCount int) {
	// 查询该卡密关联的所有账号ID
	var cardAccounts []model.CardAccount
	if err := database.DB.Where("card_id = ?", cardID).Find(&cardAccounts).Error; err != nil {
		return 0, 0
	}

	if len(cardAccounts) == 0 {
		return 0, 0
	}

	// 收集所有账号ID（去重）
	accountIDSet := make(map[uint]bool)
	for _, ca := range cardAccounts {
		accountIDSet[ca.AccountID] = true
	}

	accountIDs := make([]uint, 0, len(accountIDSet))
	for id := range accountIDSet {
		accountIDs = append(accountIDs, id)
	}

	// 查询这些账号的详细信息
	var accounts []model.Account
	if err := database.DB.Where("id IN ?", accountIDs).Find(&accounts).Error; err != nil {
		return 0, 0
	}

	// 统计
	var totalUsage float64
	var totalLimit float64
	suspendedCount = 0

	for _, acc := range accounts {
		if acc.Status == model.AccountStatusSuspended {
			suspendedCount++
		}
		if acc.CreditLimit > 0 {
			totalUsage += acc.CreditUsed
			totalLimit += acc.CreditLimit
		}
	}

	// 计算平均用量百分比
	if totalLimit > 0 {
		avgUsage = int((totalUsage / totalLimit) * 100)
	}

	return avgUsage, suspendedCount
}
