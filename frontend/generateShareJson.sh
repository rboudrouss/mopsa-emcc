# Usage: ./generateShareJson.sh [MOPSA_SHARE_DIR]  (default: the current opam switch's)
node folderToJson.cjs "${1:-$(opam var share)/mopsa/}" -o public/share.json
