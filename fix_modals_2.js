const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function fixFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // First, undo the bad replacement
  const badStr = "= supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>";
  
  if (content.includes(badStr)) {
    // Replace badStr with =>
    content = content.split(badStr).join("=>");
    
    // Now, we need to carefully add supportedOrientations to any <Modal that doesn't have it.
    // Let's do this by splitting the file by "<Modal".
    let parts = content.split("<Modal");
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].includes("supportedOrientations")) continue;
      
      // Find the closing bracket of the Modal tag.
      // We must ignore any '>' that comes immediately after an arrow function '=>'.
      // But actually, arrow functions could be anywhere.
      // A safer way: find the first '>' that is NOT preceded by '=' or '-'
      // This is a heuristic, but usually works for React Native props.
      
      let bracketIndex = -1;
      let depth = 0;
      for(let j = 0; j < parts[i].length; j++) {
        if (parts[i][j] === '{') depth++;
        if (parts[i][j] === '}') depth--;
        if (parts[i][j] === '>' && depth === 0) {
          bracketIndex = j;
          break;
        }
      }
      
      if (bracketIndex !== -1) {
        let before = parts[i].substring(0, bracketIndex);
        let after = parts[i].substring(bracketIndex);
        if (before.endsWith('/')) {
           parts[i] = before.substring(0, before.length-1) + " supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} /" + after;
        } else {
           parts[i] = before + " supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}" + after;
        }
      }
    }
    content = parts.join("<Modal");
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
  }
}

walkDir('./app', fixFile);
walkDir('./components', fixFile);
console.log("Done");
