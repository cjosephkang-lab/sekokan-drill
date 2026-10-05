"use strict";
const SRS = require("./srs-engine.js");

let pass = 0,
  fail = 0;
const fails = [];
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    fails.push(`✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`);
  }
}
function ok(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    fails.push(`✗ ${msg}`);
  }
}

// ---- reviewCard: 間隔の伸び ----
{
  // 初回正解 → 連続1 → 翌日(interval=1)
  const s1 = SRS.reviewCard(undefined, true, 100);
  eq(s1.correctStreak, 1, "reviewCard: 初回正解でstreak=1");
  eq(s1.dueDay, 101, "reviewCard: 初回正解でdueDay=today+1");
  eq(s1.mastered, false, "reviewCard: 1回正解ではまだmasteredでない");
  eq(s1.totalCorrect, 1, "reviewCard: totalCorrect=1");

  // 2連続正解 → interval=3 → mastered
  const s2 = SRS.reviewCard(s1, true, 101);
  eq(s2.correctStreak, 2, "reviewCard: 2連続でstreak=2");
  eq(s2.dueDay, 104, "reviewCard: 2連続正解でdueDay=today+3");
  eq(s2.mastered, true, "reviewCard: 2連続正解でmastered");

  // 3連続 → interval=7
  const s3 = SRS.reviewCard(s2, true, 104);
  eq(s3.dueDay, 111, "reviewCard: 3連続正解でdueDay=today+7");

  // 4連続 → interval=14
  const s4 = SRS.reviewCard(s3, true, 111);
  eq(s4.dueDay, 125, "reviewCard: 4連続正解でdueDay=today+14");

  // 5連続 → interval=30（頭打ち）
  const s5 = SRS.reviewCard(s4, true, 125);
  eq(s5.dueDay, 155, "reviewCard: 5連続正解でdueDay=today+30");

  // 6連続 → 依然30（頭打ち維持）
  const s6 = SRS.reviewCard(s5, true, 155);
  eq(s6.dueDay, 185, "reviewCard: 6連続でも間隔は30で頭打ち");
}

// ---- reviewCard: 誤答でリセット ----
{
  let s = SRS.reviewCard(undefined, true, 100);
  s = SRS.reviewCard(s, true, 101); // mastered
  ok(s.mastered, "reviewCard(前提): 2連続でmastered");
  const wrong = SRS.reviewCard(s, false, 104);
  eq(wrong.correctStreak, 0, "reviewCard: 誤答でstreak=0にリセット");
  eq(wrong.dueDay, 105, "reviewCard: 誤答で翌日再出題(today+1)");
  eq(wrong.mastered, false, "reviewCard: 誤答でmasteredが剥がれる");
  eq(wrong.totalWrong, 1, "reviewCard: totalWrong=1");
  eq(wrong.totalCorrect, 2, "reviewCard: 誤答でtotalCorrectは維持");
}

// ---- isDue ----
{
  ok(
    SRS.isDue(undefined, 100) === false,
    "isDue: 未着手(undefined)はdueでない",
  );
  ok(SRS.isDue({ seen: 0 }, 100) === false, "isDue: seen=0はdueでない");
  const s = SRS.reviewCard(undefined, false, 100); // dueDay=101
  ok(SRS.isDue(s, 100) === false, "isDue: 期限前はfalse");
  ok(SRS.isDue(s, 101) === true, "isDue: 期限当日はtrue");
  ok(SRS.isDue(s, 102) === true, "isDue: 期限超過はtrue");
}

// ---- buildQueue: 優先度（復習→未着手→既習） ----
{
  const questions = [
    { id: 1, cat: "施工管理法" },
    { id: 2, cat: "土木一般" },
    { id: 3, cat: "法規" },
    { id: 4, cat: "専門土木" },
  ];
  const subjectOrder = ["施工管理法", "土木一般", "法規", "専門土木"];
  const today = 200;
  const states = {
    // id1: 復習期限切れ（誤答してdueDay=196、今日200なので期限切れ）
    1: {
      seen: 3,
      correctStreak: 0,
      dueDay: 196,
      mastered: false,
      totalCorrect: 1,
      totalWrong: 2,
      lastDay: 195,
    },
    // id3: 既習・期限前（dueDay=210）
    3: {
      seen: 2,
      correctStreak: 2,
      dueDay: 210,
      mastered: true,
      totalCorrect: 2,
      totalWrong: 0,
      lastDay: 199,
    },
    // id2, id4: 未着手（statesに無い）
  };
  const q = SRS.buildQueue(questions, states, today, subjectOrder);
  eq(
    q.map((x) => x.id),
    [1, 2, 4, 3],
    "buildQueue: 復習(1)→未着手を科目順(2,4)→既習(3)",
  );
}

// ---- buildQueue: 復習が複数あれば期限の早い順 ----
{
  const questions = [
    { id: 10, cat: "法規" },
    { id: 11, cat: "法規" },
  ];
  const states = {
    10: {
      seen: 1,
      correctStreak: 0,
      dueDay: 199,
      mastered: false,
      totalCorrect: 0,
      totalWrong: 1,
      lastDay: 198,
    },
    11: {
      seen: 1,
      correctStreak: 0,
      dueDay: 198,
      mastered: false,
      totalCorrect: 0,
      totalWrong: 1,
      lastDay: 197,
    },
  };
  const q = SRS.buildQueue(questions, states, 200, ["法規"]);
  eq(
    q.map((x) => x.id),
    [11, 10],
    "buildQueue: 復習は期限の早い順（11のdueDay=198が先）",
  );
}

// ---- dailyGoal ----
{
  eq(SRS.dailyGoal(0, 100, 10), 0, "dailyGoal: 残り0問なら0");
  eq(
    SRS.dailyGoal(100, 100, 10),
    10,
    "dailyGoal: 100問/100日→1問だが最低10問を保証",
  );
  eq(SRS.dailyGoal(500, 10, 10), 50, "dailyGoal: 500問/10日→50問");
  eq(SRS.dailyGoal(30, 1, 10), 30, "dailyGoal: 残り1日は全部");
  eq(SRS.dailyGoal(30, 0, 10), 30, "dailyGoal: 当日(0日)は全部");
  eq(SRS.dailyGoal(45, 3, 10), 15, "dailyGoal: 45問/3日→15問");
}

// ---- projectedScore ----
{
  const questions = [
    { id: 1, cat: "施工管理法" },
    { id: 2, cat: "施工管理法" },
    { id: 3, cat: "法規" },
    { id: 4, cat: "法規" },
  ];
  const states = {
    // 施工管理法: 2問中2問「正答優勢」→ rate=1.0
    1: { seen: 2, totalCorrect: 2, totalWrong: 0 },
    2: { seen: 1, totalCorrect: 1, totalWrong: 0 },
    // 法規: 2問中1問正答優勢 → rate=0.5
    3: { seen: 2, totalCorrect: 2, totalWrong: 0 },
    4: { seen: 2, totalCorrect: 0, totalWrong: 2 },
  };
  const examWeights = { 施工管理法: 30, 法規: 10 };
  const p = SRS.projectedScore(questions, states, examWeights);
  eq(p.byCat["施工管理法"].rate, 1, "projectedScore: 施工管理法のrate=1.0");
  eq(
    p.byCat["施工管理法"].projected,
    30,
    "projectedScore: 施工管理法 30点満点→30点",
  );
  eq(p.byCat["法規"].rate, 0.5, "projectedScore: 法規のrate=0.5");
  eq(p.byCat["法規"].projected, 5, "projectedScore: 法規 10点満点→5点");
  eq(p.totalProjected, 35, "projectedScore: 合計予想点=35");
  eq(p.totalExam, 40, "projectedScore: 本番満点=40");
}

// ---- 回帰テスト: qidキーのデータでも buildQueue/projectedScore が動く ----
// （アプリの実データは id ではなく qid をキーにしている。id前提だと全問未着手扱いになるバグの再発防止）
{
  const questions = [
    { qid: 0, cat: "施工管理法" },
    { qid: 1, cat: "法規" },
  ];
  const states = {
    0: {
      seen: 2,
      correctStreak: 2,
      totalCorrect: 2,
      totalWrong: 0,
      mastered: true,
      dueDay: 210,
      lastDay: 199,
    },
    // qid:1 は未着手
  };
  const today = 200;
  // buildQueue: 既習(0)より未着手(1)が先に来る
  const q = SRS.buildQueue(questions, states, today, ["施工管理法", "法規"]);
  eq(
    q.map((x) => x.qid),
    [1, 0],
    "buildQueue(qid): 未着手(1)→既習・期限前(0)",
  );
  // projectedScore: qid:0 が answered=1 として集計される
  const p = SRS.projectedScore(questions, states, { 施工管理法: 19, 法規: 9 });
  eq(
    p.byCat["施工管理法"].answered,
    1,
    "projectedScore(qid): qid:0がanswered=1に集計される",
  );
  eq(
    p.byCat["施工管理法"].correct,
    1,
    "projectedScore(qid): 正答優勢でcorrect=1",
  );
  eq(
    p.byCat["施工管理法"].projected,
    19,
    "projectedScore(qid): 施工管理法19点満点→19点",
  );
  eq(
    p.byCat["法規"].answered,
    0,
    "projectedScore(qid): 未着手の法規はanswered=0",
  );
}

// ---- epochDay ----
{
  ok(SRS.epochDay(0) === 0, "epochDay: 0→0");
  ok(SRS.epochDay(86400000) === 1, "epochDay: 1日分→1");
  ok(SRS.epochDay(86400000 * 2 + 500) === 2, "epochDay: 端数切り捨て");
}


// ---- 2026-10-05 修正: 日の区切り・試験日・試験後・予想得点の分母 ----
{
  // 日の区切りは日本時間の朝4時（UTCの0時＝日本の朝9時ではない）
  const jst = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h - 9, mi || 0);
  eq(SRS.epochDay(jst(2026, 10, 5, 8, 30)), SRS.epochDay(jst(2026, 10, 5, 9, 30)), "epochDay: 朝8時半と9時半は同じ日");
  eq(SRS.epochDay(jst(2026, 10, 5, 3, 59)), SRS.epochDay(jst(2026, 10, 4, 23, 0)), "epochDay: 朝3時59分は前の日");
  eq(SRS.epochDay(jst(2026, 10, 5, 4, 0)) - SRS.epochDay(jst(2026, 10, 4, 23, 0)), 1, "epochDay: 朝4時で次の日");
  // 試験日の文字列 → その日の番号（日中に開いた時の epochDay と一致）
  eq(SRS.dayOfDate("2026-10-25"), SRS.epochDay(jst(2026, 10, 25, 10, 0)), "dayOfDate: 試験日の朝10時と同じ日");
  eq(SRS.dayOfDate("2026-10-25") - SRS.epochDay(jst(2026, 10, 23, 10, 0)), 2, "dayOfDate: 10/23 の昼は残り2日");
  // 試験日を過ぎた・未設定なら全問にしない（最低ラインだけ）
  eq(SRS.dailyGoal(400, -1, 10), 10, "dailyGoal: 試験後は全問にしない");
  eq(SRS.dailyGoal(400, null, 10), 10, "dailyGoal: 試験日未設定は全問にしない");
  eq(SRS.dailyGoal(5, -3, 10), 5, "dailyGoal: 試験後でも残りが少なければ残り数");
  // 予想得点: 手を付けていない問題は取れない（0点）として数える
  const questions = [
    { qid: 1, cat: "法規" }, { qid: 2, cat: "法規" }, { qid: 3, cat: "法規" }, { qid: 4, cat: "法規" },
  ];
  const states = { 1: { seen: 1, totalCorrect: 1, totalWrong: 0 } }; // 4問中1問だけ解いて正解
  const p = SRS.projectedScore(questions, states, { 法規: 8 });
  eq(p.byCat["法規"].projected, 2, "projectedScore: 1/4問しか取れていない→8点中2点（満点にしない）");
  eq(p.byCat["法規"].total, 4, "projectedScore: total は分野の全問数");
  eq(p.byCat["法規"].rate, 1, "projectedScore: rate（画面の正答率）は解いた問題の中での割合のまま");
}


// ---- 2026-10-05 旧データ（UTC区切りの日番号）からの移行: 連続日数を切らない ----
{
  eq(SRS.streakContinues(99, 100, false), true, "streakContinues: 前日なら続く");
  eq(SRS.streakContinues(98, 100, false), false, "streakContinues: 2日空けば切れる");
  eq(SRS.streakContinues(98, 100, true), true, "streakContinues: 旧区切りの記録なら差2まで続く（朝4〜9時のずれ）");
  eq(SRS.streakContinues(97, 100, true), false, "streakContinues: 旧区切りでも差3は切れる");
  eq(SRS.streakContinues(null, 100, true), false, "streakContinues: 記録なしは続かない");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fails.length) {
  console.log("\n" + fails.join("\n"));
  process.exit(1);
}
