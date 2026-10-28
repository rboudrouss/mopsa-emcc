# Usage: ./generateShareJson.sh [MOPSA_SHARE_DIR]  (default: the Makefile's clone)
node folderToJson.cjs "${1:-../build/mopsa-analyzer/share/mopsa/}" -o public/share.json
