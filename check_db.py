import subprocess, json, re, os

constants_path = os.path.join(os.path.dirname(os.path.abspath(__file__)) or '.', 'js', 'core', 'constants.js')
with open(constants_path) as f:
    content = f.read()
m = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", content)
if not m:
    print("FAILED")
    exit(1)
anon_key = m.group(1)

result = subprocess.run([
    'curl', '-s', '-w', '\n%{http_code}', '-X', 'GET',
    'https://ybmowexttijibnjsonhu.supabase.co/rest/v1/jobs?select=id,customer_name,phone,price,quantity,status,created_at&order=created_at.desc&limit=10',
    '-H', f'apikey: ***    '-H', f'Authorization: Bearer *** capture_output=True, text=True, timeout=10)

parts = result.stdout.strip().rsplit('\n', 1)
code = parts[-1]
body = parts[0] if len(parts) > 1 else ''
print(f"HTTP {code}")
try:
    data = json.loads(body)
    if isinstance(data, list):
        print(f"Total rows: {len(data)}")
        for r in data:
            print(f"  {r.get('customer_name')} | {r.get('phone')} | ฿{r.get('price')}")
    else:
        print(json.dumps(data, indent=2)[:500])
except Exception as e:
    print(f"Parse: {e}")
    print(body[:500])
