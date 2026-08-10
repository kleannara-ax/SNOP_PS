-- ============================================================
-- PS S&OP 계획 시스템 — 원지포장 지관/월별 실적량 테이블
-- 테이블명: ps_packaging_monthly
-- DB: MariaDB
-- 생성일: 2026-08-10
-- ============================================================
-- 데이터 관리 방식:
--   - 월 단위 + 지관규격별 포장 실적량(ton) 저장
--   - I/F 연동 시: 원지포장실적 엑셀/시스템에서 포장실적일자 월 기준,
--     지관(3/6/12인치)별 실적량(KG) 합산 후 ton 변환하여 UPSERT
--   - PK: year_month + jigwan (월+지관규격 복합키)
--   - 화면 표시:
--     · 상단 "지관/월별 실적량" 표
--     · 행: 3인치 / 6인치 / 12인치 / 계
--     · 열: 월별 (1월~당월)
--     · 계 행 = 해당 월 3인치+6인치+12인치 합계 (프론트 계산)
--     · 총계/평균 = 프론트 계산
--   - 원본 데이터 출처: 원지포장실적 조회 엑셀
--     · 포장실적일자(col2) → year_month 추출
--     · 지관(col16) → jigwan 매핑 (3→3인치, 6→6인치, 12→12인치)
--     · 실적량(col10, KG) → weight_ton (÷1000)
-- ============================================================

DROP TABLE IF EXISTS ps_packaging_monthly;

CREATE TABLE ps_packaging_monthly (
    -- PK
    monthly_id      BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '월별 실적 ID (PK, AUTO_INCREMENT)',

    -- ══ 기준 월 + 지관규격 ══
    year_month      VARCHAR(7)      NOT NULL                 COMMENT '대상 월 (YYYY-MM, 예: 2026-07)',
    jigwan          VARCHAR(10)     NOT NULL                 COMMENT '지관규격 (3인치, 6인치, 12인치)',

    -- ══ 실적량 ══
    weight_ton      DECIMAL(12,1)   NOT NULL DEFAULT 0       COMMENT '실적량 (ton, 소수점 1자리)',

    -- ══ 시스템 공통 ══
    created_by      VARCHAR(50)     DEFAULT NULL             COMMENT '등록자 ID',
    created_dt      DATETIME        DEFAULT CURRENT_TIMESTAMP
                                                             COMMENT '등록일시',
    updated_by      VARCHAR(50)     DEFAULT NULL             COMMENT '수정자 ID',
    updated_dt      DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                                                             COMMENT '최종 수정일시',

    PRIMARY KEY (monthly_id),

    -- 복합 유니크: 월+지관 조합당 1건만 허용
    UNIQUE KEY uk_pkg_monthly_ym_jigwan (year_month, jigwan),

    -- 검색 인덱스
    KEY idx_pkg_monthly_year_month (year_month)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='PS S&OP 원지포장 지관/월별 실적량 (ton)';


-- ============================================================
-- 조회 쿼리 (화면 로드 시 — 연도 단위)
-- ============================================================
-- SELECT year_month, jigwan, weight_ton
-- FROM   ps_packaging_monthly
-- WHERE  year_month LIKE CONCAT(#{year}, '%')
-- ORDER BY year_month, jigwan;


-- ============================================================
-- 저장 쿼리 (I/F 연동 — 월+지관별 UPSERT)
-- ============================================================
-- INSERT INTO ps_packaging_monthly (
--     year_month, jigwan, weight_ton, created_by
-- ) VALUES (
--     #{yearMonth}, #{jigwan}, #{weightTon}, #{userId}
-- )
-- ON DUPLICATE KEY UPDATE
--     weight_ton  = VALUES(weight_ton),
--     updated_by  = #{userId};


-- ============================================================
-- 샘플 데이터 (2026-07)
-- ============================================================
-- INSERT INTO ps_packaging_monthly (year_month, jigwan, weight_ton) VALUES
--     ('2026-07', '3인치',  1397.2),
--     ('2026-07', '6인치',  5318.7),
--     ('2026-07', '12인치', 5538.1);
