const fs = require("fs");
const path = require("path");

function folderToJson(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Path does not exist: ${folderPath}`);
  }

  const stats = fs.statSync(folderPath);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${folderPath}`);
  }

  const result = {};

  const items = fs.readdirSync(folderPath);

  for (const item of items) {
    const itemPath = path.join(folderPath, item);
    const itemStats = fs.statSync(itemPath);

    if (itemStats.isDirectory()) {
      result[item] = folderToJson(itemPath);
    } else {
      try {
        const content = fs.readFileSync(itemPath, "utf8");
        result[item] = content;
      } catch (error) {
        result[item] = "Unable to read file content (possibly binary file)";
      }
    }
  }

  return result;
}

// Usage: node folderToJson.cjs <directory> [-o <output>]
const args = process.argv.slice(2);
let dirPath = null;
let output = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" || args[i] === "--output") {
    output = args[++i];
  } else if (dirPath === null) {
    dirPath = args[i];
  }
}
if (!dirPath) {
  console.error("Usage: node folderToJson.cjs <directory> [-o <output>]");
  process.exit(1);
}

const jsonResult = folderToJson(dirPath);

if (output) {
  fs.writeFileSync(output, JSON.stringify(jsonResult, null, 2));
  console.log(`JSON saved to ${output}`);
} else {
  console.log(JSON.stringify(jsonResult, null, 2));
}
