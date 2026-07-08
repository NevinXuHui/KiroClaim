// 卡密管理模块

let cardStatusFilter = '';
let cardKeyword = '';
let cardAccountCountFilter = ''; // 账号数量筛选
let genSubscription = '';
let genEmailDomains = []; // 存储选中的邮箱域名
let cardSortBy = 'id'; // 排序字段
let cardSortOrder = 'desc'; // 排序方向

// 每页显示数量（从 localStorage 读取，默认 15）
let cardPageSize = parseInt(localStorage.getItem('cardPageSize') || '15');

let selectedCardIds = new Set();

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function cardSubscriptionLabel(subscription) {
  return subscription ? subscription : '-';
}

function cardStatusBadge(status) {
  var map = {
    unused:   '<span class="k-badge k-badge-success">未使用</span>',
    active:   '<span class="k-badge k-badge-neutral">使用中</span>'
  };
  return map[status] || map.unused;
}

// 格式化时间显示（支持 ISO 8601 字符串和时间戳）
function formatCardTime(value) {
  if (!value) return '-';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return '-';
  }
}

async function copyCardKeys() {
  const textarea = document.getElementById('generatedCodes');
  if (!textarea) return;
  
  const codes = textarea.value.split('\n').filter(line => line.trim() !== '');
  if (codes.length === 0) {
    showToast('没有卡密可复制', 'error');
    return;
  }

  try {
    const settingsResp = await api('GET', '/admin/settings');
    const prefix = (settingsResp.code === 0 && settingsResp.data?.cardKeyPrefix) 
      ? settingsResp.data.cardKeyPrefix 
      : '';
    const suffix = (settingsResp.code === 0 && settingsResp.data?.cardKeySuffix) 
      ? settingsResp.data.cardKeySuffix 
      : '';
    
    const textToCopy = codes.map(code => {
      let line = code;
      if (prefix) line = prefix + ' ' + line;
      if (suffix) line = line + ' ' + suffix;
      return line;
    }).join('\n');
    
    navigator.clipboard.writeText(textToCopy).then(function() {
      showToast('已复制到剪贴板', 'success');
    }).catch(function() {
      showToast('复制失败', 'error');
    });
  } catch (err) {
    const textToCopy = codes.join('\n');
    navigator.clipboard.writeText(textToCopy).then(function() {
      showToast('已复制到剪贴板', 'success');
    }).catch(function() {
      showToast('复制失败', 'error');
    });
  }
}

async function loadCards(page = 1) {
  cardKeyword = (document.getElementById('cardKeyword')?.value || '').trim();
  const createdFrom = document.getElementById('cardCreatedFrom')?.value || '';
  const createdTo = document.getElementById('cardCreatedTo')?.value || '';
  let url = `/admin/cards?page=${page}&size=${cardPageSize}`;
  if (cardStatusFilter) url += `&status=${cardStatusFilter}`;
  if (cardKeyword) url += `&keyword=${encodeURIComponent(cardKeyword)}`;
  if (createdFrom) url += `&created_from=${createdFrom}`;
  if (createdTo) url += `&created_to=${createdTo}`;
  if (cardAccountCountFilter) url += `&account_count=${cardAccountCountFilter}`;
  if (cardSortBy) url += `&sort_by=${cardSortBy}`;
  if (cardSortOrder) url += `&order=${cardSortOrder}`;

  const r = await api('GET', url);
  const tbody = document.getElementById('cardsBody');
  if (!tbody) return;
  if (r.code !== 0 || !r.data.list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">无卡密记录</td></tr>';
    updateCardBatchBtn();
    return;
  }

  tbody.innerHTML = r.data.list.map(function(c) {
    const checked = selectedCardIds.has(c.ID) ? 'checked' : '';
    const multiLabel = c.AccountCount > 1 ? `<span class="k-badge" style="background:#eff6ff;color:#1d4ed8">${c.AccountCount}号</span>` : '';
    const subscription = cardSubscriptionLabel(c.Subscription || '');
    const status = c.Status || (c.UsedAt ? 'active' : 'unused');
    const emailDomainLabel = c.AllowedEmailDomains ? `<span class="k-badge" style="background:#fef3c7;color:#92400e;font-size:11px" title="限制邮箱域名: ${escapeAttr(c.AllowedEmailDomains)}">🔒${escapeHtml(c.AllowedEmailDomains.split(',')[0])}${c.AllowedEmailDomains.split(',').length > 1 ? '...' : ''}</span>` : '';
    const usedAtDisplay = formatCardTime(c.UsedAt);
    return `<tr>
      <td data-label="选择"><input type="checkbox" class="k-checkbox" ${checked} onchange="toggleCardSelect(${c.ID}, this.checked)"></td>
      <td data-label="ID">${c.ID}</td>
      <td data-label="序列号">
        <code class="copyable-text" style="background:#f1f1f1;padding:2px 4px;white-space:nowrap" 
              onclick="showCardLogs(${c.ID}, '${escapeAttr(c.Code)}')" 
              title="点击查看详情">${escapeHtml(c.Code)}</code>
      </td>
      <td data-label="账号订阅" style="font-size:12px;white-space:nowrap">${escapeHtml(subscription)} ${multiLabel} ${emailDomainLabel}</td>
      <td data-label="状态">${cardStatusBadge(status)}</td>
      <td data-label="兑换时间" style="font-size:12px;color:var(--text-muted)">${usedAtDisplay}</td>
      <td data-label="操作">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="showCardLogs(${c.ID}, '${escapeAttr(c.Code)}')">详情</button>
          ${status === 'active' || c.UsedAt ? `<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="exportCard(${c.ID})">导出</button>` : ''}
          <button class="ui-btn ui-btn-danger ui-btn-sm" onclick="deleteCard(${c.ID})">删除</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  renderPagination('cardsPagination', r.data.total, cardPageSize, page, loadCards);
  updateCardBatchBtn();

  const selectAll = document.getElementById('selectAllCards');
  if (selectAll) {
    const checkboxes = tbody.querySelectorAll('input[type="checkbox"]');
    selectAll.checked = checkboxes.length > 0 && [...checkboxes].every(cb => cb.checked);
  }
}

function selectCardFilter(value, text) {
  cardStatusFilter = value;
  document.getElementById('cardFilterText').textContent = text;
  document.querySelectorAll('#cardFilterDropdown .k-dropdown-item').forEach(function(item) {
    item.classList.remove('selected');
  });
  event.target.classList.add('selected');
  toggleDropdown('cardFilterDropdown');
  loadCards(1);
}

function selectCardAccountCount(value, text) {
  cardAccountCountFilter = value;
  document.getElementById('cardAccountCountText').textContent = text;
  document.querySelectorAll('#cardAccountCountDropdown .k-dropdown-item').forEach(function(item) {
    item.classList.remove('selected');
  });
  event.target.classList.add('selected');
  toggleDropdown('cardAccountCountDropdown');
  loadCards(1);
}

// 选择每页显示数量
function selectCardPageSize(size, text) {
  cardPageSize = size;
  localStorage.setItem('cardPageSize', size);
  document.getElementById('cardPageSizeText').textContent = text;
  document.querySelectorAll('#cardPageSizeDropdown .k-dropdown-item').forEach(function(item) {
    item.classList.remove('selected');
  });
  event.target.classList.add('selected');
  toggleDropdown('cardPageSizeDropdown');
  loadCards(1);
}

// 选择排序方式
function selectCardSort(sortBy, order, text) {
  cardSortBy = sortBy;
  cardSortOrder = order;
  document.getElementById('cardSortText').textContent = text;
  document.querySelectorAll('#cardSortDropdown .k-dropdown-item').forEach(function(item) {
    item.classList.remove('selected');
  });
  event.target.classList.add('selected');
  toggleDropdown('cardSortDropdown');
  loadCards(1);
}

function selectGenSubscription(value, text) {
  const subscription = String(value || '').trim();
  if (!subscription) return;
  genSubscription = subscription;
  document.getElementById('genSubscriptionText').textContent = text || cardSubscriptionLabel(subscription);
  document.querySelectorAll('#genSubscriptionDropdown .k-dropdown-item').forEach(function(item) {
    item.classList.toggle('selected', item.getAttribute('data-subscription') === genSubscription);
  });
  toggleDropdown('genSubscriptionDropdown');
  updateModeHint();
}

function getGenAccountCount(normalizeInput) {
  const input = document.getElementById('genAccountCount');
  let count = parseInt(input?.value, 10);
  if (!Number.isFinite(count) || count < 1) count = 1;
  if (normalizeInput && input) input.value = count;
  return count;
}

function updateModeHint() {
  const count = parseInt(document.getElementById('genCount')?.value) || 1;
  const accountCount = getGenAccountCount(false);
  const hint = document.getElementById('genModeHint');
  if (!hint) return;
  const accountText = `每张绑定 ${accountCount} 个账号`;
  const subscriptionText = genSubscription ? cardSubscriptionLabel(genSubscription) : '请先选择账号订阅';
  const domainText = genEmailDomains.length > 0 ? `，限制域名：${genEmailDomains.join(', ')}` : '';
  hint.textContent = `将生成 ${count} 张卡密，${accountText}，账号订阅：${subscriptionText}${domainText}。`;
}

async function showGenerateModal() {
  document.getElementById('generateModal').classList.add('active');
  await loadCardSubscriptionStats();
  await loadEmailDomains();
  updateModeHint();
}

async function loadEmailDomains() {
  const r = await api('GET', '/admin/accounts/email-domains');
  const dropdown = document.getElementById('genEmailDomainsDropdown');
  if (!dropdown) return;
  const menu = document.getElementById('genEmailDomainsMenu');
  if (!menu) return;

  if (r.code !== 0 || !Array.isArray(r.data)) {
    genEmailDomains = [];
    updateEmailDomainsDisplay();
    menu.innerHTML = '<div class="k-dropdown-item disabled">域名加载失败</div>';
    return;
  }

  const domains = r.data.map(function(it) {
    return {
      domain: String(it.domain || '').trim(),
      unusedCount: it.unusedCount || 0,
      totalCount: it.totalCount || 0
    };
  }).filter(function(it) {
    return !!it.domain;
  });

  if (!domains.length) {
    genEmailDomains = [];
    updateEmailDomainsDisplay();
    menu.innerHTML = '<div class="k-dropdown-item disabled">暂无邮箱域名</div>';
    return;
  }

  // 添加"不限制"选项
  let html = '<div class="k-dropdown-item" data-domain="" onclick="toggleEmailDomain(\'\')">不限制</div>';
  html += '<div style="border-top:1px solid #eee;margin:4px 0"></div>';
  
  html += domains.map(function(it) {
    const countColor = it.unusedCount > 0 ? '#999' : '#dc2626';
    const checked = genEmailDomains.includes(it.domain) ? '✓ ' : '';
    return '<div class="k-dropdown-item" data-domain="' + escapeAttr(it.domain) + '" onclick="toggleEmailDomain(\'' + escapeAttr(it.domain) + '\')">' +
      '<span id="domain-check-' + escapeAttr(it.domain) + '">' + checked + '</span>' +
      escapeHtml(it.domain) + ' <span style="color:' + countColor + ';font-size:12px">(' + it.unusedCount + ' 可用)</span>' +
      '</div>';
  }).join('');

  menu.innerHTML = html;
  updateEmailDomainsDisplay();
}

function toggleEmailDomain(domain) {
  if (domain === '') {
    // 选择"不限制"，清空所有选择
    genEmailDomains = [];
  } else {
    const index = genEmailDomains.indexOf(domain);
    if (index > -1) {
      genEmailDomains.splice(index, 1);
    } else {
      genEmailDomains.push(domain);
    }
  }
  updateEmailDomainsDisplay();
  updateEmailDomainsChecks();
  updateModeHint();
  // 不关闭下拉框，允许多选
}

function updateEmailDomainsDisplay() {
  const text = document.getElementById('genEmailDomainsText');
  if (!text) return;
  
  if (genEmailDomains.length === 0) {
    text.textContent = '不限制';
  } else if (genEmailDomains.length === 1) {
    text.textContent = genEmailDomains[0];
  } else {
    text.textContent = genEmailDomains[0] + ' +' + (genEmailDomains.length - 1);
  }
}

function updateEmailDomainsChecks() {
  const menu = document.getElementById('genEmailDomainsMenu');
  if (!menu) return;
  
  menu.querySelectorAll('.k-dropdown-item').forEach(function(item) {
    const domain = item.getAttribute('data-domain');
    const checkSpan = item.querySelector('[id^="domain-check-"]');
    if (checkSpan) {
      checkSpan.textContent = genEmailDomains.includes(domain) ? '✓ ' : '';
    }
  });
}

async function loadCardSubscriptionStats() {
  const r = await api('GET', '/admin/accounts/subscription-stats');
  const dropdown = document.getElementById('genSubscriptionDropdown');
  if (!dropdown) return;
  const menu = dropdown.querySelector('.k-dropdown-menu');
  if (!menu) return;
  const text = document.getElementById('genSubscriptionText');

  if (r.code !== 0 || !Array.isArray(r.data)) {
    genSubscription = '';
    if (text) text.textContent = '订阅加载失败';
    menu.innerHTML = '<div class="k-dropdown-item disabled">订阅加载失败</div>';
    updateModeHint();
    return;
  }

  const items = r.data.map(function(it) {
    return {
      subscription: String(it.subscription || '').trim(),
      label: String(it.subscription || '').trim(),
      unusedCount: it.unusedCount || 0,
      totalCount: it.totalCount || 0
    };
  }).filter(function(it) {
    return !!it.subscription;
  });

  if (!items.length) {
    genSubscription = '';
    if (text) text.textContent = '暂无订阅类型';
    menu.innerHTML = '<div class="k-dropdown-item disabled">暂无订阅类型</div>';
    updateModeHint();
    return;
  }

  genSubscription = items[0].subscription;
  const selectedItem = items[0];
  if (text) text.textContent = selectedItem.label;

  menu.innerHTML = items.map(function(it) {
    const selected = genSubscription === it.subscription ? 'selected' : '';
    const countColor = it.unusedCount > 0 ? '#999' : '#dc2626';
    return '<div class="k-dropdown-item ' + selected + '" ' +
      'data-subscription="' + escapeAttr(it.subscription) + '" data-label="' + escapeAttr(it.label) + '">' +
      escapeHtml(it.label) + ' <span style="color:' + countColor + ';font-size:12px">(' + it.unusedCount + ' 可用)</span>' +
      '</div>';
  }).join('');

  menu.querySelectorAll('.k-dropdown-item').forEach(function(item) {
    item.addEventListener('click', function() {
      selectGenSubscription(this.getAttribute('data-subscription') || '', this.getAttribute('data-label') || '');
    });
  });
}

function closeGenerateModal() {
  document.getElementById('generateModal').classList.remove('active');
  document.getElementById('generateResult').innerHTML = '';
  genEmailDomains = []; // 重置邮箱域名选择
  updateEmailDomainsDisplay();
}

async function doGenerate() {
  const count = parseInt(document.getElementById('genCount').value) || 1;
  const accountCount = getGenAccountCount(true);
  const allowedEmailDomains = genEmailDomains.join(',');
  const resultEl = document.getElementById('generateResult');
  if (!genSubscription) {
    const msg = '请先选择账号订阅';
    resultEl.innerHTML = '<span style="color:red">' + msg + '</span>';
    showToast(msg, 'error');
    return;
  }

  const r = await api('POST', '/admin/cards/generate', {
    count,
    account_count: accountCount,
    subscription: genSubscription,
    allowed_email_domains: allowedEmailDomains
  });
  if (r.code === 0) {
    const codes = (r.data?.codes || []).join('\n');
    resultEl.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:13px;color:var(--text-muted)">生成成功，共 ${r.data?.codes?.length ?? count} 张：</span>
        <button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="copyCardKeys()">一键复制全部</button>
      </div>
      <textarea class="k-input" id="generatedCodes" rows="8" readonly style="font-family:monospace;font-size:12px">${escapeHtml(codes)}</textarea>`;
    loadCards(1);
    showToast(`成功生成 ${r.data?.codes?.length ?? count} 张卡密`, 'success');
  } else {
    const msg = r.message || r.msg || '未知错误';
    resultEl.innerHTML = '<span style="color:red">生成失败：' + escapeHtml(msg) + '</span>';
    showToast('生成失败：' + msg, 'error');
  }
}

async function deleteCard(id) {
  if (!confirm('确认删除该卡密？')) return;
  const r = await api('DELETE', '/admin/cards/' + id);
  if (r.code === 0) {
    showToast('卡密删除成功', 'success');
    loadCards(1);
  } else {
    showToast('删除失败：' + (r.message || r.msg || '未知错误'), 'error');
  }
}

function resetCardFilters() {
  cardStatusFilter = '';
  cardKeyword = '';
  cardAccountCountFilter = '';

  var keywordInput = document.getElementById('cardKeyword');
  if (keywordInput) keywordInput.value = '';
  var cf = document.getElementById('cardCreatedFrom');
  if (cf) cf.value = '';
  var ct = document.getElementById('cardCreatedTo');
  if (ct) ct.value = '';

  document.getElementById('cardFilterText').textContent = '全部状态';
  document.querySelectorAll('#cardFilterDropdown .k-dropdown-item').forEach(function(item) {
    item.classList.remove('selected');
  });
  document.querySelector('#cardFilterDropdown .k-dropdown-item:first-child')?.classList.add('selected');
  
  document.getElementById('cardAccountCountText').textContent = '全部数量';
  document.querySelectorAll('#cardAccountCountDropdown .k-dropdown-item').forEach(function(item) {
    item.classList.remove('selected');
  });
  document.querySelector('#cardAccountCountDropdown .k-dropdown-item:first-child')?.classList.add('selected');
  
  loadCards(1);
}

function toggleCardSelect(id, checked) {
  if (checked) selectedCardIds.add(id);
  else selectedCardIds.delete(id);
  updateCardBatchBtn();
  const checkboxes = document.querySelectorAll('#cardsBody input[type="checkbox"]');
  const selectAll = document.getElementById('selectAllCards');
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && [...checkboxes].every(cb => cb.checked);
  }
}

function toggleSelectAllCards(checked) {
  const checkboxes = document.querySelectorAll('#cardsBody input[type="checkbox"]');
  checkboxes.forEach(function(cb) {
    cb.checked = checked;
    const id = parseInt(cb.closest('tr').querySelector('td:nth-child(2)').textContent);
    if (checked) selectedCardIds.add(id);
    else selectedCardIds.delete(id);
  });
  updateCardBatchBtn();
}

function updateCardBatchBtn() {
  const btn = document.getElementById('batchDeleteCardsBtn');
  const count = document.getElementById('selectedCardCount');
  if (btn && count) {
    count.textContent = selectedCardIds.size;
    btn.style.display = selectedCardIds.size > 0 ? '' : 'none';
  }
}

async function batchDeleteCards() {
  if (selectedCardIds.size === 0) return;
  if (!confirm(`确认删除选中的 ${selectedCardIds.size} 张卡密？`)) return;

  const r = await api('POST', '/admin/cards/batch-delete', { ids: [...selectedCardIds] });
  if (r.code === 0) {
    showToast(`成功删除 ${r.data?.deleted || selectedCardIds.size} 张卡密`, 'success');
    selectedCardIds.clear();
    updateCardBatchBtn();
    const selectAll = document.getElementById('selectAllCards');
    if (selectAll) selectAll.checked = false;
    loadCards(1);
    loadStats();
  } else {
    showToast('批量删除失败：' + (r.message || r.msg || '未知错误'), 'error');
  }
}

async function showCardLogs(cardId, code) {
  var r = await api('GET', '/admin/cards/' + cardId + '/logs');
  var logs = (r.code === 0 && r.data) ? r.data : [];

  var old = document.getElementById('cardLogModal');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'cardLogModal';
  overlay.className = 'modal-overlay active card-log-modal';
  
  // 计算状态统计
  var stats = {
    active: 0,
    suspended: 0,
    unknown: 0,
    totalCredit: 0,
    totalLimit: 0
  };
  
  var accountMap = new Map(); // 去重账号统计
  logs.forEach(function(log) {
    if (log.AccountID > 0) {
      accountMap.set(log.AccountID, {
        status: log.AccountStatus,
        creditUsed: Number(log.AccountCreditUsed) || 0,
        creditLimit: Number(log.AccountCreditLimit) || 0
      });
    }
  });
  
  accountMap.forEach(function(acc) {
    if (acc.status === 'active') stats.active++;
    else if (acc.status === 'suspended') stats.suspended++;
    else stats.unknown++;
    stats.totalCredit += acc.creditUsed;
    stats.totalLimit += acc.creditLimit;
  });
  
  var avgUsage = stats.totalLimit > 0 ? Math.round(stats.totalCredit / stats.totalLimit * 100) : 0;

  var content = '<div class="modal-content card-log-content">';
  content += '<div class="modal-header"><span class="modal-title">卡密使用记录 - ' + escapeHtml(code) + '</span>';
  content += '<span class="modal-close" onclick="document.getElementById(\'cardLogModal\').remove()">&times;</span></div>';
  content += '<div class="modal-body card-log-body">';

  if (!logs.length) {
    content += '<div style="text-align:center;color:#999;padding:40px;font-size:13px">暂无使用记录</div>';
  } else {
    // 状态统计卡片
    content += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">';
    content += '<div style="background:#f0f9ff;border:1px solid #bae6fd;padding:12px;border-radius:6px">';
    content += '<div style="font-size:11px;color:#0369a1;margin-bottom:4px">活跃账号</div>';
    content += '<div style="font-size:20px;font-weight:600;color:#0284c7">' + stats.active + '</div>';
    content += '</div>';
    content += '<div style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:6px">';
    content += '<div style="font-size:11px;color:#b91c1c;margin-bottom:4px">封禁账号</div>';
    content += '<div style="font-size:20px;font-weight:600;color:#dc2626">' + stats.suspended + '</div>';
    content += '</div>';
    content += '<div style="background:#fefce8;border:1px solid #fef08a;padding:12px;border-radius:6px">';
    content += '<div style="font-size:11px;color:#a16207;margin-bottom:4px">平均用量</div>';
    content += '<div style="font-size:20px;font-weight:600;color:#ca8a04">' + avgUsage + '%</div>';
    content += '</div>';
    content += '<div style="background:#f3f4f6;border:1px solid #d1d5db;padding:12px;border-radius:6px">';
    content += '<div style="font-size:11px;color:#6b7280;margin-bottom:4px">总账号数</div>';
    content += '<div style="font-size:20px;font-weight:600;color:#374151">' + accountMap.size + '</div>';
    content += '</div>';
    content += '</div>';
    
    // 提取所有可刷新的账号ID（去重，排除封禁账号）
    var refreshableAccountIds = [...new Set(
      logs.filter(log => log.AccountID > 0 && log.AccountStatus !== 'suspended')
        .map(log => log.AccountID)
    )];
    
    // 工具栏
    content += '<div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
    content += '<div style="display:flex;gap:8px;align-items:center">';
    content += '<span style="color:var(--text-muted);font-size:13px">共 ' + logs.length + ' 条记录</span>';
    content += '<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="sortCardLogs(\'credit\', \'desc\')">额度↓</button>';
    content += '<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="sortCardLogs(\'credit\', \'asc\')">额度↑</button>';
    content += '<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="sortCardLogs(\'status\', \'\')">状态</button>';
    content += '</div>';
    if (refreshableAccountIds.length > 0) {
      content += '<button class="ui-btn ui-btn-primary ui-btn-sm" id="batchRefreshCardAccounts" ' +
        'onclick="batchRefreshCardAccounts(' + cardId + ', \'' + escapeAttr(code) + '\')">全部刷新</button>';
    }
    content += '</div>';
    
    // 存储原始日志数据供排序使用
    window.cardLogsData = { cardId: cardId, code: code, logs: logs };
    
    content += '<div id="cardLogsTableContainer">';
    content += renderCardLogsTable(logs);
    content += '</div>';
  }
  content += '</div></div>';
  overlay.innerHTML = content;
  document.body.appendChild(overlay);
}

function renderCardLogsTable(logs) {
  var content = '<table class="card-log-table"><thead><tr><th style="width:50px">#</th><th>操作</th><th>账号邮箱</th><th>健康状态</th><th>额度用量</th><th>客户端 IP</th><th>时间</th><th>操作</th></tr></thead><tbody>';
  logs.forEach(function(log, index) {
    var actionLabel = log.Action === 'activate' ? '激活' : log.Action;
    var timeStr = new Date(log.CreatedAt).toLocaleString('zh-CN', {hour12: false});
    var statusBadge = log.AccountStatus ? healthBadge(log.AccountStatus) : '<span style="color:#999;font-size:12px">-</span>';
    
    // 额度显示
    var creditDisplay = '-';
    var creditValue = 0;
    if (log.AccountCreditLimit > 0) {
      var creditUsed = Math.max(0, Number(log.AccountCreditUsed) || 0);
      var creditLimit = Math.max(0, Number(log.AccountCreditLimit) || 0);
      var creditPct = Math.min(100, Math.round(creditUsed / creditLimit * 100));
      creditValue = creditPct;
      var creditColor = creditPct >= 90 ? '#dc2626' : creditPct >= 70 ? '#f59e0b' : 'var(--text-muted)';
      creditDisplay = '<div style="font-size:12px;color:var(--text-muted)">' +
        creditUsed.toFixed(1) + ' / ' + creditLimit.toFixed(0) +
        ' <span style="color:' + creditColor + '">(' + creditPct + '%)</span>' +
        '</div>';
    }
    
    // 账号邮箱（可点击查看详情）
    var emailDisplay = log.AccountID 
      ? '<span class="copyable-text" onclick="showAccountDetail(' + log.AccountID + ')" title="点击查看账号详情">' + 
        escapeHtml(log.Email || ('ID:' + log.AccountID)) + 
        '</span>'
      : escapeHtml(log.Email || '-');
    
    // 封禁账号禁用刷新按钮
    var isSuspended = log.AccountStatus === 'suspended';
    var refreshDisabled = !log.AccountID || isSuspended;
    var refreshTitle = isSuspended ? '封禁账号不允许刷新' : '';
    
    content += '<tr data-credit-value="' + creditValue + '" data-status="' + (log.AccountStatus || '') + '">';
    content += '<td data-label="#" style="color:var(--text-muted);font-size:12px">' + (index + 1) + '</td>';
    content += '<td data-label="操作" class="card-log-action" style="font-size:13px">' + escapeHtml(actionLabel) + '</td>';
    content += '<td data-label="账号邮箱" class="card-log-email" style="font-size:12px;font-family:monospace">' + emailDisplay + '</td>';
    content += '<td data-label="健康状态" class="card-log-status">' + statusBadge + '</td>';
    content += '<td data-label="额度用量" class="card-log-credit">' + creditDisplay + '</td>';
    content += '<td data-label="客户端 IP" class="card-log-ip" style="font-size:12px;color:#999">' + escapeHtml(log.ClientIP || '-') + '</td>';
    content += '<td data-label="时间" class="card-log-time" style="font-size:12px;color:#999;white-space:nowrap">' + escapeHtml(timeStr) + '</td>';
    content += '<td data-label="操作" class="card-log-actions">' +
      '<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="refreshAccountInCardLog(' + log.AccountID + ', this)" ' +
      (refreshDisabled ? 'disabled' : '') + (refreshTitle ? ' title="' + refreshTitle + '"' : '') + '>刷新</button>' +
      '</td>';
    content += '</tr>';
  });
  content += '</tbody></table>';
  return content;
}

function sortCardLogs(sortBy, order) {
  console.log('sortCardLogs called with:', sortBy, order);
  
  if (!window.cardLogsData) {
    console.error('window.cardLogsData is not defined');
    return;
  }
  
  var logs = [...window.cardLogsData.logs];
  console.log('Sorting', logs.length, 'logs by', sortBy);
  
  if (sortBy === 'credit') {
    logs.sort(function(a, b) {
      var aValue = Number(a.AccountCreditUsed) || 0;
      var bValue = Number(b.AccountCreditUsed) || 0;
      return order === 'asc' ? aValue - bValue : bValue - aValue;
    });
  } else if (sortBy === 'status') {
    // 切换排序方向：如果当前是正常在前，下次点击就封号在前
    if (!window.cardLogsData.statusSortReversed) {
      // 正常在前
      var statusOrder = { 'active': 0, 'suspended': 1, '': 2 };
      window.cardLogsData.statusSortReversed = true;
    } else {
      // 封号在前
      var statusOrder = { 'suspended': 0, 'active': 1, '': 2 };
      window.cardLogsData.statusSortReversed = false;
    }
    logs.sort(function(a, b) {
      var aOrder = statusOrder[a.AccountStatus || ''] || 2;
      var bOrder = statusOrder[b.AccountStatus || ''] || 2;
      return aOrder - bOrder;
    });
  }
  
  var container = document.getElementById('cardLogsTableContainer');
  if (container) {
    console.log('Updating table with sorted logs');
    container.innerHTML = renderCardLogsTable(logs);
    showToast('排序完成', 'success');
  } else {
    console.error('cardLogsTableContainer not found');
  }
}

// 在卡密详情中刷新账号
async function refreshAccountInCardLog(accountId, btn) {
  if (!accountId || !btn) return;
  
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '刷新中...';
  
  const r = await api('POST', '/admin/accounts/' + accountId + '/refresh');
  if (r.code === 0) {
    btn.textContent = '成功';
    showToast('账号刷新成功', 'success');
    
    // 1秒后重新加载卡密详情
    setTimeout(() => {
      const modal = document.getElementById('cardLogModal');
      if (modal) {
        // 获取卡密ID和代码（从模态框标题中提取）
        const titleEl = modal.querySelector('.modal-title');
        if (titleEl) {
          const titleText = titleEl.textContent;
          const match = titleText.match(/卡密使用记录 - (.+)$/);
          if (match) {
            const code = match[1];
            // 从当前页面查找对应的卡密ID
            const cardsBody = document.getElementById('cardsBody');
            if (cardsBody) {
              const rows = cardsBody.querySelectorAll('tr');
              for (let row of rows) {
                const codeEl = row.querySelector('code');
                if (codeEl && codeEl.textContent === code) {
                  const idCell = row.querySelector('td[data-label="ID"]');
                  if (idCell) {
                    const cardId = idCell.textContent;
                    showCardLogs(cardId, code);
                    return;
                  }
                }
              }
            }
          }
        }
      }
      btn.textContent = originalText;
      btn.disabled = false;
    }, 1000);
  } else {
    btn.textContent = '失败';
    showToast('刷新失败：' + (r.message || '未知错误'), 'error');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
}

// 导出单个已兑换卡密（JSON 格式，包含关联账号信息）
async function exportCard(cardId) {
  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '导出中...';
  }
  
  try {
    // 获取卡密使用日志
    const logsResp = await api('GET', '/admin/cards/' + cardId + '/logs');
    if (logsResp.code !== 0 || !logsResp.data) {
      showToast('获取卡密信息失败', 'error');
      return;
    }
    
    const logs = logsResp.data || [];
    if (logs.length === 0) {
      showToast('该卡密暂无使用记录', 'warning');
      return;
    }
    
    // 提取关联的账号ID列表
    const accountIds = [...new Set(logs.filter(log => log.AccountID > 0).map(log => log.AccountID))];
    
    if (accountIds.length === 0) {
      showToast('该卡密暂无关联账号', 'warning');
      return;
    }
    
    // 并发获取每个账号的详细信息
    const accountRequests = accountIds.map(accountId => 
      api('GET', '/admin/accounts/' + accountId + '/detail')
    );
    
    const responses = await Promise.all(accountRequests);
    const accounts = responses
      .filter(r => r.code === 0 && r.data)
      .map(r => ({
        clientId: r.data.clientId || '',
        clientSecret: r.data.clientSecret || '',
        creditLimit: r.data.creditLimit || 0,
        creditUsed: r.data.creditUsed || 0,
        email: r.data.email || '',
        provider: r.data.provider || 'idc',
        refreshToken: r.data.refreshToken || '',
        region: r.data.region || 'us-east-1',
        subscription: r.data.subscription?.title || '',
        time: formatExportTime(r.data.fetchedAt || new Date().toISOString())
      }));
    
    if (accounts.length === 0) {
      showToast('无法获取账号详细信息', 'error');
      return;
    }
    
    // 导出为 JSON 格式
    const jsonStr = JSON.stringify(accounts, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const cardCode = logs[0]?.Code || cardId;
    const filename = 'card_' + cardCode.replace(/[^a-zA-Z0-9]/g, '_') + '_' + dateStr + '.json';
    
    downloadFile(jsonStr, filename, 'application/json;charset=utf-8');
    showToast('导出成功，共 ' + accounts.length + ' 个账号', 'success');
  } catch (e) {
    showToast('导出失败：' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '导出';
    }
  }
}

// 格式化导出时间（从 export.js 引用）
function formatExportTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = function(n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

// 下载文件（从 export.js 引用）
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 批量刷新卡密关联的所有账号
async function batchRefreshCardAccounts(cardId, code) {
  const btn = document.getElementById('batchRefreshCardAccounts');
  if (!btn) return;
  
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '刷新中...';
  
  try {
    // 获取卡密使用日志
    const logsResp = await api('GET', '/admin/cards/' + cardId + '/logs');
    if (logsResp.code !== 0 || !logsResp.data) {
      showToast('获取卡密信息失败', 'error');
      return;
    }
    
    const logs = logsResp.data || [];
    // 提取所有可刷新的账号ID（去重，排除封禁账号）
    const accountIds = [...new Set(
      logs.filter(log => log.AccountID > 0 && log.AccountStatus !== 'suspended')
        .map(log => log.AccountID)
    )];
    
    if (accountIds.length === 0) {
      showToast('没有可刷新的账号', 'warning');
      return;
    }
    
    btn.textContent = '刷新中 0/' + accountIds.length;
    
    // 并发刷新所有账号
    let successCount = 0;
    let failCount = 0;
    const refreshRequests = accountIds.map((accountId, index) => 
      api('POST', '/admin/accounts/' + accountId + '/refresh')
        .then(r => {
          if (r.code === 0) {
            successCount++;
          } else {
            failCount++;
          }
          // 更新进度
          const completed = successCount + failCount;
          if (btn) {
            btn.textContent = '刷新中 ' + completed + '/' + accountIds.length;
          }
          return r;
        })
    );
    
    await Promise.all(refreshRequests);
    
    // 显示结果
    const message = `刷新完成：成功 ${successCount}，失败 ${failCount}`;
    showToast(message, failCount === 0 ? 'success' : 'warning');
    
    // 1秒后重新加载卡密详情
    setTimeout(() => {
      showCardLogs(cardId, code);
    }, 1000);
    
  } catch (e) {
    showToast('批量刷新失败：' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
