#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SHICI_SYSTEM_TEST_PORT:-4188}"
STATE_DIR="$(mktemp -d)"
BASE_URL="http://127.0.0.1:$PORT"
EGO_SPACE_ID="${SHICI_EGO_SPACE_ID:-}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$ROOT"
SHICI_PORT="$PORT" SHICI_STATE_DIR="$STATE_DIR" python3 serve.py >/dev/null 2>&1 &
SERVER_PID=$!

for _ in {1..40}; do
  if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

ego-browser skill >/dev/null

ego-browser nodejs <<EOF
const BASE_URL = "$BASE_URL";
const SHOT = "/tmp/shici-learning-390.png";
const SPACE_ID = ${EGO_SPACE_ID:-null};
const existing = SPACE_ID === null
  ? null
  : (await listTaskSpaces()).find(space => space.id === SPACE_ID);
if (existing && existing.ownership !== "agent") {
  throw new Error("Ego task space is not under agent control: " + existing.ownership);
}
const task = existing ? await taskSpace(SPACE_ID) : await taskSpace("拾词学习系统自动验收");
const page = task.page("p1");
let completed = false;

try {
  await page.goto(BASE_URL + "/#home", { timeout: 30000 });
  await page.waitForSelector(".app-shell");
  await page.waitForFunction(() => Boolean(document.getElementById("bootScreen")?.hidden), undefined, { timeout: 30000 });
  const bootMs = await page.evaluate(() => window.__SHICI_BOOT_MS);
  if (!Number.isFinite(bootMs) || bootMs < 0 || bootMs > 5000) {
    throw new Error("boot performance mark invalid: " + bootMs);
  }
  await page.cdp("Storage.clearDataForOrigin", {
    origin: new URL(BASE_URL).origin,
    storageTypes: "cache_storage,service_workers,local_storage,indexeddb"
  });
  await page.cdp("Page.reload", { ignoreCache: true });
  await page.waitForSelector(".app-shell");
  await page.waitForFunction(() => Boolean(document.getElementById("bootScreen")?.hidden), undefined, { timeout: 30000 });
  await page.evaluate(() => {
    window.__learningErrors = [];
    window.__productAnalyticsEvents = [];
    window.addEventListener("error", event => window.__learningErrors.push(event.message));
    window.addEventListener("unhandledrejection", event => window.__learningErrors.push(String(event.reason)));
    document.addEventListener("shici:analytics", event => window.__productAnalyticsEvents.push(event.detail));
    Store.resetAll();
    Store.updateProfile({ dailyGoal: 2 });
  });

  await page.waitForSelector("#daily-plan-title");
  const homePlan = await page.evaluate(() => {
    const base = Store.getOverview();
    const fixture = document.createElement("div");
    const render = (overrides) => {
      fixture.innerHTML = UI.renderHome({
        overview: Object.assign({}, base, overrides),
        wordOfTheDay: null,
        quote: { en: "One word at a time.", author: "Test", zh: "一次一个词。" },
        date: { weekdayCN: "周一", dateCN: "1月1日" },
        greeting: "早上好",
        name: "同学"
      });
      const cta = fixture.querySelector(".daily-card .btn--primary");
      return {
        title: fixture.querySelector("#daily-plan-title").textContent,
        action: cta.getAttribute("data-action") || cta.getAttribute("href"),
        label: cta.textContent.trim(),
        meta: fixture.querySelector(".daily-card__meta").textContent,
        barValue: fixture.querySelector("progress").value,
        barMax: fixture.querySelector("progress").max,
        hasDailyWord: Boolean(fixture.querySelector(".word-of-day"))
      };
    };
    return {
      fresh: render({ goal: 20, todayUnique: 0, planCount: 20, planNewCount: 20, planReviewCount: 0 }),
      mixed: render({ goal: 20, todayUnique: 12, planCount: 8, planNewCount: 6, planReviewCount: 2 }),
      due: render({ goal: 20, todayUnique: 22, planCount: 0, planNewCount: 0, planReviewCount: 0, reviewDueToday: 4 }),
      extra: render({ goal: 20, todayUnique: 20, planCount: 0, planNewCount: 0, planReviewCount: 0, reviewDueToday: 0, newRemaining: 3 }),
      exhausted: render({ goal: 20, todayUnique: 0, planCount: 0, planNewCount: 0, planReviewCount: 0, reviewDueToday: 0, newRemaining: 0, totalSeen: 10 }),
      empty: render({ goal: 20, todayUnique: 0, planCount: 0, planNewCount: 0, planReviewCount: 0, reviewDueToday: 0, newRemaining: 0, totalSeen: 0 })
    };
  });
  if (homePlan.fresh.action !== "start-daily" || homePlan.fresh.meta.includes("0 个待复习") || homePlan.fresh.label !== "开始今日学习") throw new Error("fresh home plan mismatch");
  if (homePlan.mixed.label !== "继续今日学习" || !homePlan.mixed.meta.includes("2 个待复习 · 6 个新词")) throw new Error("mixed home plan mismatch");
  if (homePlan.due.action !== "start-review" || homePlan.due.barValue !== homePlan.due.barMax) throw new Error("completed home plan mismatch");
  if (homePlan.extra.label !== "再学 3 个新词") throw new Error("extra new CTA overstates available words");
  if (homePlan.exhausted.action !== "start-learned" || homePlan.exhausted.title.includes("已完成")) throw new Error("exhausted book must not imply goal completion");
  if (homePlan.empty.action !== "#books" || homePlan.empty.hasDailyWord) throw new Error("empty book fallback mismatch");

  await page.click("#topbarProfile");
  await page.waitForSelector('.drawer a[href^="feedback.html"]');
  const supportLinks = await page.evaluate(() => ({
    feedback: Boolean(document.querySelector('.drawer a[href^="feedback.html"]')),
    privacy: Boolean(document.querySelector('.drawer a[href="privacy.html"]')),
    terms: Boolean(document.querySelector('.drawer a[href="terms.html"]'))
  }));
  if (!supportLinks.feedback || !supportLinks.privacy || !supportLinks.terms) {
    throw new Error("settings support links missing");
  }
  await page.evaluate(() => {
    const close = document.querySelector('button[data-action="close-drawer"]');
    if (!close) throw new Error("settings close button missing");
    close.click();
  });

  await page.goto(BASE_URL + "/feedback.html?book=gaokao", { timeout: 30000 });
  await page.waitForSelector("#feedbackForm");
  await page.fill("#feedbackWord", "abandon");
  await page.fill("#feedbackDetails", "例句中的目标词与释义不一致。");
  await page.fill("#feedbackCorrection", "请替换为一条包含 abandon 的自然例句。");
  const feedback = await page.evaluate(() => ({
    preview: document.querySelector("#reportPreview").value,
    issueHref: document.querySelector("#openIssue").href,
    selectedBook: document.querySelector("#feedbackBook").value
  }));
  if (!feedback.preview.includes("abandon") || feedback.selectedBook !== "gaokao") {
    throw new Error("feedback report did not build");
  }
  if (!feedback.issueHref.includes("github.com/weijialiang2023/shici/issues/new")) {
    throw new Error("feedback GitHub issue link missing");
  }

  await page.goto(BASE_URL + "/#report", { timeout: 30000 });
  await page.waitForSelector(".report-empty-hero");
  if (await page.evaluate(() => Boolean(document.querySelector(".report-stats")))) {
    throw new Error("new report must not show zero cards");
  }
  if (!(await page.evaluate(() => Boolean(document.querySelector("[data-action='start-first']"))))) {
    throw new Error("new report start button missing");
  }

  await page.evaluate(() => {
    Store.resetAll();
    Store.updateProfile({ dailyGoal: 1 });
    window.__spokenWords = [];
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        getVoices() { return []; },
        speak(utterance) { window.__spokenWords.push(utterance.text); }
      }
    });
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = String(text); }
    };
  });
  await page.goto(BASE_URL + "/#home", { timeout: 30000 });
  await page.goto(BASE_URL + "/#study", { timeout: 30000 });
  await page.waitForSelector(".study-plan");
  await page.evaluate(() => {
    window.__productAnalyticsEvents = [];
    document.addEventListener("shici:analytics", event => window.__productAnalyticsEvents.push(event.detail));
  });
  await page.click("loc=role:button[name='开始今日学习']");
  await page.waitForSelector(".word-card");
  await page.waitForTimeout(450);
  const analyticsEvents = await page.evaluate(() =>
    (window.__productAnalyticsEvents || []).map(event => ({
      event: event.event,
      properties: event.properties
    }))
  );
  if (!analyticsEvents.some(item => item.event === "session_start" && item.properties.mode === "daily")) {
    throw new Error("privacy-safe session analytics missing");
  }
  const speechFirst = await page.evaluate(() => ({
    word: document.querySelector(".word-card__hero h1")?.textContent || "",
    spoken: window.__spokenWords.slice()
  }));
  await page.click("loc=role:button[name='显示释义']");
  const speechRevealed = await page.evaluate(() => window.__spokenWords.slice());
  if (speechFirst.spoken.length !== 1 || speechFirst.spoken[0] !== speechFirst.word) {
    throw new Error("new card must auto-speak only the word");
  }
  if (JSON.stringify(speechRevealed) !== JSON.stringify(speechFirst.spoken)) {
    throw new Error("revealing the meaning must not replay speech");
  }
  await page.click("loc=role:button[name*='能准确说出']");
  await page.waitForSelector(".meaning-quiz-card");
  await page.evaluate(() => {
    Store.resetAll();
    Store.updateProfile({ dailyGoal: 8 });
  });
  await page.goto(BASE_URL + "/#home", { timeout: 30000 });
  await page.goto(BASE_URL + "/#study", { timeout: 30000 });
  await page.click("loc=role:button[name='开始今日学习']");
  await page.waitForSelector(".word-card");
  const loopSize = await page.evaluate(() => {
    const text = document.querySelector(".study-count")?.textContent || "";
    return Number((text.match(/(\d+)\s*$/) || [])[1]);
  });
  if (loopSize !== 7) throw new Error("daily plan did not start as a seven-word loop");
  await page.click("loc=role:button[name='退出本轮学习']");
  await page.click("loc=role:button[name='保存并退出']");
  await page.waitForSelector(".study-overlay", { state: "detached" });
  await page.evaluate(() => {
    Store.resetAll();
    Store.updateProfile({ dailyGoal: 2 });
  });

  await page.goto(BASE_URL + "/#home", { timeout: 30000 });
  await page.goto(BASE_URL + "/#study", { timeout: 30000 });
  await page.waitForSelector(".training-panel");
  if (await page.evaluate(() => document.querySelectorAll(".mode-card").length !== 2)) {
    throw new Error("study center should expose two main modes");
  }

  const logic = await page.evaluate(() => {
    const today = Store.todayKey();
    const words = Store.buildNewQueue(3);
    const ids = words.map(item => item.id);
    const before = Store.getOverview();
    const ratings = [
      Store.answerWord(ids[0], "again", 1),
      Store.answerWord(ids[1], "fuzzy", 1),
      Store.answerWord(ids[2], "known", 1)
    ];
    const intervals = ratings.map(item => Store.daysBetween(today, item.due));
    const afterSelf = Store.getOverview();
    const wrong = Store.recordObjectiveAnswer(ids[0], {
      type: "meaning",
      correct: false,
      seconds: 2,
      selectedText: "干扰义项"
    });
    const afterObjective = Store.getOverview();
    const learnedQueue = Store.buildLearnedReviewQueue();
    const learnedWeakFlags = learnedQueue.map(item => Boolean((Store.getRecord(item.id) || {}).weak));
    const firstNotWeak = learnedWeakFlags.indexOf(false);

    const state = Store.getState();
    const masteryWord = ids[2];
    const record = state.words[masteryWord];
    record.seen = Math.max(1, record.seen);
    record.successDates = [Store.addDays(today, -8), Store.addDays(today, -1)];
    record.successTypes = ["meaning"];
    record.lastObjectiveAt = Store.addDays(today, -7);
    record.lastObjectiveIntervalDays = 4;
    Store.updateProfile({});
    const masteryBefore = Store.getStatus(masteryWord);
    Store.recordObjectiveAnswer(masteryWord, { type: "context", correct: true, seconds: 2 });

    return {
      intervals,
      selfAttempts: before.attempts,
      selfAfterAttempts: afterSelf.attempts,
      selfRatings: afterSelf.selfRatings,
      wrongWeak: wrong.weak,
      objectiveAttempts: afterObjective.attempts,
      objectiveCorrect: afterObjective.correct,
      learnedQueueLength: learnedQueue.length,
      learnedCount: Store.studiedWords().length,
      learnedAllStudied: learnedQueue.every(item => Store.hasRecord(item.id)),
      learnedWeakFirst: firstNotWeak === -1 || learnedWeakFlags.slice(firstNotWeak).every(value => !value),
      firstRecord: Store.getRecord(ids[0]),
      masteryBefore,
      masteryAfter: Store.getStatus(masteryWord),
      masteryRecord: Store.getRecord(masteryWord)
    };
  });

  if (JSON.stringify(logic.intervals) !== JSON.stringify([0, 1, 3])) throw new Error("initial intervals do not differ");
  if (logic.selfAttempts !== 0 || logic.selfAfterAttempts !== 0) throw new Error("self rating leaked into objective accuracy");
  if (logic.selfRatings.again !== 1 || logic.selfRatings.fuzzy !== 1 || logic.selfRatings.known !== 1) throw new Error("self rating distribution mismatch");
  if (logic.objectiveAttempts !== 1 || logic.objectiveCorrect !== 0) throw new Error("objective accuracy mismatch");
  if (logic.learnedQueueLength !== logic.learnedCount || !logic.learnedAllStudied || !logic.learnedWeakFirst) {
    throw new Error("learned review must include every learned word with weak-first order");
  }
  if (!logic.wrongWeak || logic.firstRecord.errorTypes.meaning_confusion !== 1) throw new Error("wrong-answer diagnostics missing");
  if (logic.firstRecord.confusions.at(-1)?.selected !== "干扰义项") throw new Error("wrong option not recorded");
  if (logic.masteryBefore === "mastered" || logic.masteryAfter !== "mastered") throw new Error("mastery criteria mismatch");
  if (logic.masteryRecord.successDates.length < 3 || !logic.masteryRecord.successTypes.includes("context")) throw new Error("mastery evidence incomplete");

  await page.goto(BASE_URL + "/#home", { timeout: 30000 });
  await page.goto(BASE_URL + "/#study", { timeout: 30000 });
  await page.waitForSelector(".training-panel");
  await page.click("loc=role:button[name='拼写挑战']");
  await page.waitForSelector(".spell-card");
  const spellingTotal = await page.evaluate(() => {
    const text = document.querySelector(".study-count")?.textContent || "";
    return Number((text.match(/(\d+)\s*$/) || [])[1]);
  });
  if (spellingTotal !== 3) throw new Error("spelling did not use only the three learned words");
  await page.click("loc=role:button[name*='给点提示']");
  const hintsRecorded = await page.evaluate(() =>
    Store.studiedWords().reduce((sum, word) => sum + Number(Store.getRecord(word.id).hintsUsed || 0), 0)
  );
  if (hintsRecorded !== 1) throw new Error("spelling hint usage was not recorded");
  await page.click("loc=role:button[name='退出本轮学习']");
  await page.click("loc=role:button[name='保存并退出']");
  await page.waitForSelector(".study-overlay", { state: "detached" });

  await page.evaluate(() => {
    Store.resetAll();
    Store.updateProfile({ dailyGoal: 2 });
  });
  await page.goto(BASE_URL + "/#home", { timeout: 30000 });
  await page.goto(BASE_URL + "/#study", { timeout: 30000 });
  await page.waitForSelector(".study-plan");
  await page.click("loc=role:button[name='开始今日学习']");
  await page.waitForSelector(".word-card");
  for (let index = 0; index < 2; index += 1) {
    await page.waitForSelector(".word-card");
    await page.click("loc=role:button[name='显示释义']");
    await page.click("loc=role:button[name*='能准确说出']");
    await page.waitForTimeout(180);
  }
  await page.waitForSelector(".meaning-quiz-card");
  const questionShapes = [];
  for (let index = 0; index < 4; index += 1) {
    if (await page.evaluate(() => Boolean(document.querySelector(".summary-card")))) break;
    if (await page.evaluate(() => Boolean(document.querySelector(".quiz-feedback")))) {
      await page.click(".quiz-next-btn");
    } else {
      const shape = await page.evaluate(() => ({
        context: Boolean(document.querySelector(".quiz-context")),
        heading: document.querySelector(".quiz-word")?.textContent || null,
        kicker: document.querySelector(".quiz-kicker")?.textContent?.trim() || ""
      }));
      questionShapes.push(shape);
      if (shape.context && shape.heading) throw new Error("context question exposed the target word");
      await page.click(".quiz-option >> nth=0");
    }
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".summary-card");
  if (!questionShapes.some(shape => shape.context)) throw new Error("mixed retrieval did not include a context question");

  await page.click("loc=role:button[name='查看学习报告']");
  await page.waitForSelector(".memory-metrics");

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.cdp("Network.enable");
  await page.cdp("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0
  });
  await page.reload({ timeout: 30000 });
  await page.waitForSelector(".app-shell");
  await page.waitForFunction(() => Boolean(document.getElementById("bootScreen")?.hidden), undefined, { timeout: 60000 });
  const offline = await page.evaluate(() => ({
    bootError: Boolean(document.querySelector(".boot-screen.is-error")),
    controlled: Boolean(navigator.serviceWorker.controller),
    text: document.body.innerText.slice(0, 80)
  }));
  if (offline.bootError) throw new Error("offline reload showed a boot error");
  await page.cdp("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1
  });

  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });
  const routeResponsive = {};
  for (const route of ["home", "study", "library", "books", "report"]) {
    await page.goto(BASE_URL + "/#" + route, { timeout: 30000 });
    await page.waitForSelector(".app-shell");
    routeResponsive[route] = await page.evaluate(() => {
      const font = selector => Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
      const rectangle = selector => {
        const node = document.querySelector(selector);
        if (!node) return { width: 0, height: 0 };
        const rect = node.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      };
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        smallTextCount: [...document.querySelectorAll("body *")].filter(node => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
          const text = [...node.childNodes]
            .filter(child => child.nodeType === Node.TEXT_NODE)
            .map(child => child.textContent.trim())
            .filter(Boolean)
            .join(" ");
          return visible && text && Number.parseFloat(style.fontSize) < 12;
        }).length,
        bodyText: font("body"),
        descriptionText: font(".page-head__desc"),
        nav: rectangle(".mobile-nav a"),
        mode: rectangle(".mode-card")
      };
    });
    if (routeResponsive[route].overflow > 1) {
      throw new Error("horizontal overflow at 390px on " + route);
    }
    if (routeResponsive[route].smallTextCount > 0) {
      throw new Error("visible text below 12px on " + route + ": " + routeResponsive[route].smallTextCount);
    }
  }
  const responsive = routeResponsive.study;
  if (responsive.bodyText < 15 || responsive.descriptionText < 12) throw new Error("mobile typography too small");
  if (responsive.nav.height < 44 || responsive.mode.height < 44) throw new Error("mobile touch target too small");
  await page.screenshot({ path: SHOT, fullPage: false });

  await page.goto(BASE_URL + "/#home", { timeout: 30000 });
  await page.waitForSelector(".app-shell");
  const storageFault = await page.evaluate(async () => {
    Store.resetAll();
    Store.answerWord("abandon", "known", 2);
    Store.updateProfile({ name: "正常保存" });
    await new Promise(resolve => setTimeout(resolve, 120));
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "shici.state.v1") {
        throw new DOMException("quota test", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
    Store.updateProfile({ name: "索引备份" });
    const started = Date.now();
    while (Date.now() - started < 3000) {
      const current = Store.getPersistence();
      if (current.lastSaveOk === true && current.lastSaveLayers.includes("indexedDB")) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const fallback = Store.getPersistence();
    Storage.prototype.setItem = originalSetItem;
    Store.updateProfile({ name: "正常保存" });
    await new Promise(resolve => setTimeout(resolve, 120));
    return {
      localStorage: fallback.localStorage,
      indexedDb: fallback.indexedDb,
      lastSaveOk: fallback.lastSaveOk,
      layers: fallback.lastSaveLayers,
      revision: fallback.revision,
      integrity: fallback.integrity
    };
  });
  if (storageFault.localStorage !== false || storageFault.indexedDb !== true ||
      storageFault.lastSaveOk !== true || !storageFault.layers.includes("indexedDB") ||
      !storageFault.integrity) {
    throw new Error("IndexedDB fallback did not confirm the save");
  }

  await page.evaluate(() => {
    const raw = localStorage.getItem("shici.state.v1");
    const tampered = JSON.parse(raw);
    tampered.profile.name = "未更新校验和";
    localStorage.setItem("shici.state.v1", JSON.stringify(tampered));
  });
  await page.reload({ timeout: 30000 });
  await page.waitForSelector(".app-shell");
  await page.waitForFunction(() => Boolean(document.getElementById("bootScreen")?.hidden), undefined, { timeout: 45000 });
  const integrityRecovery = await page.evaluate(() => ({
    name: Store.getProfile().name,
    corruptBackupKey: Store.getPersistence().corruptBackupKey,
    integrityError: Store.getPersistence().integrityError,
    validIntegrity: Store.getPersistence().integrity
  }));
  if (integrityRecovery.name !== "正常保存" || !integrityRecovery.corruptBackupKey ||
      integrityRecovery.integrityError !== "checksum-mismatch" || !integrityRecovery.validIntegrity) {
    throw new Error("integrity mismatch was not quarantined and recovered from IndexedDB");
  }

  const conflictPage = await task.newPage();
  let conflictRecovery;
  try {
    await conflictPage.goto(BASE_URL + "/#home", { timeout: 30000 });
    await conflictPage.waitForSelector(".app-shell");
    await conflictPage.waitForFunction(
      () => Boolean(document.getElementById("bootScreen")?.hidden),
      undefined,
      { timeout: 30000 }
    );
    await page.evaluate(() => Store.updateProfile({ name: "标签页一" }));
    await conflictPage.waitForFunction(
      () => {
        const persistence = Store.getPersistence();
        return persistence.conflict && !persistence.conflictBackupPending;
      },
      undefined,
      { timeout: 5000 }
    );
    conflictRecovery = await conflictPage.evaluate(() => {
      const before = Store.getPersistence();
      Store.updateProfile({ name: "标签页二" });
      const after = Store.getPersistence();
      return {
        conflict: before.conflict,
        backupKey: before.conflictBackupKey,
        localWriterId: before.writerId,
        saveBlocked: after.lastSaveOk === false && after.error === "multi-tab conflict",
        afterSaveOk: after.lastSaveOk,
        afterError: after.error,
        afterRevision: after.revision
      };
    });
    if (!conflictRecovery.conflict || !conflictRecovery.backupKey || !conflictRecovery.saveBlocked) {
      throw new Error("multi-tab conflict was not preserved and write-blocked: " + JSON.stringify(conflictRecovery));
    }
  } finally {
    await conflictPage.close();
  }

  const bothLayersFail = await page.evaluate(async () => {
    const originalSetItem = Storage.prototype.setItem;
    const originalPut = IDBObjectStore.prototype.put;
    Storage.prototype.setItem = function (key, value) {
      if (key === "shici.state.v1") {
        throw new DOMException("quota test", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("indexedDB test failure", "DataError");
    };
    Store.updateProfile({ name: "双层失败" });
    const started = Date.now();
    while (Date.now() - started < 3000) {
      if (Store.getPersistence().lastSaveOk === false) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const result = {
      lastSaveOk: Store.getPersistence().lastSaveOk,
      error: Store.getPersistence().error,
      warningVisible: Boolean(document.querySelector(".modal"))
    };
    Storage.prototype.setItem = originalSetItem;
    IDBObjectStore.prototype.put = originalPut;
    const cancel = document.querySelector('.modal [data-action="modal-cancel"]');
    if (cancel) cancel.click();
    Store.updateProfile({ name: "恢复保存" });
    await new Promise(resolve => setTimeout(resolve, 150));
    result.recovered = Store.getPersistence().lastSaveOk === true;
    return result;
  });
  if (bothLayersFail.lastSaveOk !== false || !bothLayersFail.warningVisible || !bothLayersFail.recovered) {
    throw new Error("double persistence failure did not block false success or recover");
  }

  const legacyPage = await task.newPage();
  let legacyMigration;
  try {
    await legacyPage.goto(BASE_URL + "/offline.html", { timeout: 30000 });
    await legacyPage.evaluate(() => {
      localStorage.setItem("shici.state.v1", JSON.stringify({
        version: 1,
        profile: {
          name: "旧版迁移",
          dailyGoal: 999,
          voiceGender: "robot",
          voiceRate: 3,
          activeBook: "removed-book"
        },
        words: {
          abandon: {
            seen: 1,
            quizSeen: 3,
            quizCorrect: 2,
            firstSeen: "2026-10-01",
            futureRecordField: "keep-record"
          }
        },
        activity: {
          "2026-10-01": {
            attempts: 3,
            correct: 2,
            learned: ["abandon"]
          }
        },
        meta: { schema: 1, sessions: 1 },
        futureTopLevelField: { keep: true }
      }));
    });
    await legacyPage.goto(BASE_URL + "/#home", { timeout: 30000 });
    await legacyPage.waitForSelector(".app-shell");
    await legacyPage.waitForFunction(
      () => Boolean(document.getElementById("bootScreen")?.hidden),
      undefined,
      { timeout: 30000 }
    );
    legacyMigration = await legacyPage.evaluate(() => {
      const before = Store.getState();
      const record = Store.getRecord("abandon");
      Store.updateProfile({ name: "旧版迁移后保存" });
      return {
        version: before.version,
        schema: before.meta.schema,
        dailyGoal: before.profile.dailyGoal,
        activeBook: before.profile.activeBook,
        books: record.books.slice(),
        recordExtra: record.futureRecordField,
        topLevelExtra: before.futureTopLevelField,
        migration: before.meta.migration,
        integrity: Store.getPersistence().integrity
      };
    });
  } finally {
    await legacyPage.close();
  }
  if (legacyMigration.version !== 3 || legacyMigration.schema !== 3 ||
      legacyMigration.dailyGoal !== 20 || legacyMigration.activeBook !== "gaokao" ||
      JSON.stringify(legacyMigration.books) !== JSON.stringify(["gaokao"]) ||
      legacyMigration.recordExtra !== "keep-record" ||
      !legacyMigration.topLevelExtra || legacyMigration.topLevelExtra.keep !== true ||
      legacyMigration.migration.from !== 1 || !legacyMigration.integrity) {
    throw new Error("legacy V1 state migration failed: " + JSON.stringify(legacyMigration));
  }

  const manifest = await page.fetch("manifest.webmanifest");
  const manifestBody = JSON.parse(manifest.body);
  if (!manifest.ok || !Array.isArray(manifestBody.icons) || manifestBody.icons.length < 2) {
    throw new Error("PWA manifest invalid");
  }

  const errors = await page.evaluate(() => window.__learningErrors || []);
  if (errors.length) throw new Error("browser errors: " + JSON.stringify(errors));
  console.log(JSON.stringify({
    ok: true,
    taskSpaceId: task.spaceId,
    intervals: logic.intervals,
    objectiveAccuracy: afterObjectiveAccuracy(logic),
    spellingTotal,
    hintsRecorded,
    speech: speechFirst,
    loopSize,
    questionTypes: questionShapes.map(shape => shape.kicker),
    learnedReview: {
      count: logic.learnedQueueLength,
      allStudied: logic.learnedAllStudied,
      weakFirst: logic.learnedWeakFirst
    },
    offline,
    bootMs,
    responsive,
    storageFault,
    integrityRecovery,
    conflictRecovery,
    bothLayersFail,
    legacyMigration,
    routeResponsive,
    manifestIcons: manifestBody.icons.length,
    shot: SHOT
  }, null, 2));
  completed = true;
} finally {
  await page.cdp("Emulation.clearDeviceMetricsOverride").catch(() => {});
  if (completed && !existing) await task.finish({ keep: [] });
}

function afterObjectiveAccuracy(data) {
  return data.objectiveAttempts ? Math.round(data.objectiveCorrect / data.objectiveAttempts * 100) : null;
}
EOF
