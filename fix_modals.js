const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function addSupportedOrientations(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Find all <Modal ...> and add supportedOrientations if missing
  // Careful not to break multi-line tags.
  // We can look for <Modal and then find the closing bracket >
  let regex = /<Modal\b([^>]*?)>/g;
  content = content.replace(regex, (match, props) => {
    if (props.includes('supportedOrientations')) {
      return match; // already has it
    }
    // Add it right before the closing bracket
    // Account for self-closing <Modal /> (which shouldn't happen, but just in case)
    if (match.endsWith('/>')) {
      return `<Modal${props} supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} />`;
    }
    return `<Modal${props} supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>`;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

walkDir('./app', addSupportedOrientations);
walkDir('./components', addSupportedOrientations);
console.log("Done");
