// 主入口模块

// 初始化页面大小下拉框显示
function initPageSizeDropdowns() {
  // 账号页面大小
  const accountSize = parseInt(localStorage.getItem('accountPageSize') || '15');
  const accountTexts = {15: '每页 15 条', 30: '每页 30 条', 50: '每页 50 条', 100: '每页 100 条'};
  const accountSizeText = document.getElementById('accountPageSizeText');
  if (accountSizeText) {
    accountSizeText.textContent = accountTexts[accountSize] || '每页 15 条';
    // 设置下拉菜单项的选中状态
    document.querySelectorAll('#accountPageSizeDropdown .k-dropdown-item').forEach(item => {
      item.classList.remove('selected');
    });
    const accountMenuItem = document.querySelector(`#accountPageSizeDropdown .k-dropdown-item[onclick*="selectAccountPageSize(${accountSize}"]`);
    if (accountMenuItem) accountMenuItem.classList.add('selected');
  }

  // 卡密页面大小
  const cardSize = parseInt(localStorage.getItem('cardPageSize') || '15');
  const cardTexts = {15: '每页 15 条', 30: '每页 30 条', 50: '每页 50 条', 100: '每页 100 条'};
  const cardSizeText = document.getElementById('cardPageSizeText');
  if (cardSizeText) {
    cardSizeText.textContent = cardTexts[cardSize] || '每页 15 条';
    document.querySelectorAll('#cardPageSizeDropdown .k-dropdown-item').forEach(item => {
      item.classList.remove('selected');
    });
    const cardMenuItem = document.querySelector(`#cardPageSizeDropdown .k-dropdown-item[onclick*="selectCardPageSize(${cardSize}"]`);
    if (cardMenuItem) cardMenuItem.classList.add('selected');
  }

  // 日志页面大小
  const logSize = parseInt(localStorage.getItem('logPageSize') || '20');
  const logTexts = {20: '每页 20 条', 50: '每页 50 条', 100: '每页 100 条', 200: '每页 200 条'};
  const logSizeText = document.getElementById('logPageSizeText');
  if (logSizeText) {
    logSizeText.textContent = logTexts[logSize] || '每页 20 条';
    document.querySelectorAll('#logPageSizeDropdown .k-dropdown-item').forEach(item => {
      item.classList.remove('selected');
    });
    const logMenuItem = document.querySelector(`#logPageSizeDropdown .k-dropdown-item[onclick*="selectLogPageSize(${logSize}"]`);
    if (logMenuItem) logMenuItem.classList.add('selected');
  }
}

// 侧边栏切换
function switchTab(name, el) {
  var currentTab = document.querySelector('.tab-panel.active');
  if (currentTab) {
    var scrollPos = document.querySelector('.main-wrapper').scrollTop;
    localStorage.setItem('scrollPos_' + currentTab.id, scrollPos);
  }

  document.querySelectorAll('.nav-item').forEach(function(item) { item.classList.remove('active'); });
  el.classList.add('active');
  document.getElementById('pageTitle').textContent = el.textContent;
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');

  localStorage.setItem('currentTab', name);

  // 移动端切换页面时关闭侧边栏
  closeSidebarOnMobile();

  // 切换到概览页时启动自动刷新，离开时停止
  if (name === 'dashboard') {
    loadStats();
    startDashboardAutoRefresh();
  } else {
    stopDashboardAutoRefresh();
  }
  // 切换到账号页时触发加载
  if (name === 'accounts') {
    loadAccounts(1);
    loadAccountSubscriptionFilter();
    loadAccountEmailDomainFilter();
  }
  if (name === 'assigned') loadAssignedAccounts(1);
  if (name === 'cards') loadCards(1);
  if (name === 'logs') loadLogs(1);
  if (name === 'settings') loadSettings();

  setTimeout(function() {
    // 概览页不恢复滚动位置
    if (name === 'dashboard') {
      document.querySelector('.main-wrapper').scrollTop = 0;
      return;
    }
    var savedScroll = localStorage.getItem('scrollPos_tab-' + name);
    if (savedScroll) {
      document.querySelector('.main-wrapper').scrollTop = parseInt(savedScroll);
    } else {
      document.querySelector('.main-wrapper').scrollTop = 0;
    }
  }, 100);
}

// 初始化后台（登录成功后调用）
function initApp() {
  // 初始化页面大小下拉框
  initPageSizeDropdowns();
  
  var savedTab = localStorage.getItem('currentTab') || 'dashboard';
  if (typeof loadVersionBadge === 'function') loadVersionBadge(false);

  var targetNav = document.querySelector('.nav-item[data-tab="' + savedTab + '"]');
  if (targetNav) {
    targetNav.classList.add('active');
    document.getElementById('pageTitle').textContent = targetNav.textContent;
    document.getElementById('tab-' + savedTab).classList.add('active');

    if (savedTab === 'dashboard') { loadStats(); startDashboardAutoRefresh(); }
    if (savedTab === 'accounts') {
      loadAccounts(1);
      loadAccountSubscriptionFilter();
      loadAccountEmailDomainFilter();
    }
    if (savedTab === 'assigned') loadAssignedAccounts(1);
    if (savedTab === 'cards') loadCards(1);
    if (savedTab === 'logs') loadLogs(1);
    if (savedTab === 'settings') loadSettings();

    // 概览页不恢复滚动位置（内容动态加载，恢复会跳到底部）
    if (savedTab !== 'dashboard') {
      setTimeout(function() {
        var savedScroll = localStorage.getItem('scrollPos_tab-' + savedTab);
        if (savedScroll) {
          document.querySelector('.main-wrapper').scrollTop = parseInt(savedScroll);
        }
      }, 100);
    } else {
      document.querySelector('.main-wrapper').scrollTop = 0;
    }
  } else {
    document.querySelector('.nav-item[data-tab="dashboard"]').classList.add('active');
    document.getElementById('tab-dashboard').classList.add('active');
    loadStats();
    startDashboardAutoRefresh();
  }

  var genCount = document.getElementById('genCount');
  var genAccountCount = document.getElementById('genAccountCount');
  if (genCount) genCount.addEventListener('input', updateModeHint);
  if (genAccountCount) genAccountCount.addEventListener('input', updateModeHint);
  if (genCount || genAccountCount) updateModeHint();

  // 按数据库中的实际订阅动态填充账号订阅筛选
  if (typeof loadAccountSubscriptionFilter === 'function') loadAccountSubscriptionFilter();
}

// 页面加载时检查认证状态
(function() {
  checkAuth().then(function() {
    // 如果已登录，初始化后台
    if (ADMIN_TOKEN) {
      initApp();
    }
  });
})();
