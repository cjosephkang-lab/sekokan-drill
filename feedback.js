/*
 * ご意見の窓 ― 施工管理技士ドリル
 * 「いつ窓を出すか」と「送る中身の形」を純粋関数で提供する（画面と送信は app-template.html 側）。
 *  - 3回目の学習を終えた時に初めて出す。答えるか閉じるかしたら14日あける
 *  - 送る中身は決めた項目だけ。自由記述は1000文字・理由は6個までで切る（Firestore のルールと同じ上限）
 */

"use strict";

const FEEDBACK = (function () {
  const FIRST_AFTER = 3;
  const INTERVAL_MS = 14 * 86400000;
  const KEYS = [
    "kind",
    "rating",
    "reasons",
    "text",
    "qref",
    "grade",
    "ver",
    "at",
  ];

  function initial() {
    return { sessions: 0, lastAskedAt: null };
  }

  function normalize(s) {
    const ok = s && typeof s === "object" && Number.isFinite(s.sessions);
    if (!ok) return initial();
    return {
      sessions: s.sessions,
      lastAskedAt: Number.isFinite(s.lastAskedAt) ? s.lastAskedAt : null,
    };
  }

  function recordSession(s) {
    return { ...s, sessions: s.sessions + 1 };
  }

  function markAsked(s, now) {
    return { ...s, lastAskedAt: now };
  }

  function shouldAsk(s, now) {
    if (s.sessions < FIRST_AFTER) return false;
    return s.lastAskedAt === null || now - s.lastAskedAt >= INTERVAL_MS;
  }

  // Firestore REST API（documents の作成）に渡す形にする
  function toFirestore(p) {
    const fields = {};
    KEYS.forEach(function (k) {
      let v = p[k];
      if (v === undefined || v === null) return;
      if (k === "reasons") {
        if (!Array.isArray(v) || !v.length) return;
        fields[k] = {
          arrayValue: {
            values: v.slice(0, 6).map(function (x) {
              return { stringValue: String(x) };
            }),
          },
        };
        return;
      }
      v = String(v);
      if (k === "text") {
        v = v.trim().slice(0, 1000);
        if (!v) return;
      }
      fields[k] = { stringValue: v };
    });
    return { fields: fields };
  }

  return {
    initial,
    normalize,
    recordSession,
    markAsked,
    shouldAsk,
    toFirestore,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = FEEDBACK;
}
if (typeof window !== "undefined") {
  window.FEEDBACK = FEEDBACK;
}
