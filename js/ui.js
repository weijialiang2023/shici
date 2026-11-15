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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function activeBook() {
    return (window.Store && window.Store.getBookMeta()) || (window.BOOKS || [])[0] || null;
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
    const unit = unitFor(word);
    const record = window.Store.getRecord(word.id);
    const favorite = Boolean(record && record.favorite);
    const percent = overview.goal ? Math.round((overview.todayUnique / overview.goal) * 100) : 0;
    const planCount = overview.planCount;
    const done = planCount === 0;
    let headline;
    let action;
    let actionLabel = '开始今日学习';
    let secondary = '<button class="btn btn--ghost" type="button" data-action="scroll-to-rhythm">看看复习节奏 ' + icon('arrow-right', 'icon--shift') + '</button>';

    if (!done) {
      if (overview.planReviewCount > 0) {
        headline = '今天，和 <em>' + planCount + '</em> 个词<br>再见一面。';
      } else {
        headline = '今天，拾起 <em>' + planCount + '</em> 个新词。';
      }
      action = 'start-daily';
    } else if (overview.todayUnique > 0) {
      headline = '今天的目标，<br>已经收好了。';
      if (overview.reviewDueToday > 0) {
        action = 'start-review';
        actionLabel = '继续复习';
      } else if (overview.newRemaining > 0) {
        action = 'start-extra-new';
        actionLabel = '再学 10 个新词';
      } else {
        action = 'start-practice';
        actionLabel = '自由复习 10 个';
      }
      secondary = '<button class="btn btn--ghost" type="button" data-action="navigate" data-route="report">查看学习报告 ' + icon('arrow-right', 'icon--shift') + '</button>';
    } else {
      headline = '从第一个词开始，<br>慢慢把表达收进口袋。';
      action = 'start-daily';
    }

    const meta = done
      ? '今日已学 ' + overview.todayUnique + ' 个词 · 正确率 ' + overview.accuracy + '% · 已连续学习 ' + overview.streak + ' 天'
      : '新词 ' + overview.planNewCount + ' · 复习 ' + overview.planReviewCount + ' · 预计 ' + (overview.estimatedMinutes || 1) + ' 分钟 · 乱序抽取';

    const unitCards = currentUnits().map(function (item) {
      const progress = findUnitProgress(item.id);
      const label = progress.progress >= 100 ? '已学完' : (progress.seen > 0 ? '已开始' : '未开始');
      return '<a class="unit-card" href="#library?unit=' + item.id + '" style="' + unitStyle(item) + '">' +
        '<div class="unit-card__top">' +
        '<span class="unit-card__index">' + (String(item.title).indexOf('乱序') === 0 ? 'SET ' : '') + String(item.id).padStart(2, '0') + ' / ' + label + '</span>' +
        '<span class="unit-icon">' + icon(item.icon) + '</span>' +
        '</div>' +
        '<h3 class="unit-card__title">' + esc(item.title) + '</h3>' +
        '<p class="unit-card__en">' + esc(item.en) + '</p>' +
        '<p class="unit-card__desc">' + esc(item.description) + '</p>' +
        '<div class="unit-card__foot">' +
        '<div class="unit-progress"><div class="unit-progress__row"><span>' + progress.seen + ' / ' + progress.total + ' 个词</span><span>' + progress.progress + '%</span></div>' +
        '<div class="unit-progress__track"><span style="width:' + progress.progress + '%"></span></div></div>' +
        '<span class="unit-arrow">' + icon('arrow-up-right') + '</span>' +
        '</div>' +
        '</a>';
    }).join('');

    return '' +
      '<header class="page-head home-head">' +
      '<div>' +
      '<p class="eyebrow">' + data.date.weekday + ' · ' + data.date.dateCN + '</p>' +
      '<h1 class="page-title">' + esc(data.greeting) + (data.name ? '，' + esc(data.name) : '') + '。</h1>' +
      '<p class="page-head__desc">今天也留一点时间给新的表达。不着急，一次一个词。</p>' +
      '</div>' +
      '<div class="home-head__meta">' + bookContextHTML('home') + '</div>' +
      '</header>' +

      '<section class="home-grid">' +
      '<article class="daily-card' + (done ? ' daily-card--done' : '') + '">' +
      '<div class="daily-card__copy">' +
      '<p class="daily-card__eyebrow"><i class="live-dot"></i> 今日学习计划</p>' +
      '<h2>' + headline + '</h2>' +
      '<p class="daily-card__meta">' + meta + '</p>' +
      '<div class="daily-card__actions">' +
      '<button class="btn btn--primary" type="button" data-action="' + action + '">' + actionLabel + ' ' + icon('arrow-right', 'icon--shift') + '</button>' +
      secondary +
      '</div>' +
      '</div>' +
      '<div class="hero-visual">' +
      '<div class="progress-ring">' + circleProgress(percent) +
      '<div class="progress-ring__inner"><strong>' + Math.min(percent, 100) + '<small>%</small></strong><span>今日进度</span></div></div>' +
      '<span class="hero-visual__caption">' + overview.todayUnique + ' / ' + overview.goal + ' WORDS</span>' +
      '</div>' +
      '<span class="hero-star">' + icon('sparkles') + '</span>' +
      branchSVG() +
      '</article>' +

      '<article class="word-of-day">' +
      '<div class="word-of-day__head">' +
      '<p>Word of the day · 今日一词</p>' +
      '<span class="word-stamp">DAILY<br>PICK</span>' +
      '</div>' +
      '<div class="word-of-day__body">' +
      '<div class="word-of-day__word-row"><h3>' + esc(word.word) + '</h3>' +
      '<button class="audio-btn" type="button" data-action="speak" data-word="' + esc(word.word) + '" aria-label="朗读 ' + esc(word.word) + '">' + icon('volume') + '</button></div>' +
      '<p class="word-of-day__ipa">' + esc(word.ipa || '—') + (word.pos ? ' &nbsp; ' + esc(word.pos) : '') + '</p>' +
      '<p class="word-of-day__meaning">' + esc(word.meanings.join('；')) + '</p>' +
      (word.example ? '<p class="word-of-day__example">' + highlight(word.example, word.word) + '</p>' : '<p class="word-of-day__example">先记住它的中文意思，再到词卡里看搭配。</p>') +
      '</div>' +
      '<div class="word-of-day__foot">' +
      '<span class="word-of-day__unit"><i class="dot"></i>' + esc(unitDisplay(unit)) + '</span>' +
      '<button class="text-link" type="button" data-action="open-word" data-word-id="' + esc(word.id) + '">收进单词卡 ' + icon('arrow-up-right') + '</button>' +
      '</div>' +
      '</article>' +
      '</section>' +

      '<section class="stat-strip" aria-label="学习概况">' +
      '<div class="stat-item"><span class="stat-item__icon">' + icon('book-open') + '</span><div class="stat-item__text"><span class="stat-item__label">今日已学</span><strong class="stat-item__value">' + overview.todayUnique + '<small> / ' + overview.goal + '</small></strong></div></div>' +
      '<div class="stat-item"><span class="stat-item__icon">' + icon('refresh') + '</span><div class="stat-item__text"><span class="stat-item__label">今日待复习</span><strong class="stat-item__value">' + overview.reviewDueToday + '<small> 个</small></strong></div></div>' +
      '<div class="stat-item"><span class="stat-item__icon">' + icon('trophy') + '</span><div class="stat-item__text"><span class="stat-item__label">已掌握</span><strong class="stat-item__value">' + overview.mastered + '<small> / ' + overview.totalWords + '</small></strong></div></div>' +
      '<div class="stat-item"><span class="stat-item__icon">' + icon('flame') + '</span><div class="stat-item__text"><span class="stat-item__label">连续学习</span><strong class="stat-item__value">' + overview.streak + '<small> 天</small></strong></div></div>' +
      '</section>' +

      '<section class="units-section">' +
      '<div class="section-head"><div><h2>' + (activeBook() && activeBook().id === 'curated' ? '按主题，收词' : '乱序词组') + '</h2><p class="section-head__desc">' + (activeBook() ? activeBook().count + ' 个词，已打乱分成 ' + currentUnits().length + ' 组。每次学习再乱序抽取。' : '把词放进句子里记。') + '</p></div>' +
      '<a class="text-link" href="#library">全部词汇 ' + icon('arrow-right') + '</a></div>' +
      '<div class="unit-grid">' + unitCards + '</div>' +
      '</section>' +

      '<section class="home-lower-grid">' +
      '<article class="memory-card" id="memory-rhythm">' +
      '<div class="memory-card__head"><div><h2>记忆会遗忘，复习让它留下来</h2>' +
      '<p class="memory-card__desc">参考艾宾浩斯遗忘曲线，在快要忘记时再见一面。</p></div>' +
      '<div class="curve-legend"><span><i></i>记忆保持</span><span><i></i>复习节点</span></div></div>' +
      curveSVG('home') +
      '<div class="review-rhythm"><span class="review-rhythm__label">复习节奏</span>' + rhythmChips() + '</div>' +
      '<p class="curve-caption">第一次学完后，单词会在第 1、2、4、7、15、30 天再次出现；没记住的词，会回到本轮快速重现。</p>' +
      '</article>' +
      '<article class="quote-card">' +
      '<div><p class="quote-card__label">' + icon('sparkles') + ' Daily note · 每日一句</p>' +
      '<blockquote><p>“' + esc(quote.en) + '”</p><footer>— ' + esc(quote.author) + '</footer></blockquote></div>' +
      '<div class="quote-card__bottom"><p class="quote-card__zh">' + esc(quote.zh) + '</p><span class="quote-card__seal">拾词<br>WORD<br>NOTE</span></div>' +
      '</article>' +
      '</section>';
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
          : '<button class="btn btn--ghost btn--sm" type="button" data-action="switch-book" data-book-id="' + esc(book.id) + '"' + (isLoading ? ' disabled' : '') + '>' + (isLoading ? '正在打开…' : '切换到这本') + ' ' + icon('arrow-right') + '</button>') +
        '</div></div>' +
        '</article>';
    }).join('');

    return '' +
      '<header class="page-head books-head">' +
      '<div><p class="eyebrow">WORD SHELF</p><h1 class="page-title">词书书架</h1>' +
      '<p class="page-head__desc">从高中核心到雅思、四六级，选一本现在需要的。切换词书不会清空已有的学习记录。</p></div>' +
      '<div class="page-head__aside"><span class="pill pill--green">' + books.length + ' 本词书 · ' + totalWords + ' 个词条</span></div>' +
      '</header>' +
      '<div class="books-note">' + icon('info') + '<p>单词进度按词条分别记录。遇到两本书里都有的词，已经熟悉的记忆会保留下来。每天的复习计划只从当前词书里抽取，并按乱序出现。</p></div>' +
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
      desc = '还可以做一轮自由复习，或去拼写里检验一下。抽取顺序会打乱，不必按字母表来。';
      if (overview.reviewDueToday > 0) {
        primaryAction = 'start-review';
        primaryLabel = '继续复习';
      } else if (overview.newRemaining > 0) {
        primaryAction = 'start-extra-new';
        primaryLabel = '再学 10 个新词';
      } else {
        primaryAction = 'start-practice';
        primaryLabel = '自由复习 10 个';
      }
    } else {
      title = '今天还剩 <em>' + planCount + '</em> 个词，<br>按自己的节奏来。';
      desc = '新词 ' + overview.planNewCount + ' 个 · 复习 ' + overview.planReviewCount + ' 个 · 预计 ' + (overview.estimatedMinutes || 1) + ' 分钟。整组词会乱序出现，答错的词会在本轮再次出现。';
    }

    const dueCount = overview.due;
    const newCount = overview.newRemaining;
    const isChineseBook = activeBook().id === 'wenyan';
    const modes = [
      {
        action: 'start-new',
        number: '01',
        icon: 'sparkles',
        title: '新词学习',
        en: 'Learn something new',
        desc: '从当前词书中乱序抽取一组新词。先回忆，再看释义，把新词放进真实语境。',
        count: newCount > 0 ? '还有 ' + newCount + ' 个词未学习' : '所有词都见过面了',
        disabled: newCount === 0
      },
      {
        action: 'start-review',
        number: '02',
        icon: 'refresh',
        title: '智能复习',
        en: 'Review on time',
        desc: '按遗忘曲线挑出今天到期的词。在快要忘记的时候复习，记得更牢。',
        count: dueCount > 0 ? '今天有 ' + dueCount + ' 个词待复习' : '今天没有到期的词',
        disabled: dueCount === 0
      },
      {
        action: isChineseBook ? '' : 'start-spelling',
        number: '03',
        icon: isChineseBook ? 'book-open' : 'keyboard',
        title: isChineseBook ? '字义回看' : '拼写挑战',
        en: isChineseBook ? 'Meaning check' : 'Spell it out',
        desc: isChineseBook ? '文言实词以字义、语境和多义项为主。学完卡片后会直接进入词义检验。' : '看中文和例句，把单词完整拼出来。8 道题，检验是否真的记住。',
        count: isChineseBook ? '拼写挑战对汉字不适用' : (overview.totalSeen > 0 ? '从学过的词中抽取 8 个' : '第一次可直接体验 8 个词'),
        disabled: isChineseBook
      }
    ];

    return '' +
      '<header class="page-head">' +
      '<div><p class="eyebrow">STUDY ROOM</p><h1 class="page-title">学习中心</h1>' +
      '<p class="page-head__desc">不追求一次记住，只让每次见面都更熟一点。</p></div>' +
      '<div class="page-head__aside">' + bookContextHTML('sm') + '<span class="pill pill--green"><i class="dot"></i> 遗忘曲线复习</span></div>' +
      '</header>' +

      '<section class="study-plan">' +
      '<div class="study-plan__copy">' +
      '<p class="eyebrow">TODAY\'S PLAN &nbsp;' + overview.todayUnique + ' / ' + overview.goal + '</p>' +
      '<h2>' + title + '</h2>' +
      '<p class="study-plan__desc">' + desc + '</p>' +
      '<div class="study-plan__actions">' +
      '<button class="btn btn--primary" type="button" data-action="' + primaryAction + '">' + primaryLabel + ' ' + icon('arrow-right', 'icon--shift') + '</button>' +
      (overview.weak > 0 ? '<button class="btn btn--ghost btn--relearn" type="button" data-action="start-relearn-all">重学错词（' + overview.weak + '）</button>' : '') +
      '<a class="btn btn--ghost" href="#report">查看学习报告</a>' +
      '</div></div>' +
      '<div class="study-plan__visual">' +
      '<div class="dark-progress">' + circleProgress(percent) +
      '<div class="dark-progress__inner"><strong>' + Math.min(percent, 100) + '<small>%</small></strong><span>今日目标</span></div></div>' +
      '</div>' +
      '<span class="study-plan__breakdown"><i class="dot"></i> ' + overview.goal + ' 词 / 天 · 约 ' + (overview.estimatedMinutes || Math.max(1, Math.round(overview.goal * 0.35))) + ' 分钟</span>' +
      '</section>' +

      '<div class="mode-grid">' +
      modes.map(function (mode) {
        return '<button class="mode-card' + (mode.disabled ? ' is-disabled' : '') + '" type="button" data-number="' + mode.number + '"' +
          (mode.disabled ? ' disabled' : ' data-action="' + mode.action + '"') + '>' +
          '<div class="mode-card__head"><span class="mode-card__icon">' + icon(mode.icon) + '</span><span class="mode-card__index">' + mode.number + ' / 03</span></div>' +
          '<h3>' + mode.title + '</h3><p class="mode-card__en">' + mode.en + '</p>' +
          '<p class="mode-card__desc">' + mode.desc + '</p>' +
          '<div class="mode-card__foot"><span class="mode-card__count">' + mode.count + '</span><span class="mode-card__start">' + icon('arrow-up-right') + '</span></div>' +
          '</button>';
      }).join('') +
      '</div>' +

      '<section class="rhythm-panel">' +
      '<div><h2>你的复习节奏</h2><p>参考艾宾浩斯遗忘曲线：第一次学习后，在记忆开始模糊的节点安排复习。每一次成功回忆，间隔都会拉长。</p></div>' +
      '<div class="rhythm-timeline">' +
      ['首次学习', '1 天', '2 天', '4 天', '7 天', '15 天', '30 天'].map(function (label) {
        return '<div class="rhythm-node"><i></i><span>' + label + '</span></div>';
      }).join('') +
      '</div>' +
      '</section>' +

      '<section class="study-tip">' +
      '<span class="study-tip__icon">' + icon('info') + '</span>' +
      '<div><h3>关于这个节奏</h3><p>复习节点参考艾宾浩斯的研究与间隔重复的常用实践，但我们更相信持续的小步前进。答“不认识”的词会在本轮末尾再次出现，并在明天重新开始；答“认识”则会进入更长的复习间隔。每次学习都会打乱词书顺序，避免只记住字母表的开头。遗忘是正常的，按时回来就好。</p></div>' +
      '</section>';
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
      return '<div class="word-row" data-open-word="' + esc(word.id) + '" role="group" aria-label="' + esc(word.word) + '">' +
        '<div class="word-row__main"><button class="word-open" type="button" data-action="open-word" data-word-id="' + esc(word.id) + '">' +
        '<span class="word-open__word">' + esc(word.word) + levelBadge(word.level) + '</span>' +
        '<span class="word-open__ipa">' + esc(word.ipa || '—') + (word.pos ? ' · ' + esc(word.pos) : '') + '</span>' +
        '</button></div>' +
        '<div class="word-row__meaning">' + esc(word.meanings.join('；')) + '</div>' +
        '<div class="word-row__unit" style="' + unitStyle(unit) + '"><i class="dot"></i>' + esc(unitDisplay(unit)) + '</div>' +
        '<div class="word-row__state">' + statusPill(shownStatus) +
        '<span class="word-row__due' + (dueIsToday ? ' is-due' : '') + '">' + esc(dueIsToday ? '今天复习' : dueLabel) + '</span></div>' +
        '<button class="icon-btn word-row__fav' + (favorite ? ' is-active' : '') + '" type="button" data-action="toggle-favorite" data-word-id="' + esc(word.id) + '" aria-label="' + (favorite ? '取消收藏' : '收藏') + ' ' + esc(word.word) + '" aria-pressed="' + favorite + '">' + icon('star') + '</button>' +
        '</div>';
    }).join('');

    const empty = '<div class="empty-state library-empty"><span class="empty-state__icon">' + icon('search') + '</span>' +
      '<h3>没有找到这个词</h3><p>换一个拼写或释义试试，也可以清除筛选，看看完整的 ' + counts.all + ' 个词。</p>' +
      '<button class="btn btn--soft btn--sm" type="button" data-action="reset-library" style="margin-top:15px;">清除筛选</button></div>';

    return '' +
      '<header class="page-head library-head">' +
      '<div><p class="eyebrow">MY WORD ATLAS</p><h1 class="page-title">我的词库</h1>' +
      '<p class="page-head__desc">' + (activeBook() ? activeBook().title + ' · 共 ' + activeBook().count + ' 个词。' : '') + '点开任意一张词卡，读它的例句和搭配。</p></div>' +
      '<button class="library-progress-card library-progress-card--button" type="button" data-action="navigate" data-route="books">' + miniRing(percent) +
      '<div class="library-progress-card__text"><strong>' + overview.totalSeen + ' <small>/ ' + overview.totalWords + ' 个词</small></strong><span>' + esc(activeBook() ? activeBook().title : '当前词书') + ' · 切换词书 ' + icon('chevron-right') + '</span></div>' +
      '</button></header>' +

      '<div class="library-toolbar">' +
      '<label class="library-search">' + icon('search') +
      '<input id="librarySearch" type="search" placeholder="搜索单词、中文释义或例句" value="' + esc(query) + '" aria-label="搜索词库">' +
      (query ? '<button class="library-search__clear" type="button" data-action="clear-library-search" aria-label="清除搜索">' + icon('close') + '</button>' : '') +
      '</label>' +
      '<div class="library-count"><strong>' + total + '</strong> 个词</div>' +
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
      const quizLine = record.quizSeen ? '检验 ' + record.quizCorrect + '/' + record.quizSeen : '尚未检验';
      return '<button class="learned-row" type="button" data-action="open-word" data-word-id="' + esc(word.id) + '" title="' + esc(item.firstSource) + '">' +
        '<span class="learned-row__word"><strong>' + esc(word.word) + '</strong><small>' + esc(word.ipa || '—') + (word.pos ? ' · ' + esc(word.pos) : '') + '</small></span>' +
        '<span class="learned-row__meaning">' + esc(word.meanings.join('；')) + '</span>' +
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
    return '' +
      '<header class="page-head report-head">' +
      '<div><p class="eyebrow">LEARNING LOG</p><h1 class="page-title">学习报告</h1>' +
      '<p class="page-head__desc">记录不是用来比较的，只是提醒你：每一小步都算数。</p></div>' +
      '<div class="report-head__actions">' + (overview.weak > 0 ? '<span class="pill pill--orange"><i class="dot"></i> 待巩固 ' + overview.weak + '</span>' : '') + bookContextHTML('sm') + '<button class="btn btn--ghost btn--sm" type="button" data-action="open-settings">' + icon('settings') + ' 学习设置</button></div>' +
      '</header>' +

      '<section class="report-stats">' +
      '<article class="report-stat report-stat--dark"><span class="report-stat__label">' + icon('book-open') + ' 累计学习</span><strong class="report-stat__value">' + overview.totalSeen + '<small> / ' + overview.totalWords + ' 词</small></strong><span class="report-stat__note">整体进度 ' + (overview.totalWords ? Math.round((overview.totalSeen / overview.totalWords) * 100) : 0) + '%</span></article>' +
      '<article class="report-stat"><span class="report-stat__label">' + icon('trophy') + ' 已掌握</span><strong class="report-stat__value">' + overview.mastered + '<small> 个</small></strong><span class="report-stat__note">' + (overview.totalSeen ? Math.round((overview.mastered / overview.totalSeen) * 100) : 0) + '% 掌握率</span></article>' +
      '<article class="report-stat"><span class="report-stat__label">' + icon('flame') + ' 连续学习</span><strong class="report-stat__value">' + overview.streak + '<small> 天</small></strong><span class="report-stat__note">最长 ' + overview.longestStreak + ' 天 · ' + streakWord + '</span></article>' +
      '<article class="report-stat"><span class="report-stat__label">' + icon('target') + ' 正确率</span><strong class="report-stat__value">' + overview.accuracy + '<small>%</small></strong><span class="report-stat__note">共 ' + overview.attempts + ' 次作答</span></article>' +
      '</section>' +

      learnedSection +

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
      '</section>';
  }

  function wordDrawer(word) {
    const unit = unitFor(word);
    const record = window.Store.getRecord(word.id);
    const baseStatus = window.Store.getStatus(word.id);
    const status = record && record.weak && baseStatus !== 'mastered' ? 'weak' : baseStatus;
    const favorite = Boolean(record && record.favorite);
    const quizLine = record && record.quizSeen ? ' · 检验 ' + record.quizCorrect + '/' + record.quizSeen : '';
    const stageText = record && record.seen
      ? (status === 'weak'
        ? '本组检验中需要再看一眼 · 下次复习：' + window.Store.getDueLabel(record) + quizLine
        : (status === 'mastered' ? '已进入长期记忆 · 下次复习：' + window.Store.getDueLabel(record) + quizLine : '下次复习：' + window.Store.getDueLabel(record) + quizLine))
      : '还没开始学习 · 加入后会按遗忘曲线安排复习';
    return '<div class="overlay-backdrop" data-action="close-drawer"></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="wordDrawerTitle" style="' + unitStyle(unit) + '">' +
      '<div class="drawer__head"><p>WORD NOTE · 单词卡片</p><button class="icon-btn" type="button" data-action="close-drawer" aria-label="关闭单词卡">' + icon('close') + '</button></div>' +
      '<div class="drawer__body">' +
      '<div class="word-detail__unit"><i class="dot"></i>' + esc(unitDisplay(unit)) + ' · ' + esc(unit.en) + '</div>' +
      '<div class="word-detail__title-row"><h2 id="wordDrawerTitle">' + esc(word.word) + '</h2>' +
      '<button class="audio-btn audio-btn--ink word-detail__audio" type="button" data-action="speak" data-word="' + esc(word.word) + '" aria-label="朗读 ' + esc(word.word) + '">' + icon('volume') + '</button></div>' +
      '<div class="word-detail__ipa-row">' + (word.ipa ? '<span>' + esc(word.ipa) + '</span>' : '') + (word.pos ? '<span class="pos-badge">' + esc(word.pos) + '</span>' : '') + levelBadge(word.level) + '</div>' +
      '<div class="word-detail__meanings">' + word.meanings.map(function (meaning) {
        return '<span class="meaning-chip"><em>' + esc(word.pos) + '</em>' + esc(meaning) + '</span>';
      }).join('') + '</div>' +

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
      (record && record.seen ? '<button class="text-link" type="button" data-action="mark-mastered" data-word-id="' + esc(word.id) + '">' + (status === 'mastered' ? '重新学习' : '标记已掌握') + '</button>' : '') + '</div>' +
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
    const saveMode = persistence.mode === 'degraded'
      ? '自动备份暂时中断'
      : (persistence.server ? '长期自动备份已开启' : '浏览器自动保存已开启');
    const saveDetail = persistence.mode === 'degraded'
      ? '学习记录仍保存在浏览器中，系统会每 8 秒重试写入本机历史快照。'
      : (persistence.server
        ? '每次作答自动写入浏览器，并生成本机每日快照与定时快照；清除浏览器数据后可以从本机恢复。'
        : '每次学习后自动写入当前浏览器。换设备或清理浏览器前，请先导出备份文件。'
      );
    const voiceGender = profile.voiceGender === 'male' ? 'male' : 'female';
    const voiceRate = Number(profile.voiceRate) || 0.9;
    const voiceSupported = 'speechSynthesis' in window;
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
      '<section class="settings-section"><span class="settings-label">记录与备份</span>' +
      '<div class="save-status' + (persistence.mode === 'degraded' ? ' is-degraded' : '') + '"><i class="dot"></i><div><strong>' + saveMode + '</strong><span>' + savedText + ' · ' + esc(saveDetail) + '</span></div></div>' +
      '<div class="settings-actions">' +
      '<button class="btn btn--ghost btn--sm" type="button" data-action="export-progress">' + icon('download') + ' 导出当前记录</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-action="import-progress">' + icon('upload') + ' 导入备份</button>' +
      (persistence.server ? '<button class="btn btn--ghost btn--sm" type="button" data-action="restore-remote">' + icon('refresh') + ' 从本机恢复</button>' : '') +
      '</div>' +
      '<input id="importProgressFile" type="file" accept="application/json,.json" hidden>' +
      (persistence.server ? '<p class="settings-help">本机存档位于 macOS 的「拾词」应用支持目录：state.json 是当前版本，state.prev.json 是上一版，daily 文件夹永久保留每天的第一份快照，checkpoints 文件夹保留近 90 天每 6 小时的快照。</p>' : '<p class="settings-help">当前是浏览器存储模式。导出文件可以在另一台设备或 GitHub Pages 版本中导入。</p>') +
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
      '<div class="modal__actions"><button class="btn btn--ghost btn--sm" type="button" data-action="modal-cancel">' + esc(data.cancelLabel || '取消') + '</button>' +
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
    const sessionTitles = { review: '智能复习', new: '新词学习', practice: '自由复习', single: '单词精学', relearn: '错词重学', daily: '今日计划' };
    const modeTitle = sessionTitles[session.type] || '今日计划';
    const modeSub = unit.title + ' · ' + (item.kind === 'new' ? '新词' : '复习');
    const unique = Object.keys(session.outcomes || {}).length;
    const pageCorrect = session.attempts ? Math.round((session.correctAttempts / session.attempts) * 100) : 0;
    const accuracy = session.attempts ? pageCorrect : 0;

    const aside = '<aside class="study-aside">' +
      '<div class="study-aside__panel"><h3>THIS ROUND · 本轮</h3>' +
      '<div class="session-mini-stats"><div class="session-mini-stat"><strong>' + unique + '</strong><span>见过的词</span></div>' +
      '<div class="session-mini-stat"><strong>' + session.attempts + '</strong><span>次作答</span></div>' +
      '<div class="session-mini-stat"><strong>' + accuracy + '%</strong><span>正确率</span></div></div>' +
      '<div class="aside-rule"></div>' +
      '<div class="aside-progress-row"><span>今日进度</span><strong>' + session.overviewToday + ' / ' + session.goal + '</strong></div>' +
      '<div class="aside-progress-track"><span style="width:' + Math.min(100, (session.overviewToday / Math.max(session.goal, 1)) * 100) + '%"></span></div>' +
      '</div>' +
      '<div class="study-aside__panel"><h3>SHORTCUTS · 快捷键</h3>' +
      '<div class="shortcut-list">' +
      '<div class="shortcut-list__row"><span>显示释义</span><kbd>SPACE</kbd></div>' +
      '<div class="shortcut-list__row"><span>不认识 / 模糊 / 认识</span><kbd>1 · 2 · 3</kbd></div>' +
      '<div class="shortcut-list__row"><span>朗读发音</span><kbd>S</kbd></div>' +
      '<div class="shortcut-list__row"><span>收藏单词</span><kbd>F</kbd></div>' +
      '</div></div>' +
      '<p class="study-aside__quote">“记忆不是一次抓住，<br>是每次都比上次更近一点。”</p>' +
      '</aside>';

    const rating = '<div class="rating-bar">' +
      '<button class="rating-btn rating-btn--again" type="button" data-action="rate" data-rating="again"><span class="rating-btn__top"><strong>不认识</strong><kbd class="rating-btn__key">1</kbd></span><small>明天再复习一次</small></button>' +
      '<button class="rating-btn rating-btn--fuzzy" type="button" data-action="rate" data-rating="fuzzy"><span class="rating-btn__top"><strong>有点印象</strong><kbd class="rating-btn__key">2</kbd></span><small>保持原来的复习节奏</small></button>' +
      '<button class="rating-btn rating-btn--known" type="button" data-action="rate" data-rating="known"><span class="rating-btn__top"><strong>认识</strong><kbd class="rating-btn__key">3</kbd></span><small>拉长下一次复习间隔</small></button>' +
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
      '<div class="meaning-line">' + (word.pos ? '<span class="meaning-line__pos">' + esc(word.pos) + '</span>' : '') + '<p class="meaning-line__text">' + esc(word.meanings.join('；')) + '</p></div>' +
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
    const feedback = answered
      ? '<div class="quiz-feedback ' + (answeredCorrectly ? 'is-correct' : 'is-wrong') + '">' +
        '<span class="quiz-feedback__icon">' + icon(answeredCorrectly ? 'check' : 'close') + '</span>' +
        '<div class="quiz-feedback__copy"><strong>' + feedbackTitle + '</strong>' +
        '<p>正确意思：' + esc(question.correctText) + '</p></div>' +
        '<button class="btn btn--primary quiz-next-btn" type="button" data-action="quiz-next">' + (quiz.index + 1 >= total ? '看学习结果' : '下一题') + ' →</button></div>' +
        (word.example ? '<div class="quiz-example"><p>' + highlight(word.example, word.word) + '</p><span>' + esc(word.translation || '') + '</span></div>' : '') +
        '<div class="quiz-foot-hint">按 <kbd>ENTER</kbd> 继续</div>'
      : '<div class="quiz-foot-hint">按 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> 选择答案</div>';

    const aside = '<aside class="study-aside">' +
      '<div class="study-aside__panel"><h3>MEANING CHECK · 本组检验</h3>' +
      '<div class="session-mini-stats"><div class="session-mini-stat"><strong>' + answeredCount + '</strong><span>已作答</span></div>' +
      '<div class="session-mini-stat"><strong>' + quiz.correctCount + '</strong><span>答对</span></div>' +
      '<div class="session-mini-stat"><strong>' + currentScore + '%</strong><span>正确率</span></div></div>' +
      '<div class="aside-rule"></div>' +
      '<div class="aside-progress-row"><span>检验进度</span><strong>' + (answered ? shown : shown - 1) + ' / ' + total + '</strong></div>' +
      '<div class="aside-progress-track"><span style="width:' + (answeredCount / Math.max(total, 1) * 100) + '%"></span></div>' +
      '</div>' +
      '<div class="study-aside__panel"><h3>WHY THIS CHECK</h3>' +
      '<p class="quiz-aside-note">这次检验不是打分，而是帮你安排后续复习。答错的词会加入「待巩固」；每个错词连续答对 2 次后，才会真正移出。</p></div>' +
      '<p class="study-aside__quote">“检验不是结束，<br>是下一次记忆的起点。”</p>' +
      '</aside>';

    return '<div class="study-shell">' +
      studyTop('本组检验', '选择题 · 检验这次学习的意思', shown, total, percent, false) +
      '<main class="study-main meaning-quiz-main">' +
      '<div class="study-card-column">' +
      '<section class="meaning-quiz-card" tabindex="-1">' +
      '<header class="quiz-card-head"><span class="quiz-kicker">' + icon('target') + ' MEANING CHECK · 第 ' + shown + ' 题</span>' +
      '<span class="quiz-live-score">得分 <strong>' + quiz.correctCount + '</strong></span></header>' +
      '<p class="quiz-prompt">选出正确的中文意思</p>' +
      '<h1 class="quiz-word">' + esc(word.word) + '</h1>' +
      '<div class="quiz-word-meta">' + (word.ipa ? '<span>' + esc(word.ipa) + '</span>' : '') + (word.pos ? '<span class="pos-badge">' + esc(word.pos) + '</span>' : '') + '</div>' +
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
        (result ? '<p>读一遍例句，让这个词在句子里留下位置。</p>' : '<p><span class="spell-correct-word">' + esc(word.word) + '</span> · ' + esc(word.meanings.join('；')) + '</p>') + '</div>' +
        '<button class="btn btn--primary spell-next-btn" type="button" data-action="next-spelling">' + (session.index + 1 >= total ? '看结果' : '下一题') + ' →</button>' +
        '</div>';
    }
    return '<div class="study-shell">' +
      studyTop('拼写挑战', '从释义和语境里，找回完整拼写', shown, total, percent, false) +
      '<main class="spell-main">' +
      '<section class="spell-card" tabindex="-1">' +
      '<header class="spell-head"><span class="spell-head__title">' + icon('keyboard') + ' SPELLING · 第 ' + shown + ' 题</span><div class="spell-dots">' + dots + '</div></header>' +
      '<h1 class="spell-prompt">' + esc(word.meanings.slice(0, 2).join('；')) + '</h1>' +
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
      studyTop('学习与检验完成', ({ review: '智能复习', single: '单词精学', new: '新词学习', practice: '自由复习', relearn: '错词重学' }[session.type] || '今日计划') + ' · ' + (summary.minutes || 1) + ' 分钟', 1, 1, 100, true) +
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
      studyTop('拼写挑战完成', 'SPELLING COMPLETE', 1, 1, 100, true) +
      '<div class="summary-wrap"><article class="summary-card" tabindex="-1">' +
      '<div class="summary-head"><div><p class="summary-kicker">' + icon('target') + ' CHALLENGE COMPLETE</p><h1>' + title + '</h1><p class="summary-desc">' + desc + '</p></div>' +
      '<span class="summary-badge">' + icon('trophy') + '</span></div>' +
      '<div class="quiz-score"><div class="quiz-score__ring"><svg viewBox="0 0 86 86" aria-hidden="true"><circle cx="43" cy="43" r="35" stroke="rgba(49,90,74,.1)"></circle><circle cx="43" cy="43" r="35" stroke="var(--green-700)" stroke-linecap="round" stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"></circle></svg><strong>' + score + '</strong></div>' +
      '<div class="quiz-score__copy"><strong>拼对 ' + (summary.correct || 0) + ' / ' + (summary.total || 0) + ' 个词</strong><p>用时约 ' + (summary.minutes || 1) + ' 分钟。拼写正确率已计入你的学习报告。</p></div></div>' +
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
  UI.wordDrawer = wordDrawer;
  UI.settingsDrawer = settingsDrawer;
  UI.modal = modal;
  UI.renderSession = renderSession;
  UI.searchSuggestions = searchSuggestions;
  UI.getCurrentUnit = getCurrentUnit;

  window.UI = UI;
})();
