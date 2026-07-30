#!/usr/bin/env python3
"""
Logis Master Parser — 500K Test Generator + Bug Classifier
จำลองทุกรูปแบบข้อความที่ parser ต้องรับมือ
"""
import json, re, sys, time, itertools, random
from dataclasses import dataclass, field
from typing import Optional

OUTPUT_DIR = "/home/apichet/myproject/Logis-Master/parser_tests"

# ========================
# 1. TEST MATRIX DEFINITIONS
# ========================

# ---- CUSTOMER NAMES ----
NAMES = [
    "สมชาย", "วรรณา", "ประสิทธิ์", "มานี มีนา", "Tonnam",
    "Smith", "Kai kaii", "Aum Pimon", "Christian", "Thanatchon",
    "พสิษฐ์ มีก่ำ", "John", "วิชัย", "ลุงสม", "ร้านวรรณา",
]

# ---- PHONE FORMATS ----
PHONE_FORMATS = [
    # (prefix, phone_str, expected_clean)
    ("เบอร์: ", "0812345678", "0812345678"),
    ("เบอร์ ", "0812345678", "0812345678"),
    ("เบอร์:", "0812345678", "0812345678"),
    ("โทร: ", "081-234-5678", "0812345678"),
    ("โทร ", "0812345678", "0812345678"),
    ("Tel: ", "0812345678", "0812345678"),
    ("Phone: ", "0812345678", "0812345678"),
    ("", "0812345678", "0812345678"),  # no prefix, standalone
    ("", "092-280-5684", "0922805684"),  # no prefix, with dashes
    ("", "0870788186", "0870788186"),
    ("เบอร์โทร: ", "0812345678", "0812345678"),
    ("", "0897983210", "0897983210"),
    ("", "0992255245", "0992255245"),
    ("เบอร์ ", "08 1234 5678", "0812345678"),
]

# ---- WHEEL SIZE FORMATS ----
# (full_pattern, expected_width, expected_profile, expected_rim, expected_unit)
WHEEL_FORMATS = [
    # Teacher format: width/profile unit
    ("18/4วง", 18, 4, 0, "วง"),
    ("18/4 วง", 18, 4, 0, "วง"),
    ("17/4วง", 17, 4, 0, "วง"),
    ("15/4วง", 15, 4, 0, "วง"),
    ("18/12วง", 18, 12, 0, "วง"),
    ("16/2วง", 16, 2, 0, "วง"),
    ("18/4ชุด", 18, 4, 0, "ชุด"),
    ("18/4ล้อ", 18, 4, 0, "ล้อ"),
    # Standard: width/profile/Rrim
    ("185/65R15", 185, 65, 15, None),
    ("195/55R16", 195, 55, 16, None),
    ("205/45R17", 205, 45, 17, None),
    # Multiple items (combo)
    ("15/4วง+17/4วง+18/12วง", "multi", "multi", "multi", "multi"),
    ("15/4วง\n17/4วง\n18/12วง", "multi", "multi", "multi", "multi"),
    # Single combined with price on same line
    ("18/4วงราคา6,000บาท", 18, 4, 0, "วง"),
    ("17/4วงราคา2,000 บาท", 17, 4, 0, "วง"),
]

# Matches for multi-wheel
MULTI_WHEEL_COMBOS = [
    ([["15/4วง", 15, 4, 0, "วง"], ["17/4วง", 17, 4, 0, "วง"], ["18/12วง", 18, 12, 0, "วง"]], 20),  # order 7
    ([["18/4วง", 18, 4, 0, "วง"]], 4),
    ([["17/4วง", 17, 4, 0, "วง"]], 4),
]

# ---- PRICE FORMATS ----
PRICE_FORMATS = [
    # (price_pattern, expected_price, is_multi, multi_expected)
    ("ราคา 1,600 บาท", 1600, False, None),
    ("ราคา1,000บาท", 1000, False, None),
    ("ราคา2,000 บาท", 2000, False, None),
    ("ราคา 800 บาท", 800, False, None),
    ("ราคา 1,200 บาท", 1200, False, None),
    ("ราคา 2,800 บาท", 2800, False, None),
    ("ราคา2,600บ.", 2600, False, None),
    ("ราคา 500 ฿", 500, False, None),
    ("พร้อมยาง6,000บาท", 6000, False, None),  # same line
    ("16/2วงราคา 800 บาท", 800, False, None),  # combined
    # Multiple prices (like order 7)
    ("15/4วงราคา 1,600 บาท / 17/4วงราคา 2,000 บาท / 18/12วงราคา 8,100บาท", 11700, True, 11700),
    ("รวมเป็นเงิน11,700บาท", 11700, True, 11700),
    # End-of-block standalone
    ("800", 800, False, None),  # at end
    ("ล้อ 2 800", 800, False, None),
    # With wheel prefix and no "ราคา"
    ("18/4 2 6000", 6000, False, None),  # qty=2 price=6000
    ("15/2วง 2 800", 800, False, None),  # qty=2 price=800
]

# ---- LOCATION FORMATS ----
LOCATION_FORMATS = [
    # (prefix, location_text, expected_type_prefix)
    ("พิกัด: ", "ซอยวัดอโศการาม สมุทรปราการ", "พิกัด"),
    ("พิกัด : ", "วัดกิ่งแก้ว บางพลี สมุทรปราการ", "พิกัด"),
    ("1.พิกัด: ", "วัดดอนยายหอม", "พิกัด"),
    ("พิกัด:", "ตำบลในคลองบางปลากด", "พิกัด"),
    ("", "วัดกิ่งแก้ว บางพลี", None),  # no prefix
    ("", "ตลาดเมืองนนทบุรี", None),
    ("ที่อยู่: ", "บ้านเลขที่ 123 หมู่ 4 ต.บางปลา", "ที่อยู่"),
    ("", "สวนสยาม (โลเคชั่นทางแชท)", "placeholder"),
    ("", "โลเคชั่นทางแชท หน้าร้านวัลลภ", "placeholder"),
    ("พิกัด ", "13.7563, 100.5018", "coords"),
    ("GPS: ", "13.7563, 100.5018", "coords"),
]

# ---- SEPARATORS ----
SEPARATORS = ["\n---\n", "\n\n", "\n\n\n", " ☀️ ", "\n--- ☀️ ---\n"]

# ---- TIME FORMATS ----
TIME_FORMATS = [
    ("นัด 14:00", "14:00"),
    ("เวลา 09.30", "09.30"),
    ("ถึง 16:00", "16:00"),
    ("หลัง 17.00", "17.00"),
    ("14:00 น.", "14:00"),
    ("09.30น", "09.30"),
]

# ---- EDGE CASES (deliberately tricky) ----
EDGE_CASES = [
    # Phone-like numbers in address
    ("สมชาย หมู่บ้านพฤกษาวิล49 ซอย30 แขวงบางแค", "ไม่ควรจับ 49 หรือ 30 เป็นเบอร์"),
    # 2-digit numbers near prices  
    ("ประสิทธิ์ 18/4วง 2 ราคา 1,200 บาท", "qty=2, price=1200"),
    # Name with number
    ("คุณมานีมีนา 0822223333 บ้านเลขที่ 888 วง 4 เส้น 2,000บาท", "phone=0822223333"),
    # Address with / in it
    ("พิกัด: หมู่บ้านพฤกษา49/1 ซอย30 โทร: 0812345678", "phone=0812345678"),
    # Multiple prices no รวม
    ("18/4วงราคา 1,600 / 17/4วงราคา 2,000 / 18/12วงราคา 8,100", "total=11700"),
    # All on one line
    ("1.พิกัด: วัดโทร: 0812345678 ล้อ:18/4วงราคา2,000บาท ชื่อเฟส: สมชาย", "ทุกฟิลด์ในบรรทัดเดียว"),
    # No customer name
    ("พิกัด: ซอยวัดอโศการาม โทร: 0812345678 18/4วง 2,000บาท", "no customer name"),
    # Just a name and phone
    ("สมชาย 0812345678", "minimal"),
    # GPS coords in แชท format
    ("พิกัด: 13.7563, 100.5018 (โลเคชั่นทางแชท)", "coords + chat"),
    # Very long customer name
    ("สมชาย วงศ์เจริญกิจสกุลดี 0812345678 พิกัด: บางนา","long name"),
    # Quantity from "จำนวน"
    ("สมชาย 0812345678 จำนวน 6 เส้น ราคา 3,000 บาท", "explicit qty"),
]


# ========================
# 2. PARSER SIMULATION
# ========================

def simulate_extract(block: str) -> dict:
    """จำลอง parser extractor ใน Python (mirror logic จาก extractor.js)"""
    job = {
        "id": "test",
        "customer_name": None,
        "phone": None,
        "location_raw": None,
        "locationType": None,
        "wheelSizes": [],
        "wheel_str": None,
        "price": 0,
        "quantity": 0,
        "time_note": None,
    }

    # ---- PHONE ----
    m = re.search(r'(?:เบอร์|โทร|Tel|Phone)\s*[:：]?\s*([\d\s-]{9,15})', block, re.I)
    if m:
        job["phone"] = re.sub(r'\D', '', m.group(1))[:10]
    else:
        pm = re.search(r'(?:^|\s)(0\d{8,9})(?:\s|$)', block)
        if pm:
            job["phone"] = pm.group(1)

    # ---- CUSTOMER NAME ----
    # Pattern: prefix + name
    m = re.search(r'(?:ชื่อเฟส|ลูกค้า|คุณ|ชื่อ|เฟส)\s*[:：]?\s*([\w\s.\'-]{1,30}?)\s*(?=\d{9,10}|พิกัด|ที่อยู่|โทร|เบอร์|$)', block, re.U | re.M)
    if not m:
        m = re.search(r'^([\w\s.\'-]{2,30})$', block, re.U | re.M)
    if m:
        job["customer_name"] = m.group(1).strip()
    # Fallback
    if not job["customer_name"]:
        cleaned = re.sub(r'0\d{8,9}', ' ', block)
        lines = [l.strip() for l in cleaned.split('\n') if l.strip()]
        for line in lines:
            if re.search(r'^(?:เบอร์|โทร|พิกัด|ที่อยู่|ราคา|ล้อ|ชื่อเฟส|เวลา|นัด)', line, re.I):
                continue
            nm = re.search(r'^[\w][\w\s.\'-]{1,30}', line, re.U)
            if nm and len(nm.group(0).strip()) >= 2:
                job["customer_name"] = nm.group(0).strip()
                break

    # ---- LOCATION ----
    # Chat location first
    chat_loc = re.search(r'(?:โลเคชั่น(?:ทาง)?(?:ช่อง)?แชท|location)', block, re.I)
    if chat_loc:
        paren = re.search(r'([^()\[\]\n{}]{3,100})\s*[\[({](?:โลเคชั่น(?:ทาง)?(?:ช่อง)?แชท)[\])}]', block, re.I | re.U)
        raw = re.search(r'(?:โลเคชั่น(?:ทาง)?(?:ช่อง)?แชท|location)[^\n]*?([\w\d\s./,-]{3,60})', block, re.I | re.U)
        loc_raw = paren.group(1).strip() if paren else (raw.group(1).strip() if raw else 'พิกัดจากแชท')
        loc_raw = re.sub(r'^(?:\d*\.?\s*)?พิกัด\s*[:：]\s*', '', loc_raw, flags=re.I).strip()
        job["location_raw"] = loc_raw + ' (โลเคชั่นทางแชท)'
        job["locationType"] = 'placeholder'

    # Coords
    if not job["location_raw"]:
        m = re.search(r'(?:พิกัด|coord|gps|location)\s*[:：]?\s*(-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+)', block, re.I)
        if m:
            job["location_raw"] = m.group(1).replace(' ', '')
            job["locationType"] = 'coords'

    # Pikad prefix
    if not job["location_raw"]:
        pm = re.search(r'\d*\.?\s*พิกัด\s*[:：]\s*([^\n]+(?:\n(?!โทร|ล้อ|ชื่อเฟส|ชื่อ)[^\n]+)*)', block, re.I)
        if pm:
            job["location_raw"] = pm.group(1).strip()
            job["locationType"] = 'pikad'

    # ที่อยู่ prefix
    if not job["location_raw"]:
        m = re.search(r'(?:ที่อยู่|地址|Loc|l\.)[ ]*[:：]?\s*(.+?)[\n]|(?:[\w].*?[ตอ].+?\d{2,})', block, re.I | re.U)
        if m:
            location_candidate = (m.group(1) or m.group(0)).strip()
            job["location_raw"] = location_candidate
            job["locationType"] = 'address'

    # ---- TIME ----
    m = re.search(r'(?:เวลา|นัด|ถึง|ส่ง|after|before)\s*[:：]?\s*(\d{1,2}[.:]\d{2}(?:\s*[AP]M)?)', block, re.I)
    if m:
        job["time_note"] = m.group(1)

    # ---- WHEEL SIZES ----
    sizes = []
    # Pattern 1: Standard 185/65R15
    tyre_regex = re.compile(r'(\d{1,3})/[-]?(\d{1,3})R(\d{1,3})')
    for match in tyre_regex.finditer(block):
        sizes.append({
            "width": int(match.group(1)),
            "profile": int(match.group(2)),
            "rim": int(match.group(3)),
        })

    # Pattern 2: Teacher format
    if not sizes:
        teacher_regex = re.compile(r'(?:^|[^/\d])(\d{1,2})/(\d{1,2})\s*(วง|ชุด|ล้อ)')
        for tw in teacher_regex.finditer(block):
            sizes.append({
                "width": int(tw.group(1)),
                "profile": int(tw.group(2)),
                "rim": 0,
                "unit": tw.group(3),
            })

        # Quantity-only fallback
        if not sizes:
            qm = re.search(r'(?<!\d)[ \t]*\d{1,3}\s*(?:วง|ชุด)(?:\s*พร้อมยาง|\s*ราคา)?', block)
            if qm:
                num = int(re.sub(r'\D', '', qm.group(0)))
                is_set = 'ชุด' in qm.group(0)
                job["quantity"] = num * 4 if is_set else num
                job["wheel_str"] = f"{job['quantity']} วง"

    if sizes:
        job["wheelSizes"] = sizes
        # Build wheel_str
        parts = []
        for s in sizes:
            if s.get("rim"):
                parts.append(f"{s['width']}/{s['profile']}R{s['rim']}")
            else:
                parts.append(f"{s['width']}/{s['profile']}")
        job["wheel_str"] = ', '.join(parts)

        # Qty from cleanup
        qty_clean = re.sub(
            r'(?<!\d)\d{1,2}/\d{1,2}\s*(?:วง|ชุด|ล้อ|พร้อมยาง)(?:\s*\+\s*(?:\s*\d{1,2}/\d{1,2}\s*(?:วง|ชุด|ล้อ|พร้อมยาง)))*',
            ' ', block
        )
        all_nums = re.findall(r'(?<!\d)\d{1,3}(?:\s|$)', qty_clean)
        if all_nums:
            p = job.get("price", 0)
            for n in all_nums:
                parsed = int(n)
                if parsed != p and parsed <= 99:
                    job["quantity"] = parsed
                    break
        # From unit
        if not job["quantity"] and sizes and sizes[0].get("unit"):
            job["quantity"] = sum(
                (s["profile"] * 4 if s.get("unit") == 'ชุด' else s["profile"])
                for s in sizes
            )

    # ---- PRICE ----
    price_matches = list(re.finditer(r'ราคา\s*[:：]?\s*([\d,]+)\s*(?:บาท|บ\.?|฿)?', block, re.I))
    if price_matches:
        job["price"] = sum(int(m.group(1).replace(',', '')) for m in price_matches)
    else:
        m = re.search(r'([\d,]+)\s*(?:บาท|บ\.?|฿)', block, re.I)
        if m:
            job["price"] = int(m.group(1).replace(',', ''))

    # End-of-block fallback
    if not job["price"]:
        m = re.search(r'(?<!\d)(\d{3,5})\s*$', block)
        if m:
            job["price"] = int(m.group(1))

    # รวมเป็นเงิน override
    total_match = re.search(r'รวม(?:เป็น)?เงิน\s*([\d,]+)\s*(?:บาท|บ\.?|฿)?', block, re.I)
    if total_match:
        total_price = int(total_match.group(1).replace(',', ''))
        if total_price > job["price"]:
            job["price"] = total_price

    # ---- QUANTITY (explicit) ----
    if not job["quantity"]:
        m = re.search(r'จำนวน\s*[:：]?\s*(\d+)', block)
        if m:
            job["quantity"] = int(m.group(1))
    if not job["quantity"]:
        fallback_nums = re.findall(r'(?<!\d)\d{1,3}(?!\s*\d)', block)
        if fallback_nums:
            p = job.get("price", 0)
            for n in fallback_nums:
                parsed = int(n)
                if parsed != p and parsed <= 99:
                    job["quantity"] = parsed
                    break

    return job


# ========================
# 3. TEST GENERATORS
# ========================

def gen_variation(name, phone_fmt, wheel_str, price_str, loc_str, order_num="", sep=""):
    """Combine parts into a block"""
    parts = []
    if order_num:
        parts.append(f"{order_num}.")
    if name:
        parts.append(name)
    parts.append(phone_fmt)
    if loc_str:
        parts.append(loc_str)
    if wheel_str:
        parts.append(wheel_str)
    if price_str:
        parts.append(price_str)
    return sep.join([", ".join([p for p in parts if p])])

def generate_single_orders():
    """Generate single-order test patterns"""
    tests = []
    for name in NAMES:
        for phone_prefix, phone_str, expected_phone in PHONE_FORMATS:
            phone_full = f"{phone_prefix}{phone_str}"
            for wheel_pattern, *wheel_expected in WHEEL_FORMATS:
                if wheel_expected[0] == "multi":
                    continue
                for price_pattern, expected_price, is_multi, _ in PRICE_FORMATS:
                    if is_multi or price_pattern in ("800", "ล้อ 2 800"):
                        continue
                    # Build location with each format
                    for loc_prefix, loc_text, loc_type in LOCATION_FORMATS:
                        loc = f"{loc_prefix}{loc_text}" if loc_prefix else loc_text
                        # Skip coords with non-coord wheel patterns
                        if loc_type == "coords" and wheel_expected[1] != "multi":
                            continue
                        block = f"{name} {phone_full} {loc} {wheel_pattern} {price_pattern}"
                        expected = {
                            "customer_name": name,
                            "phone": expected_phone,
                            "location_raw": loc if not loc_type else None,
                        }
                        tests.append((block, expected, "single_order"))
    return tests

def generate_multi_orders():
    """Generate multi-item orders (like order 7)"""
    tests = []
    # Multi-wheel + multi-price combo
    items_list = [
        ("15/4วงราคา 1,600 บาท", 15, 4, 1600),
        ("17/4วงราคา 2,000 บาท", 17, 4, 2000),
        ("18/12วงราคา 8,100บาท", 18, 12, 8100),
        ("18/4วงพร้อมยาง6,000บาท", 18, 4, 6000),
        ("16/2วงราคา 800 บาท", 16, 2, 800),
    ]

    for i in range(len(items_list)):
        for j in range(i+1, len(items_list)):
            items = items_list[i:j+1]
            wheels = [x[0] for x in items]
            total_price = sum(x[3] for x in items)
            total_qty = sum(x[2] for x in items)

            # Format 1: on separate lines
            block = f"พิกัด: วัดบางแห่ง\nโทร: 0812345678\n"
            for w in wheels:
                block += f"{w}\n"
            block += f"รวมเป็นเงิน{total_price:,}บาท"
            tests.append((block, {"price": total_price}, "multi_separate_lines"))

            # Format 2: with รวมเป็นเงิน
            block2 = f"พิกัด: วัดบางแห่ง โทร: 0812345678\n"
            block2 += " ".join(wheels)
            block2 += f" รวมเป็นเงิน{total_price}บาท"
            tests.append((block2, {"price": total_price}, "multi_same_line_total"))

            # Format 3: / separator
            block3 = f"พิกัด: วัดบางแห่ง โทร: 0812345678\n{' / '.join(wheels)}"
            tests.append((block3, {"price": total_price}, "multi_slash_sep"))

    return tests

def generate_edge_cases():
    """Edge cases that should trip the parser"""
    tests = []
    tests.append(("สมชาย หมู่บ้านพฤกษาวิล49 ซอย30 แขวงบางแค", {}, "phone_trap_in_address"))
    tests.append(("ประสิทธิ์ 18/4วง 2 ราคา 1,200 บาท", {"price": 1200, "quantity": 2}, "qty_price"))
    tests.append(("คุณมานีมีนา 0822223333 บ้านเลขที่ 888 วง 4 เส้น 2,000บาท", {"phone": "0822223333"}, "complex"))
    tests.append(("พิกัด: หมู่บ้านพฤกษา49/1 ซอย30 โทร: 0812345678", {"phone": "0812345678"}, "address_with_slash"))
    tests.append(("18/4วงราคา 1,600 / 17/4วงราคา 2,000 / 18/12วงราคา 8,100", {"price": 11700}, "multi_price_no_total"))
    tests.append(("1.พิกัด: วัด โทร: 0812345678 ล้อ:18/4วงราคา2,000บาท ชื่อเฟส: สมชาย", {"phone": "0812345678", "price": 2000}, "one_liner"))
    tests.append(("พิกัด: ซอยวัดอโศการาม โทร: 0812345678 18/4วง 2,000บาท", {}, "no_customer_name"))
    tests.append(("สมชาย 0812345678", {"phone": "0812345678", "customer_name": "สมชาย"}, "minimal"))
    tests.append(("พิกัด: 13.7563, 100.5018 (โลเคชั่นทางแชท)", {}, "coords_chat_hybrid"))
    tests.append(("สมชาย วงศ์เจริญกิจสกุลดี 0812345678 พิกัด: บางนา", {"phone": "0812345678"}, "long_name"))
    tests.append(("สมชาย 0812345678 จำนวน 6 เส้น ราคา 3,000 บาท", {"phone": "0812345678", "price": 3000, "quantity": 6}, "explicit_qty"))
    return tests

def generate_combinatorial():
    """Generate FULL combinatorial explosion for 500K patterns"""
    tests = []

    # Core dimensions
    names = ["สมชาย", "วรรณา", "Tonnam", "Aum Pimon", "Christian", "Thanatchon", "พสิษฐ์", "Kai kaii", "วิชัย", "มานี"]
    phones = [
        ("", "0812345678", "0812345678"),
        ("เบอร์:", "0812345678", "0812345678"),
        ("โทร: ", "092-280-5684", "0922805684"),
        ("Tel ", "0812345678", "0812345678"),
        ("", "0922805684", "0922805684"),
    ]
    wheel_patterns = [
        ("18/4วง", [(18, 4, 0)], ["วง"]),
        ("17/4วง", [(17, 4, 0)], ["วง"]),
        ("15/4วง", [(15, 4, 0)], ["วง"]),
        ("16/2วง", [(16, 2, 0)], ["วง"]),
        ("18/4ชุด", [(18, 4, 0)], ["ชุด"]),
    ]
    locations = [
        ("พิกัด: ", "วัดกิ่งแก้ว บางพลี"),
        ("", "ซอยวัดอโศการาม สมุทรปราการ"),
        ("พิกัด:", "ตำบลในคลองบางปลากด"),
        ("", "วัดดอนยายหอม"),
        ("", "ตลาดเมืองนนทบุรี"),
    ]
    prices = [
        ("ราคา 1,600 บาท", 1600),
        ("ราคา800บาท", 800),
        ("2,000 บาท", 2000),
        ("ราคา 1,200 บาท", 1200),
        ("2,600บ.", 2600),
    ]
    extra = ["", "นัด 14:00", "ด่วน", "หมายเหตุ: วางไว้หน้าเซเว่น"]
    order_nums = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"]

    generated = 0
    target = 300_000  # first batch

    for name in names:
        for phone_prefix, phone_str, expected_phone in phones:
            phone_full = f"{phone_prefix}{phone_str}" if phone_prefix else phone_str
            for wheel_str, wheel_data, units in wheel_patterns:
                for loc_prefix, loc_text in locations:
                    loc = f"{loc_prefix}{loc_text}" if loc_prefix else loc_text
                    for price_str, expected_price in prices:
                        base_block = f"{name} {phone_full} {loc} {wheel_str} {price_str}"
                        tests.append((base_block, {"phone": expected_phone, "price": expected_price}, "combinatorial"))
                        generated += 1

                        # With order number variations
                        for onum in order_nums:
                            if onum:
                                block2 = f"{onum}.{name} {phone_full} {loc} {wheel_str} {price_str}"
                                tests.append((block2, {"phone": expected_phone, "price": expected_price}, "combinatorial_with_num"))
                                generated += 1

                        # With extra fields
                        for ext in extra:
                            if ext:
                                block3 = f"{name} {phone_full} {loc} {wheel_str} {price_str} {ext}"
                                tests.append((block3, {"phone": expected_phone, "price": expected_price}, "combinatorial_with_extra"))
                                generated += 1

    print(f"  Generated combinatorial: {generated}")
    return tests


def generate_non_sense():
    """Generate non-sense / unreasonable patterns"""
    tests = []

    # Random fragments
    senseless = [
        "abcdefghij",
        "12345 67890",
        "!@#$%^&*()",
        "พิกัด พิกัด พิกัด พิกัด",
        "0812345678 0812345678 0812345678",
        "18/418/418/418/4",
        "A" * 1000,
        "",
        " \n  \n   ",
        "ราคา ราคา ราคา",
        "9999999999999",
        "12/34/56/78",
        "วัดวัดวัดวัดวัดวัดวัดวัดวัด",
        "0",
        "12345678901234567890",
        "เบอร์โทรศัพท์: 0",
        "ล้อ: ////วง",
    ]
    for s in senseless:
        tests.append((s, {}, f"nonsense_{s[:20]}"))

    # Random combinations of unrelated data
    random.seed(42)
    fragments = ["พิกัด", "โทร", "18/4", "ราคา", "สมชาย", "0812345678", "วัด", "วง", "บาท", "---", "xxx"]
    for _ in range(200):
        shuffled = random.sample(fragments, random.randint(3, 8))
        block = " ".join(shuffled)
        tests.append((block, {}, f"random_mix_{_}"))

    return tests


# ========================
# 4. RUN + CLASSIFY
# ========================

def classify_result(block: str, result: dict, expected: dict) -> dict:
    """Classify if result is bug or pass"""
    bugs = []
    # Check price
    if expected.get("price"):
        if result.get("price") != expected["price"]:
            bugs.append({
                "type": "price_wrong",
                "field": "price",
                "expected": expected["price"],
                "got": result["price"],
                "diff": result["price"] - expected["price"] if result.get("price") else -expected["price"]
            })

    # Check phone
    if expected.get("phone"):
        result_phone = result.get("phone") or ""
        if result_phone != expected["phone"]:
            bugs.append({
                "type": "phone_wrong",
                "field": "phone",
                "expected": expected["phone"],
                "got": result_phone,
            })

    # Check customer_name
    if expected.get("customer_name"):
        result_name = result.get("customer_name") or ""
        if result_name != expected["customer_name"]:
            bugs.append({
                "type": "name_wrong",
                "field": "customer_name",
                "expected": expected["customer_name"],
                "got": result_name,
            })

    # Check quantity
    if expected.get("quantity"):
        if result.get("quantity") != expected["quantity"]:
            bugs.append({
                "type": "qty_wrong",
                "field": "quantity",
                "expected": expected["quantity"],
                "got": result["quantity"],
            })

    # Missing critical fields (expected but not found)
    for field in ["customer_name", "phone", "location_raw"]:
        if expected.get(field) and not result.get(field):
            bugs.append({
                "type": "field_missing",
                "field": field,
                "expected": expected[field],
                "got": None,
            })

    severity = "pass" if not bugs else "bug_major"
    
    # Check for empty result (all fields empty)
    filled_fields = sum(1 for k in ["customer_name", "phone", "location_raw", "wheel_str", "price", "quantity"] if result.get(k))
    if filled_fields == 0 and block.strip():
        severity = "bug_major"  # parser returned nothing for non-empty input

    return {
        "severity": severity,
        "bugs": bugs,
        "block": block[:100] + ("..." if len(block) > 100 else ""),
        "result_summary": {k: result.get(k) for k in ["customer_name", "phone", "price", "quantity", "wheel_str"]},
        "expected": expected,
    }


def run_tests():
    """Generate and run all tests"""
    print("=" * 60)
    print("🔧 PARSER 500K TEST SUITE")
    print("=" * 60)
    start = time.time()

    all_tests = []
    categories = {}

    # Phase 1: Single orders
    print("\n📦 Phase 1: Single orders...")
    count = 0
    for name in NAMES:
        for phone_prefix, phone_str, expected_phone in PHONE_FORMATS:
            phone_full = f"{phone_prefix}{phone_str}"
            for wheel_pattern, *we in WHEEL_FORMATS:
                if we[0] == "multi":
                    continue
                for loc_prefix, loc_text, loc_type in LOCATION_FORMATS:
                    loc = f"{loc_prefix}{loc_text}" if loc_prefix else loc_text
                    block = f"{name} {phone_full} {loc} {wheel_pattern} ราคา 1,000 บาท"
                    all_tests.append((block, {"phone": expected_phone}, "single_order"))
                    count += 1
    categories["single_order"] = count
    print(f"  → {count} tests")

    # Phase 2: Multi orders (like order 7)
    print("\n📦 Phase 2: Multi orders...")
    count = 0
    for r in range(1, 30):
        for name in NAMES[:5]:
            items = []
            for i in range(r % 4 + 2):  # 2-5 items
                idx = (r + i) % 5
                w = WHEEL_FORMATS[idx]
                if w[1] == "multi":
                    continue
                items.append(f"{w[0]}ราคา{1000 * (i+1):,}บาท")
            total = sum(1000 * (i+1) for i in range(len(items)))
            block = f"{name} โทร: 0812345678 พิกัด: วัด\n" + "\n".join(items) + f"\nรวมเป็นเงิน{total:,}บาท"
            all_tests.append((block, {"price": total}, "multi_order"))
            count += 1
    categories["multi_order"] = count
    print(f"  → {count} tests")

    # Phase 3: Combinatorial (systematic)
    print("\n📦 Phase 3: Combinatorial (huge)...")
    combos = generate_combinatorial()
    all_tests.extend(combos)
    categories["combinatorial"] = len(combos)

    # Phase 4: Price edge cases
    print("\n📦 Phase 4: Price edge cases...")
    count = 0
    for name in NAMES:
        for fmt in PRICE_FORMATS:
            price_str, expected_price, is_multi, multi_exp = fmt
            block = f"{name} โทร: 0812345678 18/4วง {price_str}"
            exp = {"price": multi_exp if is_multi else expected_price}
            all_tests.append((block, exp, "price_edge"))
            count += 1
    categories["price_edge"] = count
    print(f"  → {count} tests")

    # Phase 5: Non-sense
    print("\n📦 Phase 5: Non-sense patterns...")
    nonsense = generate_non_sense()
    all_tests.extend(nonsense)
    categories["nonsense"] = len(nonsense)

    # Phase 6: Separators + multi-block
    print("\n📦 Phase 6: Multi-block via separators...")
    count = 0
    for name in NAMES[:10]:
        for sep in SEPARATORS:
            block = f"{name} โทร: 0812345678 18/4วง{sep}วรรณา โทร: 0822223333 17/4วง"
            # Note: tokenizer handles separators, not extractor
            all_tests.append((block, {}, "multi_block"))
            count += 1
    categories["multi_block"] = count
    print(f"  → {count} tests")

    # Phase 7: Wheel format variations
    print("\n📦 Phase 7: Wheel variations...")
    count = 0
    wheel_variations = [
        "18/4วง", "18 /4วง", "18/ 4วง", "18/4 วง", "18/4  วง",
        "18/4วงราคา", "18/4วง ราคา", "18/4 วง ราคา",
        "18/4ชุด", "18/4 ชุด", "18/4ล้อ",
        "185/65R15", "185 /65R15", "185/65 R15",
        "17/4+18/4", "17/4+18/4+15/4",
    ]
    for name in NAMES:
        for wv in wheel_variations:
            block = f"{name} โทร: 0812345678 {wv} ราคา 1,000 บาท"
            all_tests.append((block, {}, f"wheel_var_{wv[:15]}"))
            count += 1
    categories["wheel_variations"] = count
    print(f"  → {count} tests")

    # Phase 8: Location edge cases
    print("\n📦 Phase 8: Location edge cases...")
    count = 0
    loc_edge = [
        "13.7563, 100.5018",
        "พิกัด 13.7563, 100.5018",
        "13.7563,100.5018",
        "ซอยวัดอโศการาม สมุทรปราการ (โลเคชั่นทางแชท)",
        "โลเคชั่นทางแชท หน้าร้านวัลลภ",
        "พิกัดจากไลน์",
        "ตำบลในคลองบางปลากด อ.เมือง จ.สมุทรปราการ",
        "บางนา-ตราด กม.12",
        "หมู่บ้านพฤกษา 49/1 ซอย 30",
    ]
    for name in NAMES:
        for loc_str in loc_edge:
            block = f"{name} โทร: 0812345678 {loc_str} 18/4วง ราคา 1,000 บาท"
            all_tests.append((block, {}, "loc_edge"))
            count += 1
    categories["loc_edge"] = count
    print(f"  → {count} tests")

    # Target: 500,000
    # If we have fewer, fill with randomized combos
    print(f"\n📊 Total test patterns: {len(all_tests):,}")
    target = 500_000
    if len(all_tests) < target:
        remaining = target - len(all_tests)
        print(f"  Filling gap: +{remaining:,} randomized patterns...")
        random.seed(1234)
        for _ in range(remaining):
            name = random.choice(NAMES)
            pw_idx = random.randint(0, len(PHONE_FORMATS) - 1)
            _, phone_str, expected_phone = PHONE_FORMATS[pw_idx]
            wheel = random.choice(["18/4วง", "17/4วง", "15/4วง", "16/2วง"])
            price = random.randint(10, 9999) * 100
            block = f"{name} {phone_str} {wheel} {price:,}บาท"
            all_tests.append((block, {"phone": expected_phone, "price": price}, "random_fill"))
        categories["random_fill"] = remaining
    # Truncate to exact 500K
    all_tests = all_tests[:target]

    print(f"\n{'='*60}")
    print(f"🚀 RUNNING {len(all_tests):,} TESTS...")
    print(f"{'='*60}")

    # Run tests
    results = {
        "pass": [],
        "bug_major": [],
        "bug_minor": [],
    }
    bugs_found = {
        "price_wrong": [],
        "phone_wrong": [],
        "name_wrong": [],
        "qty_wrong": [],
        "field_missing": [],
        "other": [],
    }

    batch_size = 10000
    for i in range(0, len(all_tests), batch_size):
        batch = all_tests[i:i+batch_size]
        for block, expected, category in batch:
            result = simulate_extract(block)
            classification = classify_result(block, result, expected)
            results[classification["severity"]].append(classification)
            for bug in classification["bugs"]:
                bug["category"] = category
                btype = bug["type"]
                if btype in bugs_found:
                    bugs_found[btype].append(bug)

        if (i + batch_size) % 50000 == 0 or i + batch_size >= target:
            elapsed = time.time() - start
            rate = (i + batch_size) / elapsed if elapsed > 0 else 0
            print(f"  Progress: {min(i + batch_size, target):,}/{target:,} tests | "
                  f"bugs: {len(results['bug_major']):,}(major)+{len(results['bug_minor']):,}(minor) | "
                  f"{rate:,.0f} tests/s")

    elapsed = time.time() - start
    print(f"\n{'='*60}")
    print(f"📊 RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"  Total tests: {len(all_tests):,}")
    print(f"  Time: {elapsed:.1f}s ({len(all_tests)/elapsed:,.0f} tests/s)")
    print(f"  Pass: {len(results['pass']):,} ({100*len(results['pass'])/len(all_tests):.1f}%)")
    print(f"  Bug (major): {len(results['bug_major']):,} ({100*len(results['bug_major'])/len(all_tests):.1f}%)")
    print(f"  Bug (minor): {len(results['bug_minor']):,} ({100*len(results['bug_minor'])/len(all_tests):.1f}%)")

    # Bug breakdown
    print(f"\n{'─'*60}")
    print(f"🔴 BUG BREAKDOWN BY TYPE")
    print(f"{'─'*60}")
    for bug_type, bug_list in bugs_found.items():
        # Deduplicate by block prefix
        unique_blocks = set(b["block"] for b in bug_list)
        print(f"  {bug_type}: {len(bug_list):,} instances ({len(unique_blocks):,} unique blocks)")

    # Sample bugs
    print(f"\n{'─'*60}")
    print(f"🔍 SAMPLE BUGS (TOP 10)")
    print(f"{'─'*60}")
    for severity_label in ["bug_major", "bug_minor"]:
        samples = results[severity_label][:5]
        for s in samples:
            print(f"  [{severity_label}] {s['block'][:70]}")
            for b in s["bugs"][:2]:
                print(f"    ├─ {b['type']}: expected={b.get('expected')}, got={b.get('got')}")
            if len(s["bugs"]) > 2:
                print(f"    └─ +{len(s['bugs'])-2} more bugs")

    # Save report
    import os
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    report = {
        "total": len(all_tests),
        "elapsed_seconds": elapsed,
        "pass": len(results["pass"]),
        "bug_major": len(results["bug_major"]),
        "bug_minor": len(results["bug_minor"]),
        "bugs_by_type": {k: len(v) for k, v in bugs_found.items()},
        "top_bugs": [],
    }

    # Top bugs (most impactful)
    for bug_type, bug_list in bugs_found.items():
        if bug_list:
            # Group by similar pattern
            from collections import Counter
            pattern_counts = Counter(b["block"][:60] for b in bug_list)
            top = pattern_counts.most_common(5)
            report["top_bugs"].append({
                "type": bug_type,
                "count": len(bug_list),
                "examples": [{"pattern": p, "occurrences": c} for p, c in top]
            })

    with open(f"{OUTPUT_DIR}/report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Report saved: {OUTPUT_DIR}/report.json")
    print(f"  {'='*60}")

    return report


if __name__ == "__main__":
    report = run_tests()