const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Plugin para iOS: configura AVAudioSession con AEC
const withAudioEchoCancellationIOS = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const appDelegateDir = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
      );
      
      // Crear archivo Swift con la lógica de AEC
      const swiftContent = `
import AVFoundation
import Foundation

@objc public class AudioEchoCancellation: NSObject {
  
  @objc public static func activateForRecording() {
    let session = AVAudioSession.sharedInstance()
    do {
      // PlayAndRecord permite grabar y reproducir simultáneamente
      // .videoRecording activa el AEC de hardware de iOS
      try session.setCategory(
        .playAndRecord,
        mode: .videoRecording,
        options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
      )
      try session.setActive(true)
      print("[AEC] AVAudioSession configurada con AEC para grabación")
    } catch {
      print("[AEC] Error configurando AVAudioSession: \\(error)")
    }
  }
  
  @objc public static func deactivate() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.defaultToSpeaker, .allowBluetooth]
      )
      try session.setActive(true)
      print("[AEC] AVAudioSession restaurada al modo normal")
    } catch {
      print("[AEC] Error restaurando AVAudioSession: \\(error)")
    }
  }
}
`;
      
      const swiftFilePath = path.join(appDelegateDir, 'AudioEchoCancellation.swift');
      fs.writeFileSync(swiftFilePath, swiftContent);
      console.log('[Plugin] AudioEchoCancellation.swift creado');
      
      return config;
    },
  ]);
};

module.exports = withAudioEchoCancellationIOS;
