#!/usr/bin/env python3
"""
PS S&OP 계획 시스템 — 백엔드 API 서버
- 정적 파일 서빙 (web/ 디렉토리)
- 진부화재고 사용자 수정값 저장/조회 API
- JSON 파일 기반 영속 저장 (DB 연동 전 임시)
"""

import json
import os
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='web', static_url_path='')
CORS(app)

# 데이터 저장 경로
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DATA_FILE = os.path.join(DATA_DIR, 'obsolete_inventory_edits.json')

os.makedirs(DATA_DIR, exist_ok=True)


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


# ─── 정적 파일 서빙 ───
@app.route('/')
def index():
    return send_from_directory('web', 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('web', filename)


# ─── API: 저장된 수정값 조회 ───
@app.route('/api/obsolete-inventory/load', methods=['GET'])
def api_load():
    """
    저장된 사용자 수정값 전체 조회
    Response: { "data": { "PS10::RM-2024-00451": { ... }, ... }, "count": N }
    """
    saved = load_saved_data()
    return jsonify({
        'success': True,
        'data': saved,
        'count': len(saved),
    })


# ─── API: 수정값 저장 ───
@app.route('/api/obsolete-inventory/save', methods=['POST'])
def api_save():
    """
    사용자 수정값 저장
    Request Body: { "items": [ { plant_code, material_code, out_sales_adj, ... }, ... ], "updated_by": "user" }
    - 기존 저장 데이터에 병합 (해당 plant::material 키만 갱신)
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

    for item in items:
        plant = item.get('plant_code', '')
        material = item.get('material_code', '')
        if not plant or not material:
            continue

        key = f"{plant}::{material}"
        saved[key] = {
            'plant_code': plant,
            'material_code': material,
            'out_sales_adj': item.get('out_sales_adj', 0),
            'out_mill_roll_adj': item.get('out_mill_roll_adj', 0),
            'out_disposal': item.get('out_disposal', 0),
            'out_etc_adj': item.get('out_etc_adj', 0),
            'updated_by': updated_by,
            'updated_dt': now,
        }

    # 파일에 저장
    save_data(saved)

    return jsonify({
        'success': True,
        'message': f'{len(items)}건 저장 완료',
        'saved_count': len(items),
        'updated_dt': now,
    })


if __name__ == '__main__':
    print('=' * 50)
    print('PS S&OP 계획 시스템 — 백엔드 서버 시작')
    print(f'데이터 저장 경로: {DATA_FILE}')
    print('=' * 50)
    app.run(host='0.0.0.0', port=8080, debug=False)
