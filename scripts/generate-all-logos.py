import os
import base64
from io import BytesIO
from PIL import Image, ImageDraw

SOURCE_IMAGE_PATH = "/Users/samuelleavitt/.gemini/antigravity/brain/8076e0bb-94b9-42f1-978d-73c248a9abb7/.user_uploaded/media_1793404623236_cac1de05.png"
DARK_BG = (11, 14, 23, 255) # #0B0E17

def create_transparent_logo(cropped_logo, size, margin_ratio=0.06):
    w, h = size
    target_w = int(w * (1 - 2 * margin_ratio))
    target_h = int(h * (1 - 2 * margin_ratio))
    
    lw, lh = cropped_logo.size
    ratio = min(target_w / lw, target_h / lh)
    nw, nh = max(1, int(lw * ratio)), max(1, int(lh * ratio))
    
    resized = cropped_logo.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    paste_x = (w - nw) // 2
    paste_y = (h - nh) // 2
    canvas.paste(resized, (paste_x, paste_y), resized)
    return canvas

def create_solid_bg_icon(cropped_logo, size, bg_color=DARK_BG, logo_scale=0.68, corner_radius=0):
    w, h = size
    scale_factor = 4 if corner_radius > 0 else 1
    canvas_w, canvas_h = w * scale_factor, h * scale_factor
    
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    
    if corner_radius > 0:
        cr = int(corner_radius * scale_factor)
        draw.rounded_rectangle([(0, 0), (canvas_w - 1, canvas_h - 1)], radius=cr, fill=bg_color)
    else:
        draw.rectangle([(0, 0), (canvas_w, canvas_h)], fill=bg_color)
        
    target_size = int(min(canvas_w, canvas_h) * logo_scale)
    lw, lh = cropped_logo.size
    ratio = min(target_size / lw, target_size / lh)
    nw, nh = max(1, int(lw * ratio)), max(1, int(lh * ratio))
    
    resized = cropped_logo.resize((nw, nh), Image.Resampling.LANCZOS)
    paste_x = (canvas_w - nw) // 2
    paste_y = (canvas_h - nh) // 2
    canvas.paste(resized, (paste_x, paste_y), resized)
    
    if scale_factor > 1:
        canvas = canvas.resize((w, h), Image.Resampling.LANCZOS)
        
    return canvas

def create_round_icon(cropped_logo, size, bg_color=DARK_BG, logo_scale=0.66):
    w, h = size
    scale_factor = 4
    cw, ch = w * scale_factor, h * scale_factor
    
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse([(0, 0), (cw - 1, ch - 1)], fill=bg_color)
    
    target_size = int(min(cw, ch) * logo_scale)
    lw, lh = cropped_logo.size
    ratio = min(target_size / lw, target_size / lh)
    nw, nh = max(1, int(lw * ratio)), max(1, int(lh * ratio))
    
    resized = cropped_logo.resize((nw, nh), Image.Resampling.LANCZOS)
    paste_x = (cw - nw) // 2
    paste_y = (cw - nh) // 2
    canvas.paste(resized, (paste_x, paste_y), resized)
    
    return canvas.resize((w, h), Image.Resampling.LANCZOS)

def create_splash(cropped_logo, size, bg_color=DARK_BG):
    w, h = size
    canvas = Image.new("RGBA", (w, h), bg_color)
    
    min_dim = min(w, h)
    # Logo takes about 35% of min dimension
    target_size = int(min_dim * 0.35)
    lw, lh = cropped_logo.size
    ratio = min(target_size / lw, target_size / lh)
    nw, nh = max(1, int(lw * ratio)), max(1, int(lh * ratio))
    
    resized = cropped_logo.resize((nw, nh), Image.Resampling.LANCZOS)
    paste_x = (w - nw) // 2
    paste_y = (h - nh) // 2
    canvas.paste(resized, (paste_x, paste_y), resized)
    return canvas

def main():
    print(f"Loading source logo from {SOURCE_IMAGE_PATH}...")
    src = Image.open(SOURCE_IMAGE_PATH).convert("RGBA")
    
    bbox = src.getchannel("A").getbbox()
    print(f"Cropping transparent padding. Bbox: {bbox}")
    cropped = src.crop(bbox)
    
    # 1. Web & PWA Logos
    print("Generating Web & PWA assets...")
    logo_512 = create_transparent_logo(cropped, (512, 512), margin_ratio=0.05)
    logo_512.save("public/logo.png", format="PNG")
    logo_512.save("public/motif-mark.png", format="PNG")
    
    # Save JPG version
    logo_jpg = Image.new("RGB", (512, 512), (DARK_BG[0], DARK_BG[1], DARK_BG[2]))
    logo_jpg.paste(logo_512, (0, 0), logo_512)
    logo_jpg.save("public/logo.jpg", format="JPEG", quality=95)
    
    # Save SVG wrapping base64 PNG
    buffered = BytesIO()
    logo_512.save(buffered, format="PNG")
    img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <image href="data:image/png;base64,{img_b64}" x="0" y="0" width="512" height="512" />
</svg>'''
    with open("public/logo.svg", "w") as f:
        f.write(svg_content)
    with open("public/motif-mark.svg", "w") as f:
        f.write(svg_content)
        
    # App icon with dark background (512x512)
    icon_512 = create_solid_bg_icon(cropped, (512, 512), bg_color=DARK_BG, logo_scale=0.72)
    icon_512.save("public/icon.png", format="PNG")
    icon_512.save("src/app/icon.png", format="PNG")
    
    # Icon maskable (512x512 with safe padding ~60% for Android/PWA maskable spec)
    icon_maskable = create_solid_bg_icon(cropped, (512, 512), bg_color=DARK_BG, logo_scale=0.60)
    icon_maskable.save("public/icon-maskable.png", format="PNG")
    
    # 192x192 PWA Icon
    icon_192 = create_solid_bg_icon(cropped, (192, 192), bg_color=DARK_BG, logo_scale=0.72)
    icon_192.save("public/icon-192.png", format="PNG")
    
    # Apple Touch Icon (180x180)
    apple_icon = create_solid_bg_icon(cropped, (180, 180), bg_color=DARK_BG, logo_scale=0.70)
    apple_icon_rgb = apple_icon.convert("RGB")
    apple_icon_rgb.save("public/apple-touch-icon.png", format="PNG")
    apple_icon_rgb.save("src/app/apple-icon.png", format="PNG")
    
    # Favicons (32x32, 48x48, multi-size .ico)
    fav_32 = create_transparent_logo(cropped, (32, 32), margin_ratio=0.02)
    fav_32.save("public/favicon.png", format="PNG")
    
    fav_48 = create_transparent_logo(cropped, (48, 48), margin_ratio=0.02)
    fav_48.save("public/favicon-48.png", format="PNG")
    
    # ICO containing 16, 32, 48
    fav_16 = create_transparent_logo(cropped, (16, 16), margin_ratio=0.02)
    fav_16.save("public/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    fav_16.save("src/app/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    
    # 2. Android App Assets
    print("Generating Android mipmap icons and splash screens...")
    android_densities = {
        "mdpi": {"fg": (108, 108), "icon": (48, 48), "radius": 10},
        "hdpi": {"fg": (162, 162), "icon": (72, 72), "radius": 16},
        "xhdpi": {"fg": (216, 216), "icon": (96, 96), "radius": 21},
        "xxhdpi": {"fg": (324, 324), "icon": (144, 144), "radius": 32},
        "xxxhdpi": {"fg": (432, 432), "icon": (192, 192), "radius": 42},
    }
    
    for density, cfg in android_densities.items():
        base_dir = f"android/app/src/main/res/mipmap-{density}"
        if not os.path.exists(base_dir):
            continue
            
        # Foreground: transparent canvas, logo centered at ~65%
        fg = create_transparent_logo(cropped, cfg["fg"], margin_ratio=0.18)
        fg.save(f"{base_dir}/ic_launcher_foreground.png", format="PNG")
        
        # Launcher icon (rounded squircle)
        licon = create_solid_bg_icon(cropped, cfg["icon"], bg_color=DARK_BG, logo_scale=0.72, corner_radius=cfg["radius"])
        licon.save(f"{base_dir}/ic_launcher.png", format="PNG")
        
        # Launcher round icon (circle)
        ricon = create_round_icon(cropped, cfg["icon"], bg_color=DARK_BG, logo_scale=0.68)
        ricon.save(f"{base_dir}/ic_launcher_round.png", format="PNG")
        
    # Android Splash Screens
    splash_targets = [
        ("android/app/src/main/res/drawable/splash.png", (480, 320)),
        ("android/app/src/main/res/drawable-port-mdpi/splash.png", (320, 480)),
        ("android/app/src/main/res/drawable-port-hdpi/splash.png", (480, 800)),
        ("android/app/src/main/res/drawable-port-xhdpi/splash.png", (720, 1280)),
        ("android/app/src/main/res/drawable-port-xxhdpi/splash.png", (960, 1600)),
        ("android/app/src/main/res/drawable-port-xxxhdpi/splash.png", (1280, 1920)),
        ("android/app/src/main/res/drawable-land-mdpi/splash.png", (480, 320)),
        ("android/app/src/main/res/drawable-land-hdpi/splash.png", (800, 480)),
        ("android/app/src/main/res/drawable-land-xhdpi/splash.png", (1280, 720)),
        ("android/app/src/main/res/drawable-land-xxhdpi/splash.png", (1600, 960)),
        ("android/app/src/main/res/drawable-land-xxxhdpi/splash.png", (1920, 1280)),
    ]
    
    for path, size in splash_targets:
        if os.path.exists(os.path.dirname(path)):
            splash_img = create_splash(cropped, size, bg_color=DARK_BG)
            splash_img.save(path, format="PNG")
            
    # 3. Synchronize to android/app/src/main/assets/public if it exists
    android_assets_public = "android/app/src/main/assets/public"
    if os.path.exists(android_assets_public):
        print(f"Syncing web assets to {android_assets_public}...")
        for name in ["logo.png", "logo.jpg", "logo.svg", "icon.png", "icon-maskable.png", "apple-touch-icon.png", "favicon.ico"]:
            src_f = f"public/{name}"
            dst_f = f"{android_assets_public}/{name}"
            if os.path.exists(src_f):
                with open(src_f, "rb") as rf, open(dst_f, "wb") as wf:
                    wf.write(rf.read())

    print("All base image assets generated successfully!")

if __name__ == "__main__":
    main()
