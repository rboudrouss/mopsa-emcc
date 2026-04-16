const fs = require("fs");
const path = require("path");
const yargs = require("yargs");

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
        const content = fs.readFileSync(itemPath, 'utf8');
        result[item] = content;
      } catch (error) {
        result[item] = 'Unable to read file content (possibly binary file)';
      }
    }
  }

  return result;
}

const argv = yargs
  .usage("Usage: $0 <directory> [-o <output>]")
  .demandCommand(1, "You need to specify a directory")
  .option("o", {
    alias: "output",
    describe: "Output file",
    type: "string",
  })
  .help().argv;

const dirPath = argv._[0];
const jsonResult = folderToJson(dirPath);

if (argv.output) {
  fs.writeFileSync(argv.output, JSON.stringify(jsonResult, null, 2));
  console.log(`JSON saved to ${argv.output}`);
} else {
  console.log(JSON.stringify(jsonResult, null, 2));
}
