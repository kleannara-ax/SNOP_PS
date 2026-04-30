-- ============================================================
-- PS S&OP 계획 시스템 — 진부화재고 리스트 테이블
-- DB: MariaDB
-- Created: 2026-04-24
-- Updated: 2026-04-29
-- ============================================================
-- 데이터 관리 방식:
--   - 자재당 항상 최신 1건만 유지 (날짜별 이력 없음)
--   - SAP 인터페이스 (매일 07:00):
--       · SAP 연동 필드 UPDATE
--       · ref_date를 당일로 갱신
--       · 매출(수정), 밀롤(수정), 기타출고(수정) → SAP 새 값으로 리셋 (B안)
--       · 폐기 → 사용자 입력값 유지 (A안)
--       · confirmed_yn = 'N' 리셋
--   - 사용자 저장 버튼 클릭:
--       · 수정 4개 필드 UPDATE
--       · confirmed_yn = 'Y' (당일 데이터 확정)
-- ============================================================

-- 진부화재고 리스트 메인 테이블
CREATE TABLE IF NOT EXISTS ps_obsolete_inventory (
    -- PK
    obsolete_id         BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '진부화재고 ID (PK)',

    -- ══ 기준일자 (SAP 연동 시 당일로 갱신) ══
    ref_date            DATE            NOT NULL DEFAULT (CURDATE()) COMMENT '기준일자 (SAP 연동 시 당일로 갱신)',

    -- ══ 기본 정보 (SAP 연동) ══
    plant_code          VARCHAR(20)     NOT NULL                 COMMENT '플랜트 코드 (SAP 연동)',
    material_code       VARCHAR(50)     NOT NULL                 COMMENT '자재코드 (SAP 연동)',

    -- ══ 기초 (SAP 연동) ══
    base_age            INT             DEFAULT 0                COMMENT '기초 - 연수 (SAP 연동)',
    base_weight         DECIMAL(15,2)   DEFAULT 0.00             COMMENT '기초 - 중량(톤) (SAP 연동)',
    base_amount         DECIMAL(15,2)   DEFAULT 0.00             COMMENT '기초 - 금액(백만) (SAP 연동)',

    -- ══ 예정 (SAP 연동) ══
    plan_age            INT             DEFAULT 0                COMMENT '예정 - 연수 (SAP 연동)',
    plan_weight         DECIMAL(15,2)   DEFAULT 0.00             COMMENT '예정 - 중량(톤) (SAP 연동)',
    plan_amount         DECIMAL(15,2)   DEFAULT 0.00             COMMENT '예정 - 금액(백만) (SAP 연동)',

    -- ══ 합계 (자동 계산: 기초 + 예정) ══
    total_age           INT             GENERATED ALWAYS AS (base_age + plan_age) STORED
                                                                 COMMENT '합계 - 연수 (자동계산: 기초+예정)',
    total_weight        DECIMAL(15,2)   GENERATED ALWAYS AS (base_weight + plan_weight) STORED
                                                                 COMMENT '합계 - 중량(톤) (자동계산: 기초+예정)',
    total_amount        DECIMAL(15,2)   GENERATED ALWAYS AS (base_amount + plan_amount) STORED
                                                                 COMMENT '합계 - 금액(백만) (자동계산: 기초+예정)',

    -- ══ 재고 현황 (SAP 연동) ══
    current_stock       DECIMAL(15,2)   DEFAULT 0.00             COMMENT '현재고 (SAP 연동)',

    -- ══ 출고 계획 (사용자 수정 — 저장 버튼 클릭 시 UPDATE) ══
    out_sales_adj       DECIMAL(15,2)   DEFAULT 0.00             COMMENT '매출(수정) - SAP 연동 시 SAP값으로 리셋, 사용자 수정 가능',
    out_mill_roll_adj   DECIMAL(15,2)   DEFAULT 0.00             COMMENT '밀롤(수정) - SAP 연동 시 SAP값으로 리셋, 사용자 수정 가능',
    out_disposal        DECIMAL(15,2)   DEFAULT 0.00             COMMENT '폐기 - SAP 연동 시 유지, 사용자 직접 입력',
    out_etc_adj         DECIMAL(15,2)   DEFAULT 0.00             COMMENT '기타출고(수정) - SAP 연동 시 SAP값으로 리셋, 사용자 수정 가능',

    -- ══ 집계 (자동 계산) ══
    out_total           DECIMAL(15,2)   GENERATED ALWAYS AS (out_sales_adj + out_mill_roll_adj + out_disposal + out_etc_adj) STORED
                                                                 COMMENT '출고계 (자동계산: 매출수정+밀롤수정+폐기+기타출고수정)',
    expected_remain     DECIMAL(15,2)   GENERATED ALWAYS AS (total_weight - (out_sales_adj + out_mill_roll_adj + out_disposal + out_etc_adj)) STORED
                                                                 COMMENT '예상잔량 (자동계산: 합계중량 - 출고계)',
    consume_rate        DECIMAL(7,2)    GENERATED ALWAYS AS (
                            CASE WHEN (base_weight + plan_weight) = 0 THEN 0
                                 ELSE ROUND(((out_sales_adj + out_mill_roll_adj + out_disposal + out_etc_adj) / (base_weight + plan_weight)) * 100, 2)
                            END
                        ) STORED                                 COMMENT '소진율(%) (자동계산: 출고계/합계중량x100)',
    complete_yn         VARCHAR(10)     GENERATED ALWAYS AS (
                            CASE WHEN (base_weight + plan_weight) = 0 THEN '진행중'
                                 WHEN ROUND(((out_sales_adj + out_mill_roll_adj + out_disposal + out_etc_adj) / (base_weight + plan_weight)) * 100, 2) >= 100 THEN '완료'
                                 ELSE '진행중'
                            END
                        ) STORED                                 COMMENT '완료여부 (자동계산: 소진율>=100 완료, 미만 진행중)',

    -- ══ 기타 출고 실적 (SAP 연동) ══
    etc_sales           DECIMAL(15,2)   DEFAULT 0.00             COMMENT '매출 (SAP 연동)',
    etc_mill_roll       DECIMAL(15,2)   DEFAULT 0.00             COMMENT '밀롤 (SAP 연동)',
    etc_out             DECIMAL(15,2)   DEFAULT 0.00             COMMENT '기타출고',
    etc_out_apply       VARCHAR(10)     DEFAULT NULL              COMMENT '기타출고반영 (반영/미반영)',

    -- ══ 확정 관리 ══
    confirmed_yn        CHAR(1)         DEFAULT 'N'              COMMENT '확정여부 (N:미확정, Y:사용자 저장완료)',
    confirmed_by        VARCHAR(50)     DEFAULT NULL              COMMENT '확정자 ID',
    confirmed_dt        DATETIME        DEFAULT NULL              COMMENT '확정일시',

    -- ══ SAP 연동 관리 ══
    last_sync_dt        DATETIME        DEFAULT NULL              COMMENT 'SAP 최종 연동 일시',

    -- ══ 시스템 공통 ══
    created_by          VARCHAR(50)     DEFAULT NULL              COMMENT '등록자 ID',
    created_dt          DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
    updated_by          VARCHAR(50)     DEFAULT NULL              COMMENT '수정자 ID (저장 버튼 클릭한 사용자)',
    updated_dt          DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '최종 수정일시',
    use_yn              CHAR(1)         DEFAULT 'Y'              COMMENT '사용여부 (Y/N)',

    PRIMARY KEY (obsolete_id),

    -- 복합 유니크: 플랜트+자재 조합당 1건만 허용 (최신 데이터만 유지)
    UNIQUE KEY uk_obsolete_plant_material (plant_code, material_code),

    -- 검색 인덱스
    KEY idx_obsolete_ref_date   (ref_date),
    KEY idx_obsolete_plant      (plant_code),
    KEY idx_obsolete_material   (material_code),
    KEY idx_obsolete_confirmed  (confirmed_yn),
    KEY idx_obsolete_complete   (complete_yn)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='PS S&OP 진부화재고 리스트 (자재당 최신 1건 유지, 기준일자+확정 관리)';


-- ============================================================
-- 기존 테이블에 컬럼 추가 시 ALTER 문 (신규 설치가 아닌 경우)
-- ============================================================
-- ALTER TABLE ps_obsolete_inventory
--   ADD COLUMN ref_date       DATE        NOT NULL DEFAULT (CURDATE())
--       COMMENT '기준일자 (SAP 연동 시 당일로 갱신)'
--       AFTER obsolete_id,
--   ADD COLUMN confirmed_yn   CHAR(1)     DEFAULT 'N'
--       COMMENT '확정여부 (N:미확정, Y:사용자 저장완료)',
--   ADD COLUMN confirmed_by   VARCHAR(50) DEFAULT NULL
--       COMMENT '확정자 ID',
--   ADD COLUMN confirmed_dt   DATETIME    DEFAULT NULL
--       COMMENT '확정일시',
--   ADD KEY idx_obsolete_ref_date   (ref_date),
--   ADD KEY idx_obsolete_confirmed  (confirmed_yn);


-- ============================================================
-- SAP 인터페이스 호출 시 실행할 쿼리 (매일 07:00)
-- ============================================================
-- ★ 필드별 리셋 정책:
--   · 매출(수정), 밀롤(수정)        → SAP 새 값으로 리셋 (B안: 다른 필드에 종속)
--   · 기타출고(수정)                → SAP 기타출고 값으로 리셋 (B안)
--   · 폐기                         → 사용자 입력값 유지 (A안: 독립 필드)
-- ★ ref_date → 당일로 갱신
-- ★ confirmed_yn → 'N' 리셋 (새 SAP 데이터이므로 미확정)
-- ============================================================
-- INSERT INTO ps_obsolete_inventory (
--     plant_code, material_code, ref_date,
--     base_age, base_weight, base_amount,
--     plan_age, plan_weight, plan_amount,
--     current_stock,
--     etc_sales, etc_mill_roll, etc_out,
--     out_sales_adj, out_mill_roll_adj, out_etc_adj,
--     out_disposal,
--     confirmed_yn,
--     last_sync_dt, created_by
-- ) VALUES (
--     #{plantCode}, #{materialCode}, CURDATE(),
--     #{baseAge}, #{baseWeight}, #{baseAmount},
--     #{planAge}, #{planWeight}, #{planAmount},
--     #{currentStock},
--     #{etcSales}, #{etcMillRoll}, #{etcOut},
--     #{etcSales}, #{etcMillRoll}, #{etcOut},   -- 최초 INSERT 시 SAP 값으로 초기 세팅
--     0.00,                                      -- 폐기: 최초는 0
--     'N',
--     NOW(), 'SAP_INTERFACE'
-- )
-- ON DUPLICATE KEY UPDATE
--     -- SAP 연동 필드 갱신
--     base_age        = VALUES(base_age),
--     base_weight     = VALUES(base_weight),
--     base_amount     = VALUES(base_amount),
--     plan_age        = VALUES(plan_age),
--     plan_weight     = VALUES(plan_weight),
--     plan_amount     = VALUES(plan_amount),
--     current_stock   = VALUES(current_stock),
--     etc_sales       = VALUES(etc_sales),
--     etc_mill_roll   = VALUES(etc_mill_roll),
--     etc_out         = VALUES(etc_out),
--
--     -- ★ B안: SAP 새 값으로 리셋 (다른 필드에 종속되는 값)
--     out_sales_adj     = VALUES(out_sales_adj),      -- 매출(수정) ← SAP 매출값
--     out_mill_roll_adj = VALUES(out_mill_roll_adj),   -- 밀롤(수정) ← SAP 밀롤값
--     out_etc_adj       = VALUES(out_etc_adj),         -- 기타출고(수정) ← SAP 기타출고값
--
--     -- ★ A안: 폐기는 사용자 입력값 유지 (UPDATE 하지 않음)
--     -- out_disposal 는 UPDATE 대상에서 제외
--
--     -- ★ 기준일자 갱신 + 확정 리셋
--     ref_date        = CURDATE(),
--     confirmed_yn    = 'N',
--     confirmed_by    = NULL,
--     confirmed_dt    = NULL,
--     last_sync_dt    = NOW()
-- ;


-- ============================================================
-- 사용자 저장 버튼 클릭 시 실행할 쿼리
-- → 수정 가능한 4개 필드 UPDATE + 확정 처리
-- ============================================================
-- UPDATE ps_obsolete_inventory
-- SET
--     out_sales_adj     = #{outSalesAdj},
--     out_mill_roll_adj = #{outMillRollAdj},
--     out_disposal      = #{outDisposal},
--     out_etc_adj       = #{outEtcAdj},
--     confirmed_yn      = 'Y',
--     confirmed_by      = #{userId},
--     confirmed_dt      = NOW(),
--     updated_by        = #{userId}
-- WHERE plant_code    = #{plantCode}
--   AND material_code = #{materialCode}
-- ;


-- ============================================================
-- 조회 쿼리 (화면 로드 시)
-- ============================================================
-- SELECT *,
--        ref_date,
--        confirmed_yn
-- FROM   ps_obsolete_inventory
-- WHERE  use_yn = 'Y'
-- ORDER BY plant_code, material_code;


-- ============================================================
-- 샘플 데이터 (테스트용)
-- ============================================================
INSERT INTO ps_obsolete_inventory (
    plant_code, material_code, ref_date,
    base_age, base_weight, base_amount,
    plan_age, plan_weight, plan_amount,
    current_stock,
    out_sales_adj, out_mill_roll_adj, out_disposal, out_etc_adj,
    etc_sales, etc_mill_roll, etc_out, etc_out_apply,
    confirmed_yn,
    last_sync_dt, created_by
) VALUES
-- 1) 확정 자재
(   'PS10', 'F3SM1280-08251120B', CURDATE(),
    3, 12.50, 48.20,
    2, 8.30, 32.10,
    4200.00,
    1200.00, 600.00, 0.00, 0.00,
    1200.00, 600.00, 150.00, '반영',
    'Y',
    NOW(), 'admin'),
-- 2) 미확정 자재 — 소진율 낮음
(   'PS10', 'F3SM2150-10120930A', CURDATE(),
    5, 25.00, 96.50,
    1, 5.00, 18.70,
    8500.00,
    3.50, 1.20, 0.00, 0.00,
    3.50, 1.20, 0.00, NULL,
    'N',
    NOW(), 'admin'),
-- 3) 확정 자재 — 중간 소진율
(   'PS10', 'H2RL1120-05180740C', CURDATE(),
    4, 18.30, 72.40,
    3, 12.00, 45.60,
    3100.00,
    15.00, 8.50, 2.00, 1.00,
    15.00, 8.50, 200.00, '반영',
    'Y',
    NOW(), 'admin'),
-- 4) 미확정 자재 — 아직 출고 없음
(   'PS20', 'S1PB2250-12050320D', CURDATE(),
    1, 6.80, 24.10,
    1, 3.20, 11.90,
    1200.00,
    0.00, 0.00, 0.00, 0.00,
    0.00, 0.00, 0.00, NULL,
    'N',
    NOW(), 'admin'),
-- 5) 확정 자재 — 거의 완료
(   'PS20', 'H4ST1150-07091050E', CURDATE(),
    6, 32.00, 128.50,
    2, 10.00, 38.00,
    950.00,
    28.00, 12.00, 1.50, 0.50,
    28.00, 12.00, 80.00, '반영',
    'Y',
    NOW(), 'admin'),
-- 6) 미확정 자재 — 기타출고 음수 케이스
(   'PS20', 'F2AR2080-03150620F', CURDATE(),
    7, 38.00, 145.00,
    3, 12.00, 42.50,
    10.00,
    2.00, 1.00, 0.50, 0.00,
    2.00, 1.00, 0.00, NULL,
    'N',
    NOW(), 'admin'),
-- 7) 미확정 자재 — 내수 상품
(   'PS10', 'S1GD1180-09080450G', CURDATE(),
    2, 9.50, 35.80,
    1, 4.20, 15.60,
    2800.00,
    5.00, 2.50, 0.00, 0.00,
    5.00, 2.50, 0.00, NULL,
    'N',
    NOW(), 'admin');
