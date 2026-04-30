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
            'out_mill_roll_adj': item.get('out_mill_roll_adj', 0),
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
      · 매출(수정), 밀롤(수정), 기타출고(수정) → SAP 값으로 리셋 (옵션A: 매일 변동)
      · 폐기 → 사용자 입력값 유지 (옵션B: SAP 무관 사용자 판단값)
      · confirmed_yn → 'N' (미확정) 리셋
    """
    saved = load_saved_data()
    now = datetime.now().isoformat()
    ref = today_str()
    reset_count = 0

    for key, item in saved.items():
        # 옵션A: 매출(수정), 밀롤(수정), 기타출고(수정) → 기본값(0)으로 리셋
        # (매일 SAP에서 변동되는 값이므로 동기화 시 리셋)
        # (실제 운영에서는 SAP RFC 'D' 호출 결과로 대체)
        item['out_sales_adj'] = 0
        item['out_mill_roll_adj'] = 0
        item['out_etc_adj'] = 0

        # 옵션B: 폐기 → 사용자 입력값 유지 (SAP 무관 사용자 판단값)
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
        'message': f'SAP 연동 시뮬레이션 완료 — {reset_count}건 리셋',
        'reset_count': reset_count,
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


if __name__ == '__main__':
    print('=' * 50)
    print('PS S&OP 계획 시스템 — 백엔드 서버 시작')
    print(f'데이터 저장 경로: {DATA_FILE}')
    print(f'기준일자: {today_str()}')
    print('=' * 50)
    app.run(host='0.0.0.0', port=8080, debug=False)
