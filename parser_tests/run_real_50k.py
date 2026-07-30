#!/usr/bin/env python3
"""
LOGIS MASTER — REAL DATA 50,000 Test Generator
จำลองทุกรูปแบบข้อความจริงที่ลูกค้าส่งมา: พิกัด → โทร → ล้อ → ชื่อเฟส
"""
import re, json, sys, time, random, itertools, os
from datetime import datetime
from dataclasses import dataclass, field, asdict

# ─── DATA POOLS ───────────────────────────────────────────
NAMES = [
    "เรื่องของเวลา", "Tonnam", "Pong", "Kai kaii", "Aum Pimon",
    "Christian", "Thanatchon", "พสิษฐ์ มีก่ำ", "สมชาย ใจดี", "มานี จันทร์เจ้า",
    "ร้านวรรณา แอนด์ซัน", "Tony", "John", "Somchai", "Ann",
    "คุณหญิง แห่งสยาม", "Little Tyre Shop", "เจ๊นิดหน่อย", "วินมอเตอร์ไซค์",
    "อู่ซ่อมรถ พี่ต้อม", "เฮียเป้ง ยางรถ", "พี่เบิร์ด", "น้องปาล์ม", "ลุงโชค",
]

LOCATIONS = [
    "บ้านกู", "ซอยวัดอโศการาม สมุทรปราการ", "วัดกิ่งแก้ว บางพลี สมุทรปราการ",
    "สรงประภา30", "ตำบลในคลองบางปลากดฯ", "ตำบลไทรม้า เมืองนนทบุรี",
    "พฤกษาวิล49", "วัดดอนยายหอม", "หน้าวัดพระศรีฯ", "ตลาดบางแค",
    "ปั๊มน้ำมัน ปตท. บางนา", "ซอยสุขสวัสดิ์ 13", "ตรงข้ามสนามบินเก่า",
    "หลังรพ.พระนคร", "เจริญนคร 57", "บางบัวทอง อบต.",
    "แยกไฟแดงบางใหญ่", "โลตัส บางพลี", "เดอะมอลล์ บางแค",
    "วัดไทรใหญ่", "หมู่บ้านพฤกษา 56", "ซอยเพชรเกษม 48", "โลเคชั่นทางแชท",
    "หน้าปากซอย 7", "อบต.บางรักพัฒนา", "แยกไฟแดงวัดลุ่ม",
    "เลียบคลอง 13", "หมู่บ้านวรินทร 2", "ชุมชนร่วมใจ 12",
    "ตลาดน้ำวัดลำพญา", "ซอยกาญจนาภิเษก 5/1", "ศาลเจ้าพ่อเสือ",
    "หลังวัดใหม่พิเศษ", "ข้างร้าน 7-11 สาขา 126", "ทางเข้าโครงการบ้านสวย",
    "ปากทางเข้าหมู่บ้าน", "หน้าโรงเรียนวัดจันทราวาส",
]

WHEEL_VARIANTS = [
    # (width, profile, qty, price)
    (15, 4, 4, 1600), (15, 4, 2, 800),
    (16, 4, 2, 1200), (16, 2, 1, 600),
    (17, 4, 4, 2000), (17, 4, 2, 1000),
    (18, 4, 4, 2800), (18, 2, 2, 1400),
    (18, 12, 12, 8100), (18, 4, 2, 1400),
    (14, 4, 4, 1200), (14, 2, 2, 600),
    (19, 4, 4, 3500), (19, 2, 2, 1750),
    (20, 4, 4, 5000), (20, 2, 2, 2500),
]

PHONES = [
    "0999999999", "0812345678", "0870788186", "0972804727",
    "0987325410", "0897983210", "0992255245", "0922805684",
    "080-988-7547", "092-280-5684", "099-999-9999",
    "081-123-4567", "082-345-6789", "083-567-8901",
    "084-901-2345", "085-678-9012", "086-789-0123",
    "087-890-1234", "088-901-2345", "089-012-3456",
]

# ─── FORMAT GENERATORS ────────────────────────────────────

@dataclass
class TestCase:
    id: int
    raw_text: str
    expected: dict
    category: str  # "simple", "multi", "edge", "stress"
    desc: str

def gen_simple_block(name, phone, loc, w, qty, price):
    """Standard 4-line format: พิกัด→โทร→ล้อ→ชื่อเฟส"""
    lines = [
        f"พิกัด:{loc}",
        "",
        f"โทร:{phone}",
        "",
        f"ล้อ:{w}/{qty}วง {price:,}บาท",
        "",
        f"ชื่อเฟส: {name}",
    ]
    expected = {
        "customer_name": name,
        "phone": re.sub(r'\D', '', phone),
        "wheel_expected": [{"width": w, "profile": qty}],
        "total_qty": qty,
        "total_price": price,
        "has_location": True,
    }
    text = "\n".join(lines)
    return text, expected


def gen_simple_block_variants(name, phone, loc, w, qty, price):
    """Generate MULTIPLE format variants for each data set"""
    cases = []
    
    # V1: Standard format (colon)
    cases.append((
        f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง {price:,}บาท\n\nชื่อเฟส: {name}",
        {"customer_name": name, "phone": re.sub(r'\D', '', phone),
         "wheel_expected": [{"width": w, "profile": qty}],
         "total_qty": qty, "total_price": price}
    ))
    
    # V2: Space after colon
    cases.append((
        f"พิกัด: {loc}\n\nโทร: {phone}\n\nล้อ: {w}/{qty}วง  {price:,} บาท\n\nชื่อเฟส: {name}",
        {"customer_name": name, "phone": re.sub(r'\D', '', phone),
         "wheel_expected": [{"width": w, "profile": qty}],
         "total_qty": qty, "total_price": price}
    ))
    
    # V3: No space between price and บาท
    cases.append((
        f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง{price:,}บาท\n\nชื่อเฟส: {name}",
        {"customer_name": name, "phone": re.sub(r'\D', '', phone),
         "wheel_expected": [{"width": w, "profile": qty}],
         "total_qty": qty, "total_price": price}
    ))
    
    # V4: ปริมาณ instead of วง
    cases.append((
        f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}{{unit}} {price:,}บาท\n\nชื่อเฟส: {name}",
        {"customer_name": name, "phone": re.sub(r'\D', '', phone),
         "wheel_expected": [{"width": w, "profile": qty}],
         "total_qty": qty, "total_price": price}
    ))
    
    # V5: ล้อ not on line with wheel (separate line for price)
    cases.append((
        f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง\n{price:,}บาท\n\nชื่อเฟส: {name}",
        {"customer_name": name, "phone": re.sub(r'\D', '', phone),
         "wheel_expected": [{"width": w, "profile": qty}],
         "total_qty": qty, "total_price": price}
    ))
    
    return cases


def gen_multi_wheel_block(name, phone, loc, wheels_list):
    """Multiple wheel sizes in one order (like order #7)"""
    total_qty = sum(w[1] for w in wheels_list)  # sum profiles
    total_price = sum(w[2] for w in wheels_list)  # sum prices
    
    wheel_parts = []
    for w, qty, price in wheels_list:
        wheel_parts.append(f"{w}/{qty}วง{price:,}บาท")
    
    lines = [
        f"พิกัด:{loc}",
        "",
        f"โทร:{phone}",
        "",
        f"ล้อ:{' / '.join(wheel_parts)}",
        f"รวมเป็นเงิน{total_price:,}บาท",
        "",
        f"ชื่อเฟส: {name}",
    ]
    expected = {
        "customer_name": name,
        "phone": re.sub(r'\D', '', phone),
        "wheel_expected": [{"width": w, "profile": q} for w, q, _ in wheels_list],
        "total_qty": total_qty,
        "total_price": total_price,
    }
    text = "\n".join(lines)
    return text, expected


def gen_edge_cases():
    """Edge cases that might break the parser"""
    cases = []
    
    # E1: Name with special chars
    cases.extend([
        (f"พิกัด:บ้านกู\n\nโทร:0812345678\n\nล้อ:18/4วง 2,000บาท\n\nชื่อเฟส: คุณ ต้อม (อู่ซ่อมรถ)", 
         "name with parens", 2000, 4),
        (f"พิกัด:บ้านกู\n\nโทร:0812345678\n\nล้อ:18/4วง 2,000บาท\n\nชื่อเฟส: Tonny's Tyre Shop", 
         "name with apostrophe", 2000, 4),
    ])
    
    # E2: หาย (missing fields)
    cases.append((f"พิกัด:บ้านกู\n\nโทร:0812345678\n\nล้อ:18/4วง 2,000บาท", 
                  "missing name field", 2000, 4))  # Should use fallback
    cases.append((f"พิกัด:บ้านกู\n\nล้อ:18/4วง 2,000บาท", 
                  "missing phone", -1, 4))  # phone=None
    
    # E3: Extra blank lines
    cases.append((f"พิกัด:บ้านกู\n\n\n\nโทร:0812345678\n\n\nล้อ:18/4วง 2,000บาท\n\n\n\nชื่อเฟส: Tonnam", 
                  "extra blanks", 2000, 4))
    
    # E4: Only single line
    cases.append((f"พิกัด:บ้านกู โทร:0812345678 ล้อ:18/4วง 2,000บาท ชื่อเฟส: Tonnam", 
                  "single line", 2000, 4))
    
    # E5: Thai phone (0XX) format  
    cases.append((f"พิกัด:บ้านกู\n\nโทร:(081) 234-5678\n\nล้อ:18/4วง 2,000บาท\n\nชื่อเฟส: Tonnam", 
                  "paren phone", 2000, 4))
    
    # E6: +66 format
    cases.append((f"พิกัด:บ้านกู\n\nโทร:+66812345678\n\nล้อ:18/4วง 2,000บาท\n\nชื่อเฟส: Tonnam", 
                  "+66 phone", 2000, 4))
    
    # E7: Named coordinates instead of address
    cases.append((f"พิกัด:โลเคชั่นทางแชท\n\nโทร:0812345678\n\nล้อ:18/4วง 2,000บาท\n\nชื่อเฟส: Tonnam", 
                  "chat location", 2000, 4))
    
    # E8: Very large price
    cases.append((f"พิกัด:บ้านกู\n\nโทร:0812345678\n\nล้อ:22/4วง 1,500,000บาท\n\nชื่อเฟส: Tonnam", 
                  "large price", 1500000, 4))
    
    # E9: @ instead of / (typo)
    cases.append((f"พิกัด:บ้านกู\n\nโทร:0812345678\n\nล้อ:18@4วง 2,000บาท\n\nชื่อเฟส: Tonnam", 
                  "@ typo wheel", 2000, 4))  # unlikely to parse correctly
    
    # E10: Comma in price without space
    cases.append((f"พิกัด:บ้านกู\n\nโทร:0812345678\n\nล้อ:18/4วง 200,000บาท\n\nชื่อเฟส: Tonnam", 
                  "comma price no space", 200000, 4))
    
    return cases


# ─── PARSER SIMULATION ───────────────────────────────────

def simulate_extract(block):
    """Simulate extractor.js on a block"""
    job = {"customer_name": None, "phone": None, "location_raw": None,
           "wheel_str": None, "quantity": 0, "price": 0, "wheel_sizes": []}
    
    # ---- PHONE ----
    patterns = [
        (r'(?:เบอร์|โทร|Tel|Phone)\s*[:：]?\s*([\d\s-]{9,15})', re.I),
        (r'(?:^|\s)(0\d{8,9})(?:\s|$)', re.M),
        (r'(?:^|\s)\+?66[\s-]?\d{8,9}(?:\s|$)', re.M),
        (r'\(\s*0\d{1,2}\s*\)\s*[\d\s-]{8,10}', re.I),
    ]
    for pat, flags in patterns:
        m = re.search(pat, block, flags)
        if m:
            phone_raw = m.group(1).strip() if len(m.groups()) >= 1 else m.group(0).strip()
            job["phone"] = re.sub(r'\D', '', phone_raw)
            break
    
    # ---- CUSTOMER NAME ----
    # With prefix
    m = re.search(
        r'(?:ชื่อเฟส|ลูกค้า|คุณ|ชื่อ|เฟส)\s*[:：]?\s*([\w\s.\'-]{1,30}?)\s*(?=\d{9,10}|พิกัด|ที่อยู่|โทร|เบอร์|$)',
        block, re.U
    )
    if not m:
        m = re.search(r'^([\w\s.\'-]{2,30})$', block, re.M | re.U)
    if m:
        job["customer_name"] = m.group(1).strip()
    else:
        # Fallback: guess from first non-header line
        cleaned = re.sub(r'0\d{8,9}', ' ', block)
        lines = [l.strip() for l in cleaned.split('\n') if l.strip()]
        for line in lines:
            if re.search(r'^(?:เบอร์|โทร|พิกัด|ที่อยู่|ราคา|ล้อ|ชื่อเฟส|เวลา|นัด)', line, re.I):
                continue
            nm = re.search(r'^[\w][\w\s.\'-]{1,30}', line.strip(), re.U)
            if nm and len(nm.group(0).strip()) >= 2:
                name = nm.group(0).strip()
                # FIX: stopWords trim
                stop_words = [' โทร', ' เบอร์', ' พิกัด', ' ที่อยู่', ' ราคา', ' ล้อ', ' เวลา', ' นัด', ' หมายเหตุ']
                for w in stop_words:
                    idx = name.find(w)
                    if idx >= 2:
                        name = name[:idx].strip()
                        break
                job["customer_name"] = name
                break
    
    # ---- LOCATION ----
    m = re.search(r'พิกัด\s*[:：]?\s*(.+?)(?=\s*โทร|\s*เบอร์|\s*ล้อ|\s*ชื่อเฟส|\s*$)', block, re.I | re.S)
    if m:
        job["location_raw"] = m.group(1).strip()
    
    # ---- WHEEL SIZES ----
    sizes = []
    
    # Pattern 1: standard tyre with R (NO unit — tyre height ≠ qty)
    tyre_regex = re.compile(r'(\d{1,3})/[-]?(\d{1,3})\s*R\s*(\d{1,3})')
    for match in tyre_regex.finditer(block):
        sizes.append({"width": int(match.group(1)), "profile": int(match.group(2)), "rim": int(match.group(3))})
    
    # Pattern 2: teacher format (วง/ชุด/ล้อ)
    teacher_regex = re.compile(r'(?:^|[^/\d])(\d{1,2})/(\d{1,2})\s*(วง|ชุด|ล้อ)')
    if not sizes:
        for tw in teacher_regex.finditer(block):
            sizes.append({"width": int(tw.group(1)), "profile": int(tw.group(2)), "unit": tw.group(3)})
    
    # Pattern 3: multi-item separator / (price separator is also /)
    # e.g. "15/4วงราคา 1,600 / 17/4วงราคา 2,000"
    # This is handled by the teacher regex g flag — each "X/Yวง" is matched separately
    
    if sizes:
        # [FIX 2026-07-30] Qty only from teacher items (those with วง/ชุด/ล้อ unit)
        teacher_items = [s for s in sizes if s.get("unit")]
        from_profiles = sum(s["profile"] for s in teacher_items) if teacher_items else 0
        job["quantity"] = from_profiles
        
        wheel_str = ', '.join([
            f"{s['width']}/{s['profile']}" + (f"R{s['rim']}" if s.get('rim') else "")
            for s in sizes
        ])
        job["wheel_str"] = wheel_str
        job["wheel_sizes"] = sizes
    
    # ---- PRICE ----
    price_matches = list(re.finditer(r'ราคา\s*[:：]?\s*([\d,]+)\s*(?:บาท|บ\.?|฿)?', block, re.I))
    if price_matches:
        job["price"] = sum(int(m.group(1).replace(',', '')) for m in price_matches)
    else:
        # [FIX 2026-07-30] matchAll + reduce, not search (captures ALL prices)
        # First extract "รวมเป็นเงิน" total to avoid double-count
        total_re = re.compile(r'รวม(?:เป็น)?เงิน\s*([\d,]+)\s*(?:บาท|บ\.?|฿)?', re.I)
        total_m2 = total_re.search(block)
        total_val = int(total_m2.group(1).replace(',','')) if total_m2 else 0
        
        # Exclude total line from fallback search space
        fallback_block = block
        if total_m2:
            before = block[:total_m2.start()]
            after = block[total_m2.end():]
            fallback_block = before + after
        
        price_fallback = list(re.finditer(r'([\d,]+)\s*(?:บาท|บ\.?|฿)', fallback_block, re.I))
        if price_fallback:
            job["price"] = sum(int(m.group(1).replace(',', '')) for m in price_fallback)
        # If total > individual sum, use total
        if total_val > (job.get("price") or 0):
            job["price"] = total_val
    
    # ---- QUANTITY ----    
    if not job.get("quantity"):
        # [FIX 2026-07-30] Strip location before looking for standalone numbers
        qty_block = block
        loc_m = re.search(r'พิกัด\s*[:：]?\s*(.+?)(?=\s*โทร|\s*เบอร์|\s*ล้อ|\s*ชื่อเฟส|\s*หมายเหตุ|\s*$)', block, re.I | re.S)
        if loc_m:
            qty_block = block.replace(loc_m.group(0), '')
        qty_block = re.sub(r'\d{2,3}/\d{2,3}\s*R\s*\d{2,3}', ' ', qty_block)  # Strip tyre
        qty_block = re.sub(r'(?<!\d)\d{1,2}/\d{1,2}\s*(?:วง|ชุด|ล้อ|พร้อมยาง)', ' ', qty_block)  # Strip teacher
        qty_block = re.sub(r'\d{1,2}\s*[-–—/]\s*\d{1,3}', ' ', qty_block)  # Strip 7-11
        qty_block = re.sub(r'(?:ซอย|หมู่|บ้าน|เลขที่|ถนน|ตำบล|อำเภอ|แขวง|เขต)\s*\d+[-–—/]?\d*', ' ', qty_block, flags=re.I)  # Strip address
        qty_block = re.sub(r'[\d,]{3,}(?:\s*บาท|บ\.?|฿)?', ' ', qty_block)  # Strip price
        all_nums = re.findall(r'(?<!\d)\d{1,3}(?:\s|$)', qty_block)
        price_val = job.get("price") or 0
        for n in all_nums:
            parsed = int(n)
            if parsed != price_val and parsed <= 99:
                job["quantity"] = parsed
                break
    
    return job


def classify(block, expected):
    """Check if parser output matches expected"""
    r = simulate_extract(block)
    issues = []
    
    # Name
    exp_name = expected.get("customer_name")
    got_name = r.get("customer_name")
    if exp_name and (not got_name or got_name != exp_name):
        # Allow partial match for long names
        if exp_name not in (got_name or ""):
            issues.append(f"name: expected='{exp_name}' got='{got_name}'")
        elif got_name and len(got_name) < len(exp_name):
            issues.append(f"name_truncated: got='{got_name}' full='{exp_name}'")
    
    # Phone
    exp_phone = expected.get("phone")
    got_phone = r.get("phone")
    if exp_phone == -1:  # explicit no-phone expected
        if got_phone:
            issues.append(f"phone: expected=None got={got_phone}")
    elif exp_phone and got_phone != exp_phone:
        # Allow leading 0 differences for +66
        if got_phone and (got_phone[-9:] == exp_phone[-9:] or got_phone == '0' + exp_phone):
            pass
        else:
            issues.append(f"phone: expected={exp_phone} got={got_phone}")
    
    # Price
    exp_price = expected.get("total_price", 0)
    got_price = r.get("price") or 0
    if exp_price and abs(got_price - exp_price) > 1:
        issues.append(f"price: expected={exp_price} got={got_price}")
    
    # Quantity
    exp_qty = expected.get("total_qty", 0)
    got_qty = r.get("quantity") or -1
    if exp_qty and got_qty != exp_qty:
        issues.append(f"qty: expected={exp_qty} got={got_qty}")
    
    # Location
    loc_present = bool(r.get("location_raw"))
    if expected.get("has_location", False) and not loc_present:
        issues.append("location: missing")
    
    # Wheel sizes
    exp_wheels = expected.get("wheel_expected", [])
    if exp_wheels:
        got_wheels = r.get("wheel_sizes") or []
        if not got_wheels:
            issues.append("wheels: none found")
        else:
            for i, ew in enumerate(exp_wheels):
                if i < len(got_wheels):
                    gw = got_wheels[i]
                    if gw.get("width") != ew["width"] or gw.get("profile") != ew["profile"]:
                        issues.append(f"wheel[{i}]: expected={ew['width']}/{ew['profile']} got={gw['width']}/{gw['profile']}")
                else:
                    issues.append(f"wheel[{i}]: missing (expected {ew['width']}/{ew['profile']})")
    
    severity = "pass" if not issues else ("major" if any(w in str(issues) for w in["missing","qty","price"]) else "minor")
    return {"result": r, "issues": issues, "severity": severity}


# ─── MAIN GENERATOR ───────────────────────────────────────

def generate_tests():
    """Generate 50,000 real-world test patterns"""
    tests = []
    test_id = 0
    random.seed(42)
    
    # Phase 1: Simple blocks (standard format) — 10,000
    simple_pool = list(itertools.product(NAMES[:10], PHONES[:10], LOCATIONS[:10], WHEEL_VARIANTS[:10]))
    for name, phone, loc, (w, profile, qty, price) in simple_pool:
        test_id += 1
        block, exp = gen_simple_block(name, phone, loc, w, qty, price)
        tests.append(TestCase(id=test_id, raw_text=block, expected=exp,
                              category="simple", desc=f"{w}/{qty} {name}"))
    # Actually 10*10*10*10=10000. Fill rest with random
    for _ in range(10000 - len(tests)):
        test_id += 1
        name, phone, loc, (w, profile, qty, price) = (
            random.choice(NAMES), random.choice(PHONES), random.choice(LOCATIONS),
            random.choice(WHEEL_VARIANTS)
        )
        block, exp = gen_simple_block(name, phone, loc, w, qty, price)
        tests.append(TestCase(id=test_id, raw_text=block, expected=exp,
                              category="simple", desc=f"{w}/{qty} {name}"))
    
    # Phase 2: Multi-wheel blocks (like order #7) — 5,000
    for _ in range(5000):
        test_id += 1
        n_wheels = random.randint(2, 4)
        wheels = random.sample(WHEEL_VARIANTS, min(n_wheels, len(WHEEL_VARIANTS)))
        wheels = [(w, qty, price) for w, profile, qty, price in wheels]
        name, phone, loc = random.choice(NAMES), random.choice(PHONES), random.choice(LOCATIONS)
        block, exp = gen_multi_wheel_block(name, phone, loc, wheels)
        tests.append(TestCase(id=test_id, raw_text=block, expected=exp,
                              category="multi", desc=f"{n_wheels} sizes"))
    
    # Phase 3: Format variants (space/no-space/unit variants) — 10,000
    for _ in range(10000):
        test_id += 1
        name, phone, loc = random.choice(NAMES), random.choice(PHONES), random.choice(LOCATIONS)
        w, profile, qty, price = random.choice(WHEEL_VARIANTS)
        
        fmt = random.choice(["standard", "nospace", "alt_unit", "no_ราคา", "no_unit_word", "comma_price"])
        
        if fmt == "standard":
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง {price:,}บาท\n\nชื่อเฟส: {name}"
        elif fmt == "nospace":
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง{price:,}บาท\n\nชื่อเฟส: {name}"
        elif fmt == "alt_unit":
            unit = random.choice(["ชุด", "ล้อ"])
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}{unit} {price:,}บาท\n\nชื่อเฟส: {name}"
            # Adjust expected qty: "ชุด" means set, not individual wheel count
            if unit == "ชุด":
                qty = qty  # same logic — profile is the count within the set
        elif fmt == "no_ราคา":
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง {price:,}บาท\n\nชื่อเฟส: {name}"
        elif fmt == "no_unit_word":
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty} {price:,}บาท\n\nชื่อเฟส: {name}"
        elif fmt == "comma_price":
            big_price = random.choice([100000, 200000, 500000, 1500000])
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง {big_price:,}บาท\n\nชื่อเฟส: {name}"
            price = big_price
        
        expected = {
            "customer_name": name,
            "phone": re.sub(r'\D', '', phone),
            "wheel_expected": [{"width": w, "profile": qty}],
            "total_qty": qty,
            "total_price": price,
            "has_location": True,
        }
        exp_variant = expected.copy()
        exp_variant["total_price"] = price
        tests.append(TestCase(id=test_id, raw_text=block, expected=exp_variant,
                              category=fmt, desc=f"{w}/{qty} fmt={fmt}"))
    
    # Phase 4: Edge cases — 5,000
    edge_templates = []
    for _ in range(2000):
        edge_templates.append(("phone_dash", lambda: (
            f"พิกัด:{random.choice(LOCATIONS)}\n\n"
            f"โทร:{random.choice(['081-234-5678','092-280-5684','087-078-8186'])}\n\n"
            f"ล้อ:{random.choice(WHEEL_VARIANTS)[0]}/{random.choice(WHEEL_VARIANTS)[1]}วง "
            f"{random.choice(WHEEL_VARIANTS)[3]:,}บาท\n\n"
            f"ชื่อเฟส: {random.choice(NAMES)}",
            {"has_location": True, "total_qty": 4, "total_price": 2000}
        )))
    for _ in range(1000):
        edge_templates.append(("extra_blanks", lambda: (
            f"พิกัด:{random.choice(LOCATIONS)}\n\n\n\n\n"
            f"โทร:{random.choice(PHONES)}\n\n\n\n"
            f"ล้อ:18/4วง 2,000บาท\n\n\n\n"
            f"ชื่อเฟส: {random.choice(NAMES)}",
            {"has_location": True, "total_qty": 4, "total_price": 2000}
        )))
    for _ in range(1000):
        edge_templates.append(("one_line", lambda: (
            f"พิกัด:{random.choice(LOCATIONS)} โทร:{random.choice(PHONES)} "
            f"ล้อ:18/4วง 2,000บาท ชื่อเฟส: {random.choice(NAMES)}",
            {"has_location": True, "total_qty": 4, "total_price": 2000}
        )))
    for _ in range(1000):
        edge_templates.append(("chat_location", lambda: (
            f"พิกัด:โลเคชั่นทางแชท\n\n"
            f"โทร:{random.choice(PHONES)}\n\n"
            f"ล้อ:18/4วง 2,000บาท\n\n"
            f"ชื่อเฟส: {random.choice(NAMES)}",
            {"has_location": True, "total_qty": 4, "total_price": 2000}
        )))
    
    for cat, gen_fn in edge_templates:
        test_id += 1
        block, exp_overrides = gen_fn()
        expected = {
            "customer_name": random.choice(NAMES),
            "phone": re.sub(r'\D', '', re.search(r'0\d{8,9}', block).group()) if re.search(r'0\d{8,9}', block) else "",
            "wheel_expected": [{"width": 18, "profile": 4}],
            "has_location": True,
            "total_qty": 4,
            "total_price": 2000,
            **exp_overrides,
        }
        tests.append(TestCase(id=test_id, raw_text=block, expected=expected,
                              category=cat, desc=f"edge_{cat}"))
    
    # However, the expected values might not match exactly — use approximate checking
    # Let me fill remaining with simple blocks
    remaining = 50000 - len(tests)
    for _ in range(remaining):
        test_id += 1
        name, phone, loc, (w, profile, qty, price) = (
            random.choice(NAMES), random.choice(PHONES), random.choice(LOCATIONS),
            random.choice(WHEEL_VARIANTS)
        )
        # Randomly pick one of several format fns
        fmt_idx = test_id % 6
        if fmt_idx == 0:
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง {price:,}บาท\n\nชื่อเฟส: {name}"
        elif fmt_idx == 1:
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง{price:,}บาท\n\nชื่อเฟส: {name}"
        elif fmt_idx == 2:
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง {price:,}  บาท\n\nชื่อเฟส: {name}"
        elif fmt_idx == 3:
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง {price:,}บ.\n\nชื่อเฟส: {name}"
        elif fmt_idx == 4:
            block = f"พิกัด:{loc}\n\nโทร:{phone}\n\nล้อ:{w}/{qty}วง{price:,}บ.\n\nชื่อเฟส: {name}"
        else:
            # Mixed: no blank lines
            block = f"พิกัด:{loc}\nโทร:{phone}\nล้อ:{w}/{qty}วง {price:,}บาท\nชื่อเฟส: {name}"
        
        expected = {
            "customer_name": name,
            "phone": re.sub(r'\D', '', phone),
            "wheel_expected": [{"width": w, "profile": qty}],
            "total_qty": qty,
            "total_price": price,
            "has_location": True,
        }
        tests.append(TestCase(id=test_id, raw_text=block, expected=expected,
                              category="fill", desc=f"{w}/{qty} {name}"))
    
    return tests


# ─── RUNNER ───────────────────────────────────────────────

def run_tests(tests):
    """Run all 50,000 tests and classify"""
    results = {"pass": 0, "major": 0, "minor": 0}
    bug_log = []
    
    t0 = time.time()
    for i, tc in enumerate(tests):
        cls = classify(tc.raw_text, tc.expected)
        results[cls["severity"]] += 1
        
        if cls["severity"] != "pass":
            bug_log.append({
                "id": tc.id,
                "category": tc.category,
                "desc": tc.desc,
                "issues": cls["issues"],
                "raw": tc.raw_text[:120],
                "got_price": cls["result"].get("price"),
                "got_qty": cls["result"].get("quantity"),
                "got_name": cls["result"].get("customer_name"),
            })
        
        if (i+1) % 10000 == 0:
            elapsed = time.time() - t0
            print(f"  {i+1}/{len(tests)} tests ({elapsed:.1f}s) — "
                  f"pass={results['pass']} major={results['major']} minor={results['minor']}")
    
    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"📊 RUN COMPLETE: {len(tests)} tests in {elapsed:.1f}s ({len(tests)/elapsed:.0f} tests/s)")
    print(f"{'='*60}")
    print(f"  PASS:  {results['pass']:>6} ({results['pass']/len(tests)*100:.1f}%)")
    print(f"  MAJOR: {results['major']:>6} ({results['major']/len(tests)*100:.1f}%)")
    print(f"  MINOR: {results['minor']:>6} ({results['minor']/len(tests)*100:.1f}%)")
    
    return results, bug_log


def analyze_bugs(bug_log):
    """Categorize and summarize bugs"""
    if not bug_log:
        print("\n🎉 NO BUGS FOUND!")
        return
    
    print(f"\n{'='*60}")
    print(f"🔴 BUG REPORT: {len(bug_log)} total issues")
    print(f"{'='*60}")
    
    # Group by category
    from collections import Counter
    cat_counts = Counter(b["category"] for b in bug_log)
    print("\n📂 By category:")
    for cat, count in cat_counts.most_common():
        print(f"  {cat:20s}: {count}")
    
    # Group by issue type
    issue_types = Counter()
    for b in bug_log:
        for iss in b["issues"]:
            issue_types[iss[:30]] += 1
    print("\n🔧 By issue type:")
    for iss, count in issue_types.most_common(20):
        print(f"  {iss:35s}: {count}")
    
    # Show sample bugs
    print("\n📋 Sample bugs (first 20):")
    for b in bug_log[:20]:
        print(f"  ID#{b['id']} [{b['category']}] {b['desc']}")
        for iss in b['issues']:
            print(f"    ⚠ {iss}")
        print(f"    raw: {b['raw'][:80]}")
        print()


# ─── MAIN ─────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"⚙️  Generating 50,000 real-world test patterns...")
    print(f"   Names: {len(NAMES)}, Locations: {len(LOCATIONS)}, Wheels: {len(WHEEL_VARIANTS)}, Phones: {len(PHONES)}")
    
    tests = generate_tests()
    print(f"✅ Generated {len(tests)} tests")
    
    results, bug_log = run_tests(tests)
    analyze_bugs(bug_log)
    
    # Save report
    report = {
        "timestamp": datetime.now().isoformat(),
        "total": len(tests),
        "pass": results["pass"],
        "major": results["major"],
        "minor": results["minor"],
        "bugs_sample": bug_log[:100],
        "bug_summary": {
            "simple_bugs": [b for b in bug_log if b["category"] == "simple"][:10],
            "multi_bugs": [b for b in bug_log if b["category"] == "multi"][:10],
            "edge_bugs": [b for b in bug_log if b["category"].startswith("edge")][:20],
            "fmt_bugs": [b for b in bug_log if b["category"] not in ["simple", "multi"] and not b["category"].startswith("edge")][:20],
        }
    }
    
    out_dir = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(out_dir, "report_50k_real.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"\n📁 Full report saved to parser_tests/report_50k_real.json")
    print(f"\n{'='*60}")
    print(f"🏁 DONE")
    print(f"{'='*60}")