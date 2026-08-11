CREATE TABLE class_feature_policies (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL CHECK (feature_code IN ('ai_post_edit')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (class_id, feature_code)
) STRICT;

CREATE TABLE prompt_coach_runs (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace', 'class')),
  scope_id TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  model_config_id TEXT REFERENCES server_model_configs(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  input_record_count INTEGER NOT NULL CHECK (input_record_count >= 0),
  input_snapshot_json TEXT NOT NULL CHECK (json_valid(input_snapshot_json)),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL,
  UNIQUE (actor_user_id, request_id)
) STRICT;

CREATE INDEX idx_prompt_coach_runs_scope
ON prompt_coach_runs(scope_type, scope_id, created_at DESC);

CREATE TRIGGER prompt_coach_runs_no_update
BEFORE UPDATE ON prompt_coach_runs BEGIN
  SELECT RAISE(ABORT, 'prompt_coach_runs are append only');
END;

CREATE TRIGGER prompt_coach_runs_no_delete
BEFORE DELETE ON prompt_coach_runs BEGIN
  SELECT RAISE(ABORT, 'prompt_coach_runs are append only');
END;

WITH recovered(segment_key, translation_key, content, content_hash) AS (VALUES
  ('a36-title', 'a36-title-s1', '应对暴力侵害儿童：巴拉圭大学生在行动', '8af8f88121ebcaef9654d94080f17ff1360cbd8613b33ba282d5567ff3134c38'),
  ('a36-p01', 'a36-p01-s1', '联合国儿童基金会一份关于拉丁美洲和加勒比地区状况的报告警告称：“在评估过的每一个国家，针对儿童的暴力行为都普遍存在。迄今为止，所有相关调查均表明，这是一个重大且普遍的问题。”为了助力解决这一问题，联合国学术影响 (UNAI)巴拉圭成员机构南美洲南部大学(UCSA)加入了JERE志愿者计划。', '7dfc4ad6510b3d482a20b2cd7de0b8a66a951dcb0d9f22b91d65730de529fdc3'),
  ('a36-p02', 'a36-p02-s1', '该项目由联合国儿童基金会（UNICEF）发起，旨在阿根廷、巴西和巴拉圭交界的“三国边境”地区预防针对儿童的暴力行为。“JERE”在瓜拉尼语中意为“旋转”，该项目采用“UPSHIFT”方法培训大学生，以期预防和减少巴拉圭全国脆弱社区的暴力行为。这一方法同样由儿基会开发，此前已在危地马拉和尼加拉瓜等该地区其他国家应用。', 'acb7639d9a68e958b93bfb8c57a27da87bf0552fbb2a59ee9648dd161d5a0a52'),
  ('a36-p03', 'a36-p03-s1', '该项目的目标是培养青年的领导力、团队合作、沟通、创新和创造力等软实力。根据项目的官方介绍，“通过开展外联活动、举办以启发、人本为中心的设计工作坊，加上导师辅导、偶尔提供种子资金，参与者可以获得宝贵且可迁移的技能。”在此框架下，USCA的本科生参与了该能力建设计划，实施了三个具体项目。', 'aa8e6e2e1a197408e100887ce0301236e5c9e1401af964ed4f899eaf625e9305'),
  ('a36-p04', 'a36-p04-s1', '经过全面培训，USCA的大学生能够帮助巴拉圭贫困和弱势社区了解影响自身的若干关键社会问题，并提高儿童、青少年、父母和照料者的认知。卢克市有一个名叫塔鲁曼迪的微型社区，内有百余户家庭依赖社区公共食堂。其中一个项目便在这里展开。', '87bd6664f590a19dde7571592ec6df13d22ea9c7049668fc1c625656672bd380'),
  ('a36-p05', 'a36-p05-s1', '志愿者学生举办了一系列线下工作坊，教授当地家庭如何应对身体和心理暴力，并辅以丰富的娱乐活动来扩大宣传影响，共覆盖47个家庭，涉及89名2至17岁的儿童和青年。与此同时，在巴拉圭首都亚松森，另一个名为“Angatu”项目同步展开，通过实地走访圣弗朗西斯科社区居民，解决人口贩卖等问题。', '632efc10988075bc0f6bd90f58f37a9106615c71d21dc3c561eb4578916fa208'),
  ('a36-p06', 'a36-p06-s1', '尽管该社区的基础设施条件总体较好，但迹象表明，当地对儿童剥削和人口贩运问题的认识严重匮乏，令人担忧。此外，针对儿童和青少年的心理支持明显不足，许多孩子所处的整体环境较为恶劣。为此，UCSA的志愿者学生采用了“角色扮演教学法”，开展了名为“超级英雄训练”的活动。', '2cbeb22ca47bfff37e31cc77fc7a84c1c8822351440aa95f04d10cc0950d85ac'),
  ('a36-p07', 'a36-p07-s1', '该活动旨在通过桌面游戏等趣味活动，让孩子们在安全快乐的环境中学习核心学科的学术概念，同时强调教育是摆脱暴力、过上正常生活的唯一途径。与此同时，UCSA志愿者学生开展的另一个项目是“Kakuaa Pora”，地点设在社会条件艰苦的“神圣之子”（Divino Niño）和“进教之佑”（María Auxiliadora）定居点。心理学家和律师在当地向居民讲解发生家庭暴力时应如何应对，去何处寻求帮助。', '83b5e00d9eb0fe118cc001cb8bd8855f743b9d940086a1eff37dc52ddd837296'),
  ('a36-p08', 'a36-p08-s1', '志愿者学生梅布尔·阿科斯塔（Mabel Acosta）说：“许多孩子甚至主动向我们倾诉自己的生活经历和内心秘密，我认为这也是我们工作的一部分。”她补充道：“在走访这些家庭和孩子并与他们接触后，我深信那些孩子需要我们付出时间和支持，我们必须回应他们的呼唤与期盼。只要每个人都施以援手，这就完全可以实现。”', '884c86737f5e40f9df0546a80437aafc083d1e6f5fc62a86a0006183a9024ea7'),
  ('a36-caption', 'a36-caption-s1', '大学生接受培训，以预防和减少脆弱社区的暴力。（图：南美洲南部大学）', 'be71f50c6ffabbb9f9f1ba49f5676d6b91e8e8cb4f9c5c1131d1b518708f6254')
)
INSERT OR IGNORE INTO translation_versions
  (id, project_id, segment_id, parent_version_id, base_translation_version_id,
    root_translation_version_id, comparison_version_id, prompt_version_id,
    version_kind, scope_type, content, content_hash, created_by, origin_instance_id, created_at)
SELECT base.id || ':human-edit-recovered', base.project_id, base.segment_id, base.id, base.id,
  base.root_translation_version_id, base.id, base.prompt_version_id,
  'human_post_edit', 'project', recovered.content, recovered.content_hash,
  (SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.role_code = 'admin' ORDER BY u.created_at LIMIT 1),
  base.origin_instance_id, '2026-08-10T00:00:00.000Z'
FROM recovered
JOIN translation_versions base ON base.id =
  'demo-a36-violence-against-children:translation:' || recovered.translation_key
WHERE base.version_kind = 'ai_translation';
