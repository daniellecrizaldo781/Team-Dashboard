import sys, json, base64, re
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ID = sys.argv[1] if len(sys.argv) > 1 else ''
out = {'kind': 'doc', 'imgData': None, 'pdfData': None,
       'thumb': 'https://drive.google.com/thumbnail?id=' + ID + '&sz=w320',
       'url': 'https://drive.google.com/file/d/' + ID + '/preview'}

UA = {'User-Agent': 'Mozilla/5.0'}

def get(url, params=None, binary=True):
    u = url + ('?' + urlencode(params) if params else '')
    req = Request(u, headers=UA)
    with urlopen(req, timeout=60) as r:
        return r.read() if binary else r.read().decode('utf-8', 'replace')

try:
    # Skip huge files (e.g. 600MB+ scanned PDFs): can't embed, would time out.
    try:
        hreq = Request('https://drive.google.com/uc?export=download&id=' + ID, headers=UA, method='HEAD')
        with urlopen(hreq, timeout=30) as h:
            size = int(h.headers.get('Content-Length', '0') or '0')
    except Exception:
        size = 0
    if size > 15 * 1024 * 1024:
        print(json.dumps(out)); sys.exit(0)

    html = get('https://drive.google.com/uc?export=download&id=' + ID, binary=False)
    cm = re.search(r'name="confirm"[^>]*value="([^"]+)"', html)
    fa = re.search(r'<form[^>]+action="([^"]+)"', html)
    if fa and cm:
        action = fa.group(1)
        if action.startswith('/'):
            action = 'https://drive.google.com' + action
        data = get(action, {'id': ID, 'confirm': cm.group(1)})
    else:
        data = get('https://drive.google.com/uc?export=download&id=' + ID)
except Exception:
    print(json.dumps(out)); sys.exit(0)

head = data[:8]
if head[:4] == b'%PDF':
    if len(data) < 15 * 1024 * 1024:
        out['kind'] = 'pdf'
        out['pdfData'] = 'data:application/pdf;base64,' + base64.b64encode(data).decode()
    else:
        out['kind'] = 'doc'
elif head[:3] == b'\xff\xd8\xff' or head[:8] == b'\x89PNG\r\n' or head[:6] in (b'GIF89a', b'GIF87a') or head[:4] == b'RIFF':
    ext = 'jpeg' if head[:3] == b'\xff\xd8\xff' else 'png' if head[:8] == b'\x89PNG\r\n' else 'gif' if head[:6] in (b'GIF89a', b'GIF87a') else 'webp'
    out['kind'] = 'image'
    out['imgData'] = 'data:image/' + ext + ';base64,' + base64.b64encode(data).decode()
    out['thumbData'] = out['imgData']
else:
    out['kind'] = 'doc'

print(json.dumps(out))
