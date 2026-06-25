const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

const projectPath = path.join(__dirname, 'ios/ScriptCue.xcodeproj/project.pbxproj');
const myProj = xcode.project(projectPath);

myProj.parse(function (err) {
    if (err) {
        console.error('Error parsing project:', err);
        process.exit(1);
    }

    const mFilePath = 'ScriptCue/AudioEchoCancellationModule.m';
    const swiftFilePath = 'ScriptCue/AudioEchoCancellationModule.swift';
    const target = myProj.getFirstTarget().uuid;

    // Remove if they exist to avoid duplicates
    try {
        myProj.removeSourceFile(mFilePath, null, myProj.getFirstTarget().uuid);
        myProj.removeSourceFile(swiftFilePath, null, myProj.getFirstTarget().uuid);
    } catch(e) {}

    myProj.addSourceFile(mFilePath, null, myProj.getFirstTarget().uuid);
    myProj.addSourceFile(swiftFilePath, null, myProj.getFirstTarget().uuid);

    fs.writeFileSync(projectPath, myProj.writeSync());
    console.log('Successfully added AudioEchoCancellationModule files to Xcode project.');
});
