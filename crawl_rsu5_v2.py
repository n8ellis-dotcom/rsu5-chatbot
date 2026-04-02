import os, re, sys, time, json, hashlib, requests
from pathlib import Path
from urllib.parse import urljoin, urlparse

BASE_URL     = "https://www.rsu5.org"
OUTPUT_DIR   = Path(os.path.expanduser("~/rsu5-chatbot/rsu5-docs/docs"))
SEEN_FILE    = Path(os.path.expanduser("~/rsu5-chatbot/rsu5_crawl_v2_seen.json"))
HASH_FILE    = Path(os.path.expanduser("~/rsu5-chatbot/rsu5_crawl_v2_hashes.json"))
CORRUPT_LOG  = Path(os.path.expanduser("~/rsu5-chatbot/logs/crawl_skipped_corrupt.log"))
CRAWL_DELAY  = 3
MAX_FILE_SIZE = 500_000
MIN_CONTENT_LEN = 100

# All allowed domains — main site + all 6 school subdomains
ALLOWED_DOMAINS = {
    'www.rsu5.org', 'rsu5.org',
    'fhs.rsu5.org',   # Freeport High School
    'fms.rsu5.org',   # Freeport Middle School
    'dcs.rsu5.org',   # Durham Community School
    'mls.rsu5.org',   # Mast Landing School
    'mss.rsu5.org',   # Morse Street School
    'pes.rsu5.org',   # Pownal Elementary School
}

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
CORRUPT_LOG.parent.mkdir(parents=True, exist_ok=True)
seen   = json.loads(SEEN_FILE.read_text())  if SEEN_FILE.exists()  else {}
hashes = json.loads(HASH_FILE.read_text())  if HASH_FILE.exists()  else {}

session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; RSU5CommunityBot/2.0)"})

SEED_URLS = [
    # Main site
    f"{BASE_URL}/", f"{BASE_URL}/about", f"{BASE_URL}/budget",
    f"{BASE_URL}/calendar", f"{BASE_URL}/athletics", f"{BASE_URL}/curriculum",
    f"{BASE_URL}/board-of-directors-and-policies",
    f"{BASE_URL}/board-of-directors-and-policies/board-agendas-and-minutes",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies",
    f"{BASE_URL}/board-of-directors-and-policies/board-members",
    f"{BASE_URL}/school-nutrition", f"{BASE_URL}/our-towns", f"{BASE_URL}/home",

    # Budget pages
    f"{BASE_URL}/budget/fy27", f"{BASE_URL}/budget/fy26",
    f"{BASE_URL}/budget/fy25", f"{BASE_URL}/budget/fy24",
    f"{BASE_URL}/budget/fy23", f"{BASE_URL}/budget/fy22",
    f"{BASE_URL}/budget/fy21", f"{BASE_URL}/budget/fy20",
    f"{BASE_URL}/budget/financial-statements",

    # District info
    f"{BASE_URL}/district-information", f"{BASE_URL}/special-education",
    f"{BASE_URL}/technology", f"{BASE_URL}/transportation",
    f"{BASE_URL}/superintendent", f"{BASE_URL}/employment-opportunities",
    f"{BASE_URL}/employment", f"{BASE_URL}/district-wide-staff-directory",
    f"{BASE_URL}/district-news",

    # Policies and handbooks
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-a-foundations-and-basic-commitments",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-b-school-board-operations",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-c-general-school-administration",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-d-fiscal-management",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-e-support-services",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-f-facilities-development",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-g-personnel",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-h-negotiations",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-i-instructional-program",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-j-students",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-k-school-community-relations",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies/section-l-education-agency-relations",
    f"{BASE_URL}/student-handbook", f"{BASE_URL}/family-handbook",
    f"{BASE_URL}/parent-handbook", f"{BASE_URL}/student-family-handbook",

    # School pages — main site
    f"{BASE_URL}/freeport-high-school", f"{BASE_URL}/freeport-middle-school",
    f"{BASE_URL}/mast-landing-school", f"{BASE_URL}/morse-street-school",
    f"{BASE_URL}/durham-community-school", f"{BASE_URL}/pownal-elementary-school",

    # School subdomains — full coverage
    "https://fhs.rsu5.org/", "https://fhs.rsu5.org/about",
    "https://fhs.rsu5.org/staff-directory", "https://fhs.rsu5.org/academics",
    "https://fhs.rsu5.org/student-handbook", "https://fhs.rsu5.org/activities",
    "https://fhs.rsu5.org/athletics", "https://fhs.rsu5.org/counseling",
    "https://fhs.rsu5.org/health", "https://fhs.rsu5.org/calendar",
    "https://fhs.rsu5.org/bell-schedule", "https://fhs.rsu5.org/schedule",
    "https://fhs.rsu5.org/course-catalog", "https://fhs.rsu5.org/curriculum",
    "https://fhs.rsu5.org/news",

    "https://fms.rsu5.org/", "https://fms.rsu5.org/about",
    "https://fms.rsu5.org/staff-directory", "https://fms.rsu5.org/academics",
    "https://fms.rsu5.org/student-handbook", "https://fms.rsu5.org/activities",
    "https://fms.rsu5.org/health", "https://fms.rsu5.org/calendar",
    "https://fms.rsu5.org/bell-schedule", "https://fms.rsu5.org/schedule",
    "https://fms.rsu5.org/news",

    "https://dcs.rsu5.org/", "https://dcs.rsu5.org/about",
    "https://dcs.rsu5.org/staff-directory", "https://dcs.rsu5.org/activities",
    "https://dcs.rsu5.org/student-handbook", "https://dcs.rsu5.org/health",
    "https://dcs.rsu5.org/calendar", "https://dcs.rsu5.org/news",

    "https://mls.rsu5.org/", "https://mls.rsu5.org/about",
    "https://mls.rsu5.org/staff-directory", "https://mls.rsu5.org/activities",
    "https://mls.rsu5.org/student-handbook", "https://mls.rsu5.org/health",
    "https://mls.rsu5.org/calendar", "https://mls.rsu5.org/news",

    "https://mss.rsu5.org/", "https://mss.rsu5.org/about",
    "https://mss.rsu5.org/staff-directory", "https://mss.rsu5.org/activities",
    "https://mss.rsu5.org/student-handbook", "https://mss.rsu5.org/health",
    "https://mss.rsu5.org/calendar", "https://mss.rsu5.org/news",

    "https://pes.rsu5.org/", "https://pes.rsu5.org/about",
    "https://pes.rsu5.org/staff-directory", "https://pes.rsu5.org/activities",
    "https://pes.rsu5.org/student-handbook", "https://pes.rsu5.org/health",
    "https://pes.rsu5.org/calendar", "https://pes.rsu5.org/news",

    # Finalsite page IDs — aggressive range
    *[f"{BASE_URL}/fs/pages/{i}" for i in range(1, 51)],
]

NEWS_PAGINATE_PATTERNS = [
    f"{BASE_URL}/board-of-directors-and-policies/board-agendas-and-minutes?page={{}}",
    f"{BASE_URL}/district-news?page={{}}",
    f"{BASE_URL}/employment-opportunities?page={{}}",
    f"{BASE_URL}/board-of-directors-and-policies/board-policies?page={{}}",
]
NEWS_PAGINATE_MAX = 50

BLOCKED_PATHS = [
    '/production/', '/staff-profile', '/privacy-policy',
    '/accessibility-statement', '/mobile-app-support', '/post-detail',
    '/demo-elements', '/home-clone', '/login', '/logout', '/sign-in',
    '/user/', '/account/', '/admin/',
]

def is_corrupt_pdf_text(text):
    """Detect pdfminer CID encoding garbage — reject if >5% of chars are in (cid:XX) patterns."""
    cid_matches = len(re.findall(r'\(cid:\d+\)', text))
    total_chars = len(text)
    if total_chars == 0:
        return True
    ratio = (cid_matches * 8) / total_chars  # each (cid:XX) is ~8 chars
    return ratio > 0.05

def log_corrupt(url, reason):
    with open(CORRUPT_LOG, 'a') as f:
        f.write(f"{url}\t{reason}\n")
    print(f"  CORRUPT ({reason}) — logged to {CORRUPT_LOG.name}")

def clean_text(text):
    text = text.replace('\x00', '')
    text = re.sub(r'\r\n', '\n', text)
    text = re.sub(r'\r', '\n', text)
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    return text.strip()

def content_hash(text):
    return hashlib.md5(text.encode('utf-8', errors='ignore')).hexdigest()

def is_duplicate(text, url):
    h = content_hash(text)
    if h in hashes:
        print(f"  SKIP duplicate of {hashes[h]}")
        return True
    hashes[h] = url
    return False

def url_to_filename(url):
    parsed = urlparse(url)
    # Include subdomain in filename to avoid collisions
    netloc = parsed.netloc.replace('www.rsu5.org', 'rsu5').replace('.rsu5.org', '_rsu5')
    path = parsed.path.strip('/')
    if not path:
        return netloc or 'home'
    path = re.sub(r'[^\w\-/]', '_', path).replace('/', '_')
    return f"{netloc}_{path}"[:120]

def split_and_save(filename_base, source_url, text):
    text = clean_text(text)
    if len(text) < MIN_CONTENT_LEN:
        print(f"  SKIP too short ({len(text)} chars)")
        return 0
    if is_duplicate(text, source_url):
        return 0
    header = f"SOURCE: {source_url}\n\n"
    full = header + text
    if len(full.encode('utf-8')) <= MAX_FILE_SIZE:
        outpath = OUTPUT_DIR / f"{filename_base}.txt"
        outpath.write_text(full, encoding='utf-8')
        print(f"  Saved: {outpath.name} ({len(text):,} chars)")
        return 1
    chunk_size = MAX_FILE_SIZE - len(header.encode('utf-8'))
    encoded = text.encode('utf-8')
    parts = [encoded[i:i+chunk_size].decode('utf-8', errors='ignore')
             for i in range(0, len(encoded), chunk_size)]
    for idx, part in enumerate(parts, 1):
        suffix = f"_part{idx}" if len(parts) > 1 else ""
        outpath = OUTPUT_DIR / f"{filename_base}{suffix}.txt"
        outpath.write_text(header + part, encoding='utf-8')
        print(f"  Saved: {outpath.name} (part {idx}/{len(parts)})")
    return len(parts)

def extract_pdf(url):
    try:
        r = session.get(url, timeout=30, stream=True)
        r.raise_for_status()
        content = r.content
        # Try pdfminer first
        try:
            from pdfminer.high_level import extract_text_to_fp
            from pdfminer.layout import LAParams
            from io import BytesIO, StringIO
            output = StringIO()
            extract_text_to_fp(BytesIO(content), output, laparams=LAParams(), output_type='text', codec='utf-8')
            text = output.getvalue().strip()
            if len(text) > MIN_CONTENT_LEN:
                if is_corrupt_pdf_text(text):
                    log_corrupt(url, "cid-encoding")
                    # Fall through to OCR
                else:
                    return text
        except Exception as e:
            print(f"  pdfminer failed: {e}")
        # OCR fallback for scanned PDFs
        try:
            import pytesseract
            from pdf2image import convert_from_bytes
            pages = convert_from_bytes(content, dpi=150)
            text = '\n\n'.join(pytesseract.image_to_string(p) for p in pages)
            if len(text) > MIN_CONTENT_LEN:
                if is_corrupt_pdf_text(text):
                    log_corrupt(url, "ocr-garbage")
                    return None
                print(f"  OCR fallback used")
                return text
        except Exception as e:
            print(f"  OCR failed: {e}")
        log_corrupt(url, "all-extractors-failed")
        return None
    except Exception as e:
        print(f"  PDF error: {e}")
        return None

def extract_html(url, html):
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        for tag in soup(['script', 'style', 'nav', 'footer', 'header',
                         'noscript', 'meta', 'link', 'aside']):
            tag.decompose()
        return clean_text(soup.get_text(separator='\n'))
    except Exception as e:
        print(f"  HTML error: {e}")
        return None

def get_links(html, base_url):
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        links = set()
        for a in soup.find_all('a', href=True):
            href = urljoin(base_url, a['href'])
            parsed = urlparse(href)
            if parsed.netloc in ALLOWED_DOMAINS:
                if not any(parsed.path.startswith(b) for b in BLOCKED_PATHS):
                    # Normalize URL — preserve subdomain
                    if parsed.netloc in ('rsu5.org', 'www.rsu5.org'):
                        clean = f"https://www.rsu5.org{parsed.path}"
                    else:
                        clean = f"https://{parsed.netloc}{parsed.path}"
                    if parsed.query and 'page=' in parsed.query:
                        clean += f"?{parsed.query}"
                    links.add(clean)
        return links
    except Exception as e:
        print(f"  Links error: {e}")
        return set()

def crawl_url(url):
    if url in seen:
        return set()
    seen[url] = True
    print(f"\nCrawling: {url}")
    time.sleep(CRAWL_DELAY)
    try:
        r = session.get(url, timeout=30)
        r.raise_for_status()
        ct = r.headers.get('content-type', '').lower()
        if 'pdf' in ct or url.lower().endswith('.pdf'):
            text = extract_pdf(url)
            if text:
                split_and_save(url_to_filename(url), url, text)
            return set()
        if 'html' in ct:
            html = r.text
            text = extract_html(url, html)
            if text and len(text) >= MIN_CONTENT_LEN:
                split_and_save(url_to_filename(url), url, text)
            return get_links(html, url)
        print(f"  SKIP ({ct})")
        return set()
    except requests.exceptions.HTTPError as e:
        print(f"  HTTP error: {e}")
        return set()
    except Exception as e:
        print(f"  Error: {e}")
        return set()

def save_state():
    SEEN_FILE.write_text(json.dumps(seen, indent=2))
    HASH_FILE.write_text(json.dumps(hashes, indent=2))

print(f"RSU5 Crawl v2 — output: {OUTPUT_DIR}")
print(f"Already seen: {len(seen)} URLs | Known hashes: {len(hashes)}")

queue = list(SEED_URLS)
for pattern in NEWS_PAGINATE_PATTERNS:
    for page in range(1, NEWS_PAGINATE_MAX + 1):
        queue.append(pattern.format(page))
queue = [u for u in queue if u not in seen]
print(f"Starting queue: {len(queue)} URLs")

visited = 0
while queue:
    url = queue.pop(0)
    if url in seen:
        continue
    new_links = crawl_url(url)
    visited += 1
    for link in new_links:
        if link not in seen and link not in queue:
            queue.append(link)
    if visited % 20 == 0:
        save_state()
        total = len(list(OUTPUT_DIR.glob('*.txt')))
        print(f"\n--- {visited} visited | {len(queue)} queued | {total} files saved ---\n")

save_state()
total_files = len(list(OUTPUT_DIR.glob('*.txt')))
print(f"\nDONE. Visited: {visited} | Files: {total_files} | Output: {OUTPUT_DIR}")
print(f"Corrupt/skipped log: {CORRUPT_LOG}")
