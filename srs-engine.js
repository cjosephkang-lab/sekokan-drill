/*
 * SRS学習エンジン ― 施工管理技士ドリル
 * 間隔反復（Spaced Repetition）と想起練習の中核ロジックを純粋関数で提供する。
 * ブラウザ（単一HTML）とNode（テスト）の両方で動くよう、module.exportsは末尾で条件付きにする。
 *
 * 設計方針（takken-drillの学習導線を踏襲）:
 *  - 間違えた問題は翌日、正解を重ねるほど間隔を広げて再出題する（1回→1日, 2回→3日, 3回→7日, 4回→14日, 以降30日）
 *  - 2回連続正解で「身についた（mastered）」扱い
 *  - 「次にやる」優先度: 復習期限が来た問題 → 未着手の問題 → 合格者推奨の科目順
 *  - 試験日から逆算し、1日にこなすべき問題数を出す
 */

"use strict";

// 正解回数 → 次回までの日数。indexは「連続正解回数(streak)」に対応（0は初回/リセット直後）。
const INTERVALS = [1, 1, 3, 7, 14, 30];

/**
 * 1問の学習状態を、解答結果に応じて更新する。
 * @param {object|undefined} prev 既存の状態（未着手ならundefined）
 * @param {boolean} correct 今回正解したか
 * @param {number} today 経過日数の基準（エポック日: Math.floor(timestamp/86400000)）。テスト容易性のため外部注入
 * @returns {object} { seen, correctStreak, totalCorrect, totalWrong, mastered, dueDay, lastDay }
 */
function reviewCard(prev, correct, today) {
  const s = prev || {
    seen: 0,
    correctStreak: 0,
    totalCorrect: 0,
    totalWrong: 0,
    mastered: false,
    dueDay: today,
    lastDay: null,
  };
  const seen = s.seen + 1;
  let correctStreak, totalCorrect, totalWrong;
  if (correct) {
    correctStreak = s.correctStreak + 1;
    totalCorrect = s.totalCorrect + 1;
    totalWrong = s.totalWrong;
  } else {
    correctStreak = 0; // 誤答で連続正解はリセット（想起に失敗＝忘れかけ）
    totalCorrect = s.totalCorrect;
    totalWrong = s.totalWrong + 1;
  }
  // 間隔は連続正解回数で決める。誤答時はstreak=0→翌日再出題。
  const intervalIdx = Math.min(correctStreak, INTERVALS.length - 1);
  const interval = INTERVALS[intervalIdx];
  const dueDay = today + interval;
  // 2回連続正解で習得扱い。ただし誤答でmasteredは剥がれる（再び忘れうるため）。
  const mastered = correctStreak >= 2;
  return {
    seen,
    correctStreak,
    totalCorrect,
    totalWrong,
    mastered,
    dueDay,
    lastDay: today,
  };
}

/**
 * 復習が必要か（期限が来ているか）。未着手はdueではない（未着手は別枠で扱う）。
 */
function isDue(state, today) {
  if (!state || state.seen === 0) return false;
  if (state.mastered) return state.dueDay <= today; // 習得済みでも期限が来れば復習に回す
  return state.dueDay <= today;
}

/**
 * 「次にやる」問題順を決める。
 * 優先度: (1)復習期限切れ → (2)未着手 → (3)それ以外（既習だが期限前）
 * 各グループ内は subjectOrder（科目の推奨順）→ 期限の早い順 → id順で安定ソート。
 * @param {Array} questions 問題配列（{id, cat, ...}）
 * @param {object} states id→state のマップ
 * @param {number} today エポック日
 * @param {Array<string>} subjectOrder 科目の推奨学習順（先頭ほど優先）
 * @returns {Array} 並べ替えた問題配列
 */
// 問題オブジェクトから状態マップのキーを取り出す。既存テストとの互換のため id を優先し、
// アプリ側の qid にもフォールバックする（両方あれば id）。null/undefinedは0扱いにしない。
function keyOf(q) {
  return q.id != null ? q.id : q.qid;
}

function buildQueue(questions, states, today, subjectOrder) {
  const order = subjectOrder || [];
  const rank = (cat) => {
    const i = order.indexOf(cat);
    return i === -1 ? order.length : i;
  };
  const group = (q) => {
    const st = states[keyOf(q)];
    if (isDue(st, today)) return 0; // 復習期限切れ
    if (!st || st.seen === 0) return 1; // 未着手
    return 2; // 既習・期限前
  };
  const dueDayOf = (q) => {
    const st = states[keyOf(q)];
    return st && st.dueDay != null ? st.dueDay : Infinity;
  };
  return questions.slice().sort((a, b) => {
    const ga = group(a),
      gb = group(b);
    if (ga !== gb) return ga - gb;
    const ra = rank(a.cat),
      rb = rank(b.cat);
    if (ra !== rb) return ra - rb;
    const da = dueDayOf(a),
      db = dueDayOf(b);
    if (da !== db) return da - db;
    return keyOf(a) - keyOf(b);
  });
}

/**
 * 今日やるべき問題数を試験日から逆算する。
 * 未習得の問題を残り日数で割り、最低ラインを保証する。
 * @param {number} remainingCount まだ習得していない問題数
 * @param {number} daysLeft 試験日までの残り日数（1以上）
 * @param {number} minPerDay 1日の最低問題数（デフォルト10）
 * @returns {number} 今日の目標問題数
 */
function dailyGoal(remainingCount, daysLeft, minPerDay) {
  const min = minPerDay == null ? 10 : minPerDay;
  if (remainingCount <= 0) return 0;
  // 試験日が未設定・過ぎた: 全問にせず最低ラインだけ（画面で次の試験日の入力を促す）
  if (daysLeft == null || daysLeft < 0) return Math.min(remainingCount, min);
  if (daysLeft <= 1) return remainingCount; // 前日・当日は全部
  const perDay = Math.ceil(remainingCount / daysLeft);
  return Math.max(perDay, min);
}

/**
 * 科目別の「予想得点」を、本番の問題数に換算して出す。
 * 例: ある科目の収録40問のうち「取れる」問題が28問（70%）→ 本番でその科目が20問なら14点相当。
 * 手を付けていない問題は取れない（0点）として数える（1問だけ解いて正解した科目を満点にしない）。
 * rate は画面に出す「解いた問題の中での正答率」で、予想得点の計算には使わない。
 * @param {Array} questions 全問題
 * @param {object} states id→state
 * @param {object} examWeights cat→本番での問題数
 * @returns {object} { byCat: {cat:{answered,correct,rate,projected}}, totalProjected, totalExam }
 */
function projectedScore(questions, states, examWeights) {
  const byCat = {};
  const catStats = {};
  for (const q of questions) {
    const st = states[keyOf(q)];
    const c = q.cat;
    if (!catStats[c]) catStats[c] = { answered: 0, correct: 0, total: 0 };
    catStats[c].total += 1;
    if (st && st.seen > 0) {
      catStats[c].answered += 1;
      // 直近の正誤は correctStreak>0 で近似せず、通算正答率で見る（安定）
      if (st.totalCorrect > st.totalWrong) catStats[c].correct += 1;
    }
  }
  let totalProjected = 0,
    totalExam = 0;
  for (const cat of Object.keys(examWeights)) {
    const w = examWeights[cat];
    totalExam += w;
    const s = catStats[cat] || { answered: 0, correct: 0, total: 0 };
    const rate = s.answered > 0 ? s.correct / s.answered : 0;
    const projected = s.total > 0 ? Math.round((s.correct / s.total) * w) : 0;
    totalProjected += projected;
    byCat[cat] = {
      answered: s.answered,
      correct: s.correct,
      total: s.total,
      rate,
      projected,
      weight: w,
    };
  }
  return { byCat, totalProjected, totalExam };
}

/**
 * 学習の「日」の番号。日本時間の朝4時で日が変わる（夜中の学習は前の日に数える）。
 * 日本時間D日の朝4時〜翌朝4時が、UTCのD日0時と同じ番号になる。
 */
const DAY_SHIFT_MS = 5 * 3600000; // +9時間（日本時間）−4時間（区切り）

function epochDay(ts) {
  return Math.floor((ts + DAY_SHIFT_MS) / 86400000);
}

/**
 * 連続日数が続くか。lastDay が旧区切り（UTC0時＝日本の朝9時）で記録された値なら、
 * 新区切り（朝4時）とは最大1日ずれるので、差2まで続いたとみなす（移行後の最初の1回だけ使う）。
 */
function streakContinues(lastDay, today, legacy) {
  if (lastDay == null) return false;
  const gap = today - lastDay;
  return gap === 1 || (legacy === true && gap === 2);
}

/** 'YYYY-MM-DD'（試験日など）→ その日の番号（epochDay と同じ物差し） */
function dayOfDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

const SRS = {
  INTERVALS,
  reviewCard,
  isDue,
  buildQueue,
  dailyGoal,
  projectedScore,
  epochDay,
  dayOfDate,
  streakContinues,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = SRS;
}
if (typeof window !== "undefined") {
  window.SRS = SRS;
}
