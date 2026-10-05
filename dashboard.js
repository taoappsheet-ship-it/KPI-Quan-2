/**
 * FPT Inside Report Dashboard - Logic & Visualizations
 * Connects data from Sheet Tong Hop to interactive KPI charts & tables.
 * Optimized for seamless 16-employee team performance monitoring.
 * Supports Drill-Down into detailed SHD (Contract/Ticket numbers) on click!
 */

// Global clipboard & modal helper functions for inline click events
window.copyShdText = function(text, event) {
  if (event) event.stopPropagation();
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    window.showDashboardToast(`Đã sao chép SHD: ${text}`);
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    window.showDashboardToast(`Đã sao chép SHD: ${text}`);
  });
};

window.toggleNoteExpand = function(el) {
  el.classList.toggle('note-expanded');
};

document.addEventListener('DOMContentLoaded', () => {
  let appData = null;
  let filteredEmployees = [];
  let currentSort = { column: 'on_time_rate', direction: 'desc' };
  let currentStatusFilter = 'ALL';
  let currentBlockFilter = 'ALL';
  let charts = {};

  // Current active modal data
  let currentModalCases = [];
  let currentModalFilteredCases = [];
  let currentModalTitle = '';

  // Yesterday Alert System State
  let activeAlertDate = null;
  let currentAlertModalCases = [];
  let currentAlertModalFilteredCases = [];
  let currentAlertTypeFilter = 'ALL';

  // Master Technician Error Dossier System State
  let currentDossierEmp = null;
  let currentDossierCategory = 'ALL';
  let currentDossierCases = [];
  let currentDossierFilteredCases = [];
  let currentIssuesModeFilter = 'ALL';
  let currentIssuesModeSort = 'ISSUES_DESC';

  // Toast notification helper
  window.showDashboardToast = function(msg) {
    const toast = document.getElementById('toastPopup');
    const toastText = document.getElementById('toastText');
    if (!toast || !toastText) return;
    toastText.textContent = msg;
    toast.style.display = 'flex';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2800);
  };

  // Global window helpers for inline click handlers
  window.openEmpDossierModal = function(empId, initialCategory = 'ALL', event) {
    if (event) event.stopPropagation();
    openEmpDossierModal(empId, initialCategory);
  };

  window.switchToEmpIssuesView = function() {
    setViewMode('emp-issues');
  };

  window.copyEmpZaloReport = function(empId, event) {
    if (event) event.stopPropagation();
    if (!appData || !appData.employees) return;
    const emp = appData.employees.find(e => String(e.id) === String(empId) || e.name === empId);
    if (emp) copyEmpZaloReport(emp);
  };

  window.switchDossierCategory = function(cat) {
    currentDossierCategory = cat;
    document.querySelectorAll('#dossierCategoryTabs .btn-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    const searchVal = document.getElementById('dossierSearchInput')?.value || '';
    filterAndRenderDossierCases(searchVal);
  };

  // 1. Data Initialization & Live Auto-Sync System
  let liveSyncInterval = null;
  let isCheckingUpdate = false;

  function initData() {
    if (window.INITIAL_DASHBOARD_DATA) {
      appData = window.INITIAL_DASHBOARD_DATA;
      setupDashboard();
    } else {
      fetch('data.json?t=' + Date.now(), { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          appData = data;
          setupDashboard();
        })
        .catch(err => {
          console.error('Lỗi tải data.json:', err);
          document.getElementById('lastUpdatedLabel').textContent = 'Lỗi tải dữ liệu. Vui lòng mở qua MO_DASHBOARD.bat';
        });
    }

    // Tự động kiểm tra và đồng bộ số liệu mới mỗi 3.5 giây
    startLiveAutoSync();
  }

  function startLiveAutoSync() {
    if (liveSyncInterval) clearInterval(liveSyncInterval);
    liveSyncInterval = setInterval(() => {
      checkDataUpdates(false);
    }, 3500);
  }

  function checkDataUpdates(isManual = false) {
    if (isCheckingUpdate) return;
    isCheckingUpdate = true;

    const btnRefresh = document.getElementById('btnRefresh');
    if (isManual && btnRefresh) {
      btnRefresh.innerHTML = '⏳ Đang đồng bộ...';
      btnRefresh.disabled = true;
    }

    const finishCheck = () => {
      isCheckingUpdate = false;
      if (isManual && btnRefresh) {
        btnRefresh.innerHTML = '🔄 Làm mới';
        btnRefresh.disabled = false;
      }
    };

    const isHttp = window.location.protocol.startsWith('http');
    if (isHttp) {
      // Đang chạy qua Web Server (Localhost hoặc 4G Cloudflare)
      fetch('data.json?t=' + Date.now(), { cache: 'no-store' })
        .then(res => {
          if (!res.ok) throw new Error('Network error');
          return res.json();
        })
        .then(newData => {
          applyLiveDashboardData(newData, isManual);
          finishCheck();
        })
        .catch(err => {
          if (isManual) window.showDashboardToast('⚠️ Không thể kết nối máy chủ để lấy dữ liệu');
          finishCheck();
        });
    } else {
      // Đang mở trực tiếp bằng file:/// -> nạp lại data.js bằng thẻ script động
      const oldScript = document.getElementById('liveDataSyncScript');
      if (oldScript) oldScript.remove();

      const script = document.createElement('script');
      script.id = 'liveDataSyncScript';
      script.src = 'data.js?t=' + Date.now();
      script.onload = () => {
        if (window.INITIAL_DASHBOARD_DATA) {
          applyLiveDashboardData(window.INITIAL_DASHBOARD_DATA, isManual);
        }
        finishCheck();
      };
      script.onerror = () => {
        if (isManual) window.showDashboardToast('⚠️ Không tải được file data.js');
        finishCheck();
      };
      document.head.appendChild(script);
    }
  }

  function applyLiveDashboardData(newData, isManual = false) {
    if (!newData || !newData.updated_at) return;

    if (appData && newData.updated_at === appData.updated_at) {
      if (isManual) {
        window.showDashboardToast(`✅ Dữ liệu hiện tại đã là mới nhất (${appData.updated_at})`);
      }
      return;
    }

    const isFirstTime = !appData;
    appData = newData;

    // Cập nhật Header
    const lastUpdatedLabel = document.getElementById('lastUpdatedLabel');
    if (lastUpdatedLabel) lastUpdatedLabel.textContent = `Cập nhật: ${appData.updated_at}`;
    const sourceFileLabel = document.getElementById('sourceFileLabel');
    if (sourceFileLabel) sourceFileLabel.textContent = `Nguồn: ${appData.source_file} (Sheet Tong hop)`;

    // Cập nhật lại dropdown Block nếu có danh sách block mới
    const blockSelect = document.getElementById('blockFilter');
    if (blockSelect && appData.blocks) {
      const currentSelected = blockSelect.value;
      blockSelect.innerHTML = '<option value="ALL">🌐 Tất cả các Block</option>';
      appData.blocks.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.block;
        const shortName = b.block.replace('Phuong ', 'P.').replace('Thanh pho ', 'TP.');
        opt.textContent = `${shortName} (${b.count} NV)`;
        blockSelect.appendChild(opt);
      });
      blockSelect.value = currentSelected;
    }

    // Render lại KPI Ribbon và Thẻ Hero tổng quan
    renderKpiRibbon();
    renderHeroCards();
    initYesterdayAlerts();
    renderCllSheetTable();
    renderEmpLookupSection();
    renderEmpIssuesSection();

    // Giữ nguyên tìm kiếm, bộ lọc trạng thái và render lại bảng 16 nhân sự
    applyFilters();

    // Cập nhật lại biểu đồ
    initCharts();

    // Hiệu ứng nhấp nháy đèn Live báo hiệu vừa nhận số liệu mới
    const liveBadge = document.querySelector('.badge-live');
    if (liveBadge) {
      liveBadge.classList.add('badge-fresh-flash');
      setTimeout(() => liveBadge.classList.remove('badge-fresh-flash'), 3000);
    }

    if (!isFirstTime) {
      window.showDashboardToast(`⚡ Dữ liệu vừa tự động cập nhật từ Excel: ${appData.updated_at}`);
    }
  }

  // 2. Setup Dashboard
  function setupDashboard() {
    if (!appData) return;

    // Header info
    document.getElementById('lastUpdatedLabel').textContent = `Cập nhật: ${appData.updated_at}`;
    document.getElementById('sourceFileLabel').textContent = `Nguồn: ${appData.source_file} (Sheet Tong hop)`;

    // Populate Block Filter Options
    const blockSelect = document.getElementById('blockFilter');
    blockSelect.innerHTML = '<option value="ALL">🌐 Tất cả các Block</option>';
    if (appData.blocks) {
      appData.blocks.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.block;
        const shortName = b.block.replace('Phuong ', 'P.').replace('Thanh pho ', 'TP.');
        opt.textContent = `${shortName} (${b.count} NV)`;
        blockSelect.appendChild(opt);
      });
    }

    // Render Mini KPI Ribbon
    renderKpiRibbon();

    // Render Full Hero KPI Cards (for Full view)
    renderHeroCards();

    // Initialize Filtered Data
    filteredEmployees = [...appData.employees];
    sortEmployees();

    // Render Filter Counters
    updateFilterCounters();

    // Render Charts
    initCharts();

    // Render Table
    renderTable();

    // Render Quick Employee Error Lookup Bar & Chips
    renderEmpLookupSection();

    // Render Full Issues Section Grid
    renderEmpIssuesSection();

    // Initialize View Mode, Column Preset and Density from LocalStorage
    initPreferences();

    // Bind Event Listeners
    setupEventListeners();
    setupDossierEventListeners();

    // Initialize Yesterday Alerts System
    initYesterdayAlerts();
    setupAlertEventListeners();

    // Initialize Sheet CLL System
    renderCllSheetTable();
    setupCllTableEventListeners();
  }

  // 3. Render Ultra-Compact KPI Summary Ribbon (Top Bar)
  function renderKpiRibbon() {
    const tot = appData.team_total;
    if (!tot) return;

    // 1. Đúng hẹn (>= 98%)
    const rbOnTimeVal = document.getElementById('rbValOnTime');
    const rbOnTimeBadge = document.getElementById('rbBadgeOnTime');
    if (rbOnTimeVal) rbOnTimeVal.textContent = `${tot.on_time_rate.toFixed(2)}%`;
    if (rbOnTimeBadge) {
      if (tot.on_time_rate >= 98.0) {
        rbOnTimeBadge.className = 'rb-badge tag-success';
        rbOnTimeBadge.textContent = 'Đạt chuẩn ≥ 98%';
      } else {
        rbOnTimeBadge.className = 'rb-badge tag-danger';
        rbOnTimeBadge.textContent = 'Chưa đạt < 98%';
      }
    }

    // 2. CLL (<= 6%)
    const rbCllVal = document.getElementById('rbValCLL');
    const rbCllBadge = document.getElementById('rbBadgeCLL');
    const rbCardCLL = document.getElementById('rbCardCLL');
    if (rbCllVal) rbCllVal.textContent = `${tot.cll_rate.toFixed(2)}%`;
    if (rbCardCLL) {
      rbCardCLL.classList.add('clickable-kpi');
      rbCardCLL.title = "Nhấp để xem danh sách toàn bộ ca CLL của đội";
      rbCardCLL.onclick = () => openShdModal('ALL', 'cll');
    }
    if (rbCllBadge) {
      if (tot.cll_rate <= 6.0) {
        rbCllBadge.className = 'rb-badge tag-success';
        rbCllBadge.textContent = 'Đạt chuẩn ≤ 6%';
      } else {
        rbCllBadge.className = 'rb-badge tag-danger';
        rbCllBadge.textContent = 'Vượt trần > 6%';
      }
    }

    // 3. CLL3 (<= 0.5%)
    const rbCll3Val = document.getElementById('rbValCLL3');
    const rbCll3Badge = document.getElementById('rbBadgeCLL3');
    const cll3Tot = (tot.cll3_rate !== null && tot.cll3_rate !== undefined) ? tot.cll3_rate : 0.0;
    if (rbCll3Val) rbCll3Val.textContent = `${cll3Tot.toFixed(2)}%`;
    if (rbCll3Badge) {
      if (cll3Tot <= 0.5) {
        rbCll3Badge.className = 'rb-badge tag-success';
        rbCll3Badge.textContent = 'Đạt ≤ 0.5%';
      } else {
        rbCll3Badge.className = 'rb-badge tag-danger';
        rbCll3Badge.textContent = 'Vượt > 0.5%';
      }
    }

    // 4. 7N Total (<= 2.5%)
    const rbCard7N = document.getElementById('rbCard7N');
    const rbVal7N = document.getElementById('rbVal7N');
    const rbBadge7N = document.getElementById('rbBadge7N');
    if (rbVal7N) rbVal7N.textContent = `${tot.cl_7n_total_rate.toFixed(2)}%`;
    if (rbBadge7N) {
      if (tot.cl_7n_total_rate <= 2.5) {
        rbBadge7N.className = 'rb-badge tag-success';
        rbBadge7N.textContent = 'Đạt ≤ 2.5%';
      } else {
        rbBadge7N.className = 'rb-badge tag-danger';
        rbBadge7N.textContent = 'Vượt > 2.5%';
      }
    }
    if (rbCard7N) {
      rbCard7N.classList.add('clickable-kpi');
      rbCard7N.title = "Nhấp để xem danh sách toàn bộ ca Checklist 7 ngày";
      rbCard7N.onclick = () => openShdModal('ALL', 'cl_7n_total');
    }

    // 5 & 6. RT TK & BT
    const rbValRT = document.getElementById('rbValRT');
    if (rbValRT) rbValRT.textContent = `${tot.repontime_tk}h / ${tot.repontime_bt}h`;

    // 7. CSAT (== 0)
    const rbValCsat = document.getElementById('rbValCsat');
    if (rbValCsat) {
      rbValCsat.textContent = `${tot.csat} ca`;
      rbValCsat.style.color = tot.csat <= 0 ? '#10b981' : '#ef4444';
    }

    // Team KPI Breakdown Summary
    const emps = appData.employees || [];
    const countPass = emps.filter(e => (e.kpi_score !== undefined ? e.kpi_score >= 5 : e.status_all_kpi)).length;
    const countWarning = emps.filter(e => e.kpi_score === 4).length;
    const countDanger = emps.filter(e => (e.kpi_score !== undefined ? e.kpi_score < 4 : false)).length;

    const rbValKpiPass = document.getElementById('rbValKpiPass');
    if (rbValKpiPass) rbValKpiPass.textContent = `${countPass} ĐẠT`;
    const rbSubKpiBreakdown = document.getElementById('rbSubKpiBreakdown');
    if (rbSubKpiBreakdown) rbSubKpiBreakdown.textContent = `${countWarning} Cảnh Báo • ${countDanger} Chưa Đạt`;
  }

  // 4. Render Hero Cards (Full View)
  function renderHeroCards() {
    const tot = appData.team_total;
    if (!tot) return;

    // 1. Đúng Hẹn (>= 98%)
    const onTimeVal = document.getElementById('valTeamOnTime');
    const onTimeCard = document.getElementById('cardOnTime');
    const onTimeTag = document.getElementById('tagTeamOnTime');
    if (onTimeVal) onTimeVal.textContent = tot.on_time_rate.toFixed(2);
    if (onTimeCard && onTimeTag) {
      if (tot.on_time_rate >= 98.0) {
        onTimeCard.className = 'stat-card success';
        onTimeTag.className = 'stat-tag tag-success';
        onTimeTag.textContent = 'Đạt KPI (≥ 98.0%) 🎯';
      } else {
        onTimeCard.className = 'stat-card danger';
        onTimeTag.className = 'stat-tag tag-danger';
        onTimeTag.textContent = 'Chưa đạt (< 98.0%) ⚠️';
      }
    }

    // 2. CLL (<= 6%)
    const cllVal = document.getElementById('valTeamCLL');
    const cllCard = document.getElementById('cardCLL');
    const cllTag = document.getElementById('tagTeamCLL');
    if (cllVal) cllVal.textContent = tot.cll_rate.toFixed(2);
    if (cllCard) {
      cllCard.classList.add('clickable-kpi');
      cllCard.onclick = () => openShdModal('ALL', 'cll');
      if (tot.cll_rate <= 6.0) {
        cllCard.className = 'stat-card success clickable-kpi';
        if (cllTag) { cllTag.className = 'stat-tag tag-success'; cllTag.textContent = 'Đạt chuẩn (≤ 6.0%) 🛡️ (Xem SHD)'; }
      } else {
        cllCard.className = 'stat-card danger clickable-kpi';
        if (cllTag) { cllTag.className = 'stat-tag tag-danger'; cllTag.textContent = 'Vượt trần (> 6.0%) ❌ (Xem SHD)'; }
      }
    }

    // 3. CLL3 (<= 0.5%)
    const cll3Val = document.getElementById('valTeamCLL3');
    const cll3Card = document.getElementById('cardCLL3');
    const cll3Tag = document.getElementById('tagTeamCLL3');
    const totCll3 = (tot.cll3_rate !== null && tot.cll3_rate !== undefined) ? tot.cll3_rate : 0.0;
    if (cll3Val) cll3Val.textContent = totCll3.toFixed(2);
    if (cll3Card && cll3Tag) {
      if (totCll3 <= 0.5) {
        cll3Card.className = 'stat-card success';
        cll3Tag.className = 'stat-tag tag-success';
        cll3Tag.textContent = 'Đạt chuẩn (≤ 0.5%) 🔁';
      } else {
        cll3Card.className = 'stat-card danger';
        cll3Tag.className = 'stat-tag tag-danger';
        cll3Tag.textContent = 'Vượt trần (> 0.5%) ❌';
      }
    }

    // 4. Tổng 7N (<= 2.5%)
    const cardTotal7N = document.getElementById('cardTotal7N');
    const valTotal7N = document.getElementById('valTeam7NTotal');
    const tagTotal7N = document.getElementById('tagTeam7NTotalCount');
    if (valTotal7N) valTotal7N.textContent = tot.cl_7n_total_rate.toFixed(2);
    if (cardTotal7N) {
      cardTotal7N.classList.add('clickable-kpi');
      cardTotal7N.onclick = () => openShdModal('ALL', 'cl_7n_total');
      if (tot.cl_7n_total_rate <= 2.5) {
        cardTotal7N.className = 'stat-card success clickable-kpi';
        if (tagTotal7N) { tagTotal7N.className = 'stat-tag tag-success'; tagTotal7N.textContent = 'Đạt chuẩn (≤ 2.5%) 📦'; }
      } else {
        cardTotal7N.className = 'stat-card danger clickable-kpi';
        if (tagTotal7N) { tagTotal7N.className = 'stat-tag tag-danger'; tagTotal7N.textContent = 'Vượt trần (> 2.5%) ❌'; }
      }
    }

    // 5. RT Triển khai (<= 18h)
    const cardRTTK = document.getElementById('cardRTTK');
    const valRTTK = document.getElementById('valTeamRTTK');
    const tagRTTK = document.getElementById('tagTeamRTTK');
    if (valRTTK) valRTTK.textContent = tot.repontime_tk;
    if (cardRTTK && tagRTTK) {
      if (tot.repontime_tk <= 18.0) {
        cardRTTK.className = 'stat-card success';
        tagRTTK.className = 'stat-tag tag-success';
        tagRTTK.textContent = 'Đạt chuẩn (≤ 18h) ⚡';
      } else {
        cardRTTK.className = 'stat-card danger';
        tagRTTK.className = 'stat-tag tag-danger';
        tagRTTK.textContent = 'Vượt chuẩn (> 18h) ⚠️';
      }
    }

    // 6. RT Bảo trì (<= 9h)
    const cardRTBT = document.getElementById('cardRTBT');
    const valRTBT = document.getElementById('valTeamRTBT');
    const tagRTBT = document.getElementById('tagTeamRTBT');
    if (valRTBT) valRTBT.textContent = tot.repontime_bt;
    if (cardRTBT && tagRTBT) {
      if (tot.repontime_bt <= 9.0) {
        cardRTBT.className = 'stat-card success';
        tagRTBT.className = 'stat-tag tag-success';
        tagRTBT.textContent = 'Đạt chuẩn (≤ 9h) 🔧';
      } else {
        cardRTBT.className = 'stat-card danger';
        tagRTBT.className = 'stat-tag tag-danger';
        tagRTBT.textContent = 'Vượt chuẩn (> 9h) ⚠️';
      }
    }

    // 7. CSAT (= 0)
    const cardCSAT = document.getElementById('cardCSAT');
    const valCSAT = document.getElementById('valTeamCSAT');
    const tagCSAT = document.getElementById('tagTeamCSAT');
    if (valCSAT) valCSAT.textContent = tot.csat;
    if (cardCSAT && tagCSAT) {
      if (tot.csat <= 0) {
        cardCSAT.className = 'stat-card success';
        tagCSAT.className = 'stat-tag tag-success';
        tagCSAT.textContent = 'Đạt chuẩn (0 ca xấu) ⭐';
      } else {
        cardCSAT.className = 'stat-card danger';
        tagCSAT.className = 'stat-tag tag-danger';
        tagCSAT.textContent = `${tot.csat} ca đánh giá xấu ⚠️`;
      }
    }

    // 8. Tồn Quá Hạn
    const totalOverdue = (tot.tk_over_72h || 0) + (tot.bt_over_24h || 0);
    const cardOverdue = document.getElementById('cardOverdue');
    const valOverdue = document.getElementById('valOverdueSum');
    const tagOverdue = document.getElementById('tagOverdueBreakdown');
    if (valOverdue) valOverdue.textContent = totalOverdue;
    if (tagOverdue) tagOverdue.textContent = `TK: ${tot.tk_over_72h || 0} | BT: ${tot.bt_over_24h || 0} 🔍`;
    if (cardOverdue) {
      cardOverdue.classList.add('clickable-kpi');
      cardOverdue.onclick = () => openShdModal('ALL', 'bt_over_24h');
    }
  }

  // 5. Update Status Filter Badges with Live Counts
  function updateFilterCounters() {
    if (!appData || !appData.employees) return;
    const emps = appData.employees;

    const countAll = emps.length;
    const countPass = emps.filter(e => (e.kpi_score !== undefined ? e.kpi_score >= 5 : e.status_all_kpi)).length;
    const countWarning = emps.filter(e => e.kpi_score === 4).length;
    const countDanger = emps.filter(e => (e.kpi_score !== undefined ? e.kpi_score < 4 : false)).length;
    const countFailOnTime = emps.filter(e => e.on_time_rate < 98.0).length;
    const countFailCll = emps.filter(e => e.cll_rate > 6.0).length;
    const countOverdue = emps.filter(e => (e.tk_over_72h > 0 || e.bt_over_24h > 0)).length;

    const bAll = document.getElementById('badgeCountAll'); if (bAll) bAll.textContent = countAll;
    const bPass = document.getElementById('badgeCountPass'); if (bPass) bPass.textContent = countPass;
    const bWarn = document.getElementById('badgeCountWarning'); if (bWarn) bWarn.textContent = countWarning;
    const bDang = document.getElementById('badgeCountDanger'); if (bDang) bDang.textContent = countDanger;
    const bTime = document.getElementById('badgeCountFailOnTime'); if (bTime) bTime.textContent = countFailOnTime;
    const bCll = document.getElementById('badgeCountFailCll'); if (bCll) bCll.textContent = countFailCll;
    const bOver = document.getElementById('badgeCountOverdue'); if (bOver) bOver.textContent = countOverdue;
  }

  // 6. Initialize Charts
  function initCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // Chart 1: Đúng Hẹn từng nhân sự
    const ctxOnTime = document.getElementById('chartOnTime').getContext('2d');
    charts.onTime = new Chart(ctxOnTime, {
      type: 'bar',
      data: getOnTimeChartData(),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Đúng hẹn: ${ctx.parsed.y}% (Chuẩn ≥ 98%)`
            }
          }
        },
        scales: {
          y: {
            min: 60,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { callback: v => v + '%' }
          },
          x: {
            grid: { display: false },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              font: { size: 10.5 }
            }
          }
        }
      }
    });

    // Chart 2: Checklist Lặp CLL
    const ctxCLL = document.getElementById('chartCLL').getContext('2d');
    charts.cll = new Chart(ctxCLL, {
      type: 'bar',
      data: getCLLChartData(),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` CLL: ${ctx.parsed.y}% (Mục tiêu ≤ 6.0%)`
            }
          }
        },
        scales: {
          y: {
            min: 0,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { callback: v => v + '%' }
          },
          x: {
            grid: { display: false },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              font: { size: 10.5 }
            }
          }
        }
      }
    });

    // Chart 3: Checklist 7N TK vs BT
    const ctx7N = document.getElementById('chart7N').getContext('2d');
    charts.sevenDays = new Chart(ctx7N, {
      type: 'bar',
      data: get7NChartData(),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12 } }
        },
        scales: {
          y: {
            min: 0,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { callback: v => v + '%' }
          },
          x: {
            grid: { display: false },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              font: { size: 10.5 }
            }
          }
        }
      }
    });

    // Chart 4: Thống kê theo Block
    const ctxBlock = document.getElementById('chartBlock').getContext('2d');
    charts.block = new Chart(ctxBlock, {
      type: 'bar',
      data: getBlockChartData(),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12 } }
        },
        scales: {
          y: {
            min: 80,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { callback: v => v + '%' }
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          }
        }
      }
    });
  }

  // Data helpers for charts
  function getOnTimeChartData() {
    const labels = filteredEmployees.map(e => e.name.replace('PNC01.', ''));
    const data = filteredEmployees.map(e => e.on_time_rate);
    const backgroundColors = data.map(v => v >= 98.0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)');
    const borderColors = data.map(v => v >= 98.0 ? '#10b981' : '#ef4444');
    return {
      labels,
      datasets: [{
        label: 'Tỷ Lệ Đúng Hẹn (%)',
        data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 4
      }]
    };
  }

  function getCLLChartData() {
    const labels = filteredEmployees.map(e => e.name.replace('PNC01.', ''));
    const data = filteredEmployees.map(e => e.cll_rate);
    const backgroundColors = data.map(v => v <= 6.0 ? 'rgba(56, 189, 248, 0.85)' : 'rgba(239, 68, 68, 0.85)');
    const borderColors = data.map(v => v <= 6.0 ? '#38bdf8' : '#ef4444');
    return {
      labels,
      datasets: [{
        label: 'Tỷ Lệ CLL (%)',
        data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 4
      }]
    };
  }

  function get7NChartData() {
    const labels = filteredEmployees.map(e => e.name.replace('PNC01.', ''));
    const tkData = filteredEmployees.map(e => e.cl_7n_tk_rate);
    const btData = filteredEmployees.map(e => e.cl_7n_bt_rate);
    return {
      labels,
      datasets: [
        {
          label: '7N Sau Triển Khai (%)',
          data: tkData,
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: '7N Sau Bảo Trì (%)',
          data: btData,
          backgroundColor: 'rgba(245, 158, 11, 0.8)',
          borderColor: '#f59e0b',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    };
  }

  function getBlockChartData() {
    const blocks = appData.blocks || [];
    const labels = blocks.map(b => b.block.replace('Phuong ', 'P.').replace('Thanh pho ', 'TP.'));
    const onTimeData = blocks.map(b => b.avg_on_time);
    const cllData = blocks.map(b => b.avg_cll);
    return {
      labels,
      datasets: [
        {
          label: 'Đúng Hẹn TB (%)',
          data: onTimeData,
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'CLL TB (%)',
          data: cllData,
          backgroundColor: 'rgba(56, 189, 248, 0.75)',
          borderColor: '#38bdf8',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    };
  }

  function updateCharts() {
    if (charts.onTime) {
      charts.onTime.data = getOnTimeChartData();
      charts.onTime.update();
    }
    if (charts.cll) {
      charts.cll.data = getCLLChartData();
      charts.cll.update();
    }
    if (charts.sevenDays) {
      charts.sevenDays.data = get7NChartData();
      charts.sevenDays.update();
    }
  }

  // 7. Render Data Table (with Interactive Clickable KPI Badges & 7 KPI Criteria)
  function renderTable() {
    const tbody = document.getElementById('employeeTableBody');
    const tfoot = document.getElementById('employeeTableFoot');
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    document.getElementById('tableRowCount').textContent = `${filteredEmployees.length} / ${appData.employees.length} Nhân sự`;

    if (filteredEmployees.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="15" style="text-align: center; padding: 40px; color: var(--text-muted);">
            🔍 Không tìm thấy nhân sự phù hợp với bộ lọc hiện tại.
          </td>
        </tr>
      `;
      return;
    }

    filteredEmployees.forEach(emp => {
      const tr = document.createElement('tr');

      // 7 tiêu chí KPI:
      // 1. Đúng Hẹn >= 98%
      // 2. CLL <= 6%
      // 3. CLL3 <= 0.5%
      // 4. 7N Tổng <= 2.5%
      // 5. RT TK <= 18h
      // 6. RT BT <= 9h
      // 7. CSAT == 0
      const p_on_time = emp.on_time_rate >= 98.0;
      const p_cll = emp.cll_rate <= 6.0;
      const cll3Val = (emp.cll3_rate !== null && emp.cll3_rate !== undefined) ? emp.cll3_rate : 0.0;
      const p_cll3 = cll3Val <= 0.5;
      const p_7n = emp.cl_7n_total_rate <= 2.5;
      const p_rt_tk = emp.repontime_tk <= 18.0;
      const p_rt_bt = emp.repontime_bt <= 9.0;
      const p_csat = emp.csat <= 0;

      const kpiScore = (emp.kpi_score !== undefined) ? emp.kpi_score :
        ([p_on_time, p_cll, p_cll3, p_7n, p_rt_tk, p_rt_bt, p_csat].filter(Boolean).length);

      // Xếp loại badge: 5-7 Đạt, 4 Cảnh báo, <4 Chưa đạt
      let statusHtml = '';
      let scoreBadgeClass = '';
      if (kpiScore >= 5) {
        statusHtml = '<span class="rate-pill rate-success" style="font-weight: 700;">🟢 ĐẠT</span>';
        scoreBadgeClass = 'rate-success';
      } else if (kpiScore === 4) {
        statusHtml = '<span class="rate-pill rate-warning" style="font-weight: 700;">🟡 CẢNH BÁO</span>';
        scoreBadgeClass = 'rate-warning';
      } else {
        statusHtml = '<span class="rate-pill rate-danger" style="font-weight: 700;">🔴 CHƯA ĐẠT</span>';
        scoreBadgeClass = 'rate-danger';
      }

      // Format Đúng hẹn
      const onTimeClass = p_on_time ? 'rate-success' : 'rate-danger';
      const onTimeFill = p_on_time ? '#10b981' : '#ef4444';

      // Format CLL
      const cllClass = p_cll ? 'rate-success' : 'rate-danger';
      const cllCount = (emp.details && emp.details.cll) ? emp.details.cll.length : 0;

      // Format CLL3
      const cll3Class = p_cll3 ? 'rate-success' : 'rate-danger';

      // Format 7N Tổng
      const total7nClass = p_7n ? 'rate-success' : 'rate-danger';
      const tk7Count = emp.cl_7n_tk_count || 0;
      const bt7Count = emp.cl_7n_bt_count || 0;
      const total7nCount = tk7Count + bt7Count;

      // Format RT TK & BT
      const rtTkClass = p_rt_tk ? 'rate-success' : 'rate-danger';
      const rtBtClass = p_rt_bt ? 'rate-success' : 'rate-danger';

      // Format CSAT
      const csatClass = p_csat ? 'rate-success' : 'rate-danger';

      // Initials for avatar
      const initials = emp.name.replace('PNC01.', '').slice(0, 2).toUpperCase();
      const displayName = emp.name.replace('PNC01.', '');
      const blockShort = emp.block ? emp.block.replace('Phuong ', 'P.').replace('Thanh pho ', 'TP.') : '-';

      // Get all issues for this employee
      const empIssuesData = getAllIssuesForEmployee(emp);
      const totalEmpIssues = empIssuesData.counts.total;
      const lateTkmC = empIssuesData.counts.late_tkm || 0;
      const lateBtC = empIssuesData.counts.late_bt || 0;
      const rtC = empIssuesData.counts.high_rt;
      const cllC = empIssuesData.counts.cll;
      const sevenC = empIssuesData.counts.seven_n;

      let miniChipsHtml = '';
      if (totalEmpIssues > 0) {
        miniChipsHtml = `
          <div class="emp-mini-issues-row">
            ${lateTkmC > 0 ? `<span class="emp-mini-chip chip-late" onclick="window.openEmpDossierModal('${emp.id}', 'LATE_TKM', event)" title="${lateTkmC} ca trễ TKM (Nhấp xem)">❌ ${lateTkmC} Trễ TKM</span>` : ''}
            ${lateBtC > 0 ? `<span class="emp-mini-chip chip-late" style="background: rgba(234, 88, 12, 0.2); border-color: rgba(234, 88, 12, 0.4); color: #fb923c;" onclick="window.openEmpDossierModal('${emp.id}', 'LATE_BT', event)" title="${lateBtC} ca trễ BT (Nhấp xem)">⚠️ ${lateBtC} Trễ BT</span>` : ''}
            ${rtC > 0 ? `<span class="emp-mini-chip chip-rt" onclick="window.openEmpDossierModal('${emp.id}', 'HIGH_RT', event)" title="${rtC} ca RT cao (Nhấp xem)">⏱️ ${rtC} RT</span>` : ''}
            ${cllC > 0 ? `<span class="emp-mini-chip chip-cll" onclick="window.openEmpDossierModal('${emp.id}', 'CLL', event)" title="${cllC} ca CLL (Nhấp xem)">🔁 ${cllC} CLL</span>` : ''}
            ${sevenC > 0 ? `<span class="emp-mini-chip chip-7n" onclick="window.openEmpDossierModal('${emp.id}', 'SEVEN_N', event)" title="${sevenC} ca 7 ngày (Nhấp xem)">📦 ${sevenC} 7N</span>` : ''}
          </div>
        `;
      } else {
        miniChipsHtml = `
          <div class="emp-mini-issues-row">
            <span class="emp-mini-chip chip-ok" onclick="window.openEmpDossierModal('${emp.id}', 'ALL', event)" title="Nhân sự không phát sinh sự cố nào">✨ 0 Sự Cố</span>
          </div>
        `;
      }

      // Check yesterday alert for this emp
      let alertBadgeHtml = '';
      if (appData && appData.yesterday_alerts && activeAlertDate) {
        const dateCases = (appData.yesterday_alerts.cases_by_date && appData.yesterday_alerts.cases_by_date[activeAlertDate]) || [];
        const empAlerts = dateCases.filter(c => {
          const cName = (c.emp || '').toUpperCase().replace('PNC01.', '').trim();
          const eName = emp.name.toUpperCase().replace('PNC01.', '').trim();
          return cName === eName || (c.emp || '').includes(displayName);
        });
        if (empAlerts.length > 0) {
          const aCll = empAlerts.filter(c => c.issue_type === 'CLL').length;
          const aLateTkm = empAlerts.filter(c => c.issue_type === 'LATE_TKM' || (c.issue_type === 'LATE' && (c.service === 'TKM' || (c.service && c.service.includes('TK'))))).length;
          const aLateBt = empAlerts.filter(c => c.issue_type === 'LATE_BT' || (c.issue_type === 'LATE' && c.service === 'BT')).length;
          const aRt = empAlerts.filter(c => c.issue_type === 'HIGH_RT').length;
          const tipParts = [];
          if (aCll) tipParts.push(`${aCll} CLL`);
          if (aLateTkm) tipParts.push(`${aLateTkm} Trễ TKM`);
          if (aLateBt) tipParts.push(`${aLateBt} Trễ BT`);
          if (aRt) tipParts.push(`${aRt} RT cao`);
          alertBadgeHtml = `<span class="ktv-alert-badge" title="Cảnh báo sự cố ngày ${activeAlertDate}: ${tipParts.join(', ')} (Nhấn mở hồ sơ lỗi)" onclick="window.openEmpDossierModal('${emp.id}', 'ALL', event)">⚠️ ${empAlerts.length} ca</span>`;
        }
      }

      tr.innerHTML = `
        <td class="sticky-col col-emp" style="cursor: pointer;" onclick="window.openEmpDossierModal('${emp.id}', 'ALL', event)" title="Nhấp xem toàn bộ hồ sơ lỗi của ${displayName}">
          <div class="emp-name-cell">
            <div class="emp-avatar">${initials}</div>
            <div class="emp-details">
              <div style="display: flex; align-items: center; gap: 4px;">
                <span class="emp-name-text" style="font-weight: 700; color: #fff;">${displayName}</span>
                ${alertBadgeHtml}
              </div>
              <span class="emp-id-text">Mã: ${emp.id}</span>
              ${miniChipsHtml}
            </div>
          </div>
        </td>
        <td class="col-block"><span style="color: var(--text-secondary); font-size: 12px;">${blockShort}</span></td>
        <!-- 1. Đúng Hẹn (≥98%) -->
        <td class="col-ontime ${!p_on_time ? 'clickable-kpi' : ''}" ${!p_on_time ? `onclick="window.openEmpDossierModal('${emp.id}', 'LATE', event)" title="Tỷ lệ đúng hẹn chưa đạt. Nhấp xem chi tiết các ca trễ hẹn"` : ''}>
          <div class="cell-progress">
            <span class="rate-pill ${onTimeClass}">${emp.on_time_rate.toFixed(2)}%</span>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${Math.min(100, Math.max(0, emp.on_time_rate))}%; background: ${onTimeFill};"></div>
            </div>
          </div>
        </td>
        <!-- 2. CLL (≤6%) -->
        <td class="col-cll">
          <span class="rate-pill ${cllClass} cell-shd-badge clickable-kpi ${cllCount > 0 ? 'has-data' : ''}" 
                onclick="window.openEmpDossierModal('${emp.id}', 'CLL', event)" 
                title="Nhấp xem chi tiết ${cllCount} ca CLL (Số hợp đồng, nguyên nhân)">
            ${emp.cll_rate.toFixed(2)}% ${cllCount > 0 ? `<small class="shd-count-icon">(${cllCount}) 🔍</small>` : ''}
          </span>
        </td>
        <!-- 3. CLL3 (≤0.5%) -->
        <td class="col-cll3">
          <span class="rate-pill ${cll3Class}">
            ${cll3Val.toFixed(2)}%
          </span>
        </td>
        <!-- 4. 7N Tổng (≤2.5%) -->
        <td class="col-7n-total">
          <span class="rate-pill ${total7nClass} cell-shd-badge clickable-kpi ${total7nCount > 0 ? 'has-data' : ''}" 
                onclick="window.openEmpDossierModal('${emp.id}', 'SEVEN_N', event)" 
                title="Nhấp xem toàn bộ ${total7nCount} SHD Checklist 7 Ngày">
            ${emp.cl_7n_total_rate.toFixed(2)}% ${total7nCount > 0 ? `(${total7nCount}) 🔍` : ''}
          </span>
        </td>
        <!-- 5. RT TK (≤18h) -->
        <td class="col-repon-tk ${!p_rt_tk ? 'clickable-kpi' : ''}" ${!p_rt_tk ? `onclick="window.openEmpDossierModal('${emp.id}', 'HIGH_RT', event)" title="RT Triển khai cao. Nhấp xem chi tiết"` : ''}>
          <span class="rate-pill ${rtTkClass}">${emp.repontime_tk}h</span>
        </td>
        <!-- 6. RT BT (≤9h) -->
        <td class="col-repon-bt ${!p_rt_bt ? 'clickable-kpi' : ''}" ${!p_rt_bt ? `onclick="window.openEmpDossierModal('${emp.id}', 'HIGH_RT', event)" title="RT Bảo trì cao. Nhấp xem chi tiết"` : ''}>
          <span class="rate-pill ${rtBtClass}">${emp.repontime_bt}h</span>
        </td>
        <!-- 7. CSAT (=0) -->
        <td class="col-csat">
          <span class="rate-pill ${csatClass}" style="font-weight: 700;">${emp.csat}</span>
        </td>
        <!-- Điểm KPI (Thang 7) -->
        <td class="col-kpi-score" style="text-align: center;">
          <span class="rate-pill ${scoreBadgeClass}" style="font-weight: 800; font-size: 13px;">${kpiScore}/7</span>
        </td>
        <!-- Xếp Loại -->
        <td class="col-status">${statusHtml}</td>
        <!-- Cột Hồ Sơ Lỗi Chi Tiết -->
        <td class="col-actions col-dossier" style="text-align: center;">
          <button class="btn-dossier-open ${totalEmpIssues > 0 ? 'has-issues' : 'is-clean'}" 
                  onclick="window.openEmpDossierModal('${emp.id}', 'ALL', event)" 
                  title="Nhấp xem chi tiết toàn bộ ${totalEmpIssues} ca lỗi của ${displayName}">
            ${totalEmpIssues > 0 ? `🔍 Xem Lỗi (${totalEmpIssues})` : `✨ 0 Lỗi`}
          </button>
        </td>
        <!-- Cột chi tiết sự cố mở rộng -->
        <td class="col-7n-tk col-optional">
          <span class="cell-shd-badge clickable-kpi ${tk7Count > 0 ? 'has-data' : ''}" 
                style="color: ${emp.cl_7n_tk_rate > 0 ? '#38bdf8' : 'var(--text-muted)'};" 
                data-emp="${emp.id}" data-type="cl_7n_tk" 
                title="Nhấp xem chi tiết ${tk7Count} SHD 7N Sau Triển Khai">
            ${emp.cl_7n_tk_rate.toFixed(2)}% (${tk7Count}) ${tk7Count > 0 ? '🔍' : ''}
          </span>
        </td>
        <td class="col-7n-bt col-optional">
          <span class="cell-shd-badge clickable-kpi ${bt7Count > 0 ? 'has-data' : ''}" 
                style="color: ${emp.cl_7n_bt_rate > 0 ? '#f59e0b' : 'var(--text-muted)'};" 
                data-emp="${emp.id}" data-type="cl_7n_bt" 
                title="Nhấp xem chi tiết ${bt7Count} SHD 7N Sau Bảo Trì">
            ${emp.cl_7n_bt_rate.toFixed(2)}% (${bt7Count}) ${bt7Count > 0 ? '🔍' : ''}
          </span>
        </td>
        <td class="col-tk-72h col-optional">
          <span class="cell-shd-badge clickable-kpi ${emp.tk_over_72h > 0 ? 'has-data' : ''}" 
                style="color: ${emp.tk_over_72h > 0 ? '#ef4444' : 'var(--text-muted)'}; font-weight: 700;" 
                data-emp="${emp.id}" data-type="tk_over_72h" 
                title="Nhấp xem chi tiết ${emp.tk_over_72h} SHD Triển khai quá hạn 72h">
            ${emp.tk_over_72h} ${emp.tk_over_72h > 0 ? '🔍' : ''}
          </span>
        </td>
        <td class="col-bt-24h col-optional">
          <span class="cell-shd-badge clickable-kpi ${emp.bt_over_24h > 0 ? 'has-data' : ''}" 
                style="color: ${emp.bt_over_24h > 5 ? '#ef4444' : (emp.bt_over_24h > 0 ? '#f59e0b' : 'var(--text-muted)')}; font-weight: 700;" 
                data-emp="${emp.id}" data-type="bt_over_24h" 
                title="Nhấp xem chi tiết ${emp.bt_over_24h} SHD Bảo trì quá hạn 24h">
            ${emp.bt_over_24h} ${emp.bt_over_24h > 0 ? '🔍' : ''}
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Render Sticky Total Foot Row
    const tot = appData.team_total;
    if (tot) {
      const sum7nTot = (tot.cl_7n_tk_count || 0) + (tot.cl_7n_bt_count || 0);
      const p_on_time_tot = tot.on_time_rate >= 98.0;
      const p_cll_tot = tot.cll_rate <= 6.0;
      const totCll3 = (tot.cll3_rate !== null && tot.cll3_rate !== undefined) ? tot.cll3_rate : 0.0;
      const p_cll3_tot = totCll3 <= 0.5;
      const p_7n_tot = tot.cl_7n_total_rate <= 2.5;
      const p_rt_tk_tot = tot.repontime_tk <= 18.0;
      const p_rt_bt_tot = tot.repontime_bt <= 9.0;
      const p_csat_tot = tot.csat <= 0;

      const tot_kpi_score = (tot.kpi_score !== undefined) ? tot.kpi_score :
        ([p_on_time_tot, p_cll_tot, p_cll3_tot, p_7n_tot, p_rt_tk_tot, p_rt_bt_tot, p_csat_tot].filter(Boolean).length);

      const totScoreClass = tot_kpi_score >= 5 ? 'rate-success' : (tot_kpi_score === 4 ? 'rate-warning' : 'rate-danger');
      const totStatusBadge = tot_kpi_score >= 5 ? 
        '<span class="rate-pill rate-success" style="font-weight: 700;">🟢 ĐẠT</span>' : 
        (tot_kpi_score === 4 ? '<span class="rate-pill rate-warning" style="font-weight: 700;">🟡 CẢNH BÁO</span>' : '<span class="rate-pill rate-danger" style="font-weight: 700;">🔴 CHƯA ĐẠT</span>');

      const footTr = document.createElement('tr');
      footTr.className = 'table-total-row';
      footTr.innerHTML = `
        <td class="sticky-col col-emp">
          <div class="team-total-title">
            ⚡ TỔNG ĐỘI (${tot.employee_count} NV)
          </div>
        </td>
        <td class="col-block"><span style="font-size: 11.5px; color: var(--text-muted);">Đội: ${tot.team}</span></td>
        <!-- 1. Đúng Hẹn -->
        <td class="col-ontime">
          <span class="rate-pill ${p_on_time_tot ? 'rate-success' : 'rate-danger'}" style="font-weight: 700;">
            ${tot.on_time_rate.toFixed(2)}%
          </span>
        </td>
        <!-- 2. CLL -->
        <td class="col-cll">
          <span class="rate-pill ${p_cll_tot ? 'rate-success' : 'rate-danger'} cell-shd-badge clickable-kpi has-data" 
                data-emp="ALL" data-type="cll" 
                style="font-weight: 700;" 
                title="Nhấp xem toàn bộ SHD ca CLL của toàn đội">
            ${tot.cll_rate.toFixed(2)}% 🔍
          </span>
        </td>
        <!-- 3. CLL3 -->
        <td class="col-cll3">
          <span class="rate-pill ${p_cll3_tot ? 'rate-success' : 'rate-danger'}" style="font-weight: 700;">
            ${totCll3.toFixed(2)}%
          </span>
        </td>
        <!-- 4. 7N Tổng -->
        <td class="col-7n-total">
          <span class="rate-pill ${p_7n_tot ? 'rate-success' : 'rate-danger'} cell-shd-badge clickable-kpi has-data" 
                data-emp="ALL" data-type="cl_7n_total" 
                style="font-weight: 800; font-size: 13px;" 
                title="Nhấp xem tổng hợp toàn bộ ${sum7nTot} SHD 7 Ngày của đội">
            ${tot.cl_7n_total_rate.toFixed(2)}% (${sum7nTot}) 🔍
          </span>
        </td>
        <!-- 5. RT TK -->
        <td class="col-repon-tk">
          <span class="rate-pill ${p_rt_tk_tot ? 'rate-success' : 'rate-danger'}" style="font-weight: 700;">${tot.repontime_tk}h</span>
        </td>
        <!-- 6. RT BT -->
        <td class="col-repon-bt">
          <span class="rate-pill ${p_rt_bt_tot ? 'rate-success' : 'rate-danger'}" style="font-weight: 700;">${tot.repontime_bt}h</span>
        </td>
        <!-- 7. CSAT -->
        <td class="col-csat">
          <span class="rate-pill ${p_csat_tot ? 'rate-success' : 'rate-danger'}" style="font-weight: 800;">${tot.csat}</span>
        </td>
        <!-- Điểm KPI -->
        <td class="col-kpi-score" style="text-align: center;">
          <span class="rate-pill ${totScoreClass}" style="font-weight: 800; font-size: 13px;">${tot_kpi_score}/7</span>
        </td>
        <!-- Xếp Loại -->
        <td class="col-status">${totStatusBadge}</td>
        <!-- Hồ Sơ Lỗi Toàn Đội -->
        <td class="col-actions col-dossier" style="text-align: center;">
          <button class="btn-dossier-open has-issues" onclick="window.switchToEmpIssuesView()" title="Chuyển sang chế độ soát lỗi toàn bộ 16 KTV">
            🚨 Soát Toàn Đội
          </button>
        </td>
        <!-- Cột chi tiết sự cố mở rộng -->
        <td class="col-7n-tk col-optional">
          <span class="cell-shd-badge clickable-kpi has-data" 
                data-emp="ALL" data-type="cl_7n_tk" 
                style="color: #38bdf8; font-weight: 700;" 
                title="Nhấp xem toàn bộ ${tot.cl_7n_tk_count} SHD 7N Sau TK của đội">
            ${tot.cl_7n_tk_rate.toFixed(2)}% (${tot.cl_7n_tk_count}) 🔍
          </span>
        </td>
        <td class="col-7n-bt col-optional">
          <span class="cell-shd-badge clickable-kpi has-data" 
                data-emp="ALL" data-type="cl_7n_bt" 
                style="color: #f59e0b; font-weight: 700;" 
                title="Nhấp xem toàn bộ ${tot.cl_7n_bt_count} SHD 7N Sau BT của đội">
            ${tot.cl_7n_bt_rate.toFixed(2)}% (${tot.cl_7n_bt_count}) 🔍
          </span>
        </td>
        <td class="col-tk-72h col-optional">
          <span class="cell-shd-badge clickable-kpi has-data" 
                data-emp="ALL" data-type="tk_over_72h" 
                style="color: #ef4444; font-weight: 800;" 
                title="Nhấp xem toàn bộ ${tot.tk_over_72h} SHD Quá hạn TK 72h của đội">
            ${tot.tk_over_72h} 🔍
          </span>
        </td>
        <td class="col-bt-24h col-optional">
          <span class="cell-shd-badge clickable-kpi has-data" 
                data-emp="ALL" data-type="bt_over_24h" 
                style="color: #ef4444; font-weight: 800;" 
                title="Nhấp xem toàn bộ ${tot.bt_over_24h} SHD Quá hạn BT 24h của đội">
            ${tot.bt_over_24h} 🔍
          </span>
        </td>
      `;
      tfoot.appendChild(footTr);
    }

    // Attach click listeners to all clickable KPI badges
    attachCellClickListeners();
  }

  // 8. Attach Click Listeners to Table Cells
  function attachCellClickListeners() {
    document.querySelectorAll('.cell-shd-badge.clickable-kpi').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const empId = el.dataset.emp;
        const metricType = el.dataset.type;
        if (empId && metricType) {
          openShdModal(empId, metricType);
        }
      });
    });
  }

  // ==========================================================================
  // 9. DRILL-DOWN SHD DETAIL MODAL CONTROLLER
  // ==========================================================================
  function openShdModal(empId, metricType) {
    if (!appData) return;

    let targetEmp = null;
    let isAll = (empId === 'ALL');

    if (isAll) {
      targetEmp = appData.team_total;
    } else {
      targetEmp = appData.employees.find(e => String(e.id) === String(empId));
    }

    if (!targetEmp) return;

    // Get cases
    let cases = [];
    if (targetEmp.details && targetEmp.details[metricType]) {
      cases = targetEmp.details[metricType];
    }

    currentModalCases = [...cases];
    currentModalFilteredCases = [...cases];

    // Configure titles & icons
    let categoryName = '';
    let categoryIcon = '📋';

    switch (metricType) {
      case 'cll':
        categoryName = 'Checklist Lặp (CLL)';
        categoryIcon = '🛡️';
        break;
      case 'cl_7n_tk':
        categoryName = 'Checklist 7 Ngày Sau Triển Khai';
        categoryIcon = '📦';
        break;
      case 'cl_7n_bt':
        categoryName = 'Checklist 7 Ngày Sau Bảo Trì';
        categoryIcon = '🔧';
        break;
      case 'cl_7n_total':
        categoryName = 'Tổng Hợp Checklist 7 Ngày (TK + BT)';
        categoryIcon = '📊';
        break;
      case 'tk_over_72h':
        categoryName = 'Triển Khai Quá Hạn > 72 Giờ';
        categoryIcon = '⚠️';
        break;
      case 'bt_over_24h':
        categoryName = 'Bảo Trì Quá Hạn > 24 Giờ';
        categoryIcon = '🚨';
        break;
      default:
        categoryName = metricType;
    }

    const empDisplayName = isAll ? 'Toàn Đội (Đỗ Văn Tiên)' : targetEmp.name;
    const empDisplayBlock = isAll ? 'Tất Cả Các Block' : (targetEmp.block || 'Chưa phân block');

    currentModalTitle = `Chi tiết ca ${categoryName} - ${empDisplayName}`;

    // Update Header Info
    document.getElementById('modalIconBadge').textContent = categoryIcon;
    document.getElementById('modalTitle').textContent = `Chi Tiết Ca: ${categoryName}`;
    document.getElementById('modalEmpName').textContent = empDisplayName;
    document.getElementById('modalEmpBlock').textContent = `Block: ${empDisplayBlock}`;
    document.getElementById('modalMetricCategory').textContent = `Loại: ${categoryName}`;
    document.getElementById('modalCaseCount').textContent = `${cases.length} ca`;
    document.getElementById('modalTotalCount').textContent = cases.length;

    // Reset search box
    const searchInput = document.getElementById('modalSearchInput');
    const searchClear = document.getElementById('modalSearchClear');
    searchInput.value = '';
    searchClear.style.display = 'none';

    // Render Table Header & Rows
    renderModalHeader(metricType, isAll);
    renderModalRows(metricType, isAll);

    // Show Modal
    const backdrop = document.getElementById('shdModalBackdrop');
    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // prevent background scrolling

    // Auto focus search box
    setTimeout(() => {
      searchInput.focus();
    }, 100);
  }

  function closeShdModal() {
    const backdrop = document.getElementById('shdModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    document.body.style.overflow = '';
  }

  function renderModalHeader(metricType, isAll) {
    const thead = document.getElementById('modalTableHead');
    
    let extraEmpCol = isAll ? '<th style="width: 130px;">Nhân Sự</th>' : '';

    if (metricType === 'cll') {
      thead.innerHTML = `
        <tr>
          <th style="width: 45px; text-align: center;">#</th>
          ${extraEmpCol}
          <th style="width: 150px;">Số HĐ (SHD)</th>
          <th style="width: 170px;">Khách Hàng</th>
          <th style="width: 140px;">TG Tạo / Phân Tuyến</th>
          <th style="width: 80px; text-align: center;">Lần Lặp</th>
          <th style="width: 90px;">Dịch Vụ</th>
          <th>Ghi Chú Kỹ Thuật (SOP/Mỹ Bảo)</th>
        </tr>
      `;
    } else if (metricType === 'cl_7n_tk' || metricType === 'cl_7n_bt') {
      thead.innerHTML = `
        <tr>
          <th style="width: 45px; text-align: center;">#</th>
          ${extraEmpCol}
          <th style="width: 150px;">Số HĐ (SHD)</th>
          <th style="width: 170px;">Khách Hàng</th>
          <th style="width: 140px;">Tên Truy Cập</th>
          <th style="width: 110px;">Gói Cước</th>
          <th style="width: 140px;">Ngày Checklist</th>
          <th style="width: 160px;">Hiện Tượng / Lỗi</th>
          <th>Ghi Chú Kỹ Thuật</th>
        </tr>
      `;
    } else if (metricType === 'cl_7n_total') {
      thead.innerHTML = `
        <tr>
          <th style="width: 45px; text-align: center;">#</th>
          <th style="width: 130px;">Phân Loại</th>
          ${extraEmpCol}
          <th style="width: 150px;">Số HĐ (SHD)</th>
          <th style="width: 160px;">Khách Hàng</th>
          <th style="width: 130px;">Tên Truy Cập</th>
          <th style="width: 130px;">Ngày Checklist</th>
          <th style="width: 150px;">Hiện Tượng / Lỗi</th>
          <th>Ghi Chú</th>
        </tr>
      `;
    } else if (metricType === 'tk_over_72h' || metricType === 'bt_over_24h') {
      const tgLabel = metricType === 'tk_over_72h' ? 'TG Quá Hạn (>72h)' : 'TG Quá Hạn (>24h)';
      thead.innerHTML = `
        <tr>
          <th style="width: 45px; text-align: center;">#</th>
          ${extraEmpCol}
          <th style="width: 150px;">Số HĐ (SHD)</th>
          <th style="width: 180px;">Khách Hàng</th>
          <th style="width: 110px;">Gói / Loại</th>
          <th style="width: 140px; color: #ef4444; font-weight: 700;">${tgLabel}</th>
          <th>Block / Địa Bàn Quản Lý</th>
        </tr>
      `;
    }
  }

  function renderModalRows(metricType, isAll) {
    const tbody = document.getElementById('modalTableBody');
    const emptyState = document.getElementById('modalEmptyState');
    const visibleCount = document.getElementById('modalVisibleCount');
    tbody.innerHTML = '';

    const cases = currentModalFilteredCases;
    visibleCount.textContent = cases.length;

    if (cases.length === 0) {
      tbody.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    } else {
      tbody.style.display = '';
      emptyState.style.display = 'none';
    }

    cases.forEach((c, idx) => {
      const tr = document.createElement('tr');
      const shd = c.shd || '-';
      const kh = c.kh || '-';
      const empCol = isAll ? `<td><span style="font-weight: 600; color: #38bdf8;">${c.emp_name ? c.emp_name.replace('PNC01.', '') : (c.nv || '-')}</span></td>` : '';

      const shdCell = `
        <td>
          <span class="shd-code-pill" onclick="window.copyShdText('${shd}', event)" title="Nhấp để sao chép mã ${shd}">
            ${shd} <span class="btn-copy-icon">📋</span>
          </span>
        </td>
      `;

      if (metricType === 'cll') {
        const ngay = c.ngay_tao || c.ngay_phancong || '-';
        const lap = c.so_lan_lap || '2';
        const dv = c.dich_vu || 'Internet';
        const note = c.note || '-';

        tr.innerHTML = `
          <td style="text-align: center; color: var(--text-muted); font-size: 11.5px;">${idx + 1}</td>
          ${empCol}
          ${shdCell}
          <td style="font-weight: 600; color: #fff;">${kh}</td>
          <td style="font-size: 12px; color: var(--text-secondary);">${ngay}</td>
          <td style="text-align: center;"><span class="rate-pill rate-warning" style="font-size: 11px;">${lap} lần</span></td>
          <td style="font-size: 12px;">${dv}</td>
          <td class="note-cell">
            <div class="note-truncate" onclick="window.toggleNoteExpand(this)" title="Nhấp để xem đầy đủ ghi chú">
              ${note}
            </div>
          </td>
        `;
      } else if (metricType === 'cl_7n_tk' || metricType === 'cl_7n_bt') {
        const acc = c.acc || '-';
        const goi = c.goi || '-';
        const ngay = c.ngay || '-';
        const loi = c.loi || 'Sự cố sau dịch vụ';
        const note = c.note || '-';

        tr.innerHTML = `
          <td style="text-align: center; color: var(--text-muted); font-size: 11.5px;">${idx + 1}</td>
          ${empCol}
          ${shdCell}
          <td style="font-weight: 600; color: #fff;">${kh}</td>
          <td style="font-family: monospace; font-size: 11.5px; color: var(--accent-blue);">${acc}</td>
          <td style="font-size: 12px;">${goi}</td>
          <td style="font-size: 12px; color: var(--text-secondary);">${ngay}</td>
          <td><span style="color: #f59e0b; font-size: 12px; font-weight: 500;">${loi}</span></td>
          <td class="note-cell">
            <div class="note-truncate" onclick="window.toggleNoteExpand(this)" title="Nhấp để xem đầy đủ ghi chú">
              ${note}
            </div>
          </td>
        `;
      } else if (metricType === 'cl_7n_total') {
        const loaiBadge = c.loai_7n === '7N Sau Triển Khai' ? 
          '<span class="rate-pill rate-success" style="font-size: 11px;">Triển khai</span>' : 
          '<span class="rate-pill rate-warning" style="font-size: 11px;">Bảo trì</span>';
        const acc = c.acc || '-';
        const ngay = c.ngay || '-';
        const loi = c.loi || 'Sự cố sau dịch vụ';
        const note = c.note || '-';

        tr.innerHTML = `
          <td style="text-align: center; color: var(--text-muted); font-size: 11.5px;">${idx + 1}</td>
          <td>${loaiBadge}</td>
          ${empCol}
          ${shdCell}
          <td style="font-weight: 600; color: #fff;">${kh}</td>
          <td style="font-family: monospace; font-size: 11.5px; color: var(--accent-blue);">${acc}</td>
          <td style="font-size: 12px; color: var(--text-secondary);">${ngay}</td>
          <td><span style="color: #f59e0b; font-size: 12px;">${loi}</span></td>
          <td class="note-cell">
            <div class="note-truncate" onclick="window.toggleNoteExpand(this)" title="Nhấp để xem đầy đủ ghi chú">
              ${note}
            </div>
          </td>
        `;
      } else if (metricType === 'tk_over_72h' || metricType === 'bt_over_24h') {
        const goi = c.goi || 'Internet';
        const tgxl = c.tgxl ? `${c.tgxl}h` : 'Quá hạn';
        const block = c.block || targetEmp.block || '-';

        tr.innerHTML = `
          <td style="text-align: center; color: var(--text-muted); font-size: 11.5px;">${idx + 1}</td>
          ${empCol}
          ${shdCell}
          <td style="font-weight: 600; color: #fff;">${kh}</td>
          <td style="font-size: 12px;">${goi}</td>
          <td><span class="rate-pill rate-danger" style="font-weight: 700;">${tgxl}</span></td>
          <td style="color: var(--text-secondary); font-size: 12px;">${block}</td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  function filterModalCases(keyword) {
    const term = keyword.trim().toLowerCase();
    const searchClear = document.getElementById('modalSearchClear');
    if (searchClear) searchClear.style.display = term ? 'block' : 'none';

    if (!term) {
      currentModalFilteredCases = [...currentModalCases];
    } else {
      currentModalFilteredCases = currentModalCases.filter(c => {
        const text = Object.values(c).join(' ').toLowerCase();
        return text.includes(term);
      });
    }

    const isAll = (document.getElementById('modalEmpName').textContent.includes('Toàn Đội'));
    const categoryText = document.getElementById('modalMetricCategory').textContent;
    let type = 'cll';
    if (categoryText.includes('7 Ngày Sau Triển Khai')) type = 'cl_7n_tk';
    else if (categoryText.includes('7 Ngày Sau Bảo Trì')) type = 'cl_7n_bt';
    else if (categoryText.includes('Tổng Hợp Checklist 7 Ngày')) type = 'cl_7n_total';
    else if (categoryText.includes('72 Giờ')) type = 'tk_over_72h';
    else if (categoryText.includes('24 Giờ')) type = 'bt_over_24h';

    renderModalRows(type, isAll);
  }

  function copyAllModalShd() {
    const shds = currentModalFilteredCases.map(c => c.shd).filter(Boolean);
    const uniqueShds = [...new Set(shds)];

    if (uniqueShds.length === 0) {
      window.showDashboardToast('Không có mã SHD nào để sao chép!');
      return;
    }

    const textToCopy = uniqueShds.join(', ');
    navigator.clipboard.writeText(textToCopy).then(() => {
      window.showDashboardToast(`Đã sao chép ${uniqueShds.length} mã SHD vào clipboard!`);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = textToCopy;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      window.showDashboardToast(`Đã sao chép ${uniqueShds.length} mã SHD vào clipboard!`);
    });
  }

  function exportModalCsv() {
    if (!currentModalFilteredCases || currentModalFilteredCases.length === 0) {
      window.showDashboardToast('Không có dữ liệu để xuất file CSV!');
      return;
    }

    const headers = ["STT", "SHD", "Khach_Hang", "Nhan_Su", "Block", "Thoi_Gian", "Chi_Tiet_Loi", "Ghi_Chu"];
    const rows = currentModalFilteredCases.map((c, i) => [
      i + 1,
      `"${c.shd || ''}"`,
      `"${c.kh || ''}"`,
      `"${c.emp_name || c.nv || ''}"`,
      `"${c.block || ''}"`,
      `"${c.ngay || c.ngay_tao || ''}"`,
      `"${(c.loi || c.so_lan_lap ? `Lặp ${c.so_lan_lap}` : '') || ''}"`,
      `"${(c.note || '').replace(/"/g, '""')}"`
    ]);

    let csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `SHD_ChiTiet_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.showDashboardToast('Đã tải xuống file CSV thành công!');
  }

  // 10. Sorting Logic
  function sortEmployees() {
    const col = currentSort.column;
    const isAsc = currentSort.direction === 'asc';

    filteredEmployees.sort((a, b) => {
      let valA = a[col];
      let valB = b[col];

      if (typeof valA === 'string') {
        return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (valA === null || valA === undefined) valA = -9999;
      if (valB === null || valB === undefined) valB = -9999;
      return isAsc ? (valA - valB) : (valB - valA);
    });
  }

  // 11. Filtering Logic
  function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.trim().toLowerCase();
    const clearBtn = document.getElementById('searchClearBtn');
    
    // Toggle search clear button
    if (clearBtn) {
      clearBtn.style.display = searchTerm ? 'block' : 'none';
    }

    filteredEmployees = appData.employees.filter(emp => {
      // 1. Search name or block
      const matchesSearch = !searchTerm || 
        emp.name.toLowerCase().includes(searchTerm) || 
        emp.block.toLowerCase().includes(searchTerm);

      // 2. Block filter
      const matchesBlock = currentBlockFilter === 'ALL' || emp.block === currentBlockFilter;

      // 3. Status filter
      let matchesStatus = true;
      if (currentStatusFilter === 'PASS') {
        matchesStatus = (emp.kpi_score !== undefined ? emp.kpi_score >= 5 : emp.status_all_kpi);
      } else if (currentStatusFilter === 'WARNING') {
        matchesStatus = (emp.kpi_score === 4);
      } else if (currentStatusFilter === 'DANGER') {
        matchesStatus = (emp.kpi_score !== undefined ? emp.kpi_score < 4 : false);
      } else if (currentStatusFilter === 'FAIL_ONTIME') {
        matchesStatus = emp.on_time_rate < 98.0;
      } else if (currentStatusFilter === 'FAIL_CLL') {
        matchesStatus = emp.cll_rate > 6.0;
      } else if (currentStatusFilter === 'HAS_OVERDUE') {
        matchesStatus = (emp.tk_over_72h > 0 || emp.bt_over_24h > 0);
      }

      return matchesSearch && matchesBlock && matchesStatus;
    });

    sortEmployees();
    renderTable();
    updateCharts();
  }

  // 12. Preference Initializer (View Mode, Column Preset, Density)
  function initPreferences() {
    // 1. View Mode (default: 'table')
    const savedView = localStorage.getItem('inside_view_mode') || 'table';
    setViewMode(savedView);

    // 2. Column Preset (default: 'core' - 100% fit screen without horizontal scroll!)
    const savedColPreset = localStorage.getItem('inside_col_preset') || 'core';
    setColumnPreset(savedColPreset);

    // 3. Density (default: 'compact' - fits 16 employees in 1 viewport)
    const savedDensity = localStorage.getItem('inside_density_mode') || 'compact';
    setDensityMode(savedDensity);
  }

  function setViewMode(mode) {
    document.body.classList.remove('view-table-active', 'view-charts-active', 'view-full-active', 'view-emp-issues-active');
    document.querySelectorAll('#mainViewSwitcher .view-switch-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === mode);
    });

    if (mode === 'charts') {
      document.body.classList.add('view-charts-active');
      setTimeout(() => updateCharts(), 50);
    } else if (mode === 'full') {
      document.body.classList.add('view-full-active');
      setTimeout(() => updateCharts(), 50);
    } else if (mode === 'emp-issues') {
      document.body.classList.add('view-emp-issues-active');
      renderEmpIssuesSection();
    } else {
      document.body.classList.add('view-table-active');
    }

    localStorage.setItem('inside_view_mode', mode);
  }

  function setColumnPreset(preset) {
    document.body.classList.remove('col-preset-core', 'col-preset-full', 'col-preset-overdue');
    document.body.classList.add(`col-preset-${preset}`);
    document.querySelectorAll('#colPresetGroup .btn-pill').forEach(b => {
      b.classList.toggle('active', b.dataset.col === preset);
    });
    localStorage.setItem('inside_col_preset', preset);
  }

  function setDensityMode(density) {
    document.body.classList.remove('density-compact', 'density-standard');
    document.body.classList.add(`density-${density}`);
    document.querySelectorAll('#densityGroup .btn-pill-icon').forEach(b => {
      b.classList.toggle('active', b.dataset.density === density);
    });
    localStorage.setItem('inside_density_mode', density);
  }

  // 13. Event Listeners
  function setupEventListeners() {
    // View Switcher Buttons
    document.querySelectorAll('#mainViewSwitcher .view-switch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setViewMode(btn.dataset.view);
      });
    });

    // Column Presets
    document.querySelectorAll('#colPresetGroup .btn-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        setColumnPreset(btn.dataset.col);
      });
    });

    // Density Switcher
    document.querySelectorAll('#densityGroup .btn-pill-icon').forEach(btn => {
      btn.addEventListener('click', () => {
        setDensityMode(btn.dataset.density);
      });
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', applyFilters);

    // Clear Search Button
    const searchClearBtn = document.getElementById('searchClearBtn');
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        applyFilters();
        searchInput.focus();
      });
    }

    // Block dropdown
    document.getElementById('blockFilter').addEventListener('change', (e) => {
      currentBlockFilter = e.target.value;
      applyFilters();
    });

    // Status filter tabs
    document.querySelectorAll('#statusFilterTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        document.querySelectorAll('#statusFilterTabs .tab-btn').forEach(b => b.classList.remove('active'));
        targetBtn.classList.add('active');
        currentStatusFilter = targetBtn.dataset.filter;
        applyFilters();
      });
    });

    // Table sorting
    document.querySelectorAll('.kpi-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const sortCol = th.dataset.sort;
        if (currentSort.column === sortCol) {
          currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.column = sortCol;
          currentSort.direction = 'desc';
        }

        // Update UI classes
        document.querySelectorAll('.kpi-table th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
        th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');

        sortEmployees();
        renderTable();
      });
    });

    // Modal Events
    const modalBackdrop = document.getElementById('shdModalBackdrop');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCloseFooterBtn = document.getElementById('modalCloseFooterBtn');
    const modalSearchInput = document.getElementById('modalSearchInput');
    const modalSearchClear = document.getElementById('modalSearchClear');
    const btnCopyAllShd = document.getElementById('btnCopyAllShd');
    const btnExportModalCsv = document.getElementById('btnExportModalCsv');

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeShdModal);
    if (modalCloseFooterBtn) modalCloseFooterBtn.addEventListener('click', closeShdModal);

    // Click outside modal container to close
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeShdModal();
      });
    }

    // Modal Search
    if (modalSearchInput) {
      modalSearchInput.addEventListener('input', (e) => {
        filterModalCases(e.target.value);
      });
    }

    if (modalSearchClear) {
      modalSearchClear.addEventListener('click', () => {
        modalSearchInput.value = '';
        filterModalCases('');
        modalSearchInput.focus();
      });
    }

    // Copy All SHDs
    if (btnCopyAllShd) btnCopyAllShd.addEventListener('click', copyAllModalShd);

    // Export Modal CSV
    if (btnExportModalCsv) btnExportModalCsv.addEventListener('click', exportModalCsv);

    // Keyboard ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeShdModal();
    });

    // Section Toggle Buttons (for Full View)
    const btnToggleStats = document.getElementById('btnToggleStats');
    if (btnToggleStats) {
      btnToggleStats.addEventListener('click', () => {
        const grid = document.getElementById('statsGrid');
        const icon = btnToggleStats.querySelector('.toggle-icon');
        const isHidden = grid.style.display === 'none';
        grid.style.display = isHidden ? 'grid' : 'none';
        icon.textContent = isHidden ? '▼' : '▶';
      });
    }

    const btnToggleCharts = document.getElementById('btnToggleCharts');
    if (btnToggleCharts) {
      btnToggleCharts.addEventListener('click', () => {
        const grid = document.getElementById('chartsGrid');
        const icon = btnToggleCharts.querySelector('.toggle-icon');
        const isHidden = grid.style.display === 'none';
        grid.style.display = isHidden ? 'grid' : 'none';
        icon.textContent = isHidden ? '▼' : '▶';
      });
    }

    // Floating Navigation Buttons
    const btnScrollToTable = document.getElementById('btnScrollToTable');
    if (btnScrollToTable) {
      btnScrollToTable.addEventListener('click', () => {
        setViewMode('table');
        document.getElementById('tableCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    const btnScrollToTop = document.getElementById('btnScrollToTop');
    if (btnScrollToTop) {
      btnScrollToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Refresh Button
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        checkDataUpdates(true);
      });
    }

    // Export CSV Button
    document.getElementById('btnExportCsv').addEventListener('click', exportToCsv);

    // Screenshot Capture Buttons (📸 Chụp Bảng Gửi Zalo)
    const btnCaptureTable = document.getElementById('btnCaptureTable');
    if (btnCaptureTable) {
      btnCaptureTable.addEventListener('click', captureTableScreenshot);
    }

    const btnQuickCapture = document.getElementById('btnQuickCapture');
    if (btnQuickCapture) {
      btnQuickCapture.addEventListener('click', captureTableScreenshot);
    }

    // Toggle Scroll vs Full Height Table
    const btnToggleTableScroll = document.getElementById('btnToggleTableScroll');
    const tableScrollContainer = document.getElementById('tableScrollContainer');
    if (btnToggleTableScroll && tableScrollContainer) {
      btnToggleTableScroll.addEventListener('click', () => {
        const isNoScroll = tableScrollContainer.classList.toggle('table-no-scroll');
        btnToggleTableScroll.classList.toggle('active', isNoScroll);
        const icon = document.getElementById('scrollToggleIcon');
        const text = document.getElementById('scrollToggleText');
        if (icon) icon.textContent = isNoScroll ? '📄' : '📜';
        if (text) text.textContent = isNoScroll ? 'Hiện đủ 16 dòng' : 'Khung cuộn bảng';
        window.showDashboardToast(isNoScroll ? '✅ Đã mở rộng: Hiện trọn vẹn 16 dòng không cần cuộn chuột' : '📜 Đã bật khung cuộn bảng');
      });
    }

    // Screenshot Modal Events
    const btnSsModalClose = document.getElementById('btnSsModalClose');
    if (btnSsModalClose) btnSsModalClose.addEventListener('click', closeScreenshotModal);

    const btnSsCloseFooter = document.getElementById('btnSsCloseFooter');
    if (btnSsCloseFooter) btnSsCloseFooter.addEventListener('click', closeScreenshotModal);

    const ssModalBackdrop = document.getElementById('screenshotModalBackdrop');
    if (ssModalBackdrop) {
      ssModalBackdrop.addEventListener('click', (e) => {
        if (e.target === ssModalBackdrop) closeScreenshotModal();
      });
    }

    const btnSsCopyClipboard = document.getElementById('btnSsCopyClipboard');
    if (btnSsCopyClipboard) {
      btnSsCopyClipboard.addEventListener('click', async () => {
        if (currentScreenshotBlob && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
          try {
            const item = new ClipboardItem({ 'image/png': currentScreenshotBlob });
            await navigator.clipboard.write([item]);
            window.showDashboardToast('📋 ĐÃ SAO CHÉP ẢNH! Mở Zalo và ấn Ctrl + V để gửi ngay!');
          } catch (err) {
            window.showDashboardToast('💡 Bạn có thể nhấp chuột phải vào ảnh chọn "Sao chép hình ảnh" để paste vào Zalo');
          }
        } else {
          window.showDashboardToast('💡 Bạn có thể nhấp chuột phải vào ảnh chọn "Sao chép hình ảnh" để paste vào Zalo');
        }
      });
    }

    const btnSsDownload = document.getElementById('btnSsDownload');
    if (btnSsDownload) {
      btnSsDownload.addEventListener('click', () => {
        if (currentScreenshotDataUrl) {
          const a = document.createElement('a');
          const fileDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          a.download = `BaoCao_KPI_16NV_DoVanTien_${fileDate}.png`;
          a.href = currentScreenshotDataUrl;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.showDashboardToast('💾 Đang tải ảnh về máy...');
        }
      });
    }

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeShdModal();
        closeScreenshotModal();
      }
    });
  }

  // =========================================================================
  // 15. SCREENSHOT CAPTURE (CHỤP TRỌN VẸN 16 NHÂN SỰ GỬI ZALO)
  // =========================================================================
  let currentScreenshotBlob = null;
  let currentScreenshotDataUrl = null;

  async function captureTableScreenshot() {
    if (typeof html2canvas === 'undefined') {
      window.showDashboardToast('❌ Thư viện html2canvas chưa sẵn sàng. Vui lòng tải lại trang.');
      return;
    }

    const btnHeader = document.getElementById('btnCaptureTable');
    const btnQuick = document.getElementById('btnQuickCapture');
    
    const originalTextHeader = btnHeader ? btnHeader.innerHTML : '';
    const originalTextQuick = btnQuick ? btnQuick.innerHTML : '';
    if (btnHeader) { btnHeader.innerHTML = '⏳ Đang chụp 16 NV...'; btnHeader.disabled = true; }
    if (btnQuick) { btnQuick.innerHTML = '⏳ Đang chụp...'; btnQuick.disabled = true; }

    window.showDashboardToast('📸 Đang chụp riêng Bảng 16 Nhân Sự (đầy đủ 16 dòng)...');

    try {
      const tableCard = document.getElementById('tableCard');
      if (!tableCard) return;

      // 1. Clone CHỈ RIÊNG tableCard (Bảng 16 nhân viên)
      const tableCardClone = tableCard.cloneNode(true);
      
      // Xóa các nút tương tác, thanh công cụ không cần thiết trong ảnh
      const tools = tableCardClone.querySelector('.table-header-tools');
      if (tools) tools.remove();
      const hints = tableCardClone.querySelector('.table-hints');
      if (hints) hints.remove();

      // Cập nhật tiêu đề bảng trong ảnh rõ nét, đầy đủ thông tin đội và ngày giờ
      const titleElem = tableCardClone.querySelector('.table-title');
      const nowStr = new Date().toLocaleString('vi-VN', { 
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' 
      });
      if (titleElem) {
        titleElem.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 2px solid rgba(99, 102, 241, 0.35); padding-bottom: 10px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 22px;">👥</span>
              <div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: -0.01em;">
                  BẢNG CHI TIẾT HIỆU SUẤT 16 NHÂN SỰ - ĐỘI ĐỖ VĂN TIÊN
                </div>
                <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                  Đầy đủ 16 Kỹ Thuật Viên • Nguồn: File Đúng hẹn.xlsx (Sheet Tong hop) • Cập nhật lúc: <strong style="color: #38bdf8;">${nowStr}</strong>
                </div>
              </div>
            </div>
            <div style="text-align: right; font-size: 11.5px; color: #64748b;">
              <div style="color: #34d399; font-weight: 700; font-size: 12px;">✅ ĐỦ 16 KTV + DÒNG TỔNG</div>
              <div>FPT Telecom • PNC</div>
            </div>
          </div>
        `;
        titleElem.style.width = '100%';
      }

      // Xóa bỏ giới hạn cuộn: mở rộng 100% chiều cao cho tất cả 16 dòng + dòng Tổng
      const scrollContainer = tableCardClone.querySelector('.table-responsive-freeze');
      if (scrollContainer) {
        scrollContainer.style.maxHeight = 'none';
        scrollContainer.style.overflow = 'visible';
        scrollContainer.style.height = 'auto';
      }

      // Reset sticky positions để html2canvas không bị lệch cột/dòng
      const stickies = tableCardClone.querySelectorAll('.sticky-col, thead th, tfoot td, tfoot th');
      stickies.forEach(el => {
        el.style.position = 'static';
        el.style.left = 'auto';
        el.style.top = 'auto';
        el.style.bottom = 'auto';
        el.style.boxShadow = 'none';
      });

      const table = tableCardClone.querySelector('.kpi-table');
      if (table) {
        table.style.width = '100%';
        table.style.tableLayout = 'auto';
      }

      // Container sandbox bọc đúng bảng để render
      const sandbox = document.createElement('div');
      sandbox.className = 'kpi-table-only-sandbox';
      sandbox.style.cssText = `
        position: absolute;
        left: -99999px;
        top: 0;
        width: 1360px;
        background-color: #0b1120;
        background-image: radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(56, 189, 248, 0.12) 0px, transparent 50%);
        padding: 16px;
        border-radius: 12px;
        color: #f8fafc;
        box-sizing: border-box;
      `;
      sandbox.appendChild(tableCardClone);
      document.body.appendChild(sandbox);

      // 2. Chụp với html2canvas độ nét cao (2x Retina)
      const canvas = await html2canvas(sandbox, {
        scale: 2,
        backgroundColor: '#0b1120',
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: 1360
      });

      // Cleanup sandbox khỏi DOM
      document.body.removeChild(sandbox);

      // 3. Process image data
      currentScreenshotDataUrl = canvas.toDataURL('image/png');
      
      canvas.toBlob(async (blob) => {
        currentScreenshotBlob = blob;
        let copied = false;

        // 3.1 Try copying directly to Clipboard
        try {
          if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            copied = true;
          }
        } catch (clipErr) {
          console.warn('Clipboard write failed, will open modal:', clipErr);
        }

        // 3.2 Trigger automatic file download
        const a = document.createElement('a');
        const fileDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `BaoCao_KPI_16NV_DoVanTien_${fileDate}.png`;
        a.href = currentScreenshotDataUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // 3.3 Open Preview Modal
        openScreenshotModal(currentScreenshotDataUrl, copied);

        // 3.4 Toast
        if (copied) {
          window.showDashboardToast('🎉 ĐÃ CHỤP XONG TOÀN BỘ 16 NHÂN SỰ! Đã copy vào Clipboard, bạn chỉ việc ấn Ctrl + V vào Zalo để gửi!');
        } else {
          window.showDashboardToast('🎉 ĐÃ CHỤP XONG TOÀN BỘ 16 NHÂN SỰ! File ảnh đã được tải về máy.');
        }
      }, 'image/png');

    } catch (err) {
      console.error('Screenshot error:', err);
      window.showDashboardToast('❌ Có lỗi khi tạo ảnh chụp: ' + (err.message || err));
    } finally {
      if (btnHeader) { btnHeader.innerHTML = originalTextHeader; btnHeader.disabled = false; }
      if (btnQuick) { btnQuick.innerHTML = originalTextQuick; btnQuick.disabled = false; }
    }
  }

  function openScreenshotModal(imgUrl, wasCopied) {
    const backdrop = document.getElementById('screenshotModalBackdrop');
    const img = document.getElementById('ssPreviewImg');
    const badge = document.getElementById('ssCopiedHint');
    
    if (img) img.src = imgUrl;
    if (badge) {
      badge.style.display = wasCopied ? 'inline-flex' : 'none';
    }

    if (backdrop) {
      backdrop.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }

  function closeScreenshotModal() {
    const backdrop = document.getElementById('screenshotModalBackdrop');
    if (backdrop) {
      backdrop.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  // 14. Export to CSV (Full Table)
  function exportToCsv() {
    if (!filteredEmployees || filteredEmployees.length === 0) return;

    const headers = [
      "Nhan_Su", "Block", "Dung_Hen_Rate", "CLL_Rate", "CLL3_Rate", 
      "Tong_7N_Rate", "Repon_TK_h", "Repon_BT_h", "CSAT_Xau", 
      "Diem_KPI_Thang_7", "Xep_Loai_KPI", "7N_TK_Rate", "7N_TK_Count", 
      "7N_BT_Rate", "7N_BT_Count", "TK_Over_72H", "BT_Over_24H"
    ];

    const rows = filteredEmployees.map(e => [
      `"${e.name}"`,
      `"${e.block}"`,
      e.on_time_rate,
      e.cll_rate,
      (e.cll3_rate !== null && e.cll3_rate !== undefined ? e.cll3_rate : 0.0),
      e.cl_7n_total_rate,
      e.repontime_tk,
      e.repontime_bt,
      e.csat,
      `${e.kpi_score || 0}/7`,
      `"${e.kpi_status || (e.kpi_score >= 5 ? 'ĐẠT' : (e.kpi_score === 4 ? 'CẢNH BÁO' : 'CHƯA ĐẠT'))}"`,
      e.cl_7n_tk_rate,
      e.cl_7n_tk_count,
      e.cl_7n_bt_rate,
      e.cl_7n_bt_count,
      e.tk_over_72h,
      e.bt_over_24h
    ]);

    let csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `KPI_16_Nhan_Vien_7TieuChi_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.showDashboardToast('Đã tải xuống file CSV toàn bộ 7 tiêu chí KPI thành công!');
  }

  // ==========================================================================
  // YESTERDAY ALERTS SYSTEM - LOGIC & INTERACTION
  // ==========================================================================

  function initYesterdayAlerts() {
    const card = document.getElementById('yesterdayAlertCard');
    if (!card) return;

    const alerts = appData && appData.yesterday_alerts;
    if (!alerts || !alerts.available_dates || alerts.available_dates.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    // Populate Date Picker Dropdown
    const select = document.getElementById('alertDateSelect');
    if (select) {
      const prevVal = select.value;
      select.innerHTML = '';
      alerts.available_dates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        const isYest = alerts.summary && alerts.summary.target_date === d && alerts.summary.is_yesterday;
        opt.textContent = `${d}${isYest ? ' (Hôm qua)' : ''}`;
        select.appendChild(opt);
      });
      if (prevVal && alerts.available_dates.includes(prevVal)) {
        select.value = prevVal;
        activeAlertDate = prevVal;
      } else {
        activeAlertDate = alerts.target_date || alerts.available_dates[0];
        select.value = activeAlertDate;
      }
    } else {
      activeAlertDate = alerts.target_date || alerts.available_dates[0];
    }

    updateAlertBanner(activeAlertDate);
  }

  function updateAlertBanner(targetDate) {
    if (!appData || !appData.yesterday_alerts) return;
    const alerts = appData.yesterday_alerts;
    const cases = (alerts.cases_by_date && alerts.cases_by_date[targetDate]) || [];

    // Summary calculations
    const cllCases = cases.filter(c => c.issue_type === 'CLL');
    const lateTkmCases = cases.filter(c => c.issue_type === 'LATE_TKM' || (c.issue_type === 'LATE' && (c.service === 'TKM' || (c.service && c.service.includes('TK')))));
    const lateBtCases = cases.filter(c => c.issue_type === 'LATE_BT' || (c.issue_type === 'LATE' && c.service === 'BT'));
    const lateCases = cases.filter(c => c.issue_type === 'LATE' || c.issue_type === 'LATE_TKM' || c.issue_type === 'LATE_BT');
    const rtCases = cases.filter(c => c.issue_type === 'HIGH_RT');

    const flaggedEmps = new Set(cases.map(c => c.emp));
    const totalTeam = appData.employees ? appData.employees.length : 16;

    // Badges & Labels
    const dateBadge = document.getElementById('alertTargetDateBadge');
    if (dateBadge) dateBadge.textContent = `Ngày ${targetDate}`;

    const sevBadge = document.getElementById('alertSeverityBadge');
    if (sevBadge) {
      if (cases.length === 0) {
        sevBadge.className = 'badge-severity-live';
        sevBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        sevBadge.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        sevBadge.style.color = '#6ee7b7';
        sevBadge.textContent = '🟢 Không Có Lỗi';
      } else {
        sevBadge.className = 'badge-severity-live';
        sevBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        sevBadge.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        sevBadge.style.color = '#fca5a5';
        sevBadge.textContent = `⚠️ ${flaggedEmps.size} KTV Cần Rà Soát`;
      }
    }

    // Number Chips
    const elCll = document.getElementById('alertCllVal');
    if (elCll) elCll.textContent = cllCases.length;

    const elLate = document.getElementById('alertLateVal');
    if (elLate) elLate.textContent = lateCases.length;

    const elLateTkm = document.getElementById('alertLateTkmVal');
    if (elLateTkm) elLateTkm.textContent = lateTkmCases.length;

    const elLateBt = document.getElementById('alertLateBtVal');
    if (elLateBt) elLateBt.textContent = lateBtCases.length;

    const elRt = document.getElementById('alertRtVal');
    if (elRt) elRt.textContent = rtCases.length;

    const elEmp = document.getElementById('alertEmpVal');
    if (elEmp) elEmp.textContent = `${flaggedEmps.size} / ${totalTeam}`;
  }

  function copyYesterdayZaloAlert() {
    if (!appData || !appData.yesterday_alerts || !activeAlertDate) return;
    const alerts = appData.yesterday_alerts;
    
    // Nếu ngày đang chọn trùng với target_date mặc định thì dùng zalo_message có sẵn
    let msg = alerts.zalo_message;
    if (activeAlertDate !== alerts.target_date || !msg) {
      const cases = (alerts.cases_by_date && alerts.cases_by_date[activeAlertDate]) || [];
      msg = buildZaloAlertText(activeAlertDate, cases);
    }

    if (!msg) {
      window.showDashboardToast('ℹ️ Không có ca sự cố nào để tạo thông báo Zalo.');
      return;
    }

    navigator.clipboard.writeText(msg).then(() => {
      window.showDashboardToast(`📋 Đã sao chép cảnh báo Zalo ngày ${activeAlertDate}! Mở Zalo và ấn Ctrl + V để gửi.`);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      window.showDashboardToast(`📋 Đã sao chép cảnh báo Zalo ngày ${activeAlertDate}! Mở Zalo và ấn Ctrl + V để gửi.`);
    });
  }

  function buildZaloAlertText(dateStr, casesList) {
    const teamMembers = appData.employees ? appData.employees.map(e => e.name) : [];
    const empGroups = {};
    teamMembers.forEach(m => {
      empGroups[m] = { cll: [], late_tkm: [], late_bt: [], high_rt: [], seven_n: [] };
    });

    casesList.forEach(c => {
      const emp = c.emp;
      if (!empGroups[emp]) empGroups[emp] = { cll: [], late_tkm: [], late_bt: [], high_rt: [], seven_n: [] };
      if (c.issue_type === 'CLL') empGroups[emp].cll.push(c);
      else if (c.issue_type === 'LATE' || c.issue_type === 'LATE_TKM' || c.issue_type === 'LATE_BT') {
        const isTkm = (c.service === 'TKM' || (c.service && c.service.includes('TK')) || c.issue_type === 'LATE_TKM');
        if (isTkm) empGroups[emp].late_tkm.push(c);
        else empGroups[emp].late_bt.push(c);
      }
      else if (c.issue_type === 'HIGH_RT') empGroups[emp].high_rt.push(c);
      else if (c.issue_type === '7N') empGroups[emp].seven_n.push(c);
    });

    const flagged = Object.entries(empGroups).filter(([m, grp]) => grp.cll.length || grp.late_tkm.length || grp.late_bt.length || grp.high_rt.length || grp.seven_n.length);
    flagged.sort((a, b) => (b[1].cll.length * 10 + (b[1].late_tkm.length + b[1].late_bt.length) * 5 + b[1].seven_n.length * 3 + b[1].high_rt.length) - (a[1].cll.length * 10 + (a[1].late_tkm.length + a[1].late_bt.length) * 5 + a[1].seven_n.length * 3 + a[1].high_rt.length));

    const totalCll = flagged.reduce((acc, [, g]) => acc + g.cll.length, 0);
    const totalLateTkm = flagged.reduce((acc, [, g]) => acc + g.late_tkm.length, 0);
    const totalLateBt = flagged.reduce((acc, [, g]) => acc + g.late_bt.length, 0);
    const totalLate = totalLateTkm + totalLateBt;
    const totalRt = flagged.reduce((acc, [, g]) => acc + g.high_rt.length, 0);
    const total7n = flagged.reduce((acc, [, g]) => acc + g.seven_n.length, 0);

    const lines = [
      `🚨 [CẢNH BÁO SỰ CỐ NGÀY ${dateStr}] - ĐỘI ĐỖ VĂN TIÊN`,
      `📅 Ngày soát lỗi: ${dateStr} (Các ca hoàn tất trong ngày)`,
      `📊 Tổng kết: ${flagged.length}/${teamMembers.length} nhân sự phát sinh sự cố`,
      `  • 🔁 Checklist Lặp (CLL): ${totalCll} ca`,
      `  • ❌ Trễ Hẹn Tổng: ${totalLate} ca (Triển khai mới: ${totalLateTkm} ca | Bảo trì: ${totalLateBt} ca)`,
      `  • ⏱️ Response Time (RT) Cao: ${totalRt} ca`,
    ];
    if (total7n > 0) lines.push(`  • 📦 Checklist 7 Ngày: ${total7n} ca`);
    lines.push("-----------------------------------------");

    flagged.forEach(([m, grp], idx) => {
      const short = m.replace('PNC01.', '');
      lines.push(`${idx + 1}. 👤 ${short}:`);
      if (grp.cll.length) {
        const shds = grp.cll.map(c => `${c.shd}(L${c.so_lan_lap || 2})`).join(', ');
        lines.push(`   🔁 CLL (${grp.cll.length} ca): ${shds}`);
      }
      if (grp.late_tkm.length) {
        const details = grp.late_tkm.map(c => c.shd).join(', ');
        lines.push(`   ❌ Trễ hẹn TKM (${grp.late_tkm.length} ca): ${details}`);
      }
      if (grp.late_bt.length) {
        const details = grp.late_bt.map(c => c.shd).join(', ');
        lines.push(`   ⚠️ Trễ hẹn BT (${grp.late_bt.length} ca): ${details}`);
      }
      if (grp.seven_n.length) {
        const details = grp.seven_n.map(c => `${c.shd} (${c.service})`).join(', ');
        lines.push(`   📦 7N phát sinh (${grp.seven_n.length} ca): ${details}`);
      }
      if (grp.high_rt.length) {
        const rtVals = grp.high_rt.map(c => c.rt).filter(v => v !== undefined && v !== null);
        const avgRt = rtVals.length ? (rtVals.reduce((a, b) => a + b, 0) / rtVals.length).toFixed(1) : 0;
        lines.push(`   ⏱️ RT cao: ${grp.high_rt.length} ca (RT TB: ${avgRt}h)`);
      }
    });

    lines.push("-----------------------------------------");
    lines.push("💡 Chi tiết từng hợp đồng RT cao xem trực tiếp trên Web Dashboard!");
    lines.push("👉 Đề nghị các bạn KTV rà soát lại nguyên nhân và báo cáo hướng xử lý!");
    return lines.join("\n");
  }

  // Open Alert Modal
  function openYesterdayAlertModal(filterType = 'ALL', filterEmp = null) {
    if (!appData || !appData.yesterday_alerts || !activeAlertDate) return;
    const alerts = appData.yesterday_alerts;
    currentAlertModalCases = (alerts.cases_by_date && alerts.cases_by_date[activeAlertDate]) || [];
    currentAlertTypeFilter = filterType;

    const backdrop = document.getElementById('yesterdayAlertModalBackdrop');
    if (!backdrop) return;

    // Subtitle
    const dateSub = document.getElementById('alertModalDateSub');
    if (dateSub) dateSub.textContent = activeAlertDate;

    const empCountSub = document.getElementById('alertModalEmpCountSub');
    const flaggedSet = new Set(currentAlertModalCases.map(c => c.emp));
    if (empCountSub) empCountSub.textContent = `${flaggedSet.size} / ${appData.employees ? appData.employees.length : 16} KTV có lỗi`;

    // Active pill
    const pills = document.querySelectorAll('#alertTypeFilterGroup .btn-pill');
    pills.forEach(p => {
      p.classList.toggle('active', p.dataset.type === filterType);
    });

    // Search input
    const searchInput = document.getElementById('alertModalSearchInput');
    if (searchInput) {
      searchInput.value = filterEmp ? filterEmp : '';
      const clearBtn = document.getElementById('alertModalSearchClear');
      if (clearBtn) clearBtn.style.display = filterEmp ? 'block' : 'none';
    }

    renderAlertModalRows();
    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  window.openYesterdayAlertModalForEmp = function(empName, event) {
    if (event) event.stopPropagation();
    openYesterdayAlertModal('ALL', empName);
  };

  function closeYesterdayAlertModal() {
    const backdrop = document.getElementById('yesterdayAlertModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    document.body.style.overflow = '';
  }

  function renderAlertModalRows() {
    const tbody = document.getElementById('alertModalTableBody');
    if (!tbody) return;

    const searchInput = document.getElementById('alertModalSearchInput');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    currentAlertModalFilteredCases = currentAlertModalCases.filter(c => {
      // 1. Type Filter
      if (currentAlertTypeFilter === 'CLL' && c.issue_type !== 'CLL') return false;
      if (currentAlertTypeFilter === 'LATE' && (c.issue_type !== 'LATE' && c.issue_type !== 'LATE_TKM' && c.issue_type !== 'LATE_BT')) return false;
      if (currentAlertTypeFilter === 'LATE_TKM') {
        const isTkm = (c.service === 'TKM' || (c.service && c.service.includes('TK')) || c.issue_type === 'LATE_TKM');
        const isLate = (c.issue_type === 'LATE' || c.issue_type === 'LATE_TKM');
        if (!isLate || !isTkm) return false;
      }
      if (currentAlertTypeFilter === 'LATE_BT') {
        const isBt = (c.service === 'BT' || c.issue_type === 'LATE_BT');
        const isLate = (c.issue_type === 'LATE' || c.issue_type === 'LATE_BT');
        if (!isLate || !isBt) return false;
      }
      if (currentAlertTypeFilter === 'HIGH_RT' && c.issue_type !== 'HIGH_RT') return false;
      if (currentAlertTypeFilter === '7N' && c.issue_type !== '7N') return false;

      // 2. Search Query
      if (query) {
        const text = `${c.emp} ${c.shd} ${c.kh} ${c.issue_title} ${c.note || ''} ${c.block || ''}`.toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    // Update Counts
    const caseCountBadge = document.getElementById('alertModalCaseCount');
    if (caseCountBadge) caseCountBadge.textContent = `${currentAlertModalFilteredCases.length} ca`;

    const footerStats = document.getElementById('alertModalFooterStats');
    if (footerStats) footerStats.textContent = `Đang hiển thị ${currentAlertModalFilteredCases.length} / ${currentAlertModalCases.length} ca sự cố ngày ${activeAlertDate}`;

    if (currentAlertModalFilteredCases.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
            <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
            <div style="font-size: 15px; font-weight: 600; color: #f8fafc;">Không có ca sự cố nào phù hợp với bộ lọc</div>
            <div style="font-size: 12.5px; margin-top: 4px;">Hãy thử xóa tìm kiếm hoặc chuyển sang loại lỗi khác.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = currentAlertModalFilteredCases.map((c, idx) => {
      const shortEmp = (c.emp || '').replace('PNC01.', '');
      
      let badgeHtml = '';
      if (c.issue_type === 'CLL') {
        badgeHtml = `<span class="modal-chip chip-cll" style="font-size: 11.5px; padding: 3px 8px; border-radius: 6px; background: rgba(239, 68, 68, 0.2); color: #fca5a5; font-weight: 700; border: 1px solid rgba(239,68,68,0.4);">🔁 CLL (L${c.so_lan_lap || 2})</span>`;
      } else if (c.issue_type === 'LATE' || c.issue_type === 'LATE_TKM' || c.issue_type === 'LATE_BT') {
        const isTkm = (c.service === 'TKM' || (c.service && c.service.includes('TK')) || c.issue_type === 'LATE_TKM');
        if (isTkm) {
          badgeHtml = `<span class="modal-chip chip-late" style="font-size: 11.5px; padding: 3px 8px; border-radius: 6px; background: rgba(239, 68, 68, 0.2); color: #fca5a5; font-weight: 700; border: 1px solid rgba(239,68,68,0.4);">❌ Trễ Hẹn TKM</span>`;
        } else {
          badgeHtml = `<span class="modal-chip chip-late" style="font-size: 11.5px; padding: 3px 8px; border-radius: 6px; background: rgba(245, 158, 11, 0.2); color: #fcd34d; font-weight: 700; border: 1px solid rgba(245,158,11,0.4);">⚠️ Trễ Hẹn BT</span>`;
        }
      } else if (c.issue_type === 'HIGH_RT') {
        const isSev = c.severity === 'danger';
        badgeHtml = `<span class="modal-chip chip-rt" style="font-size: 11.5px; padding: 3px 8px; border-radius: 6px; background: ${isSev ? 'rgba(239, 68, 68, 0.25)' : 'rgba(99, 102, 241, 0.2)'}; color: ${isSev ? '#fca5a5' : '#c7d2fe'}; font-weight: 700; border: 1px solid ${isSev ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.4)'};">⏱️ RT Cao ${c.service} ${isSev ? '⚠️' : ''}</span>`;
      } else if (c.issue_type === '7N') {
        badgeHtml = `<span class="modal-chip" style="font-size: 11.5px; padding: 3px 8px; border-radius: 6px; background: rgba(56, 189, 248, 0.2); color: #7dd3fc; font-weight: 700; border: 1px solid rgba(56,189,248,0.4);">📦 7N ${c.service}</span>`;
      }

      const noteText = c.note || c.issue_title || '-';
      const rtText = (c.rt !== undefined && c.rt !== null && c.rt > 0) ? `${c.rt}h` : '-';
      const rtColor = (c.rt > 24 || (c.service === 'TK' && c.rt > 72)) ? '#ef4444' : (c.rt > 9 ? '#f59e0b' : '#94a3b8');

      return `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-size: 12px;">${idx + 1}</td>
          <td>
            <div style="font-weight: 600; color: #f8fafc;">${shortEmp}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${c.block || ''}</div>
          </td>
          <td>${badgeHtml}</td>
          <td>
            <div class="shd-copy-box" onclick="copyShdText('${c.shd}', event)" title="Nhấp để copy mã HĐ">
              <span class="shd-text">${c.shd || '-'}</span>
              <span class="copy-icon">📋</span>
            </div>
          </td>
          <td style="max-width: 170px;">
            <div style="font-weight: 500; font-size: 12.5px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${c.kh || ''}">${c.kh || '-'}</div>
          </td>
          <td style="font-size: 12px; color: var(--text-secondary); white-space: nowrap;">${c.hoantat || '-'}</td>
          <td style="font-size: 13px; font-weight: 700; color: ${rtColor}; text-align: center;">${rtText}</td>
          <td style="max-width: 250px;">
            <div class="note-cell-truncate" onclick="toggleNoteExpand(this)" title="Nhấp để phóng to / thu nhỏ ghi chú">
              ${noteText}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function exportAlertModalCsv() {
    if (!currentAlertModalFilteredCases || currentAlertModalFilteredCases.length === 0) {
      window.showDashboardToast('ℹ️ Không có dữ liệu để xuất CSV');
      return;
    }

    const headers = ["STT", "Nhân Viên", "Loại Sự Cố", "Dịch Vụ", "Số HĐ", "Khách Hàng", "TG Hoàn Tất", "RT (Giờ)", "Mức Độ", "Ghi Chú / Nguyên Nhân"];
    const rows = currentAlertModalFilteredCases.map((c, i) => [
      i + 1,
      `"${c.emp || ''}"`,
      `"${c.issue_title || ''}"`,
      `"${c.service || ''}"`,
      `"${c.shd || ''}"`,
      `"${c.kh || ''}"`,
      `"${c.hoantat || ''}"`,
      c.rt || 0,
      `"${c.severity || 'normal'}"`,
      `"${(c.note || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Canh_Bao_Su_Co_${(activeAlertDate || 'HomQua').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.showDashboardToast(`📥 Đã xuất file CSV cảnh báo sự cố ngày ${activeAlertDate}!`);
  }

  function copyAlertModalShdList() {
    if (!currentAlertModalFilteredCases || currentAlertModalFilteredCases.length === 0) {
      window.showDashboardToast('ℹ️ Không có hợp đồng nào để copy');
      return;
    }
    const shds = [...new Set(currentAlertModalFilteredCases.map(c => c.shd).filter(Boolean))];
    const text = shds.join("\n");

    navigator.clipboard.writeText(text).then(() => {
      window.showDashboardToast(`📋 Đã sao chép ${shds.length} mã SHD vào bộ nhớ tạm!`);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      window.showDashboardToast(`📋 Đã sao chép ${shds.length} mã SHD!`);
    });
  }

  function setupAlertEventListeners() {
    // 1. Copy Zalo Button on Banner
    const btnCopyZalo = document.getElementById('btnCopyZaloAlert');
    if (btnCopyZalo) btnCopyZalo.addEventListener('click', copyYesterdayZaloAlert);

    // 2. Open Modal Button
    const btnOpenAlert = document.getElementById('btnOpenAlertModal');
    if (btnOpenAlert) btnOpenAlert.addEventListener('click', () => openYesterdayAlertModal('ALL'));

    // 3. Chip Clicks
    const chipCll = document.getElementById('chipAlertCll');
    if (chipCll) chipCll.addEventListener('click', () => openYesterdayAlertModal('CLL'));

    const chipLate = document.getElementById('chipAlertLate');
    if (chipLate) chipLate.addEventListener('click', () => openYesterdayAlertModal('LATE'));

    const chipRt = document.getElementById('chipAlertRt');
    if (chipRt) chipRt.addEventListener('click', () => openYesterdayAlertModal('HIGH_RT'));

    const chipEmp = document.getElementById('chipAlertEmp');
    if (chipEmp) chipEmp.addEventListener('click', () => openYesterdayAlertModal('ALL'));

    // 4. Date Selection Change
    const dateSelect = document.getElementById('alertDateSelect');
    if (dateSelect) {
      dateSelect.addEventListener('change', (e) => {
        activeAlertDate = e.target.value;
        updateAlertBanner(activeAlertDate);
        renderTable(); // Update badges in table for the selected date
        window.showDashboardToast(`📅 Đã chuyển sang soát sự cố ngày: ${activeAlertDate}`);
      });
    }

    // 5. Modal Close Buttons
    const btnClose = document.getElementById('btnCloseAlertModal');
    if (btnClose) btnClose.addEventListener('click', closeYesterdayAlertModal);

    const btnCloseFooter = document.getElementById('btnCloseAlertModalFooter');
    if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeYesterdayAlertModal);

    const modalBackdrop = document.getElementById('yesterdayAlertModalBackdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeYesterdayAlertModal();
      });
    }

    // 6. Search Input in Modal
    const searchInput = document.getElementById('alertModalSearchInput');
    const clearBtn = document.getElementById('alertModalSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        if (clearBtn) clearBtn.style.display = e.target.value ? 'block' : 'none';
        renderAlertModalRows();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        clearBtn.style.display = 'none';
        renderAlertModalRows();
      });
    }

    // 7. Type Filter Pills in Modal
    const typePills = document.querySelectorAll('#alertTypeFilterGroup .btn-pill');
    typePills.forEach(pill => {
      pill.addEventListener('click', () => {
        typePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentAlertTypeFilter = pill.dataset.type || 'ALL';
        renderAlertModalRows();
      });
    });

    // 8. Copy SHD, Copy Zalo, Export CSV in Modal
    const btnCopyShd = document.getElementById('btnCopyAlertModalShd');
    if (btnCopyShd) btnCopyShd.addEventListener('click', copyAlertModalShdList);

    const btnCopyZaloInside = document.getElementById('btnCopyAlertZaloInsideModal');
    if (btnCopyZaloInside) btnCopyZaloInside.addEventListener('click', copyYesterdayZaloAlert);

    const btnExportCsv = document.getElementById('btnExportAlertModalCsv');
    if (btnExportCsv) btnExportCsv.addEventListener('click', exportAlertModalCsv);
  }

  // ==========================================================================
  // SHEET CLL TABLE SYSTEM - RENDER & INTERACTION
  // ==========================================================================
  function renderCllSheetTable() {
    const card = document.getElementById('cllTableCard');
    if (!card) return;

    const cllData = appData && appData.cll_table;
    if (!cllData || !cllData.rows || cllData.rows.length === 0) {
      card.style.display = 'none';
      return;
    }
    card.style.display = 'block';

    const tDate = cllData.target_date || '--/--/----';
    const dateBadge = document.getElementById('cllTargetDateBadge');
    if (dateBadge) dateBadge.textContent = `Ngày T-1: ${tDate}`;

    const total = cllData.total || {};
    const teamBadge = document.getElementById('cllTeamStatusBadge');
    if (teamBadge) {
      if (total.status === 'danger') {
        teamBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        teamBadge.style.color = '#f87171';
        teamBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        teamBadge.textContent = `Vượt Trần (${total.rate_cll || '0%'} > 7%)`;
      } else if (total.status === 'warning') {
        teamBadge.style.background = 'rgba(245, 158, 11, 0.2)';
        teamBadge.style.color = '#fbbf24';
        teamBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        teamBadge.textContent = `Cảnh Báo (${total.rate_cll || '0%'})`;
      } else {
        teamBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        teamBadge.style.color = '#34d399';
        teamBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        teamBadge.textContent = `Đạt Chuẩn (${total.rate_cll || '0%'} ≤ 6%)`;
      }
    }

    // Update mini ribbon
    const ribLuyKe = document.getElementById('cllRibLuyKe');
    if (ribLuyKe) ribLuyKe.textContent = `${total.cll2_luyke || 0} (L2) / ${total.cll3_luyke || 0} (L3)`;

    const ribTongHt = document.getElementById('cllRibTongHt');
    if (ribTongHt) ribTongHt.textContent = `${total.tong_ht || 0} ca`;

    const ribTyLe = document.getElementById('cllRibTyLe');
    if (ribTyLe) {
      ribTyLe.textContent = total.rate_cll || '0.00%';
      ribTyLe.style.color = (total.rate_cll_val > 7.0) ? '#ef4444' : ((total.rate_cll_val >= 6.0) ? '#f59e0b' : '#10b981');
    }

    const ribT1 = document.getElementById('cllRibT1');
    if (ribT1) {
      ribT1.textContent = `${total.t1_cll_total || 0} ca (${total.t1_cll2 || 0} L2, ${total.t1_cll3 || 0} L3)`;
      ribT1.style.color = (total.t1_cll_total > 0) ? '#f59e0b' : '#10b981';
    }

    // Render Table Body
    const tbody = document.getElementById('cllTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    cllData.rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.className = r.status === 'danger' ? 'row-danger' : (r.status === 'warning' ? 'row-warning' : '');

      const t1L2Badge = r.t1_cll2 > 0 
        ? `<span class="cll-pill-badge cll-pill-danger" title="${r.t1_cases && r.t1_cases.length ? r.t1_cases.map(c=>c.shd).join(', ') : ''}">+${r.t1_cll2}</span>` 
        : `<span class="cll-pill-zero">0</span>`;
      const t1L3Badge = r.t1_cll3 > 0 
        ? `<span class="cll-pill-badge cll-pill-danger">+${r.t1_cll3}</span>` 
        : `<span class="cll-pill-zero">0</span>`;

      const cll2LkBadge = r.cll2_luyke > 0 ? `<span class="cll-pill-badge cll-pill-warning">${r.cll2_luyke}</span>` : `<span class="cll-pill-zero">0</span>`;
      const cll3LkBadge = r.cll3_luyke > 0 ? `<span class="cll-pill-badge cll-pill-danger">${r.cll3_luyke}</span>` : `<span class="cll-pill-zero">0</span>`;

      let rateBadgeClass = 'cll-pill-success';
      if (r.status === 'danger') rateBadgeClass = 'cll-pill-danger';
      else if (r.status === 'warning') rateBadgeClass = 'cll-pill-warning';

      let neededHtml = '<span class="cll-needed-ok">✅ Đạt</span>';
      if (r.needed_for_7 > 0) {
        neededHtml = `<span class="cll-needed-positive" title="Cần hoàn tất thêm ${r.needed_for_7} ca để tỷ lệ lặp về ≤ 7%">+${r.needed_for_7} ca</span>`;
      }

      let statusBadge = `<span class="kpi-tag tag-pass">Đạt</span>`;
      if (r.status === 'danger') statusBadge = `<span class="kpi-tag tag-danger">Vượt trần</span>`;
      else if (r.status === 'warning') statusBadge = `<span class="kpi-tag tag-warning">Cảnh báo</span>`;

      const sName = r.short_name || r.name.replace('PNC01.', '');
      const fName = r.name || r.emp || '';

      tr.innerHTML = `
        <td class="sticky-col col-emp">
          <div class="emp-cell">
            <span class="emp-avatar ${r.status === 'danger' ? 'avatar-danger' : ''}">${sName.substring(0, 2).toUpperCase()}</span>
            <div class="emp-details">
              <span class="emp-name" style="cursor: pointer; font-weight: 700;" onclick="openEmpDossierModal('${sName}', 'CLL', event)">${sName}</span>
              <span class="emp-sub">${fName}</span>
            </div>
          </div>
        </td>
        <td style="color: var(--text-secondary); font-size: 12px;">${r.block || '-'}</td>
        <td style="text-align: center;">${cll2LkBadge}</td>
        <td style="text-align: center;">${cll3LkBadge}</td>
        <td style="text-align: center; font-weight: 600;">${r.tong_ht}</td>
        <td style="text-align: center;">
          <span class="cll-pill-badge ${rateBadgeClass}">${r.rate_cll}</span>
        </td>
        <td style="text-align: center; background: rgba(245, 158, 11, 0.04);">${t1L2Badge}</td>
        <td style="text-align: center; background: rgba(245, 158, 11, 0.04);">${t1L3Badge}</td>
        <td style="text-align: center; font-size: 12px; color: ${r.rate_cll3_val > 0.5 ? '#ef4444' : 'var(--text-muted)'};">${r.rate_cll3}</td>
        <td style="text-align: center;">${neededHtml}</td>
        <td style="text-align: center;">${statusBadge}</td>
      `;
      tbody.appendChild(tr);
    });

    // Render Table Foot (Team Total)
    const tfoot = document.getElementById('cllTableFoot');
    if (!tfoot) return;
    tfoot.innerHTML = `
      <tr class="total-row">
        <td class="sticky-col col-emp" style="font-weight: 800; color: #f8fafc;">
          ⭐ ${total.name || 'TỔNG CỘNG'}
        </td>
        <td style="font-weight: 700; color: #94a3b8;">${total.block || '16 KTV'}</td>
        <td style="text-align: center; font-weight: 700; color: #f59e0b;">${total.cll2_luyke || 0}</td>
        <td style="text-align: center; font-weight: 700; color: #ef4444;">${total.cll3_luyke || 0}</td>
        <td style="text-align: center; font-weight: 800; color: #38bdf8;">${total.tong_ht || 0}</td>
        <td style="text-align: center;">
          <span class="cll-pill-badge ${total.status === 'danger' ? 'cll-pill-danger' : (total.status === 'warning' ? 'cll-pill-warning' : 'cll-pill-success')}" style="font-size: 13px; padding: 4px 10px;">
            ${total.rate_cll || '0.00%'}
          </span>
        </td>
        <td style="text-align: center; font-weight: 800; color: #f59e0b; background: rgba(245, 158, 11, 0.08);">
          ${total.t1_cll2 > 0 ? '+' + total.t1_cll2 : 0}
        </td>
        <td style="text-align: center; font-weight: 800; color: #ef4444; background: rgba(245, 158, 11, 0.08);">
          ${total.t1_cll3 > 0 ? '+' + total.t1_cll3 : 0}
        </td>
        <td style="text-align: center; font-weight: 600; color: #94a3b8;">${total.rate_cll3 || '0.00%'}</td>
        <td style="text-align: center; font-weight: 600; color: #10b981;">
          ${total.needed_for_7 > 0 ? '+' + total.needed_for_7 + ' ca' : '✅ Đạt'}
        </td>
        <td style="text-align: center;">
          <span class="kpi-tag ${total.status === 'danger' ? 'tag-danger' : (total.status === 'warning' ? 'tag-warning' : 'tag-pass')}">
            ${total.status === 'danger' ? 'Chưa Đạt' : 'Đạt Chuẩn'}
          </span>
        </td>
      </tr>
    `;
  }

  function copyCllZaloReport() {
    const cllData = appData && appData.cll_table;
    if (!cllData || !cllData.rows) {
      window.showDashboardToast('⚠️ Không có dữ liệu Sheet CLL');
      return;
    }
    const tDate = cllData.target_date || '';
    const tot = cllData.total || {};
    const lines = [
      `🔁 [BÁO CÁO THỐNG KÊ SHEET CLL] - ĐỘI ĐỖ VĂN TIÊN`,
      `📅 Ngày soát lỗi T-1: ${tDate}`,
      `📊 Tổng kết toàn đội:`,
      `  • CLL Lũy kế L2/L3: ${tot.cll2_luyke || 0} ca L2 | ${tot.cll3_luyke || 0} ca L3`,
      `  • Tổng hoàn tất: ${tot.tong_ht || 0} ca`,
      `  • Tỷ lệ CLL toàn đội: ${tot.rate_cll || '0.00%'} (Trần chuẩn ≤ 7.0%)`,
      `  • Phát sinh ngày T-1: ${tot.t1_cll_total || 0} ca (L2: ${tot.t1_cll2 || 0} ca | L3: ${tot.t1_cll3 || 0} ca)`,
      `-----------------------------------------`,
      `🚨 Chi tiết nhân sự có ca CLL hoặc tỷ lệ vượt trần:`
    ];

    const flagged = cllData.rows.filter(r => r.cll2_luyke > 0 || r.cll3_luyke > 0 || r.t1_cll2 > 0 || r.t1_cll3 > 0 || r.status === 'danger');
    if (flagged.length === 0) {
      lines.push(`🎉 Tuyệt vời! Không có KTV nào phát sinh CLL.`);
    } else {
      flagged.forEach((r, idx) => {
        let line = `${idx + 1}. 👤 ${r.name}: ${r.rate_cll} (CLL2: ${r.cll2_luyke}, Tổng HT: ${r.tong_ht})`;
        if (r.t1_cll2 > 0 || r.t1_cll3 > 0) {
          line += ` ⚠️ Ngày T-1 phát sinh: +${r.t1_cll2 + r.t1_cll3} ca!`;
        }
        if (r.needed_for_7 > 0) {
          line += ` [Cần bù +${r.needed_for_7} ca để đạt trần]`;
        }
        lines.push(line);
      });
    }
    lines.push(`-----------------------------------------`);
    lines.push(`👉 Các bạn KTV phát sinh ca CLL ngày ${tDate} lưu ý giải trình nguyên nhân xử lý!`);

    const fullMsg = lines.join('\n');
    navigator.clipboard.writeText(fullMsg).then(() => {
      window.showDashboardToast('📋 Đã sao chép Báo cáo CLL vào bộ nhớ tạm để gửi Zalo!');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = fullMsg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      window.showDashboardToast('📋 Đã sao chép Báo cáo CLL vào bộ nhớ tạm!');
    });
  }

  function setupCllTableEventListeners() {
    const btnCopyZalo = document.getElementById('btnCopyZaloCll');
    if (btnCopyZalo) btnCopyZalo.addEventListener('click', copyCllZaloReport);

    const btnCapture = document.getElementById('btnCaptureCllTable');
    if (btnCapture) {
      btnCapture.addEventListener('click', () => {
        const tableCard = document.getElementById('cllTableCard');
        if (!tableCard) return;
        if (typeof html2canvas === 'function') {
          window.showDashboardToast('⏳ Đang chụp ảnh Bảng Sheet CLL...');
          html2canvas(tableCard, { scale: 2, backgroundColor: '#0f172a' }).then(canvas => {
            canvas.toBlob(blob => {
              if (navigator.clipboard && navigator.clipboard.write) {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(() => {
                  window.showDashboardToast('📸 Đã chụp và sao chép ảnh Bảng CLL vào clipboard! Hãy dán (Ctrl+V) vào Zalo.');
                }).catch(() => {
                  downloadCanvasImage(canvas, 'Bang_Sheet_CLL.png');
                });
              } else {
                downloadCanvasImage(canvas, 'Bang_Sheet_CLL.png');
              }
            });
          }).catch(err => {
            console.error('Lỗi chụp ảnh:', err);
            window.showDashboardToast('⚠️ Không thể chụp ảnh tự động.');
          });
        } else {
          window.showDashboardToast('📸 Vui lòng dùng phím tắt Win+Shift+S để chụp bảng CLL!');
        }
      });
    }
  }

  function downloadCanvasImage(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    window.showDashboardToast('📥 Đã tải ảnh Bảng CLL về máy!');
  }

  // ==========================================================================
  // MASTER TECHNICIAN ERROR DOSSIER SYSTEM
  // ==========================================================================

  function getEmpScoreData(emp) {
    if (!emp) return { score: 0, status: 'DANGER', statusText: 'CHƯA ĐẠT', badgeClass: 'rate-danger' };

    const p_on_time = emp.on_time_rate >= 98.0;
    const p_cll = emp.cll_rate <= 6.0;
    const cll3Val = (emp.cll3_rate !== null && emp.cll3_rate !== undefined) ? emp.cll3_rate : 0.0;
    const p_cll3 = cll3Val <= 0.5;
    const p_7n = emp.cl_7n_total_rate <= 2.5;
    const p_rt_tk = emp.repontime_tk <= 18.0;
    const p_rt_bt = emp.repontime_bt <= 9.0;
    const p_csat = emp.csat <= 0;

    const score = (emp.kpi_score !== undefined) ? emp.kpi_score :
      ([p_on_time, p_cll, p_cll3, p_7n, p_rt_tk, p_rt_bt, p_csat].filter(Boolean).length);

    let status = 'DANGER';
    let statusText = 'CHƯA ĐẠT';
    let badgeClass = 'rate-danger';
    if (score >= 5) {
      status = 'PASS';
      statusText = 'ĐẠT';
      badgeClass = 'rate-success';
    } else if (score === 4) {
      status = 'WARNING';
      statusText = 'CẢNH BÁO';
      badgeClass = 'rate-warning';
    }

    return {
      score,
      status,
      statusText,
      badgeClass,
      passes: {
        on_time: p_on_time,
        cll: p_cll,
        cll3: p_cll3,
        seven_n: p_7n,
        rt_tk: p_rt_tk,
        rt_bt: p_rt_bt,
        csat: p_csat
      }
    };
  }

  function getAllIssuesForEmployee(empIdentifier) {
    let emp = null;
    if (typeof empIdentifier === 'object' && empIdentifier !== null) {
      emp = empIdentifier;
    } else if (appData && appData.employees) {
      emp = appData.employees.find(e =>
        String(e.id) === String(empIdentifier) ||
        e.name === empIdentifier ||
        e.name.toUpperCase().replace('PNC01.', '').trim() === String(empIdentifier).toUpperCase().replace('PNC01.', '').trim()
      );
    }

    if (!emp) {
      return {
        cases: [],
        counts: { total: 0, late: 0, high_rt: 0, cll: 0, seven_n: 0, overdue: 0 },
        penaltyScore: 0
      };
    }

    const empShort = emp.name.toUpperCase().replace('PNC01.', '').trim();
    const cases = [];
    const seen = new Set();

    function addCase(item) {
      const shd = (item.shd || '').trim().toUpperCase();
      // Chuẩn hóa nhóm lỗi để không bao giờ bị trùng 1 HĐ trong cùng 1 nhóm lỗi (ví dụ LATE_TKM và LATE)
      const baseCat = item.category.startsWith('LATE') ? 'LATE' : item.category;
      const key = `${shd}_${baseCat}`;
      if (shd && shd !== '-' && seen.has(key)) {
        // Cập nhật thông tin chi tiết hơn nếu mục mới có ngày, giờ hoặc ghi chú rõ ràng hơn
        const existing = cases.find(c => (c.shd || '').trim().toUpperCase() === shd && (c.category.startsWith('LATE') ? 'LATE' : c.category) === baseCat);
        if (existing) {
          if (!existing.note || existing.note === '-' || existing.note.includes('hoàn tất trong ngày')) {
            if (item.note && item.note !== '-') existing.note = item.note;
          }
          if (!existing.time || existing.time === '-') {
            if (item.time && item.time !== '-') existing.time = item.time;
          }
          if (!existing.date && item.date) existing.date = item.date;
          if (item.category === 'LATE_TKM' || item.category === 'LATE_BT') {
            existing.category = item.category;
            existing.typeBadge = item.typeBadge;
            existing.service = item.service;
          }
        }
        return;
      }
      if (shd && shd !== '-') seen.add(key);
      cases.push(item);
    }

    // 1. Scan yesterday alerts by date
    if (appData && appData.yesterday_alerts && appData.yesterday_alerts.cases_by_date) {
      const dates = Object.keys(appData.yesterday_alerts.cases_by_date);
      dates.forEach(d => {
        const list = appData.yesterday_alerts.cases_by_date[d] || [];
        list.forEach(c => {
          const cEmp = (c.emp || '').toUpperCase().replace('PNC01.', '').trim();
          if (cEmp === empShort || (empShort && cEmp.includes(empShort))) {
            let cat = 'OTHER';
            let badge = '';
            if (c.issue_type === 'LATE' || c.issue_type === 'LATE_TKM' || c.issue_type === 'LATE_BT') {
              const isTkm = (c.service === 'TKM' || (c.service && c.service.includes('TK')) || c.issue_type === 'LATE_TKM');
              cat = isTkm ? 'LATE_TKM' : 'LATE_BT';
              badge = isTkm ? '❌ Trễ Hẹn TKM' : '⚠️ Trễ Hẹn BT';
            } else if (c.issue_type === 'HIGH_RT') {
              cat = 'HIGH_RT';
              badge = `⏱️ RT Cao ${c.service || ''}`;
            } else if (c.issue_type === 'CLL') {
              cat = 'CLL';
              badge = `🔁 CLL (L${c.so_lan_lap || 2})`;
            } else if (c.issue_type === '7N') {
              cat = 'SEVEN_N';
              badge = `📦 7N ${c.service || ''}`;
            }

            addCase({
              category: cat,
              type: c.issue_type,
              typeBadge: badge,
              service: c.service || 'BT',
              shd: c.shd || '-',
              kh: c.kh || '-',
              date: d,
              time: c.hoantat || d,
              rt: c.rt || null,
              so_lan_lap: c.so_lan_lap || null,
              severity: c.severity || 'normal',
              note: c.note || c.issue_title || 'Sự cố hoàn tất trong ngày'
            });
          }
        });
      });
    }

    // 2. Scan emp.details
    if (emp.details) {
      // Late TKM
      if (Array.isArray(emp.details.late_tkm)) {
        emp.details.late_tkm.forEach(c => {
          addCase({
            category: 'LATE_TKM',
            type: 'LATE_TKM',
            typeBadge: '❌ Trễ Hẹn TKM',
            service: 'TKM',
            shd: c.shd || '-',
            kh: c.kh || '-',
            date: c.ngay_hoantat ? c.ngay_hoantat.split(' ')[0] : '',
            time: c.ngay_hoantat || c.thoigian || '-',
            rt: null,
            so_lan_lap: null,
            severity: 'danger',
            note: c.note || c.ghichu || 'Trễ hẹn Triển khai mới (TKM)'
          });
        });
      }

      // Late BT
      if (Array.isArray(emp.details.late_bt)) {
        emp.details.late_bt.forEach(c => {
          addCase({
            category: 'LATE_BT',
            type: 'LATE_BT',
            typeBadge: '⚠️ Trễ Hẹn BT',
            service: 'BT',
            shd: c.shd || '-',
            kh: c.kh || '-',
            date: c.ngay_hoantat ? c.ngay_hoantat.split(' ')[0] : '',
            time: c.ngay_hoantat || c.thoigian || '-',
            rt: null,
            so_lan_lap: null,
            severity: 'warning',
            note: c.note || c.ghichu || 'Trễ hẹn Bảo trì (BT)'
          });
        });
      }

      // CLL
      if (Array.isArray(emp.details.cll)) {
        emp.details.cll.forEach(c => {
          addCase({
            category: 'CLL',
            type: 'CLL',
            typeBadge: `🔁 CLL (L${c.solanlap || c.so_lan_lap || 2})`,
            service: 'BT',
            shd: c.shd || '-',
            kh: c.kh || '-',
            date: '',
            time: c.thoigian || c.ngay_hoantat || '-',
            rt: null,
            so_lan_lap: c.solanlap || c.so_lan_lap || 2,
            severity: 'danger',
            note: c.ghichu || c.note || 'Checklist lặp lại nhiều lần'
          });
        });
      }

      // 7 Days
      const sevenList = Array.isArray(emp.details.seven_n) ? emp.details.seven_n : (Array.isArray(emp.details.cl_7n_total) ? emp.details.cl_7n_total : []);
      sevenList.forEach(c => {
        const srv = (c.loai_7n && c.loai_7n.includes('Triển Khai')) || (c.loai && c.loai.toUpperCase().includes('TK')) ? 'TK' : 'BT';
        addCase({
          category: 'SEVEN_N',
          type: '7N',
          typeBadge: `📦 Checklist 7N (${srv})`,
          service: srv,
          shd: c.shd || '-',
          kh: c.kh || '-',
          date: '',
          time: c.thoigian || c.ngay_hoantat || '-',
          rt: null,
          so_lan_lap: null,
          severity: 'warning',
          note: c.ghichu || c.note || 'Phát sinh bảo trì trong 7 ngày'
        });
      });

      // Overdue 72h
      const overdue72List = Array.isArray(emp.details.overdue_72h) ? emp.details.overdue_72h : (Array.isArray(emp.details.tk_over_72h) ? emp.details.tk_over_72h : []);
      overdue72List.forEach(c => {
        addCase({
          category: 'OVERDUE',
          type: 'TK_72H',
          typeBadge: '⏳ Tồn Đọng TK > 72h',
          service: 'TK',
          shd: c.shd || '-',
          kh: c.kh || '-',
          date: '',
          time: c.thoigian || c.ngay_hoantat || '-',
          rt: null,
          so_lan_lap: null,
          severity: 'danger',
          note: c.ghichu || c.note || 'Quá hạn 72h triển khai'
        });
      });

      // Overdue 24h
      const overdue24List = Array.isArray(emp.details.overdue_24h) ? emp.details.overdue_24h : (Array.isArray(emp.details.bt_over_24h) ? emp.details.bt_over_24h : []);
      overdue24List.forEach(c => {
        addCase({
          category: 'OVERDUE',
          type: 'BT_24H',
          typeBadge: '⏳ Tồn Đọng BT > 24h',
          service: 'BT',
          shd: c.shd || '-',
          kh: c.kh || '-',
          date: '',
          time: c.thoigian || c.ngay_hoantat || '-',
          rt: null,
          so_lan_lap: null,
          severity: 'danger',
          note: c.ghichu || c.note || 'Quá hạn 24h bảo trì'
        });
      });
    }

    // 3. Cross-reference team_total details
    if (appData && appData.team_total && appData.team_total.details) {
      const td = appData.team_total.details;
      ['cll', 'seven_n', 'cl_7n_total', 'overdue_72h', 'tk_over_72h', 'overdue_24h', 'bt_over_24h', 'late_tkm', 'late_bt'].forEach(catKey => {
        const list = td[catKey] || [];
        list.forEach(c => {
          const empMatch = (c.emp_name || '').toUpperCase().replace('PNC01.', '').trim();
          const note = (c.ghichu || c.note || '').toUpperCase();
          const kh = (c.kh || '').toUpperCase();
          if (empShort && (empMatch === empShort || note.includes(empShort) || kh.includes(empShort))) {
            let cat = 'OTHER';
            let badge = '';
            let srv = 'BT';
            if (catKey === 'cll') {
              cat = 'CLL';
              badge = `🔁 CLL (L${c.solanlap || c.so_lan_lap || 2})`;
            } else if (catKey === 'seven_n' || catKey === 'cl_7n_total') {
              cat = 'SEVEN_N';
              srv = (c.loai_7n && c.loai_7n.includes('Triển Khai')) || (c.loai && c.loai.toUpperCase().includes('TK')) ? 'TK' : 'BT';
              badge = `📦 Checklist 7N (${srv})`;
            } else if (catKey === 'overdue_72h' || catKey === 'tk_over_72h') {
              cat = 'OVERDUE';
              srv = 'TK';
              badge = '⏳ Tồn Đọng TK > 72h';
            } else if (catKey === 'overdue_24h' || catKey === 'bt_over_24h') {
              cat = 'OVERDUE';
              badge = '⏳ Tồn Đọng BT > 24h';
            } else if (catKey === 'late_tkm') {
              cat = 'LATE_TKM';
              srv = 'TKM';
              badge = '❌ Trễ Hẹn TKM';
            } else if (catKey === 'late_bt') {
              cat = 'LATE_BT';
              srv = 'BT';
              badge = '⚠️ Trễ Hẹn BT';
            }
            addCase({
              category: cat,
              type: catKey,
              typeBadge: badge,
              service: srv,
              shd: c.shd || '-',
              kh: c.kh || '-',
              date: '',
              time: c.thoigian || c.ngay_hoantat || '-',
              rt: null,
              so_lan_lap: c.solanlap || c.so_lan_lap || null,
              severity: (cat === 'SEVEN_N' || cat === 'LATE_BT') ? 'warning' : 'danger',
              note: c.ghichu || c.note || ''
            });
          }
        });
      });
    }

    // 4. Summarize and count
    const countLateTkm = cases.filter(c => c.category === 'LATE_TKM' || (c.category === 'LATE' && (c.service === 'TKM' || (c.service && c.service.includes('TK'))))).length;
    const countLateBt = cases.filter(c => c.category === 'LATE_BT' || (c.category === 'LATE' && c.service === 'BT')).length;
    const countLate = countLateTkm + countLateBt;
    const countRt = cases.filter(c => c.category === 'HIGH_RT').length;
    const countCll = cases.filter(c => c.category === 'CLL').length;
    const count7n = cases.filter(c => c.category === 'SEVEN_N').length;
    const countOverdue = cases.filter(c => c.category === 'OVERDUE').length;

    // Penalty score for sorting most problematic technicians to top
    const penaltyScore = (countLateTkm * 4) + (countLateBt * 3) + (countRt * 2) + (countCll * 4) + (count7n * 1.5) + (countOverdue * 3) +
      (emp.on_time_rate < 98.0 ? (98.0 - emp.on_time_rate) * 0.8 : 0);

    return {
      emp,
      cases,
      counts: {
        total: cases.length,
        late: countLate,
        late_tkm: countLateTkm,
        late_bt: countLateBt,
        high_rt: countRt,
        cll: countCll,
        seven_n: count7n,
        overdue: countOverdue
      },
      penaltyScore
    };
  }

  function renderEmpLookupSection() {
    if (!appData || !appData.employees) return;

    const quickSelect = document.getElementById('empQuickSelect');
    if (quickSelect) {
      const curVal = quickSelect.value;
      quickSelect.innerHTML = '<option value="">-- Chọn nhanh KTV để xem chi tiết lỗi --</option>' +
        appData.employees.map(e => {
          const iss = getAllIssuesForEmployee(e);
          const s = getEmpScoreData(e);
          const shortName = e.name.replace('PNC01.', '');
          const issBadge = iss.counts.total > 0 ? `🚨 ${iss.counts.total} lỗi` : `✨ 0 lỗi`;
          return `<option value="${e.id}">${shortName} - ${s.score}/7 Đạt (${issBadge})</option>`;
        }).join('');
      quickSelect.value = curVal;
    }

    renderEmpChips('ALL');
  }

  function renderEmpChips(filter = 'ALL') {
    const container = document.getElementById('empChipsContainer');
    if (!container || !appData || !appData.employees) return;

    let emps = [...appData.employees];
    if (filter === 'HAS_ISSUES') {
      emps = emps.filter(e => getAllIssuesForEmployee(e).counts.total > 0);
    } else if (filter === 'FAIL_KPI') {
      emps = emps.filter(e => getEmpScoreData(e).score < 5);
    }

    if (emps.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 6px 12px;">Không có nhân sự nào trong nhóm bộ lọc này.</div>`;
      return;
    }

    container.innerHTML = emps.map(e => {
      const iss = getAllIssuesForEmployee(e);
      const s = getEmpScoreData(e);
      const shortName = e.name.replace('PNC01.', '');
      const initials = shortName.slice(0, 2).toUpperCase();
      const hasIssues = iss.counts.total > 0;
      const countPillClass = hasIssues ? 'chip-count-danger' : 'chip-count-ok';
      const countPillText = hasIssues ? `${iss.counts.total} lỗi` : `0 lỗi`;
      const isActive = currentDossierEmp && String(currentDossierEmp.id) === String(e.id);

      return `
        <div class="emp-chip-item ${hasIssues ? 'has-issues' : ''} ${isActive ? 'active' : ''}" 
             onclick="window.openEmpDossierModal('${e.id}', 'ALL', event)" 
             title="Nhấp để mở trọn bộ hồ sơ lỗi của ${shortName}">
          <div class="chip-avatar-sm">${initials}</div>
          <span class="chip-name-sm">${shortName}</span>
          <span class="chip-count-pill ${countPillClass}">${countPillText}</span>
        </div>
      `;
    }).join('');
  }

  function renderEmpIssuesSection() {
    if (!appData || !appData.employees) return;

    // 1. Calculate overall issue statistics
    let totalLate = 0;
    let totalLateTkm = 0;
    let totalLateBt = 0;
    let totalRt = 0;
    let totalCll = 0;
    let total7n = 0;
    let empsWithIssues = 0;
    let grandTotalIssues = 0;

    const empIssueMap = new Map();
    appData.employees.forEach(e => {
      const iss = getAllIssuesForEmployee(e);
      const score = getEmpScoreData(e);
      empIssueMap.set(e.id, { iss, score });

      totalLate += iss.counts.late;
      totalLateTkm += (iss.counts.late_tkm || 0);
      totalLateBt += (iss.counts.late_bt || 0);
      totalRt += iss.counts.high_rt;
      totalCll += iss.counts.cll;
      total7n += iss.counts.seven_n;
      grandTotalIssues += iss.counts.total;
      if (iss.counts.total > 0) empsWithIssues++;
    });

    // Update Overview Header
    const badgeTotal = document.getElementById('summaryTotalIssuesBadge');
    if (badgeTotal) badgeTotal.textContent = `${grandTotalIssues} Ca Sự Cố`;

    const ovLate = document.getElementById('ovLateVal'); if (ovLate) ovLate.textContent = totalLate;
    const ovLateTkm = document.getElementById('ovLateTkmVal'); if (ovLateTkm) ovLateTkm.textContent = totalLateTkm;
    const ovLateBt = document.getElementById('ovLateBtVal'); if (ovLateBt) ovLateBt.textContent = totalLateBt;
    const ovRt = document.getElementById('ovRtVal'); if (ovRt) ovRt.textContent = totalRt;
    const ovCll = document.getElementById('ovCllVal'); if (ovCll) ovCll.textContent = totalCll;
    const ov7n = document.getElementById('ov7nVal'); if (ov7n) ov7n.textContent = total7n;
    const ovEmp = document.getElementById('ovEmpVal'); if (ovEmp) ovEmp.textContent = `${empsWithIssues} / ${appData.employees.length}`;

    // Update filter counts
    const bAll = document.getElementById('badgeIssuesAll'); if (bAll) bAll.textContent = appData.employees.length;
    const bHasErrors = document.getElementById('badgeIssuesHasErrors'); if (bHasErrors) bHasErrors.textContent = empsWithIssues;
    const bLate = document.getElementById('badgeIssuesLate'); if (bLate) bLate.textContent = appData.employees.filter(e => empIssueMap.get(e.id).iss.counts.late > 0).length;
    const bLateTkm = document.getElementById('badgeIssuesLateTkm'); if (bLateTkm) bLateTkm.textContent = appData.employees.filter(e => (empIssueMap.get(e.id).iss.counts.late_tkm || 0) > 0).length;
    const bLateBt = document.getElementById('badgeIssuesLateBt'); if (bLateBt) bLateBt.textContent = appData.employees.filter(e => (empIssueMap.get(e.id).iss.counts.late_bt || 0) > 0).length;
    const bRt = document.getElementById('badgeIssuesRt'); if (bRt) bRt.textContent = appData.employees.filter(e => empIssueMap.get(e.id).iss.counts.high_rt > 0).length;
    const bCll = document.getElementById('badgeIssuesCll'); if (bCll) bCll.textContent = appData.employees.filter(e => (empIssueMap.get(e.id).iss.counts.cll > 0 || empIssueMap.get(e.id).iss.counts.seven_n > 0)).length;
    const bFailKpi = document.getElementById('badgeIssuesFailKpi'); if (bFailKpi) bFailKpi.textContent = appData.employees.filter(e => empIssueMap.get(e.id).score.score < 5).length;

    // 2. Filter employees
    let list = [...appData.employees];
    if (currentIssuesModeFilter === 'HAS_ISSUES') {
      list = list.filter(e => empIssueMap.get(e.id).iss.counts.total > 0);
    } else if (currentIssuesModeFilter === 'HAS_LATE') {
      list = list.filter(e => empIssueMap.get(e.id).iss.counts.late > 0);
    } else if (currentIssuesModeFilter === 'HAS_LATE_TKM') {
      list = list.filter(e => (empIssueMap.get(e.id).iss.counts.late_tkm || 0) > 0);
    } else if (currentIssuesModeFilter === 'HAS_LATE_BT') {
      list = list.filter(e => (empIssueMap.get(e.id).iss.counts.late_bt || 0) > 0);
    } else if (currentIssuesModeFilter === 'HAS_RT') {
      list = list.filter(e => empIssueMap.get(e.id).iss.counts.high_rt > 0);
    } else if (currentIssuesModeFilter === 'HAS_CLL') {
      list = list.filter(e => (empIssueMap.get(e.id).iss.counts.cll > 0 || empIssueMap.get(e.id).iss.counts.seven_n > 0));
    } else if (currentIssuesModeFilter === 'FAIL_KPI') {
      list = list.filter(e => empIssueMap.get(e.id).score.score < 5);
    }

    // 3. Sort employees
    if (currentIssuesModeSort === 'ISSUES_DESC') {
      list.sort((a, b) => {
        const da = empIssueMap.get(a.id).iss;
        const db = empIssueMap.get(b.id).iss;
        return (db.penaltyScore - da.penaltyScore) || (db.counts.total - da.counts.total);
      });
    } else if (currentIssuesModeSort === 'SCORE_ASC') {
      list.sort((a, b) => (empIssueMap.get(a.id).score.score - empIssueMap.get(b.id).score.score));
    } else if (currentIssuesModeSort === 'ONTIME_ASC') {
      list.sort((a, b) => (a.on_time_rate - b.on_time_rate));
    } else if (currentIssuesModeSort === 'NAME_ASC') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    // 4. Render Grid
    const grid = document.getElementById('empIssuesGrid');
    if (!grid) return;

    if (list.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted); background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border-subtle);">
          🎉 Tuyệt vời! Không có nhân sự nào trong danh mục lọc này.
        </div>
      `;
      return;
    }

    grid.innerHTML = list.map(e => {
      const { iss, score } = empIssueMap.get(e.id);
      const shortName = e.name.replace('PNC01.', '');
      const initials = shortName.slice(0, 2).toUpperCase();
      const blockShort = e.block ? e.block.replace('Phuong ', 'P.').replace('Thanh pho ', 'TP.') : '-';

      let cardSev = 'card-severity-ok';
      if (iss.counts.total >= 4 || score.score < 4) cardSev = 'card-severity-danger';
      else if (iss.counts.total > 0 || score.score === 4) cardSev = 'card-severity-warning';

      // Summary Pills
      const pills = [];
      if ((iss.counts.late_tkm || 0) > 0) pills.push(`<span class="summary-pill pill-late">❌ ${iss.counts.late_tkm} Trễ TKM</span>`);
      if ((iss.counts.late_bt || 0) > 0) pills.push(`<span class="summary-pill pill-late" style="background: rgba(234, 88, 12, 0.2); border-color: rgba(234, 88, 12, 0.4); color: #fb923c;">⚠️ ${iss.counts.late_bt} Trễ BT</span>`);
      if (iss.counts.high_rt > 0) pills.push(`<span class="summary-pill pill-rt">⏱️ ${iss.counts.high_rt} RT Cao</span>`);
      if (iss.counts.cll > 0) pills.push(`<span class="summary-pill pill-cll">🔁 ${iss.counts.cll} CLL</span>`);
      if (iss.counts.seven_n > 0) pills.push(`<span class="summary-pill pill-7n">📦 ${iss.counts.seven_n} 7N</span>`);
      if (iss.counts.overdue > 0) pills.push(`<span class="summary-pill pill-late">⏳ ${iss.counts.overdue} Quá Hạn</span>`);
      if (pills.length === 0) pills.push(`<span class="summary-pill pill-clean">✨ Không phát sinh lỗi</span>`);

      // Top 3 preview tickets
      const previewTickets = iss.cases.slice(0, 3);
      let ticketsHtml = '';
      if (previewTickets.length > 0) {
        ticketsHtml = `
          <div class="card-tickets-preview">
            ${previewTickets.map(t => `
              <div class="card-ticket-item">
                <span class="ticket-shd-click" onclick="copyShdText('${t.shd}', event)" title="Nhấp copy SHD">${t.shd}</span>
                <span class="ticket-desc-text" title="${t.note || t.kh}">${t.note || t.kh}</span>
                ${t.rt ? `<span class="ticket-rt-text">${t.rt}h</span>` : `<span style="font-size: 11px; color: var(--text-muted);">${t.service}</span>`}
              </div>
            `).join('')}
            ${iss.cases.length > 3 ? `<div style="font-size: 11px; color: var(--accent-blue); text-align: right; margin-top: 4px; cursor: pointer;" onclick="window.openEmpDossierModal('${e.id}', 'ALL', event)">+ Xem thêm ${iss.cases.length - 3} ca khác...</div>` : ''}
          </div>
        `;
      } else {
        ticketsHtml = `
          <div class="card-tickets-preview" style="display: flex; align-items: center; justify-content: center; min-height: 52px; color: #6ee7b7; font-size: 12px;">
            🎉 Phong độ xuất sắc, không có sự cố nào!
          </div>
        `;
      }

      return `
        <div class="emp-issue-card ${cardSev}">
          <div class="card-top-row">
            <div class="card-emp-info">
              <div class="card-avatar">${initials}</div>
              <div>
                <div class="card-name-title">
                  <span>${shortName}</span>
                  <span class="badge-target-date" style="font-size: 10px; padding: 1px 6px;">Mã: ${e.id}</span>
                </div>
                <div class="card-block-sub">${blockShort}</div>
              </div>
            </div>
            <div>
              <span class="rate-pill ${score.badgeClass}" style="font-weight: 800; font-size: 12px;">${score.score}/7 Đạt</span>
            </div>
          </div>

          <div class="card-summary-pills">
            ${pills.join('')}
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 8px; padding: 4px 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
            <span>Đúng hẹn: <strong style="color: ${e.on_time_rate >= 98 ? '#10b981' : '#f87171'}">${e.on_time_rate.toFixed(1)}%</strong></span>
            <span>CLL: <strong style="color: ${e.cll_rate <= 6 ? '#10b981' : '#f87171'}">${e.cll_rate.toFixed(1)}%</strong></span>
            <span>RT BT: <strong style="color: ${e.repontime_bt <= 9 ? '#10b981' : '#f87171'}">${e.repontime_bt}h</strong></span>
          </div>

          ${ticketsHtml}

          <div class="card-footer-actions">
            <button class="btn-detail" onclick="window.openEmpDossierModal('${e.id}', 'ALL', event)">
              🔍 Mở Hồ Sơ Lỗi (${iss.counts.total})
            </button>
            <button class="btn-zalo-sm" onclick="window.copyEmpZaloReport('${e.id}', event)" title="Sao chép báo cáo cá nhân để gửi cho KTV qua Zalo">
              💬 Gửi Zalo
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function openEmpDossierModal(empIdOrName, initialCategory = 'ALL') {
    if (!appData || !appData.employees) return;

    const emp = appData.employees.find(e =>
      String(e.id) === String(empIdOrName) ||
      e.name === empIdOrName ||
      e.name.toUpperCase().replace('PNC01.', '').trim() === String(empIdOrName).toUpperCase().replace('PNC01.', '').trim()
    );

    if (!emp) {
      window.showDashboardToast('⚠️ Không tìm thấy nhân sự');
      return;
    }

    currentDossierEmp = emp;
    currentDossierCategory = initialCategory || 'ALL';

    const issData = getAllIssuesForEmployee(emp);
    const scoreData = getEmpScoreData(emp);
    currentDossierCases = issData.cases;

    // Update Header
    const shortName = emp.name.replace('PNC01.', '');
    const initials = shortName.slice(0, 2).toUpperCase();

    const avatar = document.getElementById('dossierAvatar'); if (avatar) avatar.textContent = initials;
    const nameEl = document.getElementById('dossierEmpName'); if (nameEl) nameEl.textContent = emp.name;
    const idEl = document.getElementById('dossierEmpId'); if (idEl) idEl.textContent = emp.id;
    const blockEl = document.getElementById('dossierEmpBlock'); if (blockEl) blockEl.textContent = emp.block || '-';

    const badgeScore = document.getElementById('dossierScoreBadge');
    if (badgeScore) {
      badgeScore.className = `dossier-score-badge rate-pill ${scoreData.badgeClass}`;
      badgeScore.textContent = `${scoreData.score}/7 ĐIỂM • ${scoreData.statusText}`;
    }

    const badgeIss = document.getElementById('dossierTotalIssuesBadge');
    if (badgeIss) {
      badgeIss.textContent = `${issData.counts.total} ca sự cố`;
    }

    // Update 7-KPI Strip
    renderDossierKpiStrip(emp);

    // Update Category Badges
    const cAll = document.getElementById('catCountAll'); if (cAll) cAll.textContent = issData.counts.total;
    const cLate = document.getElementById('catCountLate'); if (cLate) cLate.textContent = issData.counts.late;
    const cLateTkm = document.getElementById('catCountLateTkm'); if (cLateTkm) cLateTkm.textContent = issData.counts.late_tkm || 0;
    const cLateBt = document.getElementById('catCountLateBt'); if (cLateBt) cLateBt.textContent = issData.counts.late_bt || 0;
    const cRt = document.getElementById('catCountRt'); if (cRt) cRt.textContent = issData.counts.high_rt;
    const cCll = document.getElementById('catCountCll'); if (cCll) cCll.textContent = issData.counts.cll;
    const c7n = document.getElementById('catCount7N'); if (c7n) c7n.textContent = issData.counts.seven_n;
    const cOverdue = document.getElementById('catCountOverdue'); if (cOverdue) cOverdue.textContent = issData.counts.overdue;

    // Category Tabs Active State
    document.querySelectorAll('#dossierCategoryTabs .btn-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === currentDossierCategory);
    });

    // Reset search
    const searchInput = document.getElementById('dossierSearchInput');
    const searchClear = document.getElementById('dossierSearchClear');
    if (searchInput) searchInput.value = '';
    if (searchClear) searchClear.style.display = 'none';

    // Render Rows
    filterAndRenderDossierCases('');

    // Highlight chip in quick lookup
    document.querySelectorAll('.emp-chip-item').forEach(chip => {
      chip.classList.toggle('active', chip.textContent.includes(shortName));
    });

    // Show Modal
    const backdrop = document.getElementById('empDossierModalBackdrop');
    if (backdrop) backdrop.style.display = 'flex';
  }

  function closeEmpDossierModal() {
    const backdrop = document.getElementById('empDossierModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    currentDossierEmp = null;
    document.querySelectorAll('.emp-chip-item').forEach(chip => chip.classList.remove('active'));
  }

  function renderDossierKpiStrip(emp) {
    const ribbon = document.getElementById('dossierKpiRibbon');
    if (!ribbon || !emp) return;

    const s = getEmpScoreData(emp);
    const p = s.passes;
    const cll3Val = (emp.cll3_rate !== null && emp.cll3_rate !== undefined) ? emp.cll3_rate : 0.0;

    const items = [
      { label: 'Đúng Hẹn (≥98%)', val: `${emp.on_time_rate.toFixed(2)}%`, pass: p.on_time, cat: 'LATE' },
      { label: 'CLL (≤6%)', val: `${emp.cll_rate.toFixed(2)}%`, pass: p.cll, cat: 'CLL' },
      { label: 'CLL3 (≤0.5%)', val: `${cll3Val.toFixed(2)}%`, pass: p.cll3, cat: 'CLL' },
      { label: '7N Tổng (≤2.5%)', val: `${emp.cl_7n_total_rate.toFixed(2)}%`, pass: p.seven_n, cat: 'SEVEN_N' },
      { label: 'RT TK (≤18h)', val: `${emp.repontime_tk}h`, pass: p.rt_tk, cat: 'HIGH_RT' },
      { label: 'RT BT (≤9h)', val: `${emp.repontime_bt}h`, pass: p.rt_bt, cat: 'HIGH_RT' },
      { label: 'CSAT (=0)', val: `${emp.csat}`, pass: p.csat, cat: 'ALL' }
    ];

    ribbon.innerHTML = items.map(it => `
      <div class="dossier-kpi-chip ${it.pass ? 'kpi-pass' : 'kpi-fail'}" onclick="window.switchDossierCategory('${it.cat}')" title="Nhấp lọc ca lỗi ${it.label}">
        <span class="dk-label">${it.label}</span>
        <div class="dk-val-row">
          <span class="dk-val">${it.val}</span>
          <span class="dk-badge ${it.pass ? 'pass' : 'fail'}">${it.pass ? 'Đạt' : 'Lỗi'}</span>
        </div>
      </div>
    `).join('');
  }

  function filterAndRenderDossierCases(searchTerm = '') {
    let list = [...currentDossierCases];

    // Filter by Category
    if (currentDossierCategory && currentDossierCategory !== 'ALL') {
      if (currentDossierCategory === 'LATE') {
        list = list.filter(c => c.category === 'LATE' || c.category === 'LATE_TKM' || c.category === 'LATE_BT');
      } else if (currentDossierCategory === 'LATE_TKM') {
        list = list.filter(c => c.category === 'LATE_TKM' || (c.category === 'LATE' && (c.service === 'TKM' || (c.service && c.service.includes('TK')))));
      } else if (currentDossierCategory === 'LATE_BT') {
        list = list.filter(c => c.category === 'LATE_BT' || (c.category === 'LATE' && c.service === 'BT'));
      } else {
        list = list.filter(c => c.category === currentDossierCategory);
      }
    }

    // Filter by search term
    const term = (searchTerm || '').trim().toLowerCase();
    if (term) {
      list = list.filter(c =>
        (c.shd && c.shd.toLowerCase().includes(term)) ||
        (c.kh && c.kh.toLowerCase().includes(term)) ||
        (c.note && c.note.toLowerCase().includes(term)) ||
        (c.service && c.service.toLowerCase().includes(term)) ||
        (c.typeBadge && c.typeBadge.toLowerCase().includes(term))
      );
    }

    currentDossierFilteredCases = list;
    renderDossierRows(list);
  }

  function renderDossierRows(cases) {
    const tbody = document.getElementById('dossierTableBody');
    const table = document.getElementById('dossierTable');
    const emptyState = document.getElementById('dossierEmptyState');
    const footerStats = document.getElementById('dossierFooterStats');

    if (!tbody) return;

    if (!cases || cases.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      if (table) table.style.display = 'none';
      if (footerStats) footerStats.textContent = 'Đang hiển thị 0 ca sự cố';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (table) table.style.display = 'table';
    if (footerStats) footerStats.textContent = `Đang hiển thị ${cases.length} ca sự cố`;

    tbody.innerHTML = cases.map((c, idx) => {
      let badgeHtml = '';
      if (c.category === 'CLL') {
        badgeHtml = `<span class="modal-chip chip-cll" style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(239, 68, 68, 0.2); color: #fca5a5; font-weight: 700; border: 1px solid rgba(239,68,68,0.4);">🔁 CLL (L${c.so_lan_lap || 2})</span>`;
      } else if (c.category === 'LATE_TKM' || (c.category === 'LATE' && (c.service === 'TKM' || (c.service && c.service.includes('TK'))))) {
        badgeHtml = `<span class="modal-chip chip-late" style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(239, 68, 68, 0.2); color: #fca5a5; font-weight: 700; border: 1px solid rgba(239,68,68,0.4);">❌ Trễ Hẹn TKM</span>`;
      } else if (c.category === 'LATE_BT' || (c.category === 'LATE' && c.service === 'BT')) {
        badgeHtml = `<span class="modal-chip chip-late" style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(245, 158, 11, 0.2); color: #fcd34d; font-weight: 700; border: 1px solid rgba(245,158,11,0.4);">⚠️ Trễ Hẹn BT</span>`;
      } else if (c.category === 'LATE') {
        badgeHtml = `<span class="modal-chip chip-late" style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(245, 158, 11, 0.2); color: #fcd34d; font-weight: 700; border: 1px solid rgba(245,158,11,0.4);">❌ Trễ Hẹn ${c.service || ''}</span>`;
      } else if (c.category === 'HIGH_RT') {
        badgeHtml = `<span class="modal-chip chip-rt" style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(99, 102, 241, 0.2); color: #c7d2fe; font-weight: 700; border: 1px solid rgba(99,102,241,0.4);">⏱️ RT Cao ${c.service || ''}</span>`;
      } else if (c.category === 'SEVEN_N') {
        badgeHtml = `<span class="modal-chip" style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(56, 189, 248, 0.2); color: #7dd3fc; font-weight: 700; border: 1px solid rgba(56,189,248,0.4);">📦 7N ${c.service || ''}</span>`;
      } else if (c.category === 'OVERDUE') {
        badgeHtml = `<span class="modal-chip" style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(239, 68, 68, 0.25); color: #fca5a5; font-weight: 700; border: 1px solid rgba(239,68,68,0.5);">⏳ Quá Hạn ${c.service || ''}</span>`;
      } else {
        badgeHtml = `<span class="modal-chip" style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(148, 163, 184, 0.2); color: #cbd5e1; font-weight: 700;">⚠️ Sự Cố</span>`;
      }

      const noteText = c.note || '-';
      const rtText = (c.rt !== undefined && c.rt !== null && c.rt > 0) ? `${c.rt}h` : (c.so_lan_lap ? `L${c.so_lan_lap}` : '-');
      const rtColor = (c.rt > 24 || (c.service === 'TK' && c.rt > 72)) ? '#ef4444' : (c.rt > 9 ? '#f59e0b' : '#cbd5e1');

      return `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-size: 12px;">${idx + 1}</td>
          <td>${badgeHtml}</td>
          <td>
            <div class="shd-copy-box" onclick="copyShdText('${c.shd}', event)" title="Nhấp để copy mã HĐ">
              <span class="shd-text">${c.shd || '-'}</span>
              <span class="copy-icon">📋</span>
            </div>
          </td>
          <td style="max-width: 180px;">
            <div style="font-weight: 600; font-size: 12.5px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${c.kh || ''}">${c.kh || '-'}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${c.service ? `Loại DV: ${c.service}` : ''}</div>
          </td>
          <td style="font-size: 12px; color: var(--text-secondary); white-space: nowrap;">${c.time || '-'}</td>
          <td style="font-size: 13px; font-weight: 700; color: ${rtColor}; text-align: center;">${rtText}</td>
          <td style="max-width: 280px;">
            <div class="note-cell-truncate" onclick="toggleNoteExpand(this)" title="Nhấp để phóng to / thu nhỏ ghi chú">
              ${noteText}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function navigateDossierEmp(direction) {
    if (!currentDossierEmp || !appData || !appData.employees || appData.employees.length === 0) return;
    const curIdx = appData.employees.findIndex(e => String(e.id) === String(currentDossierEmp.id));
    if (curIdx === -1) return;

    const total = appData.employees.length;
    const nextIdx = (curIdx + direction + total) % total;
    openEmpDossierModal(appData.employees[nextIdx].id, currentDossierCategory);
  }

  function copyEmpZaloReport(emp) {
    if (!emp) return;
    const scoreData = getEmpScoreData(emp);
    const shortName = emp.short_name || emp.name.replace('PNC01.', '');
    const fullName = emp.full_name || emp.fullName || '';
    const empDisplay = fullName ? `${shortName} (${fullName})` : shortName;

    // Tìm các ca sự cố của riêng KTV này trong ngày T-1
    const alerts = appData && appData.yesterday_alerts;
    const tDate = (alerts && alerts.target_date) || '';
    const activeDate = activeAlertDate || tDate;
    const cases = (alerts && alerts.cases_by_date && alerts.cases_by_date[activeDate]) || [];
    const empCases = cases.filter(c => c.emp === emp.name || (c.emp && c.emp.endsWith(shortName)));

    const cllT1Cases = empCases.filter(c => c.issue_type === 'CLL');
    const lateCases = empCases.filter(c => c.issue_type === 'LATE' || c.issue_type === 'LATE_TKM' || c.issue_type === 'LATE_BT');
    const rtCases = empCases.filter(c => c.issue_type === 'HIGH_RT');
    const sevenNCases = empCases.filter(c => c.issue_type === '7N');

    const lines = [];
    lines.push(`📊 [BÁO CÁO KPI & SỰ CỐ CÁ NHÂN] - KTV ${empDisplay}`);
    lines.push(`🏢 Block: ${emp.block || 'Chưa phân block'}`);
    lines.push(`🏆 Đánh giá tổng: ${scoreData.score}/7 Tiêu chí Đạt -> ${scoreData.statusText}`);
    lines.push(`----------------------------------------`);
    lines.push(`🎯 7 TIÊU CHÍ KPI CHÍNH:`);
    lines.push(`1. Đúng Hẹn: ${emp.on_time_rate.toFixed(1)}% (Chuẩn ≥ 98%) ${emp.on_time_rate >= 98 ? '✅' : '❌'}`);
    lines.push(`2. Tỷ lệ CLL: ${emp.cll_rate.toFixed(1)}% (Chuẩn ≤ 6%) ${emp.cll_rate <= 6 ? '✅' : '❌'}`);
    const cll3Val = emp.cll3_rate !== null && emp.cll3_rate !== undefined ? emp.cll3_rate : 0.0;
    lines.push(`3. CLL3 (≥3 Lần): ${cll3Val.toFixed(2)}% (Chuẩn ≤ 0.5%) ${cll3Val <= 0.5 ? '✅' : '❌'}`);
    lines.push(`4. Checklist 7N: ${emp.cl_7n_total_rate.toFixed(1)}% (Chuẩn ≤ 2.5%) ${emp.cl_7n_total_rate <= 2.5 ? '✅' : '❌'}`);
    lines.push(`5. RT Triển khai: ${emp.repontime_tk}h (Chuẩn ≤ 18h) ${emp.repontime_tk <= 18 ? '✅' : '❌'}`);
    lines.push(`6. RT Bảo trì: ${emp.repontime_bt}h (Chuẩn ≤ 9h) ${emp.repontime_bt <= 9 ? '✅' : '❌'}`);
    lines.push(`7. CSAT Xấu: ${emp.csat_bad_count !== undefined ? emp.csat_bad_count : (emp.csat || 0)} ca (Chuẩn = 0) ${(emp.csat_bad_count || 0) === 0 ? '✅' : '❌'}`);
    lines.push(`----------------------------------------`);

    // SỰ CỐ HOÀN TẤT NGÀY T-1 (Rút gọn sạch sẽ)
    lines.push(`🚨 SỰ CỐ HOÀN TẤT NGÀY ${activeDate || 'T-1'}:`);

    // 1. CLL: Nêu SHD và lần lặp
    if (cllT1Cases.length > 0) {
      const shds = cllT1Cases.map(c => `${c.shd}(L${c.so_lan_lap || 2})`).join(', ');
      lines.push(`• 🔁 Checklist Lặp CLL (${cllT1Cases.length} ca): ${shds}`);
    } else {
      lines.push(`• 🔁 Checklist Lặp CLL: 0 ca (✅ Không có ca lặp)`);
    }

    // 2. Trễ hẹn: Nêu SHD nếu có
    if (lateCases.length > 0) {
      const shds = lateCases.map(c => `${c.shd}(${c.service || 'BT'})`).join(', ');
      lines.push(`• ❌ Trễ hẹn (${lateCases.length} ca): ${shds}`);
    } else {
      lines.push(`• ❌ Trễ hẹn: 0 ca (✅ Đúng hẹn 100%)`);
    }

    // 3. 7N (nếu có)
    if (sevenNCases.length > 0) {
      const shds = sevenNCases.map(c => c.shd).join(', ');
      lines.push(`• 📦 7N phát sinh (${sevenNCases.length} ca): ${shds}`);
    }

    // 4. RT cao: CHỈ GỬI SỐ CA VÀ RT TRUNG BÌNH, KHÔNG GỬI CHI TIẾT HỢP ĐỒNG
    if (rtCases.length > 0) {
      const rtVals = rtCases.map(c => c.rt).filter(v => v !== undefined && v !== null);
      const avgRt = rtVals.length ? (rtVals.reduce((a, b) => a + b, 0) / rtVals.length).toFixed(1) : 0;
      lines.push(`• ⏱️ RT cao: ${rtCases.length} ca (RT trung bình: ${avgRt}h)`);
    } else {
      lines.push(`• ⏱️ RT cao: 0 ca (✅ Không có ca vượt giờ)`);
    }

    lines.push(`----------------------------------------`);
    if (scoreData.score >= 5) {
      lines.push(`🎉 Chúc mừng ${shortName} đang duy trì phong độ KPI rất tốt! Hãy tiếp tục phát huy.`);
    } else {
      lines.push(`⚠️ Đề nghị ${shortName} rà soát kỹ các chỉ số chưa đạt để hoàn thành KPI tháng nhé!`);
    }

    const text = lines.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      window.showDashboardToast(`💬 Đã sao chép tin nhắn Zalo gửi KTV ${shortName}! Mở Zalo dán (Ctrl+V) để gửi.`);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      window.showDashboardToast(`💬 Đã sao chép tin nhắn Zalo gửi KTV ${shortName}!`);
    });
  }

  function copyDossierShds() {
    if (!currentDossierFilteredCases || currentDossierFilteredCases.length === 0) {
      window.showDashboardToast('ℹ️ Không có hợp đồng nào để copy');
      return;
    }
    const shds = [...new Set(currentDossierFilteredCases.map(c => c.shd).filter(s => s && s !== '-' && s !== 'TỔNG HỢP'))];
    if (shds.length === 0) {
      window.showDashboardToast('ℹ️ Không có mã SHD cụ thể');
      return;
    }
    const text = shds.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      window.showDashboardToast(`📋 Đã sao chép ${shds.length} mã SHD của KTV!`);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      window.showDashboardToast(`📋 Đã sao chép ${shds.length} mã SHD!`);
    });
  }

  function exportDossierCsv() {
    if (!currentDossierFilteredCases || currentDossierFilteredCases.length === 0) {
      window.showDashboardToast('ℹ️ Không có dữ liệu để xuất CSV');
      return;
    }
    const empName = currentDossierEmp ? currentDossierEmp.name.replace('PNC01.', '') : 'KTV';
    const headers = ["STT", "KTV", "Loại Sự Cố", "Dịch Vụ", "Số HĐ", "Khách Hàng", "Thời Gian", "RT/Lần Lặp", "Ghi Chú"];
    const rows = currentDossierFilteredCases.map((c, i) => [
      i + 1,
      `"${empName}"`,
      `"${c.typeBadge || c.category}"`,
      `"${c.service || ''}"`,
      `"${c.shd || ''}"`,
      `"${c.kh || ''}"`,
      `"${c.time || ''}"`,
      c.rt || c.so_lan_lap || 0,
      `"${(c.note || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Ho_So_Loi_${empName}_${currentDossierCategory}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.showDashboardToast(`📥 Đã xuất file CSV hồ sơ lỗi của ${empName}!`);
  }

  function setupDossierEventListeners() {
    // 1. Quick Select in Lookup Section
    const quickSelect = document.getElementById('empQuickSelect');
    if (quickSelect) {
      quickSelect.addEventListener('change', (e) => {
        if (e.target.value) {
          openEmpDossierModal(e.target.value, 'ALL');
        }
      });
    }

    // 2. Filter Pills in Lookup Section
    const lookupPills = document.querySelectorAll('#empLookupFilterGroup .btn-pill');
    lookupPills.forEach(pill => {
      pill.addEventListener('click', () => {
        lookupPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        renderEmpChips(pill.dataset.empFilter || 'ALL');
      });
    });

    // 3. Issues Mode View Switcher
    const btnViewIssues = document.getElementById('btnViewEmpIssues');
    if (btnViewIssues) {
      btnViewIssues.addEventListener('click', () => {
        setViewMode('emp-issues');
      });
    }

    // 4. Issues Mode Filter Tabs
    const issueFilterTabs = document.querySelectorAll('#issuesModeFilterTabs .tab-btn');
    issueFilterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        issueFilterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentIssuesModeFilter = tab.dataset.issuesFilter || 'ALL';
        renderEmpIssuesSection();
      });
    });

    // 5. Issues Mode Sort Select
    const sortSelect = document.getElementById('issuesSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        currentIssuesModeSort = e.target.value;
        renderEmpIssuesSection();
      });
    }

    // 6. Dossier Modal Navigation & Close
    const btnPrev = document.getElementById('btnDossierPrev');
    if (btnPrev) btnPrev.addEventListener('click', () => navigateDossierEmp(-1));

    const btnNext = document.getElementById('btnDossierNext');
    if (btnNext) btnNext.addEventListener('click', () => navigateDossierEmp(1));

    const btnClose = document.getElementById('btnDossierClose');
    if (btnClose) btnClose.addEventListener('click', closeEmpDossierModal);

    const btnCloseFooter = document.getElementById('btnDossierCloseFooter');
    if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeEmpDossierModal);

    const backdrop = document.getElementById('empDossierModalBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeEmpDossierModal();
      });
    }

    // 7. Dossier Category Tabs
    const catTabs = document.querySelectorAll('#dossierCategoryTabs .btn-pill');
    catTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        catTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDossierCategory = btn.dataset.cat || 'ALL';
        const searchVal = document.getElementById('dossierSearchInput')?.value || '';
        filterAndRenderDossierCases(searchVal);
      });
    });

    // 8. Dossier Search Input
    const searchInput = document.getElementById('dossierSearchInput');
    const searchClear = document.getElementById('dossierSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        if (searchClear) searchClear.style.display = e.target.value ? 'block' : 'none';
        filterAndRenderDossierCases(e.target.value);
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        searchClear.style.display = 'none';
        filterAndRenderDossierCases('');
      });
    }

    // 9. Dossier Action Buttons
    const btnCopyShd = document.getElementById('btnDossierCopyShd');
    if (btnCopyShd) btnCopyShd.addEventListener('click', copyDossierShds);

    const btnCopyZalo = document.getElementById('btnDossierCopyZalo');
    if (btnCopyZalo) {
      btnCopyZalo.addEventListener('click', () => {
        if (currentDossierEmp) copyEmpZaloReport(currentDossierEmp);
      });
    }

    const btnExportCsv = document.getElementById('btnDossierExportCsv');
    if (btnExportCsv) btnExportCsv.addEventListener('click', exportDossierCsv);

    // 10. Global Keyboard Navigation for Dossier Modal
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('empDossierModalBackdrop');
      if (modal && modal.style.display !== 'none') {
        if (e.key === 'Escape') {
          closeEmpDossierModal();
        } else if (e.key === 'ArrowLeft') {
          navigateDossierEmp(-1);
        } else if (e.key === 'ArrowRight') {
          navigateDossierEmp(1);
        }
      }
    });
  }

  // Start initialization
  initData();
});
