# login.html を元に、管理画面（操作デモ）ページ pages/demo-admin.html を生成する。
# 保存版に /demo/admin のHTMLが残っていないため、残っているRSCペイロード形式を
# 流用して AdminSchedule クライアントコンポーネント（チャンクに保存済み）を指すよう書き換える。
import re, os

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(base, "pages", "login.html")).read()

# 1) ルーターの初期URLを /demo/admin に
html = html.replace('{"pathname":"/login","searchParams":[]}',
                    '{"pathname":"/demo/admin","searchParams":[]}')

# 2) RSCペイロード: ページIDを差し替え（エスケープ済みJSON文字列内）
html = html.replace('page:/login', 'page:/demo/admin')

# 3) ページのクライアント参照を AdminSchedule に差し替え
html = html.replace('c:I[\\"b49ea5cf04c0\\",[],\\"default\\",1]',
                    'c:I[\\"c5de05223e74\\",[],\\"AdminSchedule\\",1]')

# 4) ページ要素の props を demo モードに（params/searchParams は不要）
html = html.replace('1:[\\"$\\",\\"$Lc\\",null,{\\"params\\":\\"$@d\\",\\"searchParams\\":\\"$@e\\"}]',
                    '1:[\\"$\\",\\"$Lc\\",null,{\\"demo\\":true}]')

# 5) タイトル
html = html.replace('<title>UENO CN health＆beauty salon</title>',
                    '<title>予約台帳（操作デモ） | UENO CN health＆beauty salon</title>')

# 6) SSR済みのログインページ本文を、読み込み中プレースホルダーに置き換える
#    （管理画面のSSR HTMLは保存されていないため。ハイドレーション差分でクライアント側が描画し直す）
b = html.index('<body')
bstart = html.index('>', b) + 1
firstscript = html.index('<script', bstart)
placeholder = '<div id="demo-admin-loading" style="padding:2rem;font-family:sans-serif;color:#6b7280">予約台帳（操作デモ）を読み込んでいます…</div>'
html = html[:bstart] + placeholder + html[firstscript:]

# 7) 本物の管理システムのレイアウトに合わせる上書きCSSと補完スクリプトを読み込む
html = html.replace("</head>",
                    '<link rel="stylesheet" href="/pm-layout.css"/>'
                    '<script src="/pm-layout.js" defer=""></script></head>')

out = os.path.join(base, "pages", "demo-admin.html")
open(out, "w").write(html)
print("生成:", out, len(html), "bytes")
