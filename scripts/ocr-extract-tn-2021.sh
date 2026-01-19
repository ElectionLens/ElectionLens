#!/bin/bash
# OCR-based extraction for scanned Form 20 PDFs
# Uses pdftoppm + tesseract
#
# Usage:
#   ./scripts/ocr-extract-tn-2021.sh [ac_number]
#   ./scripts/ocr-extract-tn-2021.sh 27  # Single AC
#   ./scripts/ocr-extract-tn-2021.sh     # All scanned PDFs

FORM20_DIR="$HOME/Desktop/TNLA_2021_PDFs"
OUTPUT_DIR="/Users/p0s097d/ElectionLens/scripts/ocr_output"

# List of scanned PDFs (image-based, no text layer)
SCANNED_ACS=(27 30 31 32 33 34 35 40 43 44 46 47 49 50 108 109 147 148)

mkdir -p "$OUTPUT_DIR"

ocr_pdf() {
    local ac_num=$1
    local ac_padded=$(printf "%03d" $ac_num)
    local pdf_path="$FORM20_DIR/AC${ac_padded}.pdf"
    local output_file="$OUTPUT_DIR/AC${ac_padded}.txt"
    local temp_dir=$(mktemp -d)
    
    echo "Processing AC$ac_padded..."
    
    if [[ ! -f "$pdf_path" ]]; then
        echo "  ERROR: PDF not found: $pdf_path"
        return 1
    fi
    
    # Convert PDF to images
    echo "  Converting PDF to images..."
    pdftoppm -png -r 300 "$pdf_path" "$temp_dir/page"
    
    # OCR each page and combine
    echo "  Running OCR on each page..."
    > "$output_file"  # Clear file
    
    for img in $(ls "$temp_dir"/page-*.png 2>/dev/null | sort -V); do
        tesseract "$img" stdout --psm 6 2>/dev/null >> "$output_file"
        echo "" >> "$output_file"  # Page separator
    done
    
    # Cleanup
    rm -rf "$temp_dir"
    
    local line_count=$(wc -l < "$output_file")
    echo "  Done: $line_count lines extracted to $output_file"
}

# Main
if [[ $# -eq 1 ]]; then
    # Single AC
    ocr_pdf "$1"
else
    # All scanned ACs
    for ac in "${SCANNED_ACS[@]}"; do
        ocr_pdf "$ac"
    done
fi

echo ""
echo "OCR extraction complete. Output in: $OUTPUT_DIR"
