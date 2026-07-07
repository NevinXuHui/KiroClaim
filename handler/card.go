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
}

func buildCardListItem(card model.Card) cardListItem {
	return cardListItem{
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

	q.Count(&total)
	q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&cards)

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

// normalizeEmailDomains 规范化邮箱域名列表
func normalizeEmailDomains(domains string) string {
	if domains == "" {
		return ""
	}
	// 分割、去除空白、去重
	parts := strings.Split(domains, ",")
	seen := make(map[string]bool)
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		domain := strings.TrimSpace(part)
		domain = strings.ToLower(domain)
		// 确保域名格式正确
		if domain != "" && !seen[domain] {
			// 移除开头的 @ 符号（如果有）
			domain = strings.TrimPrefix(domain, "@")
			if domain != "" {
				seen[domain] = true
				result = append(result, domain)
			}
		}
	}
	return strings.Join(result, ",")
}

// emailMatchesDomains 检查邮箱是否匹配允许的域名列表
func emailMatchesDomains(email string, allowedDomains string) bool {
	if allowedDomains == "" {
		return true // 没有限制，所有邮箱都可以
	}
	if email == "" {
		return false
	}
	email = strings.ToLower(strings.TrimSpace(email))
	domains := strings.Split(allowedDomains, ",")
	for _, domain := range domains {
		domain = strings.TrimSpace(domain)
		if domain == "" {
			continue
		}
		// 检查邮箱是否以 @domain 结尾
		if strings.HasSuffix(email, "@"+domain) {
			return true
		}
	}
	return false
}

func ListCardLogs(c *gin.Context) {
	cardID := c.Param("id")
	var logs []model.CardLog
	database.DB.Where("card_id = ?", cardID).Order("id desc").Find(&logs)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": logs})
}
