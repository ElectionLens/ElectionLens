#!/usr/bin/env python3
"""
Batch OCR extraction for scanned Form 20 PDFs.
Run in background: nohup python3 scripts/ocr-batch-extract.py &
"""

import subprocess
import re
import json
import tempfile
import warnings
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

warnings.filterwarnings('ignore')

FORM20_DIR = Path.home() / "Desktop/GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

# Scanned ACs to process
SCANNED_ACS = [3, 4, 215, 6, 1, 31, 218, 217, 30, 9, 29, 5, 
               38, 39, 40, 41, 42, 151, 152, 153, 154, 155, 156,
               188, 189, 191, 192, 193, 194, 213, 214, 216]


def pdf_to_images(pdf_path, dpi=350, max_pages=None):
    with tempfile.TemporaryDirectory() as tmpdir:
        cmd = ['pdftoppm', '-png', '-r', str(dpi)]
        if max_pages:
            cmd.extend(['-l', str(max_pages)])
        cmd.extend([str(pdf_path), f'{tmpdir}/page'])
        subprocess.run(cmd, check=True, capture_output=True)
        
        images = []
        for img_path in sorted(Path(tmpdir).glob('page-*.png')):
            images.append(Image.open(img_path).copy())
        return images


def preprocess_table(img):
    gray = img.convert('L')
    gray = ImageOps.autocontrast(gray, cutoff=2)
    enhanced = ImageEnhance.Contrast(gray).enhance(2.5)
    sharpened = enhanced.filter(ImageFilter.SHARPEN).filter(ImageFilter.SHARPEN)
    # Adaptive threshold
    width, height = sharpened.size
    pixels = list(sharpened.getdata())
    threshold = sum(pixels) // len(pixels) - 10
    return sharpened.point(lambda x: 255 if x > threshold else 0, '1').convert('L')


def ocr_with_config(img, config=''):
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        img.save(f.name)
        cmd = ['tesseract', f.name, 'stdout', '-l', 'eng'] + config.split()
        result = subprocess.run(cmd, capture_output=True, text=True)
        Path(f.name).unlink()
        return result.stdout


def extract_booth_data(text, existing):
    booths = {}
    for line in text.split('\n'):
        # Clean OCR errors
        cleaned = line.replace('O', '0').replace('o', '0')
        cleaned = cleaned.replace('l', '1').replace('I', '1').replace('|', '1')
        cleaned = cleaned.replace('S', '5').replace('B', '8')
        
        numbers = re.findall(r'\b\d+\b', cleaned)
        if len(numbers) < 4:
            continue
        
        numbers = [int(n) for n in numbers]
        
        # Find booth number (1-700 in first few positions)
        for i in range(min(3, len(numbers))):
            if 1 <= numbers[i] <= 700:
                booth_no = numbers[i]
                if booth_no in existing or booth_no in booths:
                    break
                # Find total (larger number)
                for t in reversed(numbers):
                    if 100 <= t <= 2000:
                        booths[booth_no] = t
                        break
                break
    
    return booths


def process_ac(ac_num, max_pages=None):
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    
    if not pdf_path.exists():
        return 0
    
    with open(results_file) as f:
        data = json.load(f)
    
    existing = set()
    for k in data.get('results', {}).keys():
        m = re.match(r'^(\d+)', k.split('-')[-1])
        if m:
            existing.add(int(m.group(1)))
    
    print(f"{ac_id}: {len(existing)} existing...", end=" ", flush=True)
    
    images = pdf_to_images(pdf_path, dpi=350, max_pages=max_pages)
    all_booths = {}
    
    configs = ['--psm 6', '--psm 4', '--psm 11']
    
    for img in images:
        processed = preprocess_table(img)
        for config in configs:
            text = ocr_with_config(processed, config)
            booths = extract_booth_data(text, existing)
            for booth_no, total in booths.items():
                if booth_no not in all_booths:
                    all_booths[booth_no] = total
    
    if all_booths:
        for booth_no, total in all_booths.items():
            booth_id = f"{ac_id}-{booth_no:03d}"
            data['results'][booth_id] = {'votes': [], 'total': total, 'rejected': 0}
        data['totalBooths'] = len(data['results'])
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    print(f"+{len(all_booths)}")
    return len(all_booths)


def main():
    print("OCR Batch Extraction for Scanned PDFs")
    print("=" * 50)
    
    total = 0
    for ac in SCANNED_ACS:
        try:
            added = process_ac(ac)
            total += added
        except Exception as e:
            print(f"TN-{ac:03d}: Error - {e}")
    
    print()
    print(f"Total added: {total} booths")


if __name__ == "__main__":
    main()
