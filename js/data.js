/* 拾词 · 词书与内容配置 */
(function () {
  'use strict';

  // 当前激活词书的数据会在 App 启动时按需载入。
  window.WORDS = [];
  window.UNITS = [];

  window.BOOKS = [
    {
      id: 'gaokao',
      title: '高中 3500',
      shortTitle: '高中 3500',
      en: 'GAOKAO 3500',
      category: '高中',
      count: 3663,
      coverMark: '高',
      icon: 'notebook',
      accent: '#315A4A',
      tint: '#E5EADF',
      deep: '#21463A',
      description: '覆盖高中阶段常见词汇，整本词书会随机打乱并分组。例句、搭配和音标一并收入，适合每天乱序推进。',
      tags: ['高考', '课标词汇', '乱序抽取'],
      dataUrl: 'data/books/gaokao.json',
      featured: true
    },
    {
      id: 'curated',
      title: '精讲 120',
      shortTitle: '精讲 120',
      en: 'CURATED 120',
      category: '编辑精选',
      count: 120,
      coverMark: '拾',
      icon: 'sparkles',
      accent: '#B45F42',
      tint: '#F4DFD4',
      deep: '#8B4B35',
      description: '六个主题、120 个精讲词。每个词都有例句、搭配和记忆点，适合想先学会用词的同学。',
      tags: ['主题学习', '例句精讲', '入门友好'],
      dataUrl: 'data/books/curated.json'
    },
    {
      id: 'wenyan',
      title: '高中文言实词 200',
      shortTitle: '文言实词 200',
      en: 'CLASSICAL CHINESE',
      category: '高中语文',
      count: 200,
      coverMark: '文',
      icon: 'book-open',
      accent: '#6B4F3A',
      tint: '#EFE9DF',
      deep: '#4E3728',
      description: '先攻 120 个高考常见核心实词，再补 80 个教材高频拓展。每个词按常见义项、书证和现代译文整理。',
      tags: ['高中语文', '核心 120', '一词多义'],
      dataUrl: 'data/books/wenyan.json'
    },
    {
      id: 'ielts',
      title: '雅思必背',
      shortTitle: '雅思必背',
      en: 'IELTS ESSENTIAL',
      category: '出国',
      count: 3427,
      coverMark: '雅',
      icon: 'globe',
      accent: '#3F6B7F',
      tint: '#DDE9ED',
      deep: '#305565',
      description: '雅思阅读与写作中反复出现的核心词汇。适合高考后进阶，或提前为留学语言考试做准备。',
      tags: ['IELTS', '学术词汇', '进阶'],
      dataUrl: 'data/books/ielts.json'
    },
    {
      id: 'cet4',
      title: '四级核心',
      shortTitle: '四级核心',
      en: 'CET-4 CORE',
      category: '大学',
      count: 1162,
      coverMark: '四',
      icon: 'book',
      accent: '#92703C',
      tint: '#F2E4CE',
      deep: '#76582C',
      description: '大学英语四级的高频核心词，适合提前衔接大学英语，也适合作为高考后的保温词书。',
      tags: ['CET-4', '高频', '大学衔接'],
      dataUrl: 'data/books/cet4.json'
    },
    {
      id: 'cet6',
      title: '六级核心',
      shortTitle: '六级核心',
      en: 'CET-6 CORE',
      category: '大学',
      count: 1228,
      coverMark: '六',
      icon: 'book-open',
      accent: '#8B5B65',
      tint: '#EFDFE1',
      deep: '#704852',
      description: '大学英语六级核心词，词义更细、更抽象。适合已经有四级基础、想继续往上走的同学。',
      tags: ['CET-6', '进阶', '大学'],
      dataUrl: 'data/books/cet6.json'
    }
  ];

  window.DEFAULT_BOOK = 'gaokao';

  window.LEVELS = {
    1: { label: '基础', className: 'level-1' },
    2: { label: '进阶', className: 'level-2' },
    3: { label: '挑战', className: 'level-3' }
  };

  window.REVIEW_SCHEDULE = [
    { stage: 0, days: 1, label: '1 天' },
    { stage: 1, days: 1, label: '1 天' },
    { stage: 2, days: 2, label: '2 天' },
    { stage: 3, days: 4, label: '4 天' },
    { stage: 4, days: 7, label: '7 天' },
    { stage: 5, days: 15, label: '15 天' },
    { stage: 6, days: 30, label: '30 天' },
    { stage: 7, days: 60, label: '60 天' }
  ];

  window.QUOTES = [
    { en: 'Little by little, one travels far.', zh: '一点一点，也能走得很远。', author: '英语谚语' },
    { en: 'The more that you read, the more things you will know.', zh: '你读得越多，知道得就越多。', author: 'Dr. Seuss' },
    { en: 'Learning never exhausts the mind.', zh: '学习从不会让头脑疲惫。', author: 'Leonardo da Vinci' },
    { en: 'A different language is a different vision of life.', zh: '另一种语言，是看世界的另一种眼光。', author: 'Federico Fellini' },
    { en: 'Success is the sum of small efforts repeated day in and day out.', zh: '成功，是日复一日的小小努力累积而成。', author: 'Robert Collier' },
    { en: 'It always seems impossible until it is done.', zh: '在做成之前，它看起来总是不可能。', author: 'Nelson Mandela' },
    { en: 'One word at a time is still progress.', zh: '一次一个词，也一直是在向前。', author: '拾词' }
  ];

  window.BADGE_DEFINITIONS = [
    { id: 'first-word', icon: 'sparkles', title: '第一枚词', description: '完成第一个单词的学习', test: function (s) { return s.totalSeen >= 1; } },
    { id: 'streak-3', icon: 'flame', title: '三天不断线', description: '连续学习 3 天', test: function (s) { return s.longestStreak >= 3; } },
    { id: 'streak-7', icon: 'calendar', title: '一周同行', description: '连续学习 7 天', test: function (s) { return s.longestStreak >= 7; } },
    { id: 'words-30', icon: 'book', title: '三十而拾', description: '累计学习 30 个词', test: function (s) { return s.totalSeen >= 30; } },
    { id: 'words-100', icon: 'trophy', title: '百词成章', description: '累计学习 100 个词', test: function (s) { return s.totalSeen >= 100; } },
    { id: 'quiz-perfect', icon: 'target', title: '拼写满分', description: '拼写挑战拿到 100 分', test: function (s) { return s.bestSpelling >= 100; } }
  ];
})();
