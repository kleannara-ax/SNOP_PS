#!/usr/bin/env python3
"""
PS S&OP 계획 시스템 — 백엔드 API 서버
- 정적 파일 서빙 (web/ 디렉토리)
- 사용자 인증 (MariaDB / JSON 폴백)
- 진부화재고 사용자 수정값 저장/조회 API
- JSON 파일 기반 영속 저장 (DB 연동 전 임시)
- ref_date + confirmed 관리 (날짜별 확정 처리)
- SAP 연동 시뮬레이션 엔드포인트
"""

import json
import os
import bcrypt
from datetime import datetime, date
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from config import DB_CONFIG, USE_DB, FALLBACK_USERS

app = Flask(__name__, static_folder='web', static_url_path='')
CORS(app)

# 데이터 저장 경로
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DATA_FILE = os.path.join(DATA_DIR, 'obsolete_inventory_edits.json')

os.makedirs(DATA_DIR, exist_ok=True)


# ─── DB 연결 ───
_db_available = False

def get_db_connection():
    """MariaDB 연결 반환. 실패 시 None."""
    global _db_available
    if not USE_DB:
        return None
    try:
        import pymysql
        conn = pymysql.connect(
            host=DB_CONFIG['host'],
            port=DB_CONFIG['port'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            database=DB_CONFIG['database'],
            charset=DB_CONFIG.get('charset', 'utf8mb4'),
            cursorclass=pymysql.cursors.DictCursor,
        )
        _db_available = True
        return conn
    except Exception as e:
        if _db_available:
            print(f'[DB] MariaDB 연결 실패 — JSON 폴백 모드 사용: {e}')
        _db_available = False
        return None


def verify_user_db(user_id, password):
    """DB에서 사용자 인증. 성공 시 사용자 dict, 실패 시 None."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                'SELECT user_id, user_name, password, role, use_yn '
                'FROM ps_users WHERE user_id = %s',
                (user_id,)
            )
            user = cursor.fetchone()
            if not user:
                return None
            if user['use_yn'] != 'Y':
                return None
            # bcrypt 비밀번호 검증
            if not bcrypt.checkpw(password.encode('utf-8'),
                                  user['password'].encode('utf-8')):
                return None
            # 최종 로그인 일시 갱신
            cursor.execute(
                'UPDATE ps_users SET last_login_dt = NOW() WHERE user_id = %s',
                (user_id,)
            )
            conn.commit()
            return {
                'user_id': user['user_id'],
                'user_name': user['user_name'],
                'role': user['role'],
            }
    except Exception as e:
        print(f'[AUTH] DB 인증 오류: {e}')
        return None
    finally:
        conn.close()


def verify_user_fallback(user_id, password):
    """JSON 폴백: config.py의 FALLBACK_USERS로 인증."""
    user = FALLBACK_USERS.get(user_id)
    if not user:
        return None
    if user['password'] != password:
        return None
    return {
        'user_id': user['user_id'],
        'user_name': user['user_name'],
        'role': user['role'],
    }


def verify_user(user_id, password):
    """사용자 인증 — DB 우선, 실패 시 JSON 폴백."""
    # 1) DB 인증 시도
    result = verify_user_db(user_id, password)
    if result:
        return result
    # 2) DB 연결 안 되면 JSON 폴백
    if not _db_available:
        return verify_user_fallback(user_id, password)
    return None


# ─── 유틸리티 ───
def load_saved_data():
    """저장된 수정 데이터를 JSON 파일에서 읽기"""
    if not os.path.exists(DATA_FILE):
        return {}
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_data(data):
    """수정 데이터를 JSON 파일에 저장"""
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def today_str():
    """오늘 날짜 문자열 (YYYY-MM-DD)"""
    return date.today().isoformat()


# ─── 정적 파일 서빙 ───
@app.route('/')
def index():
    return send_from_directory('web', 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('web', filename)


# ─── API: 로그인 인증 ───
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    """
    사용자 로그인 인증
    Request Body: { "user_id": "admin", "password": "snop2026!" }
    Response (성공): { "success": true, "user_id": "admin", "user_name": "관리자", "role": "ADMIN" }
    Response (실패): { "success": false, "message": "..." }
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'message': '요청 데이터가 없습니다'}), 400

    user_id = (body.get('user_id') or '').strip()
    password = body.get('password') or ''

    if not user_id or not password:
        return jsonify({'success': False, 'message': '아이디와 비밀번호를 입력해주세요'}), 400

    user = verify_user(user_id, password)
    if not user:
        return jsonify({'success': False, 'message': '아이디 또는 비밀번호가 올바르지 않습니다'}), 401

    print(f'[AUTH] 로그인 성공: {user_id} ({user["role"]})'
          f'{" [DB]" if _db_available else " [폴백]"}')

    return jsonify({
        'success': True,
        'user_id': user['user_id'],
        'user_name': user['user_name'],
        'role': user['role'],
    })


# ─── API: 저장된 수정값 조회 ───
@app.route('/api/obsolete-inventory/load', methods=['GET'])
def api_load():
    """
    저장된 사용자 수정값 전체 조회
    Response: {
        "data": { "PS10::RM-2024-00451": { ... }, ... },
        "count": N,
        "ref_date": "2026-04-29"
    }
    """
    saved = load_saved_data()
    return jsonify({
        'success': True,
        'data': saved,
        'count': len(saved),
        'ref_date': today_str(),
    })


# ─── API: 수정값 저장 (확정 처리 포함) ───
@app.route('/api/obsolete-inventory/save', methods=['POST'])
def api_save():
    """
    사용자 수정값 저장 + 확정 처리
    Request Body: {
        "items": [ { plant_code, material_code, out_sales_adj, ... }, ... ],
        "updated_by": "user"
    }
    - 기존 저장 데이터에 병합 (해당 plant::material 키만 갱신)
    - confirmed_yn = 'Y', confirmed_by/confirmed_dt 기록
    """
    body = request.get_json(silent=True)
    if not body or 'items' not in body:
        return jsonify({'success': False, 'error': '요청 데이터가 없습니다'}), 400

    items = body['items']
    updated_by = body.get('updated_by', 'admin')

    if not isinstance(items, list) or len(items) == 0:
        return jsonify({'success': False, 'error': '저장할 항목이 없습니다'}), 400

    # 기존 데이터 로드 후 병합
    saved = load_saved_data()
    now = datetime.now().isoformat()
    ref = today_str()

    for item in items:
        plant = item.get('plant_code', '')
        material = item.get('material_code', '')
        if not plant or not material:
            continue

        key = f"{plant}::{material}"

        # 기존 데이터가 있으면 유지할 필드 보존
        existing = saved.get(key, {})

        saved[key] = {
            'plant_code': plant,
            'material_code': material,
            'out_sales_adj': item.get('out_sales_adj', 0),
            'out_sales_adj_modified': 'Y',       # 사용자가 저장 → 매출(수정) 수정됨 플래그
            'out_mill_roll_adj': item.get('out_mill_roll_adj', 0),
            'out_mill_roll_adj_modified': 'Y',    # 사용자가 저장 → 밀롤(수정) 수정됨 플래그
            'out_disposal': item.get('out_disposal', 0),
            'out_etc_adj': item.get('out_etc_adj', 0),
            # 확정 관리 필드
            'ref_date': ref,
            'confirmed_yn': 'Y',
            'confirmed_by': updated_by,
            'confirmed_dt': now,
            # 시스템 필드
            'updated_by': updated_by,
            'updated_dt': now,
        }

    # 파일에 저장
    save_data(saved)

    return jsonify({
        'success': True,
        'message': f'{len(items)}건 저장 완료 (확정 처리)',
        'saved_count': len(items),
        'updated_dt': now,
        'ref_date': ref,
        'confirmed_yn': 'Y',
    })


# ─── API: 기준정보 동기화 (RFC 'M' 시뮬레이션) ───
@app.route('/api/obsolete-inventory/sync-master', methods=['POST'])
def api_sync_master():
    """
    기준정보(마스터) 동기화 — RFC Z_SNOP_PS_OBSOLETE_INV_GET (IV_SYNC_TYPE='M') 시뮬레이션
    - 사용자 버튼 클릭으로 호출 (월 1회 권장, 필요 시 수시)
    - 마스터 필드 갱신: base_age, base_weight, base_amount, plan_age, plan_weight, plan_amount
    - 사용자 수정값(out_*) 및 확정 상태는 변경하지 않음
    """
    body = request.get_json(silent=True) or {}
    requested_by = body.get('requested_by', 'admin')

    # 시뮬레이션: SAP에서 마스터 데이터를 가져왔다고 가정
    # 실제 운영에서는 pyrfc 등으로 RFC 호출 후 결과를 DB에 반영
    import random
    simulated_master = {
        'PS10::F3SM1280-08251120B': {
            'base_age': random.randint(180, 365),
            'base_weight': random.randint(500, 2000),
            'base_amount': random.randint(1000, 5000),
            'plan_age': random.randint(90, 180),
            'plan_weight': random.randint(300, 1500),
            'plan_amount': random.randint(500, 3000),
        },
        'PS10::F3SM2150-10120930A': {
            'base_age': random.randint(180, 365),
            'base_weight': random.randint(500, 2000),
            'base_amount': random.randint(1000, 5000),
            'plan_age': random.randint(90, 180),
            'plan_weight': random.randint(300, 1500),
            'plan_amount': random.randint(500, 3000),
        },
        'PS10::H2RL1120-05180740C': {
            'base_age': random.randint(180, 365),
            'base_weight': random.randint(500, 2000),
            'base_amount': random.randint(1000, 5000),
            'plan_age': random.randint(90, 180),
            'plan_weight': random.randint(300, 1500),
            'plan_amount': random.randint(500, 3000),
        },
    }

    now = datetime.now().isoformat()

    # 동기화 이력 저장 (별도 파일)
    sync_log_file = os.path.join(DATA_DIR, 'master_sync_log.json')
    try:
        with open(sync_log_file, 'r', encoding='utf-8') as f:
            sync_log = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        sync_log = {}

    sync_log['last_sync_dt'] = now
    sync_log['last_sync_by'] = requested_by
    sync_log['sync_count'] = sync_log.get('sync_count', 0) + 1
    sync_log['last_item_count'] = len(simulated_master)

    with open(sync_log_file, 'w', encoding='utf-8') as f:
        json.dump(sync_log, f, ensure_ascii=False, indent=2)

    return jsonify({
        'success': True,
        'message': f'기준정보 동기화 완료 — {len(simulated_master)}건 갱신',
        'synced_count': len(simulated_master),
        'sync_dt': now,
        'requested_by': requested_by,
        'master_data': simulated_master,
    })


# ─── API: 기준정보 동기화 상태 조회 ───
@app.route('/api/obsolete-inventory/sync-master/status', methods=['GET'])
def api_sync_master_status():
    """최종 기준정보 동기화 일시 조회"""
    sync_log_file = os.path.join(DATA_DIR, 'master_sync_log.json')
    try:
        with open(sync_log_file, 'r', encoding='utf-8') as f:
            sync_log = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        sync_log = {}

    return jsonify({
        'success': True,
        'last_sync_dt': sync_log.get('last_sync_dt'),
        'last_sync_by': sync_log.get('last_sync_by'),
        'sync_count': sync_log.get('sync_count', 0),
        'last_item_count': sync_log.get('last_item_count', 0),
    })


# ─── API: SAP 연동 시뮬레이션 ───
@app.route('/api/obsolete-inventory/sap-sync', methods=['POST'])
def api_sap_sync():
    """
    SAP 일별 연동 시뮬레이션 (RFC 'D' 테스트용)
    - 모든 자재에 대해:
      · ref_date → 오늘로 갱신
      · 매출(수정): 사용자 수정 이력 있으면(이번 달) → 유지, 없으면 → SAP값 세팅
      · 밀롤(수정): 사용자 수정 이력 있으면(이번 달) → 유지, 없으면 → SAP값 세팅
      · 기타출고(수정) → 항상 SAP 새 값으로 리셋
      · 폐기 → 사용자 입력값 유지 (SAP 무관)
      · confirmed_yn → 'N' (미확정) 리셋
      · 월 변경 시: 모든 _modified 플래그 리셋 → SAP값으로 초기화
    """
    saved = load_saved_data()
    now = datetime.now().isoformat()
    ref = today_str()
    this_month = ref[:7]  # "2026-05" 형태
    reset_count = 0
    kept_sales = 0
    kept_mill = 0

    # 시뮬레이션용 SAP I/F 값 (실제 운영에서는 RFC 'D' 호출 결과로 대체)
    import random
    sap_simulated = {}
    for key in saved:
        sap_simulated[key] = {
            'out_sales_adj': round(random.uniform(0, 50), 2),
            'out_mill_roll_adj': round(random.uniform(0, 30), 2),
            'out_etc_adj': round(random.uniform(0, 10), 2),
        }

    for key, item in saved.items():
        sap_values = sap_simulated.get(key, {})
        confirmed_dt = item.get('confirmed_dt') or ''
        confirmed_month = confirmed_dt[:7] if confirmed_dt else ''
        is_this_month = (confirmed_month == this_month)

        # ── 매출(수정): 사용자 수정 이력(이번 달) 있으면 유지, 없으면 SAP값 ──
        if is_this_month and item.get('out_sales_adj_modified') == 'Y':
            kept_sales += 1
            # 사용자 저장값 유지 (덮어쓰지 않음)
        else:
            item['out_sales_adj'] = sap_values.get('out_sales_adj', 0)
            item['out_sales_adj_modified'] = 'N'

        # ── 밀롤(수정): 동일 로직 ──
        if is_this_month and item.get('out_mill_roll_adj_modified') == 'Y':
            kept_mill += 1
            # 사용자 저장값 유지
        else:
            item['out_mill_roll_adj'] = sap_values.get('out_mill_roll_adj', 0)
            item['out_mill_roll_adj_modified'] = 'N'

        # ── 기타출고(수정): 항상 SAP 값으로 리셋 ──
        item['out_etc_adj'] = sap_values.get('out_etc_adj', 0)

        # ── 폐기: 항상 사용자 입력값 유지 (SAP 무관) ──
        # item['out_disposal'] 는 그대로 유지

        # ref_date 갱신 + 확정 리셋
        item['ref_date'] = ref
        item['confirmed_yn'] = 'N'
        item['confirmed_by'] = None
        item['confirmed_dt'] = None
        item['last_sync_dt'] = now
        item['updated_by'] = 'SAP_INTERFACE'
        item['updated_dt'] = now

        reset_count += 1

    save_data(saved)

    return jsonify({
        'success': True,
        'message': f'SAP 연동 시뮬레이션 완료 — {reset_count}건 처리 '
                   f'(매출 유지: {kept_sales}건, 밀롤 유지: {kept_mill}건)',
        'reset_count': reset_count,
        'kept_sales_count': kept_sales,
        'kept_mill_count': kept_mill,
        'ref_date': ref,
        'sync_dt': now,
    })


# ─── API: 확정 상태 조회 ───
@app.route('/api/obsolete-inventory/status', methods=['GET'])
def api_status():
    """
    현재 확정 상태 요약 조회
    Response: {
        "ref_date": "2026-04-29",
        "total": 7,
        "confirmed": 3,
        "unconfirmed": 4,
        "items": { "PS10::F3SM1280-08251120B": { confirmed_yn, confirmed_dt, ... }, ... }
    }
    """
    saved = load_saved_data()
    confirmed = sum(1 for v in saved.values() if v.get('confirmed_yn') == 'Y')
    unconfirmed = len(saved) - confirmed

    status_items = {}
    for key, item in saved.items():
        status_items[key] = {
            'confirmed_yn': item.get('confirmed_yn', 'N'),
            'confirmed_by': item.get('confirmed_by'),
            'confirmed_dt': item.get('confirmed_dt'),
            'ref_date': item.get('ref_date'),
        }

    return jsonify({
        'success': True,
        'ref_date': today_str(),
        'total': len(saved),
        'confirmed': confirmed,
        'unconfirmed': unconfirmed,
        'items': status_items,
    })


# ═══════════════════════════════════════════════════
# 인터페이스 관리 API
# ═══════════════════════════════════════════════════

IF_MASTER_FILE = os.path.join(DATA_DIR, 'interface_master.json')
IF_SCHEDULE_FILE = os.path.join(DATA_DIR, 'interface_schedule.json')
IF_HISTORY_FILE = os.path.join(DATA_DIR, 'interface_history.json')

# ─── 슬리터 일자별 상세 내역 데이터 파일 ───
SLITTER_DETAIL_FILE = os.path.join(DATA_DIR, 'slitter_detail.json')

# ─── 슬리터 외주 진행 내역 데이터 파일 ───
SLITTER_OUTSOURCE_FILE = os.path.join(DATA_DIR, 'slitter_outsource.json')

# ─── 슬리터 수불부 데이터 파일 (기말 자동저장) ───
SLITTER_SUBULBU_FILE = os.path.join(DATA_DIR, 'slitter_subulbu.json')

# ─── 슬리터 수불부 작업 데이터 파일 (I/F 내수/수출) ───
SLITTER_SUBULBU_WORK_FILE = os.path.join(DATA_DIR, 'slitter_subulbu_work.json')

# ─── 밀롤창고 재공현황 데이터 파일 ───
MILLROLL_INVENTORY_FILE = os.path.join(DATA_DIR, 'millroll_inventory.json')
MILLROLL_DAILY_FILE = os.path.join(DATA_DIR, 'millroll_daily.json')
MILLROLL_AGING_FILE = os.path.join(DATA_DIR, 'millroll_aging.json')

# ─── 수작업 생산계획 데이터 파일 ───
MANUAL_PLAN_FILE = os.path.join(DATA_DIR, 'manual_plan.json')


def load_json_file(filepath, default=None):
    """JSON 파일 로드 — 없거나 파싱 실패 시 default 반환"""
    if default is None:
        default = []
    if not os.path.exists(filepath):
        return default
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return default


def save_json_file(filepath, data):
    """JSON 파일 저장"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def init_interface_sample_data():
    """인터페이스 관리 샘플 데이터 초기화 — 파일이 없을 때만 생성"""
    if not os.path.exists(IF_MASTER_FILE):
        masters = [
            {
                'if_id': 'SNOP_RFC_001',
                'if_name': '진부화재고 마스터 동기화',
                'sender': 'SAP',
                'receiver': 'SNOP',
                'rfc_url': 'Z_SNOP_PS_OBSOLETE_INV_GET',
                'rfc_param': "IV_SYNC_TYPE='M'",
                'exec_command': 'python sync_master.py',
                'created_by': 'admin',
                'updated_by': 'admin',
                'created_dt': '2026-04-01T09:00:00',
                'updated_dt': '2026-04-15T14:30:00',
            },
            {
                'if_id': 'SNOP_RFC_002',
                'if_name': '진부화재고 일별 동기화',
                'sender': 'SAP',
                'receiver': 'SNOP',
                'rfc_url': 'Z_SNOP_PS_OBSOLETE_INV_GET',
                'rfc_param': "IV_SYNC_TYPE='D'",
                'exec_command': 'python sync_daily.py',
                'created_by': 'admin',
                'updated_by': 'planner01',
                'created_dt': '2026-04-01T09:00:00',
                'updated_dt': '2026-05-02T10:15:00',
            },
            {
                'if_id': 'SNOP_RFC_003',
                'if_name': 'SAP 자재마스터 연동',
                'sender': 'SAP',
                'receiver': 'SNOP',
                'rfc_url': 'Z_SNOP_MAT_MASTER_GET',
                'rfc_param': "IV_WERKS='PS10'",
                'exec_command': 'python sync_material.py',
                'created_by': 'admin',
                'updated_by': 'admin',
                'created_dt': '2026-03-15T10:00:00',
                'updated_dt': '2026-03-15T10:00:00',
            },
            {
                'if_id': 'SNOP_RFC_004',
                'if_name': 'SAP 재고 동기화',
                'sender': 'SAP',
                'receiver': 'SNOP',
                'rfc_url': 'Z_SNOP_STOCK_GET',
                'rfc_param': "IV_WERKS='PS10,PS20'",
                'exec_command': 'python sync_stock.py',
                'created_by': 'admin',
                'updated_by': 'admin',
                'created_dt': '2026-03-20T11:00:00',
                'updated_dt': '2026-04-10T09:00:00',
            },
            {
                'if_id': 'SNOP_REST_005',
                'if_name': '판매실적 연동',
                'sender': 'SFA',
                'receiver': 'SNOP',
                'rfc_url': '/api/v1/sales/actuals',
                'rfc_param': '',
                'exec_command': 'python sync_sales.py',
                'created_by': 'planner01',
                'updated_by': 'planner01',
                'created_dt': '2026-04-05T14:00:00',
                'updated_dt': '2026-04-05T14:00:00',
            },
            {
                'if_id': 'SNOP_REST_006',
                'if_name': '생산실적 연동',
                'sender': 'MES',
                'receiver': 'SNOP',
                'rfc_url': '/api/v1/production/results',
                'rfc_param': '',
                'exec_command': 'python sync_production.py',
                'created_by': 'admin',
                'updated_by': 'admin',
                'created_dt': '2026-04-10T16:00:00',
                'updated_dt': '2026-04-10T16:00:00',
            },
        ]
        save_json_file(IF_MASTER_FILE, masters)

    if not os.path.exists(IF_SCHEDULE_FILE):
        schedules = [
            {
                'if_id': 'SNOP_RFC_001',
                'if_name': '진부화재고 마스터 동기화',
                'cycle': '월간',
                'schedule_time': '매월 1일 06:00',
                'active': True,
                'last_exec_dt': '2026-05-01T06:00:12',
                'last_exec_status': '성공',
                'next_exec_dt': '2026-06-01T06:00:00',
                'remark': '월초 마스터 갱신',
                'created_by': 'admin',
            },
            {
                'if_id': 'SNOP_RFC_002',
                'if_name': '진부화재고 일별 동기화',
                'cycle': '일간',
                'schedule_time': '매일 07:30',
                'active': True,
                'last_exec_dt': '2026-05-11T07:30:05',
                'last_exec_status': '성공',
                'next_exec_dt': '2026-05-12T07:30:00',
                'remark': '',
                'created_by': 'admin',
            },
            {
                'if_id': 'SNOP_RFC_003',
                'if_name': 'SAP 자재마스터 연동',
                'cycle': '일간',
                'schedule_time': '매일 06:00',
                'active': True,
                'last_exec_dt': '2026-05-11T06:00:08',
                'last_exec_status': '성공',
                'next_exec_dt': '2026-05-12T06:00:00',
                'remark': '',
                'created_by': 'admin',
            },
            {
                'if_id': 'SNOP_RFC_004',
                'if_name': 'SAP 재고 동기화',
                'cycle': '시간',
                'schedule_time': '매시 정각',
                'active': True,
                'last_exec_dt': '2026-05-11T10:00:03',
                'last_exec_status': '에러',
                'next_exec_dt': '2026-05-11T11:00:00',
                'remark': 'Connection timeout 발생',
                'created_by': 'admin',
            },
            {
                'if_id': 'SNOP_REST_005',
                'if_name': '판매실적 연동',
                'cycle': '일간',
                'schedule_time': '매일 08:00',
                'active': False,
                'last_exec_dt': '2026-04-30T08:00:15',
                'last_exec_status': '성공',
                'next_exec_dt': '',
                'remark': '시스템 점검으로 비활성',
                'created_by': 'planner01',
            },
            {
                'if_id': 'SNOP_REST_006',
                'if_name': '생산실적 연동',
                'cycle': '일간',
                'schedule_time': '매일 09:00',
                'active': False,
                'last_exec_dt': '',
                'last_exec_status': '',
                'next_exec_dt': '',
                'remark': '개발 중',
                'created_by': 'admin',
            },
        ]
        save_json_file(IF_SCHEDULE_FILE, schedules)

    if not os.path.exists(IF_HISTORY_FILE):
        histories = [
            {
                'no': 1,
                'if_id': 'SNOP_RFC_002',
                'if_name': '진부화재고 일별 동기화',
                'exec_type': '자동',
                'start_dt': '2026-05-11T07:30:00',
                'end_dt': '2026-05-11T07:30:05',
                'elapsed_ms': 5230,
                'processed_cnt': 7,
                'unprocessed_cnt': 0,
                'status': '성공',
                'error_msg': '',
                'exec_command': 'python sync_daily.py',
            },
            {
                'no': 2,
                'if_id': 'SNOP_RFC_003',
                'if_name': 'SAP 자재마스터 연동',
                'exec_type': '자동',
                'start_dt': '2026-05-11T06:00:00',
                'end_dt': '2026-05-11T06:00:08',
                'elapsed_ms': 8120,
                'processed_cnt': 152,
                'unprocessed_cnt': 0,
                'status': '성공',
                'error_msg': '',
                'exec_command': 'python sync_material.py',
            },
            {
                'no': 3,
                'if_id': 'SNOP_RFC_004',
                'if_name': 'SAP 재고 동기화',
                'exec_type': '자동',
                'start_dt': '2026-05-11T10:00:00',
                'end_dt': '2026-05-11T10:00:03',
                'elapsed_ms': 3450,
                'processed_cnt': 0,
                'unprocessed_cnt': 45,
                'status': '에러',
                'error_msg': 'RFC Connection timeout: SAP gateway unreachable',
                'exec_command': 'python sync_stock.py',
            },
            {
                'no': 4,
                'if_id': 'SNOP_RFC_004',
                'if_name': 'SAP 재고 동기화',
                'exec_type': '자동',
                'start_dt': '2026-05-11T09:00:00',
                'end_dt': '2026-05-11T09:00:04',
                'elapsed_ms': 4200,
                'processed_cnt': 45,
                'unprocessed_cnt': 0,
                'status': '성공',
                'error_msg': '',
                'exec_command': 'python sync_stock.py',
            },
            {
                'no': 5,
                'if_id': 'SNOP_RFC_001',
                'if_name': '진부화재고 마스터 동기화',
                'exec_type': '수동',
                'start_dt': '2026-05-10T14:22:00',
                'end_dt': '2026-05-10T14:22:12',
                'elapsed_ms': 12340,
                'processed_cnt': 7,
                'unprocessed_cnt': 0,
                'status': '성공',
                'error_msg': '',
                'exec_command': 'python sync_master.py',
            },
            {
                'no': 6,
                'if_id': 'SNOP_RFC_002',
                'if_name': '진부화재고 일별 동기화',
                'exec_type': '자동',
                'start_dt': '2026-05-10T07:30:00',
                'end_dt': '2026-05-10T07:30:06',
                'elapsed_ms': 6100,
                'processed_cnt': 7,
                'unprocessed_cnt': 0,
                'status': '성공',
                'error_msg': '',
                'exec_command': 'python sync_daily.py',
            },
            {
                'no': 7,
                'if_id': 'SNOP_RFC_003',
                'if_name': 'SAP 자재마스터 연동',
                'exec_type': '자동',
                'start_dt': '2026-05-10T06:00:00',
                'end_dt': '2026-05-10T06:00:09',
                'elapsed_ms': 9450,
                'processed_cnt': 148,
                'unprocessed_cnt': 4,
                'status': '성공',
                'error_msg': '',
                'exec_command': 'python sync_material.py',
            },
            {
                'no': 8,
                'if_id': 'SNOP_REST_005',
                'if_name': '판매실적 연동',
                'exec_type': '자동',
                'start_dt': '2026-04-30T08:00:00',
                'end_dt': '2026-04-30T08:00:15',
                'elapsed_ms': 15200,
                'processed_cnt': 320,
                'unprocessed_cnt': 0,
                'status': '성공',
                'error_msg': '',
                'exec_command': 'python sync_sales.py',
            },
        ]
        save_json_file(IF_HISTORY_FILE, histories)


# 앱 시작 시 샘플 데이터 초기화
init_interface_sample_data()


# ─── API: 인터페이스 마스터 조회 ───
@app.route('/api/interface/master', methods=['GET'])
def api_if_master_list():
    """인터페이스 마스터 목록 조회"""
    masters = load_json_file(IF_MASTER_FILE, [])
    return jsonify({'success': True, 'data': masters, 'count': len(masters)})


# ─── API: 인터페이스 마스터 등록/수정 ───
@app.route('/api/interface/master', methods=['POST'])
def api_if_master_save():
    """인터페이스 마스터 등록 또는 수정"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'error': '요청 데이터가 없습니다'}), 400

    masters = load_json_file(IF_MASTER_FILE, [])
    if_id = body.get('if_id', '').strip()
    now = datetime.now().isoformat()
    user = body.get('updated_by', 'admin')

    # 기존 항목 찾기
    existing_idx = next((i for i, m in enumerate(masters) if m['if_id'] == if_id), -1)

    item = {
        'if_id': if_id,
        'if_name': body.get('if_name', ''),
        'sender': body.get('sender', ''),
        'receiver': body.get('receiver', ''),
        'rfc_url': body.get('rfc_url', ''),
        'rfc_param': body.get('rfc_param', ''),
        'exec_command': body.get('exec_command', ''),
        'updated_by': user,
        'updated_dt': now,
    }

    if existing_idx >= 0:
        # 수정
        item['created_by'] = masters[existing_idx].get('created_by', user)
        item['created_dt'] = masters[existing_idx].get('created_dt', now)
        masters[existing_idx] = item
        msg = f'인터페이스 [{if_id}] 수정 완료'
    else:
        # 신규
        item['created_by'] = user
        item['created_dt'] = now
        masters.append(item)
        msg = f'인터페이스 [{if_id}] 등록 완료'

    save_json_file(IF_MASTER_FILE, masters)
    return jsonify({'success': True, 'message': msg, 'item': item})


# ─── API: 인터페이스 마스터 삭제 ───
@app.route('/api/interface/master/<if_id>', methods=['DELETE'])
def api_if_master_delete(if_id):
    """인터페이스 마스터 삭제"""
    masters = load_json_file(IF_MASTER_FILE, [])
    new_masters = [m for m in masters if m['if_id'] != if_id]
    if len(new_masters) == len(masters):
        return jsonify({'success': False, 'error': f'인터페이스 [{if_id}]를 찾을 수 없습니다'}), 404
    save_json_file(IF_MASTER_FILE, new_masters)

    # 스케줄에서도 삭제
    schedules = load_json_file(IF_SCHEDULE_FILE, [])
    schedules = [s for s in schedules if s['if_id'] != if_id]
    save_json_file(IF_SCHEDULE_FILE, schedules)

    return jsonify({'success': True, 'message': f'인터페이스 [{if_id}] 삭제 완료'})


# ─── API: 인터페이스 스케줄 조회 ───
@app.route('/api/interface/schedule', methods=['GET'])
def api_if_schedule_list():
    """인터페이스 수행관리(스케줄) 목록 조회"""
    schedules = load_json_file(IF_SCHEDULE_FILE, [])
    return jsonify({'success': True, 'data': schedules, 'count': len(schedules)})


# ─── API: 인터페이스 스케줄 수정 ───
@app.route('/api/interface/schedule', methods=['POST'])
def api_if_schedule_save():
    """인터페이스 스케줄 수정 (활성/비활성 토글 포함)"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'error': '요청 데이터가 없습니다'}), 400

    schedules = load_json_file(IF_SCHEDULE_FILE, [])
    if_id = body.get('if_id', '').strip()
    idx = next((i for i, s in enumerate(schedules) if s['if_id'] == if_id), -1)

    if idx < 0:
        return jsonify({'success': False, 'error': f'스케줄 [{if_id}]을 찾을 수 없습니다'}), 404

    # 업데이트 가능 필드
    for field in ['cycle', 'schedule_time', 'active', 'remark']:
        if field in body:
            schedules[idx][field] = body[field]

    save_json_file(IF_SCHEDULE_FILE, schedules)
    return jsonify({'success': True, 'message': f'스케줄 [{if_id}] 수정 완료', 'item': schedules[idx]})


# ─── API: 인터페이스 수동 실행 ───
@app.route('/api/interface/execute/<if_id>', methods=['POST'])
def api_if_execute(if_id):
    """인터페이스 수동 실행 (시뮬레이션)"""
    import random
    import time

    masters = load_json_file(IF_MASTER_FILE, [])
    master = next((m for m in masters if m['if_id'] == if_id), None)
    if not master:
        return jsonify({'success': False, 'error': f'인터페이스 [{if_id}]를 찾을 수 없습니다'}), 404

    start_dt = datetime.now()
    # 시뮬레이션: 랜덤 처리
    elapsed_ms = random.randint(1000, 15000)
    is_success = random.random() > 0.15  # 85% 성공률
    processed = random.randint(1, 200) if is_success else 0
    unprocessed = 0 if is_success else random.randint(1, 50)
    error_msg = '' if is_success else 'Simulated error: Connection timeout'
    status = '성공' if is_success else '에러'

    end_dt = start_dt
    now_iso = start_dt.isoformat()

    # 이력 추가
    histories = load_json_file(IF_HISTORY_FILE, [])
    max_no = max((h.get('no', 0) for h in histories), default=0)
    new_entry = {
        'no': max_no + 1,
        'if_id': if_id,
        'if_name': master['if_name'],
        'exec_type': '수동',
        'start_dt': now_iso,
        'end_dt': now_iso,
        'elapsed_ms': elapsed_ms,
        'processed_cnt': processed,
        'unprocessed_cnt': unprocessed,
        'status': status,
        'error_msg': error_msg,
        'exec_command': master.get('exec_command', ''),
    }
    histories.insert(0, new_entry)
    save_json_file(IF_HISTORY_FILE, histories)

    # 스케줄 마지막 수행 업데이트
    schedules = load_json_file(IF_SCHEDULE_FILE, [])
    for s in schedules:
        if s['if_id'] == if_id:
            s['last_exec_dt'] = now_iso
            s['last_exec_status'] = status
            break
    save_json_file(IF_SCHEDULE_FILE, schedules)

    return jsonify({
        'success': True,
        'message': f'인터페이스 [{if_id}] 수동 실행 {status}',
        'result': new_entry,
    })


# ─── API: 인터페이스 이력 조회 ───
@app.route('/api/interface/history', methods=['GET'])
def api_if_history_list():
    """인터페이스 수행 이력 조회 (필터 지원)"""
    histories = load_json_file(IF_HISTORY_FILE, [])

    # 필터
    filter_status = request.args.get('status', '').strip()
    filter_if_id = request.args.get('if_id', '').strip()

    if filter_status:
        histories = [h for h in histories if h.get('status') == filter_status]
    if filter_if_id:
        histories = [h for h in histories if h.get('if_id') == filter_if_id]

    return jsonify({'success': True, 'data': histories, 'count': len(histories)})


# ═══════════════════════════════════════════════
# 슬리터 일자별 상세 내역 API
# ═══════════════════════════════════════════════
# DB 스키마 (JSON 기반):
# ┌─────────────────────────────────────────────────────────────────┐
# │ 테이블명: slitter_detail                                        │
# ├───────────────┬──────────┬────────────────────────────────────┤
# │ 필드명         │ 타입      │ 설명                               │
# ├───────────────┼──────────┼────────────────────────────────────┤
# │ year_month     │ string   │ 대상 월 (YYYY-MM), PK 역할         │
# │ rows           │ array    │ 행 데이터 리스트                    │
# │  └ id          │ string   │ 행 고유 ID (UUID)                   │
# │  └ date        │ string   │ 일자 (YYYY-MM-DD)                   │
# │  └ domestic    │ string   │ 내수구분 (내수/수출)                 │
# │  └ paper_code  │ string   │ 지종코드                            │
# │  └ basis_weight│ number   │ 평량 (g/㎡)                         │
# │  └ width       │ number   │ 가로길이 (mm)                       │
# │  └ weight      │ number   │ 중량 (kg)                           │
# │ updated_at     │ string   │ 최종 수정일시 (ISO)                 │
# │ updated_by     │ string   │ 최종 수정자                         │
# └───────────────┴──────────┴────────────────────────────────────┘
# 
# 데이터 흐름:
# - 외부 시스템에서 해당월 1일~당일까지의 슬리터 작업 데이터를 수집
# - 내수구분(내수/수출)별로 분류하여 테이블에 표시
# - 중량 합계: 내수 합계 / 수출 합계 / 총 합계 자동 계산 (프론트엔드)


@app.route('/api/slitter-detail/load', methods=['GET'])
def api_slitter_detail_load():
    """슬리터 일자별 상세 내역 로드 — year_month 파라미터 필수"""
    ym = request.args.get('year_month', '').strip()
    if not ym:
        return jsonify({'success': False, 'message': 'year_month 파라미터 필요'}), 400

    all_data = load_json_file(SLITTER_DETAIL_FILE, {})
    record = all_data.get(ym, None)
    if record is None:
        return jsonify({'success': True, 'data': None, 'message': '데이터 없음'})
    return jsonify({'success': True, 'data': record})


@app.route('/api/slitter-detail/save', methods=['POST'])
def api_slitter_detail_save():
    """슬리터 일자별 상세 내역 저장 — 월 단위 전체 저장"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'message': '요청 데이터 없음'}), 400

    ym = body.get('year_month', '').strip()
    rows = body.get('rows', [])
    user_id = body.get('user_id', 'system')

    if not ym:
        return jsonify({'success': False, 'message': 'year_month 필요'}), 400

    all_data = load_json_file(SLITTER_DETAIL_FILE, {})
    all_data[ym] = {
        'year_month': ym,
        'rows': rows,
        'updated_at': datetime.now().isoformat(),
        'updated_by': user_id,
    }
    save_json_file(SLITTER_DETAIL_FILE, all_data)

    return jsonify({
        'success': True,
        'message': f'{ym} 슬리터 일자별 상세 내역 저장 완료',
        'data': all_data[ym],
    })


@app.route('/api/slitter-detail/load-year', methods=['GET'])
def api_slitter_detail_load_year():
    """슬리터 일자별 상세 내역 — 해당 연도 전체 월 데이터 로드 (월별 실적량 집계용)"""
    year = request.args.get('year', '').strip()
    if not year:
        return jsonify({'success': False, 'message': 'year 파라미터 필요'}), 400

    all_data = load_json_file(SLITTER_DETAIL_FILE, {})
    year_rows = []
    for ym_key, record in all_data.items():
        if ym_key.startswith(year + '-'):
            rows = record.get('rows', [])
            year_rows.extend(rows)

    return jsonify({'success': True, 'data': {'year': year, 'rows': year_rows}})


# ═══════════════════════════════════════════════
# 슬리터 외주 진행 내역 API
# ═══════════════════════════════════════════════
# DB 테이블: ps_slitter_outsource (DDL → db/ps_slitter_outsource.sql)
# 저장 필드: year_month, day_no, cheongju, ipgo, slitting, slit_ipgo, chulgo
# ※ 대기재고/보관재고/계는 프론트에서 자동계산 (DB 미저장)
#   - 대기재고 = 전날 대기재고 + 입고 - 슬리팅실적
#   - 보관재고 = 슬리팅 입고 - 출고
#   - 계 = 대기재고 + 보관재고
# ※ DB 연결 실패 시 JSON 파일 폴백 (data/slitter_outsource.json)
# ═══════════════════════════════════════════════

OUTSOURCE_EDITABLE_FIELDS = ['cheongju', 'ipgo', 'slitting', 'slit_ipgo', 'chulgo']


def _outsource_load_db(ym):
    """DB에서 외주 진행 내역 로드. 성공 시 dict, 실패 시 None."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                'SELECT day_no, cheongju, ipgo, slitting, slit_ipgo, chulgo, '
                '       updated_by, updated_dt '
                'FROM ps_slitter_outsource '
                'WHERE year_month = %s ORDER BY day_no',
                (ym,)
            )
            rows = cursor.fetchall()
        if not rows:
            return {'year_month': ym, 'days': {}}
        days = {}
        last_updated_by = None
        last_updated_dt = None
        for row in rows:
            d = str(row['day_no'])
            days[d] = {
                f: float(row[f]) if row[f] is not None else None
                for f in OUTSOURCE_EDITABLE_FIELDS
            }
            if row.get('updated_dt'):
                last_updated_by = row.get('updated_by')
                last_updated_dt = row['updated_dt'].isoformat() if hasattr(row['updated_dt'], 'isoformat') else str(row['updated_dt'])
        return {
            'year_month': ym,
            'days': days,
            'updated_at': last_updated_dt,
            'updated_by': last_updated_by,
        }
    except Exception as e:
        print(f'[DB] 외주 로드 실패 — JSON 폴백: {e}')
        return None
    finally:
        conn.close()


def _outsource_save_db(ym, clean_days, user_id):
    """DB에 외주 진행 내역 저장 (UPSERT). 성공 시 True, 실패 시 False."""
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            # 해당 월의 기존 데이터 중 전송되지 않은 일자 삭제
            existing_days = set()
            cursor.execute(
                'SELECT day_no FROM ps_slitter_outsource WHERE year_month = %s',
                (ym,)
            )
            for row in cursor.fetchall():
                existing_days.add(str(row['day_no']))
            new_days = set(clean_days.keys())
            delete_days = existing_days - new_days
            for d in delete_days:
                cursor.execute(
                    'DELETE FROM ps_slitter_outsource '
                    'WHERE year_month = %s AND day_no = %s',
                    (ym, int(d))
                )

            # UPSERT (INSERT ... ON DUPLICATE KEY UPDATE)
            for day_str, day_data in clean_days.items():
                day_no = int(day_str)
                cursor.execute(
                    'INSERT INTO ps_slitter_outsource '
                    '  (year_month, day_no, cheongju, ipgo, slitting, slit_ipgo, chulgo, created_by) '
                    'VALUES (%s, %s, %s, %s, %s, %s, %s, %s) '
                    'ON DUPLICATE KEY UPDATE '
                    '  cheongju  = VALUES(cheongju), '
                    '  ipgo      = VALUES(ipgo), '
                    '  slitting  = VALUES(slitting), '
                    '  slit_ipgo = VALUES(slit_ipgo), '
                    '  chulgo    = VALUES(chulgo), '
                    '  updated_by = VALUES(created_by)',
                    (ym, day_no,
                     day_data.get('cheongju'), day_data.get('ipgo'),
                     day_data.get('slitting'), day_data.get('slit_ipgo'),
                     day_data.get('chulgo'), user_id)
                )
        conn.commit()
        return True
    except Exception as e:
        print(f'[DB] 외주 저장 실패 — JSON 폴백: {e}')
        conn.rollback()
        return False
    finally:
        conn.close()


@app.route('/api/slitter-outsource/load', methods=['GET'])
def api_slitter_outsource_load():
    """슬리터 외주 진행 내역 로드 — DB 우선, JSON 폴백"""
    ym = request.args.get('year_month', '').strip()
    if not ym:
        return jsonify({'success': False, 'message': 'year_month 파라미터 필요'}), 400

    # 1) DB 시도
    db_result = _outsource_load_db(ym)
    if db_result is not None:
        if not db_result.get('days'):
            return jsonify({'success': True, 'data': None, 'message': '데이터 없음 (DB)'})
        return jsonify({'success': True, 'data': db_result})

    # 2) JSON 폴백
    all_data = load_json_file(SLITTER_OUTSOURCE_FILE, {})
    record = all_data.get(ym, None)
    if record is None:
        return jsonify({'success': True, 'data': None, 'message': '데이터 없음'})
    return jsonify({'success': True, 'data': record})


@app.route('/api/slitter-outsource/save', methods=['POST'])
def api_slitter_outsource_save():
    """슬리터 외주 진행 내역 저장 — DB 우선, JSON 폴백"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'message': '요청 데이터 없음'}), 400

    ym = body.get('year_month', '').strip()
    days = body.get('days', {})
    user_id = body.get('user_id', 'system')

    if not ym:
        return jsonify({'success': False, 'message': 'year_month 필요'}), 400

    # 수기입력 5개 필드만 저장 (자동계산 필드 daegi/bogwan/total 제외)
    editable_set = set(OUTSOURCE_EDITABLE_FIELDS)
    clean_days = {}
    for day_key, day_val in days.items():
        if not isinstance(day_val, dict):
            continue
        cleaned = {k: v for k, v in day_val.items() if k in editable_set}
        if any(v is not None for v in cleaned.values()):
            clean_days[day_key] = cleaned

    now_iso = datetime.now().isoformat()

    # 1) DB 시도
    db_saved = _outsource_save_db(ym, clean_days, user_id)

    # 2) JSON도 항상 저장 (DB 성공 여부 무관 — 백업 겸용)
    all_data = load_json_file(SLITTER_OUTSOURCE_FILE, {})
    all_data[ym] = {
        'year_month': ym,
        'days': clean_days,
        'updated_at': now_iso,
        'updated_by': user_id,
    }
    save_json_file(SLITTER_OUTSOURCE_FILE, all_data)

    storage = 'DB+JSON' if db_saved else 'JSON'
    return jsonify({
        'success': True,
        'message': f'{ym} 슬리터 외주 진행 내역 저장 완료 ({storage})',
        'data': all_data[ym],
    })


# ═══════════════════════════════════════════════
# 슬리터 수불부 API (기말 자동저장)
# ═══════════════════════════════════════════════
# DB 스키마 (JSON 기반):
# ┌─────────────────────────────────────────────────────────────────┐
# │ 테이블명: slitter_subulbu                                       │
# ├───────────────┬──────────┬────────────────────────────────────┤
# │ 필드명         │ 타입      │ 설명                               │
# ├───────────────┼──────────┼────────────────────────────────────┤
# │ year_month     │ string   │ 대상 월 (YYYY-MM), PK 역할         │
# │ gimal          │ object   │ 일자별 기말값 { "1": 100, ... }     │
# │ updated_at     │ string   │ 최종 수정일시 (ISO)                 │
# │ updated_by     │ string   │ 최종 수정자                         │
# └───────────────┴──────────┴────────────────────────────────────┘
#
# 산술 로직:
# - 기말: 일자별 상세내역(slitter_detail)의 당일 총합계 (자동계산)
# - 기초: 전일 기말값 (1일은 전월 마지막일 기말값)
# - 입고: 기말 + 계 - 기초 (역산)
# - 내수/수출(작업): 별도 I/F 테이블(slitter_subulbu_work)에서 가져옴
# - 계: 내수 + 수출


@app.route('/api/slitter-subulbu/load', methods=['GET'])
def api_slitter_subulbu_load():
    """슬리터 수불부 기말 데이터 로드 — year_month 파라미터 필수"""
    ym = request.args.get('year_month', '').strip()
    if not ym:
        return jsonify({'success': False, 'message': 'year_month 파라미터 필요'}), 400

    all_data = load_json_file(SLITTER_SUBULBU_FILE, {})
    record = all_data.get(ym, None)
    if record is None:
        return jsonify({'success': True, 'data': None, 'message': '데이터 없음'})
    return jsonify({'success': True, 'data': record})


@app.route('/api/slitter-subulbu/save', methods=['POST'])
def api_slitter_subulbu_save():
    """슬리터 수불부 기말 데이터 저장"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'message': '요청 데이터 없음'}), 400

    ym = body.get('year_month', '').strip()
    gimal = body.get('gimal', {})
    user_id = body.get('user_id', 'system')

    if not ym:
        return jsonify({'success': False, 'message': 'year_month 필요'}), 400

    all_data = load_json_file(SLITTER_SUBULBU_FILE, {})
    all_data[ym] = {
        'year_month': ym,
        'gimal': gimal,
        'updated_at': datetime.now().isoformat(),
        'updated_by': user_id,
    }
    save_json_file(SLITTER_SUBULBU_FILE, all_data)

    return jsonify({
        'success': True,
        'message': f'{ym} 슬리터 수불부 저장 완료',
        'data': all_data[ym],
    })


# ═══════════════════════════════════════════════
# 슬리터 수불부 작업 API (I/F 내수/수출 데이터)
# ═══════════════════════════════════════════════
# DB 스키마 (JSON 기반):
# ┌────────────────────────────────────────────────────────────────────┐
# │ 테이블명: slitter_subulbu_work                                     │
# ├───────────────┬──────────┬─────────────────────────────────────────┤
# │ 필드명         │ 타입      │ 설명                                    │
# ├───────────────┼──────────┼─────────────────────────────────────────┤
# │ year_month     │ string   │ 대상 월 (YYYY-MM), PK 역할              │
# │ rows           │ array    │ 행 데이터 리스트                         │
# │  └ id          │ string   │ 행 고유 ID (UUID)                        │
# │  └ work_date   │ string   │ 실적일자 (YYYY-MM-DD)                    │
# │  └ domestic    │ string   │ 내수구분 (내수/수출)                      │
# │  └ weight      │ number   │ 중량 (kg)                                │
# │ updated_at     │ string   │ 최종 수정일시 (ISO)                      │
# │ updated_by     │ string   │ 최종 수정자                              │
# └───────────────┴──────────┴─────────────────────────────────────────┘
#
# 데이터 흐름:
# - 외부 시스템 I/F를 통해 실적일자별 내수/수출 작업 데이터를 수집
# - 수불부 테이블의 작업(내수), 작업(수출), 계 행에 반영


@app.route('/api/slitter-subulbu-work/load', methods=['GET'])
def api_slitter_subulbu_work_load():
    """슬리터 수불부 작업(I/F) 데이터 로드 — year_month 파라미터 필수"""
    ym = request.args.get('year_month', '').strip()
    if not ym:
        return jsonify({'success': False, 'message': 'year_month 파라미터 필요'}), 400

    all_data = load_json_file(SLITTER_SUBULBU_WORK_FILE, {})
    record = all_data.get(ym, None)
    if record is None:
        return jsonify({'success': True, 'data': None, 'message': '데이터 없음'})
    return jsonify({'success': True, 'data': record})


@app.route('/api/slitter-subulbu-work/save', methods=['POST'])
def api_slitter_subulbu_work_save():
    """슬리터 수불부 작업(I/F) 데이터 저장 — 월 단위 전체 저장"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'message': '요청 데이터 없음'}), 400

    ym = body.get('year_month', '').strip()
    rows = body.get('rows', [])
    user_id = body.get('user_id', 'system')

    if not ym:
        return jsonify({'success': False, 'message': 'year_month 필요'}), 400

    all_data = load_json_file(SLITTER_SUBULBU_WORK_FILE, {})
    all_data[ym] = {
        'year_month': ym,
        'rows': rows,
        'updated_at': datetime.now().isoformat(),
        'updated_by': user_id,
    }
    save_json_file(SLITTER_SUBULBU_WORK_FILE, all_data)

    return jsonify({
        'success': True,
        'message': f'{ym} 슬리터 수불부 작업 데이터 저장 완료',
        'data': all_data[ym],
    })


## ══════════════════════════════════════════════════
##  원지포장 실적 데이터 로드
## ══════════════════════════════════════════════════
PKG_DATA_FILE = os.path.join(DATA_DIR, 'packaging_data.json')
PKG_DAILY_FILE = os.path.join(DATA_DIR, 'packaging_daily.json')

@app.route('/api/packaging/data/load', methods=['GET'])
def api_packaging_data_load():
    """원지포장 월별 지관별 실적 데이터 로드
    DB 우선 조회 → 실패 시 JSON 폴백
    Response: { "success": true, "data": { "2026-07": { "3인치": 1397.2, "6인치": 5318.7, "12인치": 5538.1 }, ... } }
    """
    # ── DB 조회 시도 ──
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    'SELECT year_month, jigwan, weight_ton '
                    'FROM ps_packaging_monthly '
                    'ORDER BY year_month, jigwan'
                )
                rows = cursor.fetchall()
            conn.close()
            data = {}
            for r in rows:
                ym = r['year_month']
                if ym not in data:
                    data[ym] = {}
                data[ym][r['jigwan']] = float(r['weight_ton'])
            return jsonify({'success': True, 'data': data})
        except Exception as e:
            print(f'[DB] ps_packaging_monthly 조회 실패 — JSON 폴백: {e}')
            if conn:
                conn.close()

    # ── JSON 폴백 ──
    if os.path.exists(PKG_DATA_FILE):
        with open(PKG_DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = {}
    return jsonify({'success': True, 'data': data})


@app.route('/api/packaging/daily/load', methods=['GET'])
def api_packaging_daily_load():
    """원지포장 일자별 실적 데이터 로드
    DB 우선 조회 → 실패 시 JSON 폴백
    Response: { "success": true, "data": { "2026-02-20": { "포장실적_내수": 0, "포장실적_수출": 386.0, ... }, ... } }
    """
    # ── DB 조회 시도 ──
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    'SELECT record_date, '
                    '       pkg_actual_domestic, pkg_actual_export, '
                    '       pkg_wait_domestic,   pkg_wait_export '
                    'FROM ps_packaging_daily '
                    'ORDER BY record_date'
                )
                rows = cursor.fetchall()
            conn.close()
            data = {}
            for r in rows:
                dt = r['record_date']
                dk = dt.strftime('%Y-%m-%d') if hasattr(dt, 'strftime') else str(dt)
                data[dk] = {
                    '포장실적_내수': float(r['pkg_actual_domestic']),
                    '포장실적_수출': float(r['pkg_actual_export']),
                    '포장대기_내수': float(r['pkg_wait_domestic']),
                    '포장대기_수출': float(r['pkg_wait_export']),
                }
            return jsonify({'success': True, 'data': data})
        except Exception as e:
            print(f'[DB] ps_packaging_daily 조회 실패 — JSON 폴백: {e}')
            if conn:
                conn.close()

    # ── JSON 폴백 ──
    if os.path.exists(PKG_DAILY_FILE):
        with open(PKG_DAILY_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = {}
    return jsonify({'success': True, 'data': data})

## ══════════════════════════════════════════════════
##  원지포장 일CAPA 저장/로드
## ══════════════════════════════════════════════════
PKG_CAPA_FILE = os.path.join(DATA_DIR, 'packaging_capa.json')

@app.route('/api/packaging/capa/load', methods=['GET'])
def api_packaging_capa_load():
    """일CAPA 데이터 로드 — 연도별 월별 일CAPA 값"""
    year = request.args.get('year', str(datetime.now().year))
    if os.path.exists(PKG_CAPA_FILE):
        with open(PKG_CAPA_FILE, 'r', encoding='utf-8') as f:
            all_data = json.load(f)
    else:
        all_data = {}
    return jsonify({'success': True, 'data': all_data.get(year, {})})

@app.route('/api/packaging/capa/save', methods=['POST'])
def api_packaging_capa_save():
    """일CAPA 데이터 저장 — { year, capa: { '01': 값, '02': 값, ... } }"""
    body = request.get_json(force=True)
    year = body.get('year', str(datetime.now().year))
    capa = body.get('capa', {})

    if os.path.exists(PKG_CAPA_FILE):
        with open(PKG_CAPA_FILE, 'r', encoding='utf-8') as f:
            all_data = json.load(f)
    else:
        all_data = {}

    all_data[year] = capa
    with open(PKG_CAPA_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)

    return jsonify({'success': True, 'message': f'{year}년 일CAPA 저장 완료'})


# ═══════════════════════════════════════════════════
# 밀롤창고 재공현황 API
# ═══════════════════════════════════════════════════

@app.route('/api/millroll-inventory/load', methods=['GET'])
def api_millroll_inventory_load():
    """밀롤창고 재공현황 데이터 로드 — 전체 또는 연도별"""
    data = load_json_file(MILLROLL_INVENTORY_FILE, {})
    return jsonify({'success': True, 'data': data})


@app.route('/api/millroll-inventory/save', methods=['POST'])
def api_millroll_inventory_save():
    """밀롤창고 재공현황 데이터 저장"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'message': '요청 데이터 없음'}), 400

    data = body.get('data', {})
    save_json_file(MILLROLL_INVENTORY_FILE, data)
    return jsonify({'success': True, 'message': '밀롤창고 재공현황 저장 완료'})


# ═══════════════════════════════════════════════════
# 밀롤창고 일별 재공현황 API
# ═══════════════════════════════════════════════════

@app.route('/api/millroll-daily/load', methods=['GET'])
def api_millroll_daily_load():
    """밀롤창고 일별 재공현황 데이터 로드"""
    data = load_json_file(MILLROLL_DAILY_FILE, {})
    return jsonify({'success': True, 'data': data})


@app.route('/api/millroll-daily/save', methods=['POST'])
def api_millroll_daily_save():
    """밀롤창고 일별 재공현황 데이터 저장"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'message': '요청 데이터 없음'}), 400

    data = body.get('data', {})
    save_json_file(MILLROLL_DAILY_FILE, data)
    return jsonify({'success': True, 'message': '밀롤창고 일별 재공현황 저장 완료'})


# ═══════════════════════════════════════════════════
# 밀롤창고 월령분석 API
# ═══════════════════════════════════════════════════

@app.route('/api/millroll-aging/load', methods=['GET'])
def api_millroll_aging_load():
    """밀롤창고 월령분석 데이터 로드"""
    data = load_json_file(MILLROLL_AGING_FILE, {})
    return jsonify({'success': True, 'data': data})


@app.route('/api/millroll-aging/save', methods=['POST'])
def api_millroll_aging_save():
    """밀롤창고 월령분석 데이터 저장"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'message': '요청 데이터 없음'}), 400

    data = body.get('data', {})
    save_json_file(MILLROLL_AGING_FILE, data)
    return jsonify({'success': True, 'message': '밀롤창고 월령분석 저장 완료'})


# ─── 수작업 생산계획 API ───
@app.route('/api/manual-plan/load', methods=['GET'])
def api_manual_plan_load():
    """수작업 생산 계획량 환산 데이터 로드"""
    data = load_json_file(MANUAL_PLAN_FILE, {})
    return jsonify({'success': True, 'data': data})


@app.route('/api/manual-plan/save', methods=['POST'])
def api_manual_plan_save():
    """수작업 생산 계획량 환산 데이터 저장"""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'success': False, 'message': '요청 데이터 없음'}), 400

    data = body.get('data', {})
    save_json_file(MANUAL_PLAN_FILE, data)
    return jsonify({'success': True, 'message': '수작업 생산계획 저장 완료'})


if __name__ == '__main__':
    print('=' * 50)
    print('PS S&OP 계획 시스템 — 백엔드 서버 시작')
    print(f'데이터 저장 경로: {DATA_FILE}')
    print(f'기준일자: {today_str()}')
    print('=' * 50)
    app.run(host='0.0.0.0', port=8080, debug=False)
