// feedback.js のテスト。実行: node feedback.test.js
const F = require("./feedback.js");

let pass = 0,
  fail = 0;
function eq(name, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++;
  else {
    fail++;
    console.log(
      "FAIL",
      name,
      "\n  got",
      JSON.stringify(got),
      "\n  exp",
      JSON.stringify(exp),
    );
  }
}
const DAY = 86400000;
const T = Date.UTC(2026, 9, 5);

// 窓を出すタイミング
eq("最初は出さない", F.shouldAsk(F.initial(), T), false);
let s = F.initial();
s = F.recordSession(s);
s = F.recordSession(s);
eq("2回目の学習のあとはまだ出さない", F.shouldAsk(s, T), false);
s = F.recordSession(s);
eq("3回目の学習のあとに出す", F.shouldAsk(s, T), true);
s = F.markAsked(s, T);
eq(
  "答えた・閉じた直後は出さない",
  F.shouldAsk(F.recordSession(s), T + DAY),
  false,
);
eq("13日後もまだ出さない", F.shouldAsk(s, T + 13 * DAY), false);
eq("14日あけたら出す", F.shouldAsk(s, T + 14 * DAY), true);
eq(
  "壊れた保存値は最初からやり直す",
  F.shouldAsk(F.normalize({ sessions: "x" }), T),
  false,
);
eq("normalize は不足を補う", F.normalize(null), {
  sessions: 0,
  lastAskedAt: null,
});

// 送る中身（Firestore REST の形）
const d = F.toFirestore({
  kind: "survey",
  rating: "bad",
  reasons: ["解説がない"],
  text: "  ",
  grade: "1kyu",
  ver: "v1",
  at: "2026-10-05T00:00:00.000Z",
});
eq("空白だけの text は送らない", "text" in d.fields, false);
eq("reasons は配列で送る", d.fields.reasons, {
  arrayValue: { values: [{ stringValue: "解説がない" }] },
});
eq("rating は文字列", d.fields.rating, { stringValue: "bad" });
const long = F.toFirestore({
  kind: "general",
  text: "あ".repeat(1200),
  ver: "v1",
  at: "x",
});
eq("text は1000文字で切る", long.fields.text.stringValue.length, 1000);
eq(
  "未知の項目は送らない",
  "name" in
    F.toFirestore({ kind: "general", name: "山田", ver: "v1", at: "x" }).fields,
  false,
);
eq(
  "reasons は6個まで",
  F.toFirestore({
    kind: "survey",
    reasons: ["a", "b", "c", "d", "e", "f", "g"],
    ver: "v1",
    at: "x",
  }).fields.reasons.arrayValue.values.length,
  6,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
