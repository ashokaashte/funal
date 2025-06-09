#!/usr/bin/env python3
import requests, os, glob
from bs4 import BeautifulSoup
from urllib.parse import urljoin

SITE_ROOT = 'https://brandolk.webflow.io'
visited = set()
link_map = {}

def crawl(url):
    if url in visited or not url.startswith(SITE_ROOT):
        return
    visited.add(url)
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
    except Exception as e:
        print(f"✖ failed to fetch {url}: {e}")
        return
    soup = BeautifulSoup(r.text, 'html.parser')
    # collect all same-site links
    for a in soup.select('a[href^="/"]'):
        text = a.get_text(strip=True)
        href = a['href']
        if text and href:
            link_map[text] = href
    # recurse into each unique href
    for href in {a['href'] for a in soup.select('a[href^="/"]')}:
        crawl(urljoin(SITE_ROOT, href))

def patch_files():
    crawl(SITE_ROOT)
    # find every index.html in this repo
    for path in glob.glob('**/index.html', recursive=True):
        if 'node_modules' in path:
            continue
        full = os.path.abspath(path)
        soup = BeautifulSoup(open(full, encoding='utf8'), 'html.parser')
        # patch <a> tags
        for a in soup.find_all('a'):
            t = a.get_text(strip=True)
            if t in link_map:
                target = link_map[t].lstrip('/')
                rel = os.path.relpath(target, os.path.dirname(path)).replace(os.sep, '/')
                a['href'] = rel or './'
        # patch <button> tags
        for btn in soup.find_all('button'):
            t = btn.get_text(strip=True)
            if t in link_map:
                target = link_map[t].lstrip('/')
                rel = os.path.relpath(target, os.path.dirname(path)).replace(os.sep, '/')
                btn['onclick'] = f"window.location.href='{rel or './'}'"
        open(full, 'w', encoding='utf8').write(str(soup))
        print("Patched:", path)

if __name__ == '__main__':
    patch_files()
