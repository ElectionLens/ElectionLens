#!/bin/bash
# Run Surya extraction on remaining ACs with empty votes
# Usage: ./scripts/run-surya-batch.sh

cd /Users/p0s097d/ElectionLens

# ACs still needing extraction
ACS=(189 218 31 213 38 217 156 216 2 191 151 192 193 42 39 40 41 29 28 19 20 14 16 55 63 69 113 114 115 116 118 119 121 122 125 128 134 136 138 145 150 152 154 155 160 162 163 164 165 166 171 172 178 179 180 188 195 196 204 209 212 214 223 224)

echo "Processing ${#ACS[@]} ACs with Surya..."
echo ""

for ac in "${ACS[@]}"; do
    echo "============================================"
    echo "Processing AC $ac"
    echo "============================================"
    python scripts/surya-page-by-page.py $ac
    
    # Brief pause between ACs
    sleep 2
done

echo ""
echo "All ACs processed!"
echo "Run validation: python scripts/validate_2024_complete.py"
