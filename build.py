#!/usr/bin/env python3
"""sekokan-drill をテンプレート＋エンジン＋級別データから組み立てる。
2級データ（questions.json）は必須、1級データ（questions-1kyu.json）は任意。"""
import json, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))

def load(name):
    p = os.path.join(BASE, name)
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)

def main():
    with open(os.path.join(BASE, 'app-template.html')) as f:
        tpl = f.read()
    with open(os.path.join(BASE, 'srs-engine.js')) as f:
        eng = f.read()

    q2 = load('questions.json') or []
    q1 = load('questions-1kyu.json')  # None if not yet generated

    datasets = {'2kyu': q2}
    if q1:
        datasets['1kyu'] = q1

    data_js = 'window.__DATASETS__ = ' + json.dumps(datasets, ensure_ascii=False, separators=(',', ':')) + ';'

    html = tpl.replace('/* __SRS_ENGINE__ */', eng).replace('/* __QUESTIONS_DATA__ */', data_js)

    assert '__SRS_ENGINE__' not in html and '__QUESTIONS_DATA__' not in html, '未置換マーカー'
    assert 'window.__DATASETS__' in html
    assert 'window.SRS' in html

    out = os.path.join(BASE, 'sekokan-drill.html')
    with open(out, 'w') as f:
        f.write(html)

    print(f'生成完了: {out} ({len(html)} bytes)')
    print(f'  2級: {len(q2)}問')
    print(f'  1級: {len(q1) if q1 else "（未生成）"}問')
    return 0

if __name__ == '__main__':
    sys.exit(main())
