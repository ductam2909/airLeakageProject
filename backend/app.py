from flask import Flask, Response, jsonify, request, send_file, stream_with_context
from flask_cors import CORS
from flask_sock import Sock

import json
import os
import sqlite3
import tempfile
import time
import uuid

import xlsxwriter


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("AIR_LEAKAGE_DATA_DIR", BASE_DIR)
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "database.db")

VALID_STATUSES = {"PASS", "FAIL", "N/A"}
DEFAULT_SETTINGS = {
    "pressure_min": "100",
    "pressure_max": "500",
    "leak_max": "25",
}
HISTORY_COLUMNS = [
    "trayCode",
    "programName",
    "startTime",
    "endTime",
    "pressureUnit",
    "leakUnit",
    "actualPressure",
    "actualLeak",
    "testTime",
    "settingCycleTime",
    "dataPressure",
    "dataLeak",
    "status",
]
PERIODS = ["00-04h", "04-08h", "08-12h", "12-16h", "16-20h", "20-24h"]

app = Flask(__name__)
CORS(app)
sock = Sock(app)


# =========================================================
# DATABASE
# =========================================================

def db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def create_history_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            trayCode TEXT NOT NULL,
            programName TEXT NOT NULL DEFAULT '',
            startTime TEXT NOT NULL,
            endTime TEXT NOT NULL,
            pressureUnit TEXT NOT NULL DEFAULT '',
            leakUnit TEXT NOT NULL DEFAULT '',
            actualPressure REAL DEFAULT 0,
            actualLeak REAL DEFAULT 0,
            testTime REAL DEFAULT 0,
            settingCycleTime REAL DEFAULT 0,
            dataPressure TEXT NOT NULL DEFAULT '[]',
            dataLeak TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL
        )
    """)


def ensure_history_indexes(conn):
    # Xóa index expression cũ để truy vấn startTime trực tiếp dùng index tốt hơn.
    conn.execute("DROP INDEX IF EXISTS idx_history_time_page")
    conn.execute("DROP INDEX IF EXISTS idx_history_status_time_page")

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_history_starttime_id
        ON history (startTime DESC, id DESC)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_history_endtime_id
        ON history (endTime DESC, id DESC)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_history_status_starttime_id
        ON history (status COLLATE NOCASE, startTime DESC, id DESC)
    """)
    


def parse_legacy_data(value):
    """Chuyển field data cũ dạng second,pressure,leak;... thành 2 mảng."""
    if not value:
        return [], []

    try:
        parsed = json.loads(value) if isinstance(value, str) else value
        if isinstance(parsed, list):
            pressures, leaks = [], []
            for item in parsed:
                if isinstance(item, dict):
                    if "pressure" in item:
                        pressures.append(item["pressure"])
                    if "leak" in item:
                        leaks.append(item["leak"])
            if pressures or leaks:
                return pressures, leaks
    except (json.JSONDecodeError, TypeError):
        pass

    pressures, leaks = [], []
    try:
        for point in str(value).split(";"):
            parts = [part.strip() for part in point.split(",")]
            if len(parts) >= 3:
                pressures.append(float(parts[1]))
                leaks.append(float(parts[2]))
    except (ValueError, TypeError):
        return [], []

    return pressures, leaks


def ensure_history_schema(conn):
    """Đảm bảo history đúng schema mới, đồng thời giữ lại dữ liệu DB cũ."""
    expected_columns = ["id", *HISTORY_COLUMNS]

    table_exists = conn.execute("""
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = 'history'
    """).fetchone()

    if not table_exists:
        create_history_table(conn)
        return

    old_columns = [row["name"] for row in conn.execute("PRAGMA table_info(history)").fetchall()]
    if old_columns == expected_columns:
        return

    conn.execute("DROP TABLE IF EXISTS history_legacy")
    conn.execute("ALTER TABLE history RENAME TO history_legacy")
    create_history_table(conn)

    legacy_rows = conn.execute("SELECT * FROM history_legacy").fetchall()

    def get_old(row, *names, default=None):
        keys = row.keys()
        for name in names:
            if name in keys and row[name] is not None:
                return row[name]
        return default

    for row in legacy_rows:
        data_pressure = get_old(row, "dataPressure")
        data_leak = get_old(row, "dataLeak")

        if data_pressure is None or data_leak is None:
            legacy_pressure, legacy_leak = parse_legacy_data(
                get_old(row, "data", default="")
            )
            if data_pressure is None:
                data_pressure = json.dumps(legacy_pressure, ensure_ascii=False)
            if data_leak is None:
                data_leak = json.dumps(legacy_leak, ensure_ascii=False)

        values = (
            str(get_old(row, "id", default=str(uuid.uuid4()))),
            str(get_old(row, "trayCode", "tray_code", default="")),
            str(get_old(row, "programName", default="")),
            get_old(row, "startTime", "start_time", default=""),
            get_old(row, "endTime", "end_time", default=""),
            str(get_old(row, "pressureUnit", default="")),
            str(get_old(row, "leakUnit", default="")),
            float(get_old(row, "actualPressure", "actual_pressure", default=0) or 0),
            float(get_old(row, "actualLeak", "actual_leak", default=0) or 0),
            float(get_old(row, "testTime", "test_time", default=0) or 0),
            float(get_old(row, "settingCycleTime", default=0) or 0),
            str(data_pressure or "[]"),
            str(data_leak or "[]"),
            str(get_old(row, "status", default="N/A")).upper(),
        )

        conn.execute("""
            INSERT INTO history (
                id, trayCode, programName, startTime, endTime,
                pressureUnit, leakUnit, actualPressure, actualLeak,
                testTime, settingCycleTime, dataPressure, dataLeak, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, values)

    conn.execute("DROP TABLE history_legacy")


def init_db():
    conn = None
    try:
        conn = db()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        ensure_history_schema(conn)
        ensure_history_indexes(conn)

        conn.executemany(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            DEFAULT_SETTINGS.items(),
        )
        conn.commit()
        print(f"Database initialized: {DB_PATH}")
    except sqlite3.Error as e:
        print(f"SQLite error: {e}")
        raise
    finally:
        if conn:
            conn.close()


# =========================================================
# COMMON HELPERS
# =========================================================

def normalize_number(value, default=0):
    if value is None or value == "":
        return default
    number = float(value)
    return int(number) if number.is_integer() else number


def normalize_array(value):
    if value is None or value == "":
        return []

    if isinstance(value, str):
        value = json.loads(value)

    if not isinstance(value, list):
        raise ValueError("dataPressure và dataLeak phải là mảng")

    result = []
    for item in value:
        if isinstance(item, bool):
            raise ValueError("Giá trị trong mảng phải là số")
        result.append(normalize_number(item))
    return result


def array_to_db(value):
    return json.dumps(normalize_array(value), ensure_ascii=False)


def array_from_db(value):
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def format_history(row):
    return {
        "id": row["id"],
        "trayCode": row["trayCode"],
        "programName": row["programName"],
        "startTime": row["startTime"],
        "endTime": row["endTime"],
        "pressureUnit": row["pressureUnit"],
        "leakUnit": row["leakUnit"],
        "actualPressure": normalize_number(row["actualPressure"]),
        "actualLeak": normalize_number(row["actualLeak"]),
        "testTime": normalize_number(row["testTime"]),
        "settingCycleTime": normalize_number(row["settingCycleTime"]),
        "dataPressure": array_from_db(row["dataPressure"]),
        "dataLeak": array_from_db(row["dataLeak"]),
        "status": row["status"],
    }


def empty_history():
    return {
        "id": "",
        "trayCode": "",
        "programName": "",
        "startTime": None,
        "endTime": None,
        "pressureUnit": "",
        "leakUnit": "",
        "actualPressure": 0,
        "actualLeak": 0,
        "testTime": 0,
        "settingCycleTime": 0,
        "dataPressure": [],
        "dataLeak": [],
        "status": "N/A",
    }


def latest_history():
    conn = db()
    try:
        row = conn.execute("""
            SELECT *
            FROM history
            ORDER BY startTime DESC, id DESC
            LIMIT 1
        """).fetchone()
        return format_history(row) if row else empty_history()
    finally:
        conn.close()


def settings_dict(conn):
    return {
        row["key"]: row["value"]
        for row in conn.execute("SELECT key, value FROM settings").fetchall()
    }


def format_settings(conn):
    settings = settings_dict(conn)
    return {
        key: float(settings.get(key, default))
        for key, default in DEFAULT_SETTINGS.items()
    }


def build_history_filters():
    status = request.args.get("status", default="", type=str).strip()
    from_date = request.args.get("fromDate", default="", type=str).strip()
    to_date = request.args.get("toDate", default="", type=str).strip()

    conditions = []
    params = []

    if status and status.lower() != "all":
        status = status.upper()
        if status not in VALID_STATUSES:
            raise ValueError("status chỉ được PASS, FAIL, N/A hoặc all")
        conditions.append("status = ? COLLATE NOCASE")
        params.append(status)

    # startTime lưu theo dạng YYYY-MM-DD HH:MM:SS nên so sánh chuỗi trực tiếp
    # sẽ dùng được index, nhanh hơn date(startTime).
    if from_date:
        conditions.append("startTime >= ?")
        params.append(f"{from_date} 00:00:00")

    if to_date:
        conditions.append("startTime <= ?")
        params.append(f"{to_date} 23:59:59.999")

    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    return where_clause, params


def period_for_hour(hour):
    return PERIODS[min(max(hour // 4, 0), 5)]


def validate_history(data):
    if not data["trayCode"]:
        raise ValueError("trayCode không được để trống")
    if not data["startTime"]:
        raise ValueError("startTime không được để trống")
    if not data["endTime"]:
        raise ValueError("endTime không được để trống")
    if data["testTime"] < 0:
        raise ValueError("testTime không hợp lệ")
    if data["settingCycleTime"] < 0:
        raise ValueError("settingCycleTime không hợp lệ")
    if data["status"] not in VALID_STATUSES:
        raise ValueError("status chỉ được PASS, FAIL hoặc N/A")


def parse_history_payload(payload, current=None):
    def get_value(key, default):
        return payload.get(key, current[key] if current is not None else default)

    data = {
        "trayCode": str(get_value("trayCode", "")).strip(),
        "programName": str(get_value("programName", "")).strip(),
        "startTime": get_value("startTime", None),
        "endTime": get_value("endTime", None),
        "pressureUnit": str(get_value("pressureUnit", "")).strip(),
        "leakUnit": str(get_value("leakUnit", "")).strip(),
        "actualPressure": normalize_number(get_value("actualPressure", 0)),
        "actualLeak": normalize_number(get_value("actualLeak", 0)),
        "testTime": normalize_number(get_value("testTime", 0)),
        "settingCycleTime": normalize_number(get_value("settingCycleTime", 0)),
        "dataPressure": array_to_db(get_value("dataPressure", [])),
        "dataLeak": array_to_db(get_value("dataLeak", [])),
        "status": str(get_value("status", "N/A")).upper(),
    }
    validate_history(data)
    return data


def history_values(data):
    return tuple(data[column] for column in HISTORY_COLUMNS)


def fetch_history_by_id(conn, history_id):
    return conn.execute(
        "SELECT * FROM history WHERE id = ?",
        (history_id,),
    ).fetchone()

# =========================================================
# HISTORY SUMMARY
# =========================================================

@app.get("/api/history/summary")
def get_history_summary():
    conn = None

    try:
        where_clause, params = build_history_filters()
        conn = db()

        # Tối ưu cho truy vấn đọc lớn/ có thể xử dụng ram thay vì file tạm
        conn.execute("PRAGMA temp_store = MEMORY")
        conn.execute("PRAGMA cache_size = -65536")

        rows = conn.execute(
            f"""
            SELECT
                CASE
                    WHEN substr(startTime, 12, 2) < '04' THEN 0
                    WHEN substr(startTime, 12, 2) < '08' THEN 1
                    WHEN substr(startTime, 12, 2) < '12' THEN 2
                    WHEN substr(startTime, 12, 2) < '16' THEN 3
                    WHEN substr(startTime, 12, 2) < '20' THEN 4
                    ELSE 5
                END AS period,

                COUNT(*) AS total,

                SUM(
                    CASE
                        WHEN status = 'PASS' COLLATE NOCASE
                        THEN 1
                        ELSE 0
                    END
                ) AS pass_count,

                SUM(
                    CASE
                        WHEN status = 'FAIL' COLLATE NOCASE
                        THEN 1
                        ELSE 0
                    END
                ) AS fail_count

            FROM history

            {where_clause}

            GROUP BY period
            """,
            params
        ).fetchall()

        buckets = [
            {"Pass": 0, "Fail": 0}
            for _ in range(6)
        ]

        total = 0
        pass_count = 0
        fail_count = 0

        for row in rows:
            period = int(row["period"])

            row_total = row["total"] or 0
            row_pass = row["pass_count"] or 0
            row_fail = row["fail_count"] or 0

            total += row_total
            pass_count += row_pass
            fail_count += row_fail

            buckets[period]["Pass"] = row_pass
            buckets[period]["Fail"] = row_fail

        chart = [
            {
                "period": PERIODS[i],
                "type": kind,
                "value": buckets[i][kind]
            }
            for i in range(6)
            for kind in ("Pass", "Fail")
        ]

        return jsonify({
            "total": total,
            "pass_count": pass_count,
            "fail_count": fail_count,

            "pass_percent": (
                pass_count / total * 100
                if total else 0
            ),

            "fail_percent": (
                fail_count / total * 100
                if total else 0
            ),

            "chart": chart
        })

    except ValueError as e:
        return jsonify({
            "message": str(e)
        }), 400

    except Exception as e:
        return jsonify({
            "message": str(e)
        }), 500

    finally:
        if conn:
            conn.close()


# =========================================================
# EXPORT HISTORY EXCEL
# =========================================================

@app.get("/api/history/export")
def export_history_excel():
    conn = None
    temp_path = None
    workbook = None
    export_ready = False

    try:
        where_clause, params = build_history_filters()
        conn = db()

        try:
            conn.execute("PRAGMA cache_size = -65536")
            conn.execute("PRAGMA temp_store = MEMORY")
        except sqlite3.Error:
            pass

        cursor = conn.execute(
            f"""
                SELECT
                    trayCode, programName, startTime, endTime,
                    actualPressure, pressureUnit, actualLeak, leakUnit,
                    testTime, settingCycleTime, status
                FROM history
                {where_clause}
                ORDER BY startTime DESC, id DESC
            """,
            params,
        )
        cursor.arraysize = 20000

        fd, temp_path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)

        workbook = xlsxwriter.Workbook(
            temp_path,
            {
                "constant_memory": True,
                "strings_to_urls": False,
                "strings_to_formulas": False,
            },
        )
        try:
            workbook.use_zip64()
        except Exception:
            pass

        worksheet = workbook.add_worksheet("Lịch sử đo")
        header_format = workbook.add_format({
            "bold": True,
            "font_color": "#FFFFFF",
            "bg_color": "#0469B9",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#D9D9D9",
        })

        for column, width in {
            "A:A": 8,
            "B:B": 18,
            "C:C": 20,
            "D:E": 22,
            "F:F": 18,
            "G:G": 16,
            "H:H": 18,
            "I:I": 14,
            "J:J": 16,
            "K:K": 20,
            "L:L": 14,
        }.items():
            worksheet.set_column(column, width)

        worksheet.set_row(0, 25)
        worksheet.freeze_panes(1, 0)

        headers = [
            "STT",
            "Mã mâm xe",
            "Chương trình",
            "Thời gian bắt đầu",
            "Thời gian kết thúc",
            "Áp suất thực tế",
            "Đơn vị áp suất",
            "Rò rỉ thực tế",
            "Đơn vị rò rỉ",
            "Thời gian đo",
            "Thời gian cài đặt",
            "Kết quả",
        ]
        worksheet.write_row(0, 0, headers, header_format)

        def excel_number(value):
            if value is None:
                return None
            try:
                return normalize_number(value)
            except (ValueError, TypeError):
                return value

        excel_row = 1
        stt = 1
        max_data_rows = 1_048_575

        while excel_row <= max_data_rows:
            rows = cursor.fetchmany(20000)
            if not rows:
                break

            for row in rows:
                if excel_row > max_data_rows:
                    break

                worksheet.write_row(excel_row, 0, [
                    stt,
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    excel_number(row[4]),
                    row[5],
                    excel_number(row[6]),
                    row[7],
                    excel_number(row[8]),
                    excel_number(row[9]),
                    row[10],
                ])
                excel_row += 1
                stt += 1

        workbook.close()
        workbook = None
        conn.close()
        conn = None

        filename = f"lich_su_do_{time.strftime('%Y%m%d_%H%M%S')}.xlsx"
        response = send_file(
            temp_path,
            as_attachment=True,
            download_name=filename,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            conditional=False,
        )

        export_ready = True

        @response.call_on_close
        def cleanup():
            try:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)
            except OSError:
                pass

        return response

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        print("EXPORT EXCEL ERROR:", repr(e))
        return jsonify({"message": str(e)}), 500
    finally:
        if workbook:
            try:
                workbook.close()
            except Exception:
                pass
        if conn:
            conn.close()
        if temp_path and os.path.exists(temp_path) and not export_ready:
            try:
                os.remove(temp_path)
            except OSError:
                pass


# =========================================================
# HISTORY CRUD
# =========================================================

@app.get("/api/history")
def get_history():
    conn = None

    try:
        page = request.args.get("page", default=1, type=int) or 1
        page_size = request.args.get("pageSize", default=10, type=int) or 10

        page = max(page, 1)
        page_size = min(max(page_size, 1), 200)

        offset = (page - 1) * page_size

        where_clause, params = build_history_filters()

        conn = db()

        # Tổng số bản ghi
        total = conn.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM history
            {where_clause}
            """,
            params,
        ).fetchone()["total"]

        if offset >= total:
            rows = []
        else:
            rows = conn.execute(
                f"""
                SELECT
                    h.id,
                    h.trayCode,
                    h.programName,
                    h.startTime,
                    h.endTime,
                    h.pressureUnit,
                    h.leakUnit,
                    h.actualPressure,
                    h.actualLeak,
                    h.testTime,
                    h.settingCycleTime,
                    h.status
                FROM history AS h

                INNER JOIN (
                    SELECT id, startTime
                    FROM history
                    {where_clause}
                    ORDER BY startTime DESC, id DESC
                    LIMIT ? OFFSET ?
                ) AS p
                    ON p.id = h.id

                ORDER BY
                    p.startTime DESC,
                    p.id DESC
                """,
                params + [page_size, offset],
            ).fetchall()

        items = [
            {
                "id": row["id"],
                "trayCode": row["trayCode"],
                "programName": row["programName"],
                "startTime": row["startTime"],
                "endTime": row["endTime"],
                "pressureUnit": row["pressureUnit"],
                "leakUnit": row["leakUnit"],
                "actualPressure": normalize_number(row["actualPressure"]),
                "actualLeak": normalize_number(row["actualLeak"]),
                "testTime": normalize_number(row["testTime"]),
                "settingCycleTime": normalize_number(
                    row["settingCycleTime"]
                ),
                "status": row["status"],
            }
            for row in rows
        ]

        total_pages = (
            (total + page_size - 1) // page_size
            if total
            else 0
        )

        return jsonify({
            "items": items,
            "page": page,
            "pageSize": page_size,
            "total": total,
            "totalPages": total_pages,
        })

    except ValueError as e:
        return jsonify({
            "message": str(e)
        }), 400

    except Exception as e:
        return jsonify({
            "message": str(e)
        }), 500

    finally:
        if conn:
            conn.close()


@app.get("/api/history/<string:history_id>")
def get_history_detail(history_id):
    conn = None
    try:
        conn = db()
        row = fetch_history_by_id(conn, history_id)
        if not row:
            return jsonify({"message": "Không tìm thấy dữ liệu"}), 404
        return jsonify(format_history(row))
    except Exception as e:
        return jsonify({"message": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.post("/api/history")
def create_history():
    conn = None
    try:
        payload = request.get_json(force=True)
        data = parse_history_payload(payload)
        history_id = str(uuid.uuid4())
        conn = db()

        placeholders = ", ".join("?" for _ in HISTORY_COLUMNS)
        conn.execute(
            f"INSERT INTO history (id, {', '.join(HISTORY_COLUMNS)}) VALUES (?, {placeholders})",
            (history_id, *history_values(data)),
        )
        conn.commit()

        return jsonify(format_history(fetch_history_by_id(conn, history_id))), 201
    except (ValueError, TypeError, json.JSONDecodeError) as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e) or "Dữ liệu đầu vào không hợp lệ"}), 400
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.put("/api/history/<string:history_id>")
def update_history(history_id):
    conn = None
    try:
        payload = request.get_json(force=True)
        conn = db()
        current = fetch_history_by_id(conn, history_id)

        if not current:
            return jsonify({"message": "Không tìm thấy dữ liệu"}), 404

        data = parse_history_payload(payload, current=current)
        set_clause = ", ".join(f"{column} = ?" for column in HISTORY_COLUMNS)
        conn.execute(
            f"UPDATE history SET {set_clause} WHERE id = ?",
            (*history_values(data), history_id),
        )
        conn.commit()

        return jsonify(format_history(fetch_history_by_id(conn, history_id)))
    except (ValueError, TypeError, json.JSONDecodeError) as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e) or "Dữ liệu đầu vào không hợp lệ"}), 400
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.delete("/api/history/<string:history_id>")
def delete_history(history_id):
    conn = None
    try:
        conn = db()
        cursor = conn.execute("DELETE FROM history WHERE id = ?", (history_id,))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({"message": "Không tìm thấy dữ liệu"}), 404
        return jsonify({"message": "Xóa dữ liệu thành công"})
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if conn:
            conn.close()


# =========================================================
# REALTIME - WEBSOCKET + SSE
# =========================================================

@sock.route("/ws/realtime")
def realtime(ws):
    print("[WS] Client connected")
    try:
        while True:
            data = latest_history()
            ws.send(json.dumps(data, ensure_ascii=False))
            print("[WS] Send:", data)
            time.sleep(1)
    except Exception as e:
        print("[WS] Client disconnected:", e)


@app.get("/api/realtime/stream")
def realtime_stream():
    @stream_with_context
    def generate():
        last_payload = None

        while True:
            try:
                payload = json.dumps(latest_history(), ensure_ascii=False)
                if payload != last_payload:
                    yield f"data: {payload}\n\n"
                    last_payload = payload
                else:
                    yield ": keep-alive\n\n"
            except GeneratorExit:
                break
            except Exception as e:
                error = json.dumps({"message": str(e)}, ensure_ascii=False)
                yield f"event: error\ndata: {error}\n\n"

            time.sleep(1)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# =========================================================
# SETTINGS
# =========================================================

@app.get("/api/settings")
def get_settings():
    conn = None
    try:
        conn = db()
        return jsonify(format_settings(conn))
    except Exception as e:
        return jsonify({"message": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.put("/api/settings")
def update_settings():
    conn = None
    try:
        payload = request.get_json(force=True)
        conn = db()

        updates = [
            (key, str(float(value)))
            for key, value in payload.items()
            if key in DEFAULT_SETTINGS
        ]

        if updates:
            conn.executemany(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                updates,
            )
            conn.commit()

        return jsonify(format_settings(conn))
    except (ValueError, TypeError):
        if conn:
            conn.rollback()
        return jsonify({"message": "Giá trị cấu hình không hợp lệ"}), 400
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if conn:
            conn.close()


# =========================================================
# START SERVER
# =========================================================

if __name__ == "__main__":
    init_db()
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        threaded=True,
        use_reloader=False,
    )