-- ============================================================
-- PS S&OP 계획 시스템 — 원지포장 일자별 실적량 테이블
-- 테이블명: ps_packaging_daily
-- DB: MariaDB
-- 생성일: 2026-08-10
-- ============================================================
-- 데이터 관리 방식:
--   - 일자별 포장실적(내수/수출) + 포장대기(내수/수출) 실적량(ton) 저장
--   - I/F 연동 시: 원지포장실적/대기 엑셀·시스템에서 포장실적일자 기준,
--     내수구분별 실적량(KG) 합산 후 ton 변환하여 UPSERT
--   - PK: record_date (일자 1건)
--   - 화면 표시:
--     · 하단 "일자별 실적량" 표
--     · 섹션1 — 포장실적: 내수 / 수출 / 계 (프론트 계산)
--     · 섹션2 — 포장대기: 내수 / 수출 / 계 (프론트 계산)
--     · 월 필터로 해당 월 일자 조회
--   - 원본 데이터 출처:
--     · 포장실적: 원지포장실적 조회 엑셀
--       - 포장실적일자(col2) → record_date
--       - 내수구분(col3, 내수/수출) → pkg_actual_domestic / pkg_actual_export
--       - 실적량(col10, KG) → ton (÷1000)
--     · 포장대기: 원지포장대기 엑셀
--       - 시스템일자 → record_date
--       - 내수구분 → pkg_wait_domestic / pkg_wait_export
--       - 중량(KG) → ton (÷1000)
--   - 관계: ps_packaging_monthly의 월합계 =
--           해당 월 SUM(pkg_actual_domestic + pkg_actual_export)
-- ============================================================

DROP TABLE IF EXISTS ps_packaging_daily;

CREATE TABLE ps_packaging_daily (
    -- PK
    daily_id            BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '일자별 실적 ID (PK, AUTO_INCREMENT)',

    -- ══ 기준일자 ══
    record_date         DATE            NOT NULL                 COMMENT '실적일자 (YYYY-MM-DD)',

    -- ══ 포장실적 (ton) ══
    pkg_actual_domestic DECIMAL(12,1)   NOT NULL DEFAULT 0       COMMENT '포장실적 내수 (ton)',
    pkg_actual_export   DECIMAL(12,1)   NOT NULL DEFAULT 0       COMMENT '포장실적 수출 (ton)',

    -- ══ 포장대기 (ton) ══
    pkg_wait_domestic   DECIMAL(12,1)   NOT NULL DEFAULT 0       COMMENT '포장대기 내수 (ton)',
    pkg_wait_export     DECIMAL(12,1)   NOT NULL DEFAULT 0       COMMENT '포장대기 수출 (ton)',

    -- ══ 시스템 공통 ══
    created_by          VARCHAR(50)     DEFAULT NULL             COMMENT '등록자 ID',
    created_dt          DATETIME        DEFAULT CURRENT_TIMESTAMP
                                                                 COMMENT '등록일시',
    updated_by          VARCHAR(50)     DEFAULT NULL             COMMENT '수정자 ID',
    updated_dt          DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                                                                 COMMENT '최종 수정일시',

    PRIMARY KEY (daily_id),

    -- 유니크: 일자당 1건만 허용
    UNIQUE KEY uk_pkg_daily_date (record_date),

    -- 검색 인덱스: 월 단위 조회용
    KEY idx_pkg_daily_year_month (record_date)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='PS S&OP 원지포장 일자별 실적량 (포장실적+포장대기, ton)';


-- ============================================================
-- 조회 쿼리 (화면 로드 시 — 전체 or 연도 필터)
-- ============================================================
-- SELECT record_date,
--        pkg_actual_domestic, pkg_actual_export,
--        pkg_wait_domestic,   pkg_wait_export
-- FROM   ps_packaging_daily
-- WHERE  record_date BETWEEN #{startDate} AND #{endDate}
-- ORDER BY record_date;

-- 월 단위 조회:
-- SELECT record_date,
--        pkg_actual_domestic, pkg_actual_export,
--        pkg_wait_domestic,   pkg_wait_export
-- FROM   ps_packaging_daily
-- WHERE  DATE_FORMAT(record_date, '%Y-%m') = #{yearMonth}
-- ORDER BY record_date;


-- ============================================================
-- 저장 쿼리 (I/F 연동 — 일자별 UPSERT)
-- ============================================================
-- INSERT INTO ps_packaging_daily (
--     record_date,
--     pkg_actual_domestic, pkg_actual_export,
--     pkg_wait_domestic,   pkg_wait_export,
--     created_by
-- ) VALUES (
--     #{recordDate},
--     #{pkgActualDomestic}, #{pkgActualExport},
--     #{pkgWaitDomestic},   #{pkgWaitExport},
--     #{userId}
-- )
-- ON DUPLICATE KEY UPDATE
--     pkg_actual_domestic = VALUES(pkg_actual_domestic),
--     pkg_actual_export   = VALUES(pkg_actual_export),
--     pkg_wait_domestic   = VALUES(pkg_wait_domestic),
--     pkg_wait_export     = VALUES(pkg_wait_export),
--     updated_by          = #{userId};


-- ============================================================
-- 검증 쿼리: 월별 포장실적 합계 = ps_packaging_monthly 합계 확인
-- ============================================================
-- SELECT DATE_FORMAT(record_date, '%Y-%m') AS ym,
--        ROUND(SUM(pkg_actual_domestic + pkg_actual_export), 1) AS daily_total
-- FROM   ps_packaging_daily
-- GROUP BY ym
-- ORDER BY ym;
--
-- 비교 대상:
-- SELECT year_month,
--        ROUND(SUM(weight_ton), 1) AS monthly_total
-- FROM   ps_packaging_monthly
-- GROUP BY year_month
-- ORDER BY year_month;


-- ============================================================
-- 샘플 데이터 (2026-07-01)
-- ============================================================
-- INSERT INTO ps_packaging_daily
--     (record_date, pkg_actual_domestic, pkg_actual_export, pkg_wait_domestic, pkg_wait_export)
-- VALUES
--     ('2026-07-01', 296.4, 4.8, 143.3, 420.1);
