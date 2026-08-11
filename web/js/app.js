'use strict';

/* ══════════════════════════════════════════════
   PS S&OP 계획 시스템 — 프론트엔드 앱
   ══════════════════════════════════════════════ */

/* ── 상태 ── */
const state = {
    activeView: 'summary',
    activePlannerSub: 'obsolete-status',
    activeTableSub: 'mill-roll',       // 재공실적 분석 서브탭 (밀롤창고/슬리터/카타/원지포장)
    activeIfSub: 'if-master',
    activeHistoryTab: 'production',
    openTabs: ['summary'],     // 열린 탭 목록
    hasUnsavedChanges: false,   // 미저장 변경사항 여부
    refDate: '',                // 기준일자 (서버에서 받은 값)
    confirmedYn: 'N',          // 확정 여부 (Y/N)
    confirmedBy: null,         // 확정자
    confirmedDt: null,         // 확정일시
    lastMasterSyncDt: null,    // 최종 기준정보 동기화 일시
    lastMasterSyncBy: null,    // 최종 기준정보 동기화 실행자
};

/* ── 뷰 이름 → 라벨 매핑 ── */
const VIEW_LABELS = {
    'summary': '통합 계획 요약',
    'planner': '진부화재고',
    'sales-upload': '재공 예측',
    'table': '재공실적 분석',
    'line-capa': '생산계획 현황',
    'dashboard': '재고 예측',
    'analytics': '재고현황',
    'optimal-inventory': '폐품',
    'change-history': '변경 이력 관리',
    'interface-mgmt': '인터페이스 관리',
    'user-mgmt': '사용자 관리',
};

/* ── DOM 캐시 ── */
const dom = {
    viewTabs: document.getElementById('view-tabs'),
    viewTabButtons: Array.from(document.querySelectorAll('.sidebar-menu-item')),
    viewSections: Array.from(document.querySelectorAll('.view-section')),
    plannerSubTabs: document.getElementById('planner-submenu'),
    plannerSubTabButtons: Array.from(document.querySelectorAll('.sidebar-submenu-item[data-sub]')),
    plannerSubSections: Array.from(document.querySelectorAll('.planner-sub-section')),
    /* 재공실적 분석 */
    tableSubTabs: document.getElementById('table-submenu'),
    tableSubTabButtons: Array.from(document.querySelectorAll('.sidebar-submenu-item[data-table-sub]')),
    tableSubSections: Array.from(document.querySelectorAll('.table-sub-section')),
    historyTabs: Array.from(document.querySelectorAll('.history-tab')),
    historyPanels: Array.from(document.querySelectorAll('[data-history-panel]')),
    userNameDisplay: document.getElementById('user-name-display'),
    /* 인터페이스 관리 */
    ifSubTabs: document.getElementById('if-sub-tabs'),
    ifSubTabButtons: Array.from(document.querySelectorAll('.if-sub-tab')),
    ifSubSections: Array.from(document.querySelectorAll('.if-sub-section')),
};

/* ══════════════════════════════════════════════
   열린 탭 바 관리
   ══════════════════════════════════════════════ */
function openTab(viewName) {
    if (!state.openTabs.includes(viewName)) {
        state.openTabs.push(viewName);
    }
    renderOpenTabs();
}

function closeTab(viewName) {
    const idx = state.openTabs.indexOf(viewName);
    if (idx === -1) return;

    state.openTabs.splice(idx, 1);

    /* 닫은 탭이 활성 탭이면 다른 탭으로 전환 */
    if (state.activeView === viewName) {
        const nextView = state.openTabs[Math.min(idx, state.openTabs.length - 1)]
                       || state.openTabs[0]
                       || 'summary';
        /* 탭이 모두 닫혔으면 summary를 다시 열기 */
        if (state.openTabs.length === 0) {
            state.openTabs.push('summary');
        }
        switchView(nextView);
        return;
    }
    renderOpenTabs();
}

function renderOpenTabs() {
    const bar = document.getElementById('open-tabs-bar');
    if (!bar) return;

    bar.innerHTML = '';
    state.openTabs.forEach((vn) => {
        const tab = document.createElement('button');
        tab.className = 'open-tab' + (vn === state.activeView ? ' active' : '');
        tab.dataset.view = vn;

        const label = document.createElement('span');
        label.className = 'open-tab-label';
        label.textContent = VIEW_LABELS[vn] || vn;
        tab.appendChild(label);

        const closeBtn = document.createElement('span');
        closeBtn.className = 'open-tab-close';
        closeBtn.innerHTML = '×';
        closeBtn.title = '탭 닫기';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(vn);
        });
        tab.appendChild(closeBtn);

        tab.addEventListener('click', () => {
            switchView(vn);
        });

        bar.appendChild(tab);
    });
}

/* ══════════════════════════════════════════════
   메인 탭 전환
   ══════════════════════════════════════════════ */
function switchView(viewName) {
    state.activeView = viewName;

    /* ── 열린 탭 바 연동 ── */
    openTab(viewName);

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

    /* 진부화재고 사이드바 서브메뉴 펼침/닫힘 */
    const plannerGroup = document.getElementById('sidebar-group-planner');
    if (plannerGroup) {
        if (viewName === 'planner') {
            plannerGroup.classList.add('open');
        } else {
            plannerGroup.classList.remove('open');
        }
    }

    /* 재공실적 분석 사이드바 서브메뉴 펼침/닫힘 */
    const tableGroup = document.getElementById('sidebar-group-table');
    if (tableGroup) {
        if (viewName === 'table') {
            tableGroup.classList.add('open');
        } else {
            tableGroup.classList.remove('open');
        }
    }

    const ifSubTabsEl = dom.ifSubTabs;

    /* 인터페이스 관리 탭이면 서브탭 표시 */
    if (viewName === 'interface-mgmt') {
        if (ifSubTabsEl) ifSubTabsEl.style.display = '';
        loadIfDataForCurrentTab();
    } else {
        if (ifSubTabsEl) ifSubTabsEl.style.display = 'none';
    }

    /* 모바일에서 메뉴 선택 후 사이드바 자동 닫기 */
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('collapsed');
    }

    /* URL 해시 업데이트 */
    if (history.replaceState) {
        history.replaceState(null, '', `#${viewName}`);
    }

    /* 열린 탭 바 렌더 갱신 */
    renderOpenTabs();
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
   재공실적 분석 서브탭 전환
   ══════════════════════════════════════════════ */
function switchTableSubTab(subName) {
    state.activeTableSub = subName;

    dom.tableSubTabButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tableSub === subName);
    });

    dom.tableSubSections.forEach((section) => {
        const isActive = section.dataset.tablePanel === subName;
        section.classList.toggle('active', isActive);
    });
}

/* ══════════════════════════════════════════════
   인터페이스 관리 서브탭 전환
   ══════════════════════════════════════════════ */
function switchIfSubTab(subName) {
    state.activeIfSub = subName;

    dom.ifSubTabButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.ifSub === subName);
    });

    dom.ifSubSections.forEach((section) => {
        const isActive = section.dataset.ifPanel === subName;
        section.classList.toggle('active', isActive);
    });

    loadIfDataForCurrentTab();
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
    /* 메인 탭 클릭 (서브메뉴가 있는 항목은 별도 처리) */
    dom.viewTabButtons.forEach((btn) => {
        if (btn.classList.contains('has-children')) return;
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });

    /* 진부화재고 사이드바 서브메뉴 클릭 */
    dom.plannerSubTabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            switchView('planner');
            switchPlannerSubTab(btn.dataset.sub);
            /* 서브메뉴 아이템 활성 상태 */
            dom.plannerSubTabButtons.forEach(b => b.classList.toggle('active', b === btn));
        });
    });

    /* 진부화재고 부모 메뉴 클릭 시 서브메뉴 토글 */
    const plannerParent = document.querySelector('.sidebar-menu-item[data-view="planner"]');
    const plannerGroup = document.getElementById('sidebar-group-planner');
    if (plannerParent && plannerGroup) {
        plannerParent.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = plannerGroup.classList.contains('open');
            if (isOpen && state.activeView === 'planner') {
                /* 이미 열려 있고 planner 뷰면 닫기 */
                plannerGroup.classList.remove('open');
            } else {
                /* 뷰 전환 + 서브메뉴 열기 */
                switchView('planner');
                plannerGroup.classList.add('open');
            }
        });
    }

    /* 재공실적 분석 사이드바 서브메뉴 클릭 */
    dom.tableSubTabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            switchView('table');
            switchTableSubTab(btn.dataset.tableSub);
            /* 서브메뉴 아이템 활성 상태 */
            dom.tableSubTabButtons.forEach(b => b.classList.toggle('active', b === btn));
        });
    });

    /* 재공실적 분석 부모 메뉴 클릭 시 서브메뉴 토글 */
    const tableParent = document.querySelector('.sidebar-menu-item[data-view="table"]');
    const tableGroup = document.getElementById('sidebar-group-table');
    if (tableParent && tableGroup) {
        tableParent.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = tableGroup.classList.contains('open');
            if (isOpen && state.activeView === 'table') {
                tableGroup.classList.remove('open');
            } else {
                switchView('table');
                tableGroup.classList.add('open');
            }
        });
    }

    /* 변경이력 탭 클릭 */
    dom.historyTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            switchHistoryTab(tab.dataset.history);
        });
    });

    /* 인터페이스 관리 서브탭 클릭 */
    dom.ifSubTabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            switchIfSubTab(btn.dataset.ifSub);
        });
    });

    /* 인터페이스 마스터 신규등록 */
    const btnIfMasterAdd = document.getElementById('btn-if-master-add');
    if (btnIfMasterAdd) {
        btnIfMasterAdd.addEventListener('click', () => ifMasterStartNew());
    }

    /* 인터페이스 이력 필터 */
    const ifHistFilterStatus = document.getElementById('if-history-filter-status');
    const ifHistFilterId = document.getElementById('if-history-filter-id');
    const btnIfHistRefresh = document.getElementById('btn-if-history-refresh');
    if (ifHistFilterStatus) ifHistFilterStatus.addEventListener('change', () => loadIfHistory());
    if (ifHistFilterId) ifHistFilterId.addEventListener('change', () => loadIfHistory());
    if (btnIfHistRefresh) btnIfHistRefresh.addEventListener('click', () => loadIfHistory());

    /* URL 해시 변경 감지 */
    window.addEventListener('hashchange', () => {
        const hash = location.hash.replace('#', '');
        if (hash && dom.viewTabButtons.some((btn) => btn.dataset.view === hash)) {
            switchView(hash);
        }
    });

    /* 키보드 네비게이션 (상하 화살표) */
    if (dom.viewTabs) {
        dom.viewTabs.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const currentIndex = dom.viewTabButtons.findIndex((btn) => btn.classList.contains('active'));
            if (currentIndex === -1) return;
            const direction = e.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = (currentIndex + direction + dom.viewTabButtons.length) % dom.viewTabButtons.length;
            const nextBtn = dom.viewTabButtons[nextIndex];
            nextBtn.focus();
            switchView(nextBtn.dataset.view);
        });
    }

    /* 사이드바 토글 */
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
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

    /* 초기 열린 탭 바 렌더 */
    renderOpenTabs();

    /* 진부화재고 서브메뉴 초기 상태: 닫힌 상태 (switchView에서 열림) */

    /* 인터페이스 서브탭 초기 상태 */
    if (dom.ifSubTabs) {
        dom.ifSubTabs.style.display = 'none';
    }

    /* 시스템 일자 표시 */
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = yyyy + '-' + mm + '-' + dd;
    state.refDate = dateStr;

    const systemDateEl = document.getElementById('status-system-date');
    if (systemDateEl) systemDateEl.textContent = dateStr;

    const listSystemDateEl = document.getElementById('list-system-date');
    if (listSystemDateEl) listSystemDateEl.textContent = dateStr;

    /* 슬리터 날짜 설명 */
    const slitterDateDesc = document.getElementById('slitter-date-desc');
    if (slitterDateDesc) {
        slitterDateDesc.textContent = yyyy + '년 ' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일';
    }

    /* 슬리터 수불부 월 선택기 초기화 */
    initSubulbuMonthSelector();

    /* 슬리터 일자별 상세내역 중량 합계 계산 초기화 */
    initSlitterCalc();

    /* 슬리터 외주 진행 내역 초기화 */
    initOutsource();

    /* 원지포장 월별 요약 초기화 */
    initPackaging();

    /* 편집 가능 셀 이벤트 바인딩 (input/blur 리스너) */
    bindEditableCells();

    /* 저장 버튼 바인딩 */
    bindSaveButton();

    /* 기준정보 동기화 버튼 바인딩 */
    bindMasterSyncButton();


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

        /* 진부화재고 출고 진척 현황 요약 표 생성 */
        buildProgressSummary();

        /* 확정 상태 UI 갱신 */
        updateConfirmedUI();

        /* 기준정보 동기화 상태 로드 */
        loadMasterSyncStatus();

        console.log('PS S&OP 계획 시스템 초기화 완료');
    });
}

/* ══════════════════════════════════════════════
   확정 상태 UI 갱신
   ══════════════════════════════════════════════ */
function updateConfirmedUI() {
    const badge = document.getElementById('list-confirmed-badge');
    const badgeText = document.getElementById('list-confirmed-text');
    const infoEl = document.getElementById('confirmed-info');

    if (badge && badgeText) {
        if (state.confirmedYn === 'Y') {
            badge.classList.add('confirmed');
            badgeText.textContent = '확정';
        } else {
            badge.classList.remove('confirmed');
            badgeText.textContent = '미확정';
        }
    }

    if (infoEl) {
        if (state.confirmedYn === 'Y' && state.confirmedDt) {
            /* 확정일시 포맷: ISO → YYYY-MM-DD HH:mm */
            let dtStr = '';
            try {
                const dt = new Date(state.confirmedDt);
                dtStr = dt.getFullYear() + '-' +
                    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
                    String(dt.getDate()).padStart(2, '0') + ' ' +
                    String(dt.getHours()).padStart(2, '0') + ':' +
                    String(dt.getMinutes()).padStart(2, '0');
            } catch (_) {
                dtStr = state.confirmedDt;
            }
            const who = state.confirmedBy || '';
            infoEl.textContent = '확정: ' + who + ' (' + dtStr + ')';
            infoEl.classList.add('is-confirmed');
        } else {
            infoEl.textContent = state.refDate ? '기준일: ' + state.refDate + ' — 미확정' : '';
            infoEl.classList.remove('is-confirmed');
        }
    }

    /* 저장 버튼 라벨 갱신 */
    const saveBtn = document.getElementById('btn-save-obsolete-list');
    if (saveBtn) {
        if (state.confirmedYn === 'Y' && !state.hasUnsavedChanges) {
            saveBtn.textContent = '확정 완료';
        } else {
            saveBtn.textContent = '저장 (확정)';
        }
    }
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
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '저장 (확정)';
        }
        if (statusEl) {
            statusEl.textContent = '수정된 내용이 있습니다';
            statusEl.className = 'save-status unsaved';
        }
        /* 수정이 발생하면 확정 상태 해제 (UI만) */
        state.confirmedYn = 'N';
        updateConfirmedUI();
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

/* 저장 처리 (확정 포함) */
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

    /* 백엔드 API 호출 — 서버 측 영속 저장 + 확정 처리 */
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
            /* 확정 상태 갱신 */
            state.confirmedYn = result.confirmed_yn || 'Y';
            state.confirmedBy = sessionStorage.getItem('loginUserId') || 'admin';
            state.confirmedDt = result.updated_dt || new Date().toISOString();
            state.refDate = result.ref_date || state.refDate;

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
        saveBtn.textContent = '확정 완료';
        saveBtn.disabled = true;
    }
    if (statusEl) {
        const msg = savedCount ? savedCount + '건 저장 완료 (확정)' : '저장 완료 (확정)';
        statusEl.textContent = msg;
        statusEl.className = 'save-status saved';
        setTimeout(() => {
            if (!state.hasUnsavedChanges) {
                statusEl.textContent = '';
                statusEl.className = 'save-status';
            }
        }, 3000);
    }

    /* 확정 상태 UI 갱신 */
    updateConfirmedUI();

    console.log('[SAVE] 저장 완료 (' + (savedCount || 0) + '건) — 확정 처리됨');
}

/* 저장 실패 처리 */
function onSaveError(err) {
    const saveBtn = document.getElementById('btn-save-obsolete-list');
    const statusEl = document.getElementById('save-status');

    if (saveBtn) {
        saveBtn.textContent = '저장 (확정)';
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
   기준정보 동기화 (RFC 'M' 시뮬레이션)
   — POST /api/obsolete-inventory/sync-master
   — 사용자 버튼 클릭으로 호출 (월 1회 권장)
   — 마스터 필드(기초/예정) 갱신, 사용자 수정값 유지
   ══════════════════════════════════════════════ */

/**
 * 기준정보 동기화 버튼 바인딩
 */
function bindMasterSyncButton() {
    const btn = document.getElementById('btn-sync-master');
    if (!btn) return;

    btn.addEventListener('click', () => {
        if (!confirm('기준정보(마스터) 동기화를 실행합니다.\n\n' +
            'RFC Z_SNOP_PS_OBSOLETE_INV_GET (IV_SYNC_TYPE=\'M\') 호출\n\n' +
            '[갱신 대상 — 마스터 필드]\n' +
            '• 기초경과일, 기초중량, 기초금액\n' +
            '• 예정경과일, 예정중량, 예정금액\n\n' +
            '[사용자 수정값]\n' +
            '• 폐기: 변경 없음 (항상 사용자 입력값 유지)\n' +
            '• 매출(수정), 밀롤(수정), 기타출고(수정): 본 동기화에서는 변경 없음\n' +
            '  → 매일 07:30 일별 동기화(D) 시 SAP 값으로 리셋\n\n' +
            '계속하시겠습니까?')) {
            return;
        }

        btn.disabled = true;
        btn.textContent = '동기화 중...';

        const statusEl = document.getElementById('sync-master-status');
        if (statusEl) {
            statusEl.textContent = '동기화 진행 중...';
            statusEl.className = 'sync-master-status syncing';
        }

        fetch('/api/obsolete-inventory/sync-master', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requested_by: sessionStorage.getItem('loginUserName') || 'admin',
            }),
        })
        .then(function (res) {
            if (!res.ok) throw new Error('기준정보 동기화 실패: ' + res.status);
            return res.json();
        })
        .then(function (result) {
            if (result.success) {
                /* 동기화 상태 업데이트 */
                state.lastMasterSyncDt = result.sync_dt;
                state.lastMasterSyncBy = result.requested_by;

                /* 최종 동기화 일시 표시 갱신 */
                updateMasterSyncStatusUI();

                alert('기준정보 동기화 완료\n\n' +
                    '• ' + result.synced_count + '건 마스터 데이터 갱신\n' +
                    '• 동기화 시각: ' + formatSyncDt(result.sync_dt) + '\n' +
                    '• 실행자: ' + result.requested_by);

                console.log('[MASTER-SYNC] 완료:', result);
            } else {
                alert('기준정보 동기화 실패: ' + (result.error || '알 수 없는 오류'));
            }
        })
        .catch(function (err) {
            alert('기준정보 동기화 오류: ' + err.message);
            console.error('[MASTER-SYNC] 오류:', err);
            if (statusEl) {
                statusEl.textContent = '동기화 실패';
                statusEl.className = 'sync-master-status error';
            }
        })
        .finally(function () {
            btn.disabled = false;
            btn.textContent = '기준정보 동기화';
        });
    });
}

/**
 * 서버에서 최종 기준정보 동기화 상태를 로드
 */
function loadMasterSyncStatus() {
    fetch('/api/obsolete-inventory/sync-master/status')
        .then(function (res) {
            if (!res.ok) throw new Error('상태 조회 실패');
            return res.json();
        })
        .then(function (result) {
            if (result.success && result.last_sync_dt) {
                state.lastMasterSyncDt = result.last_sync_dt;
                state.lastMasterSyncBy = result.last_sync_by;
                updateMasterSyncStatusUI();
            }
        })
        .catch(function (err) {
            console.warn('[MASTER-SYNC] 상태 조회 실패:', err.message);
        });
}

/**
 * 최종 기준정보 동기화 일시 UI 갱신
 */
function updateMasterSyncStatusUI() {
    const statusEl = document.getElementById('sync-master-status');
    if (!statusEl) return;

    if (state.lastMasterSyncDt) {
        const dtStr = formatSyncDt(state.lastMasterSyncDt);
        const who = state.lastMasterSyncBy || '';
        statusEl.textContent = '최종 동기화: ' + dtStr + (who ? ' (' + who + ')' : '');
        statusEl.className = 'sync-master-status synced';
    } else {
        statusEl.textContent = '동기화 이력 없음';
        statusEl.className = 'sync-master-status no-history';
    }
}

/**
 * ISO 날짜 문자열을 YYYY-MM-DD HH:mm 포맷으로 변환
 */
function formatSyncDt(isoStr) {
    try {
        const dt = new Date(isoStr);
        return dt.getFullYear() + '-' +
            String(dt.getMonth() + 1).padStart(2, '0') + '-' +
            String(dt.getDate()).padStart(2, '0') + ' ' +
            String(dt.getHours()).padStart(2, '0') + ':' +
            String(dt.getMinutes()).padStart(2, '0');
    } catch (_) {
        return isoStr;
    }
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

            /* 서버에서 받은 ref_date 갱신 */
            if (result.ref_date) {
                state.refDate = result.ref_date;
                var listSystemDateEl = document.getElementById('list-system-date');
                if (listSystemDateEl) listSystemDateEl.textContent = result.ref_date;
                var statusSystemDateEl = document.getElementById('status-system-date');
                if (statusSystemDateEl) statusSystemDateEl.textContent = result.ref_date;
            }

            var savedData = result.data;
            var rows = document.querySelectorAll('#obsolete-list-tbody tr');
            var restoredCount = 0;

            /* 확정 상태 추적: 모든 저장된 항목의 confirmed_yn을 확인 */
            var hasConfirmed = false;
            var latestConfirmedDt = null;
            var latestConfirmedBy = null;

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

                /* 확정 상태 수집 */
                if (data.confirmed_yn === 'Y') {
                    hasConfirmed = true;
                    if (!latestConfirmedDt || (data.confirmed_dt && data.confirmed_dt > latestConfirmedDt)) {
                        latestConfirmedDt = data.confirmed_dt;
                        latestConfirmedBy = data.confirmed_by;
                    }
                }

                restoredCount++;
            });

            /* 전체 확정 상태 결정: 하나라도 Y면 전체 확정으로 표시 */
            if (hasConfirmed) {
                state.confirmedYn = 'Y';
                state.confirmedBy = latestConfirmedBy;
                state.confirmedDt = latestConfirmedDt;
            } else {
                state.confirmedYn = 'N';
                state.confirmedBy = null;
                state.confirmedDt = null;
            }

            if (restoredCount > 0) {
                console.log('[API] 서버에서 ' + restoredCount + '건 복원 완료 (확정: ' + state.confirmedYn + ')');
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

    /* 예상잔량 기준 내림차순 정렬 */
    sortStatusByRemainDesc();

    /* 요약 표 갱신 */
    buildProgressSummary();
}

/* ══════════════════════════════════════════════
   진부화재고 현황 — 예상잔량 기준 내림차순 정렬
   ══════════════════════════════════════════════ */
function sortStatusByRemainDesc() {
    const tbody = document.getElementById('obsolete-status-tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
        const cellsA = a.querySelectorAll('td');
        const cellsB = b.querySelectorAll('td');
        /* 예상잔량 = 9번째 td (index 8) */
        const remainA = cellsA.length >= 9 ? parseNumber(cellsA[8].textContent) : 0;
        const remainB = cellsB.length >= 9 ? parseNumber(cellsB[8].textContent) : 0;
        return remainB - remainA; /* 내림차순 */
    });

    rows.forEach((row) => tbody.appendChild(row));
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

/* ══════════════════════════════════════════════
   진부화재고 출고 진척 현황 — 요약 표 집계
   • 내수/수출 × 제/상품 기준 그룹핑
   • 진부화재고, 출고계, 예상잔량 합산
   • 소진율 = (출고계 / 진부화재고) × 100
   • 일수진척율 = (경과일수 / 당월총일수) × 100
   • 일수대비 = 소진율 − 일수진척율
   ══════════════════════════════════════════════ */
function buildProgressSummary() {
    const tbody = document.getElementById('progress-summary-tbody');
    if (!tbody) return;

    /* 현황 테이블에서 행별 데이터 수집 */
    const statusRows = document.querySelectorAll('#obsolete-status-tbody tr');
    const groups = {};          /* key: '내수::제품' 등 */
    const ORDER = ['내수', '수출'];
    const PRODUCT_ORDER = ['제품', '상품'];

    statusRows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 11) return;

        const domestic    = cells[1].textContent.trim();          /* 내수/수출 */
        const productType = cells[3].textContent.trim();          /* 상품/제품 → 제/상품 */
        const obsolete    = parseNumber(cells[6].textContent);    /* 진부화재고 */
        const outTotal    = parseNumber(cells[7].textContent);    /* 출고계 */
        const remain      = parseNumber(cells[8].textContent);    /* 예상잔량 */

        const key = domestic + '::' + productType;
        if (!groups[key]) {
            groups[key] = { domestic, productType, obsolete: 0, outTotal: 0, remain: 0 };
        }
        groups[key].obsolete += obsolete;
        groups[key].outTotal += outTotal;
        groups[key].remain   += remain;
    });

    /* 일수진척율 계산을 위한 날짜 정보 */
    const now       = new Date();
    const year      = now.getFullYear();
    const month     = now.getMonth();                            /* 0-based */
    const totalDays = new Date(year, month + 1, 0).getDate();   /* 당월 총 일수 */
    const elapsed   = now.getDate();                             /* 경과 일수 */
    const dayRate   = (elapsed / totalDays) * 100;               /* 일수진척율 */

    /* 정렬: 내수→수출, 제품→상품 */
    const sorted = Object.values(groups).sort((a, b) => {
        const dA = ORDER.indexOf(a.domestic);
        const dB = ORDER.indexOf(b.domestic);
        if (dA !== dB) return dA - dB;
        return PRODUCT_ORDER.indexOf(a.productType) - PRODUCT_ORDER.indexOf(b.productType);
    });

    /* 합계 집계 */
    let totalObsolete = 0, totalOut = 0, totalRemain = 0;
    sorted.forEach((g) => {
        totalObsolete += g.obsolete;
        totalOut      += g.outTotal;
        totalRemain   += g.remain;
    });

    /* 내수/수출 별 행 개수 집계 (rowspan 병합용) */
    const domesticCount = {};
    sorted.forEach((g) => {
        domesticCount[g.domestic] = (domesticCount[g.domestic] || 0) + 1;
    });

    /* HTML 생성 — 내수/수출 셀은 같은 값끼리 rowspan 병합 */
    let html = '';
    const domesticRendered = {};   /* 이미 rowspan 셀을 출력한 내수/수출 값 */

    sorted.forEach((g) => {
        const rate    = g.obsolete !== 0 ? (g.outTotal / g.obsolete) * 100 : 0;
        const diff    = rate - dayRate;
        const diffCls = diff >= 0 ? 'rate-positive' : 'rate-negative';
        const diffSign = diff >= 0 ? '+' : '';

        html += '<tr>';

        /* 내수/수출 셀: 첫 번째 행에만 rowspan 출력 */
        if (!domesticRendered[g.domestic]) {
            const span = domesticCount[g.domestic] || 1;
            html += '<td rowspan="' + span + '" style="vertical-align:middle;font-weight:600;">' + g.domestic + '</td>';
            domesticRendered[g.domestic] = true;
        }

        html += '<td>' + g.productType + '</td>'
            + '<td>' + formatNumber(parseFloat(g.obsolete.toFixed(2))) + '</td>'
            + '<td>' + formatNumber(parseFloat(g.outTotal.toFixed(2))) + '</td>'
            + '<td>' + formatNumber(parseFloat(g.remain.toFixed(2))) + '</td>'
            + '<td>' + rate.toFixed(2) + '%</td>'
            + '<td>' + dayRate.toFixed(2) + '%</td>'
            + '<td class="' + diffCls + '">' + diffSign + diff.toFixed(2) + '%p</td>'
            + '</tr>';
    });

    /* 합계 행 */
    const totalRate    = totalObsolete !== 0 ? (totalOut / totalObsolete) * 100 : 0;
    const totalDiff    = totalRate - dayRate;
    const totalDiffCls = totalDiff >= 0 ? 'rate-positive' : 'rate-negative';
    const totalDiffSign = totalDiff >= 0 ? '+' : '';

    html += '<tr class="summary-total-row">'
        + '<td colspan="2">합계</td>'
        + '<td>' + formatNumber(parseFloat(totalObsolete.toFixed(2))) + '</td>'
        + '<td>' + formatNumber(parseFloat(totalOut.toFixed(2))) + '</td>'
        + '<td>' + formatNumber(parseFloat(totalRemain.toFixed(2))) + '</td>'
        + '<td>' + totalRate.toFixed(2) + '%</td>'
        + '<td>' + dayRate.toFixed(2) + '%</td>'
        + '<td class="' + totalDiffCls + '">' + totalDiffSign + totalDiff.toFixed(2) + '%p</td>'
        + '</tr>';

    tbody.innerHTML = html;

    /* ── 소진율 vs 일수진척율 차트 갱신 ── */
    renderProgressChart(sorted, dayRate);
}

/* ══════════════════════════════════════════════
   소진율 vs 일수진척율 비교 차트
   — 막대: 각 그룹별 소진율
   — 기준선: 일수진척율
   — 증감 표시: 막대 색상으로 초과(파랑)/미달(빨강)
   ══════════════════════════════════════════════ */
let _progressChart = null;

function renderProgressChart(groups, dayRate) {
    const canvas = document.getElementById('progress-chart');
    if (!canvas) return;

    const labels = groups.map((g) => g.domestic + ' ' + g.productType);
    const rates  = groups.map((g) => g.obsolete !== 0 ? parseFloat(((g.outTotal / g.obsolete) * 100).toFixed(2)) : 0);
    const colors = rates.map((r) => r >= dayRate ? 'rgba(37,99,235,0.7)' : 'rgba(220,38,38,0.65)');
    const borders = rates.map((r) => r >= dayRate ? 'rgba(37,99,235,1)' : 'rgba(220,38,38,1)');

    /* 기존 차트 파괴 */
    if (_progressChart) {
        _progressChart.destroy();
        _progressChart = null;
    }

    const ctx = canvas.getContext('2d');
    _progressChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '소진율 (%)',
                    data: rates,
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.6,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 28 } },
            scales: {
                y: {
                    beginAtZero: true,
                    suggestedMax: 100,
                    title: { display: true, text: '%', font: { size: 11 } },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { font: { size: 11 } },
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } },
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function () {
                            return '일수진척율: ' + dayRate.toFixed(2) + '%';
                        },
                    },
                },
                /* 일수진척율 기준선을 annotation 대신 커스텀 플러그인으로 그림 */
            },
        },
        plugins: [{
            id: 'dataLabels',
            afterDatasetsDraw: function (chart) {
                const ctx2 = chart.ctx;
                const meta = chart.getDatasetMeta(0);
                ctx2.save();
                meta.data.forEach(function (bar, i) {
                    const val = chart.data.datasets[0].data[i];
                    const diff = val - dayRate;
                    const diffSign = diff >= 0 ? '+' : '';
                    const diffColor = diff >= 0 ? '#059669' : '#dc2626';

                    /* 1줄: 소진율 */
                    ctx2.font = '600 11px "Noto Sans KR", sans-serif';
                    ctx2.textAlign = 'center';
                    ctx2.textBaseline = 'bottom';
                    ctx2.fillStyle = '#334155';
                    ctx2.fillText(val.toFixed(1) + '%', bar.x, bar.y - 16);

                    /* 2줄: 증감값 */
                    ctx2.font = '600 10px "Noto Sans KR", sans-serif';
                    ctx2.fillStyle = diffColor;
                    ctx2.fillText('(' + diffSign + diff.toFixed(1) + ')', bar.x, bar.y - 4);
                });
                ctx2.restore();
            },
        }, {
            id: 'dayRateLine',
            afterDraw: function (chart) {
                const yScale = chart.scales.y;
                const xScale = chart.scales.x;
                const yPixel = yScale.getPixelForValue(dayRate);

                const ctx2 = chart.ctx;
                ctx2.save();
                ctx2.beginPath();
                ctx2.setLineDash([6, 4]);
                ctx2.strokeStyle = '#f59e0b';
                ctx2.lineWidth = 1;
                ctx2.moveTo(xScale.left, yPixel);
                ctx2.lineTo(xScale.right, yPixel);
                ctx2.stroke();

                /* 라벨 */
                ctx2.setLineDash([]);
                ctx2.fillStyle = '#f59e0b';
                ctx2.font = '600 11px "Noto Sans KR", sans-serif';
                ctx2.textAlign = 'right';
                ctx2.fillText('일수진척율 ' + dayRate.toFixed(1) + '%', xScale.right, yPixel - 6);
                ctx2.restore();
            },
        }],
    });
}

/* ══════════════════════════════════════════════
   인터페이스 관리 — 데이터 로딩 & 렌더링
   ══════════════════════════════════════════════ */

/** 현재 활성 서브탭에 맞는 데이터 로드 */
function loadIfDataForCurrentTab() {
    const sub = state.activeIfSub;
    if (sub === 'if-master') loadIfMasters();
    else if (sub === 'if-exec') loadIfSchedules();
    else if (sub === 'if-history') loadIfHistory();
}

/* ── 마스터 관리 ── */
function loadIfMasters() {
    fetch('/api/interface/master')
        .then(r => r.json())
        .then(res => {
            if (res.success) renderIfMasterTable(res.data);
        })
        .catch(err => console.error('마스터 로드 실패:', err));
}

function renderIfMasterTable(masters) {
    const tbody = document.getElementById('if-master-tbody');
    if (!tbody) return;

    if (!masters || masters.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">등록된 인터페이스가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = masters.map(m => `
        <tr data-if-id="${m.if_id}">
            <td>${esc(m.if_id)}</td>
            <td>${esc(m.if_name)}</td>
            <td>${esc(m.sender)}</td>
            <td>${esc(m.receiver)}</td>
            <td class="rfc-url-cell" title="${esc(m.rfc_url)}">${esc(m.rfc_url)}</td>
            <td class="rfc-param-cell" title="${esc(m.rfc_param)}">${esc(m.rfc_param)}</td>
            <td class="exec-command-cell" title="${esc(m.exec_command)}">${esc(m.exec_command)}</td>
            <td>${esc(m.created_by)}</td>
            <td>${esc(m.updated_by)}</td>
            <td>
                <div class="if-action-group">
                    <button class="btn-if-edit" onclick="ifMasterStartEdit('${esc(m.if_id)}')">수정</button>
                    <button class="btn-if-delete" onclick="ifMasterDelete('${esc(m.if_id)}')">삭제</button>
                </div>
            </td>
        </tr>
    `).join('');
}

/** 마스터 신규 등록 — 인라인 입력행 추가 */
function ifMasterStartNew() {
    const tbody = document.getElementById('if-master-tbody');
    if (!tbody) return;
    // 이미 편집행이 있으면 중복 방지
    if (tbody.querySelector('.inline-edit-row')) {
        alert('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.');
        return;
    }
    const row = document.createElement('tr');
    row.className = 'inline-edit-row';
    row.innerHTML = `
        <td><input class="inline-input" name="if_id" placeholder="예: SNOP_RFC_007" style="min-width:110px"></td>
        <td><input class="inline-input" name="if_name" placeholder="인터페이스 명" style="min-width:120px"></td>
        <td><input class="inline-input" name="sender" placeholder="송신" style="min-width:50px"></td>
        <td><input class="inline-input" name="receiver" placeholder="수신" style="min-width:50px"></td>
        <td><input class="inline-input" name="rfc_url" placeholder="RFC Func./REST URL" style="min-width:180px"></td>
        <td><input class="inline-input" name="rfc_param" placeholder="RFC Param" style="min-width:140px"></td>
        <td><input class="inline-input" name="exec_command" placeholder="실행명령어" style="min-width:180px"></td>
        <td>-</td>
        <td>-</td>
        <td>
            <div class="if-action-group">
                <button class="btn-if-execute" onclick="ifMasterSaveInline(this)">저장</button>
                <button class="btn-if-toggle" onclick="ifMasterCancelInline(this)">취소</button>
            </div>
        </td>
    `;
    tbody.insertBefore(row, tbody.firstChild);
    row.querySelector('input[name="if_id"]').focus();
}

/** 마스터 인라인 수정 — 기존 행을 입력행으로 전환 */
function ifMasterStartEdit(ifId) {
    const tbody = document.getElementById('if-master-tbody');
    if (!tbody) return;
    if (tbody.querySelector('.inline-edit-row')) {
        alert('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.');
        return;
    }
    const row = tbody.querySelector(`tr[data-if-id="${ifId}"]`);
    if (!row) return;

    const cells = row.querySelectorAll('td');
    const vals = {
        if_id: cells[0].textContent.trim(),
        if_name: cells[1].textContent.trim(),
        sender: cells[2].textContent.trim(),
        receiver: cells[3].textContent.trim(),
        rfc_url: cells[4].getAttribute('title') || cells[4].textContent.trim(),
        rfc_param: cells[5].getAttribute('title') || cells[5].textContent.trim(),
        exec_command: cells[6].getAttribute('title') || cells[6].textContent.trim(),
        created_by: cells[7].textContent.trim(),
        updated_by: cells[8].textContent.trim(),
    };

    row.className = 'inline-edit-row';
    row.setAttribute('data-if-id', vals.if_id);
    row.innerHTML = `
        <td><input class="inline-input" name="if_id" value="${esc(vals.if_id)}" readonly style="min-width:110px;background:rgba(148,163,184,0.08)"></td>
        <td><input class="inline-input" name="if_name" value="${esc(vals.if_name)}" style="min-width:120px"></td>
        <td><input class="inline-input" name="sender" value="${esc(vals.sender)}" style="min-width:50px"></td>
        <td><input class="inline-input" name="receiver" value="${esc(vals.receiver)}" style="min-width:50px"></td>
        <td><input class="inline-input" name="rfc_url" value="${esc(vals.rfc_url)}" style="min-width:180px"></td>
        <td><input class="inline-input" name="rfc_param" value="${esc(vals.rfc_param)}" style="min-width:140px"></td>
        <td><input class="inline-input" name="exec_command" value="${esc(vals.exec_command)}" style="min-width:180px"></td>
        <td>${esc(vals.created_by)}</td>
        <td>${esc(vals.updated_by)}</td>
        <td>
            <div class="if-action-group">
                <button class="btn-if-execute" onclick="ifMasterSaveInline(this)">저장</button>
                <button class="btn-if-toggle" onclick="ifMasterCancelInline(this)">취소</button>
            </div>
        </td>
    `;
    row.querySelector('input[name="if_name"]').focus();
}

/** 인라인 저장 (신규/수정 공통) */
function ifMasterSaveInline(btnEl) {
    const row = btnEl.closest('tr');
    if (!row) return;
    const getVal = (name) => (row.querySelector(`input[name="${name}"]`)?.value || '').trim();
    const ifId = getVal('if_id');
    if (!ifId) { alert('인터페이스 ID를 입력해주세요.'); return; }

    const userName = sessionStorage.getItem('loginUserName') || 'admin';
    const body = {
        if_id: ifId,
        if_name: getVal('if_name'),
        sender: getVal('sender'),
        receiver: getVal('receiver'),
        rfc_url: getVal('rfc_url'),
        rfc_param: getVal('rfc_param'),
        exec_command: getVal('exec_command'),
        updated_by: userName,
    };

    fetch('/api/interface/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    .then(r => r.json())
    .then(res => {
        if (res.success) {
            loadIfMasters();
        } else {
            alert(res.error || '저장 실패');
        }
    })
    .catch(err => { console.error(err); alert('저장 중 오류 발생'); });
}

/** 인라인 취소 */
function ifMasterCancelInline(btnEl) {
    loadIfMasters(); // 테이블 전체 다시 로드
}

/** 마스터 삭제 */
function ifMasterDelete(ifId) {
    if (!confirm(`인터페이스 [${ifId}]를 삭제하시겠습니까?\n관련 스케줄도 함께 삭제됩니다.`)) return;

    fetch(`/api/interface/master/${encodeURIComponent(ifId)}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                loadIfMasters();
            } else {
                alert(res.error || '삭제 실패');
            }
        })
        .catch(err => { console.error(err); alert('삭제 중 오류 발생'); });
}

/* ── 수행관리(스케줄) ── */
function loadIfSchedules() {
    fetch('/api/interface/schedule')
        .then(r => r.json())
        .then(res => {
            if (res.success) renderIfExecTable(res.data);
        })
        .catch(err => console.error('스케줄 로드 실패:', err));
}

function renderIfExecTable(schedules) {
    const tbody = document.getElementById('if-exec-tbody');
    if (!tbody) return;

    if (!schedules || schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">등록된 스케줄이 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = schedules.map(s => {
        const activeBadge = s.active
            ? '<span class="if-badge-active">활성</span>'
            : '<span class="if-badge-inactive">비활성</span>';
        const statusBadge = getExecStatusBadge(s.last_exec_status);
        const toggleLabel = s.active ? '비활성' : '활성';

        return `
        <tr data-if-id="${esc(s.if_id)}">
            <td>${esc(s.if_id)}</td>
            <td>${esc(s.if_name)}</td>
            <td>${esc(s.cycle)}</td>
            <td>${esc(s.schedule_time)}</td>
            <td>${activeBadge}</td>
            <td>${formatIfDt(s.last_exec_dt)}</td>
            <td>${statusBadge}</td>
            <td>${formatIfDt(s.next_exec_dt)}</td>
            <td>${esc(s.remark)}</td>
            <td>${esc(s.created_by)}</td>
            <td>
                <div class="if-action-group">
                    <button class="btn-if-execute" onclick="ifExecManual('${esc(s.if_id)}')">수동실행</button>
                    <button class="btn-if-edit" onclick="ifScheduleEdit('${esc(s.if_id)}')">수정</button>
                    <button class="btn-if-toggle" onclick="ifScheduleToggle('${esc(s.if_id)}', ${!s.active})">${toggleLabel}</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

/** 수동 실행 */
function ifExecManual(ifId) {
    if (!confirm(`인터페이스 [${ifId}]를 수동 실행하시겠습니까?`)) return;

    fetch(`/api/interface/execute/${encodeURIComponent(ifId)}`, { method: 'POST' })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                const result = res.result;
                const statusMsg = result.status === '성공'
                    ? `성공 (처리: ${result.processed_cnt}건, 소요: ${result.elapsed_ms}ms)`
                    : `에러: ${result.error_msg}`;
                alert(`수동 실행 결과: ${statusMsg}`);
                loadIfSchedules();
            } else {
                alert(res.error || '실행 실패');
            }
        })
        .catch(err => { console.error(err); alert('실행 중 오류 발생'); });
}

/** 스케줄 활성/비활성 토글 */
function ifScheduleToggle(ifId, newActive) {
    fetch('/api/interface/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ if_id: ifId, active: newActive }),
    })
    .then(r => r.json())
    .then(res => {
        if (res.success) loadIfSchedules();
        else alert(res.error || '변경 실패');
    })
    .catch(err => { console.error(err); alert('변경 중 오류 발생'); });
}

/** 스케줄 수정 (인라인) */
function ifScheduleEdit(ifId) {
    const tbody = document.getElementById('if-exec-tbody');
    if (!tbody) return;
    if (tbody.querySelector('.inline-edit-row')) {
        alert('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.');
        return;
    }
    const row = tbody.querySelector(`tr[data-if-id="${ifId}"]`);
    if (!row) return;

    const cells = row.querySelectorAll('td');
    const vals = {
        if_id: cells[0].textContent.trim(),
        if_name: cells[1].textContent.trim(),
        cycle: cells[2].textContent.trim(),
        schedule_time: cells[3].textContent.trim(),
        remark: cells[8].textContent.trim(),
    };

    row.className = 'inline-edit-row';
    row.innerHTML = `
        <td>${esc(vals.if_id)}</td>
        <td>${esc(vals.if_name)}</td>
        <td>
            <select class="inline-input" name="cycle">
                <option value="일간" ${vals.cycle === '일간' ? 'selected' : ''}>일간</option>
                <option value="시간" ${vals.cycle === '시간' ? 'selected' : ''}>시간</option>
                <option value="월간" ${vals.cycle === '월간' ? 'selected' : ''}>월간</option>
                <option value="주간" ${vals.cycle === '주간' ? 'selected' : ''}>주간</option>
            </select>
        </td>
        <td><input class="inline-input" name="schedule_time" value="${esc(vals.schedule_time)}" style="min-width:120px"></td>
        <td colspan="5"></td>
        <td><input class="inline-input" name="remark" value="${esc(vals.remark)}" placeholder="비고" style="min-width:100px"></td>
        <td>
            <div class="if-action-group">
                <button class="btn-if-execute" onclick="ifScheduleSaveInline(this, '${esc(vals.if_id)}')">저장</button>
                <button class="btn-if-toggle" onclick="loadIfSchedules()">취소</button>
            </div>
        </td>
    `;
    row.querySelector('input[name="schedule_time"]').focus();
}

function ifScheduleSaveInline(btnEl, ifId) {
    const row = btnEl.closest('tr');
    if (!row) return;
    const getVal = (name) => {
        const el = row.querySelector(`[name="${name}"]`);
        return el ? el.value.trim() : '';
    };

    const body = {
        if_id: ifId,
        cycle: getVal('cycle'),
        schedule_time: getVal('schedule_time'),
        remark: getVal('remark'),
    };

    fetch('/api/interface/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    .then(r => r.json())
    .then(res => {
        if (res.success) loadIfSchedules();
        else alert(res.error || '저장 실패');
    })
    .catch(err => { console.error(err); alert('저장 중 오류 발생'); });
}

/* ── 이력관리 ── */
function loadIfHistory() {
    const statusFilter = document.getElementById('if-history-filter-status')?.value || '';
    const idFilter = document.getElementById('if-history-filter-id')?.value || '';

    let url = '/api/interface/history?';
    if (statusFilter) url += `status=${encodeURIComponent(statusFilter)}&`;
    if (idFilter) url += `if_id=${encodeURIComponent(idFilter)}&`;

    fetch(url)
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                renderIfHistoryTable(res.data);
                populateIfHistoryFilterIds(res.data);
            }
        })
        .catch(err => console.error('이력 로드 실패:', err));
}

function renderIfHistoryTable(histories) {
    const tbody = document.getElementById('if-history-tbody');
    if (!tbody) return;

    if (!histories || histories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="empty-cell">수행 이력이 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = histories.map((h, idx) => {
        const statusBadge = getHistoryStatusBadge(h.status);
        const errorCell = h.error_msg
            ? `<td class="if-error-msg-cell" title="${esc(h.error_msg)}">${esc(h.error_msg)}</td>`
            : '<td>-</td>';

        return `
        <tr>
            <td>${h.no || idx + 1}</td>
            <td>${esc(h.if_id)}</td>
            <td>${esc(h.if_name)}</td>
            <td>${esc(h.exec_type)}</td>
            <td>${formatIfDt(h.start_dt)}</td>
            <td>${formatIfDt(h.end_dt)}</td>
            <td>${formatNumber(h.elapsed_ms)}</td>
            <td>${formatNumber(h.processed_cnt)}</td>
            <td>${formatNumber(h.unprocessed_cnt)}</td>
            <td>${statusBadge}</td>
            ${errorCell}
            <td class="exec-command-cell" title="${esc(h.exec_command)}">${esc(h.exec_command)}</td>
            <td>
                <div class="if-action-group">
                    <button class="btn-if-rerun" onclick="ifExecManual('${esc(h.if_id)}')">재수행</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

/** 이력 필터 드롭다운에 인터페이스 ID 목록 채우기 */
function populateIfHistoryFilterIds(histories) {
    const sel = document.getElementById('if-history-filter-id');
    if (!sel) return;
    const currentVal = sel.value;
    const ids = [...new Set(histories.map(h => h.if_id))].sort();

    // 기존 옵션 유지 여부 확인 — 전체 목록 호출 시에만 갱신
    if (document.getElementById('if-history-filter-status')?.value || currentVal) return;

    const options = '<option value="">전체 인터페이스</option>' +
        ids.map(id => `<option value="${id}">${id}</option>`).join('');
    sel.innerHTML = options;
}

/* ── 유틸리티 ── */

/** HTML 이스케이프 */
function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** 날짜 포맷 (ISO → 'YYYY-MM-DD HH:mm') */
function formatIfDt(dtStr) {
    if (!dtStr) return '-';
    try {
        const d = new Date(dtStr);
        if (isNaN(d.getTime())) return dtStr;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    } catch {
        return dtStr;
    }
}

/** 수행 상태 배지 (스케줄 탭) */
function getExecStatusBadge(status) {
    if (!status) return '-';
    if (status === '성공') return '<span class="if-badge-success">성공</span>';
    if (status === '에러') return '<span class="if-badge-error">에러</span>';
    if (status === '진행중') return '<span class="if-badge-running">진행중</span>';
    return `<span>${esc(status)}</span>`;
}

/** 이력 상태 배지 */
function getHistoryStatusBadge(status) {
    if (!status) return '-';
    if (status === '성공') return '<span class="if-badge-success">성공</span>';
    if (status === '에러') return '<span class="if-badge-error">에러</span>';
    if (status === '진행중') return '<span class="if-badge-running">진행중</span>';
    return `<span>${esc(status)}</span>`;
}

/* ══════════════════════════════════════════════
   슬리터 수불부 — 산술 로직 + 동적 날짜 컬럼
   ══════════════════════════════════════════════
   산술 로직:
     1) 기초  = 전일 기말 (1일 기초 = 0)
     2) 입고  = 기말 + 계 - 기초
     3) 내수/수출(작업) = I/F 데이터 (slitter_detail) 일자별 집계
     4) 계   = 내수 + 수출
     5) 기말  = 수기 입력 (서버 저장)
   ══════════════════════════════════════════════ */

/** 요일 한글 배열 */
const DAY_NAMES_KR = ['일', '월', '화', '수', '목', '금', '토'];

/** 수불부 상태 관리 */
const subulbuState = {
    yearMonth: '',              // 'YYYY-MM'
    prevMonthLastGimal: 0,      // 전월 마지막 일의 기말값 (ton)
    workRows: [],               // 작업(I/F) 데이터 rows [{work_date, domestic, weight}, ...]
};

/**
 * 슬리터 상세 데이터에서 일자별 내수/수출 중량 집계 (ton 단위)
 * ※ 이 함수는 차트(renderSlitterDailyChart, renderSlitterSubulbuChart)에서만 사용
 * @param {string} yearMonth  — 'YYYY-MM'
 * @returns {{ [day: string]: { domestic: number, export: number } }}
 */
function aggregateSlitterDaily(yearMonth) {
    var rows = slitterDetailState.rows || [];
    var dailyMap = {};

    rows.forEach(function (r) {
        var date = r.date || '';
        if (!date) return;
        /* 해당 월 데이터만 필터링 */
        if (date.substring(0, 7) !== yearMonth) return;

        var day = String(parseInt(date.substring(8, 10), 10)); // "01" → "1"
        if (!dailyMap[day]) dailyMap[day] = { domestic: 0, export: 0 };

        var w = (Number(r.weight) || 0) / 1000; // kg → ton
        if (r.domestic === '내수') {
            dailyMap[day].domestic += w;
        } else {
            dailyMap[day].export += w;
        }
    });

    return dailyMap;
}

/**
 * 슬리터 상세 데이터에서 일자별 **누적** 총합계 집계 (ton 단위)
 * → 1일~해당일까지의 누적 총합계 = 수불부 기말 값
 * @param {string} yearMonth  — 'YYYY-MM'
 * @param {number} daysInMonth — 해당 월 일수
 * @returns {{ [day: string]: number }} — 일자별 누적 총합계 (ton)
 */
function aggregateSlitterDailyTotal(yearMonth, daysInMonth) {
    var rows = slitterDetailState.rows || [];
    var dailyMap = {};

    /* 먼저 일자별 당일 합계 집계 */
    rows.forEach(function (r) {
        var date = r.date || '';
        if (!date) return;
        if (date.substring(0, 7) !== yearMonth) return;

        var day = String(parseInt(date.substring(8, 10), 10));
        if (!dailyMap[day]) dailyMap[day] = 0;
        dailyMap[day] += (Number(r.weight) || 0) / 1000; // kg → ton
    });

    /* 1일부터 해당일까지 누적 합산 */
    var cumulativeMap = {};
    var cumSum = 0;
    for (var d = 1; d <= (daysInMonth || 31); d++) {
        var dk = String(d);
        cumSum += (dailyMap[dk] || 0);
        cumulativeMap[dk] = cumSum;
    }

    return cumulativeMap;
}

/**
 * 수불부 작업(I/F) 데이터에서 일자별 내수/수출 집계 (ton 단위)
 * @param {string} yearMonth — 'YYYY-MM'
 * @returns {{ [day: string]: { domestic: number, export: number } }}
 */
function aggregateSubulbuWork(yearMonth) {
    var rows = subulbuState.workRows || [];
    var dailyMap = {};

    rows.forEach(function (r) {
        var date = r.work_date || '';
        if (!date) return;
        if (date.substring(0, 7) !== yearMonth) return;

        var day = String(parseInt(date.substring(8, 10), 10));
        if (!dailyMap[day]) dailyMap[day] = { domestic: 0, export: 0 };

        var w = (Number(r.weight) || 0) / 1000; // kg → ton
        if (r.domestic === '내수') {
            dailyMap[day].domestic += w;
        } else {
            dailyMap[day].export += w;
        }
    });

    return dailyMap;
}

/**
 * 수불부 산술 계산
 * ─────────────────────────────────────────────
 * 기말 = 일자별 상세 내역의 1일~해당일 "누적" 총합계 (ton)
 * 기초 = 전일 기말 (1일은 전월 마지막일 기말값)
 * 내수/수출(작업) = 수불부 작업(I/F) 테이블에서 집계
 * 계 = 내수 + 수출
 * 입고 = 기말 + 계 - 기초
 * ─────────────────────────────────────────────
 * @param {number} daysInMonth — 해당 월 일수
 * @param {{ [day: string]: number }} dailyTotal — 일자별 상세내역 누적 총합계 (ton)
 * @param {{ [day: string]: { domestic: number, export: number } }} dailyWork — 작업(I/F) 일자별 집계
 * @param {number} prevMonthLastGimal — 전월 마지막 일 기말값 (ton)
 * @returns {{ kicho: number[], ipgo: number[], naesu: number[], suchul: number[], gye: number[], gimal: number[] }}
 */
function calcSubulbu(daysInMonth, dailyTotal, dailyWork, prevMonthLastGimal) {
    var kicho = [], ipgo = [], naesu = [], suchul = [], gye = [], gimal = [];

    for (var d = 1; d <= daysInMonth; d++) {
        var dayKey = String(d);

        /* 기말 = 당일 상세내역 총합계 */
        var gimalVal = Math.round((dailyTotal[dayKey] || 0) * 10) / 10;

        /* 기초 = 전일 기말 (1일은 전월 마지막일 기말값) */
        var kichoVal = (d === 1) ? (prevMonthLastGimal || 0) : (gimal[d - 2] || 0);
        kichoVal = Math.round(kichoVal * 10) / 10;

        /* 내수/수출(작업) = 수불부 작업 I/F 테이블 */
        var workData = dailyWork[dayKey] || { domestic: 0, export: 0 };
        var naesuVal = Math.round(workData.domestic * 10) / 10;
        var suchulVal = Math.round(workData.export * 10) / 10;

        /* 계 = 내수 + 수출 */
        var gyeVal = Math.round((naesuVal + suchulVal) * 10) / 10;

        /* 입고 = 기말 + 계 - 기초 */
        var ipgoVal = Math.round((gimalVal + gyeVal - kichoVal) * 10) / 10;

        kicho.push(kichoVal);
        ipgo.push(ipgoVal);
        naesu.push(naesuVal);
        suchul.push(suchulVal);
        gye.push(gyeVal);
        gimal.push(gimalVal);
    }

    return { kicho: kicho, ipgo: ipgo, naesu: naesu, suchul: suchul, gye: gye, gimal: gimal };
}

/**
 * 선택된 월의 수불부 테이블을 렌더링한다.
 * @param {number} year  — 연도 (예: 2026)
 * @param {number} month — 월 (1-12)
 */
function renderSubulbuTable(year, month) {
    const headerRow = document.getElementById('subulbu-header-row');
    const tbody = document.getElementById('subulbu-tbody');
    if (!headerRow || !tbody) return;

    var yearMonth = year + '-' + String(month).padStart(2, '0');
    var daysInMonth = new Date(year, month, 0).getDate();

    /* ── 헤더 재구성 ── */
    headerRow.innerHTML = '';
    const thLabel = document.createElement('th');
    thLabel.className = 'subulbu-th-label';
    thLabel.colSpan = 2;
    thLabel.textContent = month + '월';
    headerRow.appendChild(thLabel);

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month - 1, d);
        const dayIdx = dateObj.getDay();
        const dayName = DAY_NAMES_KR[dayIdx];

        let weekendClass = '';
        if (dayIdx === 0) weekendClass = ' subulbu-sun';
        else if (dayIdx === 6) weekendClass = ' subulbu-sat';

        const th = document.createElement('th');
        th.className = 'subulbu-date-th' + weekendClass;
        th.innerHTML = d + '일<span class="subulbu-date-day">(' + dayName + ')</span>';
        headerRow.appendChild(th);
    }

    /* ── 일자별 상세내역 누적 총합계 집계 (기말 용) ── */
    var dailyTotal = aggregateSlitterDailyTotal(yearMonth, daysInMonth);

    /* ── 작업(I/F) 일자별 내수/수출 집계 ── */
    var dailyWork = aggregateSubulbuWork(yearMonth);

    /* ── 산술 계산 (전월 기말값 포함) ── */
    var calc = calcSubulbu(daysInMonth, dailyTotal, dailyWork, subulbuState.prevMonthLastGimal);

    /* ── 행 구조 정의 (기말 포함 전체 자동계산) ── */
    const rowDefs = [
        { key: 'kicho',       label: '기초',  colspan: true,  data: calc.kicho,  cssClass: 'subulbu-row-kicho'  },
        { key: 'ipgo',        label: '입고',  colspan: true,  data: calc.ipgo,   cssClass: 'subulbu-row-ipgo'   },
        { key: 'work-naesu',  label: '작업',  rowspan: true,  sub: '내수', data: calc.naesu,  cssClass: 'subulbu-row-work-naesu'  },
        { key: 'work-suchul', skipLabel: true, sub: '수출', data: calc.suchul, cssClass: 'subulbu-row-work-suchul' },
        { key: 'gye',         label: '계',    colspan: true,  data: calc.gye,    cssClass: 'subulbu-row-gye'    },
        { key: 'gimal',       label: '기말',  colspan: true,  data: calc.gimal,  cssClass: 'subulbu-row-gimal'  },
    ];

    tbody.innerHTML = '';

    rowDefs.forEach(function (rowDef) {
        const tr = document.createElement('tr');
        tr.className = 'subulbu-row ' + rowDef.cssClass;

        /* 좌측 라벨 셀 */
        if (rowDef.label) {
            const tdLabel = document.createElement('td');
            tdLabel.className = rowDef.rowspan ? 'subulbu-label subulbu-label-work' : 'subulbu-label';
            tdLabel.textContent = rowDef.label;
            if (rowDef.rowspan) tdLabel.rowSpan = 2;
            if (rowDef.colspan) tdLabel.colSpan = 2;
            tr.appendChild(tdLabel);
        }

        /* 서브 라벨 (내수/수출) */
        if (rowDef.sub) {
            const tdSub = document.createElement('td');
            tdSub.className = 'subulbu-sublabel';
            tdSub.textContent = rowDef.sub;
            tr.appendChild(tdSub);
        }

        /* 날짜 데이터 셀 (전체 자동계산 — 수기입력 없음) */
        for (let d = 0; d < daysInMonth; d++) {
            const val = rowDef.data[d] || 0;
            const td = document.createElement('td');
            td.className = 'subulbu-data';
            td.textContent = val ? val.toFixed(1) : '';
            tr.appendChild(td);
        }

        tbody.appendChild(tr);
    });

    /* ── 기말 누적합을 서버에 자동저장 (다음달 1일 기초값 용) ── */
    autoSaveSubulbuGimal(yearMonth, calc.gimal, daysInMonth);
}

/**
 * 기말 누적합을 서버에 자동저장 (백그라운드, UI 알림 없음)
 * 다음 달의 1일 기초값으로 사용됨
 * @param {string} yearMonth — 'YYYY-MM'
 * @param {number[]} gimalArr — 일자별 기말값 배열
 * @param {number} daysInMonth — 해당 월 일수
 */
function autoSaveSubulbuGimal(yearMonth, gimalArr, daysInMonth) {
    /* 기말 배열을 { "1": val, "2": val, ... } 객체로 변환 */
    var gimalObj = {};
    var hasData = false;
    for (var d = 0; d < daysInMonth; d++) {
        if (gimalArr[d]) {
            gimalObj[String(d + 1)] = gimalArr[d];
            hasData = true;
        }
    }
    if (!hasData) return; /* 데이터 없으면 저장 안 함 */

    fetch('/api/slitter-subulbu/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            year_month: yearMonth,
            gimal: gimalObj,
            user_id: 'system',
        }),
    }).catch(function (err) {
        console.error('[수불부 기말 자동저장 오류]', err);
    });
}

/**
 * 전월 YYYY-MM 문자열 계산
 * @param {string} ym — 'YYYY-MM'
 * @returns {string} 전월 'YYYY-MM'
 */
function getPrevYearMonth(ym) {
    var parts = ym.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    return y + '-' + String(m).padStart(2, '0');
}

/**
 * 전월 마지막 일의 기말값을 가져온다.
 * @param {object} prevData — 전월 수불부 서버 응답 data (null 가능)
 * @returns {number} 전월 마지막 일의 기말값 (ton), 없으면 0
 */
function extractPrevMonthLastGimal(prevData) {
    if (!prevData || !prevData.gimal) return 0;
    var gimal = prevData.gimal;
    /* gimal 객체의 키 중 가장 큰 숫자(=마지막 일) 찾기 */
    var maxDay = 0;
    Object.keys(gimal).forEach(function (k) {
        var d = parseInt(k, 10);
        if (d > maxDay && gimal[k] !== null && gimal[k] !== '' && gimal[k] !== undefined) {
            maxDay = d;
        }
    });
    return maxDay > 0 ? (Number(gimal[String(maxDay)]) || 0) : 0;
}

/**
 * 수불부 데이터 로드 후 테이블 렌더
 * 1) 전월 기말값 (1일 기초용)
 * 2) 작업(I/F) 데이터 (내수/수출)
 */
function loadSubulbuData() {
    var ym = subulbuState.yearMonth;
    if (!ym) return;

    var prevYm = getPrevYearMonth(ym);

    /* 전월 기말 + 작업(I/F) 데이터 동시 로드 */
    Promise.all([
        fetch('/api/slitter-subulbu/load?year_month=' + encodeURIComponent(prevYm)).then(function (r) { return r.json(); }),
        fetch('/api/slitter-subulbu-work/load?year_month=' + encodeURIComponent(ym)).then(function (r) { return r.json(); })
    ])
        .then(function (results) {
            var prevResult = results[0];
            var workResult = results[1];

            /* 전월 마지막 일 기말값 → 1일 기초 */
            subulbuState.prevMonthLastGimal = extractPrevMonthLastGimal(
                (prevResult.success && prevResult.data) ? prevResult.data : null
            );

            /* 작업(I/F) 데이터 */
            if (workResult.success && workResult.data) {
                subulbuState.workRows = workResult.data.rows || [];
            } else {
                subulbuState.workRows = [];
            }

            /* 렌더링 */
            var parts = ym.split('-');
            renderSubulbuTable(parseInt(parts[0], 10), parseInt(parts[1], 10));

            /* 수불부 추이 차트도 갱신 (작업 I/F 데이터 기반) */
            renderSlitterSubulbuChart();
        })
        .catch(function (err) {
            console.error('[수불부 로드 오류]', err);
            subulbuState.prevMonthLastGimal = 0;
            subulbuState.workRows = [];
            var parts = ym.split('-');
            renderSubulbuTable(parseInt(parts[0], 10), parseInt(parts[1], 10));
        });
}

/**
 * 수불부 월 선택기 초기화 & 이벤트 바인딩
 */
function initSubulbuMonthSelector() {
    const monthInput = document.getElementById('subulbu-month-selector');
    if (!monthInput) return;

    /* 기본값: 현재 월 */
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    monthInput.value = yyyy + '-' + mm;
    subulbuState.yearMonth = yyyy + '-' + mm;

    /* 초기 로드 */
    loadSubulbuData();

    /* 월 변경 시 다시 로드 */
    monthInput.addEventListener('change', function () {
        const val = this.value;
        if (!val) return;
        subulbuState.yearMonth = val;
        loadSubulbuData();
    });

    /* 엑셀 다운로드 버튼 */
    var btnExcel = document.getElementById('btn-subulbu-excel');
    if (btnExcel) {
        btnExcel.addEventListener('click', downloadSubulbuExcel);
    }
}

/**
 * 수불부 테이블 데이터를 엑셀(XLSX) 파일로 다운로드
 */
function downloadSubulbuExcel() {
    var ym = subulbuState.yearMonth;
    if (!ym) { alert('월을 선택해주세요.'); return; }

    var parts = ym.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var daysInMonth = new Date(year, month, 0).getDate();

    /* 일자별 상세내역 누적 총합계 (기말용) */
    var dailyTotal = aggregateSlitterDailyTotal(ym, daysInMonth);
    /* 작업(I/F) 일자별 내수/수출 집계 */
    var dailyWork = aggregateSubulbuWork(ym);
    /* 산술 계산 */
    var calc = calcSubulbu(daysInMonth, dailyTotal, dailyWork, subulbuState.prevMonthLastGimal);

    /* ── 엑셀 데이터 구성 ── */
    var header = [month + '월'];
    for (var d = 1; d <= daysInMonth; d++) {
        header.push(d + '일');
    }

    var rowDefs = [
        { label: '기초', data: calc.kicho },
        { label: '입고', data: calc.ipgo },
        { label: '작업-내수', data: calc.naesu },
        { label: '작업-수출', data: calc.suchul },
        { label: '작업-계', data: calc.gye },
        { label: '기말', data: calc.gimal },
    ];

    var wsData = [header];
    rowDefs.forEach(function (def) {
        var row = [def.label];
        for (var i = 0; i < daysInMonth; i++) {
            row.push(def.data[i] || 0);
        }
        wsData.push(row);
    });

    /* XLSX 워크북 생성 */
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(wsData);

    /* 컬럼 너비 설정 */
    var colWidths = [{ wch: 10 }];
    for (var c = 0; c < daysInMonth; c++) {
        colWidths.push({ wch: 9 });
    }
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, '수불부');
    XLSX.writeFile(wb, '슬리터_수불부_' + ym + '.xlsx');
}

/* ══════════════════════════════════════════════
   슬리터 외주 진행 내역 요약
   ══════════════════════════════════════════════ */

/** 외주 진행 내역 상태 */
const outsourceState = {
    yearMonth: '',          // 'YYYY-MM'
    days: {},               // { "1": {cheongju, ipgo, slitting, daegi, slit_ipgo, chulgo, bogwan, total}, ... }
    hasChanges: false,
};

/**
 * 외주 테이블 렌더링 — 지정 월 기준 (미지정 시 시스템 월)
 * @param {number} [year]
 * @param {number} [month] 1-12
 */
function renderOutsourceTable(year, month) {
    if (!year || !month) {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
    }
    outsourceState.yearMonth = year + '-' + String(month).padStart(2, '0');
    outsourceState.days = {};
    outsourceState.hasChanges = false;

    const daysInMonth = new Date(year, month, 0).getDate();
    const headerRow = document.getElementById('outsource-header-row');
    const tbody = document.getElementById('outsource-tbody');
    if (!headerRow || !tbody) return;

    /* ── 헤더: 월 colspan=2 + 날짜 컬럼 + 합계 ── */
    headerRow.innerHTML = '';
    const thMonth = document.createElement('th');
    thMonth.className = 'outsource-th-month';
    thMonth.colSpan = 2;
    thMonth.textContent = month + '월';
    headerRow.appendChild(thMonth);

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month - 1, d);
        const dayIdx = dateObj.getDay();
        const dayName = DAY_NAMES_KR[dayIdx];
        let cls = 'outsource-date-th';
        if (dayIdx === 0) cls += ' outsource-sun';
        else if (dayIdx === 6) cls += ' outsource-sat';

        const th = document.createElement('th');
        th.className = cls;
        th.innerHTML = d + '일<span class="outsource-date-day">(' + dayName + ')</span>';
        headerRow.appendChild(th);
    }

    /* 합계 헤더 */
    const thSum = document.createElement('th');
    thSum.className = 'outsource-sum-th';
    thSum.textContent = '합계';
    headerRow.appendChild(thSum);

    /* ── 행 구조 정의 ── */
    const rowDefs = [
        { key: 'cheongju',  groupLabel: '원규격\n(에페 입고)', groupRowspan: 4, subLabel: '청주대기',   editable: true,  rowClass: 'outsource-row-normal' },
        { key: 'ipgo',      groupLabel: null,                                  subLabel: '입고',       editable: true,  rowClass: 'outsource-row-normal' },
        { key: 'slitting',  groupLabel: null,                                  subLabel: '슬리팅실적', editable: true,  rowClass: 'outsource-row-normal' },
        { key: 'daegi',     groupLabel: null,                                  subLabel: '대기재고',   editable: false, rowClass: 'outsource-row-daegi' },
        { key: 'slit_ipgo', groupLabel: '재단완료\n(원지)',    groupRowspan: 3, subLabel: '슬리팅 입고', editable: true, rowClass: 'outsource-row-normal' },
        { key: 'chulgo',    groupLabel: null,                                  subLabel: '출고',       editable: true,  rowClass: 'outsource-row-normal' },
        { key: 'bogwan',    groupLabel: null,                                  subLabel: '보관재고',   editable: false, rowClass: 'outsource-row-bogwan' },
        { key: 'total',     groupLabel: null, isTotal: true,                   subLabel: '계',         editable: false, rowClass: 'outsource-row-total' },
    ];

    tbody.innerHTML = '';

    rowDefs.forEach((def) => {
        const tr = document.createElement('tr');
        tr.className = def.rowClass;
        tr.dataset.outsourceRow = def.key;

        /* 그룹 라벨 (rowspan) */
        if (def.groupLabel) {
            const tdGroup = document.createElement('td');
            tdGroup.className = 'outsource-group-label';
            tdGroup.rowSpan = def.groupRowspan;
            tdGroup.textContent = def.groupLabel;
            tr.appendChild(tdGroup);
        }

        /* 서브 라벨 / 계 라벨 */
        const tdSub = document.createElement('td');
        if (def.isTotal) {
            tdSub.className = 'outsource-total-label';
            tdSub.colSpan = 2;
            tdSub.textContent = def.subLabel;
        } else {
            tdSub.className = 'outsource-sub-label';
            tdSub.textContent = def.subLabel;
        }
        tr.appendChild(tdSub);

        /* 날짜 데이터 셀 */
        for (let d = 1; d <= daysInMonth; d++) {
            const td = document.createElement('td');
            if (def.editable) {
                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'outsource-input';
                input.dataset.day = d;
                input.dataset.field = def.key;
                input.value = '';
                input.addEventListener('input', onOutsourceInput);
                td.appendChild(input);
            } else {
                td.className = 'outsource-calc';
                td.dataset.day = d;
                td.dataset.field = def.key;
                td.textContent = '';
            }
            tr.appendChild(td);
        }

        /* 합계 셀 */
        const tdSum = document.createElement('td');
        tdSum.className = 'outsource-sum-cell';
        tdSum.dataset.field = def.key;
        tdSum.dataset.sum = 'row';
        tdSum.textContent = '';
        tr.appendChild(tdSum);

        tbody.appendChild(tr);
    });

    /* 저장 버튼 초기화 */
    const saveBtn = document.getElementById('btn-outsource-save');
    if (saveBtn) saveBtn.disabled = true;

    /* 서버에서 데이터 로드 */
    loadOutsourceData();
}

/**
 * 수기 입력 이벤트 핸들러 — 값 변경 시 자동 계산 + 미저장 표시
 */
function onOutsourceInput(e) {
    const input = e.target;
    const day = parseInt(input.dataset.day, 10);
    const field = input.dataset.field;
    const val = input.value.trim() === '' ? null : parseFloat(input.value);

    /* 상태 업데이트 */
    if (!outsourceState.days[day]) {
        outsourceState.days[day] = {};
    }
    outsourceState.days[day][field] = val;

    /* 변경 표시 */
    input.classList.add('modified');
    outsourceState.hasChanges = true;
    const saveBtn = document.getElementById('btn-outsource-save');
    if (saveBtn) saveBtn.disabled = false;

    /* 자동 계산 실행 */
    recalcOutsource();
}

/**
 * 자동 계산 로직:
 * - 대기재고 = 전날 대기재고 + 입고 - 슬리팅실적  (1일은: 입고 - 슬리팅실적)
 * - 보관재고 = 슬리팅 입고 - 출고
 * - 계 = 대기재고 + 보관재고
 * + 각 행의 합계 (맨 오른쪽 컬럼)
 */
function recalcOutsource() {
    const table = document.getElementById('outsource-table');
    if (!table) return;

    const headerRow = document.getElementById('outsource-header-row');
    // 헤더 th 수 = 1(월) + 날짜들 + 1(합계) → 날짜 수 = length - 2
    const daysInMonth = headerRow ? headerRow.children.length - 2 : 0;

    /* 행별 합계 누적용 */
    const rowSums = { cheongju: 0, ipgo: 0, slitting: 0, daegi: 0, slit_ipgo: 0, chulgo: 0, bogwan: 0, total: 0 };

    let prevDaegi = 0;  // 전날 대기재고

    for (let d = 1; d <= daysInMonth; d++) {
        const dayData = outsourceState.days[d] || {};

        const cheongju  = dayData.cheongju != null ? dayData.cheongju : 0;
        const ipgo      = dayData.ipgo != null ? dayData.ipgo : 0;
        const slitting  = dayData.slitting != null ? dayData.slitting : 0;
        const slit_ipgo = dayData.slit_ipgo != null ? dayData.slit_ipgo : 0;
        const chulgo    = dayData.chulgo != null ? dayData.chulgo : 0;

        /* 대기재고 = 전날 대기재고 + 입고 - 슬리팅실적 */
        const daegi = prevDaegi + ipgo - slitting;

        /* 보관재고 = 슬리팅 입고 - 출고 */
        const bogwan = slit_ipgo - chulgo;

        /* 계 = 대기재고 + 보관재고 */
        const total = daegi + bogwan;

        /* 상태 업데이트 */
        if (!outsourceState.days[d]) outsourceState.days[d] = {};
        outsourceState.days[d].daegi = daegi;
        outsourceState.days[d].bogwan = bogwan;
        outsourceState.days[d].total = total;

        /* DOM 업데이트 — 자동 계산 셀 */
        const daegiCell = table.querySelector('td.outsource-calc[data-day="' + d + '"][data-field="daegi"]');
        const bogwanCell = table.querySelector('td.outsource-calc[data-day="' + d + '"][data-field="bogwan"]');
        const totalCell = table.querySelector('td.outsource-calc[data-day="' + d + '"][data-field="total"]');

        if (daegiCell) daegiCell.textContent = daegi || '';
        if (bogwanCell) bogwanCell.textContent = bogwan || '';
        if (totalCell) totalCell.textContent = total || '';

        /* 행별 합계 누적 */
        rowSums.cheongju  += cheongju;
        rowSums.ipgo      += ipgo;
        rowSums.slitting  += slitting;
        rowSums.daegi     += daegi;
        rowSums.slit_ipgo += slit_ipgo;
        rowSums.chulgo    += chulgo;
        rowSums.bogwan    += bogwan;
        rowSums.total     += total;

        prevDaegi = daegi;
    }

    /* 행별 합계 셀 업데이트 */
    Object.keys(rowSums).forEach(function (field) {
        const sumCell = table.querySelector('td.outsource-sum-cell[data-field="' + field + '"]');
        if (sumCell) {
            sumCell.textContent = rowSums[field] || '';
        }
    });

    /* 차트 갱신 */
    renderOutsourceChart();
}

/* ── 외주 재고 추이 차트 ── */
var outsourceChartInstance = null;

/**
 * 외주 재고 추이 꺾은선 그래프 (대기재고 / 보관재고)
 * outsourceState.days 에서 데이터를 읽어 Chart.js 로 렌더링
 */
function renderOutsourceChart() {
    var canvas = document.getElementById('outsource-stock-chart');
    if (!canvas) return;

    var ym = outsourceState.yearMonth;
    if (!ym) return;

    var parts = ym.split('-');
    var year  = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var daysInMonth = new Date(year, month, 0).getDate();

    /* ── 일자별 데이터 수집 ── */
    var labels   = [];
    var daegiArr = [];
    var bogwanArr = [];

    for (var d = 1; d <= daysInMonth; d++) {
        labels.push(d + '일');
        var dayData = outsourceState.days[d] || {};
        daegiArr.push(dayData.daegi != null ? dayData.daegi : 0);
        bogwanArr.push(dayData.bogwan != null ? dayData.bogwan : 0);
    }

    /* 기존 차트 파기 */
    if (outsourceChartInstance) {
        outsourceChartInstance.destroy();
        outsourceChartInstance = null;
    }

    /* 데이터가 전혀 없으면 빈 캔버스 */
    var hasData = daegiArr.some(function (v) { return v !== 0; }) ||
                  bogwanArr.some(function (v) { return v !== 0; });
    if (!hasData) {
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    outsourceChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '대기재고',
                    data: daegiArr,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.10)',
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 5,
                    tension: 0.3,
                    fill: true,
                },
                {
                    label: '보관재고',
                    data: bogwanArr,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.10)',
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 5,
                    tension: 0.3,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        borderRadius: 3,
                        useBorderRadius: true,
                        padding: 16,
                        font: { family: "'Noto Sans KR', sans-serif", size: 12, weight: '600' },
                        color: '#475569',
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: "'Noto Sans KR', sans-serif", size: 12 },
                    bodyFont: { family: "'Noto Sans KR', sans-serif", size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function (ctx) {
                            return ctx.dataset.label + ': ' + ctx.parsed.y;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#94a3b8',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 16,
                    },
                    border: { color: '#e2e8f0' },
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '재고량',
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#64748b',
                    },
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#94a3b8',
                    },
                    border: { display: false },
                },
            },
        },
    });
}

/**
 * 외주 진행 내역 엑셀 다운로드
 */
function downloadOutsourceExcel() {
    var ym = outsourceState.yearMonth;
    if (!ym) { alert('월을 선택해주세요.'); return; }

    var parts = ym.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var daysInMonth = new Date(year, month, 0).getDate();

    /* recalc 실행하여 최신 계산값 보장 */
    recalcOutsource();

    /* ── 행 정의 (테이블과 동일한 순서) ── */
    var rowDefs = [
        { key: 'cheongju',  group: '원규격(에페 입고)', label: '청주대기' },
        { key: 'ipgo',      group: '',                  label: '입고' },
        { key: 'slitting',  group: '',                  label: '슬리팅실적' },
        { key: 'daegi',     group: '',                  label: '대기재고' },
        { key: 'slit_ipgo', group: '재단완료(원지)',     label: '슬리팅 입고' },
        { key: 'chulgo',    group: '',                  label: '출고' },
        { key: 'bogwan',    group: '',                  label: '보관재고' },
        { key: 'total',     group: '',                  label: '계' },
    ];

    /* ── 헤더 행 ── */
    var header = ['구분', '항목'];
    for (var d = 1; d <= daysInMonth; d++) {
        header.push(d + '일');
    }
    header.push('합계');

    /* ── 데이터 행 ── */
    var wsData = [header];
    var currentGroup = '';
    rowDefs.forEach(function (def) {
        var row = [];
        /* 구분(그룹) 컬럼 */
        if (def.group) {
            currentGroup = def.group;
            row.push(def.group);
        } else {
            row.push('');
        }
        /* 항목 컬럼 */
        row.push(def.label);

        /* 일자별 데이터 + 합계 */
        var rowSum = 0;
        for (var dd = 1; dd <= daysInMonth; dd++) {
            var dayData = outsourceState.days[dd] || {};
            var val = dayData[def.key] != null ? dayData[def.key] : 0;
            row.push(val);
            rowSum += val;
        }
        row.push(rowSum);
        wsData.push(row);
    });

    /* ── XLSX 워크북 생성 ── */
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(wsData);

    /* 컬럼 너비 설정 */
    var colWidths = [{ wch: 16 }, { wch: 12 }];
    for (var c = 0; c < daysInMonth; c++) {
        colWidths.push({ wch: 8 });
    }
    colWidths.push({ wch: 10 }); /* 합계 */
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, '외주진행내역');
    XLSX.writeFile(wb, '슬리터_외주진행내역_' + ym + '.xlsx');
}

/**
 * 서버에서 외주 데이터 로드
 */
function loadOutsourceData() {
    const ym = outsourceState.yearMonth;
    if (!ym) return;

    fetch('/api/slitter-outsource/load?year_month=' + encodeURIComponent(ym))
        .then(function (res) { return res.json(); })
        .then(function (result) {
            if (!result.success || !result.data) return;

            const savedDays = result.data.days || {};
            outsourceState.days = {};

            /* 저장된 값 → 입력 필드에 복원 */
            Object.keys(savedDays).forEach(function (dayStr) {
                const d = parseInt(dayStr, 10);
                const dayData = savedDays[dayStr];
                outsourceState.days[d] = dayData;

                /* 수기 입력 필드 복원 */
                ['cheongju', 'ipgo', 'slitting', 'slit_ipgo', 'chulgo'].forEach(function (field) {
                    const input = document.querySelector('.outsource-input[data-day="' + d + '"][data-field="' + field + '"]');
                    if (input && dayData[field] != null) {
                        input.value = dayData[field];
                    }
                });
            });

            /* 자동 계산 실행 */
            recalcOutsource();
        })
        .catch(function (err) {
            console.error('[외주 로드 오류]', err);
        });
}

/**
 * 서버에 외주 데이터 저장
 */
function saveOutsourceData() {
    const ym = outsourceState.yearMonth;
    if (!ym) return;

    /* 입력 필드에서 최신 값 수집 */
    document.querySelectorAll('.outsource-input').forEach(function (input) {
        const d = parseInt(input.dataset.day, 10);
        const field = input.dataset.field;
        const val = input.value.trim() === '' ? null : parseFloat(input.value);
        if (!outsourceState.days[d]) outsourceState.days[d] = {};
        outsourceState.days[d][field] = val;
    });

    /* 자동 계산 최종 실행 */
    recalcOutsource();

    /* 수기입력 5개 필드만 전송 (자동계산 daegi/bogwan/total 제외) */
    var EDITABLE_FIELDS = ['cheongju', 'ipgo', 'slitting', 'slit_ipgo', 'chulgo'];
    var cleanDays = {};
    Object.keys(outsourceState.days).forEach(function (d) {
        var src = outsourceState.days[d] || {};
        var cleaned = {};
        EDITABLE_FIELDS.forEach(function (f) {
            if (src[f] !== undefined) cleaned[f] = src[f];
        });
        if (Object.keys(cleaned).length > 0) cleanDays[d] = cleaned;
    });

    fetch('/api/slitter-outsource/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            year_month: ym,
            days: cleanDays,
            user_id: 'admin',
        }),
    })
        .then(function (res) { return res.json(); })
        .then(function (result) {
            if (result.success) {
                outsourceState.hasChanges = false;
                const saveBtn = document.getElementById('btn-outsource-save');
                if (saveBtn) saveBtn.disabled = true;

                /* modified 클래스 제거 */
                document.querySelectorAll('.outsource-input.modified').forEach(function (el) {
                    el.classList.remove('modified');
                });

                alert('슬리터 외주 진행 내역이 저장되었습니다.');
            } else {
                alert('저장 실패: ' + (result.message || ''));
            }
        })
        .catch(function (err) {
            console.error('[외주 저장 오류]', err);
            alert('저장 중 오류가 발생했습니다.');
        });
}

/**
 * 외주 진행 내역 초기화
 */
function initOutsource() {
    /* 월 선택기 초기값 설정 */
    const monthInput = document.getElementById('outsource-month-selector');
    if (monthInput) {
        const now = new Date();
        monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

        /* 월 변경 이벤트 */
        monthInput.addEventListener('change', function () {
            const val = this.value;
            if (!val) return;
            /* 미저장 경고 */
            if (outsourceState.hasChanges) {
                if (!confirm('저장하지 않은 변경사항이 있습니다. 월을 변경하시겠습니까?')) {
                    this.value = outsourceState.yearMonth;
                    return;
                }
            }
            const parts = val.split('-');
            renderOutsourceTable(parseInt(parts[0], 10), parseInt(parts[1], 10));
        });
    }

    /* 초기 렌더 */
    renderOutsourceTable();

    /* 저장 버튼 바인딩 */
    const saveBtn = document.getElementById('btn-outsource-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveOutsourceData);
    }

    /* 엑셀 다운로드 버튼 바인딩 */
    const excelBtn = document.getElementById('btn-outsource-excel');
    if (excelBtn) {
        excelBtn.addEventListener('click', downloadOutsourceExcel);
    }
}

/* ══════════════════════════════════════════════
   슬리터 일자별 상세 내역 — 데이터 관리
   ══════════════════════════════════════════════ */
var slitterDetailState = {
    yearMonth: '',
    selectedDate: '', // 시스템 일자 기본
    rows: [],
    hasChanges: false,
};

/**
 * 슬리터 일자별 상세 내역 — VLOOKUP 계층적 병합 테이블
 * 내수구분(rowspan) → 지종코드(rowspan) → 평량(rowspan) → 가로길이 → 중량 SUM
 */
function renderSlitterDetailTable() {
    var tbody = document.getElementById('slitter-tbody');
    var tfoot = document.getElementById('slitter-tfoot');
    if (!tbody) return;

    var allRows = slitterDetailState.rows || [];
    tbody.innerHTML = '';
    if (tfoot) tfoot.innerHTML = '';

    /* 선택된 날짜로 필터링 */
    var filterDate = slitterDetailState.selectedDate || '';
    var rows = filterDate
        ? allRows.filter(function (r) { return r.date === filterDate; })
        : allRows;

    if (rows.length === 0) {
        var msg = filterDate ? (filterDate + ' 데이터 없음') : '데이터 없음';
        tbody.innerHTML = '<tr><td colspan="5" class="slitter-empty-msg">' + msg + '</td></tr>';
        return;
    }

    /* ── 1) VLOOKUP 그룹핑: (domestic, paper_code, basis_weight, width) → SUM(weight) ── */
    var groupMap = {};
    rows.forEach(function (r) {
        var key = r.domestic + '|' + r.paper_code + '|' + r.basis_weight + '|' + r.width;
        if (!groupMap[key]) {
            groupMap[key] = {
                domestic: r.domestic,
                paper_code: r.paper_code,
                basis_weight: r.basis_weight,
                width: r.width,
                weight: 0,
            };
        }
        groupMap[key].weight += (Number(r.weight) || 0);
    });

    /* 정렬: 내수→수출, 지종코드, 평량, 가로길이 */
    var grouped = Object.values(groupMap);
    grouped.sort(function (a, b) {
        var dOrder = { '내수': 0, '수출': 1 };
        var da = dOrder[a.domestic] != null ? dOrder[a.domestic] : 2;
        var db = dOrder[b.domestic] != null ? dOrder[b.domestic] : 2;
        if (da !== db) return da - db;
        if (a.paper_code !== b.paper_code) return a.paper_code < b.paper_code ? -1 : 1;
        if (a.basis_weight !== b.basis_weight) return a.basis_weight - b.basis_weight;
        return a.width - b.width;
    });

    /* ── 2) 계층적 rowspan 계산 ── */
    /* domestic → 해당 domestic의 전체 행 수 */
    function countByDomestic(items, dom) {
        var n = 0;
        for (var i = 0; i < items.length; i++) { if (items[i].domestic === dom) n++; }
        return n;
    }
    /* domestic+paper_code → 해당 조합의 행 수 */
    function countByCode(items, dom, code) {
        var n = 0;
        for (var i = 0; i < items.length; i++) {
            if (items[i].domestic === dom && items[i].paper_code === code) n++;
        }
        return n;
    }
    /* domestic+paper_code+basis_weight → 해당 조합의 행 수 */
    function countByBW(items, dom, code, bw) {
        var n = 0;
        for (var i = 0; i < items.length; i++) {
            if (items[i].domestic === dom && items[i].paper_code === code && items[i].basis_weight === bw) n++;
        }
        return n;
    }

    /* ── 3) 그룹별 렌더링 ── */
    var domesticItems = grouped.filter(function (g) { return g.domestic === '내수'; });
    var exportItems = grouped.filter(function (g) { return g.domestic === '수출'; });

    function renderGroup(items, groupLabel, groupClass) {
        var groupSum = 0;
        var prevCode = null;
        var prevBW = null;

        items.forEach(function (item, idx) {
            var tr = document.createElement('tr');
            tr.className = 'slitter-row slitter-group-' + groupClass;

            /* 그룹 경계 클래스: 다음 행과 비교하여 마지막 행에 추가 */
            var next = items[idx + 1] || null;
            if (!next || next.paper_code !== item.paper_code) {
                tr.className += ' slitter-code-last';   /* 지종코드 그룹 마지막 행 */
            } else if (next.basis_weight !== item.basis_weight) {
                tr.className += ' slitter-bw-last';     /* 평량 그룹 마지막 행 */
            }

            var html = '';

            /* ① 내수구분 — 그룹 첫 행에만 rowspan */
            if (idx === 0) {
                var domSpan = items.length;
                html += '<td class="slitter-merge-cell slitter-domestic-cell slitter-domestic-' + groupClass + '" rowspan="' + domSpan + '">' + groupLabel + '</td>';
            }

            /* ② 지종코드 — 같은 코드 첫 등장 시 rowspan */
            var isNewCode = (item.paper_code !== prevCode);
            if (isNewCode) {
                var codeSpan = countByCode(items, item.domestic, item.paper_code);
                html += '<td class="slitter-merge-cell slitter-code-cell" rowspan="' + codeSpan + '">' + (item.paper_code || '') + '</td>';
                prevCode = item.paper_code;
                prevBW = null;          /* 코드 변경 시 평량도 리셋 */
            }

            /* ③ 평량 — 같은 코드+평량 첫 등장 시 rowspan */
            var isNewBW = (item.basis_weight !== prevBW) || isNewCode;
            if (isNewBW) {
                var bwSpan = countByBW(items, item.domestic, item.paper_code, item.basis_weight);
                html += '<td class="slitter-merge-cell slitter-bw-cell" rowspan="' + bwSpan + '">' +
                    (item.basis_weight != null ? Number(item.basis_weight).toLocaleString() : '') + '</td>';
                prevBW = item.basis_weight;
            }

            /* ④ 가로길이 — 항상 표시 */
            html += '<td>' + (item.width != null ? Number(item.width).toLocaleString() : '') + '</td>';

            /* ⑤ 중량(합계, ton) — kg→÷1000 */
            var tonVal = item.weight ? (item.weight / 1000) : 0;
            html += '<td class="slitter-weight-cell">' + tonVal.toFixed(1) + '</td>';

            tr.innerHTML = html;
            tbody.appendChild(tr);
            groupSum += item.weight;
        });

        /* 그룹 소계 행 */
        if (items.length > 0) {
            var subTr = document.createElement('tr');
            subTr.className = 'slitter-subtotal-row slitter-subtotal-' + groupClass;
            subTr.innerHTML =
                '<td class="subtotal-label" colspan="4">' + groupLabel + ' 합계</td>' +
                '<td class="subtotal-value">' + (groupSum / 1000).toFixed(1) + '</td>';
            tbody.appendChild(subTr);
        }

        return groupSum;
    }

    /* ── 4) 내수 렌더링 ── */
    var domesticTotal = 0;
    if (domesticItems.length > 0) {
        domesticTotal = renderGroup(domesticItems, '내수', 'domestic');
    } else {
        tbody.innerHTML += '<tr class="slitter-row"><td colspan="5" class="slitter-empty-msg">내수 데이터 없음</td></tr>';
    }

    /* ── 5) 수출 렌더링 ── */
    var exportTotal = 0;
    if (exportItems.length > 0) {
        exportTotal = renderGroup(exportItems, '수출', 'export');
    } else {
        var emptyTr = document.createElement('tr');
        emptyTr.className = 'slitter-row';
        emptyTr.innerHTML = '<td colspan="5" class="slitter-empty-msg">수출 데이터 없음</td>';
        tbody.appendChild(emptyTr);
    }

    /* ── 6) tfoot: 총 합계 ── */
    if (tfoot) {
        var grandTotal = domesticTotal + exportTotal;
        tfoot.innerHTML =
            '<tr class="slitter-grandtotal-row">' +
                '<td class="grandtotal-label" colspan="4">총 합계</td>' +
                '<td class="grandtotal-value">' + (grandTotal / 1000).toFixed(1) + '</td>' +
            '</tr>';
    }

    /* ── 7) 분석 텍스트 갱신 ── */
    slitterDetailState.domesticTon = domesticTotal / 1000;
    slitterDetailState.exportTon = exportTotal / 1000;
    updateSlitterAnalysis();
    renderSlitterDailyChart();
    renderSlitterSubulbuChart();

    /* 수불부 테이블도 I/F 데이터 변경 반영 */
    if (subulbuState.yearMonth) {
        var sbParts = subulbuState.yearMonth.split('-');
        renderSubulbuTable(parseInt(sbParts[0], 10), parseInt(sbParts[1], 10));
    }
}

/**
 * 슬리터 분석 텍스트 갱신
 * 내수/수출 합계(ton) ÷ 일재단량(ton) = 소요일수
 */
function updateSlitterAnalysis() {
    var resultEl = document.getElementById('slitter-analysis-result');
    if (!resultEl) return;

    var input = document.getElementById('slitter-daily-cut');
    var dailyCut = input ? parseFloat(input.value) : 0;
    var domTon = slitterDetailState.domesticTon || 0;
    var expTon = slitterDetailState.exportTon || 0;

    if (!dailyCut || dailyCut <= 0 || (domTon === 0 && expTon === 0)) {
        resultEl.textContent = '—';
        return;
    }

    var expDays = Math.ceil(expTon / dailyCut);
    var domDays = Math.ceil(domTon / dailyCut);

    resultEl.innerHTML =
        '수출 <strong>' + expDays + '일</strong> 소요, ' +
        '내수 <strong>' + domDays + '일</strong> 소요';
}

/**
 * 슬리터 일자별 내수/수출 꺾은선 차트
 */
var slitterDailyChartInstance = null;

function renderSlitterDailyChart() {
    var canvas = document.getElementById('slitter-daily-chart');
    if (!canvas) return;

    var rows = slitterDetailState.rows || [];
    var ym = slitterDetailState.yearMonth || '';
    if (!ym) return;

    var parts = ym.split('-');
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]);
    var daysInMonth = getDaysInMonth(year, month);

    /* ── 일자별 내수/수출 합계 (ton) ── */
    var dailyMap = {};
    rows.forEach(function (r) {
        var date = r.date || '';
        if (!date) return;
        if (date.substring(0, 7) !== ym) return;
        if (!dailyMap[date]) dailyMap[date] = { domestic: 0, export: 0 };
        if (r.domestic === '내수') {
            dailyMap[date].domestic += (Number(r.weight) || 0);
        } else {
            dailyMap[date].export += (Number(r.weight) || 0);
        }
    });

    /* 1일~말일까지 전체 일자 라벨 생성 */
    var labels = [];
    var domesticData = [];
    var exportData = [];
    var mm = String(month).padStart(2, '0');

    for (var d = 1; d <= daysInMonth; d++) {
        var dd = String(d).padStart(2, '0');
        var dateKey = year + '-' + mm + '-' + dd;
        labels.push(month + '/' + d);

        if (dailyMap[dateKey]) {
            domesticData.push(Math.round(dailyMap[dateKey].domestic / 100) / 10);
            exportData.push(Math.round(dailyMap[dateKey].export / 100) / 10);
        } else {
            domesticData.push(null);
            exportData.push(null);
        }
    }

    /* 기존 차트 파기 */
    if (slitterDailyChartInstance) {
        slitterDailyChartInstance.destroy();
        slitterDailyChartInstance = null;
    }

    slitterDailyChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '수출',
                    data: exportData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointBackgroundColor: '#ef4444',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true,
                    spanGaps: true,
                },
                {
                    label: '내수',
                    data: domesticData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true,
                    spanGaps: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        borderRadius: 3,
                        useBorderRadius: true,
                        padding: 16,
                        font: { family: "'Noto Sans KR', sans-serif", size: 12, weight: '600' },
                        color: '#475569',
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: "'Noto Sans KR', sans-serif", size: 12 },
                    bodyFont: { family: "'Noto Sans KR', sans-serif", size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function (ctx) {
                            var v = ctx.parsed.y;
                            if (v == null) return ctx.dataset.label + ': -';
                            return ctx.dataset.label + ': ' + v.toFixed(1) + ' ton';
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#94a3b8',
                    },
                    border: { color: '#e2e8f0' },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#94a3b8',
                        callback: function (v) { return v + 't'; },
                    },
                    border: { display: false },
                },
            },
        },
    });
}

/**
 * 슬리터 수불부 추이 차트
 * 일자별 입고 / 출고(내수+수출) / 누적재고 추이
 */
var slitterSubulbuChartInstance = null;

function renderSlitterSubulbuChart() {
    var canvas = document.getElementById('slitter-subulbu-chart');
    if (!canvas) return;

    /* ── 작업(I/F) 데이터에서 일자별 출고량(내수+수출) 집계 (ton) ── */
    var workRows = subulbuState.workRows || [];
    var dailyMap = {};
    workRows.forEach(function (r) {
        var date = r.work_date || '';
        if (!date) return;
        if (!dailyMap[date]) dailyMap[date] = { domestic: 0, export: 0 };
        var w = (Number(r.weight) || 0) / 1000; // kg → ton
        if (r.domestic === '내수') {
            dailyMap[date].domestic += w;
        } else {
            dailyMap[date].export += w;
        }
    });

    var dates = Object.keys(dailyMap).sort();

    /* 기존 차트 파기 */
    if (slitterSubulbuChartInstance) {
        slitterSubulbuChartInstance.destroy();
        slitterSubulbuChartInstance = null;
    }

    if (dates.length === 0) {
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    var labels = dates.map(function (d) {
        var parts = d.split('-');
        return Number(parts[1]) + '/' + Number(parts[2]);
    });

    /* 일자별 출고(작업) = 내수 + 수출 (계) */
    var shipOutData = dates.map(function (d) {
        return Math.round((dailyMap[d].domestic + dailyMap[d].export) * 10) / 10;
    });

    /* 누적 출고량 */
    var cumulative = [];
    var runningTotal = 0;
    dates.forEach(function (d) {
        runningTotal += (dailyMap[d].domestic + dailyMap[d].export);
        cumulative.push(Math.round(runningTotal * 10) / 10);
    });

    slitterSubulbuChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '일 출고량',
                    data: shipOutData,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: '#10b981',
                    borderWidth: 1,
                    borderRadius: 4,
                    order: 2,
                    yAxisID: 'y',
                },
                {
                    label: '누적 출고',
                    data: cumulative,
                    type: 'line',
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    order: 1,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        borderRadius: 3,
                        useBorderRadius: true,
                        padding: 16,
                        font: { family: "'Noto Sans KR', sans-serif", size: 12, weight: '600' },
                        color: '#475569',
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: "'Noto Sans KR', sans-serif", size: 12 },
                    bodyFont: { family: "'Noto Sans KR', sans-serif", size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function (ctx) {
                            return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + ' ton';
                        },
                    },
                },
                annotation: {
                    annotations: {
                        idealZone: {
                            type: 'box',
                            yScaleID: 'y',
                            yMin: 50,
                            yMax: 70,
                            backgroundColor: 'rgba(59, 130, 246, 0.08)',
                            borderColor: 'rgba(59, 130, 246, 0.25)',
                            borderWidth: 1,
                            borderDash: [4, 4],
                            label: {
                                display: true,
                                content: '이상적 출고 범위 (50~70ton)',
                                position: 'start',
                                font: { family: "'Noto Sans KR', sans-serif", size: 10, weight: '500' },
                                color: 'rgba(59, 130, 246, 0.6)',
                                padding: 4,
                            },
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#94a3b8',
                    },
                    border: { color: '#e2e8f0' },
                },
                y: {
                    beginAtZero: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: '일 출고(ton)',
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#10b981',
                    },
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#94a3b8',
                    },
                    border: { display: false },
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: '누적(ton)',
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#f59e0b',
                    },
                    grid: { drawOnChartArea: false },
                    ticks: {
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        color: '#94a3b8',
                    },
                    border: { display: false },
                },
            },
        },
    });
}

/**
 * 서버에서 슬리터 일자별 상세 내역 로드
 */
function loadSlitterDetail() {
    var ym = slitterDetailState.yearMonth;
    if (!ym) {
        var now = new Date();
        ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        slitterDetailState.yearMonth = ym;
    }

    fetch('/api/slitter-detail/load?year_month=' + encodeURIComponent(ym))
        .then(function (res) { return res.json(); })
        .then(function (result) {
            if (result.success && result.data) {
                slitterDetailState.rows = result.data.rows || [];
            } else {
                slitterDetailState.rows = [];
            }
            renderSlitterDetailTable();
        })
        .catch(function (err) {
            console.error('[슬리터 상세 로드 오류]', err);
            slitterDetailState.rows = [];
            renderSlitterDetailTable();
        });
}

/**
 * 서버에 슬리터 일자별 상세 내역 저장
 */
function saveSlitterDetail() {
    var ym = slitterDetailState.yearMonth;
    if (!ym) return;

    fetch('/api/slitter-detail/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            year_month: ym,
            rows: slitterDetailState.rows,
            user_id: 'admin',
        }),
    })
        .then(function (res) { return res.json(); })
        .then(function (result) {
            if (result.success) {
                slitterDetailState.hasChanges = false;
                var saveBtn = document.getElementById('btn-slitter-detail-save');
                if (saveBtn) saveBtn.disabled = true;
                alert('슬리터 일자별 상세 내역이 저장되었습니다.');
            } else {
                alert('저장 실패: ' + (result.message || ''));
            }
        })
        .catch(function (err) {
            console.error('[슬리터 상세 저장 오류]', err);
            alert('저장 중 오류가 발생했습니다.');
        });
}

/**
 * 슬리터 일자별 상세 내역 초기화
 */
function initSlitterDetail() {
    /* 날짜 선택기 초기값 = 시스템 현재 일자 */
    var dateInput = document.getElementById('slitter-detail-date');
    if (dateInput) {
        var now = new Date();
        var currentDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        var currentYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        dateInput.value = currentDate;
        slitterDetailState.yearMonth = currentYM;
        slitterDetailState.selectedDate = currentDate;

        /* 날짜 변경 이벤트 */
        dateInput.addEventListener('change', function () {
            var val = this.value;
            if (!val) return;
            var newYM = val.substring(0, 7); // "2026-08-05" → "2026-08"
            slitterDetailState.selectedDate = val;
            if (newYM !== slitterDetailState.yearMonth) {
                /* 월이 바뀌면 데이터 다시 로드 */
                slitterDetailState.yearMonth = newYM;
                loadSlitterDetail();
            } else {
                /* 같은 월이면 필터만 재적용 */
                renderSlitterDetailTable();
            }
        });
    }

    /* 일 재단량 입력 이벤트 */
    var dailyCutInput = document.getElementById('slitter-daily-cut');
    if (dailyCutInput) {
        dailyCutInput.addEventListener('input', updateSlitterAnalysis);
    }

    /* 저장 버튼 바인딩 */
    var saveBtn = document.getElementById('btn-slitter-detail-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveSlitterDetail);
    }

    /* 데이터 로드 */
    loadSlitterDetail();
}

/* initSlitterCalc — 하위 호환용 (init에서 호출됨) */
function initSlitterCalc() {
    initSlitterDetail();
}

/* ══════════════════════════════════════════════
   원지포장 월별 요약 테이블
   ══════════════════════════════════════════════ */

/**
 * 원지포장 I/F 데이터 (월별, 인치별)
 * 구조: { '2026-01': { '3인치': 0, '6인치': 0, '12인치': 0 }, ... }
 * 향후 I/F 연동 시 이 객체에 값이 채워짐
 */
var packagingData = {};

/** 선택된 년도 (기본 = 시스템 현재년도) */
var pkgSelectedYear = new Date().getFullYear();

/** 일CAPA 사용자 입력값 — { '01': 숫자, '02': 숫자, ... } */
var pkgCapaData = {};

/** 해당 월의 일수 반환 */
function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

/**
 * 원지포장 요약 테이블 렌더링
 * - 해당년도 1월 ~ 시스템 당월까지 동적 컬럼 생성
 * - 3인치 / 6인치 / 12인치 행 + 계 + 최대CAPA(자동) + 일CAPA(입력) + 가동율
 */
function renderPackagingSummary() {
    var thead = document.getElementById('pkg-summary-thead');
    var tbody = document.getElementById('pkg-summary-tbody');
    if (!thead || !tbody) return;

    var now = new Date();
    var year = pkgSelectedYear;
    var isCurrentYear = (year === now.getFullYear());
    var maxMonth = isCurrentYear ? (now.getMonth() + 1) : 12;

    var rows = ['3인치', '6인치', '12인치'];
    var months = [];
    for (var m = 1; m <= maxMonth; m++) {
        months.push(m);
    }

    /* ── thead ── */
    var thRow = '<tr><th>구분</th>';
    months.forEach(function (m) { thRow += '<th>' + m + '월</th>'; });
    thRow += '<th>총계</th><th>평균</th></tr>';
    thead.innerHTML = thRow;

    /* ── tbody ── */
    var html = '';

    /* 3인치 / 6인치 / 12인치 행 */
    rows.forEach(function (rowName) {
        html += '<tr>';
        html += '<td>' + rowName + '</td>';
        var total = 0;
        months.forEach(function (m) {
            var ym = year + '-' + String(m).padStart(2, '0');
            var val = (packagingData[ym] && packagingData[ym][rowName]) || 0;
            total += val;
            var display = val ? Number(val.toFixed(1)).toLocaleString() : '';
            html += '<td class="pkg-data-cell">' + display + '</td>';
        });
        var avg = months.length > 0 ? Math.round((total / months.length) * 10) / 10 : 0;
        html += '<td class="pkg-col-summary">' + (total ? Number(total.toFixed(1)).toLocaleString() : '') + '</td>';
        html += '<td class="pkg-col-summary">' + (avg ? Number(avg.toFixed(1)).toLocaleString() : '') + '</td>';
        html += '</tr>';
    });

    /* 계 행 — 월별 합계를 배열에 보관 (가동율 계산용) */
    var monthlyTotals = {};
    html += '<tr class="pkg-row-total">';
    html += '<td>계</td>';
    var grandTotal = 0;
    months.forEach(function (m) {
        var mm = String(m).padStart(2, '0');
        var ym = year + '-' + mm;
        var colSum = 0;
        rows.forEach(function (r) {
            colSum += (packagingData[ym] && packagingData[ym][r]) || 0;
        });
        monthlyTotals[mm] = colSum;
        grandTotal += colSum;
        html += '<td id="pkg-total-' + mm + '">' + (colSum ? Number(colSum.toFixed(1)).toLocaleString() : '') + '</td>';
    });
    var grandAvg = months.length > 0 ? Math.round((grandTotal / months.length) * 10) / 10 : 0;
    html += '<td class="pkg-col-summary" id="pkg-total-sum">' + (grandTotal ? Number(grandTotal.toFixed(1)).toLocaleString() : '') + '</td>';
    html += '<td class="pkg-col-summary" id="pkg-total-avg">' + (grandAvg ? Number(grandAvg.toFixed(1)).toLocaleString() : '') + '</td>';
    html += '</tr>';

    /* 최대CAPA 행 — 해당월 일수 × 일CAPA (자동계산) */
    html += '<tr class="pkg-row-capa">';
    html += '<td>최대CAPA</td>';
    var capaMaxTotal = 0;
    months.forEach(function (m) {
        var mm = String(m).padStart(2, '0');
        var dailyCapa = parseFloat(pkgCapaData[mm]) || 0;
        var days = getDaysInMonth(year, m);
        var val = Math.round(dailyCapa * days);
        capaMaxTotal += val;
        html += '<td id="pkg-max-capa-' + mm + '">' + (val ? Number(val).toLocaleString() : '') + '</td>';
    });
    var capaMaxAvg = months.length > 0 ? Math.round(capaMaxTotal / months.length) : 0;
    html += '<td class="pkg-col-summary" id="pkg-max-capa-total">' + (capaMaxTotal ? Number(capaMaxTotal).toLocaleString() : '') + '</td>';
    html += '<td class="pkg-col-summary" id="pkg-max-capa-avg">' + (capaMaxAvg ? Number(capaMaxAvg).toLocaleString() : '') + '</td>';
    html += '</tr>';

    /* 일CAPA 행 — 사용자 키인 */
    html += '<tr class="pkg-row-capa pkg-row-capa-input">';
    html += '<td>일CAPA</td>';
    var capaDayTotal = 0;
    months.forEach(function (m) {
        var mm = String(m).padStart(2, '0');
        var val = pkgCapaData[mm] || '';
        if (val) capaDayTotal += parseFloat(val) || 0;
        html += '<td class="pkg-input-cell">';
        html += '<input type="number" class="pkg-capa-input" data-month="' + mm + '" value="' + val + '" placeholder="-" />';
        html += '</td>';
    });
    var capaDayAvg = months.length > 0 ? Math.round(capaDayTotal / months.length) : 0;
    html += '<td class="pkg-col-summary" id="pkg-day-capa-total">' + (capaDayTotal ? Number(capaDayTotal).toLocaleString() : '') + '</td>';
    html += '<td class="pkg-col-summary" id="pkg-day-capa-avg">' + (capaDayAvg ? Number(capaDayAvg).toLocaleString() : '') + '</td>';
    html += '</tr>';

    /* 가동율 행 — (계 / 최대CAPA) × 100 */
    html += '<tr class="pkg-row-rate">';
    html += '<td>가동율</td>';
    var rateSum = 0;
    var rateCnt = 0;
    months.forEach(function (m) {
        var mm = String(m).padStart(2, '0');
        var total = monthlyTotals[mm] || 0;
        var dailyCapa = parseFloat(pkgCapaData[mm]) || 0;
        var days = getDaysInMonth(year, m);
        var maxCapa = Math.round(dailyCapa * days);
        var rate = '';
        var rClass = '';
        if (maxCapa > 0) {
            var r = (total / maxCapa) * 100;
            rate = r.toFixed(1) + '%';
            rateSum += r;
            rateCnt++;
            if (r <= 50) rClass = ' pkg-rate-low';
        }
        html += '<td id="pkg-rate-' + mm + '" class="' + rClass + '">' + rate + '</td>';
    });
    var rateAvg = rateCnt > 0 ? (rateSum / rateCnt).toFixed(1) + '%' : '';
    var rateAvgNum = rateCnt > 0 ? rateSum / rateCnt : -1;
    html += '<td class="pkg-col-summary" id="pkg-rate-total"></td>';
    html += '<td class="pkg-col-summary' + (rateAvgNum >= 0 && rateAvgNum <= 50 ? ' pkg-rate-low' : '') + '" id="pkg-rate-avg">' + rateAvg + '</td>';
    html += '</tr>';

    tbody.innerHTML = html;

    /* 일CAPA input 이벤트 바인딩 */
    bindPkgCapaInputs();

    /* 가동율 차트 렌더링 */
    renderPkgRateChart();
}

/* ── 가동율 꺾은선 차트 (Chart.js) ── */
var pkgRateChart = null;

function renderPkgRateChart() {
    var canvas = document.getElementById('pkg-rate-chart');
    if (!canvas) return;

    var now = new Date();
    var year = pkgSelectedYear;
    var isCurrentYear = (year === now.getFullYear());
    var currentMonth = isCurrentYear ? (now.getMonth() + 1) : 12;

    var labels = [];
    var dataArr = [];
    var rows = ['3인치', '6인치', '12인치'];

    for (var m = 1; m <= currentMonth; m++) {
        var mm = String(m).padStart(2, '0');
        labels.push(m + '월');

        var ym = year + '-' + mm;
        var total = 0;
        rows.forEach(function (r) {
            total += (packagingData[ym] && packagingData[ym][r]) || 0;
        });

        var dailyCapa = parseFloat(pkgCapaData[mm]) || 0;
        var days = getDaysInMonth(year, m);
        var maxCapa = Math.round(dailyCapa * days);
        var rate = maxCapa > 0 ? parseFloat(((total / maxCapa) * 100).toFixed(1)) : null;
        dataArr.push(rate);
    }

    if (pkgRateChart) {
        pkgRateChart.data.labels = labels;
        pkgRateChart.data.datasets[0].data = dataArr;
        pkgRateChart.update();
        return;
    }

    pkgRateChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '가동율 (%)',
                data: dataArr,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.08)',
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleFont: { size: 12 },
                    bodyFont: { size: 13, weight: '600' },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function (ctx) {
                            return ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + '%' : '—';
                        }
                    }
                },
                annotation: {
                    annotations: {
                        dangerZone: {
                            type: 'box',
                            yMin: 0,
                            yMax: 50,
                            backgroundColor: 'rgba(220,38,38,0.07)',
                            borderWidth: 0
                        },
                        targetLine: {
                            type: 'line',
                            yMin: 50,
                            yMax: 50,
                            borderColor: 'rgba(220,38,38,0.45)',
                            borderWidth: 1.5,
                            borderDash: [6, 4],
                            label: {
                                display: true,
                                content: '목표 50%',
                                position: 'end',
                                backgroundColor: 'rgba(220,38,38,0.85)',
                                color: '#fff',
                                font: { size: 10, weight: '600' },
                                padding: { top: 2, bottom: 2, left: 6, right: 6 },
                                borderRadius: 4
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 }, color: '#64748b' }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 20,
                        font: { size: 11 },
                        color: '#64748b',
                        callback: function (v) { return v + '%'; }
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
}

/** 일CAPA 입력 변경 시 → 최대CAPA 재계산 + 자동저장 */
function bindPkgCapaInputs() {
    var inputs = document.querySelectorAll('.pkg-capa-input');
    inputs.forEach(function (inp) {
        inp.addEventListener('change', function () {
            var mm = this.dataset.month;
            var val = this.value.trim();
            if (val === '' || isNaN(val)) {
                delete pkgCapaData[mm];
            } else {
                pkgCapaData[mm] = parseFloat(val);
            }
            recalcPkgMaxCapa();
            savePkgCapa();
        });
    });
}

/** 최대CAPA + 가동율 재계산 (DOM 직접 갱신, 전체 리렌더 없이) */
function recalcPkgMaxCapa() {
    var now = new Date();
    var year = pkgSelectedYear;
    var isCurrentYear = (year === now.getFullYear());
    var maxMonth = isCurrentYear ? (now.getMonth() + 1) : 12;

    var capaMaxTotal = 0;
    var capaDayTotal = 0;
    var rateSum = 0;
    var rateCnt = 0;
    var months = [];
    for (var m = 1; m <= maxMonth; m++) months.push(m);

    months.forEach(function (m) {
        var mm = String(m).padStart(2, '0');
        var dailyCapa = parseFloat(pkgCapaData[mm]) || 0;
        var days = getDaysInMonth(year, m);
        var maxVal = Math.round(dailyCapa * days);
        capaMaxTotal += maxVal;
        capaDayTotal += dailyCapa;

        var cell = document.getElementById('pkg-max-capa-' + mm);
        if (cell) cell.textContent = maxVal ? Number(maxVal).toLocaleString() : '';

        /* 가동율 재계산: (계 / 최대CAPA) × 100 */
        var rateCell = document.getElementById('pkg-rate-' + mm);
        if (rateCell) {
            var totalCell = document.getElementById('pkg-total-' + mm);
            var totalVal = totalCell ? parseFloat(totalCell.textContent.replace(/,/g, '')) || 0 : 0;
            if (maxVal > 0) {
                var r = (totalVal / maxVal) * 100;
                rateCell.textContent = r.toFixed(1) + '%';
                rateCell.classList.toggle('pkg-rate-low', r <= 50);
                rateSum += r;
                rateCnt++;
            } else {
                rateCell.textContent = '';
                rateCell.classList.remove('pkg-rate-low');
            }
        }
    });

    var capaMaxAvg = months.length > 0 ? Math.round(capaMaxTotal / months.length) : 0;
    var capaDayAvg = months.length > 0 ? Math.round(capaDayTotal / months.length) : 0;
    var rateAvg = rateCnt > 0 ? (rateSum / rateCnt).toFixed(1) + '%' : '';

    var elMaxTotal = document.getElementById('pkg-max-capa-total');
    var elMaxAvg = document.getElementById('pkg-max-capa-avg');
    var elDayTotal = document.getElementById('pkg-day-capa-total');
    var elDayAvg = document.getElementById('pkg-day-capa-avg');
    var elRateAvg = document.getElementById('pkg-rate-avg');

    if (elMaxTotal) elMaxTotal.textContent = capaMaxTotal ? Number(capaMaxTotal).toLocaleString() : '';
    if (elMaxAvg) elMaxAvg.textContent = capaMaxAvg ? Number(capaMaxAvg).toLocaleString() : '';
    if (elDayTotal) elDayTotal.textContent = capaDayTotal ? Number(capaDayTotal).toLocaleString() : '';
    if (elDayAvg) elDayAvg.textContent = capaDayAvg ? Number(capaDayAvg).toLocaleString() : '';
    if (elRateAvg) {
        elRateAvg.textContent = rateAvg;
        var avgNum = rateCnt > 0 ? rateSum / rateCnt : -1;
        elRateAvg.classList.toggle('pkg-rate-low', avgNum >= 0 && avgNum <= 50);
    }

    /* 가동율 차트 동기화 */
    renderPkgRateChart();
}

/** 일CAPA 서버 저장 */
function savePkgCapa() {
    var year = String(pkgSelectedYear);
    fetch('/api/packaging/capa/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: year, capa: pkgCapaData })
    }).catch(function (err) {
        console.error('[원지포장] 일CAPA 저장 오류', err);
    });
}

/** 일CAPA 서버 로드 */
function loadPkgCapa(callback) {
    var year = String(pkgSelectedYear);
    fetch('/api/packaging/capa/load?year=' + year)
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                pkgCapaData = res.data;
            }
            if (callback) callback();
        })
        .catch(function () {
            if (callback) callback();
        });
}

/**
 * 원지포장 I/F 데이터 로드 (향후 서버 API 연동)
 * 현재는 빈 데이터로 테이블만 렌더링
 */
function loadPackagingData() {
    /* 실적 데이터 + 일CAPA + 일자별 실적 병렬 로드 후 테이블 렌더링 */
    var done = 0;
    var total = 3;
    function check() {
        if (++done >= total) {
            renderPackagingSummary();
            renderPkgDailyTable();
            renderPkgDailyChart();
        }
    }

    fetch('/api/packaging/data/load')
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) packagingData = res.data;
            check();
        })
        .catch(function () { check(); });

    /* 일자별 실적 데이터 로드 (포장실적일자별 내수/수출 건수) */
    fetch('/api/packaging/daily/load')
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) pkgDailyData = res.data;
            check();
        })
        .catch(function () { check(); });

    loadPkgCapa(function () { check(); });
}

/* ── 일자별 실적량 테이블 ── */
var pkgDailyData = {}; // { "2026-08-01": { "포장실적_내수": 0, "포장실적_수출": 0, "포장대기_내수": 0, "포장대기_수출": 0 } }
var pkgDailyYear = new Date().getFullYear();
var pkgDailyMonth = new Date().getMonth() + 1;

function renderPkgDailyTable() {
    var thead = document.getElementById('pkg-daily-thead');
    var tbody = document.getElementById('pkg-daily-tbody');
    if (!thead || !tbody) return;

    var year = pkgDailyYear;
    var month = pkgDailyMonth;
    var daysInMonth = getDaysInMonth(year, month);

    /* 라벨 갱신 */
    var dailyLabel = document.getElementById('pkg-daily-date-label');
    if (dailyLabel) dailyLabel.textContent = year + '년 ' + month + '월';
    var dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    /* ── thead: 1행 — 구분 + 일자 + (요일) — 좌측 2열 sticky ── */
    var thRow = '<tr><th class="pkd-month-head pkd-sticky-col1"></th><th class="pkd-month-head pkd-sticky-col2">' + month + '월</th>';
    for (var d = 1; d <= daysInMonth; d++) {
        var dt = new Date(year, month - 1, d);
        var dow = dt.getDay(); // 0=일
        var dowName = dayNames[dow];
        var dowCls = dow === 0 ? ' pkd-sun' : dow === 6 ? ' pkd-sat' : '';
        thRow += '<th class="pkd-day-head' + dowCls + '">' + d + '일<br><span class="pkd-dow">(' + dowName + ')</span></th>';
    }
    thRow += '</tr>';
    thead.innerHTML = thRow;

    /* ── tbody ── */
    var sections = [
        { cat: '포장실적', rows: ['내수', '수출'], prefix: '포장실적' },
        { cat: '포장대기', rows: ['내수', '수출'], prefix: '포장대기' }
    ];

    var html = '';
    var mm = String(month).padStart(2, '0');
    sections.forEach(function (sec) {
        var pfx = sec.prefix === '포장실적' ? 'act' : 'wait';
        var totalRows = sec.rows.length + 1; // 내수 + 수출 + 계
        sec.rows.forEach(function (rowName, ri) {
            var rowKey = rowName === '내수' ? 'dom' : 'exp';
            html += '<tr class="pkd-data-row">';
            if (ri === 0) {
                html += '<td class="pkd-cat-cell" rowspan="' + totalRows + '">' + sec.cat + '</td>';
            }
            html += '<td class="pkd-div-cell pkd-div-' + (rowName === '내수' ? 'domestic' : 'export') + '">' + rowName + '</td>';
            for (var d = 1; d <= daysInMonth; d++) {
                var dd = String(d).padStart(2, '0');
                var dateKey = year + '-' + mm + '-' + dd;
                var val = (pkgDailyData[dateKey] && pkgDailyData[dateKey][sec.prefix + '_' + rowName]) || 0;
                var cellId = 'pkd-' + pfx + '-' + rowKey + '-' + dd;
                html += '<td class="pkd-val" id="' + cellId + '">' + (val ? Number(val).toLocaleString() : '') + '</td>';
            }
            html += '</tr>';
        });
        /* 계 행 — 내수 + 수출 합산 (자동계산) */
        html += '<tr class="pkd-total-row">';
        html += '<td class="pkd-div-cell pkd-div-total">계</td>';
        for (var d = 1; d <= daysInMonth; d++) {
            var dd = String(d).padStart(2, '0');
            var dateKey = year + '-' + mm + '-' + dd;
            var sum = 0;
            sec.rows.forEach(function (rowName) {
                sum += (pkgDailyData[dateKey] && pkgDailyData[dateKey][sec.prefix + '_' + rowName]) || 0;
            });
            var totalId = 'pkd-' + pfx + '-total-' + dd;
            html += '<td class="pkd-val pkd-val-total" id="' + totalId + '">' + (sum ? Number(sum).toLocaleString() : '') + '</td>';
        }
        html += '</tr>';
    });

    tbody.innerHTML = html;
}

/* ── 일자별 실적 추이 꺾은선 차트 (Chart.js) ── */
var pkgDailyChart = null;

function renderPkgDailyChart() {
    var canvas = document.getElementById('pkg-daily-chart');
    if (!canvas) return;

    var year = pkgDailyYear;
    var month = pkgDailyMonth;
    var daysInMonth = getDaysInMonth(year, month);
    var mm = String(month).padStart(2, '0');

    /* 라벨 갱신 */
    var chartLabel = document.getElementById('pkg-daily-chart-label');
    if (chartLabel) chartLabel.textContent = year + '년 ' + month + '월';

    var labels = [];
    var actData = [];   /* 포장실적 계 (내수+수출) */
    var waitData = [];  /* 포장대기 계 (내수+수출) */

    for (var d = 1; d <= daysInMonth; d++) {
        var dd = String(d).padStart(2, '0');
        var dateKey = year + '-' + mm + '-' + dd;
        labels.push(d + '일');

        var entry = pkgDailyData[dateKey] || {};
        var actSum = (entry['포장실적_내수'] || 0) + (entry['포장실적_수출'] || 0);
        var waitSum = (entry['포장대기_내수'] || 0) + (entry['포장대기_수출'] || 0);
        actData.push(actSum ? parseFloat(actSum.toFixed(1)) : null);
        waitData.push(waitSum ? parseFloat(waitSum.toFixed(1)) : null);
    }

    if (pkgDailyChart) {
        pkgDailyChart.data.labels = labels;
        pkgDailyChart.data.datasets[0].data = actData;
        pkgDailyChart.data.datasets[1].data = waitData;
        pkgDailyChart.update();
        return;
    }

    pkgDailyChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '포장실적',
                    data: actData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    borderWidth: 2.5,
                    spanGaps: true
                },
                {
                    label: '포장대기',
                    data: waitData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.08)',
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    borderWidth: 2.5,
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 8,
                        padding: 16,
                        font: { size: 12, weight: '600' },
                        color: '#334155'
                    }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleFont: { size: 12 },
                    bodyFont: { size: 13, weight: '600' },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function (ctx) {
                            var val = ctx.parsed.y;
                            if (val === null || val === undefined) return ctx.dataset.label + ': —';
                            return ctx.dataset.label + ': ' + Number(val).toLocaleString() + ' ton';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10 },
                        color: '#64748b',
                        maxRotation: 0
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: { size: 11 },
                        color: '#64748b',
                        callback: function (v) { return Number(v).toLocaleString(); }
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
}

function initPackaging() {
    var now = new Date();
    var monthDay = (now.getMonth() + 1) + '월 ' + now.getDate() + '일 기준';

    /* 시스템 날짜 기준 라벨 */
    var dateLabel = document.getElementById('pkg-date-label');
    if (dateLabel) dateLabel.textContent = monthDay;

    /* 년도 선택 필터 초기화 */
    var yearSelect = document.getElementById('pkg-year-filter');
    if (yearSelect) {
        var curYear = now.getFullYear();
        for (var y = curYear; y >= curYear - 5; y--) {
            var opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y + '년';
            if (y === pkgSelectedYear) opt.selected = true;
            yearSelect.appendChild(opt);
        }
        yearSelect.addEventListener('change', function () {
            pkgSelectedYear = parseInt(this.value);
            /* CAPA 다시 로드 후 테이블+차트 재렌더링 */
            loadPkgCapa(function () {
                renderPackagingSummary();
            });
        });
    }

    /* 일자별 실적량 — 월 선택 필터 초기화 */
    var monthFilter = document.getElementById('pkg-daily-month-filter');
    if (monthFilter) {
        var curY = now.getFullYear();
        var curM = now.getMonth() + 1;
        /* 최근 12개월 옵션 생성 (현재월 → 과거 11개월) */
        for (var i = 0; i < 12; i++) {
            var ym = curM - i;
            var yy = curY;
            if (ym <= 0) { ym += 12; yy--; }
            var opt = document.createElement('option');
            opt.value = yy + '-' + String(ym).padStart(2, '0');
            opt.textContent = yy + '년 ' + ym + '월';
            if (yy === pkgDailyYear && ym === pkgDailyMonth) opt.selected = true;
            monthFilter.appendChild(opt);
        }
        monthFilter.addEventListener('change', function () {
            var parts = this.value.split('-');
            pkgDailyYear = parseInt(parts[0]);
            pkgDailyMonth = parseInt(parts[1]);
            renderPkgDailyTable();
            renderPkgDailyChart();
        });
    }

    loadPackagingData();
}

/* ── 앱 시작 ── */
document.addEventListener('DOMContentLoaded', init);
