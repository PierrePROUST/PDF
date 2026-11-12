# Génère pdf-test/images.pdf : une page par type d'image PDF, pour vérifier leur affichage.
#   python3 outils/generer-pdf-images.py [sortie]   (nécessite Pillow avec JPEG et JPEG 2000)
# Pages : Flate RGB, JPEG RGB, JPEG CMJN, JPEG gris, JPEG 2000 (décodeur wasm de PDF.js),
# image avec transparence (SMask), grande photo 3000x4000. Le centre de chaque image est jaune
# (250, 200, 0) ; en niveaux de gris, gris 192. Fichier généré par ce script, appartient au dépôt.
import io, sys, zlib
from PIL import Image, ImageDraw
out = sys.argv[1] if len(sys.argv) > 1 else "pdf-test/images.pdf"

def motif(w, h, mode="RGB"):
    im = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(im)
    for y in range(0, h, 8):
        d.line([(0, y), (w, y)], fill=(int(255*y/h), 80, 255-int(255*y/h)), width=8)
    d.ellipse([w*0.2, h*0.2, w*0.8, h*0.8], fill=(250, 200, 0), outline=(0, 0, 0), width=max(2, w//80))
    d.rectangle([w*0.05, h*0.05, w*0.3, h*0.15], fill=(0, 160, 0))
    return im.convert(mode)

def jpeg(im, **kw):
    b = io.BytesIO(); im.save(b, "JPEG", quality=85, **kw); return b.getvalue()

images = []  # (titre, dict, données)
im = motif(400, 300)
images.append(("1. Flate RGB (sans perte)", f"/Width 400 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode", zlib.compress(im.tobytes())))
images.append(("2. JPEG RGB (DCTDecode)", "/Width 400 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode", jpeg(im)))
cmyk = im.convert("CMYK")
images.append(("3. JPEG CMJN (DCTDecode, Adobe)", "/Width 400 /Height 300 /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /DCTDecode /Decode [1 0 1 0 1 0 1 0]", jpeg(cmyk)))
gris = im.convert("L")
images.append(("4. JPEG niveaux de gris", "/Width 400 /Height 300 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode", jpeg(gris)))
b = io.BytesIO(); im.save(b, "JPEG2000"); images.append(("5. JPEG 2000 (JPXDecode, décodeur wasm)", "/Width 400 /Height 300 /BitsPerComponent 8 /Filter /JPXDecode", b.getvalue()))
alpha = Image.new("L", (400, 300), 0); ImageDraw.Draw(alpha).ellipse([20, 20, 380, 280], fill=255)
images.append(("6. Image avec transparence (SMask)", "SMASK", (zlib.compress(im.tobytes()), zlib.compress(alpha.tobytes()))))
grande = motif(3000, 4000)
images.append(("7. Grande photo JPEG 3000x4000", "/Width 3000 /Height 4000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode", jpeg(grande)))

objs = []
def add(o): objs.append(o); return len(objs)
catalog = add(None); pages = add(None)
font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
kids = []
for titre, dico, data in images:
    if dico == "SMASK":
        rgb, a = data
        sm = add(b"<< /Type /XObject /Subtype /Image /Width 400 /Height 300 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length %d >>\nstream\n" % len(a) + a + b"\nendstream")
        img = add(b"<< /Type /XObject /Subtype /Image /Width 400 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask %d 0 R /Length %d >>\nstream\n" % (sm, len(rgb)) + rgb + b"\nendstream")
    else:
        img = add(("<< /Type /XObject /Subtype /Image %s /Length %d >>\nstream\n" % (dico, len(data))).encode() + data + b"\nendstream")
    t = titre.encode("latin-1", "replace")
    # fond hachuré derrière l'image pour voir la transparence
    contenu = b"0.85 0.85 0.85 rg 50 250 495 450 re f 0 0 0 rg BT /F1 18 Tf 50 760 Td (" + t + b") Tj ET q 495 0 0 371 50 300 cm /Im0 Do Q"
    c = add(b"<< /Length %d >>\nstream\n" % len(contenu) + contenu + b"\nendstream")
    kids.append(add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 %d 0 R >> /XObject << /Im0 %d 0 R >> >> /Contents %d 0 R >>" % (pages, font, img, c)))
objs[catalog-1] = b"<< /Type /Catalog /Pages %d 0 R >>" % pages
objs[pages-1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (b" ".join(b"%d 0 R" % k for k in kids), len(kids))
res = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"); offs = []
for i, o in enumerate(objs):
    offs.append(len(res)); res += b"%d 0 obj\n" % (i+1) + o + b"\nendobj\n"
x = len(res); res += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs)+1)
for o in offs: res += b"%010d 00000 n \n" % o
res += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs)+1, catalog, x)
open(out, "wb").write(res); print(out, len(res), "octets")
