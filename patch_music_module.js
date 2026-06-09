const fs = require('fs');
const path = 'node_modules/react-native-track-player/android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt';
let code = fs.readFileSync(path, 'utf8');

// Find all occurrences of "@ReactMethod"
const methodRegex = /@ReactMethod[\s\S]*?fun\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*=\s*scope\.launch\s*\{/g;

let modified = code;
let match;

// We will replace '= scope.launch {' with '{ scope.launch {' and then find the matching closing brace and append ' }'
// Actually it's easier to use a state machine to count braces.
let out = "";
let i = 0;
while (i < code.length) {
    let sub = code.substring(i);
    let m = sub.match(/^@ReactMethod[\s\S]*?fun\s+[a-zA-Z0-9_]+\s*\([\s\S]*?\)\s*=\s*scope\.launch\s*\{/);
    if (m) {
        // Find where it ends
        let matchStr = m[0];
        let replacedStr = matchStr.replace(/=\s*scope\.launch\s*\{/, '{ scope.launch {');
        out += replacedStr;
        i += matchStr.length;
        
        let braceCount = 1; // We just processed the opening brace of scope.launch {
        while (i < code.length && braceCount > 0) {
            if (code[i] === '{') braceCount++;
            else if (code[i] === '}') braceCount--;
            out += code[i];
            i++;
        }
        // now add the closing brace for the function
        out += " }";
    } else {
        out += code[i];
        i++;
    }
}

fs.writeFileSync(path, out, 'utf8');
console.log("Patched MusicModule.kt");
