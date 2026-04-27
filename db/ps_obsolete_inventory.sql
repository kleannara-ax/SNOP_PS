-- ============================================================
-- PS S&OP 계획 시스템 — 진부화재고 리스트 테이블
-- DB: MariaDB
-- Created: 2026-04-24
-- Updated: 2026-04-24
-- ============================================================
-- 데이터 관리 방식:
--   - 자재당 항상 최신 1건만 유지 (날짜별 이력 없음)
--   - SAP 인터페이스 (매일 07:00): SAP 연동 필드만 UPDATE, 사용자 수정값 유지
--   - 사용자 저장 버튼 클릭: 수정 4개 필드만 UPDATE
-- ============================================================

-- 진부화재고 리스트 메인 테이블
CREATE TABLE IF NOT EXISTS ps_obsolete_inventory (
    -- PK
    obsolete_id         BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '진부화재고 ID (PK)',

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
    out_sales_adj       DECIMAL(15,2)   DEFAULT 0.00             COMMENT '매출(수정) - SAP 매출값 초기복사, 사용자 수정 가능',
    out_mill_roll_adj   DECIMAL(15,2)   DEFAULT 0.00             COMMENT '밀롤(수정) - SAP 밀롤값 초기복사, 사용자 수정 가능',
    out_disposal        DECIMAL(15,2)   DEFAULT 0.00             COMMENT '폐기 - 사용자 직접 입력',
    out_etc_adj         DECIMAL(15,2)   DEFAULT 0.00             COMMENT '기타출고(수정) - 사용자 직접 입력',

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
    KEY idx_obsolete_plant      (plant_code),
    KEY idx_obsolete_material   (material_code),
    KEY idx_obsolete_complete   (complete_yn)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='PS S&OP 진부화재고 리스트 (자재당 최신 1건 유지)';


-- ============================================================
-- SAP 인터페이스 호출 시 실행할 쿼리 (매일 07:00)
-- → SAP 연동 필드만 UPDATE, 사용자 수정 필드(4개)는 그대로 유지
-- → 신규 자재는 INSERT, 기존 자재는 SAP 필드만 UPDATE
-- ============================================================
-- INSERT INTO ps_obsolete_inventory (
--     plant_code, material_code,
--     base_age, base_weight, base_amount,
--     plan_age, plan_weight, plan_amount,
--     current_stock,
--     etc_sales, etc_mill_roll,
--     out_sales_adj, out_mill_roll_adj,
--     last_sync_dt, created_by
-- ) VALUES (
--     #{plantCode}, #{materialCode},
--     #{baseAge}, #{baseWeight}, #{baseAmount},
--     #{planAge}, #{planWeight}, #{planAmount},
--     #{currentStock},
--     #{etcSales}, #{etcMillRoll},
--     #{etcSales}, #{etcMillRoll},          -- 최초 INSERT 시 SAP 값으로 초기 세팅
--     NOW(), 'SAP_INTERFACE'
-- )
-- ON DUPLICATE KEY UPDATE
--     -- SAP 연동 필드만 업데이트
--     base_age        = VALUES(base_age),
--     base_weight     = VALUES(base_weight),
--     base_amount     = VALUES(base_amount),
--     plan_age        = VALUES(plan_age),
--     plan_weight     = VALUES(plan_weight),
--     plan_amount     = VALUES(plan_amount),
--     current_stock   = VALUES(current_stock),
--     etc_sales       = VALUES(etc_sales),
--     etc_mill_roll   = VALUES(etc_mill_roll),
--     last_sync_dt    = NOW()
--     -- ★ out_sales_adj, out_mill_roll_adj, out_disposal, out_etc_adj 는 UPDATE 하지 않음
--     -- → 사용자가 마지막으로 저장한 값이 유지됨
-- ;


-- ============================================================
-- 사용자 저장 버튼 클릭 시 실행할 쿼리
-- → 수정 가능한 4개 필드만 UPDATE
-- ============================================================
-- UPDATE ps_obsolete_inventory
-- SET
--     out_sales_adj     = #{outSalesAdj},
--     out_mill_roll_adj = #{outMillRollAdj},
--     out_disposal      = #{outDisposal},
--     out_etc_adj       = #{outEtcAdj},
--     updated_by        = #{userId},
--     updated_dt        = NOW()
-- WHERE plant_code    = #{plantCode}
--   AND material_code = #{materialCode}
-- ;


-- ============================================================
-- 샘플 데이터 (테스트용 5건)
-- ============================================================
INSERT INTO ps_obsolete_inventory (
    plant_code, material_code,
    base_age, base_weight, base_amount,
    plan_age, plan_weight, plan_amount,
    current_stock,
    out_sales_adj, out_mill_roll_adj, out_disposal, out_etc_adj,
    etc_sales, etc_mill_roll, etc_out, etc_out_apply,
    last_sync_dt, created_by
) VALUES
-- 1) 완료 자재
(   'PS10', 'RM-2024-00451',
    3, 12.50, 48.20,
    2, 8.30, 32.10,
    4200.00,
    1200.00, 600.00, 0.00, 0.00,
    1200.00, 600.00, 150.00, '반영',
    NOW(), 'admin'),
-- 2) 진행중 자재 — 소진율 낮음
(   'PS10', 'RM-2024-00782',
    5, 25.00, 96.50,
    1, 5.00, 18.70,
    8500.00,
    3.50, 1.20, 0.00, 0.00,
    3.50, 1.20, 0.00, NULL,
    NOW(), 'admin'),
-- 3) 진행중 자재 — 중간 소진율
(   'PS10', 'RM-2023-01205',
    4, 18.30, 72.40,
    3, 12.00, 45.60,
    3100.00,
    15.00, 8.50, 2.00, 1.00,
    15.00, 8.50, 200.00, '반영',
    NOW(), 'admin'),
-- 4) 신규 자재 — 아직 출고 없음
(   'PS20', 'RM-2025-00033',
    1, 6.80, 24.10,
    1, 3.20, 11.90,
    1200.00,
    0.00, 0.00, 0.00, 0.00,
    0.00, 0.00, 0.00, NULL,
    NOW(), 'admin'),
-- 5) 거의 완료 자재
(   'PS20', 'RM-2023-00891',
    6, 32.00, 128.50,
    2, 10.00, 38.00,
    950.00,
    28.00, 12.00, 1.50, 0.50,
    28.00, 12.00, 80.00, '반영',
    NOW(), 'admin');

-- → 자동계산 결과 예시 (1번 자재):
--   total_age=5, total_weight=20.80, total_amount=80.30
--   out_total=1800.00, expected_remain=-1779.20
--   consume_rate=8653.85%, complete_yn='완료'
