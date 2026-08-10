#!/usr/bin/env python3
"""
원지포장 JSON → DB 마이그레이션 스크립트

기존 JSON 파일 데이터를 MariaDB 테이블로 이관합니다.
- packaging_data.json  → ps_packaging_monthly (지관/월별 실적량)
- packaging_daily.json → ps_packaging_daily   (일자별 실적량)

사전 조건:
  1. DDL 실행 완료 (ps_packaging_monthly.sql, ps_packaging_daily.sql)
  2. config.py에 DB_CONFIG 설정 완료

실행:
  cd /home/user/webapp && python db/migrate_packaging_to_db.py
"""

import json
import os
import sys

# 프로젝트 루트를 path에 추가
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import DB_CONFIG, USE_DB

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
PKG_DATA_FILE = os.path.join(DATA_DIR, 'packaging_data.json')
PKG_DAILY_FILE = os.path.join(DATA_DIR, 'packaging_daily.json')


def get_connection():
    import pymysql
    return pymysql.connect(
        host=DB_CONFIG['host'],
        port=DB_CONFIG['port'],
        user=DB_CONFIG['user'],
        password=DB_CONFIG['password'],
        database=DB_CONFIG['database'],
        charset=DB_CONFIG.get('charset', 'utf8mb4'),
        cursorclass=pymysql.cursors.DictCursor,
    )


def migrate_monthly(conn):
    """packaging_data.json → ps_packaging_monthly"""
    if not os.path.exists(PKG_DATA_FILE):
        print('[SKIP] packaging_data.json 파일 없음')
        return 0

    with open(PKG_DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    sql = (
        'INSERT INTO ps_packaging_monthly (year_month, jigwan, weight_ton, created_by) '
        'VALUES (%s, %s, %s, %s) '
        'ON DUPLICATE KEY UPDATE weight_ton = VALUES(weight_ton), updated_by = VALUES(created_by)'
    )

    count = 0
    with conn.cursor() as cursor:
        for ym, jigwan_map in data.items():
            for jigwan, weight in jigwan_map.items():
                cursor.execute(sql, (ym, jigwan, weight, 'migrate_script'))
                count += 1
    conn.commit()
    print(f'[OK] ps_packaging_monthly: {count}건 UPSERT 완료')
    return count


def migrate_daily(conn):
    """packaging_daily.json → ps_packaging_daily"""
    if not os.path.exists(PKG_DAILY_FILE):
        print('[SKIP] packaging_daily.json 파일 없음')
        return 0

    with open(PKG_DAILY_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    sql = (
        'INSERT INTO ps_packaging_daily '
        '(record_date, pkg_actual_domestic, pkg_actual_export, pkg_wait_domestic, pkg_wait_export, created_by) '
        'VALUES (%s, %s, %s, %s, %s, %s) '
        'ON DUPLICATE KEY UPDATE '
        '  pkg_actual_domestic = VALUES(pkg_actual_domestic), '
        '  pkg_actual_export   = VALUES(pkg_actual_export), '
        '  pkg_wait_domestic   = VALUES(pkg_wait_domestic), '
        '  pkg_wait_export     = VALUES(pkg_wait_export), '
        '  updated_by          = VALUES(created_by)'
    )

    count = 0
    with conn.cursor() as cursor:
        for date_str, vals in data.items():
            cursor.execute(sql, (
                date_str,
                vals.get('포장실적_내수', 0),
                vals.get('포장실적_수출', 0),
                vals.get('포장대기_내수', 0),
                vals.get('포장대기_수출', 0),
                'migrate_script',
            ))
            count += 1
    conn.commit()
    print(f'[OK] ps_packaging_daily: {count}건 UPSERT 완료')
    return count


def main():
    if not USE_DB:
        print('[ERROR] config.py의 USE_DB가 False입니다. DB 연결 설정을 확인하세요.')
        sys.exit(1)

    print('=== 원지포장 JSON → DB 마이그레이션 시작 ===')
    print(f'DB: {DB_CONFIG["host"]}:{DB_CONFIG["port"]}/{DB_CONFIG["database"]}')
    print()

    conn = get_connection()
    try:
        migrate_monthly(conn)
        migrate_daily(conn)
        print()
        print('=== 마이그레이션 완료 ===')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
