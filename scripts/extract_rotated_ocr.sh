#!/bin/bash
# Extract booth data from rotated PDF tables

MISSING_ACS="027 030 031 033 034 049 108 109 147 148"
PDF_DIR=~/Desktop/TNLA_2021_PDFs
CACHE_DIR=/Users/p0s097d/ElectionLens/scripts/ocr_rotated

mkdir -p $CACHE_DIR

for ac in $MISSING_ACS; do
    pdf="$PDF_DIR/AC${ac}.pdf"
    out_dir="$CACHE_DIR/TN-$ac"
    
    if [ ! -f "$pdf" ]; then
        echo "⚠ AC$ac: PDF not found"
        continue
    fi
    
    mkdir -p "$out_dir"
    echo "Processing AC$ac..."
    
    # Get page count
    pages=$(pdfinfo "$pdf" 2>/dev/null | grep "Pages:" | awk '{print $2}')
    [ -z "$pages" ] && pages=20
    
    for p in $(seq 1 $pages); do
        png="$out_dir/page_${p}.png"
        rot_png="$out_dir/page_${p}_rot.png"
        txt="$out_dir/page_${p}_rot.txt"
        
        # Skip if already done
        [ -f "$txt" ] && continue
        
        # Convert to PNG
        if [ ! -f "$png" ]; then
            pdftoppm -png -f $p -l $p -r 300 "$pdf" "$out_dir/tmp"
            mv "$out_dir/tmp-"*.png "$png" 2>/dev/null
        fi
        
        if [ -f "$png" ]; then
            # Rotate 90° clockwise using sips (macOS)
            if [ ! -f "$rot_png" ]; then
                sips -r 90 "$png" --out "$rot_png" >/dev/null 2>&1
            fi
            
            # OCR the rotated image
            if [ -f "$rot_png" ]; then
                tesseract "$rot_png" "${txt%.txt}" --psm 4 2>/dev/null
            fi
        fi
        
        printf "\r  Page $p/$pages"
    done
    echo ""
done

echo "=== Rotated OCR Complete ==="
