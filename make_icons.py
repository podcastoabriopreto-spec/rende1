from PIL import Image, ImageDraw

INK = (14, 42, 71)
YEL = (255, 198, 26)

def draw(size):
    S = 4  # supersampling
    N = size * S
    img = Image.new("RGB", (N, N), INK)
    d = ImageDraw.Draw(img)
    cx, cy = N / 2, N * 0.53
    r = N * 0.20                      # raio do bojo da gota
    top = (cx, N * 0.19)              # ponta da gota
    # bojo
    d.ellipse([cx - r, cy - r + r * 0.25, cx + r, cy + r + r * 0.25], fill=YEL)
    # ponta (triângulo tangente ao círculo)
    d.polygon([top, (cx - r * 0.97, cy + r * 0.05), (cx + r * 0.97, cy + r * 0.05)], fill=YEL)
    # brilho interno
    hr = r * 0.34
    d.ellipse([cx - r * 0.55 - hr, cy + r * 0.05 - hr, cx - r * 0.55 + hr, cy + r * 0.05 + hr], fill=(255, 226, 120))
    # medidor (arco) na base da gota
    bx0, by0, bx1, by1 = cx - r * 0.62, cy + r * 0.10, cx + r * 0.62, cy + r * 1.34
    d.arc([bx0, by0, bx1, by1], start=200, end=340, fill=INK, width=int(N * 0.028))
    d.line([cx, cy + r * 0.72, cx + r * 0.32, cy + r * 0.42], fill=INK, width=int(N * 0.028))
    return img.resize((size, size), Image.LANCZOS)

for name, size in [("icon-512.png", 512), ("icon-192.png", 192),
                   ("icon-maskable-512.png", 512), ("apple-touch-icon.png", 180),
                   ("favicon-32.png", 32)]:
    draw(size).save(f"icons/{name}")
print("ok")
