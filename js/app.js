/* 拾词 · 交互与路由 */
(function () {
  'use strict';

  const Store = window.Store;
  const UI = window.UI;
  const ProductAnalytics = window.ProductAnalytics;
  const Entitlements = window.ShiciEntitlements;
  const PremiumConfig = window.SHICI_PREMIUM_CONFIG || {};
  const esc = UI.helpers.esc;

  const ROUTES = ['home', 'study', 'library', 'books', 'report', 'print'];
  const LIBRARY_PAGE_SIZE = 30;
  // This revision changes only when book payloads change, so app-only releases
  // can reuse the already cached 3500-word book instead of downloading it again.
  const BOOK_ASSET_VERSION = '27';
  const ASSET_VERSION = (function () {
    const source = document.currentScript && document.currentScript.src;
    const match = source && source.match(/[?&]v=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : '38';
  })();
  const bookCache = new Map();
  const bookScriptPromises = new Map();
  const bookFullPromises = new Map();
  let bookIndexCache = null;
  let reportTracked = false;
  let printTracked = false;
  const VALID_STATUSES = ['all', 'new', 'learning', 'mastered', 'weak', 'favorite', 'due'];
  const DAY_MS = 24 * 60 * 60 * 1000;

  const app = {
    route: 'home',
    library: {
      query: '',
      status: 'all',
      unit: 'all',
      page: 1
    },
    bookLoadingId: null,
    reportWords: {
      filter: 'all',
      page: 1
    },
    memoryWall: {
      layout: 'sticky',
      scope: 'recent',
      count: 24,
      showMeaning: true,
      showIpa: true,
      showExample: true,
      settingsOpen: false
    },
    session: null,
    lastAutoSpokenCardKey: null,
    wordDrawerId: null,
    settingsOpen: false,
    pendingVoiceGender: null,
    modal: null,
    lastFocus: null,
    modalFocus: null,
    composing: false,
    libraryTimer: null,
    searchTimer: null,
    saveFailureNoticeShown: false,
    conflictNoticeShown: false
  };

  const page = document.getElementById('page');
  const overlayRoot = document.getElementById('overlayRoot');
  const toastRegion = document.getElementById('toastRegion');
  const appShell = document.getElementById('appShell');
  const modalRoot = document.createElement('div');
  modalRoot.id = 'modalRoot';
  document.body.appendChild(modalRoot);

  function startOfLocalDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function dayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((startOfLocalDay(date) - start) / DAY_MS);
  }

  function isChineseBook(bookId) {
    return bookId === 'wenyan' || bookId === 'curated';
  }

  function getTodayWord() {
    let words = Store.words || [];
    if (!words.length) return null;
    if (isChineseBook(Store.getActiveBookId())) {
      const core = words.filter(function (word) { return word.category === 'core'; });
      if (core.length) words = core;
    }
    const rich = words.filter(function (word) {
      return word.example && !/^(\.\.\.|…)/.test(word.example) && word.word.length > 3 && (word.tip || word.family);
    });
    const withExample = words.filter(function (word) {
      return word.example && !/^(\.\.\.|…)/.test(word.example) && word.word.length > 3;
    });
    const pool = rich.length ? rich : (withExample.length ? withExample : words);
    const index = dayOfYear(new Date()) % pool.length;
    return pool[index];
  }

  function getTodayQuote() {
    return window.QUOTES[dayOfYear(new Date()) % window.QUOTES.length];
  }

  function studyDayIndex(profile) {
    const created = profile && profile.createdAt ? new Date(profile.createdAt) : new Date();
    const days = Math.floor((startOfLocalDay(new Date()) - startOfLocalDay(created)) / DAY_MS) + 1;
    return Math.max(1, Number.isFinite(days) ? days : 1);
  }

  function getGreeting() {
    return UI.helpers.greeting(new Date());
  }

  function getDisplayName() {
    const name = Store.getProfile().name;
    return name && name.trim() ? name.trim() : '';
  }

  // ---------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------

  function parseHash() {
    const raw = (window.location.hash || '').replace(/^#/, '') || 'home';
    const parts = raw.split('?');
    const path = parts[0] || 'home';
    const route = ROUTES.indexOf(path) !== -1 ? path : 'home';
    const params = new URLSearchParams(parts[1] || '');
    app.route = route;

    if (route === 'report') {
      app.reportWords.filter = 'all';
      app.reportWords.page = 1;
    }
    if (route === 'library') {
      app.library.query = params.get('q') || '';
      const status = params.get('status') || 'all';
      app.library.status = VALID_STATUSES.indexOf(status) !== -1 ? status : 'all';
      const unit = params.get('unit') || 'all';
      app.library.unit = unit !== 'all' && Store.getUnit(Number(unit)) ? String(unit) : 'all';
      app.library.page = 1;
    }
    return route;
  }

  function buildLibraryHash() {
    const params = new URLSearchParams();
    if (app.library.query.trim()) params.set('q', app.library.query.trim());
    if (app.library.status !== 'all') params.set('status', app.library.status);
    if (app.library.unit !== 'all') params.set('unit', app.library.unit);
    const suffix = params.toString();
    return '#library' + (suffix ? '?' + suffix : '');
  }

  function syncLibraryHash() {
    if (app.route !== 'library') return;
    const next = buildLibraryHash();
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next);
    }
  }

  function navigate(route, params) {
    const target = ROUTES.indexOf(route) !== -1 ? route : 'home';
    let hash = '#' + target;
    if (target === 'library' && params) {
      const search = new URLSearchParams();
      if (params.q) search.set('q', params.q);
      if (params.status && params.status !== 'all') search.set('status', params.status);
      if (params.unit && params.unit !== 'all') search.set('unit', params.unit);
      const extra = search.toString();
      if (extra) hash += '?' + extra;
    }
    if (window.location.hash === hash) {
      parseHash();
      renderAll();
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      window.location.hash = hash;
    }
  }

  function handleHashChange() {
    const hadOverlay = closeAllOverlays({ silent: true, skipRender: true });
    parseHash();
    hideSearchSuggest();
    renderAll();
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (hadOverlay) {
      // Focus is restored to the page after closing an overlay.
      page.focus({ preventScroll: true });
    }
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  function buildMemoryWallData() {
    const allStudied = Store.studiedWords();
    const state = app.memoryWall;
    let words = allStudied.slice();
    if (state.scope === 'weak') {
      words = words.filter(function (word) {
        const record = Store.getRecord(word.id);
        return record && record.weak && Store.getStatus(word.id) !== 'mastered';
      });
    } else if (state.scope === 'favorite') {
      words = words.filter(function (word) {
        const record = Store.getRecord(word.id);
        return record && record.favorite;
      });
    }
    words.sort(function (a, b) {
      const recordA = Store.getRecord(a.id) || {};
      const recordB = Store.getRecord(b.id) || {};
      if (state.scope === 'weak') {
        const lapseA = (Number(recordA.lapseCount) || 0) + (Number(recordA.quizWrong) || 0);
        const lapseB = (Number(recordB.lapseCount) || 0) + (Number(recordB.quizWrong) || 0);
        if (lapseA !== lapseB) return lapseB - lapseA;
      }
      const dateA = Date.parse(recordA.lastReviewed || recordA.firstStudiedAt || recordA.firstSeen || '') || 0;
      const dateB = Date.parse(recordB.lastReviewed || recordB.firstStudiedAt || recordB.firstSeen || '') || 0;
      return dateB - dateA;
    });
    const unlocked = Boolean(Entitlements && Entitlements.isUnlocked('memory-wall'));
    const visibleWords = unlocked ? words.slice(0, state.count) : words.slice(0, 3);
    const product = PremiumConfig.memoryWall || {};
    return {
      words: visibleWords,
      filteredCount: words.length,
      allStudiedCount: allStudied.length,
      layout: state.layout,
      scope: state.scope,
      count: state.count,
      showMeaning: state.showMeaning,
      showIpa: state.showIpa,
      showExample: state.showExample,
      settingsOpen: state.settingsOpen,
      unlocked: unlocked,
      priceLabel: product.priceLabel || '¥19',
      regularPriceLabel: product.regularPriceLabel || '¥29'
    };
  }

  function renderPage(options) {
    const opts = options || {};
    const openWallSettings = app.route === 'print'
      ? document.querySelector('.memory-wall-settings')
      : null;
    if (openWallSettings) app.memoryWall.settingsOpen = openWallSettings.open;
    document.body.classList.toggle('route-print', app.route === 'print');
    if (app.route === 'report' && !reportTracked) {
      reportTracked = true;
      trackProductEvent('report_opened', { bookId: Store.getActiveBookId() });
    }
    const now = new Date();
    const date = UI.helpers.formatDate(now);
    const overview = Store.getOverview();
    let html = '';

    if (app.route === 'home') {
      html = UI.renderHome({
        overview: overview,
        wordOfTheDay: getTodayWord(),
        quote: getTodayQuote(),
        date: date,
        greeting: getGreeting(),
        name: getDisplayName() || '同学'
      });
      document.title = '拾词 · 今日概览';
    } else if (app.route === 'study') {
      html = UI.renderStudyCenter({ overview: overview });
      document.title = '拾词 · 学习中心';
    } else if (app.route === 'library') {
      const result = filterLibrary();
      html = UI.renderLibrary({
        overview: overview,
        list: result.list,
        total: result.total,
        hasMore: result.hasMore,
        counts: result.counts,
        query: app.library.query,
        status: app.library.status,
        unit: app.library.unit
      });
      document.title = '拾词 · 我的词库';
    } else if (app.route === 'books') {
      html = UI.renderBooks({
        activeId: Store.getActiveBookId(),
        loadingId: app.bookLoadingId
      });
      document.title = '拾词 · 词书书架';
    } else if (app.route === 'report') {
      html = UI.renderReport({
        overview: overview,
        weekSeries: Store.getWeekSeries(),
        heatmap: Store.getHeatmap(),
        forecast: Store.getReviewForecast(7),
        wordReport: buildLearnedWordReport()
      });
      document.title = '拾词 · 学习报告';
    } else if (app.route === 'print') {
      const wallData = buildMemoryWallData();
      if (!printTracked) {
        printTracked = true;
        trackProductEvent('premium_gate_view', {
          route: 'print',
          bookId: Store.getActiveBookId(),
          source: wallData.unlocked ? 'unlocked' : 'locked'
        });
      }
      html = UI.renderMemoryWall(wallData);
      document.title = '拾词 · 记忆墙打印包';
    }

    page.innerHTML = html;
    renderChrome(overview);
    syncNav();
    if (opts.focusLibrary) focusLibrarySearch();
  }

  function filterLibrary() {
    const q = app.library.query.trim().toLowerCase();
    const status = app.library.status;
    const unit = app.library.unit;
    const today = Store.todayKey();
    const counts = {
      all: Store.words.length,
      new: 0,
      learning: 0,
      mastered: 0,
      weak: 0,
      favorite: 0,
      due: 0
    };

    const all = Store.words.filter(function (word) {
      const record = Store.getRecord(word.id);
      const wordStatus = Store.getStatus(word.id);
      counts[wordStatus] += 1;
      if (record && record.weak && wordStatus !== 'mastered') counts.weak += 1;
      if (record && record.favorite) counts.favorite += 1;
      if (record && record.seen && record.due && record.due <= today) counts.due += 1;

      if (unit !== 'all' && String(word.unit) !== String(unit)) return false;
      if (status === 'new' && wordStatus !== 'new') return false;
      if (status === 'learning' && wordStatus !== 'learning') return false;
      if (status === 'mastered' && wordStatus !== 'mastered') return false;
      if (status === 'weak' && !(record && record.weak && wordStatus !== 'mastered')) return false;
      if (status === 'favorite' && !(record && record.favorite)) return false;
      if (status === 'due' && !(record && record.seen && record.due && record.due <= today)) return false;

      if (q) {
        const haystack = [
          word.word,
          word.ipa,
          word.pos,
          word.meanings.join(' '),
          word.translation,
          word.example,
          word.collocations.join(' '),
          word.family,
          word.tip || ''
        ].join(' ').toLowerCase();
        if (haystack.indexOf(q) === -1) return false;
      }
      return true;
    });

    const page = Math.max(1, Number(app.library.page) || 1);
    const list = all.slice(0, page * LIBRARY_PAGE_SIZE);
    return { list: list, total: all.length, hasMore: list.length < all.length, counts: counts };
  }

  function buildLearnedWordReport() {
    const rows = [];
    Store.words.forEach(function (word) {
      const record = Store.getRecord(word.id);
      if (!record || !record.seen) return;
      let firstKind = 'unmarked';
      let firstSource = '没有首次学后检验记录';
      if (record.firstQuizCorrect === true) {
        firstKind = 'knew';
        firstSource = '首次学后检验答对';
      } else if (record.firstQuizCorrect === false) {
        firstKind = 'didnt';
        firstSource = '首次学后检验答错';
      } else if (record.firstRating === 'known') {
        firstKind = 'knew';
        firstSource = '首次自评认识';
      } else if (record.firstRating) {
        firstKind = 'didnt';
        firstSource = '首次自评不熟';
      } else if ((Number(record.quizSeen) || 0) > 0) {
        firstKind = (Number(record.quizWrong) || 0) === 0 ? 'knew' : 'didnt';
        firstSource = '按历史检验记录推断';
      } else if (record.lastRating === 'known') {
        firstKind = 'knew';
        firstSource = '按历史自评推断';
      } else if (record.lastRating) {
        firstKind = 'didnt';
        firstSource = '按历史自评推断';
      }
      const status = Store.getStatus(word.id);
      const currentStatus = record.weak && status !== 'mastered' ? 'weak' : status;
      const lastDate = record.lastQuizAt || record.lastReviewed || record.firstStudiedAt || record.firstSeen || '';
      rows.push({
        word: word,
        record: record,
        firstKind: firstKind,
        firstSource: firstSource,
        currentStatus: currentStatus,
        firstDate: record.firstStudiedAt || record.firstSeen || '',
        lastDate: lastDate
      });
    });
    const counts = {
      all: rows.length,
      knew: rows.filter(function (row) { return row.firstKind === 'knew'; }).length,
      didnt: rows.filter(function (row) { return row.firstKind === 'didnt'; }).length,
      weak: rows.filter(function (row) { return row.currentStatus === 'weak'; }).length,
      unmarked: rows.filter(function (row) { return row.firstKind === 'unmarked'; }).length
    };
    const filter = app.reportWords.filter || 'all';
    const filtered = rows.filter(function (row) {
      if (filter === 'knew') return row.firstKind === 'knew';
      if (filter === 'didnt') return row.firstKind === 'didnt';
      if (filter === 'weak') return row.currentStatus === 'weak';
      return true;
    });
    filtered.sort(function (a, b) {
      return String(b.lastDate).localeCompare(String(a.lastDate)) || a.word.word.localeCompare(b.word.word);
    });
    const page = Math.max(1, Number(app.reportWords.page) || 1);
    const list = filtered.slice(0, page * 24);
    return {
      list: list,
      total: filtered.length,
      allTotal: rows.length,
      counts: counts,
      filter: filter,
      hasMore: list.length < filtered.length
    };
  }

  function renderChrome(overview) {
    const now = new Date();
    const profile = Store.getProfile();
    const stats = overview || Store.getOverview();
    const topbarDate = document.getElementById('topbarDate');
    const dayIndex = studyDayIndex(profile);
    if (topbarDate) {
      topbarDate.textContent = '第 ' + dayIndex + ' 天';
    }

    const streakText = document.getElementById('streakPillText');
    if (streakText) streakText.textContent = stats.streak + ' 天';
    const dueBubble = document.getElementById('navDueBubble');
    if (dueBubble) {
      dueBubble.textContent = stats.reviewDueToday > 9 ? '9+' : String(stats.reviewDueToday);
      dueBubble.hidden = stats.reviewDueToday === 0;
    }

    const displayName = getDisplayName();
    const initial = displayName ? displayName.slice(0, 1) : '同';
    ['sidebarAvatar', 'topbarProfile'].forEach(function (id) {
      const node = document.getElementById(id);
      if (node) node.textContent = initial;
    });
    const sidebarName = document.getElementById('sidebarName');
    if (sidebarName) sidebarName.textContent = displayName || '同学';
    const sidebarStreak = document.getElementById('sidebarStreak');
    if (sidebarStreak) {
      sidebarStreak.textContent = stats.streak > 0 ? '已连续学习 ' + stats.streak + ' 天' : '从今天开始';
    }

    const goalBox = document.getElementById('sidebarGoal');
    if (goalBox) {
      const percent = stats.goal ? Math.min(100, Math.round((stats.todayUnique / stats.goal) * 100)) : 0;
      const note = stats.todayUnique >= stats.goal
        ? '今日目标完成，去休息一下吧。'
        : '还差 ' + Math.max(0, stats.goal - stats.todayUnique) + ' 个词 · 约 ' + Math.max(1, Math.round((stats.goal - stats.todayUnique) * 0.35)) + ' 分钟';
      goalBox.innerHTML = '<div class="sidebar-goal__head"><span>今日目标</span><strong>' + stats.todayUnique + ' / ' + stats.goal + '</strong></div>' +
        '<div class="sidebar-goal__numbers"><strong>' + stats.todayUnique + '</strong><span>/ ' + stats.goal + ' 词</span></div>' +
        '<div class="sidebar-goal__track"><span style="width:' + percent + '%"></span></div>' +
        '<p class="sidebar-goal__note">' + note + '</p>';
    }

    syncNav();
    syncBodyState();
  }

  function syncNav() {
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      const active = link.getAttribute('data-nav') === app.route;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    page.setAttribute('aria-label', document.title);
  }

  function renderAll(options) {
    renderPage(options);
    renderOverlays();
    renderModal();
  }

  function focusLibrarySearch() {
    window.setTimeout(function () {
      const input = document.getElementById('librarySearch');
      if (!input) return;
      input.focus({ preventScroll: true });
      const value = input.value;
      try {
        input.setSelectionRange(value.length, value.length);
      } catch (error) {
        // 某些浏览器对 search 类型输入不支持 setSelectionRange，忽略即可。
      }
    }, 0);
  }

  function memoryWallProduct() {
    return (PremiumConfig && PremiumConfig.memoryWall) || {};
  }

  function openMemoryWallLicenseModal() {
    closeModal(false);
    const product = memoryWallProduct();
    showModal({
      icon: 'lock',
      title: '输入记忆墙授权码',
      message: '授权码与购买订单对应，只在本设备保存。验证使用公钥签名，不读取你的学习内容。',
      inputId: 'memoryWallLicense',
      inputLabel: '授权码',
      inputPlaceholder: product.licensePlaceholder || '粘贴购买后收到的授权码',
      cancelLabel: '取消',
      confirmLabel: '验证并解锁',
      onConfirm: activateMemoryWallLicense
    });
  }

  function openMemoryWallPaywall() {
    const product = memoryWallProduct();
    const purchaseUrl = String(product.purchaseUrl || '');
    trackProductEvent('premium_gate_view', {
      route: 'print',
      bookId: Store.getActiveBookId(),
      source: 'paywall'
    });
    showModal({
      icon: 'lock',
      title: '记忆墙打印包',
      message: '首发价 ' + (product.priceLabel || '¥19') +
        '，原价 ' + (product.regularPriceLabel || '¥29') +
        '。完整版可打印 12–40 张、切换三种版式，并筛选待巩固或收藏词。当前未开放在线支付时，会先进入购买预登记。',
      cancelLabel: '稍后',
      extraLabel: '已有授权码',
      confirmLabel: purchaseUrl ? '去购买' : '购买预登记',
      onExtra: openMemoryWallLicenseModal,
      onConfirm: function () {
        closeModal(false);
        trackProductEvent('premium_purchase_clicked', {
          route: 'print',
          bookId: Store.getActiveBookId(),
          source: purchaseUrl ? 'checkout' : 'waitlist'
        });
        if (purchaseUrl) {
          window.open(purchaseUrl, '_blank', 'noopener,noreferrer');
          return;
        }
        window.location.href = product.supportUrl || 'feedback.html?type=memory-wall';
      }
    });
  }

  async function activateMemoryWallLicense() {
    if (!Entitlements) {
      toast('当前浏览器没有加载授权校验模块，请刷新后重试。', 'info');
      return;
    }
    const input = document.getElementById('memoryWallLicense');
    const token = input ? input.value.trim() : '';
    if (!token) {
      toast('请先粘贴授权码。', 'info');
      return;
    }
    try {
      await Entitlements.activate(token);
      closeModal(false);
      renderAll();
      trackProductEvent('premium_license_activated', {
        route: 'print',
        bookId: Store.getActiveBookId(),
        source: 'offline-license'
      });
      toast('记忆墙打印包已解锁。', 'check');
    } catch (error) {
      toast(error && error.message ? error.message : '授权码验证失败。', 'info');
    }
  }

  function printMemoryWall() {
    if (!Entitlements || !Entitlements.isUnlocked('memory-wall')) {
      openMemoryWallPaywall();
      return;
    }
    window.print();
  }

  // ---------------------------------------------------------------------
  // Overlays and focus
  // ---------------------------------------------------------------------

  function syncBodyState() {
    const overlayOpen = Boolean(app.session || app.wordDrawerId || app.settingsOpen);
    const lockScroll = Boolean(overlayOpen || app.modal);
    document.body.classList.toggle('is-session', Boolean(app.session));
    document.body.classList.toggle('is-locked', lockScroll);
    const shouldInert = Boolean(app.session || app.wordDrawerId || app.settingsOpen || app.modal);
    if (shouldInert) appShell.setAttribute('inert', '');
    else appShell.removeAttribute('inert');
  }

  function rememberFocus() {
    if (!app.lastFocus || !document.contains(app.lastFocus)) {
      app.lastFocus = document.activeElement;
    }
  }

  function restoreFocus() {
    if (app.session || app.wordDrawerId || app.settingsOpen || app.modal) return;
    if (app.lastFocus && document.contains(app.lastFocus) && !appShell.hasAttribute('inert')) {
      try { app.lastFocus.focus({ preventScroll: true }); } catch (error) { /* ignore */ }
    }
    app.lastFocus = null;
  }

  function renderOverlays() {
    let html = '';
    if (app.session) {
      html = UI.renderSession(app.session);
    } else if (app.wordDrawerId) {
      const word = Store.getWord(app.wordDrawerId);
      if (word) html = UI.wordDrawer(word);
    } else if (app.settingsOpen) {
      html = UI.settingsDrawer(Store.getProfile());
    }
    overlayRoot.innerHTML = html;
    syncBodyState();

    if (app.modal) return;
    if (app.session) {
      window.setTimeout(focusSessionContent, 0);
    } else if (app.wordDrawerId) {
      const close = overlayRoot.querySelector('[data-action="close-drawer"]');
      if (close && (!app.lastFocus || document.activeElement === document.body)) close.focus();
    } else if (app.settingsOpen) {
      const nameInput = document.getElementById('settingsName');
      if (nameInput) nameInput.focus();
    }
  }

  function focusSessionContent() {
    if (!app.session || app.modal) return;
    const overlay = overlayRoot.querySelector('.study-overlay');
    if (overlay) overlay.scrollTop = 0;
    if (app.session.completed) {
      const card = overlayRoot.querySelector('.summary-card');
      if (card && card.focus) card.focus({ preventScroll: true });
      return;
    }
    if (app.session.phase === 'quiz') {
      if (app.session.quiz && app.session.quiz.answered) {
        const next = overlayRoot.querySelector('[data-action="quiz-next"]');
        if (next) next.focus({ preventScroll: true });
      } else {
        const option = overlayRoot.querySelector('.quiz-option');
        if (option) option.focus({ preventScroll: true });
      }
      return;
    }
    if (app.session.type === 'spelling') {
      if (!app.session.checked) {
        const input = document.getElementById('spellInput');
        if (input) {
          input.focus({ preventScroll: true });
          const length = input.value.length;
          try { input.setSelectionRange(length, length); } catch (error) { /* ignore */ }
        }
      } else {
        const next = overlayRoot.querySelector('[data-action="next-spelling"]');
        if (next) next.focus({ preventScroll: true });
      }
      return;
    }
    const card = overlayRoot.querySelector('.word-card');
    if (card) card.focus({ preventScroll: true });
  }

  function closeAllOverlays(options) {
    const opts = Object.assign({ silent: false, skipRender: false }, options || {});
    const had = Boolean(app.session || app.wordDrawerId || app.settingsOpen || app.modal);
    if (!had) return false;
    app.session = null;
    app.wordDrawerId = null;
    app.settingsOpen = false;
    app.modal = null;
    modalRoot.innerHTML = '';
    syncBodyState();
    if (!opts.skipRender) {
      overlayRoot.innerHTML = '';
      renderPage();
      syncBodyState();
      restoreFocus();
    } else {
      overlayRoot.innerHTML = '';
    }
    return had;
  }

  function openWordDrawer(id) {
    if (!Store.getWord(id)) return;
    hideSearchSuggest();
    if (!app.session && !app.wordDrawerId && !app.settingsOpen) rememberFocus();
    app.settingsOpen = false;
    app.wordDrawerId = id;
    renderOverlays();
    syncBodyState();
  }

  function closeDrawer() {
    if (!app.wordDrawerId && !app.settingsOpen) return;
    app.wordDrawerId = null;
    app.settingsOpen = false;
    overlayRoot.innerHTML = '';
    syncBodyState();
    renderPage();
    restoreFocus();
  }

  function openSettings() {
    hideSearchSuggest();
    rememberFocus();
    app.wordDrawerId = null;
    app.settingsOpen = true;
    renderOverlays();
    syncBodyState();
  }

  function showModal(config) {
    if (!config) return;
    app.modalFocus = document.activeElement;
    app.modal = config;
    renderModal();
  }

  function closeModal(restore) {
    if (!app.modal) return;
    const target = app.modalFocus;
    app.modal = null;
    modalRoot.innerHTML = '';
    syncBodyState();
    if (restore && target && document.contains(target) && !appShell.hasAttribute('inert')) {
      try { target.focus({ preventScroll: true }); } catch (error) { /* ignore */ }
    }
  }

  function renderModal() {
    if (!app.modal) {
      modalRoot.innerHTML = '';
      return;
    }
    modalRoot.innerHTML = UI.modal(app.modal);
    syncBodyState();
    window.setTimeout(function () {
      const field = app.modal && app.modal.inputId && document.getElementById(app.modal.inputId);
      if (field) field.focus();
      else {
        const confirm = modalRoot.querySelector('[data-action="modal-confirm"]');
        if (confirm) confirm.focus();
      }
    }, 0);
  }

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------

  function hideSearchSuggest() {
    const suggest = document.getElementById('searchSuggest');
    if (suggest) {
      suggest.hidden = true;
      suggest.innerHTML = '';
    }
  }

  function showSearchSuggest(query) {
    const suggest = document.getElementById('searchSuggest');
    if (!suggest) return;
    const q = query.trim().toLowerCase();
    if (!q) {
      hideSearchSuggest();
      return;
    }
    const matches = Store.words.filter(function (word) {
      return (word.word + ' ' + word.meanings.join(' ') + ' ' + word.translation).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 6);
    suggest.innerHTML = UI.searchSuggestions(q, matches);
    suggest.hidden = false;
  }

  function submitGlobalSearch(event) {
    event.preventDefault();
    const input = document.getElementById('globalSearchInput');
    const query = input ? input.value.trim() : '';
    hideSearchSuggest();
    app.library.query = query;
    app.library.status = 'all';
    app.library.unit = 'all';
    navigate('library', { q: query });
  }

  // ---------------------------------------------------------------------
  // Study sessions
  // ---------------------------------------------------------------------

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function buildPracticeQueue() {
    return Store.buildLearnedReviewQueue();
  }

  function buildSpellingPool() {
    const studied = Store.studiedWords();
    // 拼写是提取练习，只使用已经见过的词；不足 8 个时缩短题量，不用陌生词凑数。
    return shuffle(studied.slice()).slice(0, 8).map(function (word) {
      return { id: word.id };
    });
  }

  function buildTrainingWords(limit) {
    return shuffle(Store.studiedWords().slice()).slice(0, limit || 8);
  }

  function baseSession(type, queue) {
    return {
      type: type,
      phase: 'cards',
      queue: queue,
      index: 0,
      revealed: false,
      attempts: 0,
      correctAttempts: 0,
      outcomes: {},
      repeatMap: {},
      startedAt: Date.now(),
      lastAnswerAt: Date.now(),
      completed: false,
      summary: null
    };
  }

  function trackProductEvent(name, properties) {
    if (!ProductAnalytics) return;
    try {
      ProductAnalytics.track(name, properties);
    } catch (error) {
      // Analytics is optional and must never interrupt learning.
    }
  }

  function persistenceWritable() {
    const persistence = Store.getPersistence();
    if (!persistence.conflict && persistence.lastSaveOk !== false) return true;
    toast('当前无法确认保存，本页已暂停新的作答。请先导出学习记录。', 'info');
    return false;
  }

  function startSession(type, customQueue) {
    let queue = customQueue;
    const overview = Store.getOverview();

    if (!queue) {
      if (type === 'daily') queue = Store.buildDailyPlan();
      else if (type === 'new') queue = Store.buildNewQueue(Store.getProfile().dailyGoal);
      else if (type === 'extra-new') queue = Store.buildNewQueue(10);
      else if (type === 'review') queue = Store.buildReviewQueue(30);
      else if (type === 'practice' || type === 'learned') queue = buildPracticeQueue();
      else if (type === 'single') queue = [];
    }

    if (!queue || !queue.length) {
      if (type === 'new' || type === 'extra-new') toast('新词已经全部见过面了，去复习或拼写吧。', 'sparkles');
      else if (type === 'review') toast('今天没有到期的复习，去学几个新词吧。', 'refresh');
      else if (type === 'practice' || type === 'learned') toast('当前词书还没有学过的词，先学几个再回来复习。', 'info');
      else if (type === 'relearn') toast('现在没有待巩固的词，去学一组新的吧。', 'check');
      else toast('这一轮暂时没有可学习的词。', 'info');
      return;
    }

    // 今日计划按 7 词左右的小循环推进；每组结束都做一次短提取，
    // 避免 20 张卡连续翻完才第一次回忆。
    if (type === 'daily') queue = queue.slice(0, 7);

    closeAllOverlays({ silent: true, skipRender: true });
    rememberFocus();
    app.modal = null;
    app.session = baseSession(type, queue);
    app.session.overviewToday = overview.todayUnique;
    app.session.goal = overview.goal;
    document.body.classList.add('is-session');
    overlayRoot.innerHTML = UI.renderSession(app.session);
    trackProductEvent('session_start', {
      bookId: Store.getActiveBookId(),
      mode: type,
      planSize: queue.length
    });
    autoSpeakCurrentCard(app.session);
    syncBodyState();
    window.setTimeout(focusSessionContent, 0);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function startSpellingSession() {
    if (isChineseBook(Store.getActiveBookId())) {
      toast('文言字词用卡片和词义检验来记，拼写挑战不适用。', 'info');
      return;
    }
    const questions = buildSpellingPool();
    if (!questions.length) {
      toast('拼写只抽查已经学过的词。先完成一组新词，再回来挑战。', 'info');
      return;
    }
    const overview = Store.getOverview();
    closeAllOverlays({ silent: true, skipRender: true });
    rememberFocus();
    app.session = {
      type: 'spelling',
      phase: 'spelling',
      questions: questions,
      index: 0,
      checked: false,
      currentCorrect: false,
      submitted: '',
      draft: '',
      hintUsed: false,
      attempts: 0,
      correctCount: 0,
      missed: [],
      startedAt: Date.now(),
      questionStartedAt: Date.now(),
      completed: false,
      summary: null,
      overviewToday: overview.todayUnique,
      goal: overview.goal
    };
    trackProductEvent('session_start', {
      bookId: Store.getActiveBookId(),
      mode: 'spelling',
      planSize: questions.length
    });
    document.body.classList.add('is-session');
    overlayRoot.innerHTML = UI.renderSession(app.session);
    syncBodyState();
    window.setTimeout(focusSessionContent, 0);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function startRetrievalSession() {
    if (isChineseBook(Store.getActiveBookId())) {
      toast('文言词书可直接使用今日计划和弱词抽查进行字义提取。', 'info');
      return;
    }
    const words = buildTrainingWords(8);
    if (!words.length) {
      toast('混合训练只使用已学词，先完成一小步新词学习。', 'info');
      return;
    }
    const overview = Store.getOverview();
    const session = baseSession('training', words.map(function (word) {
      return { id: word.id, kind: 'review' };
    }));
    session.phase = 'quiz';
    session.outcomes = {};
    words.forEach(function (word) {
      session.outcomes[word.id] = {
        id: word.id,
        kind: 'review',
        attempts: 0,
        correct: 0,
        finalRating: null
      };
    });
    session.quiz = {
      questions: buildMeaningQuizQuestions(words),
      index: 0,
      answered: false,
      selected: null,
      correctCount: 0,
      results: [],
      startedAt: Date.now(),
      questionStartedAt: Date.now()
    };
    session.overviewToday = overview.todayUnique;
    session.goal = overview.goal;
    closeAllOverlays({ silent: true, skipRender: true });
    rememberFocus();
    app.session = session;
    trackProductEvent('session_start', {
      bookId: Store.getActiveBookId(),
      mode: 'training',
      planSize: words.length
    });
    document.body.classList.add('is-session');
    Store.recordSession({ type: 'training', total: 0, correct: 0 });
    overlayRoot.innerHTML = UI.renderSession(session);
    syncBodyState();
    window.setTimeout(focusSessionContent, 0);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function refreshSessionChrome() {
    if (!app.session) return;
    const overview = Store.getOverview();
    app.session.overviewToday = overview.todayUnique;
    app.session.goal = overview.goal;
    renderChrome(overview);
  }

  function revealCard() {
    if (!app.session || app.session.phase !== 'cards' || app.session.revealed || app.session.completed) return;
    app.session.revealed = true;
    overlayRoot.innerHTML = UI.renderSession(app.session);
    window.setTimeout(function () {
      const card = overlayRoot.querySelector('.word-card');
      if (card) card.focus({ preventScroll: true });
    }, 0);
  }

  function rateCard(rating) {
    if (!app.session || app.session.phase !== 'cards' || !app.session.revealed || app.session.completed) return;
    const item = app.session.queue[app.session.index];
    if (!item) return;
    const word = Store.getWord(item.id);
    if (!word) return;
    if (!persistenceWritable()) return;

    const now = Date.now();
    const seconds = clampSeconds((now - app.session.lastAnswerAt) / 1000);
    const beforeOverview = Store.getOverview();
    const result = Store.answerWord(item.id, rating, seconds);
    if (!result) return;

    app.session.lastAnswerAt = now;
    app.session.attempts += 1;
    if (rating === 'known') app.session.correctAttempts += 1;

    if (!app.session.outcomes[item.id]) {
      app.session.outcomes[item.id] = {
        id: item.id,
        kind: item.kind,
        attempts: 0,
        correct: 0,
        finalRating: null
      };
    }
    const outcome = app.session.outcomes[item.id];
    outcome.attempts += 1;
    if (rating === 'known') outcome.correct += 1;
    outcome.finalRating = rating;

    if (rating === 'again' && !app.session.repeatMap[item.id]) {
      app.session.repeatMap[item.id] = 1;
      app.session.queue.push({ id: item.id, kind: item.kind, requeue: true });
      toast('已放进本轮回顾，稍后再见一次。', 'refresh');
    }

    app.session.revealed = false;
    app.session.index += 1;
    refreshSessionChrome();

    if (app.session.index >= app.session.queue.length) {
      startSessionQuiz();
    } else {
      overlayRoot.innerHTML = UI.renderSession(app.session);
      autoSpeakCurrentCard(app.session);
      window.setTimeout(focusSessionContent, 0);
    }

    // 让底层页面在退出后拿到最新数据，但会话进行中不重绘它。
    if (beforeOverview.todayUnique !== Store.getOverview().todayUnique) {
      // no-op: chrome is refreshed above; page renders on exit
    }
  }

  function clampSeconds(value) {
    return Math.max(1, Math.min(180, Math.round(value)));
  }

  function meaningText(word) {
    const meanings = word.coreMeanings && word.coreMeanings.length
      ? word.coreMeanings
      : word.meanings.slice(0, 2);
    return meanings.join('；');
  }

  function buildMeaningQuizQuestions(words) {
    const unique = [];
    const seen = new Set();
    words.forEach(function (word) {
      if (!word || seen.has(word.id)) return;
      seen.add(word.id);
      unique.push(word);
    });
    const bookPool = Store.words.slice();
    const questions = unique.map(function (word, index) {
      const hasContext = Boolean(word.example && word.example.toLowerCase().indexOf(String(word.word).toLowerCase()) !== -1);
      let type = 'meaning';
      if (word.lang !== 'zh') {
        if (hasContext && index % 4 === 1) type = 'context';
        else if (index % 4 === 3) type = 'reverse';
      }
      const correctText = type === 'meaning' ? meaningText(word) : word.word;
      const labels = new Set([correctText]);
      const candidates = shuffle(unique.concat(shuffle(bookPool)));
      const optionTexts = [correctText];
      for (let i = 0; i < candidates.length && optionTexts.length < 4; i += 1) {
        const candidate = candidates[i];
        if (candidate.id === word.id) continue;
        const label = type === 'meaning' ? meaningText(candidate) : candidate.word;
        if (!label || labels.has(label)) continue;
        labels.add(label);
        optionTexts.push(label);
      }
      const options = shuffle(optionTexts).map(function (text) {
        return { text: text, correct: text === correctText };
      });
      return {
        id: word.id,
        type: type,
        prompt: type === 'meaning'
          ? '选出正确的中文意思'
          : (type === 'context' ? '根据语境，选出应该填入的词' : '根据中文意思，选出对应词条'),
        wordText: type === 'reverse' ? meaningText(word) : word.word,
        context: type === 'context' ? UI.helpers.blankExample(word.example, word.word) : '',
        options: options,
        correctIndex: options.findIndex(function (option) { return option.correct; }),
        correctText: correctText,
        correctMeaning: meaningText(word),
        targetWord: word.word
      };
    });
    return shuffle(questions);
  }

  function startSessionQuiz() {
    const session = app.session;
    if (!session || session.completed) return;
    const outcomeList = Object.keys(session.outcomes || {}).map(function (id) { return session.outcomes[id]; });
    const words = outcomeList.map(function (item) { return Store.getWord(item.id); }).filter(Boolean);
    if (!words.length) {
      finishSessionQuiz();
      return;
    }
    const questions = buildMeaningQuizQuestions(words);
    session.phase = 'quiz';
    session.quiz = {
      questions: questions,
      index: 0,
      answered: false,
      selected: null,
      correctCount: 0,
      results: [],
      startedAt: Date.now(),
      questionStartedAt: Date.now()
    };
    // 学习环节结束时先把本轮计入学习记录；检验结果会单独写回每个词。
    Store.recordSession({ type: session.type, total: session.attempts, correct: session.correctAttempts });
    refreshSessionChrome();
    overlayRoot.innerHTML = UI.renderSession(session);
    window.setTimeout(focusSessionContent, 0);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function answerQuizOption(index) {
    const session = app.session;
    if (!session || session.phase !== 'quiz' || session.completed) return;
    const quiz = session.quiz;
    if (!quiz || quiz.answered) return;
    const question = quiz.questions[quiz.index];
    if (!question) return;
    if (!persistenceWritable()) return;
    const selected = Number(index);
    if (!Number.isInteger(selected) || selected < 0 || selected >= question.options.length) return;
    const correct = selected === question.correctIndex;
    const seconds = clampSeconds((Date.now() - quiz.questionStartedAt) / 1000);
    quiz.selected = selected;
    quiz.answered = true;
    if (correct) quiz.correctCount += 1;
    const selectedText = question.options[selected] ? question.options[selected].text : '';
    quiz.results.push({ id: question.id, correct: correct, type: question.type, selectedText: selectedText });
    quiz.lastResult = Store.recordObjectiveAnswer(question.id, {
      type: question.type,
      correct: correct,
      seconds: seconds,
      selectedText: selectedText
    });
    trackProductEvent('quiz_answered', {
      bookId: Store.getActiveBookId(),
      questionType: question.type,
      correct: correct
    });
    refreshSessionChrome();
    overlayRoot.innerHTML = UI.renderSession(session);
    window.setTimeout(focusSessionContent, 0);
  }

  function nextQuizQuestion() {
    const session = app.session;
    if (!session || session.phase !== 'quiz' || session.completed) return;
    const quiz = session.quiz;
    if (!quiz || !quiz.answered) return;
    quiz.index += 1;
    quiz.answered = false;
    quiz.selected = null;
    quiz.lastResult = null;
    quiz.questionStartedAt = Date.now();
    if (quiz.index >= quiz.questions.length) {
      finishSessionQuiz();
      return;
    }
    overlayRoot.innerHTML = UI.renderSession(session);
    window.setTimeout(focusSessionContent, 0);
  }

  function finishSessionQuiz() {
    const session = app.session;
    if (!session || session.completed) return;
    const outcomeList = Object.keys(session.outcomes || {}).map(function (id) { return session.outcomes[id]; });
    const newCount = outcomeList.filter(function (item) { return item.kind === 'new'; }).length;
    const reviewCount = outcomeList.length - newCount;
    const quiz = session.quiz || { questions: [], correctCount: 0, results: [] };
    const quizTotal = quiz.questions.length || 0;
    const quizCorrect = quiz.correctCount || 0;
    const quizScore = quizTotal ? Math.round((quizCorrect / quizTotal) * 100) : 0;
    const minutes = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
    const outcomeWords = outcomeList.map(function (item) { return Store.getWord(item.id); }).filter(Boolean);
    const words = outcomeWords.slice(0, 14);
    const missedWords = quiz.results.filter(function (result) { return !result.correct; })
      .map(function (result) { return Store.getWord(result.id); })
      .filter(Boolean);
    const remainingWords = outcomeWords.filter(function (word) {
      const record = Store.getRecord(word.id);
      return Boolean(record && record.weak);
    });
    const remainingPlan = Store.buildDailyPlan();
    const remaining = Store.newWords().length + Store.dueWords().length;
    const anotherLabel = session.type === 'daily' && remainingPlan.length
      ? '继续今日计划（' + Math.min(7, remainingPlan.length) + ' 词）'
      : (Store.dueWords().length > 0 ? '再复习一组' : (Store.newWords().length > 0 ? '再学 10 个新词' : '回到学习中心'));
    session.completed = true;
    session.phase = 'summary';
    session.summary = {
      words: words,
      moreCount: Math.max(0, outcomeList.length - words.length),
      newCount: newCount,
      reviewCount: reviewCount,
      accuracy: quizScore,
      quizTotal: quizTotal,
      quizCorrect: quizCorrect,
      quizScore: quizScore,
      weakWords: remainingWords,
      remainingWords: remainingWords,
      missedWords: missedWords,
      masteryRequired: 2,
      minutes: minutes,
      totalWords: outcomeList.length,
      canContinue: remaining > 0,
      anotherLabel: anotherLabel
    };
    trackProductEvent('session_complete', {
      bookId: Store.getActiveBookId(),
      mode: session.type,
      planSize: outcomeList.length,
      score: quizScore
    });
    refreshSessionChrome();
    overlayRoot.innerHTML = UI.renderSession(session);
    window.setTimeout(focusSessionContent, 0);
  }

  function startRelearnSession(words) {
    const queue = shuffle(words.filter(Boolean)).map(function (word) {
      return { id: word.id, kind: 'review' };
    });
    if (!queue.length) {
      toast('现在没有待巩固的词。', 'check');
      return;
    }
    startSession('relearn', queue);
  }

  function relearnWeakWords() {
    const session = app.session;
    if (!session || !session.completed) return;
    const summary = session.summary || {};
    startRelearnSession(summary.remainingWords || summary.weakWords || []);
  }

  function relearnAllWeak() {
    const words = Store.words.filter(function (word) {
      const record = Store.getRecord(word.id);
      return Boolean(record && record.seen && record.weak);
    });
    if (!words.length) {
      toast('当前词书没有待巩固的词，去正常学习就好。', 'check');
      return;
    }
    startRelearnSession(words);
  }

  function sessionAnother() {
    const previous = app.session ? app.session.type : 'daily';
    if (previous === 'spelling') {
      startSpellingSession();
      return;
    }
    const daily = Store.buildDailyPlan();
    if (daily.length) {
      startSession('daily', daily);
      return;
    }
    if (Store.dueWords().length) {
      startSession('review');
      return;
    }
    if (Store.newWords().length) {
      startSession('extra-new');
      return;
    }
    if (Store.studiedWords().length) {
      startSession('learned');
      return;
    }
    closeSession();
    navigate('study');
  }

  function requestExitSession() {
    if (!app.session) return;
    if (app.session.completed) {
      closeSession();
      return;
    }
    const inQuiz = app.session.phase === 'quiz';
    showModal({
      icon: 'info',
      title: inQuiz ? '要结束这次检验吗？' : '要结束这一轮吗？',
      message: inQuiz
        ? '已经答过的检验结果会保存，并用于调整之后的复习。未答的题目不会记录。'
        : '已经作答的单词会自动保存，不会丢掉进度。下次还可以从学习中心继续。',
      cancelLabel: inQuiz ? '继续检验' : '继续学习',
      confirmLabel: inQuiz ? '结束检验' : '保存并退出',
      danger: false,
      onConfirm: function () {
        closeModal(false);
        closeSession();
      }
    });
  }

  function closeSession() {
    if (!app.session) return;
    app.session = null;
    overlayRoot.innerHTML = '';
    syncBodyState();
    renderPage();
    renderChrome();
    restoreFocus();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function finishTo(route) {
    closeSession();
    navigate(route);
  }

  // ---------------------------------------------------------------------
  // Spelling challenge
  // ---------------------------------------------------------------------

  function currentSpellingWord() {
    if (!app.session || app.session.type !== 'spelling') return null;
    const question = app.session.questions[app.session.index];
    return question ? Store.getWord(question.id) : null;
  }

  function checkSpelling() {
    const session = app.session;
    if (!session || session.type !== 'spelling' || session.checked || session.completed) return;
    const word = currentSpellingWord();
    const input = document.getElementById('spellInput');
    if (!word || !input) return;
    if (!persistenceWritable()) return;
    const answer = input.value.trim();
    if (!answer) {
      toast('先写下你记得的拼写。', 'edit');
      input.focus();
      return;
    }
    const correct = answer.toLowerCase() === word.word.toLowerCase();
    const seconds = clampSeconds((Date.now() - session.questionStartedAt) / 1000);
    session.submitted = answer;
    session.currentCorrect = correct;
    session.checked = true;
    session.attempts += 1;
    if (correct) session.correctCount += 1;
    else session.missed.push(word.id);
    Store.recordObjectiveAnswer(word.id, {
      type: 'spelling',
      correct: correct,
      seconds: seconds,
      answer: answer
    });
    trackProductEvent('quiz_answered', {
      bookId: Store.getActiveBookId(),
      questionType: 'spelling',
      correct: correct
    });
    refreshSessionChrome();
    overlayRoot.innerHTML = UI.renderSession(session);
    window.setTimeout(focusSessionContent, 0);
  }

  function nextSpelling() {
    const session = app.session;
    if (!session || session.type !== 'spelling' || !session.checked) return;
    session.index += 1;
    session.checked = false;
    session.currentCorrect = false;
    session.submitted = '';
    session.draft = '';
    session.hintUsed = false;
    session.questionStartedAt = Date.now();
    if (session.index >= session.questions.length) {
      finishSpellingSession();
    } else {
      overlayRoot.innerHTML = UI.renderSession(session);
      window.setTimeout(focusSessionContent, 0);
    }
  }

  function finishSpellingSession() {
    const session = app.session;
    if (!session) return;
    const total = session.questions.length;
    const score = total ? Math.round((session.correctCount / total) * 100) : 0;
    session.completed = true;
    session.summary = {
      total: total,
      correct: session.correctCount,
      score: score,
      missed: session.missed.map(function (id) { return Store.getWord(id); }).filter(Boolean),
      minutes: Math.max(1, Math.round((Date.now() - session.startedAt) / 60000))
    };
    trackProductEvent('session_complete', {
      bookId: Store.getActiveBookId(),
      mode: 'spelling',
      planSize: total,
      score: score
    });
    Store.recordSession({ type: 'spelling', total: total, correct: session.correctCount });
    refreshSessionChrome();
    overlayRoot.innerHTML = UI.renderSession(session);
    window.setTimeout(focusSessionContent, 0);
  }

  function showSpellingHint() {
    const session = app.session;
    if (!session || session.type !== 'spelling' || session.checked || session.hintUsed) return;
    const word = currentSpellingWord();
    const input = document.getElementById('spellInput');
    session.draft = input ? input.value : session.draft || '';
    session.hintUsed = true;
    if (word) Store.recordHint(word.id);
    overlayRoot.innerHTML = UI.renderSession(session);
    window.setTimeout(function () {
      const nextInput = document.getElementById('spellInput');
      if (!nextInput) return;
      nextInput.focus({ preventScroll: true });
      const length = nextInput.value.length;
      try { nextInput.setSelectionRange(length, length); } catch (error) { /* ignore */ }
    }, 0);
  }

  // ---------------------------------------------------------------------
  // Library and settings actions
  // ---------------------------------------------------------------------

  function setLibraryStatus(status) {
    if (VALID_STATUSES.indexOf(status) === -1) return;
    app.library.status = status;
    app.library.page = 1;
    syncLibraryHash();
    renderPage();
  }

  function setLibraryUnit(unit) {
    app.library.unit = unit === 'all' || Store.getUnit(Number(unit)) ? unit : 'all';
    app.library.page = 1;
    syncLibraryHash();
    renderPage();
  }

  function clearLibrarySearch() {
    app.library.query = '';
    app.library.page = 1;
    syncLibraryHash();
    renderPage({ focusLibrary: true });
  }

  function resetLibraryFilters() {
    app.library = { query: '', status: 'all', unit: 'all', page: 1 };
    syncLibraryHash();
    renderPage();
  }

  function toggleFavorite(id) {
    const word = Store.getWord(id);
    if (!word) return;
    const favorite = Store.toggleFavorite(id);
    toast(favorite ? '已收藏「' + word.word + '」，可在词库的收藏里找到。' : '已取消收藏「' + word.word + '」。', 'star');
    document.querySelectorAll('[data-action="toggle-favorite"]').forEach(function (button) {
      if (button.getAttribute('data-word-id') !== id) return;
      button.classList.toggle('is-active', favorite);
      button.setAttribute('aria-pressed', String(favorite));
      button.setAttribute('aria-label', (favorite ? '取消收藏' : '收藏') + ' ' + word.word);
    });
    if (app.wordDrawerId === id) {
      overlayRoot.innerHTML = UI.wordDrawer(word);
      syncBodyState();
    }
  }

  function markMastered(id) {
    const word = Store.getWord(id);
    if (!word) return;
    const record = Store.getRecord(id) || {};
    const wasLongTerm = Boolean(record.manualLongTerm);
    Store.markMastered(id, !wasLongTerm);
    toast(wasLongTerm
      ? '已恢复正常复习，明天会重新安排。'
      : '已延长到 60 天后。这个操作不会替代跨日期、多题型的“已掌握”验证。', 'check');
    if (app.wordDrawerId === id) {
      overlayRoot.innerHTML = UI.wordDrawer(word);
      syncBodyState();
    }
    renderPage();
    renderChrome();
  }

  function saveSettings() {
    const nameInput = document.getElementById('settingsName');
    const goalInput = document.getElementById('settingsDailyGoal');
    const voiceRateInput = document.getElementById('settingsVoiceRate');
    const patch = {};
    if (nameInput) patch.name = nameInput.value;
    if (goalInput) {
      const goal = Math.round(Number(goalInput.value));
      if (!Number.isFinite(goal) || goal < Store.MIN_DAILY_GOAL || goal > Store.MAX_DAILY_GOAL) {
        toast('每日单词数需在 ' + Store.MIN_DAILY_GOAL + '–' + Store.MAX_DAILY_GOAL + ' 之间。', 'info');
        goalInput.focus();
        goalInput.select();
        return;
      }
      patch.dailyGoal = goal;
    }
    if (voiceRateInput) patch.voiceRate = Number(voiceRateInput.value);
    if (app.pendingVoiceGender === 'male' || app.pendingVoiceGender === 'female') {
      patch.voiceGender = app.pendingVoiceGender;
    }
    Store.updateProfile(patch);
    app.pendingVoiceGender = null;
    app.settingsOpen = false;
    overlayRoot.innerHTML = '';
    syncBodyState();
    renderAll();
    restoreFocus();
    toast('设置已保存，每天 ' + Store.getProfile().dailyGoal + ' 个词。', 'check');
  }

  function exportProgress() {
    const blob = new Blob([Store.exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '拾词学习记录-' + Store.todayKey() + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('备份文件已导出，请保存到安全的位置。', 'check');
  }

  function importProgressFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        Store.importState(String(reader.result || ''));
        toast('备份已读取，正在恢复。', 'check');
        window.setTimeout(function () { window.location.reload(); }, 120);
      } catch (error) {
        toast('导入失败：' + (error.message || '文件格式不正确'), 'info');
      }
    };
    reader.onerror = function () { toast('读取备份文件失败。', 'info'); };
    reader.readAsText(file);
  }

  async function restoreProgress() {
    const result = await Store.restoreRemoteState();
    if (!result.ok) {
      toast(
        result.reason === 'empty'
          ? '本机还没有可恢复的存档。'
          : (result.reason === 'integrity-mismatch'
            ? '本机存档完整性校验失败，未覆盖当前学习记录。'
            : '本机存档服务暂不可用。'),
        'info'
      );
      return;
    }
    trackProductEvent('sync_restore_succeeded', {
      bookId: Store.getActiveBookId(),
      source: 'local-server'
    });
    toast('正在从本机存档恢复。', 'check');
  }

  function setGoalInput(value) {
    const input = document.getElementById('settingsDailyGoal');
    if (!input) return;
    const next = Math.max(Store.MIN_DAILY_GOAL, Math.min(Store.MAX_DAILY_GOAL, Math.round(Number(value) || Store.getProfile().dailyGoal)));
    input.value = String(next);
    input.focus();
  }

  function nudgeGoalInput(step) {
    const input = document.getElementById('settingsDailyGoal');
    if (!input) return;
    const current = Math.round(Number(input.value) || Store.getProfile().dailyGoal);
    setGoalInput(current + (Number(step) || 0));
  }

  function askReset() {
    showModal({
      icon: 'trash',
      title: '清除全部学习记录？',
      message: '所有学习进度、收藏、连续天数和学习报告都会被清空，且无法恢复。这个词库本身不会被删除。',
      cancelLabel: '再想想',
      confirmLabel: '确认清除',
      danger: true,
      onConfirm: function () {
        closeModal(false);
        Store.resetAll();
        closeAllOverlays({ skipRender: true, silent: true });
        navigate('home');
        renderAll();
        toast('学习记录已清空，可以重新开始。', 'check');
      }
    });
  }

  // ---------------------------------------------------------------------
  // Speech
  // ---------------------------------------------------------------------

  const FEMALE_US_VOICES = [
    'samantha', 'ava', 'allison', 'susan', 'victoria', 'karen', 'tessa',
    'serena', 'aria', 'jenny', 'zira', 'michelle', 'google us english',
    'microsoft aria', 'microsoft jenny', 'microsoft zira'
  ];
  const MALE_US_VOICES = [
    'alex', 'fred', 'tom', 'aaron', 'evan', 'nathan', 'david', 'mark',
    'ryan', 'christopher', 'eric', 'brian', 'guy', 'microsoft guy',
    'microsoft david', 'microsoft mark', 'microsoft ryan'
  ];

  function englishVoices() {
    return window.speechSynthesis.getVoices().filter(function (voice) {
      return /^en-US$/i.test(String(voice.lang || '').replace('_', '-'));
    });
  }

  function voiceNameMatches(voice, names) {
    const name = String(voice.name || '').toLowerCase();
    return names.some(function (candidate) { return name.indexOf(candidate) !== -1; });
  }

  function preferredUsVoice(gender) {
    const voices = englishVoices();
    const names = gender === 'male' ? MALE_US_VOICES : FEMALE_US_VOICES;
    return voices.find(function (voice) { return voiceNameMatches(voice, names); }) ||
      voices.find(function (voice) { return voice.localService; }) ||
      voices[0] || null;
  }

  function speechProfile() {
    const profile = Store.getProfile();
    return {
      gender: app.pendingVoiceGender === 'male' || app.pendingVoiceGender === 'female'
        ? app.pendingVoiceGender
        : (profile.voiceGender === 'male' ? 'male' : 'female'),
      rate: Math.max(0.7, Math.min(1.15, Number(profile.voiceRate) || 0.9))
    };
  }

  function speakWord(word, button) {
    if (!word) return;
    if (!('speechSynthesis' in window)) {
      toast('当前浏览器不支持语音朗读，可以先用音标练习。', 'info');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const isChinese = /[\u3400-\u9fff]/.test(word);
      const profile = speechProfile();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = isChinese ? 'zh-CN' : 'en-US';
      utterance.rate = isChinese ? 0.72 : profile.rate;
      utterance.pitch = isChinese ? 1 : (profile.gender === 'male' ? 0.86 : 1.06);
      const voices = window.speechSynthesis.getVoices();
      const preferred = isChinese
        ? (voices.find(function (voice) { return /^zh-CN/i.test(voice.lang); }) ||
          voices.find(function (voice) { return /^zh/i.test(voice.lang); }))
        : preferredUsVoice(profile.gender);
      if (preferred) utterance.voice = preferred;
      if (button) {
        button.classList.add('is-speaking');
        const stop = function () { button.classList.remove('is-speaking'); };
        utterance.onend = stop;
        utterance.onerror = stop;
      }
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      toast('发音暂时没有播放出来，请再试一次。', 'volume');
    }
  }

  function autoSpeakCurrentCard(session) {
    if (!session || session.completed || session.phase !== 'cards') return;
    const item = session.queue[session.index];
    if (!item) return;
    const key = String(session.startedAt) + ':' + session.index + ':' + item.id;
    if (app.lastAutoSpokenCardKey === key) return;
    app.lastAutoSpokenCardKey = key;
    const word = Store.getWord(item.id);
    if (!word || !word.word) return;
    window.setTimeout(function () {
      if (app.session !== session || session.completed || session.phase !== 'cards') return;
      const current = session.queue[session.index];
      if (!current || current.id !== item.id) return;
      speakWord(word.word, null);
    }, 120);
  }

  function setVoiceGender(gender, element) {
    if (gender !== 'male' && gender !== 'female') return;
    app.pendingVoiceGender = gender;
    document.querySelectorAll('[data-action="set-voice-gender"]').forEach(function (button) {
      const active = button.getAttribute('data-gender') === gender;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (element) element.focus({ preventScroll: true });
  }

  function previewVoice() {
    speakWord('Learning one word at a time makes a difference.', null);
  }

  // ---------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------

  function toast(message, iconName) {
    if (!toastRegion) return;
    while (toastRegion.children.length >= 3) {
      toastRegion.removeChild(toastRegion.firstElementChild);
    }
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = UI.helpers.icon(iconName || 'check') + '<span>' + esc(message) + '</span>';
    toastRegion.appendChild(node);
    window.setTimeout(function () {
      node.classList.add('is-leaving');
      window.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 240);
    }, 2500);
  }

  document.addEventListener('shici:conflict', function () {
    if (app.conflictNoticeShown || app.modal) return;
    app.conflictNoticeShown = true;
    showModal({
      icon: 'info',
      title: '发现另一份更新的学习记录',
      message: '本页已暂停保存，两端记录都已经留底。你可以使用另一份记录，也可以确认保留本页记录；如有疑问，先用“导出记录”备份。',
      cancelLabel: '使用另一份',
      confirmLabel: '保留本页',
      extraLabel: '导出记录',
      onCancel: function () {
        closeModal(false);
        document.dispatchEvent(new CustomEvent('shici:resolve-conflict', {
          detail: { choice: 'use-incoming' }
        }));
      },
      onExtra: function () {
        exportProgress();
      },
      onConfirm: function () {
        closeModal(false);
        document.dispatchEvent(new CustomEvent('shici:resolve-conflict', {
          detail: { choice: 'keep-local' }
        }));
        toast('已保留本页记录，并重新尝试保存。', 'check');
      }
    });
  });

  document.addEventListener('shici:saved', function (event) {
    const detail = event.detail || {};
    if (detail.ok === true) {
      app.saveFailureNoticeShown = false;
      return;
    }
    if (detail.ok !== false || detail.error === 'multi-tab conflict' ||
        app.saveFailureNoticeShown || app.modal) return;
    app.saveFailureNoticeShown = true;
    showModal({
      icon: 'info',
      title: '学习记录暂时无法保存',
      message: '浏览器主存储和备份数据库都没有确认写入。请先导出当前记录，再检查浏览器剩余空间或隐私设置。',
      cancelLabel: '稍后处理',
      confirmLabel: '重新尝试',
      extraLabel: '导出记录',
      onExtra: function () {
        exportProgress();
      },
      onConfirm: function () {
        closeModal(false);
        Store.updateProfile({});
      }
    });
  });

  // ---------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------

  function handleAction(action, element, event) {
    switch (action) {
      case 'navigate':
        navigate(element.getAttribute('data-route') || 'home');
        break;
      case 'speak':
        speakWord(element.getAttribute('data-word'), element);
        break;
      case 'set-voice-gender':
        setVoiceGender(element.getAttribute('data-gender'), element);
        break;
      case 'preview-voice':
        previewVoice();
        break;
      case 'open-word':
        openWordDrawer(element.getAttribute('data-word-id'));
        break;
      case 'toggle-favorite':
        toggleFavorite(element.getAttribute('data-word-id'));
        break;
      case 'mark-mastered':
        markMastered(element.getAttribute('data-word-id'));
        break;
      case 'study-single': {
        const id = element.getAttribute('data-word-id');
        const word = Store.getWord(id);
        if (!word) return;
        const kind = Store.hasRecord(id) ? 'review' : 'new';
        closeDrawer();
        startSession('single', [{ id: id, kind: kind }]);
        break;
      }
      case 'start-daily':
        startSession('daily');
        break;
      case 'start-first':
        startSession('new', Store.buildNewQueue(5));
        break;
      case 'start-new':
        startSession('new');
        break;
      case 'start-extra-new':
        startSession('extra-new');
        break;
      case 'start-review':
        startSession('review');
        break;
      case 'start-practice':
        startSession('practice');
        break;
      case 'start-learned':
        startSession('learned');
        break;
      case 'start-spelling':
        startSpellingSession();
        break;
      case 'start-training':
        startRetrievalSession();
        break;
      case 'scroll-to-rhythm': {
        const node = document.getElementById('memory-rhythm');
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
      case 'reveal':
        revealCard();
        break;
      case 'rate':
        rateCard(element.getAttribute('data-rating'));
        break;
      case 'quiz-answer':
        answerQuizOption(element.getAttribute('data-index'));
        break;
      case 'quiz-next':
        nextQuizQuestion();
        break;
      case 'relearn-weak':
        relearnWeakWords();
        break;
      case 'relearn-session-words': {
        const summary = app.session && app.session.summary;
        startRelearnSession((summary && (summary.remainingWords || summary.weakWords || summary.missed)) || []);
        break;
      }
      case 'start-relearn-all':
        relearnAllWeak();
        break;
      case 'exit-session':
        requestExitSession();
        break;
      case 'session-another':
        sessionAnother();
        break;
      case 'finish-to-report':
        finishTo('report');
        break;
      case 'finish-to-home':
        finishTo('home');
        break;
      case 'check-spelling':
        if (event) event.preventDefault();
        checkSpelling();
        break;
      case 'next-spelling':
        nextSpelling();
        break;
      case 'spell-hint':
        showSpellingHint();
        break;
      case 'spell-another':
        startSpellingSession();
        break;
      case 'open-settings':
        openSettings();
        break;
      case 'save-settings':
        saveSettings();
        break;
      case 'goal-step':
        nudgeGoalInput(element.getAttribute('data-step'));
        break;
      case 'set-goal':
        setGoalInput(element.getAttribute('data-value'));
        break;
      case 'export-progress':
        exportProgress();
        break;
      case 'import-progress': {
        const input = document.getElementById('importProgressFile');
        if (input) input.click();
        break;
      }
      case 'restore-remote':
        restoreProgress();
        break;
      case 'ask-reset':
        askReset();
        break;
      case 'close-drawer':
        closeDrawer();
        break;
      case 'set-library-status':
        setLibraryStatus(element.getAttribute('data-value'));
        break;
      case 'set-library-unit':
        setLibraryUnit(element.getAttribute('data-value'));
        break;
      case 'clear-library-search':
        clearLibrarySearch();
        break;
      case 'reset-library':
        resetLibraryFilters();
        break;
      case 'library-load-more':
        app.library.page = (Number(app.library.page) || 1) + 1;
        renderPage();
        break;
      case 'set-report-words-filter':
        app.reportWords.filter = element.getAttribute('data-value') || 'all';
        app.reportWords.page = 1;
        renderPage();
        break;
      case 'report-words-more':
        app.reportWords.page = (Number(app.reportWords.page) || 1) + 1;
        renderPage();
        break;
      case 'open-memory-wall':
        navigate('print');
        break;
      case 'set-wall-layout':
        app.memoryWall.layout = ['sticky', 'strip', 'wall'].indexOf(element.getAttribute('data-value')) !== -1
          ? element.getAttribute('data-value')
          : 'sticky';
        renderPage();
        break;
      case 'set-wall-scope':
        app.memoryWall.scope = ['recent', 'weak', 'favorite'].indexOf(element.getAttribute('data-value')) !== -1
          ? element.getAttribute('data-value')
          : 'recent';
        renderPage();
        break;
      case 'set-wall-count':
        app.memoryWall.count = [12, 24, 40].indexOf(Number(element.getAttribute('data-value'))) !== -1
          ? Number(element.getAttribute('data-value'))
          : 24;
        renderPage();
        break;
      case 'toggle-wall-option': {
        const option = element.getAttribute('data-option');
        if (option === 'showMeaning' || option === 'showIpa' || option === 'showExample') {
          app.memoryWall[option] = !app.memoryWall[option];
          renderPage();
        }
        break;
      }
      case 'buy-memory-wall':
        openMemoryWallPaywall();
        break;
      case 'activate-memory-wall':
        openMemoryWallLicenseModal();
        break;
      case 'print-memory-wall':
        printMemoryWall();
        break;
      case 'switch-book':
        switchBook(element.getAttribute('data-book-id'));
        break;
      case 'modal-cancel':
        if (app.modal && typeof app.modal.onCancel === 'function') {
          app.modal.onCancel();
        } else {
          closeModal(true);
        }
        break;
      case 'modal-extra': {
        const extraCallback = app.modal && app.modal.onExtra;
        if (typeof extraCallback === 'function') extraCallback();
        else closeModal(true);
        break;
      }
      case 'modal-confirm': {
        const callback = app.modal && app.modal.onConfirm;
        if (typeof callback === 'function') callback();
        else closeModal(true);
        break;
      }
      case 'modal-backdrop':
        if (event && event.target.classList && event.target.classList.contains('modal-layer')) {
          closeModal(true);
        }
        break;
      default:
        break;
    }
  }

  document.addEventListener('click', function (event) {
    const actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.getAttribute('data-action');
      if (action === 'modal-backdrop') {
        if (event.target.classList.contains('modal-layer')) closeModal(true);
        return;
      }
      // 避免点击抽屉内部时误触背景关闭。
      if (action === 'close-drawer' && actionEl.classList.contains('overlay-backdrop') && !event.target.classList.contains('overlay-backdrop')) {
        return;
      }
      event.preventDefault();
      handleAction(action, actionEl, event);
      return;
    }

    const row = event.target.closest('.word-row[data-open-word]');
    if (row && !event.target.closest('button, a')) {
      openWordDrawer(row.getAttribute('data-open-word'));
      return;
    }
    if (!event.target.closest('.global-search')) hideSearchSuggest();
  });

  document.addEventListener('submit', function (event) {
    if (event.target.id === 'globalSearch') {
      submitGlobalSearch(event);
      return;
    }
    if (event.target.id === 'spellForm') {
      event.preventDefault();
      if (!app.session || app.session.type !== 'spelling') return;
      if (app.session.checked) nextSpelling();
      else checkSpelling();
    }
  });

  document.addEventListener('input', function (event) {
    const target = event.target;
    if (target.id === 'globalSearchInput') {
      showSearchSuggest(target.value);
      return;
    }
    if (target.id === 'librarySearch') {
      app.library.query = target.value;
      app.library.page = 1;
      syncLibraryHash();
      window.clearTimeout(app.libraryTimer);
      if (app.composing) return;
      app.libraryTimer = window.setTimeout(function () {
        renderPage({ focusLibrary: true });
      }, 170);
      return;
    }
    if (target.id === 'spellInput' && app.session && app.session.type === 'spelling') {
      app.session.draft = target.value;
    }
  });

  document.addEventListener('compositionstart', function (event) {
    if (event.target && event.target.id === 'librarySearch') app.composing = true;
  });

  document.addEventListener('compositionend', function (event) {
    if (!event.target || event.target.id !== 'librarySearch') return;
    app.composing = false;
    app.library.query = event.target.value;
    app.library.page = 1;
    syncLibraryHash();
    window.clearTimeout(app.libraryTimer);
    renderPage({ focusLibrary: true });
  });

  document.addEventListener('keydown', function (event) {
    const target = event.target;
    const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (event.key === 'Escape') {
      if (app.modal) {
        closeModal(true);
        return;
      }
      if (app.wordDrawerId || app.settingsOpen) {
        closeDrawer();
        return;
      }
      if (app.session) {
        requestExitSession();
        return;
      }
      hideSearchSuggest();
      if (target && target.id === 'globalSearchInput') target.blur();
      return;
    }

    if (app.modal) {
      if (event.key === 'Enter') {
        event.preventDefault();
        const confirm = modalRoot.querySelector('[data-action="modal-confirm"]');
        if (confirm) confirm.click();
      }
      return;
    }

    if (app.settingsOpen) {
      if (event.key === 'Enter' && target && target.tagName === 'INPUT') {
        event.preventDefault();
        saveSettings();
      }
      return;
    }

    if (event.key === '/' && !isTyping && !app.session && !app.wordDrawerId && !app.settingsOpen) {
      event.preventDefault();
      if (window.matchMedia('(max-width: 700px)').matches) {
        navigate('library');
        window.setTimeout(focusLibrarySearch, 60);
      } else {
        const input = document.getElementById('globalSearchInput');
        if (input) input.focus();
      }
      return;
    }

    if (!app.session) return;

    if (app.wordDrawerId || app.settingsOpen) return;

    if (app.session.completed) {
      if (event.key === 'Enter') {
        const card = overlayRoot.querySelector('.summary-card');
        if (!document.activeElement || document.activeElement === card || document.activeElement === document.body) {
          event.preventDefault();
          const primary = overlayRoot.querySelector('.summary-actions .btn--primary');
          if (primary) primary.click();
        }
      }
      return;
    }

    if (app.session.phase === 'quiz') {
      const quiz = app.session.quiz;
      if (!quiz) return;
      if (!quiz.answered && ['1', '2', '3', '4'].indexOf(event.key) !== -1) {
        event.preventDefault();
        answerQuizOption(Number(event.key) - 1);
      } else if (quiz.answered && event.key === 'Enter') {
        event.preventDefault();
        nextQuizQuestion();
      }
      return;
    }

    if (app.session.type === 'spelling') {
      if (event.key === 'Enter' && app.session.checked && !isTyping) {
        event.preventDefault();
        nextSpelling();
      }
      return;
    }

    if (isTyping) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (!app.session.revealed) {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        revealCard();
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        const item = app.session.queue[app.session.index];
        const word = item && Store.getWord(item.id);
        if (word) speakWord(word.word, null);
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        const item = app.session.queue[app.session.index];
        if (item) toggleFavorite(item.id);
      }
    } else {
      if (event.key === '1' || event.key === '2' || event.key === '3') {
        event.preventDefault();
        rateCard(event.key === '1' ? 'again' : (event.key === '2' ? 'fuzzy' : 'known'));
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        const item = app.session.queue[app.session.index];
        const word = item && Store.getWord(item.id);
        if (word) speakWord(word.word, null);
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        const item = app.session.queue[app.session.index];
        if (item) toggleFavorite(item.id);
      }
    }
  });

  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'importProgressFile') {
      importProgressFile(event.target.files && event.target.files[0]);
      event.target.value = '';
    }
  });

  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'settingsVoiceRate') {
      const output = document.getElementById('settingsVoiceRateValue');
      if (output) output.textContent = Number(event.target.value).toFixed(2) + '×';
    }
  });

  document.getElementById('topbarProfile').addEventListener('click', openSettings);
  document.getElementById('sidebarProfile').addEventListener('click', openSettings);
  document.getElementById('streakPill').addEventListener('click', function () {
    navigate('report');
  });

  const globalSearch = document.getElementById('globalSearch');
  const globalSearchInput = document.getElementById('globalSearchInput');
  if (globalSearchInput) {
    globalSearchInput.addEventListener('focus', function () {
      if (globalSearchInput.value.trim()) showSearchSuggest(globalSearchInput.value);
    });
  }
  if (globalSearch) {
    globalSearch.addEventListener('click', function (event) {
      if (window.matchMedia('(max-width: 700px)').matches && !event.target.closest('input')) {
        event.preventDefault();
        navigate('library');
        window.setTimeout(focusLibrarySearch, 60);
      }
    });
  }

  window.addEventListener('hashchange', handleHashChange);

  window.addEventListener('scroll', function () {
    const topbar = document.getElementById('topbar');
    if (!topbar) return;
    topbar.classList.toggle('is-scrolled', window.scrollY > 8);
  }, { passive: true });

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  function getBookMeta(bookId) {
    return (window.BOOKS || []).find(function (book) { return book.id === bookId; }) || null;
  }

  function setBootState(title, text, isError) {
    const screen = document.getElementById('bootScreen');
    if (!screen) return;
    screen.hidden = false;
    screen.classList.remove('is-hiding');
    screen.classList.toggle('is-error', Boolean(isError));
    const titleNode = screen.querySelector('.boot-screen__title');
    const textNode = document.getElementById('bootText');
    const retry = document.getElementById('bootRetry');
    if (titleNode) titleNode.textContent = title;
    if (textNode) textNode.textContent = text;
    if (retry) retry.hidden = !isError;
  }

  function hideBootScreen() {
    const screen = document.getElementById('bootScreen');
    if (!screen || screen.hidden) return;
    screen.classList.add('is-hiding');
    window.setTimeout(function () {
      if (screen && screen.classList.contains('is-hiding')) screen.hidden = true;
    }, 380);
  }

  function withAssetVersion(path, version) {
    return path + (window.location.protocol === 'file:' ? '' : '?v=' + (version || ASSET_VERSION));
  }

  function loadScriptOnce(path, key, version, priority) {
    if (bookScriptPromises.has(key)) return bookScriptPromises.get(key);
    const promise = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = withAssetVersion(path, version);
      script.async = true;
      script.fetchPriority = priority || 'high';
      script.dataset.shiciScript = key;
      script.onload = function () { resolve(); };
      script.onerror = function () {
        reject(new Error('无法加载 ' + path));
      };
      document.head.appendChild(script);
    }).catch(function (error) {
      bookScriptPromises.delete(key);
      throw error;
    });
    bookScriptPromises.set(key, promise);
    return promise;
  }

  async function fetchBookIndex() {
    if (bookIndexCache) return bookIndexCache;
    if (!window.__SHICI_BOOK_INDEX__) {
      await loadScriptOnce('data/books/index.js', 'book-index', BOOK_ASSET_VERSION);
    }
    if (!window.__SHICI_BOOK_INDEX__) throw new Error('词书索引缺失');
    bookIndexCache = window.__SHICI_BOOK_INDEX__;
    return bookIndexCache;
  }

  async function fetchBookManifest(bookId) {
    const existing = window.__SHICI_BOOK_MANIFESTS__ && window.__SHICI_BOOK_MANIFESTS__[bookId];
    if (existing) return existing;
    await loadScriptOnce(
      'data/books/' + bookId + '.manifest.js',
      'book-manifest-' + bookId,
      BOOK_ASSET_VERSION,
      'high'
    );
    return window.__SHICI_BOOK_MANIFESTS__ && window.__SHICI_BOOK_MANIFESTS__[bookId];
  }

  async function fetchBookChunk(bookId, chunk, priority) {
    const key = bookId + ':' + chunk.index;
    const existing = window.__SHICI_BOOK_CHUNKS__ && window.__SHICI_BOOK_CHUNKS__[key];
    if (existing) return existing;
    await loadScriptOnce(
      chunk.path,
      'book-chunk-' + bookId + '-' + chunk.index,
      BOOK_ASSET_VERSION,
      priority
    );
    return window.__SHICI_BOOK_CHUNKS__ && window.__SHICI_BOOK_CHUNKS__[key];
  }

  function compactBookPayload(bookId, manifest, chunks, partial) {
    const words = [];
    chunks.forEach(function (chunk) {
      if (chunk && Array.isArray(chunk.words)) words.push.apply(words, chunk.words);
    });
    return {
      id: bookId,
      version: manifest.version || 1,
      words: words,
      units: manifest.units,
      wordIds: manifest.wordIds,
      unitIds: manifest.unitIds,
      wordCount: manifest.wordCount,
      partial: Boolean(partial)
    };
  }

  async function loadFullSplitBook(bookId, manifest) {
    if (bookFullPromises.has(bookId)) return bookFullPromises.get(bookId);
    const promise = (async function () {
      const chunks = [];
      for (const chunkMeta of manifest.chunks) {
        chunks.push(await fetchBookChunk(bookId, chunkMeta, 'low'));
      }
      const payload = compactBookPayload(bookId, manifest, chunks, false);
      if (payload.words.length !== manifest.wordCount ||
          payload.wordIds.length !== manifest.wordCount) {
        throw new Error('分段词书数量不一致');
      }
      bookCache.set(bookId, payload);
      if (Store.getActiveBookId() === bookId) {
        Store.loadBook(bookId, payload);
        if (!app.session) {
          renderAll();
        } else {
          renderChrome(Store.getOverview());
        }
      }
      return payload;
    })().catch(function (error) {
      bookFullPromises.delete(bookId);
      throw error;
    });
    bookFullPromises.set(bookId, promise);
    return promise;
  }

  function scheduleFullSplitBook(bookId, manifest) {
    let waits = 0;
    function start() {
      if (!Number.isFinite(window.__SHICI_BOOT_MS) && waits < 200) {
        waits += 1;
        window.setTimeout(start, 120);
        return;
      }
      if (!Number.isFinite(window.__SHICI_BOOT_MS)) return;
      loadFullSplitBook(bookId, manifest).catch(function () {
        // The first chunk keeps the app usable; a later navigation can retry.
      });
    }
    window.setTimeout(start, 60);
  }

  async function fetchBookPayload(bookId) {
    if (bookCache.has(bookId)) return bookCache.get(bookId);
    try {
      const manifest = await fetchBookManifest(bookId);
      if (!manifest || !Array.isArray(manifest.chunks) || !manifest.chunks.length) {
        throw new Error('分段词书清单缺失');
      }
      const firstChunk = await fetchBookChunk(bookId, manifest.chunks[0], 'high');
      const payload = compactBookPayload(bookId, manifest, [firstChunk], manifest.chunks.length > 1);
      bookCache.set(bookId, payload);
      if (manifest.chunks.length > 1) scheduleFullSplitBook(bookId, manifest);
      return payload;
    } catch (splitError) {
      // Older deployments may still have only the monolithic book payload.
      if (bookCache.has(bookId)) return bookCache.get(bookId);
    }
    if (!window.__SHICI_BOOKS__ || !window.__SHICI_BOOKS__[bookId]) {
      await loadScriptOnce('data/books/' + bookId + '.js', 'book-' + bookId, BOOK_ASSET_VERSION);
    }
    const payload = window.__SHICI_BOOKS__ && window.__SHICI_BOOKS__[bookId];
    if (!payload || !Array.isArray(payload.words) || !Array.isArray(payload.units)) {
      throw new Error('词书数据不完整');
    }
    bookCache.set(bookId, payload);
    return payload;
  }

  async function switchBook(bookId) {
    const meta = getBookMeta(bookId);
    if (!meta) return;
    if (bookId === Store.getActiveBookId()) {
      navigate('study');
      return;
    }
    app.bookLoadingId = bookId;
    setBootState('正在打开「' + meta.title + '」', '把 ' + meta.count + ' 个词放进书架，马上就好。', false);
    try {
      const results = await Promise.all([
        fetchBookPayload(bookId),
        fetchBookIndex().catch(function () { return null; })
      ]);
      if (results[1]) Store.setBookIndex(results[1]);
      let payload = results[0];
      const cachedPayload = bookCache.get(bookId);
      if (cachedPayload && !cachedPayload.partial) payload = cachedPayload;
      Store.activateBook(bookId, payload);
      app.library = { query: '', status: 'all', unit: 'all', page: 1 };
      app.bookLoadingId = null;
      hideBootScreen();
      navigate('home');
      toast('已切换到「' + meta.title + '」。今天从这本开始。', 'book');
    } catch (error) {
      app.bookLoadingId = null;
      setBootState('词书没有打开', '请确认 data/books 文件夹与页面在一起，或刷新后重试。', true);
    }
  }

  function registerOfflineSupport() {
    if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {
      // 离线是增强能力；注册失败不能阻止在线学习。
    });
  }

  function scheduleAfterBoot(callback) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(callback, { timeout: 1200 });
      return;
    }
    window.setTimeout(callback, 0);
  }

  function markBootReady() {
    try {
      performance.mark('shici-boot-ready');
      const measure = performance.measure('shici-boot', 'shici-boot-start', 'shici-boot-ready');
      window.__SHICI_BOOT_MS = Math.max(0, Math.round(measure.duration));
    } catch (error) {
      window.__SHICI_BOOT_MS = null;
    }
  }

  async function boot() {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#home');
    }
    document.getElementById('bootScreen').hidden = false;
    const retry = document.getElementById('bootRetry');
    if (retry) retry.addEventListener('click', function () { window.location.reload(); });

    const initialBookId = Store.getProfile().activeBook || window.DEFAULT_BOOK || 'gaokao';
    let meta = getBookMeta(initialBookId) || getBookMeta(window.DEFAULT_BOOK) || (window.BOOKS || [])[0];
    setBootState('正在打开「' + (meta ? meta.title : '词书') + '」', '把今天的词，慢慢收进口袋。', false);

    try {
      const bookPromise = fetchBookPayload(meta.id).then(
        function (payload) { return { payload: payload }; },
        function (error) { return { error: error }; }
      );
      const recoveryPromise = (async function () {
        await Store.hydrateFromIndexedDb();
        return Store.prepareRemote();
      })().catch(function () {
        return { mode: 'browser', restored: false };
      });
      const entitlementPromise = Entitlements
        ? Entitlements.initialize()
        : Promise.resolve({ checked: true, unlocked: false });
      const results = await Promise.all([
        bookPromise,
        recoveryPromise,
        entitlementPromise
      ]);
      const persistence = results[1];
      if (persistence && persistence.restored) return;
      if (results[0].error) throw results[0].error;
      let payload = results[0].payload;
      const activeBookId = Store.getActiveBookId();
      if (activeBookId !== meta.id) {
        meta = getBookMeta(activeBookId) || meta;
        setBootState('正在打开「' + meta.title + '」', '正在读取本机恢复后的词书。', false);
        payload = await fetchBookPayload(meta.id);
      }
      const cachedPayload = bookCache.get(activeBookId);
      if (cachedPayload && !cachedPayload.partial) payload = cachedPayload;
      Store.loadBook(activeBookId, payload);
      parseHash();
      renderAll();
      trackProductEvent('app_open', {
        route: app.route,
        bookId: Store.getActiveBookId()
      });
      hideBootScreen();
      markBootReady();
      // Register after the initial book has loaded. A new worker taking control
      // during boot can interrupt dynamically loaded book scripts on upgrade.
      registerOfflineSupport();
      scheduleAfterBoot(function () {
        Store.requestPersistentStorage().catch(function () {});
        fetchBookIndex().then(function (index) {
          if (index) Store.setBookIndex(index);
        }).catch(function () {});
      });
      window.setTimeout(function () {
        if (window.speechSynthesis) window.speechSynthesis.getVoices();
      }, 300);
    } catch (error) {
      setBootState('词书没有打开', '没有读到词书文件。请确认 data/books 文件夹与页面在一起，然后刷新重试。', true);
    }
  }

  boot();
})();
