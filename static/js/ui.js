// UI 工具函数模块

// 状态徽章（两态）
function healthBadge(status) {
  if (status === 'suspended') {
    return '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;background:#ef4444;border-radius:50%"></span>已封禁</span>';
  }
  // 默认：active 或任何未知值都当作正常（瞬时故障不建独立态）
  return '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;background:#10b981;border-radius:50%"></span>正常</span>';
}

// 订阅级别标签：FREE / PRO / PRO+ / POWER，输入可能是 "KIRO FREE" / "Pro" 等
function subscriptionBadge(sub) {
  if (!sub) return '<span style="color:#a1a1aa">-</span>';
  // 抽取 tier 关键字（忽略 "KIRO " 前缀、忽略大小写）
  var raw = String(sub).trim();
  var upper = raw.toUpperCase();
  var tier = upper.replace(/^KIRO\s+/, '');
  // 规范化：POWER / PRO+ / PRO / FREE；其他一律原样
  var known = {
    'FREE':  { label: 'FREE',  bg: '#f4f4f5', fg: '#52525b', bd: '#e4e4e7' },
    'PRO':   { label: 'PRO',   bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' },
    'PRO+':  { label: 'PRO+',  bg: '#f5f3ff', fg: '#6d28d9', bd: '#ddd6fe' },
    'POWER': { label: 'POWER', bg: '#fff7ed', fg: '#c2410c', bd: '#fed7aa' }
  };
  var t = known[tier];
  if (!t) {
    // 兜底：未知订阅名显示成中性 tag
    t = { label: raw, bg: '#f4f4f5', fg: '#52525b', bd: '#e4e4e7' };
  }
  return '<span class="subscription-badge" style="display:inline-flex;align-items:center;padding:2px 10px;' +
    'border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.3px;' +
    'background:' + t.bg + ';color:' + t.fg + ';border:1px solid ' + t.bd + '">' +
    t.label + '</span>';
}

// Toast 提示
function showToast(message, type) {
  if (!type) type = 'info';
  var toast = document.createElement('div');
  var style = 'position:fixed;top:24px;right:24px;padding:14px 18px;border-radius:6px;font-size:13px;font-weight:500;z-index:9999;animation:slideIn 0.3s ease;box-shadow:0 4px 12px rgba(0,0,0,0.1);';
  if (type === 'success') style += 'background:#000;color:#fff;';
  else if (type === 'error') style += 'background:#fff;color:#991b1b;border:1px solid #fecaca;';
  else style += 'background:#fff;color:#171717;border:1px solid #eaeaea;';
  toast.style.cssText = style;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// 下拉框控制
var currentDropdown = null;

function toggleDropdown(id) {
  var dropdown = document.getElementById(id);
  if (currentDropdown && currentDropdown !== dropdown) {
    currentDropdown.classList.remove('active');
  }
  dropdown.classList.toggle('active');
  currentDropdown = dropdown.classList.contains('active') ? dropdown : null;
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.k-dropdown')) {
    document.querySelectorAll('.k-dropdown').forEach(function(d) {
      d.classList.remove('active');
    });
    currentDropdown = null;
  }
});


// 分页渲染
function renderPagination(containerId, total, size, current, fn) {
  var pages = Math.ceil(total / size);
  var el = document.getElementById(containerId);
  if (!el) return; // 元素不存在则直接返回
  
  // 同时渲染顶部和底部分页（如果存在Top容器）
  var elTop = document.getElementById(containerId + 'Top');
  
  if (pages <= 1) { 
    el.innerHTML = ''; 
    if (elTop) elTop.innerHTML = '';
    return; 
  }
  
  // 生成分页HTML的函数
  function generatePaginationHTML(jumpId, isTop) {
    var marginStyle = isTop ? 'margin-bottom:16px' : 'margin-top:24px';
    var html = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;' + marginStyle + ';flex-wrap:wrap">';
    
    // 首页按钮（始终显示）
    if (current > 1) {
      html += '<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="' + fn.name + '(1)" title="第一页">首页</button>';
    } else {
      html += '<button class="ui-btn ui-btn-secondary ui-btn-sm" disabled style="opacity:0.5;cursor:not-allowed" title="已在第一页">首页</button>';
    }
    
    // 上一页按钮（始终显示）
    if (current > 1) {
      html += '<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="' + fn.name + '(' + (current - 1) + ')" title="上一页">上一页</button>';
    } else {
      html += '<button class="ui-btn ui-btn-secondary ui-btn-sm" disabled style="opacity:0.5;cursor:not-allowed" title="已在第一页">上一页</button>';
    }
    
    // 页码显示和快速跳转
    html += '<div style="display:flex;align-items:center;gap:6px">';
    
    // 显示省略页码
    var showPages = [];
    if (pages <= 7) {
      // 总页数少时显示全部
      for (var i = 1; i <= pages; i++) {
        showPages.push(i);
      }
    } else {
      // 总页数多时显示部分
      showPages.push(1);
      if (current > 3) showPages.push('...');
      
      var start = Math.max(2, current - 1);
      var end = Math.min(pages - 1, current + 1);
      for (var i = start; i <= end; i++) {
        showPages.push(i);
      }
      
      if (current < pages - 2) showPages.push('...');
      showPages.push(pages);
    }
    
    // 渲染页码按钮
    showPages.forEach(function(p) {
      if (p === '...') {
        html += '<span style="color:#999;padding:0 4px">···</span>';
      } else if (p === current) {
        html += '<button class="ui-btn ui-btn-primary ui-btn-sm" style="min-width:36px;font-weight:600">' + p + '</button>';
      } else {
        html += '<button class="ui-btn ui-btn-secondary ui-btn-sm" style="min-width:36px" onclick="' + fn.name + '(' + p + ')">' + p + '</button>';
      }
    });
    
    html += '</div>';
    
    // 下一页按钮（始终显示）
    if (current < pages) {
      html += '<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="' + fn.name + '(' + (current + 1) + ')" title="下一页">下一页</button>';
    } else {
      html += '<button class="ui-btn ui-btn-secondary ui-btn-sm" disabled style="opacity:0.5;cursor:not-allowed" title="已在最后一页">下一页</button>';
    }
    
    // 尾页按钮（始终显示）
    if (current < pages) {
      html += '<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="' + fn.name + '(' + pages + ')" title="最后一页">尾页</button>';
    } else {
      html += '<button class="ui-btn ui-btn-secondary ui-btn-sm" disabled style="opacity:0.5;cursor:not-allowed" title="已在最后一页">尾页</button>';
    }
    
    // 页码信息和跳转
    html += '<span style="display:inline-flex;align-items:center;gap:6px;margin-left:4px;font-size:13px;color:#999;border-left:1px solid #e5e5e7;padding-left:12px">' +
      '<span>共 ' + pages + ' 页 / ' + total + ' 条</span>' +
      '</span>';
    
    // 跳转输入
    html += '<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#999">' +
      '跳至' +
      '<input id="' + jumpId + '" type="number" min="1" max="' + pages + '" value="' + current + '" ' +
        'style="width:64px;padding:4px 8px;border:1px solid #e5e5e7;border-radius:8px;font-size:13px;text-align:center" ' +
        'onkeydown="if(event.key===\'Enter\'){__pageJump(\'' + jumpId + '\',' + pages + ',' + fn.name + ')}">' +
      '页' +
      '<button class="ui-btn ui-btn-secondary ui-btn-sm" onclick="__pageJump(\'' + jumpId + '\',' + pages + ',' + fn.name + ')">GO</button>' +
      '</span>';
    
    html += '</div>';
    return html;
  }
  
  // 底部分页
  var jumpId = containerId + '_jump';
  el.innerHTML = generatePaginationHTML(jumpId, false);
  
  // 顶部分页
  if (elTop) {
    var topJumpId = containerId + 'Top_jump';
    elTop.innerHTML = generatePaginationHTML(topJumpId, true);
  }
}

// 跳转页处理
function __pageJump(inputId, maxPages, fn) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var p = parseInt(input.value, 10);
  if (isNaN(p) || p < 1) p = 1;
  if (p > maxPages) p = maxPages;
  fn(p);
}

// 复制到剪贴板
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(function() {
    showToast('已复制到剪贴板', 'success');
  }).catch(function() {
    showToast('复制失败', 'error');
  });
}


// 侧边栏切换（移动端）
function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebarOverlay');
  if (sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
}

// 切换页面时自动关闭侧边栏（移动端）
function closeSidebarOnMobile() {
  if (window.innerWidth <= 768) {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }
}

function applySidebarCollapsed(collapsed) {
  var app = document.getElementById('appContainer');
  var btn = document.getElementById('sidebarCollapseToggle');
  if (!app) return;

  app.classList.toggle('sidebar-collapsed', !!collapsed);
  if (btn) {
    var label = collapsed ? '展开侧边栏' : '收起侧边栏';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    btn.title = label;
  }
}

function toggleSidebarCollapse() {
  var app = document.getElementById('appContainer');
  if (!app) return;

  var collapsed = !app.classList.contains('sidebar-collapsed');
  localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  applySidebarCollapsed(collapsed);
}

function initSidebarCollapse() {
  applySidebarCollapsed(localStorage.getItem('sidebarCollapsed') === '1');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebarCollapse);
} else {
  initSidebarCollapse();
}
