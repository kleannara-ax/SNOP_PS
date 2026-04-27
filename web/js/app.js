'use strict';

/* ══════════════════════════════════════════════
   PS S&OP 계획 시스템 — 프론트엔드 앱
   ══════════════════════════════════════════════ */

/* ── 상태 ── */
const state = {
    activeView: 'summary',
    activePlannerSub: 'obsolete-status',
    activeHistoryTab: 'production',
    hasUnsavedChanges: false,   // 미저장 변경사항 여부
};

/* ── DOM 캐시 ── */
const dom = {
    viewTabs: document.getElementById('view-tabs'),
    viewTabButtons: Array.from(document.querySelectorAll('.view-tab')),
    viewSections: Array.from(document.querySelectorAll('.view-section')),
    plannerSubTabs: document.getElementById('planner-sub-tabs'),
    plannerSubTabButtons: Array.from(document.querySelectorAll('.planner-sub-tab')),
    plannerSubSections: Array.from(document.querySelectorAll('.planner-sub-section')),
    historyTabs: Array.from(document.querySelectorAll('.history-tab')),
    historyPanels: Array.from(document.querySelectorAll('[data-history-panel]')),
    userNameDisplay: document.getElementById('user-name-display'),
};

/* ══════════════════════════════════════════════
   메인 탭 전환
   ══════════════════════════════════════════════ */
function switchView(viewName) {
    state.activeView = viewName;

    /* 탭 버튼 활성 상태 */
    dom.viewTabButtons.forEach((btn) => {
        const isActive = btn.dataset.view === viewName;
        btn.classList.toggle('active', isActive);
    });

    /* 섹션 표시/숨김 */
    dom.viewSections.forEach((section) => {
        const sectionId = section.id.replace('view-', '');
        const isActive = sectionId === viewName;
        section.style.display = isActive ? '' : 'none';
        section.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    /* 기준정보 관리 탭이면 서브탭 바를 연결된 스타일로 표시 */
    const viewTabsEl = dom.viewTabs;
    const plannerSubTabsEl = dom.plannerSubTabs;
    if (viewName === 'planner') {
        viewTabsEl.classList.add('has-sub-tabs');
        if (plannerSubTabsEl) plannerSubTabsEl.style.display = '';
    } else {
        viewTabsEl.classList.remove('has-sub-tabs');
        if (plannerSubTabsEl) plannerSubTabsEl.style.display = 'none';
    }

    /* URL 해시 업데이트 */
    if (history.replaceState) {
        history.replaceState(null, '', `#${viewName}`);
    }
}

/* ══════════════════════════════════════════════
   기준정보 관리 서브탭 전환
   ══════════════════════════════════════════════ */
function switchPlannerSubTab(subName) {
    state.activePlannerSub = subName;

    dom.plannerSubTabButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.sub === subName);
    });

    dom.plannerSubSections.forEach((section) => {
        const isActive = section.dataset.subPanel === subName;
        section.classList.toggle('active', isActive);
    });
}

/* ══════════════════════════════════════════════
   변경 이력 탭 전환
   ══════════════════════════════════════════════ */
function switchHistoryTab(tabName) {
    state.activeHistoryTab = tabName;

    dom.historyTabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.history === tabName);
    });

    dom.historyPanels.forEach((panel) => {
        const isActive = panel.dataset.historyPanel === tabName;
        panel.style.display = isActive ? '' : 'none';
    });
}

/* ══════════════════════════════════════════════
   이벤트 바인딩
   ══════════════════════════════════════════════ */
function bindEvents() {
    /* 메인 탭 클릭 */
    dom.viewTabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });

    /* 기준정보 서브탭 클릭 */
    dom.plannerSubTabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            switchPlannerSubTab(btn.dataset.sub);
        });
    });

    /* 변경이력 탭 클릭 */
    dom.historyTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            switchHistoryTab(tab.dataset.history);
        });
    });

    /* URL 해시 변경 감지 */
    window.addEventListener('hashchange', () => {
        const hash = location.hash.replace('#', '');
        if (hash && dom.viewTabButtons.some((btn) => btn.dataset.view === hash)) {
            switchView(hash);
        }
    });

    /* 키보드 네비게이션 (좌우 화살표) */
    if (dom.viewTabs) {
        dom.viewTabs.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const currentIndex = dom.viewTabButtons.findIndex((btn) => btn.classList.contains('active'));
            if (currentIndex === -1) return;
            const direction = e.key === 'ArrowRight' ? 1 : -1;
            const nextIndex = (currentIndex + direction + dom.viewTabButtons.length) % dom.viewTabButtons.length;
            const nextBtn = dom.viewTabButtons[nextIndex];
            nextBtn.focus();
            switchView(nextBtn.dataset.view);
        });
    }
}

/* ══════════════════════════════════════════════
   세션 정보 표시
   ══════════════════════════════════════════════ */
function displayUserInfo() {
    const userName = sessionStorage.getItem('loginUserName');
    if (userName && dom.userNameDisplay) {
        dom.userNameDisplay.textContent = userName;
    }
}

/* ══════════════════════════════════════════════
   초기화
   ══════════════════════════════════════════════ */
function init() {
    displayUserInfo();
    bindEvents();

    /* URL 해시에서 초기 탭 결정 */
    const hash = location.hash.replace('#', '');
    if (hash && dom.viewTabButtons.some((btn) => btn.dataset.view === hash)) {
        switchView(hash);
    } else {
        switchView('summary');
    }

    /* 기준정보 서브탭 초기 상태 */
    if (dom.plannerSubTabs) {
        dom.plannerSubTabs.style.display = 'none';
    }

    /* 시스템 일자 표시 */
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = yyyy + '-' + mm + '-' + dd;

    const dateEl = document.getElementById('obsolete-list-date');
    if (dateEl) dateEl.textContent = dateStr;

    const statusDateEl = document.getElementById('obsolete-status-date');
    if (statusDateEl) statusDateEl.textContent = dateStr;

    /* 편집 가능 셀 이벤트 바인딩 (input/blur 리스너) */
    bindEditableCells();

    /* 저장 버튼 바인딩 */
    bindSaveButton();

    /* 미저장 경고 바인딩 */
    bindUnsavedWarning();

    /* 서버에서 저장된 데이터 복원 → 완료 후 행 자동 계산 → 현황 테이블 연동 */
    loadSavedDataFromServer().then(() => {
        /* 모든 행 초기 자동 계산 (출고계, 예상잔량, 소진율, 완료여부) */
        initCalcAllRows();

        /* 자동 계산 완료 후 origin 동기화 — recalcRow()가 기타출고(수정) 등
           자동 계산한 값을 새 origin으로 설정하여 false modified 방지 */
        syncOriginsAfterCalc();

        /* 진부화재고 현황 — 자재코드 기반 자동 판별 (내수/수출, 롤/시트/상품)
           ※ 반드시 initCalcAllRows() 이후 호출 — 출고계 등 계산된 값을 읽어야 함 */
        classifyByMaterialCode();

        /* 진부화재고 현황 조건 필터 바인딩 */
        bindStatusFilters();

        /* 진부화재고 현황 엑셀 다운로드 버튼 바인딩 */
        bindExportStatusButton();

        console.log('PS S&OP 계획 시스템 초기화 완료');
    });
}

/* ══════════════════════════════════════════════
   편집 가능 셀 이벤트
   ══════════════════════════════════════════════ */
function bindEditableCells() {
    /* 원본 data-origin 값을 숫자 기준으로 정규화 (콤마 제거 후 재포맷)
       ※ HTML 하드코딩 값 → 정규화 → 서버 데이터 로드(loadSavedDataFromServer)가 덮어씀 */
    document.querySelectorAll('.out-field').forEach((input) => {
        const rawVal = (input.value || '').trim();
        /* 빈칸은 빈칸 그대로 유지 (기타출고(수정) 등 자동계산 필드) */
        if (rawVal === '') {
            input.value = '';
            input.dataset.origin = '';
        } else {
            const numVal = parseNumber(rawVal);
            const formatted = formatNumber(numVal);
            input.value = formatted;
            input.dataset.origin = formatted;
        }
    });

    /* 원본 대비 수정 표시 + 출고계 자동 합산 */
    document.querySelectorAll('.out-field').forEach((input) => {
        input.addEventListener('input', () => {
            /* 행 자동 재계산 */
            const row = input.closest('tr');
            if (row) recalcRow(row);

            /* 리스트 테이블 변경 시 현황 테이블도 동기화 */
            syncStatusFromList();

            /* 수정 여부 표시 — 숫자값 기준 비교 (포맷 차이 무시) */
            checkFieldModified(input);

            /* 미저장 상태 갱신 */
            checkUnsavedState();
        });

        /* 포커스 아웃 시 숫자 포맷 정리 + 수정 여부 재확인 */
        input.addEventListener('blur', () => {
            const val = parseNumber(input.value);
            input.value = formatNumber(val);

            /* 포맷 정리 후 수정 여부 다시 확인 */
            checkFieldModified(input);
            checkUnsavedState();
        });
    });
}

/* 개별 필드 수정 여부 확인 — 숫자값 기준 비교 */
function checkFieldModified(input) {
    const currentNum = parseNumber(input.value);
    const originNum = parseNumber(input.dataset.origin);
    if (currentNum !== originNum) {
        input.classList.add('modified');
        input.title = '원본(SAP): ' + (input.dataset.origin || '0');
    } else {
        input.classList.remove('modified');
        input.title = '';
    }
}

/* ══════════════════════════════════════════════
   숫자 포맷 유틸
   ══════════════════════════════════════════════ */
function formatNumber(num) {
    if (num === 0) return '0';
    /* 소수점이 있으면 소수점 유지, 없으면 정수 */
    if (Number.isInteger(num)) {
        return num.toLocaleString('ko-KR');
    }
    /* 소수점 이하 불필요한 0 제거 */
    const fixed = parseFloat(num.toFixed(2));
    return fixed.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function parseNumber(str) {
    if (!str || str === '-') return 0;
    return parseFloat(String(str).replace(/,/g, '')) || 0;
}

/* ══════════════════════════════════════════════
   모든 행 초기 자동 계산
   ══════════════════════════════════════════════ */
function initCalcAllRows() {
    const rows = document.querySelectorAll('#obsolete-list-tbody tr');
    rows.forEach((row) => {
        recalcRow(row);
    });
}

/**
 * initCalcAllRows() 실행 후 모든 out-field의 origin을 현재 값으로 재설정
 * → recalcRow()가 기타출고(수정) 등 자동 계산한 값이 origin과 일치하도록 보장
 * → 페이지 로드 직후 false "modified" 상태 방지
 */
function syncOriginsAfterCalc() {
    document.querySelectorAll('#obsolete-list-tbody .out-field').forEach((input) => {
        const val = (input.value || '').trim();
        input.dataset.origin = val;
        input.classList.remove('modified');
        input.title = '';
    });
    state.hasUnsavedChanges = false;
    const saveBtn = document.getElementById('btn-save-obsolete-list');
    if (saveBtn) saveBtn.disabled = true;
}

/* ══════════════════════════════════════════════
   행 자동 계산: 출고계, 예상잔량, 소진율, 완료여부
   ══════════════════════════════════════════════ */
function recalcRow(row) {

    /* 출고계 = 매출(수정) + 밀롤(수정) + 폐기 + 기타출고(수정) */
    const fields = row.querySelectorAll('.out-field');
    let outTotal = 0;
    fields.forEach((f) => {
        outTotal += parseNumber(f.value);
    });

    const totalCell = row.querySelector('.out-total-cell');
    if (totalCell) {
        totalCell.textContent = formatNumber(outTotal);
    }

    /* 예상잔량 = 합계 중량(톤) - 출고계 */
    const weightCell = row.querySelector('.total-weight-cell');
    const remainCell = row.querySelector('.expected-remain-cell');
    const totalWeight = weightCell ? parseNumber(weightCell.textContent) : 0;

    if (remainCell) {
        const remain = totalWeight - outTotal;
        remainCell.textContent = formatNumber(remain);
        if (remain < 0) {
            remainCell.style.color = '#dc2626';
            remainCell.style.fontWeight = '600';
        } else {
            remainCell.style.color = '';
            remainCell.style.fontWeight = '';
        }
    }

    /* 소진율 = (출고계 / 합계 중량톤) x 100 */
    const rateCell = row.querySelector('.consume-rate-cell');
    let rate = 0;
    if (rateCell) {
        if (totalWeight === 0) {
            rateCell.textContent = '0%';
            rate = 0;
        } else {
            rate = (outTotal / totalWeight) * 100;
            rateCell.textContent = rate.toFixed(2) + '%';
        }
    }

    /* 완료여부 */
    const completeCell = row.querySelector('.complete-yn-cell');
    if (completeCell) {
        if (rate >= 100) {
            completeCell.textContent = '완료';
            completeCell.style.color = '#059669';
            completeCell.style.fontWeight = '600';
        } else {
            completeCell.textContent = '진행중';
            completeCell.style.color = '#f59e0b';
            completeCell.style.fontWeight = '600';
        }
    }

    /* ── 기타출고 = 현재고 - 예상잔량 (기타출고(수정) 반영 전 기준) ──
       기타출고(수정) 필드를 제외한 출고계로 예상잔량을 먼저 구한 뒤
       기타출고를 판정하고, 음수면 반영·수정 필드에 양수 자동입력 후 최종 재계산 */
    const currentStockCell = row.querySelector('.current-stock-cell');
    const etcOutCell = row.querySelector('.etc-out-cell');
    const etcOutReflectCell = row.querySelector('.etc-out-reflect-cell');
    const etcAdjField = fields[3]; /* 4번째 out-field = 기타출고(수정) */

    if (currentStockCell && etcOutCell) {
        const currentStock = parseNumber(currentStockCell.textContent);

        /* 기타출고(수정)을 제외한 나머지 3개 필드 합산 */
        let baseOutTotal = 0;
        for (let i = 0; i < 3; i++) {
            baseOutTotal += parseNumber(fields[i].value);
        }

        /* 기타출고(수정) 제외 기준 예상잔량 */
        const baseRemain = totalWeight - baseOutTotal;
        /* 기타출고 = 현재고 - 예상잔량(기타출고수정 제외) */
        const etcOut = currentStock - baseRemain;
        etcOutCell.textContent = formatNumber(etcOut);

        if (etcOut < 0) {
            /* ── 기타출고 음수 ──
               반영 필드: 양수로 변환 표시
               기타출고(수정): 양수값 자동 입력 */
            const positiveVal = Math.abs(etcOut);

            if (etcOutReflectCell) {
                etcOutReflectCell.textContent = formatNumber(positiveVal);
                etcOutReflectCell.style.color = '#2563eb';
                etcOutReflectCell.style.fontWeight = '600';
            }

            if (etcAdjField) {
                etcAdjField.value = formatNumber(positiveVal);
                checkFieldModified(etcAdjField);
            }

            /* 기타출고(수정) 포함한 최종 출고계·예상잔량·소진율·완료여부 재계산 */
            const finalOutTotal = baseOutTotal + positiveVal;
            if (totalCell) totalCell.textContent = formatNumber(finalOutTotal);

            const finalRemain = totalWeight - finalOutTotal;
            if (remainCell) {
                remainCell.textContent = formatNumber(finalRemain);
                remainCell.style.color      = finalRemain < 0 ? '#dc2626' : '';
                remainCell.style.fontWeight  = finalRemain < 0 ? '600' : '';
            }

            let finalRate = 0;
            if (totalWeight !== 0) finalRate = (finalOutTotal / totalWeight) * 100;
            if (rateCell) rateCell.textContent = finalRate.toFixed(2) + '%';
            if (completeCell) {
                completeCell.textContent = finalRate >= 100 ? '완료' : '진행중';
                completeCell.style.color = finalRate >= 100 ? '#059669' : '#f59e0b';
                completeCell.style.fontWeight = '600';
            }
        } else {
            /* ── 기타출고 양수 또는 0 ── 반영·수정 필드 빈칸 */
            if (etcOutReflectCell) {
                etcOutReflectCell.textContent = '';
                etcOutReflectCell.style.color = '';
                etcOutReflectCell.style.fontWeight = '';
            }
            if (etcAdjField) {
                etcAdjField.value = '';
                checkFieldModified(etcAdjField);
            }
        }
    }
}

/* ══════════════════════════════════════════════
   저장 기능 — 진부화재고 리스트
   ══════════════════════════════════════════════ */

/* 미저장 상태 확인 — 하나라도 modified 클래스가 있으면 미저장 */
function checkUnsavedState() {
    const hasModified = document.querySelectorAll('#obsolete-list-tbody .out-field.modified').length > 0;
    state.hasUnsavedChanges = hasModified;

    const saveBtn = document.getElementById('btn-save-obsolete-list');
    const statusEl = document.getElementById('save-status');

    if (hasModified) {
        if (saveBtn) saveBtn.disabled = false;
        if (statusEl) {
            statusEl.textContent = '수정된 내용이 있습니다';
            statusEl.className = 'save-status unsaved';
        }
    } else {
        if (saveBtn) saveBtn.disabled = true;
        if (statusEl && statusEl.classList.contains('unsaved')) {
            statusEl.textContent = '';
            statusEl.className = 'save-status';
        }
    }
}

/* 수정된 데이터 수집 — 변경된 행만 수집 */
function collectEditedData() {
    const rows = document.querySelectorAll('#obsolete-list-tbody tr');
    const data = [];

    rows.forEach((row) => {
        /* 해당 행에 수정된 필드가 있는지 확인 */
        const modifiedFields = row.querySelectorAll('.out-field.modified');
        if (modifiedFields.length === 0) return;

        const plantCode = row.dataset.plant || row.querySelector('.freeze-col-1')?.textContent.trim();
        const materialCode = row.dataset.material || row.querySelector('.freeze-col-2')?.textContent.trim();
        if (!plantCode || !materialCode) return;

        const outFields = row.querySelectorAll('.out-field');
        if (outFields.length < 4) return;

        data.push({
            plant_code: plantCode,
            material_code: materialCode,
            out_sales_adj: parseNumber(outFields[0].value),
            out_mill_roll_adj: parseNumber(outFields[1].value),
            out_disposal: parseNumber(outFields[2].value),
            out_etc_adj: parseNumber(outFields[3].value),
        });
    });

    return data;
}

/* 저장 처리 */
function saveObsoleteList() {
    const saveBtn = document.getElementById('btn-save-obsolete-list');
    const statusEl = document.getElementById('save-status');

    if (!state.hasUnsavedChanges) return;

    /* 데이터 수집 */
    const editedData = collectEditedData();
    if (editedData.length === 0) {
        if (statusEl) {
            statusEl.textContent = '변경된 데이터가 없습니다';
            statusEl.className = 'save-status';
        }
        return;
    }

    /* 저장 중 상태 */
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '저장 중...';
    }
    if (statusEl) {
        statusEl.textContent = '저장 중...';
        statusEl.className = 'save-status saving';
    }

    console.log('[SAVE] 수정된 데이터 (' + editedData.length + '건):', JSON.stringify(editedData, null, 2));

    /* 백엔드 API 호출 — 서버 측 영속 저장 */
    fetch('/api/obsolete-inventory/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            items: editedData,
            updated_by: sessionStorage.getItem('loginUserId') || 'admin',
        }),
    })
    .then(function (res) {
        if (!res.ok) throw new Error('서버 오류: ' + res.status);
        return res.json();
    })
    .then(function (result) {
        if (result.success) {
            onSaveSuccess(editedData.length);
        } else {
            onSaveError(new Error(result.error || '알 수 없는 오류'));
        }
    })
    .catch(function (err) {
        onSaveError(err);
    });
}

/* 저장 성공 처리 */
function onSaveSuccess(savedCount) {
    const saveBtn = document.getElementById('btn-save-obsolete-list');
    const statusEl = document.getElementById('save-status');

    /* origin 값 갱신 — 현재 값을 그대로 새 원본으로 설정
       ※ 빈칸 필드(기타출고 수정 등)는 빈칸 그대로 유지 */
    document.querySelectorAll('#obsolete-list-tbody .out-field').forEach((input) => {
        const rawVal = (input.value || '').trim();
        if (rawVal === '') {
            input.value = '';
            input.dataset.origin = '';
        } else {
            const currentVal = parseNumber(input.value);
            const formatted = formatNumber(currentVal);
            input.value = formatted;
            input.dataset.origin = formatted;
        }
        input.classList.remove('modified');
        input.title = '';
    });

    state.hasUnsavedChanges = false;

    if (saveBtn) {
        saveBtn.textContent = '저장';
        saveBtn.disabled = true;
    }
    if (statusEl) {
        const msg = savedCount ? savedCount + '건 저장 완료' : '저장 완료';
        statusEl.textContent = msg;
        statusEl.className = 'save-status saved';
        setTimeout(() => {
            if (!state.hasUnsavedChanges) {
                statusEl.textContent = '';
                statusEl.className = 'save-status';
            }
        }, 3000);
    }

    console.log('[SAVE] 저장 완료 (' + (savedCount || 0) + '건)');
}

/* 저장 실패 처리 */
function onSaveError(err) {
    const saveBtn = document.getElementById('btn-save-obsolete-list');
    const statusEl = document.getElementById('save-status');

    if (saveBtn) {
        saveBtn.textContent = '저장';
        saveBtn.disabled = false;
    }
    if (statusEl) {
        statusEl.textContent = '저장 실패 — 다시 시도해주세요';
        statusEl.className = 'save-status error';
    }

    console.error('[SAVE] 저장 실패:', err);
}

/* 저장 버튼 바인딩 */
function bindSaveButton() {
    const saveBtn = document.getElementById('btn-save-obsolete-list');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveObsoleteList);
    }
}

/* 페이지 이탈 시 미저장 경고 */
function bindUnsavedWarning() {
    window.addEventListener('beforeunload', (e) => {
        if (state.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '저장하지 않은 변경사항이 있습니다. 페이지를 떠나시겠습니까?';
            return e.returnValue;
        }
    });
}

/* ══════════════════════════════════════════════
   서버 API 기반 영속 저장
   — 저장 버튼: POST /api/obsolete-inventory/save
   — 페이지 로드: GET /api/obsolete-inventory/load
   ══════════════════════════════════════════════ */

/**
 * 페이지 로드 시 서버에서 저장된 수정값을 조회하여 테이블에 반영
 * @returns {Promise<void>}
 */
function loadSavedDataFromServer() {
    return fetch('/api/obsolete-inventory/load')
        .then(function (res) {
            if (!res.ok) throw new Error('서버 조회 실패: ' + res.status);
            return res.json();
        })
        .then(function (result) {
            if (!result.success || !result.data) return;

            var savedData = result.data;
            var rows = document.querySelectorAll('#obsolete-list-tbody tr');
            var restoredCount = 0;

            rows.forEach(function (row) {
                var key = (row.dataset.plant || '') + '::' + (row.dataset.material || '');
                var data = savedData[key];
                if (!data) return;

                var outFields = row.querySelectorAll('.out-field');
                if (outFields.length < 4) return;

                /* 서버에서 받은 값으로 input value + data-origin 모두 갱신
                   ※ 기타출고(수정) (outFields[3])은 recalcRow()가 자동 계산하므로
                     서버 값 복원은 매출·밀롤·폐기 3개만 수행
                     → initCalcAllRows() 후 syncOriginsAfterCalc()에서 origin 재설정 */
                outFields[0].value = formatNumber(data.out_sales_adj     || 0);
                outFields[1].value = formatNumber(data.out_mill_roll_adj || 0);
                outFields[2].value = formatNumber(data.out_disposal      || 0);
                /* outFields[3] (기타출고 수정)은 recalcRow가 자동 결정 — 복원 스킵 */

                /* origin도 서버 값으로 세팅 (수정 전 기준값) */
                outFields[0].dataset.origin = outFields[0].value;
                outFields[1].dataset.origin = outFields[1].value;
                outFields[2].dataset.origin = outFields[2].value;
                /* outFields[3] origin은 syncOriginsAfterCalc()에서 설정 */

                restoredCount++;
            });

            if (restoredCount > 0) {
                console.log('[API] 서버에서 ' + restoredCount + '건 복원 완료');
            }
        })
        .catch(function (err) {
            console.warn('[API] 저장된 데이터 조회 실패 (기본값 사용):', err.message);
        });
}

/* ══════════════════════════════════════════════
   진부화재고 현황 — 자재코드 기반 자동 판별
   • 내수/수출: 5번째 글자(인덱스 4) = '2' → 수출, 그 외 → 내수
   • 롤/시트/상품: 1번째 글자 = 'F' → 시트, 'H' → 롤, 'S' → 상품
   • 상품/제품: 1번째 글자 = 'F','H' → 제품, 'S' → 상품
   ══════════════════════════════════════════════ */
function classifyByMaterialCode() {
    const formTypeMap    = { 'F': '시트', 'H': '롤', 'S': '상품' };
    const productTypeMap = { 'F': '제품', 'H': '제품', 'S': '상품' };

    const rows = document.querySelectorAll('#obsolete-status-tbody tr');
    rows.forEach((row) => {
        const codeCell        = row.querySelector('.material-code-cell');
        const exportCell      = row.querySelector('.domestic-export-cell');
        const formTypeCell    = row.querySelector('.form-type-cell');
        const productTypeCell = row.querySelector('.product-type-cell');
        if (!codeCell) return;

        const code = codeCell.textContent.trim();
        const firstChar = code.charAt(0).toUpperCase();

        /* 내수/수출: 5번째 글자 */
        if (exportCell) {
            const fifthChar = code.charAt(4);
            exportCell.textContent = (fifthChar === '2') ? '수출' : '내수';
        }

        /* 롤/시트/상품: 1번째 글자 */
        if (formTypeCell) {
            formTypeCell.textContent = formTypeMap[firstChar] || firstChar;
        }

        /* 상품/제품: 1번째 글자 */
        if (productTypeCell) {
            productTypeCell.textContent = productTypeMap[firstChar] || firstChar;
        }

        /* 지종: 3번째~5번째 글자 (인덱스 2~4, 3글자) */
        const paperTypeCell = row.querySelector('.paper-type-cell');
        if (paperTypeCell) {
            paperTypeCell.textContent = code.length >= 5 ? code.substring(2, 5) : '';
        }

        /* 평량: 6번째~8번째 글자 (인덱스 5~7, 3글자) → 숫자 변환 (선행0 제거) */
        const basisWeightCell = row.querySelector('.basis-weight-cell');
        if (basisWeightCell) {
            const rawWeight = code.length >= 8 ? code.substring(5, 8) : '';
            basisWeightCell.textContent = rawWeight ? parseInt(rawWeight, 10) : '';
        }

        /* 리스트 테이블에서 행 순서 매칭으로 값 가져오기 */
        const rowIndex = Array.from(row.parentElement.children).indexOf(row);
        const listRows = document.querySelectorAll('#obsolete-list-tbody tr');
        const listRow = listRows[rowIndex] || null;

        /* 진부화재고: 리스트 테이블의 합계 중량(톤) */
        const obsoleteStockCell = row.querySelector('.obsolete-stock-cell');
        if (obsoleteStockCell && listRow) {
            const weightCell = listRow.querySelector('.total-weight-cell');
            obsoleteStockCell.textContent = weightCell ? weightCell.textContent.trim() : '';
        }

        /* 출고계: 리스트 테이블의 출고계 */
        const statusOutTotalCell = row.querySelector('.status-out-total-cell');
        if (statusOutTotalCell && listRow) {
            const outTotalCell = listRow.querySelector('.out-total-cell');
            statusOutTotalCell.textContent = outTotalCell ? outTotalCell.textContent.trim() : '';
        }
    });

    /* 진부화재고·출고계 연동 후 예상잔량·소진율·완료여부까지 자동 갱신 */
    syncStatusFromList();
}

/* ══════════════════════════════════════════════
   진부화재고 현황 ← 리스트 동기화
   리스트 테이블 값 변경 시 현황 테이블의 출고계·진부화재고·예상잔량·소진율·완료여부 갱신
   ══════════════════════════════════════════════ */
function syncStatusFromList() {
    const statusRows = document.querySelectorAll('#obsolete-status-tbody tr');
    const listRows   = document.querySelectorAll('#obsolete-list-tbody tr');

    statusRows.forEach((sRow, idx) => {
        const listRow = listRows[idx] || null;
        if (!listRow) return;

        /* 진부화재고 = 리스트의 합계 중량(톤) */
        const obsoleteCell = sRow.querySelector('.obsolete-stock-cell');
        const weightCell   = listRow.querySelector('.total-weight-cell');
        if (obsoleteCell && weightCell) {
            obsoleteCell.textContent = weightCell.textContent.trim();
        }

        /* 출고계 = 리스트의 출고계 */
        const sOutTotal   = sRow.querySelector('.status-out-total-cell');
        const lOutTotal   = listRow.querySelector('.out-total-cell');
        if (sOutTotal && lOutTotal) {
            sOutTotal.textContent = lOutTotal.textContent.trim();
        }

        /* 예상잔량 = 리스트 테이블의 예상잔량 그대로 가져오기 */
        const lRemainCell = listRow.querySelector('.expected-remain-cell');
        const cells = sRow.querySelectorAll('td');
        if (cells.length >= 11 && lRemainCell) {
            const remain = parseNumber(lRemainCell.textContent);
            cells[8].textContent = lRemainCell.textContent.trim();
            cells[8].style.color      = remain < 0 ? '#dc2626' : '';
            cells[8].style.fontWeight  = remain < 0 ? '600' : '';

            /* 소진율 = (출고계 / 진부화재고) × 100 */
            const obsoleteVal = obsoleteCell ? parseNumber(obsoleteCell.textContent) : 0;
            const outTotalVal = sOutTotal    ? parseNumber(sOutTotal.textContent)    : 0;
            let rate = 0;
            if (obsoleteVal !== 0) {
                rate = (outTotalVal / obsoleteVal) * 100;
            }
            cells[9].textContent = rate.toFixed(2) + '%';

            /* 완료여부 */
            if (rate >= 100) {
                cells[10].innerHTML = '<span class="status-badge status-complete">완료</span>';
            } else {
                cells[10].innerHTML = '<span class="status-badge status-progress">진행중</span>';
            }
        }
    });
}

/* ══════════════════════════════════════════════
   진부화재고 현황 — 조건 필터
   ══════════════════════════════════════════════ */
function bindStatusFilters() {
    const filterDomestic = document.getElementById('filter-domestic-export');
    const filterForm     = document.getElementById('filter-form-type');
    const filterPaper    = document.getElementById('filter-paper-type');
    const filterWeight   = document.getElementById('filter-basis-weight');
    const resetBtn       = document.getElementById('btn-filter-reset');

    if (!filterDomestic) return; /* 현황 탭이 없으면 스킵 */

    /* 지종 필터 옵션을 테이블 데이터에서 동적 생성 */
    if (filterPaper) {
        const paperValues = new Set();
        document.querySelectorAll('#obsolete-status-tbody .paper-type-cell').forEach((cell) => {
            const val = cell.textContent.trim();
            if (val) paperValues.add(val);
        });
        Array.from(paperValues).sort().forEach((val) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            filterPaper.appendChild(opt);
        });
    }

    /* 평량 필터 옵션을 테이블 데이터에서 동적 생성 */
    if (filterWeight) {
        const weightValues = new Set();
        document.querySelectorAll('#obsolete-status-tbody .basis-weight-cell').forEach((cell) => {
            const val = cell.textContent.trim();
            if (val) weightValues.add(val);
        });
        Array.from(weightValues).sort((a, b) => Number(a) - Number(b)).forEach((val) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            filterWeight.appendChild(opt);
        });
    }

    const applyFilter = () => {
        const valDomestic = filterDomestic.value;
        const valForm     = filterForm.value;
        const valPaper    = filterPaper.value;
        const valWeight   = filterWeight.value;

        const rows = document.querySelectorAll('#obsolete-status-tbody tr');
        let visibleCount = 0;

        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 6) return;

            const rowDomestic = cells[1].textContent.trim();
            const rowForm     = cells[2].textContent.trim();
            const rowPaper    = cells[4].textContent.trim();
            const rowWeight   = cells[5].textContent.trim();

            const match =
                (!valDomestic || rowDomestic === valDomestic) &&
                (!valForm     || rowForm     === valForm) &&
                (!valPaper    || rowPaper    === valPaper) &&
                (!valWeight   || rowWeight   === valWeight);

            row.style.display = match ? '' : 'none';
            if (match) visibleCount++;
        });

        console.log('[FILTER] 필터 적용 — ' + visibleCount + '건 표시');
    };

    filterDomestic.addEventListener('change', applyFilter);
    filterForm.addEventListener('change', applyFilter);
    filterPaper.addEventListener('change', applyFilter);
    filterWeight.addEventListener('change', applyFilter);

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            filterDomestic.value = '';
            filterForm.value     = '';
            filterPaper.value    = '';
            filterWeight.value   = '';
            applyFilter();
        });
    }
}

/* ══════════════════════════════════════════════
   진부화재고 현황 — 엑셀 다운로드
   ══════════════════════════════════════════════ */
function exportStatusToExcel() {
    const table = document.getElementById('obsolete-status-table');
    if (!table) return;

    /* 헤더 */
    const headers = ['자재코드', '내수/수출', '롤/시트/상품', '상품/제품', '지종', '평량',
                     '진부화재고', '출고계', '예상잔량', '소진율', '완료여부'];

    /* 데이터 행 (필터로 숨겨진 행 제외) */
    const rows = document.querySelectorAll('#obsolete-status-tbody tr');
    const data = [headers];

    rows.forEach((row) => {
        if (row.style.display === 'none') return; /* 필터 숨김 행 제외 */
        const cells = row.querySelectorAll('td');
        if (cells.length < 11) return;

        const rowData = [];
        cells.forEach((cell, idx) => {
            let val = cell.textContent.trim();
            /* 숫자 컬럼 (평량, 진부화재고, 출고계, 예상잔량): 숫자로 변환 */
            if (idx >= 5 && idx <= 8) {
                const num = parseFloat(val.replace(/,/g, ''));
                rowData.push(isNaN(num) ? val : num);
            } else if (idx === 9) {
                /* 소진율: % 제거 후 숫자 */
                const num = parseFloat(val.replace(/%/g, '').replace(/,/g, ''));
                rowData.push(isNaN(num) ? val : num);
            } else {
                rowData.push(val);
            }
        });
        data.push(rowData);
    });

    /* SheetJS로 워크북 생성 */
    const ws = XLSX.utils.aoa_to_sheet(data);

    /* 컬럼 너비 자동 조정 */
    ws['!cols'] = headers.map((h, i) => {
        let maxLen = h.length;
        data.forEach((row) => {
            const cellLen = String(row[i] || '').length;
            if (cellLen > maxLen) maxLen = cellLen;
        });
        return { wch: Math.min(maxLen + 4, 30) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '진부화재고 현황');

    /* 파일명: 진부화재고현황_YYYY-MM-DD.xlsx */
    const now = new Date();
    const dateStr = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');
    XLSX.writeFile(wb, '진부화재고현황_' + dateStr + '.xlsx');

    console.log('[EXPORT] 진부화재고 현황 엑셀 다운로드 완료 (' + (data.length - 1) + '건)');
}

function bindExportStatusButton() {
    const btn = document.getElementById('btn-export-status-xlsx');
    if (btn) {
        btn.addEventListener('click', exportStatusToExcel);
    }
}

/* ── 앱 시작 ── */
document.addEventListener('DOMContentLoaded', init);
