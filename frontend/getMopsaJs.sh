# This script checks if the MopsaJs files are present in the public folder, and if not, builds them.
# The script is meant to be run from the Frontend directory.

# The script can be run with the -f flag to force delete the old files and rebuild them.
# This is useful if the MopsaJs files have been updated and the old files are no longer compatible.
FORCE_DELETE=false
while getopts "f" opt; do
  case $opt in
    f) FORCE_DELETE=true ;;
  esac
done

if [ "$FORCE_DELETE" = true ]; then
  echo "Force delete flag triggered. Removing old files..."
  rm -f ./public/mopsaJs.bc.js
  rm -f ./src/lib/share.json
fi


# Check if the MopsaJs files are present
if [ ! -f "./public/mopsaJs.bc.js" ]; then
  echo "MopsaJs not found, building..."
  cd ..
  if make js; then
    cp ./_build/default/js/mopsaJs.bc.js ./Frontend/public/
    node ./Frontend/folderToJson.cjs ./share/mopsa/ -o ./Frontend/src/lib/share.json
  else
    echo "Failed to build MopsaJs, continuing without it"
  fi
  cd Frontend
fi