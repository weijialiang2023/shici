(function () {
  'use strict';

  const APP_VERSION = '37';
  const REPO_ISSUES = 'https://github.com/weijialiang2023/shici/issues/new';
  const form = document.getElementById('feedbackForm');
  const diagnosticsToggle = document.getElementById('includeDiagnostics');
  const preview = document.getElementById('reportPreview');
  const status = document.getElementById('feedbackStatus');
  const copyButton = document.getElementById('copyReport');
  const issueLink = document.getElementById('openIssue');
  const bookField = document.getElementById('feedbackBook');
  const params = new URLSearchParams(window.location.search);

  if (bookField && params.get('book')) {
    const requested = params.get('book');
    const hasOption = Array.from(bookField.options).some(function (option) {
      return option.value === requested;
    });
    if (hasOption) bookField.value = requested;
  }
  if (params.get('type') === 'memory-wall') {
    const typeField = document.getElementById('feedbackType');
    const detailsField = document.getElementById('feedbackDetails');
    if (typeField) typeField.value = '购买与授权';
    if (detailsField && !detailsField.value) {
      detailsField.value = '我想购买记忆墙打印包，请告知购买和授权码发放方式。';
    }
  }

  function safeProfile() {
    try {
      const raw = window.localStorage.getItem('shici.state.v1');
      if (!raw) return null;
      const state = JSON.parse(raw);
      return {
        activeBook: state && state.profile ? state.profile.activeBook || '' : '',
        schema: state && state.meta ? state.meta.schema || state.version || '' : ''
      };
    } catch (error) {
      return null;
    }
  }

  function compact(value, max) {
    return String(value || '').trim().slice(0, max || 1200);
  }

  function buildReport() {
    const data = new FormData(form);
    const lines = [
      '## 拾词反馈',
      '',
      '问题类型：' + compact(data.get('issueType'), 40),
      '相关词书：' + compact(data.get('book'), 40)
    ];
    const word = compact(data.get('word'), 80);
    const details = compact(data.get('details'), 2000);
    const correction = compact(data.get('correction'), 1200);
    const source = compact(data.get('source'), 500);
    if (word) lines.push('相关词条：' + word);
    lines.push('', '问题描述：', details || '（请填写）');
    if (correction) lines.push('', '建议修改：', correction);
    if (source) lines.push('', '依据或来源：', source);

    if (diagnosticsToggle && diagnosticsToggle.checked) {
      const profile = safeProfile();
      lines.push(
        '',
        '---',
        '匿名诊断信息（用户主动勾选）',
        '应用版本：' + APP_VERSION,
        '页面：' + window.location.pathname.split('/').pop(),
        '浏览器：' + navigator.userAgent,
        '语言：' + navigator.language,
        '平台：' + (navigator.userAgentData && navigator.userAgentData.platform
          ? navigator.userAgentData.platform
          : navigator.platform || '未提供'),
        '视口：' + window.innerWidth + '×' + window.innerHeight,
        '设备像素比：' + (window.devicePixelRatio || 1),
        '当前词书：' + (profile && profile.activeBook ? profile.activeBook : compact(data.get('book'), 40)),
        '记录 schema：' + (profile && profile.schema ? profile.schema : '未读取')
      );
    }
    lines.push('', '> 请确认内容不含姓名、手机号、住址或其他不希望公开的信息。');
    return lines.join('\n');
  }

  function refresh() {
    if (!form || !preview) return;
    const value = buildReport();
    preview.value = value;
    if (status) status.textContent = '';
    if (issueLink) {
      const issueUrl = new URL(REPO_ISSUES);
      const type = compact(new FormData(form).get('issueType'), 40) || '问题';
      issueUrl.searchParams.set('title', '[反馈] ' + type);
      issueUrl.searchParams.set('body', value);
      issueLink.href = issueUrl.toString();
    }
  }

  function showStatus(message) {
    if (status) status.textContent = message;
  }

  async function copyReport() {
    const text = preview ? preview.value : buildReport();
    try {
      await navigator.clipboard.writeText(text);
      showStatus('报告已复制。可在 GitHub Issue 或其他支持渠道中粘贴。');
    } catch (error) {
      if (preview) {
        preview.focus();
        preview.select();
        const copied = document.execCommand && document.execCommand('copy');
        showStatus(copied ? '报告已复制。' : '无法自动复制，请手动选择报告文本。');
      }
    }
  }

  if (form) {
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      refresh();
      copyReport();
    });
    refresh();
  }

  if (copyButton) copyButton.addEventListener('click', copyReport);
})();
