/* 拾词 · 视图渲染 */
(function () {
  'use strict';

  const UI = {};

  function currentWords() {
    return window.Store ? window.Store.words : window.WORDS;
  }

  function currentUnits() {
    return window.Store ? window.Store.units : window.UNITS;
  }

  function icon(name, extra) {
    return '<svg class="icon' + (extra ? ' ' + extra : '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function unitFor(word) {
    const units = currentUnits();
    return units.find(function (unit) { return unit.id === word.unit; }) || units[0] || { id: 1, title: '词书', en: 'WORDS', description: '', icon: 'book', accent: '#315A4A', tint: '#E5EADF' };
  }

  function unitStyle(unit) {
    return '--unit-accent:' + unit.accent + ';--tint:' + unit.tint + ';';
  }

  function unitDisplay(unit) {
    if (!unit) return '';
    if (String(unit.title).indexOf('乱序') === 0 ||
        String(unit.title).indexOf('核心') === 0 ||
        String(unit.title).indexOf('拓展') === 0) return unit.title;
    return String(unit.id).padStart(2, '0') + ' ' + unit.title;
  }

  function levelBadge(level) {
    const info = window.LEVELS[level];
    if (!info) return '';
    return '<span class="word-level ' + info.className + '">' + esc(info.label) + '</span>';
  }

  function statusMeta(status) {
    if (status === 'mastered') return { label: '已掌握', className: 'status-pill--mastered' };
    if (status === 'weak') return { label: '待巩固', className: 'status-pill--weak' };
    if (status === 'learning') return { label: '学习中', className: 'status-pill--learning' };
    return { label: '未学习', className: 'status-pill--new' };
  }

  function statusPill(status) {
    const meta = statusMeta(status);
    return '<span class="status-pill ' + meta.className + '"><i class="dot"></i>' + meta.label + '</span>';
  }

  function coreMeanings(word) {
    if (word && Array.isArray(word.coreMeanings) && word.coreMeanings.length) return word.coreMeanings;
    return word && Array.isArray(word.meanings) ? word.meanings.slice(0, 2) : [];
  }

  function extendedMeanings(word) {
    const core = coreMeanings(word);
    const extended = word && Array.isArray(word.extendedMeanings) ? word.extendedMeanings : (word && Array.isArray(word.meanings) ? word.meanings : []);
    return extended.filter(function (meaning, index) {
      return extended.indexOf(meaning) === index && core.indexOf(meaning) === -1;
    });
  }

  function extendedMeaningsHTML(word) {
    const extra = extendedMeanings(word);
    if (!extra.length) return '';
    return '<details class="extended-meanings"><summary>拓展义项 · ' + extra.length + ' 个</summary>' +
      '<div class="meaning-chip-row">' + extra.map(function (meaning) {
        return '<span class="meaning-chip"><em>' + esc(word.pos || '') + '</em>' + esc(meaning) + '</span>';
      }).join('') + '</div></details>';
  }

  function weaknessLabel(record) {
    if (!record || !record.weak) return '';
    const types = Object.keys(record.errorTypes || {}).sort(function (a, b) {
      return (record.errorTypes[b] || 0) - (record.errorTypes[a] || 0);
    });
    const labels = {
      meaning_confusion: '词义混淆',
      usage_context: '语境用法',
      spelling_omission: '漏字母',
      spelling_extra: '多字母',
      spelling_order: '字母顺序',
      spelling_confusion: '拼写混淆'
    };
    if (types.length && labels[types[0]]) return labels[types[0]];
    if (record.confusions && record.confusions.length) return '易混项待复习';
    return '需要再提取一次';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function activeBook() {
    return (window.Store && window.Store.getBookMeta()) || (window.BOOKS || [])[0] || null;
  }

  function bookLoadingBadge() {
    const state = window.__SHICI_BOOK_LOAD_STATE__;
    if (!state || state.complete || !state.total) return '';
    return '<span class="pill book-load-pill">' + state.loaded + ' / ' + state.total + ' 词载入中</span>';
  }

  function bookContextHTML(variant) {
    const book = activeBook();
    if (!book) return '';
    const extra = variant ? ' book-context--' + variant : '';
    return '<button class="book-context' + extra + '" type="button" data-action="navigate" data-route="books" style="--book-accent:' + book.accent + ';--book-tint:' + book.tint + ';">' +
      '<span class="book-context__mark">' + esc(book.coverMark) + '</span>' +
      '<span class="book-context__copy"><small>当前词书</small><strong>' + esc(book.title) + '</strong></span>' +
      '<span class="book-context__count">' + book.count + ' 词</span>' +
      icon('chevron-right') +
      '</button>';
  }


  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function wordStem(word) {
    if (word.length > 4 && /[ey]$/.test(word)) return word.slice(0, -1);
    return word;
  }

  function highlight(text, word) {
    const safe = esc(text);
    const stem = escapeRegExp(wordStem(word));
    const pattern = new RegExp('\\b(' + stem + '[a-z]*)', 'gi');
    return safe.replace(pattern, '<mark>$1</mark>');
  }

  function blankExample(text, word) {
    const safe = esc(text);
    const stem = escapeRegExp(wordStem(word));
    const pattern = new RegExp('\\b(' + stem + '[a-z]*)', 'gi');
    return safe.replace(pattern, '<span class="blank">＿＿＿＿</span>');
  }

  function formatDate(date) {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const weekdays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return {
      day: String(date.getDate()).padStart(2, '0'),
      month: months[date.getMonth()],
      monthCN: (date.getMonth() + 1) + '月',
      dateCN: (date.getMonth() + 1) + '月' + date.getDate() + '日',
      weekday: weekdays[date.getDay()],
      weekdayCN: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
      full: date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日'
    };
  }

  function greeting(date) {
    const hour = date.getHours();
    if (hour < 5) return '夜深了';
    if (hour < 11) return '早上好';
    if (hour < 13) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  function circleProgress(percent) {
    const value = clamp(Number(percent) || 0, 0, 100);
    const radius = 68;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - value / 100);
    return '<svg viewBox="0 0 160 160" aria-hidden="true">' +
      '<circle class="progress-ring__track" cx="80" cy="80" r="' + radius + '"></circle>' +
      '<circle class="progress-ring__value" cx="80" cy="80" r="' + radius +
      '" stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"></circle>' +
      '</svg>';
  }

  function miniRing(percent) {
    const value = clamp(Number(percent) || 0, 0, 100);
    const radius = 21.5;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - value / 100);
    return '<div class="mini-ring"><svg viewBox="0 0 52 52" aria-hidden="true">' +
      '<circle class="mini-ring__track" cx="26" cy="26" r="' + radius + '"></circle>' +
      '<circle class="mini-ring__value" cx="26" cy="26" r="' + radius +
      '" stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"></circle>' +
      '</svg><span class="mini-ring__label">' + Math.round(value) + '%</span></div>';
  }

  function branchSVG() {
    return '<svg class="hero-branch" viewBox="0 0 320 300" fill="none" aria-hidden="true">' +
      '<path d="M312 290C264 258 235 219 211 170c-24-50-55-86-103-113C77 38 42 28 8 24" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>' +
      '<path d="M211 170c5-42 20-70 46-88 2 34-8 61-29 83" stroke="currentColor" stroke-width="1"/>' +
      '<path d="M165 127c-3-35 6-61 26-80 10 29 8 54-5 76" stroke="currentColor" stroke-width="1"/>' +
      '<path d="M102 76c-7-25-4-45 8-61 12 21 15 41 9 60" stroke="currentColor" stroke-width="1"/>' +
      '<path d="M274 240c-21-8-37-23-46-47 25 3 43 13 54 33" stroke="currentColor" stroke-width="1"/>' +
      '<path d="M235 203c20-2 36 2 48 12-15 1-29-2-42-9" stroke="currentColor" stroke-width=".9" opacity=".6"/>' +
      '<circle cx="258" cy="63" r="2" fill="currentColor" opacity=".55"/>' +
      '<circle cx="121" cy="44" r="1.4" fill="currentColor" opacity=".4"/>' +
      '</svg>';
  }

  function curveSVG(id) {
    const fillId = 'curveFade-' + (id || Math.random().toString(36).slice(2, 7));
    return '<svg class="forgetting-curve" viewBox="0 0 520 132" role="img" aria-label="艾宾浩斯遗忘曲线与复习节点示意图">' +
      '<defs><linearGradient id="' + fillId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#6f8f7f" stop-opacity=".2"></stop>' +
      '<stop offset="100%" stop-color="#6f8f7f" stop-opacity="0"></stop></linearGradient></defs>' +
      '<line class="axis" x1="16" y1="112" x2="504" y2="112"></line>' +
      '<path class="decay-fill" fill="url(#' + fillId + ')" d="M16 112 L16 30 C48 32 80 70 100 76 L105 34 C138 36 170 78 195 83 L200 42 C235 45 265 85 290 89 L295 48 C330 52 360 90 385 95 L390 56 C430 59 465 92 504 100 L504 112 Z"></path>' +
      '<path class="decay" d="M16 30 C48 32 80 70 100 76 L105 34 C138 36 170 78 195 83 L200 42 C235 45 265 85 290 89 L295 48 C330 52 360 90 385 95 L390 56 C430 59 465 92 504 100"></path>' +
      '<line class="review-line" x1="105" y1="34" x2="105" y2="112"></line>' +
      '<line class="review-line" x1="200" y1="42" x2="200" y2="112"></line>' +
      '<line class="review-line" x1="295" y1="48" x2="295" y2="112"></line>' +
      '<line class="review-line" x1="390" y1="56" x2="390" y2="112"></line>' +
      '<circle class="review-dot" cx="105" cy="34" r="3"></circle>' +
      '<circle class="review-dot" cx="200" cy="42" r="3"></circle>' +
      '<circle class="review-dot" cx="295" cy="48" r="3"></circle>' +
      '<circle class="review-dot" cx="390" cy="56" r="3"></circle>' +
      '<text x="16" y="124" text-anchor="start">初次</text>' +
      '<text x="105" y="124" text-anchor="middle">1天</text>' +
      '<text x="200" y="124" text-anchor="middle">2天</text>' +
      '<text x="295" y="124" text-anchor="middle">4天</text>' +
      '<text x="390" y="124" text-anchor="middle">7天</text>' +
      '<text x="465" y="124" text-anchor="middle">15天</text>' +
      '<text x="501" y="99" text-anchor="end" opacity=".7">遗忘</text>' +
      '</svg>';
  }

  function rhythmChips() {
    return ['1天', '2天', '4天', '7天', '15天', '30天'].map(function (label) {
      return '<span class="rhythm-chip">' + label + '</span>';
    }).join('');
  }

  function findUnitProgress(unitId) {
    return window.Store.unitStats(unitId);
  }

  function getCurrentUnit() {
    const unstartedOrLearning = currentUnits().find(function (unit) {
      return window.Store.unitStats(unit.id).seen < window.Store.unitStats(unit.id).total;
    });
    return unstartedOrLearning || null;
  }

  function renderHome(data) {
    const overview = data.overview;
    const word = data.wordOfTheDay;
    const quote = data.quote;
    const planCount = overview.planCount;
    const hasPlan = planCount > 0;
    const goalReached = overview.goal > 0 && overview.todayUnique >= overview.goal;
    const taskParts = [];
    if (overview.planReviewCount > 0) taskParts.push(overview.planReviewCount + ' 个待复习');
    if (overview.planNewCount > 0) taskParts.push(overview.planNewCount + ' 个新词');

    let headline;
    let meta;
    let action;
    let actionLabel;
    if (hasPlan) {
      if (!overview.planNewCount) headline = '今天复习 <em>' + planCount + '</em> 个词';
      else if (!overview.planReviewCount && !overview.todayUnique) headline = '今天学习 <em>' + planCount + '</em> 个新词';
      else headline = '今日计划还剩 <em>' + planCount + '</em> 个词';
      meta = taskParts.join(' · ') + ' · 约 ' + (overview.estimatedMinutes || 1) + ' 分钟';
      action = 'start-daily';
      actionLabel = overview.todayUnique > 0 ? '继续今日学习' : '开始今日学习';
    } else {
      headline = goalReached ? '今日目标已完成' : '当前词书暂无计划任务';
      if (overview.reviewDueToday > 0) {
        meta = '还有 ' + overview.reviewDueToday + ' 个词待复习，可以继续巩固。';
        action = 'start-review';
        actionLabel = '继续复习';
      } else if (overview.newRemaining > 0) {
        meta = '还想多学一点？可以追加一组新词。';
        action = 'start-extra-new';
        actionLabel = '再学 ' + Math.min(overview.newRemaining, 10) + ' 个新词';
      } else if (overview.totalSeen > 0) {
        meta = '本书没有待学新词，可以抽查已经学过的词。';
        action = 'start-learned';
        actionLabel = '复习已学词';
      } else {
        meta = '到词书书架选一本词书，开始新的学习。';
        actionLabel = '选一本词书';
      }
    }
    const progressMax = Math.max(overview.goal, 1);
    const progressText = overview.todayUnique + ' / ' + overview.goal + ' 个词';
    const primary = action
      ? '<button class="btn btn--primary" type="button" data-action="' + action + '">' + actionLabel + ' ' + icon('arrow-right', 'icon--shift') + '</button>'
      : '<a class="btn btn--primary" href="#books">' + actionLabel + ' ' + icon('arrow-right') + '</a>';

    const unitRows = currentUnits().map(function (item) {
      const progress = findUnitProgress(item.id);
      return '<a class="home-unit-row" href="#library?unit=' + item.id + '" style="' + unitStyle(item) + '">' +
        '<span><strong>' + esc(item.title) + '</strong><small>' + progress.seen + ' / ' + progress.total + ' 词</small></span>' +
        '<span class="home-unit-row__track"><i style="width:' + progress.progress + '%"></i></span>' +
        '<em>' + progress.progress + '%</em>' + icon('chevron-right') +
        '</a>';
    }).join('');

    const dailyWord = word ? '<div class="home-daily-word" aria-labelledby="daily-word-title">' +
      '<span class="home-daily-word__label" id="daily-word-title">今日一词</span>' +
      '<strong lang="' + (word.lang === 'zh' ? 'zh-CN' : 'en') + '">' + esc(word.word) + '</strong>' +
      '<span>' + esc(coreMeanings(word).slice(0, 2).join('；')) + '</span>' +
      '<button class="audio-btn" type="button" data-action="speak" data-word="' + esc(word.word) + '" aria-label="朗读 ' + esc(word.word) + '">' + icon('volume') + '</button>' +
      '<button class="text-link" type="button" data-action="open-word" data-word-id="' + esc(word.id) + '">查看</button>' +
      '</div>' : '';

    return '' +
      '<header class="page-head home-head">' +
      '<div>' +
      '<p class="eyebrow">' + data.date.weekdayCN + ' · ' + data.date.dateCN + '</p>' +
      '<h1 class="page-title">今日学习</h1>' +
      '<p class="page-head__desc">' + esc(data.greeting) + '，' + esc(data.name || '同学') + '。不着急，一次记一个词。</p>' +
      '</div>' +
      '<div class="home-head__meta">' + bookLoadingBadge() + bookContextHTML('home') + '</div>' +
      '</header>' +

      '<section class="home-focus' + (goalReached ? ' is-done' : '') + '">' +
      '<article class="daily-card' + (goalReached ? ' daily-card--done' : '') + '" aria-labelledby="daily-plan-title">' +
      '<div class="daily-card__copy">' +
      '<p class="daily-card__eyebrow"><i class="live-dot" aria-hidden="true"></i> 今日计划</p>' +
      '<h2 id="daily-plan-title">' + headline + '</h2>' +
      '<p class="daily-card__meta">' + meta + '</p>' +
      '<div class="daily-card__actions">' + primary +
      '<a class="home-secondary" href="' + (hasPlan ? '#study' : '#report') + '">' + (hasPlan ? '全部学习方式' : '学习报告') + '</a>' +
      '</div>' +
      '<div class="daily-card__progress"><div><span>今日进度</span><strong>' + progressText + '</strong></div>' +
      '<progress aria-label="今日学习进度" aria-valuetext="已学 ' + overview.todayUnique + ' 个词，目标 ' + overview.goal + ' 个词" max="' + progressMax + '" value="' + Math.min(overview.todayUnique, progressMax) + '"></progress></div>' +
      '</div>' +
      '</article>' +

      '<section class="stat-strip" aria-label="学习概况">' +
      '<span><small>待复习</small><strong>' + overview.reviewDueToday + '</strong></span>' +
      '<span><small>已掌握</small><strong>' + overview.mastered + ' / ' + overview.totalWords + '</strong></span>' +
      '<span><small>连续学习</small><strong>' + overview.streak + ' 天</strong></span>' +
      '</section>' +
      dailyWord +
      '</section>' +

      '<details class="home-more">' +
      '<summary><span>按词组浏览</span><small>' + (activeBook() ? activeBook().count + ' 个词 · ' + currentUnits().length + ' 组' : '') + '</small></summary>' +
      '<div class="home-more__body"><div class="home-unit-list">' + unitRows + '</div>' +
      '<a class="text-link home-more__all" href="#library">查看全部词汇</a></div>' +
      '</details>' +

      '<details class="home-more">' +
      '<summary><span>复习节奏与每日一句</span><small>次要说明</small></summary>' +
      '<div class="home-more__body home-lower-grid">' +
      '<article class="memory-card" id="memory-rhythm">' +
      '<div class="memory-card__head"><div><h2>记忆会遗忘，复习让它留下来</h2>' +
      '<p class="memory-card__desc">参考艾宾浩斯遗忘曲线，在快要忘记时再见一面。</p></div>' +
      '<div class="curve-legend"><span><i></i>记忆保持</span><span><i></i>复习节点</span></div></div>' +
      curveSVG('home') +
      '<div class="review-rhythm"><span class="review-rhythm__label">示例间隔</span>' + rhythmChips() + '</div>' +
      '<p class="curve-caption">以上间隔仅作示意。实际复习时间会根据记忆表现调整，没记牢的词也会在本轮稍后再出现。</p>' +
      '</article>' +
      '<article class="quote-card">' +
      '<div><p class="quote-card__label">' + icon('sparkles') + ' Daily note · 每日一句</p>' +
      '<blockquote><p>“' + esc(quote.en) + '”</p><footer>— ' + esc(quote.author) + '</footer></blockquote></div>' +
      '<div class="quote-card__bottom"><p class="quote-card__zh">' + esc(quote.zh) + '</p><span class="quote-card__seal">拾词<br>WORD<br>NOTE</span></div>' +
      '</article>' +
      '</div>' +
      '</details>';
  }

  function renderBooks(data) {
    const activeId = data.activeId;
    const loadingId = data.loadingId;
    const books = window.BOOKS || [];
    const totalWords = books.reduce(function (sum, book) { return sum + book.count; }, 0);
    const cards = books.map(function (book) {
      const progress = window.Store.getBookProgress(book.id);
      const rawPercent = book.count ? Math.min(100, (progress.seen / book.count) * 100) : 0;
      const percent = Math.round(rawPercent);
      const percentLabel = progress.seen > 0 && rawPercent < 1 ? '<1' : String(percent);
      const isActive = book.id === activeId;
      const isLoading = book.id === loadingId;
      return '<article class="book-card' + (isActive ? ' is-active' : '') + '" style="--book-accent:' + book.accent + ';--book-tint:' + book.tint + ';--book-deep:' + (book.deep || book.accent) + ';">' +
        '<div class="book-cover">' +
        '<div class="book-cover__top"><span>' + esc(book.category) + '</span><span>' + book.count + ' 词</span></div>' +
        '<span class="book-cover__mark">' + esc(book.coverMark) + '</span>' +
        '<div class="book-cover__bottom"><span>' + esc(book.en) + '</span>' + (isActive ? '<span class="book-cover__active">正在学</span>' : '') + '</div>' +
        '</div>' +
        '<div class="book-info">' +
        '<div class="book-info__head"><h2>' + esc(book.title) + '</h2>' +
        (isActive ? '<span class="pill pill--green"><i class="dot"></i> 当前词书</span>' : '<span class="book-info__category">' + esc(book.category) + '</span>') + '</div>' +
        '<p class="book-info__desc">' + esc(book.description) + '</p>' +
        '<div class="book-tags">' + book.tags.map(function (tag) { return '<span>' + esc(tag) + '</span>'; }).join('') + '</div>' +
        '<div class="book-progress">' +
        '<div class="book-progress__row"><span>已学 ' + progress.seen + ' 个 · 已掌握 ' + progress.mastered + ' 个</span><strong>' + percentLabel + '%</strong></div>' +
        '<div class="book-progress__track"><span style="width:' + Math.max(progress.seen > 0 ? 1.5 : 0, percent) + '%"></span></div></div>' +
        '<div class="book-actions">' +
        (isActive
          ? '<a class="btn btn--primary btn--sm" href="#study">继续学习 ' + icon('arrow-right', 'icon--shift') + '</a><a class="text-link" href="#library">查看词库</a>'
          : '<button class="btn btn--ghost btn--sm" type="button" data-action="switch-book" data-book-id="' + esc(book.id) + '" aria-label="切换到 ' + esc(book.title) + '"' + (isLoading ? ' disabled' : '') + '>' + (isLoading ? '正在打开…' : '切换到这本') + ' ' + icon('arrow-right') + '</button>') +
        '</div></div>' +
        '</article>';
    }).join('');

    return '' +
      '<header class="page-head books-head">' +
      '<div><p class="eyebrow">WORD SHELF</p><h1 class="page-title">词书书架</h1>' +
      '<p class="page-head__desc">从高中核心到雅思、四六级，选一本现在需要的。切换词书不会清空已有的学习记录。</p></div>' +
      '<div class="page-head__aside"><span class="pill pill--green">' + books.length + ' 本词书 · ' + totalWords + ' 个词条</span></div>' +
      '</header>' +
      '<div class="books-note">' + icon('info') + '<p>英语和文言是两本独立词书：选择“英语精讲 120”会继续显示英语，学习文言请选择“高中文言重点字词 1200”。两本书的进度会分别保留。</p></div>' +
      '<section class="book-grid" aria-label="词书列表">' + cards + '</section>' +
      '<footer class="books-source">词汇与例句整理自公开学习词库，已做去重与简化。词义以常见高中、考试语境为主，仅供学习参考。</footer>';
  }

  function renderStudyCenter(data) {
    const overview = data.overview;
    const percent = overview.goal ? Math.round((overview.todayUnique / overview.goal) * 100) : 0;
    const planCount = overview.planCount;
    const done = planCount === 0;
    let title;
    let desc;
    let primaryLabel = '开始今日学习';
    let primaryAction = 'start-daily';
    if (done) {
      title = '今日份的词，<br>已经收好了。';
      desc = '还可以复习全部已学词，或去拼写里检验一下。待巩固和不够熟练的词会优先出现。';
      if (overview.reviewDueToday > 0) {
        primaryAction = 'start-review';
        primaryLabel = '继续复习';
      } else if (overview.newRemaining > 0) {
        primaryAction = 'start-extra-new';
        primaryLabel = '再学 10 个新词';
      } else {
        primaryAction = 'start-learned';
        primaryLabel = '复习已学词（全部）';
      }
    } else {
      title = '今天还剩 <em>' + planCount + '</em> 个词，<br>按自己的节奏来。';
      desc = '先复习 ' + overview.planReviewCount + ' 个，再学 ' + overview.planNewCount + ' 个新的 · 预计 ' + (overview.estimatedMinutes || 1) + ' 分钟。复习与新词会交错出现，答错的词会在本轮稍后重现。';
    }

    const isChineseBook = activeBook().id === 'wenyan' || activeBook().id === 'curated';
    return '' +
      '<header class="page-head">' +
      '<div><p class="eyebrow">STUDY ROOM</p><h1 class="page-title">学习中心</h1>' +
      '<p class="page-head__desc">不追求一次记住，只让每次见面都更熟一点。</p></div>' +
      '<div class="page-head__aside">' + bookContextHTML('sm') + '</div>' +
      '</header>' +

      '<section class="study-plan">' +
      '<div class="study-plan__copy">' +
      '<p class="eyebrow">TODAY\'S PLAN &nbsp;' + overview.todayUnique + ' / ' + overview.goal + '</p>' +
      '<h2>' + title + '</h2>' +
      '<p class="study-plan__desc">' + desc + '</p>' +
      '<div class="study-plan__actions">' +
      '<button class="btn btn--primary" type="button" data-action="' + primaryAction + '">' + primaryLabel + ' ' + icon('arrow-right', 'icon--shift') + '</button>' +
      '</div></div>' +
      '<div class="study-plan__visual">' +
      '<div class="dark-progress">' + circleProgress(percent) +
      '<div class="dark-progress__inner"><strong>' + Math.min(percent, 100) + '<small>%</small></strong><span>今日目标</span></div></div>' +
      '</div>' +
      '<span class="study-plan__breakdown"><i class="dot"></i> ' + (done
        ? '今日计划已完成'
        : overview.planReviewCount + ' 复习 + ' + overview.planNewCount + ' 新词 · 约 ' + (overview.estimatedMinutes || Math.max(1, Math.round(overview.goal * 0.35))) + ' 分钟') + '</span>' +
      '</section>' +

      '<section class="training-panel" aria-labelledby="trainingTitle">' +
      '<div class="training-panel__head"><div><h2 id="trainingTitle">继续练习</h2>' +
      '<p>' + overview.totalSeen + ' 个已学词可用</p></div></div>' +
      '<div class="training-actions">' +
      '<button class="btn btn--ghost" type="button" data-action="start-new"' + (overview.newRemaining ? '' : ' disabled') + '>' + icon('sparkles') + ' 新词学习</button>' +
      '<button class="btn btn--ghost" type="button" data-action="' + (overview.weak ? 'start-relearn-all' : 'start-learned') + '"' + (overview.totalSeen ? '' : ' disabled') + '>' + icon('refresh') + (overview.weak ? ' 错词重学（' + overview.weak + '）' : ' 已学词回看') + '</button>' +
      '<button class="btn btn--ghost" type="button" data-action="start-training"' + (overview.totalSeen && !isChineseBook ? '' : ' disabled') + '>' + icon('target') + ' 混合提取</button>' +
      '<button class="btn btn--ghost" type="button" data-action="start-spelling"' + (overview.totalSeen && !isChineseBook ? '' : ' disabled') + '>' + icon('keyboard') + ' 拼写挑战</button>' +
      '</div>' +
      '</section>' +

      '<details class="study-details">' +
      '<summary><span>复习规则</span><small>间隔与“掌握”标准</small></summary>' +
      '<div class="study-details__body">' +
      '<p>首次“忘了 / 有印象 / 能准确说出”分别安排今天稍后、明天、3 天后；之后由答对、题型和间隔共同调整。</p>' +
      '<p>选择题、语境选词、反向选词和拼写分别记录。“掌握”需要至少 3 个不同日期的成功提取、2 种题型，并有一次 7 天以上间隔。</p>' +
      '</div></details>';
  }

  function renderLibrary(data) {
    const overview = data.overview;
    const list = data.list;
    const total = Number(data.total) || list.length;
    const hasMore = Boolean(data.hasMore);
    const counts = data.counts;
    const query = data.query || '';
    const status = data.status || 'all';
    const selectedUnit = data.unit || 'all';
    const percent = overview.totalWords ? Math.round((overview.totalSeen / overview.totalWords) * 100) : 0;

    const statusFilters = [
      { value: 'all', label: '全部' },
      { value: 'new', label: '未学习' },
      { value: 'learning', label: '学习中' },
      { value: 'mastered', label: '已掌握' },
      { value: 'weak', label: '待巩固' },
      { value: 'favorite', label: '已收藏' },
      { value: 'due', label: '待复习' }
    ];

    const rows = list.map(function (word) {
      const unit = unitFor(word);
      const record = window.Store.getRecord(word.id);
      const wordStatus = window.Store.getStatus(word.id);
      const shownStatus = record && record.weak && wordStatus !== 'mastered' ? 'weak' : wordStatus;
      const dueLabel = record && record.seen ? window.Store.getDueLabel(record) : '—';
      const dueIsToday = record && record.seen && record.due && record.due <= window.Store.todayKey();
      const favorite = Boolean(record && record.favorite);
      const weakReason = weaknessLabel(record);
      return '<div class="word-row" data-open-word="' + esc(word.id) + '" role="group" aria-label="' + esc(word.word) + '">' +
        '<div class="word-row__main"><button class="word-open" type="button" data-action="open-word" data-word-id="' + esc(word.id) + '">' +
        '<span class="word-open__word">' + esc(word.word) + levelBadge(word.level) + '</span>' +
        '<span class="word-open__ipa">' + esc(word.ipa || '—') + (word.pos ? ' · ' + esc(word.pos) : '') + '</span>' +
        '</button></div>' +
        '<div class="word-row__meaning">' + esc(coreMeanings(word).join('；')) + extendedMeanings(word).length + ' 个拓展义项</div>'.replace('0 个拓展义项', '') +
        '<div class="word-row__unit" style="' + unitStyle(unit) + '"><i class="dot"></i>' + esc(unitDisplay(unit)) + '</div>' +
        '<div class="word-row__state">' + statusPill(shownStatus) +
        '<span class="word-row__due' + (dueIsToday ? ' is-due' : '') + '">' + esc((weakReason ? weakReason + ' · ' : '') + (dueIsToday ? '今天复习' : dueLabel)) + '</span></div>' +
        '<button class="icon-btn word-row__fav' + (favorite ? ' is-active' : '') + '" type="button" data-action="toggle-favorite" data-word-id="' + esc(word.id) + '" aria-label="' + (favorite ? '取消收藏' : '收藏') + ' ' + esc(word.word) + '" aria-pressed="' + favorite + '">' + icon('star') + '</button>' +
        '</div>';
    }).join('');

    const empty = '<div class="empty-state library-empty"><span class="empty-state__icon">' + icon('search') + '</span>' +
      '<h3>没有找到这个词</h3><p>换一个拼写或释义试试，也可以清除筛选，看看完整的 ' + counts.all + ' 个词。</p>' +
      '<button class="btn btn--soft btn--sm" type="button" data-action="reset-library" style="margin-top:15px;">清除筛选</button></div>';

    return '' +
      '<header class="page-head library-head">' +
      '<div><p class="eyebrow">MY WORD ATLAS</p><h1 class="page-title">我的词库</h1>' +
      '<p class="page-head__desc">' + (activeBook() ? activeBook().title + ' · 共 ' + activeBook().count + ' 个词。' : '') + (bookLoadingBadge() ? '词书正在后台补全。' : '') + '点开任意一张词卡，读它的例句和搭配。</p></div>' +
      '<button class="library-progress-card library-progress-card--button" type="button" data-action="navigate" data-route="books">' + miniRing(percent) +
      '<div class="library-progress-card__text"><strong>' + overview.totalSeen + ' <small>/ ' + overview.totalWords + ' 个词</small></strong><span>' + esc(activeBook() ? activeBook().title : '当前词书') + ' · 切换词书 ' + icon('chevron-right') + '</span></div>' +
      '</button></header>' +

      '<div class="library-toolbar">' +
      '<label class="library-search">' + icon('search') +
      '<input id="librarySearch" type="search" placeholder="搜索单词、中文释义或例句" value="' + esc(query) + '" aria-label="搜索词库">' +
      (query ? '<button class="library-search__clear" type="button" data-action="clear-library-search" aria-label="清除搜索">' + icon('close') + '</button>' : '') +
      '</label>' +
      '<div class="library-count"><strong>' + total + '</strong> 个词</div>' +
      ((query || status !== 'all' || selectedUnit !== 'all') ? '<button class="text-link library-reset" type="button" data-action="reset-library">清除筛选</button>' : '') +
      '</div>' +

      '<div class="filter-bar" aria-label="按学习状态筛选">' +
      '<span class="filter-label">状态</span>' +
      statusFilters.map(function (filter) {
        return '<button class="filter-chip' + (status === filter.value ? ' is-active' : '') + '" type="button" data-action="set-library-status" data-value="' + filter.value + '">' + filter.label + ' <span class="filter-chip__count">' + (counts[filter.value] || 0) + '</span></button>';
      }).join('') +
      '</div>' +

      '<div class="unit-filter" aria-label="按乱序词组筛选">' +
      '<button class="unit-chip' + (selectedUnit === 'all' ? ' is-active' : '') + '" type="button" data-action="set-library-unit" data-value="all"><i class="dot" style="background:var(--green-500)"></i>全部单元</button>' +
      currentUnits().map(function (unit) {
        return '<button class="unit-chip' + (String(selectedUnit) === String(unit.id) ? ' is-active' : '') + '" type="button" data-action="set-library-unit" data-value="' + unit.id + '" style="' + unitStyle(unit) + '"><i class="dot"></i>' + esc(unit.title) + '</button>';
      }).join('') +
      '</div>' +

      (list.length ?
        '<div class="word-list">' +
        '<div class="word-list__head"><span>Word / 单词</span><span>Meaning / 释义</span><span>Group / 分组</span><span>State / 复习</span><span></span></div>' +
        rows + '</div>' :
        empty) +

      (hasMore ? '<div class="library-more"><span>已显示 ' + list.length + ' / ' + total + ' 个词</span><button class="btn btn--ghost btn--sm" type="button" data-action="library-load-more">再看 30 个 ' + icon('arrow-right') + '</button></div>' : '') +

      '<div class="library-footer"><span>共 ' + total + ' 个词 · 数据保存在你的浏览器</span><span>' + (selectedUnit !== 'all' ? '当前单元：' + esc((window.Store.getUnit(Number(selectedUnit)) || {}).title || '') : '按单元顺序排列') + '</span></div>';
  }

  function weeklyChartSVG(series) {
    const width = 560;
    const height = 228;
    const padLeft = 32;
    const padRight = 12;
    const top = 25;
    const baseline = 184;
    const usable = baseline - top;
    const totals = series.map(function (day) { return day.learned + day.reviewed; });
    const rawMax = Math.max.apply(null, totals.concat([4]));
    const max = Math.ceil(rawMax / 5) * 5;
    const step = (width - padLeft - padRight) / series.length;
    const barWidth = Math.min(26, step * 0.36);
    let grid = '';
    let labels = '';
    for (let i = 0; i <= 3; i += 1) {
      const y = top + (usable / 3) * i;
      const value = Math.round(max - (max / 3) * i);
      grid += '<line class="grid-line" x1="' + padLeft + '" y1="' + y.toFixed(1) + '" x2="' + (width - padRight) + '" y2="' + y.toFixed(1) + '"></line>';
      labels += '<text class="axis-label" x="' + (padLeft - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + value + '</text>';
    }
    let bars = '';
    series.forEach(function (day, index) {
      const x = padLeft + step * index + step / 2;
      const total = day.learned + day.reviewed;
      const newH = (day.learned / max) * usable;
      const reviewH = (day.reviewed / max) * usable;
      const totalH = newH + reviewH;
      const topY = baseline - totalH;
      bars += '<g class="bar-group"><title>' + esc(day.shortDate + ' ' + day.label + ' · 新学 ' + day.learned + ' · 复习 ' + day.reviewed) + '</title>';
      bars += '<rect class="bar-bg" x="' + (x - barWidth / 2) + '" y="' + top + '" width="' + barWidth + '" height="' + usable + '" rx="4"></rect>';
      if (day.learned > 0) {
        bars += '<rect class="bar-new" x="' + (x - barWidth / 2) + '" y="' + (baseline - newH) + '" width="' + barWidth + '" height="' + Math.max(newH, 1) + '" rx="2"></rect>';
      }
      if (day.reviewed > 0) {
        bars += '<rect class="bar-review" x="' + (x - barWidth / 2) + '" y="' + (topY) + '" width="' + barWidth + '" height="' + Math.max(reviewH, 1) + '" rx="2"></rect>';
      }
      if (total > 0) {
        bars += '<text class="axis-label" x="' + x + '" y="' + (topY - 6) + '" text-anchor="middle">' + total + '</text>';
      }
      bars += '<text class="day-label' + (day.isToday ? ' is-today' : '') + '" x="' + x + '" y="' + (baseline + 18) + '" text-anchor="middle">' + esc(day.label) + '</text>';
      bars += '</g>';
    });
    const emptyNote = totals.every(function (n) { return n === 0; })
      ? '<text class="chart-empty-note" x="' + (width / 2) + '" y="' + (top + usable / 2) + '" text-anchor="middle">完成一次学习，这里就会出现你的节奏</text>'
      : '';
    return '<svg class="weekly-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="最近七天学习量柱状图">' +
      grid + labels + bars + emptyNote + '</svg>';
  }

  function renderReport(data) {
    const overview = data.overview;
    const series = data.weekSeries;
    const heatmap = data.heatmap;
    const forecast = data.forecast;
    const newCount = overview.totalWords - overview.totalSeen;
    const masteredPct = overview.totalWords ? (overview.mastered / overview.totalWords) * 100 : 0;
    const learningPct = overview.totalWords ? (overview.learning / overview.totalWords) * 100 : 0;
    const donutBg = 'conic-gradient(var(--green-700) 0 ' + masteredPct.toFixed(2) + '%, var(--gold) ' + masteredPct.toFixed(2) + '% ' + (masteredPct + learningPct).toFixed(2) + '%, #e6e2d8 ' + (masteredPct + learningPct).toFixed(2) + '% 100%)';
    const months = [];
    heatmap.forEach(function (week, index) {
      const first = window.Store.keyToDate(week[0].key);
      const previous = index > 0 ? window.Store.keyToDate(heatmap[index - 1][0].key) : null;
      const showMonth = index === 0 || (previous && previous.getMonth() !== first.getMonth());
      months.push({ label: showMonth ? (first.getMonth() + 1) + '月' : '', key: week[0].key });
    });
    const weekdayLabels = ['一', '', '三', '', '五', '', '日'];
    const heatCells = heatmap.map(function (week) {
      return '<div class="heatmap__week">' + week.map(function (day) {
        return '<span class="heatmap__cell level-' + day.level + (day.future ? ' is-future' : '') + (day.isToday ? ' is-today' : '') +
          '" title="' + esc(window.Store.formatDateCN(day.key) + ' · ' + day.count + ' 次作答') + '"></span>';
      }).join('') + '</div>';
    }).join('');
    const maxForecast = Math.max.apply(null, forecast.map(function (item) { return item.due; }).concat([1]));
    const forecastTotal = forecast.reduce(function (sum, item) { return sum + item.due; }, 0);
    const forecastItems = forecast.map(function (item) {
      const height = item.due ? Math.max(8, (item.due / maxForecast) * 88) : 4;
      return '<div class="forecast-item" title="' + esc(window.Store.formatDateCN(item.key) + ' · ' + item.due + ' 个词到期') + '">' +
        '<span class="forecast-item__count">' + item.due + '</span>' +
        '<span class="forecast-item__bar" style="height:' + height + 'px"></span>' +
        '<span class="forecast-item__day">' + esc(item.label) + '</span></div>';
    }).join('');
    const badges = window.BADGE_DEFINITIONS.map(function (badge) {
      const earned = badge.test(overview);
      return '<div class="badge-item' + (earned ? ' is-earned' : '') + '">' +
        '<span class="badge-item__icon">' + icon(earned ? badge.icon : 'lock') + '</span>' +
        '<strong>' + esc(badge.title) + '</strong><span>' + esc(badge.description) + '</span>' +
        (earned ? '' : '<span class="badge-item__lock">' + icon('lock') + '</span>') + '</div>';
    }).join('');

    const streakWord = overview.streak > 0 ? '继续保持' : '从今天开始';
    const wordReport = data.wordReport || { list: [], total: 0, allTotal: 0, counts: { all: 0, knew: 0, didnt: 0, weak: 0, unmarked: 0 }, filter: 'all', hasMore: false };
    const learnedFilters = [
      { value: 'all', label: '全部', count: wordReport.counts.all },
      { value: 'knew', label: '当时会', count: wordReport.counts.knew },
      { value: 'didnt', label: '当时不会', count: wordReport.counts.didnt },
      { value: 'weak', label: '当前待巩固', count: wordReport.counts.weak }
    ];
    const learnedRows = wordReport.list.map(function (item) {
      const word = item.word;
      const record = item.record;
      const firstDate = item.firstDate ? window.Store.formatDateCN(item.firstDate) : '—';
      const lastDate = item.lastDate ? window.Store.formatDateCN(item.lastDate) : '—';
      const resultLabel = item.firstKind === 'knew' ? '当时会' : (item.firstKind === 'didnt' ? '当时不会' : '未记录');
      const resultClass = item.firstKind === 'knew' ? 'is-knew' : (item.firstKind === 'didnt' ? 'is-didnt' : 'is-unmarked');
      const quizLine = record.objectiveSeen ? '客观提取 ' + record.objectiveCorrect + '/' + record.objectiveSeen : '尚未检验';
      return '<button class="learned-row" type="button" data-action="open-word" data-word-id="' + esc(word.id) + '" title="' + esc(item.firstSource) + '">' +
        '<span class="learned-row__word"><strong>' + esc(word.word) + '</strong><small>' + esc(word.ipa || '—') + (word.pos ? ' · ' + esc(word.pos) : '') + '</small></span>' +
        '<span class="learned-row__meaning">' + esc(coreMeanings(word).join('；')) + '</span>' +
        '<span class="learned-result ' + resultClass + '">' + resultLabel + '</span>' +
        '<span class="learned-row__state">' + statusPill(item.currentStatus) + '<small>' + quizLine + '</small></span>' +
        '<span class="learned-row__date">首次 ' + firstDate + '<small>最近 ' + lastDate + '</small></span>' +
        '</button>';
    }).join('');
    const learnedEmpty = wordReport.allTotal === 0
      ? '<div class="learned-empty"><span class="empty-state__icon">' + icon('book-open') + '</span><h3>还没有学过单词</h3><p>去学一小组，学完的单词和当时的检验结果会出现在这里。</p><a class="btn btn--soft btn--sm" href="#study">开始学习</a></div>'
      : '<div class="learned-empty learned-empty--small"><p>这个分类里还没有单词。</p></div>';
    const learnedSection = '<section class="report-panel learned-panel">' +
      '<div class="report-panel__head"><div><h2>学过的单词</h2><p class="report-panel__desc">以第一次学后检验为准；尚未检验时用首次自评，旧记录按已有历史推断。</p></div>' +
      '<span class="pill">' + wordReport.counts.all + ' 个已学</span></div>' +
      '<div class="learned-summary">' +
      '<div class="learned-summary__item is-knew"><strong>' + wordReport.counts.knew + '</strong><span>当时会</span></div>' +
      '<div class="learned-summary__item is-didnt"><strong>' + wordReport.counts.didnt + '</strong><span>当时不会</span></div>' +
      '<div class="learned-summary__item is-weak"><strong>' + wordReport.counts.weak + '</strong><span>当前待巩固</span></div>' +
      '<div class="learned-summary__item is-total"><strong>' + wordReport.counts.all + '</strong><span>累计学过</span></div>' +
      '</div>' +
      '<div class="learned-filter">' + learnedFilters.map(function (filter) {
        return '<button class="filter-chip' + (wordReport.filter === filter.value ? ' is-active' : '') + '" type="button" data-action="set-report-words-filter" data-value="' + filter.value + '">' + filter.label + ' <span class="filter-chip__count">' + filter.count + '</span></button>';
      }).join('') + '</div>' +
      (wordReport.list.length ? '<div class="learned-list">' + learnedRows + '</div>' : learnedEmpty) +
      (wordReport.hasMore ? '<div class="learned-more"><span>已显示 ' + wordReport.list.length + ' / ' + wordReport.total + ' 个词</span><button class="btn btn--ghost btn--sm" type="button" data-action="report-words-more">再看 24 个 ' + icon('arrow-right') + '</button></div>' : '') +
      '</section>';
    if (overview.totalSeen === 0) {
      return '<header class="page-head report-head"><div><p class="eyebrow">LEARNING LOG</p><h1 class="page-title">学习报告</h1>' +
        '<p class="page-head__desc">第一条记录，会从五个词开始。</p></div><div class="report-head__actions">' + bookContextHTML('sm') +
        '<button class="btn btn--ghost btn--sm" type="button" data-action="open-settings">' + icon('settings') + ' 学习设置</button></div></header>' +
        '<section class="report-empty-hero"><span class="report-empty-hero__mark">' + icon('chart') + '</span>' +
        '<div><p class="eyebrow">A QUIET START</p><h2>还不需要看一屏的 0。</h2>' +
        '<p>先学 5 个词，做完一次简短的提取题。之后这里会分别告诉你：客观提取正确率、24 小时与 7 天保持率，以及哪种错误最常见。</p>' +
        '<div class="report-empty-hero__actions"><button class="btn btn--primary" type="button" data-action="start-first">开始第一组 5 词 ' + icon('arrow-right', 'icon--shift') + '</button>' +
        '<button class="btn btn--ghost" type="button" data-action="open-settings">' + icon('download') + ' 导入旧记录</button></div></div>' +
        '<details class="report-preview"><summary>看看完成一组后会记录什么</summary><div class="report-preview__grid">' +
        '<div><strong>客观提取正确率</strong><span>只统计选择题、语境题、反向题和拼写题</span></div>' +
        '<div><strong>自评分布</strong><span>忘了 / 有印象 / 能准确说出，单独展示</span></div>' +
        '<div><strong>间隔保持</strong><span>24 小时与 7 天后是否仍能主动答对</span></div>' +
        '<div><strong>下一次建议</strong><span>到期复习、弱词原因和推荐题型</span></div></div></details></section>';
    }

    const selfTotal = overview.selfRatings.known + overview.selfRatings.fuzzy + overview.selfRatings.again;
    const selfPct = function (value) { return selfTotal ? Math.round((value / selfTotal) * 100) : 0; };
    const errorLabelMap = {
      meaning_confusion: '词义混淆',
      usage_context: '语境用法',
      spelling_omission: '拼写漏字母',
      spelling_extra: '拼写多字母',
      spelling_order: '字母顺序',
      spelling_confusion: '拼写混淆'
    };
    const topErrors = Object.keys(overview.errorTypes || {}).sort(function (a, b) {
      return overview.errorTypes[b] - overview.errorTypes[a];
    }).slice(0, 3);
    const diagnostics = topErrors.length
      ? topErrors.map(function (type) {
        return '<span>' + esc(errorLabelMap[type] || type) + ' <strong>' + overview.errorTypes[type] + '</strong></span>';
      }).join('')
      : '<span>还没有错误类型记录</span>';
    const memorySection = '<section class="report-panel memory-metrics">' +
      '<div class="report-panel__head"><div><h2>记忆表现</h2><p class="report-panel__desc">自评、客观提取与跨日保持分开统计</p></div>' +
      '<span class="pill">目标保持率 ' + Math.round((overview.targetRetention || 0.85) * 100) + '%</span></div>' +
      '<div class="memory-metrics__grid">' +
      '<div class="memory-metric"><span>自评分布</span><div class="self-bars">' +
      '<i class="self-bars__known" style="width:' + selfPct(overview.selfRatings.known) + '%"></i>' +
      '<i class="self-bars__fuzzy" style="width:' + selfPct(overview.selfRatings.fuzzy) + '%"></i>' +
      '<i class="self-bars__again" style="width:' + selfPct(overview.selfRatings.again) + '%"></i></div>' +
      '<strong>' + overview.selfRatings.known + ' / ' + overview.selfRatings.fuzzy + ' / ' + overview.selfRatings.again + '</strong><small>能准确说出 / 有印象 / 忘了</small></div>' +
      '<div class="memory-metric"><span>24 小时保持</span><strong>' + (overview.retention24Rate == null ? '待积累' : overview.retention24Rate + '%') + '</strong><small>' + overview.retention24.correct + ' / ' + overview.retention24.seen + ' 次跨日提取</small></div>' +
      '<div class="memory-metric"><span>7 天保持</span><strong>' + (overview.retention7Rate == null ? '待积累' : overview.retention7Rate + '%') + '</strong><small>' + overview.retention7.correct + ' / ' + overview.retention7.seen + ' 次长间隔提取</small></div>' +
      '<div class="memory-metric"><span>需要留意</span><div class="diagnostic-chips">' + diagnostics + '</div><small>答错的词会按题型进入待巩固</small></div>' +
      '</div></section>';
    const memoryWallPromo = overview.totalSeen > 0
      ? '<section class="memory-wall-promo">' +
        '<div class="memory-wall-promo__copy"><span>记忆墙打印</span>' +
        '<h2>把学过的词，贴到手边。</h2>' +
        '<p>生成 A4 便签卡、口袋条或大字墙。免费预览 3 张，完整版可筛选和反复打印。</p>' +
        '<button class="btn btn--primary" type="button" data-action="open-memory-wall">' + icon('notebook') + ' 打开记忆墙</button></div>' +
        '<div class="memory-wall-promo__preview" aria-hidden="true">' +
        wordReport.list.slice(0, 3).map(function (item) {
          return '<span><strong>' + esc(item.word.word) + '</strong><small>' + esc(coreMeanings(item.word)[0] || '') + '</small></span>';
        }).join('') +
        '</div></section>'
      : '';
    return '' +
      '<header class="page-head report-head">' +
      '<div><p class="eyebrow">LEARNING LOG</p><h1 class="page-title">学习报告</h1>' +
      '<p class="page-head__desc">记录不是用来比较的，只是提醒你：每一小步都算数。</p></div>' +
      '<div class="report-head__actions">' + bookContextHTML('sm') + '<button class="btn btn--ghost btn--sm" type="button" data-action="open-memory-wall">' + icon('notebook') + ' 打印</button><button class="btn btn--ghost btn--sm" type="button" data-action="open-settings">' + icon('settings') + ' 设置</button></div>' +
      '</header>' +

      '<section class="report-stats">' +
      '<article class="report-stat report-stat--dark"><span class="report-stat__label">' + icon('book-open') + ' 累计学习</span><strong class="report-stat__value">' + overview.totalSeen + '<small> / ' + overview.totalWords + ' 词</small></strong><span class="report-stat__note">整体进度 ' + (overview.totalWords ? Math.round((overview.totalSeen / overview.totalWords) * 100) : 0) + '%</span></article>' +
      '<article class="report-stat"><span class="report-stat__label">' + icon('trophy') + ' 已掌握</span><strong class="report-stat__value">' + overview.mastered + '<small> 个</small></strong><span class="report-stat__note">' + (overview.totalSeen ? Math.round((overview.mastered / overview.totalSeen) * 100) : 0) + '% 掌握率</span></article>' +
      '<article class="report-stat"><span class="report-stat__label">' + icon('flame') + ' 连续学习</span><strong class="report-stat__value">' + overview.streak + '<small> 天</small></strong><span class="report-stat__note">最长 ' + overview.longestStreak + ' 天 · ' + streakWord + '</span></article>' +
      '<article class="report-stat"><span class="report-stat__label">' + icon('target') + ' 提取正确率</span><strong class="report-stat__value">' + (overview.attempts ? overview.recallAccuracy : '—') + '<small>' + (overview.attempts ? '%' : '') + '</small></strong><span class="report-stat__note">只含 ' + overview.attempts + ' 次客观题</span></article>' +
      '</section>' +

      memoryWallPromo +
      learnedSection +

      '<details class="report-more">' +
      '<summary><span>更多数据</span><small>保持率、图表、预测与成就</small></summary>' +
      '<div class="report-more__body">' +
      memorySection +
      '<div class="report-grid">' +
      '<article class="report-panel">' +
      '<div class="report-panel__head"><div><h2>最近七天</h2><p class="report-panel__desc">新词与复习的学习量</p></div>' +
      '<div class="chart-legend"><span><i></i>新学</span><span><i></i>复习</span></div></div>' +
      weeklyChartSVG(series) +
      '</article>' +
      '<article class="report-panel donut-panel">' +
      '<div class="report-panel__head"><div><h2>词汇状态</h2><p class="report-panel__desc">从陌生到熟悉</p></div></div>' +
      '<div class="donut-wrap"><div class="donut" style="--donut-bg:' + donutBg + '"></div><div class="donut-center"><strong>' + overview.totalSeen + '</strong><span>已学习</span></div></div>' +
      '<div class="donut-legend">' +
      '<span class="donut-legend__item"><i style="background:var(--green-700)"></i>已掌握<strong>' + overview.mastered + '</strong></span>' +
      '<span class="donut-legend__item"><i style="background:var(--gold)"></i>学习中<strong>' + overview.learning + '</strong></span>' +
      '<span class="donut-legend__item"><i style="background:#e6e2d8"></i>未学习<strong>' + newCount + '</strong></span>' +
      '</div></article>' +
      '</div>' +

      '<section class="report-panel heatmap-panel">' +
      '<div class="report-panel__head"><div><h2>学习足迹</h2><p class="report-panel__desc">最近十二周 · 颜色越深，练习越多</p></div>' +
      '<span class="pill">' + (overview.seconds > 0 && overview.minutes < 1 ? '不足 1 分钟' : overview.minutes + ' 分钟') + '专注</span></div>' +
      '<div class="heatmap-scroll"><div class="heatmap">' +
      '<div class="heatmap__months"><span></span>' + months.map(function (month) { return '<span class="heatmap__month">' + esc(month.label) + '</span>'; }).join('') + '</div>' +
      '<div class="heatmap__body"><div class="heatmap__weekdays">' + weekdayLabels.map(function (label) { return '<span>' + label + '</span>'; }).join('') + '</div>' + heatCells + '</div>' +
      '</div></div>' +
      '<div class="heatmap__foot"><span>少</span><i></i><i></i><i></i><i></i><i></i><span>多</span></div>' +
      '</section>' +

      '<div class="insight-grid">' +
      '<section class="report-panel forecast-panel">' +
      '<div class="report-panel__head" style="padding:0;"><div><h2>未来七天</h2><p class="report-panel__desc">到期复习会在这里出现</p></div><span class="pill pill--gold">' + forecastTotal + ' 个待复习</span></div>' +
      '<div class="forecast-list">' + forecastItems + '</div>' +
      '<p class="curve-caption" style="margin-top:8px;">根据当前单词所处的复习阶段自动推算。</p>' +
      '</section>' +
      '<section class="report-panel curve-report-panel">' +
      '<div class="report-panel__head" style="padding:0;"><div><h2>遗忘曲线</h2><p class="report-panel__desc">复习发生在遗忘之前</p></div></div>' +
      curveSVG('report') +
      '<p class="curve-caption">示意图：曲线代表记忆的自然衰减，圆点是安排复习的节点。每次成功回忆，记忆保持的时间都会更长。</p>' +
      '</section>' +
      '</div>' +

      '<section class="report-panel badge-panel">' +
      '<div class="report-panel__head" style="padding:0;"><div><h2>小小里程碑</h2><p class="report-panel__desc">不着急，它们会在路上等你</p></div>' +
      '<span class="pill pill--green">' + window.BADGE_DEFINITIONS.filter(function (badge) { return badge.test(overview); }).length + ' / ' + window.BADGE_DEFINITIONS.length + ' 已获得</span></div>' +
      '<div class="badge-grid">' + badges + '</div>' +
      '</section>' +
      '</div></details>';
  }

  function memoryWallCard(word, index, options) {
    const unit = unitFor(word);
    const record = window.Store.getRecord(word.id) || {};
    const meaning = coreMeanings(word).slice(0, 2).join('；');
    const example = word.example || '';
    const translation = word.translation || '';
    const weak = record.weak && window.Store.getStatus(word.id) !== 'mastered';
    const sample = options.locked ? '<span class="memory-wall-card__sample">预览</span>' : '';
    return '<article class="memory-wall-card memory-wall-card--' + esc(options.layout) + (word.lang === 'zh' ? ' is-zh' : '') + '" style="' + unitStyle(unit) + '">' +
      sample +
      '<header class="memory-wall-card__head"><span>' + String(index + 1).padStart(2, '0') + '</span>' +
      '<span>' + esc(unitDisplay(unit)) + (weak ? ' · 待巩固' : '') + '</span></header>' +
      '<div class="memory-wall-card__word">' + esc(word.word) + '</div>' +
      '<div class="memory-wall-card__meta">' +
      (options.showIpa && word.ipa ? '<span>' + esc(word.ipa) + '</span>' : '') +
      (word.pos ? '<span>' + esc(word.pos) + '</span>' : '') +
      '</div>' +
      (options.showMeaning
        ? '<p class="memory-wall-card__meaning">' + esc(meaning || '—') + '</p>'
        : '<p class="memory-wall-card__meaning is-hidden">先看单词，回想它的意思。</p>') +
      (options.showExample && example
        ? '<div class="memory-wall-card__example"><p>' + esc(example) + '</p>' +
          (translation ? '<span>' + esc(translation) + '</span>' : '') + '</div>'
        : '') +
      '<footer><span>拾词 · 看一眼，再想一次</span><i></i></footer>' +
      '</article>';
  }

  function renderMemoryWall(data) {
    const book = activeBook();
    const layoutLabels = {
      sticky: '便签卡',
      strip: '口袋条',
      wall: '大字墙'
    };
    const scopeLabels = {
      recent: '最近学过',
      weak: '待巩固',
      favorite: '已收藏'
    };
    const layoutOptions = [
      ['sticky', '便签卡', '一张约 90×82mm，适合桌面和冰箱'],
      ['strip', '口袋条', '一张约 90×40mm，适合单词盒和门框'],
      ['wall', '大字墙', '一张约 90×128mm，适合衣柜和书桌正前方']
    ];
    const scopeOptions = [
      ['recent', '最近学过'],
      ['weak', '待巩固'],
      ['favorite', '已收藏']
    ];
    const countOptions = [12, 24, 40];
    const layout = data.layout || 'sticky';
    const scope = data.scope || 'recent';
    const count = Number(data.count) || 24;
    const words = data.words || [];
    const printedWords = words.slice(0, count);
    const perPage = layout === 'strip' ? 12 : (layout === 'wall' ? 4 : 6);
    const pages = [];
    for (let index = 0; index < printedWords.length; index += perPage) {
      pages.push(printedWords.slice(index, index + perPage));
    }
    const date = formatDate(new Date());
    const controls =
      '<section class="memory-wall-controls no-print">' +
      '<div class="memory-wall-control-group"><span>版式</span><div>' +
      layoutOptions.map(function (item) {
        return '<button class="memory-wall-option' + (layout === item[0] ? ' is-active' : '') + '" type="button" data-action="set-wall-layout" data-value="' + item[0] + '"><strong>' + item[1] + '</strong><small>' + item[2] + '</small></button>';
      }).join('') + '</div></div>' +
      '<div class="memory-wall-control-row">' +
      '<div class="memory-wall-control-group"><span>挑选</span><div class="memory-wall-chip-row">' +
      scopeOptions.map(function (item) {
        return '<button class="filter-chip' + (scope === item[0] ? ' is-active' : '') + '" type="button" data-action="set-wall-scope" data-value="' + item[0] + '">' + item[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="memory-wall-control-group"><span>张数</span><div class="memory-wall-chip-row">' +
      countOptions.map(function (value) {
        return '<button class="filter-chip' + (count === value ? ' is-active' : '') + '" type="button" data-action="set-wall-count" data-value="' + value + '">' + value + ' 张</button>';
      }).join('') + '</div></div>' +
      '</div>' +
      '<div class="memory-wall-control-row memory-wall-control-row--switches">' +
      '<button class="memory-wall-switch' + (data.showMeaning ? ' is-active' : '') + '" type="button" data-action="toggle-wall-option" data-option="showMeaning" aria-pressed="' + Boolean(data.showMeaning) + '">显示释义</button>' +
      '<button class="memory-wall-switch' + (data.showIpa ? ' is-active' : '') + '" type="button" data-action="toggle-wall-option" data-option="showIpa" aria-pressed="' + Boolean(data.showIpa) + '">音标与词性</button>' +
      '<button class="memory-wall-switch' + (data.showExample ? ' is-active' : '') + '" type="button" data-action="toggle-wall-option" data-option="showExample" aria-pressed="' + Boolean(data.showExample) + '">例句</button>' +
      '</div>' +
      '</section>';

    if (!data.allStudiedCount) {
      return '<header class="page-head memory-wall-head">' +
        '<div><p class="eyebrow">MEMORY WALL</p><h1 class="page-title">记忆墙</h1>' +
        '<p class="page-head__desc">把学过的词打印下来，贴到手边。先学一组词，这里就会自动出现。</p></div></header>' +
        '<section class="memory-wall-empty"><span>' + icon('notebook') + '</span><h2>还没有可以打印的单词</h2>' +
        '<p>学完第一组后，挑选最近学过、待巩固或收藏的词，生成适合粘贴的记忆卡。</p>' +
        '<a class="btn btn--primary" href="#study">去学第一组 ' + icon('arrow-right', 'icon--shift') + '</a></section>';
    }

    const lockPanel = data.unlocked ? '' :
      '<section class="memory-wall-lock no-print">' +
      '<div class="memory-wall-lock__mark">' + icon('lock') + '</div>' +
      '<div><p class="eyebrow">PAID PRINT PACK</p><h2>预览 3 张，完整记忆墙需解锁</h2>' +
      '<p>完整包支持 12–40 张、三种版式、待巩固词筛选、例句和音标开关，可反复打印。首发价 <strong>' + esc(data.priceLabel) + '</strong>，原价 ' + esc(data.regularPriceLabel) + '。</p></div>' +
      '<div class="memory-wall-lock__actions"><button class="btn btn--primary" type="button" data-action="buy-memory-wall">解锁完整打印包</button>' +
      '<button class="btn btn--ghost" type="button" data-action="activate-memory-wall">已有授权码</button></div></section>';

    const sheet = pages.map(function (pageWords, pageIndex) {
      return '<section class="memory-wall-page memory-wall-page--' + esc(layout) + '" aria-label="第 ' + (pageIndex + 1) + ' 页">' +
        '<header class="memory-wall-page__head"><div><span>拾词 · MEMORY WALL</span><strong>' + esc(book ? book.title : '当前词书') + '</strong></div>' +
        '<div><span>' + esc(date.full) + '</span><strong>' + esc(scopeLabels[scope] || '已学单词') + ' · ' + layoutLabels[layout] + '</strong></div></header>' +
        '<div class="memory-wall-grid">' +
        pageWords.map(function (word, wordIndex) {
          return memoryWallCard(word, pageIndex * perPage + wordIndex, {
            layout: layout,
            locked: !data.unlocked,
            showMeaning: data.showMeaning,
            showIpa: data.showIpa,
            showExample: data.showExample
          });
        }).join('') +
        '</div>' +
        '<footer class="memory-wall-page__foot"><span>拾词 · 一次一个词</span><span>' + (pageIndex + 1) + ' / ' + pages.length + '</span></footer>' +
        '</section>';
    }).join('');

    const preview = printedWords.length
      ? '<div class="memory-wall-sheet">' + sheet + '</div>'
      : '<section class="memory-wall-empty"><span>' + icon('bookmark') + '</span><h2>这个筛选里还没有词</h2><p>换一个范围，或者先复习几组词。</p></section>';

    return '<header class="page-head memory-wall-head">' +
      '<div><p class="eyebrow">MEMORY WALL</p><h1 class="page-title">记忆墙打印包</h1>' +
      '<p class="page-head__desc">把学过的词变成看得见、摸得到的记忆卡。挑一组，打印，然后贴到手边。</p></div>' +
      '<div class="page-head__aside"><span class="pill pill--green">' + esc(book ? book.title : '当前词书') + '</span>' +
      '<span class="pill">' + data.allStudiedCount + ' 个已学词</span></div></header>' +
      '<div class="memory-wall-studio">' +
      '<aside class="memory-wall-rail">' +
      controls + lockPanel +
      '<div class="memory-wall-summary no-print"><div><strong>' + data.filteredCount + '</strong><span>个词符合条件</span></div>' +
      '<p>' + (data.unlocked
        ? '当前会打印 ' + printedWords.length + ' 张，共 ' + pages.length + ' 页。建议使用 A4、实际大小、开启背景图形。'
        : '未解锁时只打印 3 张预览卡，不带完整版式和筛选。') + '</p>' +
      '<button class="btn btn--primary memory-wall-print-btn" type="button" data-action="print-memory-wall">' + icon('download') + ' 打印 / 存为 PDF</button></div>' +
      '</aside>' +
      '<section class="memory-wall-stage no-print-frame">' +
      '<header class="memory-wall-stage__head no-print"><div><strong>A4 预览</strong><span>' + (pages.length || 1) + ' 页 · ' + (layoutLabels[layout] || '便签卡') + '</span></div><span>' + (data.unlocked ? '可打印完整版' : '免费预览') + '</span></header>' +
      preview +
      '</section></div>';
  }

  function wordDrawer(word) {
    const unit = unitFor(word);
    const record = window.Store.getRecord(word.id);
    const baseStatus = window.Store.getStatus(word.id);
    const status = record && record.weak && baseStatus !== 'mastered' ? 'weak' : baseStatus;
    const favorite = Boolean(record && record.favorite);
    const quizLine = record && record.objectiveSeen ? ' · 客观提取 ' + record.objectiveCorrect + '/' + record.objectiveSeen : '';
    const stageText = record && record.seen
      ? (status === 'weak'
        ? '需要再看一眼 · ' + weaknessLabel(record) + ' · 下次复习：' + window.Store.getDueLabel(record) + quizLine
        : (status === 'mastered' ? '已通过跨日期与多题型验证 · 下次复习：' + window.Store.getDueLabel(record) + quizLine : '下次复习：' + window.Store.getDueLabel(record) + quizLine))
      : '还没开始学习 · 加入后会按遗忘曲线安排复习';
    return '<div class="overlay-backdrop" data-action="close-drawer"></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="wordDrawerTitle" style="' + unitStyle(unit) + '">' +
      '<div class="drawer__head"><p>WORD NOTE · 单词卡片</p><button class="icon-btn" type="button" data-action="close-drawer" aria-label="关闭单词卡">' + icon('close') + '</button></div>' +
      '<div class="drawer__body">' +
      '<div class="word-detail__unit"><i class="dot"></i>' + esc(unitDisplay(unit)) + ' · ' + esc(unit.en) + '</div>' +
      '<div class="word-detail__title-row"><h2 id="wordDrawerTitle">' + esc(word.word) + '</h2>' +
      '<button class="audio-btn audio-btn--ink word-detail__audio" type="button" data-action="speak" data-word="' + esc(word.word) + '" aria-label="朗读 ' + esc(word.word) + '">' + icon('volume') + '</button></div>' +
      '<div class="word-detail__ipa-row">' + (word.ipa ? '<span>' + esc(word.ipa) + '</span>' : '') + (word.pos ? '<span class="pos-badge">' + esc(word.pos) + '</span>' : '') + levelBadge(word.level) + '</div>' +
      '<div class="word-detail__meanings">' + coreMeanings(word).map(function (meaning) {
        return '<span class="meaning-chip"><em>' + esc(word.pos) + '</em>' + esc(meaning) + '</span>';
      }).join('') + '</div>' + extendedMeaningsHTML(word) +

      (word.example ? '<section class="detail-section" style="border-top:0;padding-top:0;">' +
      '<p class="detail-section__label">Example · 例句</p>' +
      '<p class="detail-example">' + highlight(word.example, word.word) + '</p>' +
      (word.translation ? '<p class="detail-translation">' + esc(word.translation) + '</p>' : '') +
      '</section>' : '') +

      (word.collocations && word.collocations.length ? '<section class="detail-section"><p class="detail-section__label">' + (word.lang === 'zh' ? 'Source · 出处' : 'Collocations · 搭配') + '</p>' +
      '<div class="collocation-list">' + word.collocations.map(function (item) { return '<span>' + esc(item) + '</span>'; }).join('') + '</div></section>' : '') +

      (word.family ? '<section class="detail-section"><p class="detail-section__label">Word family · 词族</p>' +
      '<p class="family-text">' + esc(word.family) + '</p></section>' : '') +

      (word.tip ? '<section class="detail-section"><p class="detail-section__label">Memory hook · 记忆点</p>' +
        '<div class="detail-note"><strong>小提示：</strong>' + esc(word.tip) + '</div></section>' : '') +
      (!word.example && (!word.collocations || !word.collocations.length) && !word.family && !word.tip ?
        '<section class="detail-section"><p class="detail-section__label">Practice · 造句</p>' +
        '<p class="family-text">试着用 ' + esc(word.word) + ' 口头造一个句子，再对照中文释义检查。能主动用出来，才是真的记住。</p></section>' : '') +
      '</div>' +
      '<div class="drawer__foot">' +
      '<div class="word-detail__status"><div class="word-detail__status-text"><span>' + statusMeta(status).label + '</span><strong>' + esc(stageText) + '</strong></div>' +
      (record && record.seen ? '<button class="text-link" type="button" data-action="mark-mastered" data-word-id="' + esc(word.id) + '">' + (record.manualLongTerm ? '恢复正常复习' : '延长到 60 天后') + '</button>' : '') + '</div>' +
      '<div class="word-detail__actions">' +
      '<button class="btn btn--primary" type="button" data-action="study-single" data-word-id="' + esc(word.id) + '">' + (record && record.seen ? '再学一次' : '现在学这个词') + ' ' + icon('arrow-right', 'icon--shift') + '</button>' +
      '<button class="icon-btn' + (favorite ? ' is-active' : '') + '" type="button" data-action="toggle-favorite" data-word-id="' + esc(word.id) + '" aria-label="' + (favorite ? '取消收藏' : '收藏') + '" aria-pressed="' + favorite + '">' + icon('star') + '</button>' +
      '</div></div>' +
      '</aside>';
  }

  function settingsDrawer(profile) {
    const goals = window.Store.getDailyGoalOptions();
    const persistence = window.Store.getPersistence();
    const savedText = persistence.lastSavedAt ? new Date(persistence.lastSavedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '还没有新的修改';
    const saveFailed = persistence.lastSaveOk === false;
    const indexedFallback = persistence.lastSaveOk === true && persistence.localStorage === false;
    const saveMode = saveFailed
      ? '学习记录尚未持久保存'
      : indexedFallback
        ? '正在使用浏览器数据库备份'
        : persistence.mode === 'degraded'
      ? '自动备份暂时中断'
      : (persistence.server ? '长期自动备份已开启' : '浏览器自动保存已开启');
    const saveDetail = saveFailed
      ? '主存储和浏览器数据库都没有确认写入。请先导出当前记录，再检查浏览器存储空间或隐私设置。'
      : indexedFallback
        ? '浏览器主存储暂时不可用，但 IndexedDB 已确认保存。建议立即导出备份。'
        : persistence.mode === 'degraded'
      ? '学习记录仍保存在浏览器中，系统会每 8 秒重试写入本机历史快照。'
      : (persistence.server
        ? '每次作答自动写入浏览器，并生成本机每日快照与定时快照；清除浏览器数据后可以从本机恢复。'
        : '每次学习后自动写入当前浏览器。换设备或清理浏览器前，请先导出备份文件。'
      );
    const voiceGender = profile.voiceGender === 'male' ? 'male' : 'female';
    const voiceRate = Number(profile.voiceRate) || 0.9;
    const voiceSupported = 'speechSynthesis' in window;
    const parsedBackupAt = persistence.lastBackupAt ? new Date(persistence.lastBackupAt) : null;
    const backupAt = parsedBackupAt && Number.isFinite(parsedBackupAt.getTime()) ? parsedBackupAt : null;
    const backupDays = backupAt ? Math.max(0, Math.floor((Date.now() - backupAt.getTime()) / (24 * 60 * 60 * 1000))) : null;
    const backupNote = backupAt
      ? (backupDays >= 14 ? '上次导出备份在 ' + backupDays + ' 天前，建议现在再导出一份。' : '上次导出备份：' + backupAt.toLocaleDateString('zh-CN'))
      : '还没有手动导出备份。浏览器数据可能因清理站点数据而丢失。';
    const entitlement = window.ShiciEntitlements
      ? window.ShiciEntitlements.getStatus()
      : { unlocked: false };
    const premiumStatus = entitlement.unlocked ? '已解锁完整记忆墙打印包' : '免费预览 3 张，完整版需购买';
    const voiceControl = '<section class="settings-section"><span class="settings-label">英语发音</span>' +
      '<div class="voice-options" role="group" aria-label="选择英语发音声线">' +
      '<button class="voice-option' + (voiceGender === 'female' ? ' is-active' : '') + '" type="button" data-action="set-voice-gender" data-gender="female" aria-pressed="' + (voiceGender === 'female') + '">' +
      '<span class="voice-option__mark">F</span><span><strong>女声</strong><small>标准美音 · 清晰</small></span></button>' +
      '<button class="voice-option' + (voiceGender === 'male' ? ' is-active' : '') + '" type="button" data-action="set-voice-gender" data-gender="male" aria-pressed="' + (voiceGender === 'male') + '">' +
      '<span class="voice-option__mark">M</span><span><strong>男声</strong><small>标准美音 · 沉稳</small></span></button>' +
      '</div>' +
      '<div class="voice-rate-row"><label for="settingsVoiceRate">语速</label>' +
      '<input id="settingsVoiceRate" type="range" min="0.7" max="1.15" step="0.05" value="' + voiceRate + '">' +
      '<output id="settingsVoiceRateValue">' + voiceRate.toFixed(2) + '×</output></div>' +
      '<button class="btn btn--ghost btn--sm voice-preview" type="button" data-action="preview-voice"' + (voiceSupported ? '' : ' disabled') + '>' + icon('volume') + ' 试听标准美音</button>' +
      '<p class="settings-help">' + (voiceSupported ? '优先选择系统内置的 en-US 声线；若当前浏览器没有对应性别的美音，会使用最接近的美音声线。' : '当前浏览器不支持语音朗读。') + '</p></section>';
    return '<div class="overlay-backdrop" data-action="close-drawer"></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">' +
      '<div class="drawer__head"><p>PREFERENCES · 学习设置</p><button class="icon-btn" type="button" data-action="close-drawer" aria-label="关闭设置">' + icon('close') + '</button></div>' +
      '<div class="drawer__body">' +
      '<h2 id="settingsTitle" class="page-title" style="font-size:30px;margin-bottom:7px;">把节奏，交给你。</h2>' +
      '<p class="page-head__desc" style="font-size:11px;margin-bottom:26px;">每天的目标不必很大，能持续就很好。</p>' +
      '<section class="settings-section"><label class="settings-label" for="settingsName">怎么称呼你？</label>' +
      '<input class="text-input" id="settingsName" type="text" maxlength="12" placeholder="同学" value="' + esc(profile.name) + '">' +
      '<p class="settings-help">会显示在首页问候里，留空就用“同学”。</p></section>' +
      '<section class="settings-section"><span class="settings-label">每天学习多少个词？</span>' +
      '<div class="goal-custom">' +
      '<button class="goal-step" type="button" data-action="goal-step" data-step="-5" aria-label="减少目标">−</button>' +
      '<input class="goal-number" id="settingsDailyGoal" type="number" min="' + window.Store.MIN_DAILY_GOAL + '" max="' + window.Store.MAX_DAILY_GOAL + '" step="1" inputmode="numeric" value="' + Number(profile.dailyGoal) + '" aria-label="每日学习单词数">' +
      '<span class="goal-custom__unit">词 / 天</span>' +
      '<button class="goal-step" type="button" data-action="goal-step" data-step="5" aria-label="增加目标">+</button>' +
      '</div>' +
      '<div class="goal-presets"><span>常用</span>' + goals.map(function (goal) {
        return '<button class="goal-preset" type="button" data-action="set-goal" data-value="' + goal + '">' + goal + '</button>';
      }).join('') + '</div>' +
      '<p class="settings-help">可设置 ' + window.Store.MIN_DAILY_GOAL + '–' + window.Store.MAX_DAILY_GOAL + ' 之间的任意整数。按“当天学过的不同单词数”计算，复习也算在目标里。</p></section>' +
      voiceControl +
      '<section class="data-safety-card' + (backupDays == null || backupDays >= 14 ? ' is-warning' : '') + '">' +
      '<span class="data-safety-card__icon">' + icon('lock') + '</span><div><strong>数据安全</strong><p>' + esc(backupNote) + '</p>' +
      '<small>' + (persistence.storagePersisted ? '浏览器已授予持久存储。' : '浏览器可能自动清理站点数据；持久存储申请以浏览器实际结果为准。') + '</small></div></section>' +
      '<section class="settings-section"><span class="settings-label">记录与备份</span>' +
      '<div class="save-status' + (persistence.mode === 'degraded' ? ' is-degraded' : '') + '"><i class="dot"></i><div><strong>' + saveMode + '</strong><span>' + savedText + ' · ' + esc(saveDetail) + '</span></div></div>' +
      '<div class="settings-actions">' +
      '<button class="btn btn--ghost btn--sm" type="button" data-action="export-progress">' + icon('download') + ' 导出当前记录</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-action="import-progress">' + icon('upload') + ' 导入备份</button>' +
      '<button class="btn btn--soft btn--sm" type="button" data-action="open-memory-wall">' + icon('notebook') + ' 记忆墙打印包</button>' +
      (persistence.server ? '<button class="btn btn--ghost btn--sm" type="button" data-action="restore-remote">' + icon('refresh') + ' 从本机恢复</button>' : '') +
      '</div>' +
      '<input id="importProgressFile" type="file" accept="application/json,.json" hidden>' +
      (persistence.server ? '<p class="settings-help">本机存档位于 macOS 的「拾词」应用支持目录：state.json 是当前版本，state.prev.json 是上一版，daily 文件夹永久保留每天的第一份快照，checkpoints 文件夹保留近 90 天每 6 小时的快照。</p>' : '<p class="settings-help">当前是浏览器存储模式。导出文件可以在另一台设备或 GitHub Pages 版本中导入。</p>') +
      '</section>' +
      '<section class="settings-section"><span class="settings-label">付费内容</span>' +
      '<div class="save-status"><i class="dot"></i><div><strong>' + esc(premiumStatus) + '</strong><span>记忆墙打印包提供 A4 便签卡、口袋条和大字墙，可反复打印。</span></div></div>' +
      '<div class="settings-actions"><button class="btn btn--soft btn--sm" type="button" data-action="open-memory-wall">' + icon('notebook') + (entitlement.unlocked ? ' 打开记忆墙' : ' 查看记忆墙打印包') + '</button></div>' +
      '</section>' +
      '<section class="settings-section"><span class="settings-label">反馈与帮助</span>' +
      '<div class="settings-actions">' +
      '<a class="btn btn--ghost btn--sm" href="feedback.html?book=' + encodeURIComponent(window.Store.getActiveBookId()) + '" target="_blank" rel="noopener">' + icon('edit') + ' 反馈与纠错</a>' +
      '<a class="btn btn--ghost btn--sm" href="privacy.html" target="_blank" rel="noopener">' + icon('lock') + ' 隐私说明</a>' +
      '<a class="btn btn--ghost btn--sm" href="terms.html" target="_blank" rel="noopener">' + icon('info') + ' 使用条款</a>' +
      '</div>' +
      '<p class="settings-help">内容纠错、学习记录异常和功能建议可从这里提交。GitHub Issue 是公开页面，请不要填写个人信息或上传完整学习记录。</p>' +
      '</section>' +
      '<div class="settings-divider"></div>' +
      '<button class="reset-btn" type="button" data-action="ask-reset">' + icon('trash') + ' 清除所有学习记录</button>' +
      '</div>' +
      '<div class="drawer__foot"><button class="btn btn--primary btn--block" type="button" data-action="save-settings">保存设置</button></div>' +
      '</aside>';
  }

  function modal(data) {
    return '<div class="modal-layer" data-action="modal-backdrop">' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
      '<span class="modal__icon">' + icon(data.icon || 'info') + '</span>' +
      '<h2 id="modalTitle">' + esc(data.title) + '</h2><p>' + esc(data.message) + '</p>' +
      (data.inputId ? '<label class="modal__field"><span>' + esc(data.inputLabel || '输入内容') + '</span><input class="text-input" id="' + esc(data.inputId) + '" type="text" autocomplete="off" placeholder="' + esc(data.inputPlaceholder || '') + '"></label>' : '') +
      '<div class="modal__actions"><button class="btn btn--ghost btn--sm" type="button" data-action="modal-cancel">' + esc(data.cancelLabel || '取消') + '</button>' +
      (data.extraLabel ? '<button class="btn btn--ghost btn--sm" type="button" data-action="modal-extra">' + esc(data.extraLabel) + '</button>' : '') +
      '<button class="btn ' + (data.danger ? 'btn--orange' : 'btn--primary') + ' btn--sm" type="button" data-action="modal-confirm">' + esc(data.confirmLabel || '确定') + '</button></div>' +
      '</div></div>';
  }

  function studyTop(modeTitle, modeSub, current, total, percent, completed) {
    return '<header class="study-top">' +
      '<button class="study-exit" type="button" data-action="exit-session" aria-label="退出本轮学习">' + icon('close') + '<span>退出</span></button>' +
      '<div class="study-mode"><span class="study-mode__mark">拾</span><div class="study-mode__copy"><strong>' + esc(modeTitle) + '</strong><span>' + esc(modeSub) + '</span></div></div>' +
      '<div class="study-count">' + (completed ? '<em>本轮完成</em>' : '<strong>' + String(current).padStart(2, '0') + '</strong><em>/ ' + String(total).padStart(2, '0') + '</em>') + '</div>' +
      '</header>' +
      '<div class="session-progress-track"><span style="width:' + clamp(percent, 0, 100) + '%"></span></div>';
  }

  function renderCardSession(session) {
    if (session.completed) return renderStudySummary(session);
    const item = session.queue[session.index];
    const word = window.Store.getWord(item.id);
    if (!word) return '<div class="empty-state"><h3>这一轮已经结束</h3></div>';
    const unit = unitFor(word);
    const record = window.Store.getRecord(word.id);
    const favorite = Boolean(record && record.favorite);
    const shown = session.index + 1;
    const total = session.queue.length;
    const percent = ((session.index) / Math.max(total, 1)) * 100;
    const sessionTitles = { review: '智能复习', new: '新词学习', practice: '复习已学', learned: '复习已学', single: '单词精学', relearn: '错词重学', daily: '今日计划', training: '混合提取' };
    const modeTitle = sessionTitles[session.type] || '今日计划';
    const modeSub = unit.title + ' · ' + (item.kind === 'new' ? '新词' : '复习');
    const unique = Object.keys(session.outcomes || {}).length;
    const previewAgain = window.Store.dueForSelfRating(word.id, 'again').label;
    const previewFuzzy = window.Store.dueForSelfRating(word.id, 'fuzzy').label;
    const previewKnown = window.Store.dueForSelfRating(word.id, 'known').label;

    const aside = '<aside class="study-aside">' +
      '<div class="study-aside__panel"><h3>THIS ROUND · 本轮</h3>' +
      '<div class="session-mini-stats"><div class="session-mini-stat"><strong>' + unique + '</strong><span>见过的词</span></div>' +
      '<div class="session-mini-stat"><strong>' + session.attempts + '</strong><span>次自评</span></div>' +
      '<div class="session-mini-stat"><strong>待检验</strong><span>客观提取</span></div></div>' +
      '<div class="aside-rule"></div>' +
      '<div class="aside-progress-row"><span>今日进度</span><strong>' + session.overviewToday + ' / ' + session.goal + '</strong></div>' +
      '<div class="aside-progress-track"><span style="width:' + Math.min(100, (session.overviewToday / Math.max(session.goal, 1)) * 100) + '%"></span></div>' +
      '</div>' +
      '<div class="study-aside__panel"><h3>SHORTCUTS · 快捷键</h3>' +
      '<div class="shortcut-list">' +
      '<div class="shortcut-list__row"><span>显示释义</span><kbd>SPACE</kbd></div>' +
      '<div class="shortcut-list__row"><span>忘了 / 不确定 / 能说出</span><kbd>1 · 2 · 3</kbd></div>' +
      '<div class="shortcut-list__row"><span>朗读发音</span><kbd>S</kbd></div>' +
      '<div class="shortcut-list__row"><span>收藏单词</span><kbd>F</kbd></div>' +
      '</div></div>' +
      '<p class="study-aside__quote">“记忆不是一次抓住，<br>是每次都比上次更近一点。”</p>' +
      '</aside>';

    const rating = '<div class="rating-bar">' +
      '<button class="rating-btn rating-btn--again" type="button" data-action="rate" data-rating="again"><span class="rating-btn__top"><strong>忘了</strong><kbd class="rating-btn__key">1</kbd></span><small>' + esc(previewAgain) + '再练</small></button>' +
      '<button class="rating-btn rating-btn--fuzzy" type="button" data-action="rate" data-rating="fuzzy"><span class="rating-btn__top"><strong>想起了，但不确定</strong><kbd class="rating-btn__key">2</kbd></span><small>' + esc(previewFuzzy) + '再测</small></button>' +
      '<button class="rating-btn rating-btn--known" type="button" data-action="rate" data-rating="known"><span class="rating-btn__top"><strong>能准确说出</strong><kbd class="rating-btn__key">3</kbd></span><small>' + esc(previewKnown) + '再测</small></button>' +
      '</div>';

    const frontFoot = '<div class="word-card__foot">' +
      '<span class="shortcut-hint"><kbd>SPACE</kbd> 显示释义 · 先在心里想一想</span>' +
      '<button class="btn btn--primary btn--sm" type="button" data-action="reveal">显示释义 ' + icon('arrow-right') + '</button></div>';

    return '<div class="study-shell">' +
      studyTop(modeTitle, modeSub, shown, total, percent, false) +
      '<main class="study-main">' +
      '<div class="study-card-column">' +
      '<article class="word-card' + (session.revealed ? ' is-revealed' : '') + '" tabindex="-1" style="' + unitStyle(unit) + '">' +
      '<header class="word-card__head"><span class="card-unit-tag"><i class="dot"></i>' + esc(unitDisplay(unit)) + ' · ' + esc(unit.en) + '</span>' +
      '<div class="card-tools">' +
      '<button class="audio-btn" type="button" data-action="speak" data-word="' + esc(word.word) + '" aria-label="朗读 ' + esc(word.word) + '">' + icon('volume') + '</button>' +
      '<button class="icon-btn' + (favorite ? ' is-active' : '') + '" type="button" data-action="toggle-favorite" data-word-id="' + esc(word.id) + '" aria-label="' + (favorite ? '取消收藏' : '收藏') + '" aria-pressed="' + favorite + '">' + icon('star') + '</button>' +
      '</div></header>' +
      '<div class="word-card__hero">' +
      '<div class="word-kicker"><i class="dot"></i>' + (item.kind === 'new' ? 'NEW WORD · 新词' : 'REVIEW · 复习') + (session.repeatMap && session.repeatMap[item.id] ? ' · 本轮回顾' : '') + '</div>' +
      '<h1>' + esc(word.word) + '</h1>' +
      '<div class="phonetic-row">' + (word.ipa ? '<span class="phonetic-row__ipa">' + esc(word.ipa) + '</span>' : '') + (word.pos ? '<span class="pos-badge">' + esc(word.pos) + '</span>' : '') + '</div>' +
      '<p class="recall-hint">' + icon('sparkles') + ' 先在心里说出它的中文意思，再翻开。</p>' +
      '</div>' +
      '<div class="word-card__reveal"><div class="reveal-divider"></div>' +
      '<div class="meaning-line">' + (word.pos ? '<span class="meaning-line__pos">' + esc(word.pos) + '</span>' : '') + '<p class="meaning-line__text">' + esc(coreMeanings(word).join('；')) + '</p></div>' +
      extendedMeaningsHTML(word) +
      (word.example ? '<div class="example-block"><p class="example-block__en">' + highlight(word.example, word.word) + '</p>' + (word.translation ? '<p class="example-block__zh">' + esc(word.translation) + '</p>' : '') + '</div>' :
        '<div class="example-block"><p class="example-block__en">试着用 ' + esc(word.word) + ' 造一个句子，再对照释义检查。</p><p class="example-block__zh">主动使用一次，会比多读几遍更容易记住。</p></div>') +
      ((word.collocations && word.collocations.length) || word.family || word.tip ?
        '<div class="reveal-detail-grid">' +
        ((word.collocations && word.collocations.length) ? '<div><p class="reveal-label">' + (word.lang === 'zh' ? 'SOURCE · 出处' : 'COLLOCATIONS · 搭配') + '</p><div class="reveal-collocs">' + word.collocations.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div></div>' : '') +
        ((word.family || word.tip) ? '<div><p class="reveal-label">MEMORY HOOK · 记忆点</p><p class="reveal-tip">' + (word.family ? '<strong>词族：</strong>' + esc(word.family) : '') + (word.tip ? (word.family ? '<br>' : '') + '<strong>提示：</strong>' + esc(word.tip) : '') + '</p></div>' : '') +
        '</div>' : '') +
      '</div>' +
      (!session.revealed ? frontFoot : '') +
      '</article>' +
      (session.revealed ? rating : '') +
      '</div>' +
      aside +
      '</main></div>';
  }

  function spellingQuestion(session) {
    return session.questions[session.index];
  }

  function renderMeaningQuiz(session) {
    const quiz = session.quiz;
    if (!quiz || !quiz.questions || !quiz.questions.length) {
      return '<div class="study-shell"><div class="summary-wrap"><div class="summary-card"><h1>检验准备中</h1></div></div></div>';
    }
    const question = quiz.questions[quiz.index];
    const word = window.Store.getWord(question.id);
    if (!word) return '<div class="study-shell"><div class="summary-wrap"><div class="summary-card"><h1>这一组已经结束</h1></div></div></div>';
    const total = quiz.questions.length;
    const shown = quiz.index + 1;
    const answered = Boolean(quiz.answered);
    const percent = (quiz.index / Math.max(total, 1)) * 100;
    const answeredCount = quiz.index + (answered ? 1 : 0);
    const currentScore = answeredCount ? Math.round((quiz.correctCount / answeredCount) * 100) : 0;
    const typeLabel = question.type === 'context'
      ? 'CONTEXT · 语境选词'
      : (question.type === 'reverse' ? 'REVERSE · 反向提取' : 'MEANING CHECK · 词义选择');
    const optionLetters = ['A', 'B', 'C', 'D'];
    const options = question.options.map(function (option, index) {
      let stateClass = '';
      if (answered) {
        if (index === question.correctIndex) stateClass = ' is-correct';
        else if (index === quiz.selected) stateClass = ' is-wrong';
      }
      return '<button class="quiz-option' + stateClass + '" type="button" data-action="quiz-answer" data-index="' + index + '"' + (answered ? ' disabled' : '') + '>' +
        '<span class="quiz-option__key">' + optionLetters[index] + '</span>' +
        '<span class="quiz-option__label">' + esc(option.text) + '</span>' +
        (answered && index === question.correctIndex ? '<span class="quiz-option__mark">' + icon('check') + '</span>' : '') +
        (answered && index === quiz.selected && index !== question.correctIndex ? '<span class="quiz-option__mark is-wrong">' + icon('close') + '</span>' : '') +
        '</button>';
    }).join('');
    const answeredCorrectly = Boolean(answered && question.options[quiz.selected] && question.options[quiz.selected].correct);
    const resultDetail = quiz.lastResult || null;
    let feedbackTitle = answeredCorrectly ? '答对了，意思抓得很准。' : '这次没选对，再看一眼。';
    if (answeredCorrectly && resultDetail && resultDetail.wasWeak) {
      feedbackTitle = resultDetail.weak
        ? '答对了。再连续答对 1 次，就能移出「待巩固」。'
        : '连续答对 2 次，这个词已经移出「待巩固」。';
    } else if (!answeredCorrectly) {
      feedbackTitle = '这次没选对，已放回「待巩固」。';
    }
    const selectedText = answered && question.options[quiz.selected] ? question.options[quiz.selected].text : '';
    const wrongReason = question.type === 'context'
      ? '这次混淆了词义与语境用法，下一次会再给一个不同句子。'
      : (question.type === 'reverse' ? '这次中文义项与拼写没有完全对应，下一次会换一种题型。' : '这次把相近义项混在了一起，已记录你选的干扰项。');
    const feedback = answered
      ? '<div class="quiz-feedback ' + (answeredCorrectly ? 'is-correct' : 'is-wrong') + '">' +
        '<span class="quiz-feedback__icon">' + icon(answeredCorrectly ? 'check' : 'close') + '</span>' +
        '<div class="quiz-feedback__copy"><strong>' + feedbackTitle + '</strong>' +
        '<p>正确答案：' + esc(question.targetWord) + (question.type === 'meaning' ? ' · ' + esc(question.correctMeaning) : '') + '</p>' +
        (!answeredCorrectly && selectedText ? '<small class="quiz-feedback__diagnosis">你选了「' + esc(selectedText.slice(0, 48)) + '」。' + esc(wrongReason) + '</small>' : '') + '</div>' +
        '<button class="btn btn--primary quiz-next-btn" type="button" data-action="quiz-next">' + (quiz.index + 1 >= total ? '看学习结果' : '下一题') + ' →</button></div>' +
        (word.example ? '<div class="quiz-example"><p>' + highlight(word.example, word.word) + '</p><span>' + esc(word.translation || '') + '</span></div>' : '') +
        '<div class="quiz-foot-hint">按 <kbd>ENTER</kbd> 继续</div>'
      : '<div class="quiz-foot-hint">按 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> 选择答案</div>';

    const aside = '<aside class="study-aside">' +
      '<div class="study-aside__panel"><h3>RETRIEVAL · 本组提取</h3>' +
      '<div class="session-mini-stats"><div class="session-mini-stat"><strong>' + answeredCount + '</strong><span>已作答</span></div>' +
      '<div class="session-mini-stat"><strong>' + quiz.correctCount + '</strong><span>答对</span></div>' +
      '<div class="session-mini-stat"><strong>' + currentScore + '%</strong><span>客观正确率</span></div></div>' +
      '<div class="aside-rule"></div>' +
      '<div class="aside-progress-row"><span>检验进度</span><strong>' + (answered ? shown : shown - 1) + ' / ' + total + '</strong></div>' +
      '<div class="aside-progress-track"><span style="width:' + (answeredCount / Math.max(total, 1) * 100) + '%"></span></div>' +
      '</div>' +
      '<div class="study-aside__panel"><h3>WHY THIS CHECK</h3>' +
      '<p class="quiz-aside-note">题型会在词义、语境和反向提取之间轮换。答错会记录你选的干扰项和错误类型；只有跨日期、跨题型的成功提取才会进入“已掌握”。</p></div>' +
      '<p class="study-aside__quote">“检验不是结束，<br>是下一次记忆的起点。”</p>' +
      '</aside>';

    return '<div class="study-shell">' +
      studyTop('本组提取', ({ meaning: '词义选择', context: '语境选词', reverse: '反向提取' }[question.type] || '混合提取') + ' · 客观题独立计分', shown, total, percent, false) +
      '<main class="study-main meaning-quiz-main">' +
      '<div class="study-card-column">' +
      '<section class="meaning-quiz-card" tabindex="-1">' +
      '<header class="quiz-card-head"><span class="quiz-kicker">' + icon('target') + ' ' + typeLabel + ' · 第 ' + shown + ' 题</span>' +
      '<span class="quiz-live-score">得分 <strong>' + quiz.correctCount + '</strong></span></header>' +
      '<p class="quiz-prompt">' + esc(question.prompt) + '</p>' +
      (question.type === 'context'
        ? ''
        : '<h1 class="quiz-word' + (question.type === 'reverse' ? ' quiz-word--zh' : '') + '">' + esc(question.wordText) + '</h1>') +
      (question.type === 'context'
        ? '<div class="quiz-context">' + question.context + '</div>'
        : '<div class="quiz-word-meta">' + (question.type === 'meaning' && word.ipa ? '<span>' + esc(word.ipa) + '</span>' : '') + (word.pos ? '<span class="pos-badge">' + esc(word.pos) + '</span>' : '') + '</div>') +
      '<div class="quiz-options">' + options + '</div>' +
      feedback +
      '</section></div>' +
      aside +
      '</main></div>';
  }

  function renderSpelling(session) {
    if (session.completed) return renderSpellingSummary(session);
    const question = spellingQuestion(session);
    const word = window.Store.getWord(question.id);
    if (!word) return '<div class="empty-state"><h3>这一轮已经结束</h3></div>';
    const total = session.questions.length;
    const shown = session.index + 1;
    const percent = (session.index / Math.max(total, 1)) * 100;
    const dots = session.questions.map(function (_, index) {
      if (index < session.index) return '<span class="is-done"></span>';
      if (index === session.index) return '<span class="is-current"></span>';
      return '<span></span>';
    }).join('');
    const hint = session.hintUsed ? (word.word.slice(0, 1) + ' ' + '· '.repeat(Math.max(word.word.length - 1, 1)).trim() + ' · ' + word.word.length + ' letters') : '';
    const checked = Boolean(session.checked);
    const result = session.currentCorrect;
    const sentence = word.example ? blankExample(word.example, word.word) : '';
    let feedback = '';
    if (checked) {
      feedback = '<div class="spell-feedback ' + (result ? 'spell-feedback--correct' : 'spell-feedback--wrong') + '">' +
        '<span class="spell-feedback__icon">' + icon(result ? 'check' : 'close') + '</span>' +
        '<div class="spell-feedback__copy"><strong>' + (result ? '拼写正确，很稳。' : '差一点，正确拼写是：') + '</strong>' +
        (result ? '<p>读一遍例句，让这个词在句子里留下位置。</p>' : '<p><span class="spell-correct-word">' + esc(word.word) + '</span> · ' + esc(coreMeanings(word).join('；')) + '</p>') + '</div>' +
        '<button class="btn btn--primary spell-next-btn" type="button" data-action="next-spelling">' + (session.index + 1 >= total ? '看结果' : '下一题') + ' →</button>' +
        '</div>';
    }
    return '<div class="study-shell">' +
      studyTop('已学词拼写', '只抽查见过的词 · 题量按已学词缩短', shown, total, percent, false) +
      '<main class="spell-main">' +
      '<section class="spell-card" tabindex="-1">' +
      '<header class="spell-head"><span class="spell-head__title">' + icon('keyboard') + ' SPELLING · 第 ' + shown + ' 题</span><div class="spell-dots">' + dots + '</div></header>' +
      '<h1 class="spell-prompt">' + esc(coreMeanings(word).join('；')) + '</h1>' +
      '<div class="spell-prompt-sub"><span class="pos-badge">' + esc(word.pos) + '</span><span>·</span><span>共 ' + word.word.length + ' 个字母</span></div>' +
      '<div class="spell-sentence">' + (sentence ? '<p>' + sentence + '</p>' : '<p>根据中文释义，拼出完整的英文单词。</p>') + (word.translation ? '<p class="spell-sentence__zh">' + esc(word.translation) + '</p>' : '') + '</div>' +
      '<form class="spell-form" id="spellForm" action="#" novalidate>' +
      '<input class="spell-input" id="spellInput" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="输入英文单词" placeholder="在这里输入英文单词" value="' + (checked ? esc(session.submitted) : esc(session.draft || '')) + '"' + (checked ? ' disabled' : '') + '>' +
      (checked ? '' : '<button class="btn btn--primary" type="submit" data-action="check-spelling">检查</button>') +
      '</form>' +
      '<div class="spell-tools"><button class="spell-hint-btn" type="button" data-action="spell-hint"' + (checked || session.hintUsed ? ' disabled' : '') + '>' + icon('info') + ' 给点提示</button>' +
      '<div class="spell-tools__right"><span class="spell-hint' + (session.hintUsed ? '' : ' is-hidden') + '">' + esc(hint) + '</span>' +
      '<button class="audio-btn audio-btn--ink" type="button" data-action="speak" data-word="' + esc(word.word) + '" aria-label="朗读发音" style="width:30px;height:30px;">' + icon('volume') + '</button></div></div>' +
      feedback +
      '<footer class="spell-foot"><span>按 <kbd>ENTER</kbd> ' + (checked ? '继续' : '检查拼写') + '</span><span>答错也没关系，下一轮再见。</span></footer>' +
      '</section></main></div>';
  }

  function renderStudySummary(session) {
    const summary = session.summary || {};
    const words = (summary.words || []).map(function (word) { return '<span>' + esc(word.word) + '</span>'; }).join('');
    const extra = (summary.moreCount || 0) > 0 ? '<span class="more">+' + summary.moreCount + ' 个</span>' : '';
    const remainingWords = summary.remainingWords || summary.weakWords || [];
    const quizTotal = Number(summary.quizTotal) || 0;
    const quizCorrect = Number(summary.quizCorrect) || 0;
    const quizScore = Number(summary.quizScore) || 0;
    const hasRemaining = remainingWords.length > 0;
    const title = hasRemaining ? '这一组，还有几个词要再见。' : '这一组，检验完成。';
    const desc = hasRemaining
      ? '检验结果已经写回复习安排。错词需要连续答对 2 次，才算真正移出「待巩固」；你可以无限重学，直到全部攻克。'
      : '这一组词已经全部通过连续检验。之后仍会按遗忘曲线回来复习，让记忆慢慢变长。';
    const checkNote = quizTotal
      ? '<div class="summary-check ' + (hasRemaining ? 'has-weak' : 'is-clear') + '">' +
        '<span class="summary-check__icon">' + icon(hasRemaining ? 'refresh' : 'check') + '</span>' +
        '<div><strong>' + (hasRemaining ? '还有 ' + remainingWords.length + ' 个词需要继续巩固' : '这组词已全部通过检验') + '</strong>' +
        '<p>' + (hasRemaining
          ? '答错的词会回到待巩固。每一个错词都要连续答对 2 次才会移出，可以一直重学，不限轮数。'
          : '没有剩余错词。下一次复习会按原计划出现，不需要额外加量。') + '</p></div>' +
        '<span class="summary-check__score">' + quizCorrect + ' / ' + quizTotal + '</span></div>' +
        (hasRemaining ? '<div class="summary-weak-list">' + remainingWords.map(function (word) { return '<span>' + esc(word.word) + '</span>'; }).join('') + '</div>' : '')
      : '';
    const primary = hasRemaining
      ? '<button class="btn btn--primary" type="button" data-action="relearn-weak">重新学习错误单词（' + remainingWords.length + '） ' + icon('arrow-right', 'icon--shift') + '</button>'
      : '<button class="btn btn--primary" type="button" data-action="session-another">' + (summary.canContinue ? (summary.anotherLabel || '再学一组') : '回到学习中心') + ' ' + icon('arrow-right', 'icon--shift') + '</button>';
    const loopHint = hasRemaining
      ? '<p class="summary-loop-hint">' + icon('refresh') + ' 可无限继续，直到所有词连续答对 2 次。</p>'
      : '';
    return '<div class="study-shell">' +
      studyTop('学习与检验完成', ({ review: '智能复习', single: '单词精学', new: '新词学习', practice: '复习已学', learned: '复习已学', relearn: '错词重学', training: '混合提取' }[session.type] || '今日计划') + ' · ' + (summary.minutes || 1) + ' 分钟', 1, 1, 100, true) +
      '<div class="summary-wrap"><article class="summary-card" tabindex="-1">' +
      '<div class="summary-head"><div><p class="summary-kicker">' + icon('sparkles') + ' SESSION COMPLETE</p><h1>' + title + '</h1><p class="summary-desc">' + desc + '</p></div>' +
      '<span class="summary-badge">' + icon('check') + '</span></div>' +
      '<div class="summary-stats"><div class="summary-stat"><strong>' + (summary.newCount || 0) + '</strong><span>新学单词</span></div>' +
      '<div class="summary-stat"><strong>' + (summary.reviewCount || 0) + '</strong><span>复习单词</span></div>' +
      '<div class="summary-stat"><strong>' + quizScore + '<small>%</small></strong><span>检验得分</span></div></div>' +
      checkNote +
      '<div class="summary-words"><div class="summary-words__head"><span>本组词语</span><span>' + (summary.totalWords || 0) + ' 个</span></div><div class="summary-word-list">' + words + extra + '</div></div>' +
      '<div class="summary-actions">' + primary +
      '<button class="btn btn--ghost" type="button" data-action="finish-to-report">查看学习报告</button>' +
      '<button class="btn btn--ghost" type="button" data-action="finish-to-home">回到今日</button></div>' +
      loopHint +
      '</article></div></div>';
  }

  function renderSpellingSummary(session) {
    const summary = session.summary || {};
    const score = summary.score || 0;
    const missed = summary.missed || [];
    const circumference = 2 * Math.PI * 35;
    const offset = circumference * (1 - score / 100);
    let title;
    let desc;
    if (score === 100) {
      title = '满分，拼写很稳。';
      desc = '每个词都完整地回到了笔尖。试着把它们放进自己的句子里，记忆会更深。';
    } else if (score >= 75) {
      title = '拼得很不错。';
      desc = '大部分词都已经找到位置。看看没拼对的几个，再回来挑战一次。';
    } else {
      title = '再练一次，就更熟了。';
      desc = '拼写是把“认识”变成“会用”的一步。先读一读正确的拼写，再开始下一轮。';
    }
    return '<div class="study-shell">' +
      studyTop('已学词拼写完成', 'SPELLING COMPLETE', 1, 1, 100, true) +
      '<div class="summary-wrap"><article class="summary-card" tabindex="-1">' +
      '<div class="summary-head"><div><p class="summary-kicker">' + icon('target') + ' CHALLENGE COMPLETE</p><h1>' + title + '</h1><p class="summary-desc">' + desc + '</p></div>' +
      '<span class="summary-badge">' + icon('trophy') + '</span></div>' +
      '<div class="quiz-score"><div class="quiz-score__ring"><svg viewBox="0 0 86 86" aria-hidden="true"><circle cx="43" cy="43" r="35" stroke="rgba(49,90,74,.1)"></circle><circle cx="43" cy="43" r="35" stroke="var(--green-700)" stroke-linecap="round" stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"></circle></svg><strong>' + score + '</strong></div>' +
      '<div class="quiz-score__copy"><strong>拼对 ' + (summary.correct || 0) + ' / ' + (summary.total || 0) + ' 个已学词</strong><p>用时约 ' + (summary.minutes || 1) + ' 分钟。拼写作为客观提取单独计分，不把自评“认识”算进正确率。</p></div></div>' +
      (missed.length ? '<div class="quiz-review"><p class="quiz-review__label">需要再看一眼</p><div class="quiz-missed-list">' + missed.map(function (word) { return '<span>' + esc(word.word) + '</span>'; }).join('') + '</div></div>' : '<div class="quiz-review"><p class="quiz-review__label">本轮全部拼对</p><p class="summary-desc" style="margin-top:0;">没有需要特别回看的词。去试试下一组，或者回到词库读一读例句。</p></div>') +
      '<div class="summary-actions">' + (missed.length
        ? '<button class="btn btn--primary" type="button" data-action="relearn-session-words">重新学习错误单词（' + missed.length + '） ' + icon('arrow-right', 'icon--shift') + '</button><button class="btn btn--ghost" type="button" data-action="spell-another">再来一组</button>'
        : '<button class="btn btn--primary" type="button" data-action="spell-another">再来一组 ' + icon('arrow-right', 'icon--shift') + '</button>') +
      '<button class="btn btn--ghost" type="button" data-action="finish-to-report">学习报告</button>' +
      '<button class="btn btn--ghost" type="button" data-action="finish-to-home">回到今日</button></div>' +
      '</article></div></div>';
  }

  function renderSession(session) {
    let content;
    if (session.phase === 'quiz' && !session.completed) content = renderMeaningQuiz(session);
    else if (session.type === 'spelling') content = renderSpelling(session);
    else content = renderCardSession(session);
    return '<div class="study-overlay">' + content + '</div>';
  }

  function searchSuggestions(query, words) {
    if (!words.length) return '<p class="search-suggest__empty">没有找到匹配的词</p>';
    return words.map(function (word) {
      return '<button class="search-suggest__item" type="button" data-action="open-word" data-word-id="' + esc(word.id) + '">' +
        '<span class="search-suggest__word">' + esc(word.word) + '</span>' +
        '<span class="search-suggest__meaning">' + esc(word.meanings.join('；')) + '</span></button>';
    }).join('');
  }

  UI.helpers = {
    icon: icon,
    esc: esc,
    highlight: highlight,
    blankExample: blankExample,
    unitFor: unitFor,
    unitStyle: unitStyle,
    statusPill: statusPill,
    greeting: greeting,
    formatDate: formatDate,
    wordStem: wordStem
  };
  UI.renderHome = renderHome;
  UI.renderStudyCenter = renderStudyCenter;
  UI.renderLibrary = renderLibrary;
  UI.renderBooks = renderBooks;
  UI.renderReport = renderReport;
  UI.renderMemoryWall = renderMemoryWall;
  UI.wordDrawer = wordDrawer;
  UI.settingsDrawer = settingsDrawer;
  UI.modal = modal;
  UI.renderSession = renderSession;
  UI.searchSuggestions = searchSuggestions;
  UI.getCurrentUnit = getCurrentUnit;

  window.UI = UI;
})();
