#!/usr/bin/env python3
"""
PS S&OP 계획 시스템 — 설정 파일
MariaDB 연결 정보 및 시스템 설정
→ DB 준비 완료 시 아래 값만 변경하면 바로 동작
"""

# ─── MariaDB 연결 설정 ───
DB_CONFIG = {
    'host': 'localhost',        # ← 실제 DB 서버 IP로 변경
    'port': 3306,               # ← 실제 포트로 변경
    'user': 'snop_user',        # ← 실제 DB 계정으로 변경
    'password': '',             # ← 실제 DB 비밀번호로 변경
    'database': 'snop_ps',      # ← 실제 DB명으로 변경
    'charset': 'utf8mb4',
    'cursorclass': 'DictCursor',
}

# DB 사용 여부 (True: MariaDB 사용, False: JSON 파일 폴백)
# → DB 연결 실패 시 자동으로 False로 전환됨
USE_DB = True

# ─── 임시 사용자 계정 (DB 미연결 시 사용) ───
# → DB 연결 후에는 ps_users 테이블의 데이터를 사용
FALLBACK_USERS = {
    'admin': {
        'user_id': 'admin',
        'user_name': '관리자',
        'password': 'snop2026!',
        'role': 'ADMIN',
    },
    'planner01': {
        'user_id': 'planner01',
        'user_name': '담당자',
        'password': 'plan2026!',
        'role': 'PLANNER',
    },
}
