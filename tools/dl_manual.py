import sys, json, base64, re, io
import requests

ID = sys.argv[1] if len(sys.argv) > 1 else ''
out = {'kind': 'doc', 'imgData': None, 'pdfData': None, 'thumb': 'https://drive.google.com/thumbnail?id=' + ID + '&sz=w320', 'url': 'https://drive.google.com/file/d/' + ID + '/preview'}

def download(ID):
    s = requests.Session()
    r = s.get('https://drive.google.com/uc?export=download&id=' + ID)
    cm = re.search(r'name="confirm"[^>]*value="([^"]+)"', r.text)
    fa = re.search(r'<form[^>]+action="([^"]+)"', r.text)
    if fa and cm:
        url = fa.group(1)
        if url.startswith('/'):
            url = 'https://drive.google.com' + url
        r2 = s.get(url, params={'id': ID, 'confirm': cm.group(1)})
        return r2.content
    return r.content

try:
    # Skip huge files (e.g. 600MB+ scanned PDFs) - they can't be embedded and
    # would time out the pipeline. Fall back to the Drive /preview viewer.
    head = requests.get('https://drive.google.com/uc?export=download&id=' + ID, stream=True, allow_redirects=True)
    size = int(head.headers.get('Content-Length', '0') or '0')
    if size > 15 * 1024 * 1024:
        print(json.dumps(out)); sys.exit(0)
    data = download(ID)
except Exception as e:
    print(json.dumps(out)); sys.exit(0)

n = len(data)
head = data[:8]
if head[:4] == b'%PDF':
    if n < 15 * 1024 * 1024:
        out['kind'] = 'pdf'
        out['pdfData'] = 'data:application/pdf;base64,' + base64.b64encode(data).decode()
    else:
        out['kind'] = 'doc'  # too big to embed; rely on /preview (needs public share)
elif head[:3] == b'\xff\xd8\xff' or head[:8] == b'\x89PNG\r\n' or head[:6] in (b'GIF89a', b'GIF87a') or head[:4] == b'RIFF':
    ext = 'jpeg' if head[:3] == b'\xff\xd8\xff' else 'png' if head[:8] == b'\x89PNG\r\n' else 'gif' if head[:6] in (b'GIF89a', b'GIF87a') else 'webp'
    out['kind'] = 'image'
    out['imgData'] = 'data:image/' + ext + ';base64,' + base64.b64encode(data).decode()
    out['thumbData'] = out['imgData']
else:
    out['kind'] = 'doc'  # html/doc or unknown -> /preview (needs public share)

print(json.dumps(out))
