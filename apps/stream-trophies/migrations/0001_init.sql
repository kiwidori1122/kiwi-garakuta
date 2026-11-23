-- 配信トロフィー クラウド版 初期スキーマ
-- コメント本文・Googleアカウント情報は保存しない。
CREATE TABLE viewers (
  id TEXT PRIMARY KEY,                 -- YouTubeチャンネルID（公開情報）
  name TEXT NOT NULL,                  -- 表示名（公開情報）
  comments INTEGER NOT NULL DEFAULT 0,
  characters INTEGER NOT NULL DEFAULT 0,
  watch_seconds REAL NOT NULL DEFAULT 0,
  streams INTEGER NOT NULL DEFAULT 0,  -- 参加した配信の数
  member INTEGER NOT NULL DEFAULT 0,   -- チャットでメンバーとして確認できたか
  created REAL NOT NULL,
  heartbeat REAL, device TEXT, sequence INTEGER NOT NULL DEFAULT -1
);
CREATE TABLE messages (                -- 重複集計防止用。数日で自動削除
  id TEXT PRIMARY KEY, created REAL NOT NULL
);
CREATE INDEX messages_created ON messages(created);
CREATE TABLE participation (
  viewer TEXT NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  video TEXT NOT NULL, PRIMARY KEY(viewer, video)
);
CREATE TABLE trophies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, metric TEXT NOT NULL,
  threshold REAL NOT NULL, icon TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE awards (
  viewer TEXT NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  trophy TEXT NOT NULL REFERENCES trophies(id) ON DELETE CASCADE,
  created REAL NOT NULL, PRIMARY KEY(viewer, trophy)
);
CREATE TABLE events (                  -- OBS演出キュー。1日で自動削除
  id INTEGER PRIMARY KEY AUTOINCREMENT, viewer TEXT NOT NULL, payload TEXT NOT NULL, created REAL NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sessions (                -- 拡張の連携トークン（ハッシュのみ保存）
  token TEXT PRIMARY KEY, viewer TEXT NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  created REAL NOT NULL, last_used REAL NOT NULL
);
CREATE TABLE links (                   -- チャット合言葉による連携待ち。15分で失効
  code TEXT PRIMARY KEY, claim TEXT NOT NULL UNIQUE, viewer TEXT, name TEXT, expires REAL NOT NULL
);
CREATE TABLE optout (viewer TEXT PRIMARY KEY, created REAL NOT NULL);

INSERT INTO trophies VALUES
 ('0000000000000001','はじめの一言','comments',1,'🥉',1,1),
 ('0000000000000002','いつもの声','comments',100,'🥈',1,2),
 ('0000000000000003','おしゃべりの達人','characters',10000,'✍️',1,3),
 ('0000000000000004','いっしょの1時間','watch_seconds',3600,'⌛',1,4),
 ('0000000000000005','10時間の思い出','watch_seconds',36000,'🏆',1,5),
 ('0000000000000006','常連さん','streams',10,'🎟️',1,6),
 ('0000000000000007','メンバーの証','member',1,'💎',1,7);
INSERT INTO settings VALUES
 ('style','{"x":64,"y":810,"width":520,"scale":1,"accent":"#d5fa66","background":"#161c25","text":"#ffffff","duration":7,"font_size":24,"radius":24}'),
 ('poll_seconds','20');
