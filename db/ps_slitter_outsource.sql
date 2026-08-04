-- ============================================================
-- PS S&OP 계획 시스템 — 슬리터 외주 진행 내역 테이블
-- 테이블명: ps_slitter_outsource
-- DB: MariaDB
-- 생성일: 2026-08-04
-- ============================================================
-- 데이터 관리 방식:
--   - 일자별 수기입력 5개 필드 저장
--   - 자동계산 필드(대기재고/보관재고/계)는 프론트에서 계산 (DB 미저장)
--     · 대기재고 = 전일 대기재고 + 입고 - 슬리팅실적 (1일: 청주대기 + 입고 - 슬리팅실적)
--     · 보관재고 = 슬리팅 입고 - 출고
--     · 계 = 대기재고 + 보관재고
--   - PK: year_month + day_no (월+일 복합키)
--   - 사용자가 화면에서 값 키인 후 저장 버튼 클릭 → API 호출 → DB 저장
-- ============================================================

DROP TABLE IF EXISTS ps_slitter_outsource;

CREATE TABLE ps_slitter_outsource (
    -- PK
    outsource_id    BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '외주 진행 ID (PK, AUTO_INCREMENT)',

    -- ══ 기준 월/일 ══
    year_month      VARCHAR(7)      NOT NULL                 COMMENT '대상 월 (YYYY-MM)',
    day_no          TINYINT         NOT NULL                 COMMENT '일자 (1~31)',

    -- ══ 원규격 (에페 입고) — 수기입력 ══
    cheongju        DECIMAL(15,2)   DEFAULT NULL             COMMENT '청주대기 (수기입력)',
    ipgo            DECIMAL(15,2)   DEFAULT NULL             COMMENT '입고 (수기입력)',
    slitting        DECIMAL(15,2)   DEFAULT NULL             COMMENT '슬리팅실적 (수기입력)',

    -- ══ 재단완료 (원지) — 수기입력 ══
    slit_ipgo       DECIMAL(15,2)   DEFAULT NULL             COMMENT '슬리팅 입고 (수기입력)',
    chulgo          DECIMAL(15,2)   DEFAULT NULL             COMMENT '출고 (수기입력)',

    -- ══ 시스템 공통 ══
    created_by      VARCHAR(50)     DEFAULT NULL             COMMENT '등록자 ID',
    created_dt      DATETIME        DEFAULT CURRENT_TIMESTAMP
                                                             COMMENT '등록일시',
    updated_by      VARCHAR(50)     DEFAULT NULL             COMMENT '수정자 ID',
    updated_dt      DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                                                             COMMENT '최종 수정일시',

    PRIMARY KEY (outsource_id),

    -- 복합 유니크: 월+일 조합당 1건만 허용
    UNIQUE KEY uk_outsource_ym_day (year_month, day_no),

    -- 검색 인덱스
    KEY idx_outsource_year_month (year_month)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='PS S&OP 슬리터 외주 진행 내역 (일자별 수기입력 5개 필드)';


-- ============================================================
-- 조회 쿼리 (화면 로드 시 — 월 단위)
-- ============================================================
-- SELECT day_no, cheongju, ipgo, slitting, slit_ipgo, chulgo
-- FROM   ps_slitter_outsource
-- WHERE  year_month = #{yearMonth}
-- ORDER BY day_no;


-- ============================================================
-- 저장 쿼리 (사용자 저장 버튼 클릭 — 일자별 UPSERT)
-- ============================================================
-- INSERT INTO ps_slitter_outsource (
--     year_month, day_no,
--     cheongju, ipgo, slitting, slit_ipgo, chulgo,
--     created_by
-- ) VALUES (
--     #{yearMonth}, #{dayNo},
--     #{cheongju}, #{ipgo}, #{slitting}, #{slitIpgo}, #{chulgo},
--     #{userId}
-- )
-- ON DUPLICATE KEY UPDATE
--     cheongju    = VALUES(cheongju),
--     ipgo        = VALUES(ipgo),
--     slitting    = VALUES(slitting),
--     slit_ipgo   = VALUES(slit_ipgo),
--     chulgo      = VALUES(chulgo),
--     updated_by  = #{userId};


-- ============================================================
-- 삭제 쿼리 (특정 월 전체 삭제 — 필요 시)
-- ============================================================
-- DELETE FROM ps_slitter_outsource
-- WHERE year_month = #{yearMonth};
