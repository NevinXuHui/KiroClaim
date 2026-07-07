// 卡密管理模块

let cardStatusFilter = '';
let cardKeyword = '';
let genSubscription = '';
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
  let url = `/admin/cards?page=${page}&size=15`;
  if (cardStatusFilter) url += `&status=${cardStatusFilter}`;
  if (cardKeyword) url += `&keyword=${encodeURIComponent(cardKeyword)}`;
  if (createdFrom) url += `&created_from=${createdFrom}`;
  if (createdTo) url += `&created_to=${createdTo}`;

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
    return `<tr>
      <td data-label="选择"><input type="checkbox" class="k-checkbox" ${checked} onchange="toggleCardSelect(${c.ID}, this.checked)"></td>
      <td data-label="ID">${c.ID}</td>
      <td data-label="序列号"><code style="background:#f1f1f1;padding:2px 4px;white-space:nowrap">${escapeHtml(c.Code)}</code></td>
      <td data-label="账号订阅" style="font-size:12px;white-space:nowrap">${escapeHtml(subscription)} ${multiLabel}</td>
      <td data-label="状态">${cardStatusBadge(status)}</td>
      <td data-label="操作">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="showCardLogs(${c.ID}, '${escapeAttr(c.Code)}')">详情</button>
          <button class="ui-btn ui-btn-danger ui-btn-sm" onclick="deleteCard(${c.ID})">删除</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  renderPagination('cardsPagination', r.data.total, 15, page, loadCards);
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
  hint.textContent = `将生成 ${count} 张卡密，${accountText}，账号订阅：${subscriptionText}。`;
}

async function showGenerateModal() {
  document.getElementById('generateModal').classList.add('active');
  await loadCardSubscriptionStats();
  updateModeHint();
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
}

async function doGenerate() {
  const count = parseInt(document.getElementById('genCount').value) || 1;
  const accountCount = getGenAccountCount(true);
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
    subscription: genSubscription
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

  var content = '<div class="modal-content card-log-content">';
  content += '<div class="modal-header"><span class="modal-title">卡密使用记录 - ' + escapeHtml(code) + '</span>';
  content += '<span class="modal-close" onclick="document.getElementById(\'cardLogModal\').remove()">&times;</span></div>';
  content += '<div class="modal-body card-log-body">';

  if (!logs.length) {
    content += '<div style="text-align:center;color:#999;padding:40px;font-size:13px">暂无使用记录</div>';
  } else {
    content += '<table class="card-log-table"><thead><tr><th>操作</th><th>账号邮箱</th><th>客户端 IP</th><th>时间</th></tr></thead><tbody>';
    logs.forEach(function(log) {
      var actionLabel = log.Action === 'activate' ? '激活' : log.Action;
      var timeStr = new Date(log.CreatedAt).toLocaleString('zh-CN', {hour12: false});
      content += '<tr>';
      content += '<td data-label="操作" class="card-log-action" style="font-size:13px">' + escapeHtml(actionLabel) + '</td>';
      content += '<td data-label="账号邮箱" class="card-log-email" style="font-size:12px;font-family:monospace">' + escapeHtml(log.Email || ('ID:' + log.AccountID)) + '</td>';
      content += '<td data-label="客户端 IP" class="card-log-ip" style="font-size:12px;color:#999">' + escapeHtml(log.ClientIP || '-') + '</td>';
      content += '<td data-label="时间" class="card-log-time" style="font-size:12px;color:#999;white-space:nowrap">' + escapeHtml(timeStr) + '</td>';
      content += '</tr>';
    });
    content += '</tbody></table>';
  }
  content += '</div></div>';
  overlay.innerHTML = content;
  document.body.appendChild(overlay);
}
