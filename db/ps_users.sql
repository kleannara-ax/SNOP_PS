-- ============================================================
-- PS S&OP 계획 시스템 — 사용자 테이블
-- 테이블명: ps_users
-- 생성일: 2026-04-30
-- 설명: 시스템 사용자 인증 및 권한 관리
-- 비밀번호: bcrypt 해싱 저장
-- ============================================================

DROP TABLE IF EXISTS ps_users;

CREATE TABLE ps_users (
    user_id         VARCHAR(50)     NOT NULL    COMMENT '사용자 ID (로그인 ID)',
    user_name       VARCHAR(100)    NOT NULL    COMMENT '사용자 이름 (표시명)',
    password        VARCHAR(255)    NOT NULL    COMMENT '비밀번호 (bcrypt 해싱)',
    role            VARCHAR(20)     NOT NULL    DEFAULT 'VIEWER'
                                                COMMENT '권한 (ADMIN / PLANNER / VIEWER)',
    use_yn          CHAR(1)         NOT NULL    DEFAULT 'Y'
                                                COMMENT '사용여부 (Y/N)',
    created_by      VARCHAR(50)                 COMMENT '생성자',
    created_dt      DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP
                                                COMMENT '생성일시',
    updated_by      VARCHAR(50)                 COMMENT '수정자',
    updated_dt      DATETIME                    ON UPDATE CURRENT_TIMESTAMP
                                                COMMENT '수정일시',
    last_login_dt   DATETIME                    COMMENT '최종 로그인 일시',

    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='PS S&OP 사용자 관리';


-- ============================================================
-- 초기 사용자 데이터 (비밀번호는 bcrypt 해싱)
-- admin    / snop2026!
-- planner01 / plan2026!
-- viewer01  / view2026!
--
-- ※ 아래 해싱값은 서버 기동 시 generate_password_hash.py로 생성
--   또는 Python: bcrypt.hashpw(b'snop2026!', bcrypt.gensalt()).decode()
-- ============================================================

-- 실제 INSERT 시에는 bcrypt 해싱된 비밀번호를 사용해야 합니다.
-- 아래는 예시 구조이며, 실제 해싱값은 서버 초기화 스크립트로 생성합니다.

-- INSERT INTO ps_users (user_id, user_name, password, role, created_by) VALUES
-- ('admin',     '관리자',  '$2b$12$...해싱값...', 'ADMIN',   'SYSTEM'),
-- ('planner01', '담당자',  '$2b$12$...해싱값...', 'PLANNER', 'SYSTEM'),
-- ('viewer01',  '조회자',  '$2b$12$...해싱값...', 'VIEWER',  'SYSTEM');
