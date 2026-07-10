import AVFoundation
import Foundation

@objc(AudioEchoCancellationModule)
class AudioEchoCancellationModule: NSObject {
  
  @objc func activateWithHeadphones(_ hasHeadphones: Bool) {
    let session = AVAudioSession.sharedInstance()
    do {
      if hasHeadphones {
        // Con auriculares: videoRecording es suficiente
        // No hay eco físico que cancelar
        try session.setCategory(
          .playAndRecord,
          mode: .videoRecording,
          options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
        )
        print("[AEC] Modo auriculares: videoRecording")
      } else {
        // Sin auriculares: voiceChat tiene AEC más agresivo
        // Diseñado para cancelar el altavoz del dispositivo
        try session.setCategory(
          .playAndRecord,
          mode: .voiceChat,
          options: [.defaultToSpeaker]
        )
        print("[AEC] Modo sin auriculares: voiceChat (AEC agresivo)")
      }
      try session.setActive(true)
    } catch {
      print("[AEC] Error: \(error)")
    }
  }
  
  // Mantener activate() para compatibilidad
  @objc func activate() {
    activateWithHeadphones(false)
  }
  
  @objc func deactivate() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.defaultToSpeaker, .allowBluetooth]
      )
      try session.setActive(true)
      print("[AEC] Desactivado")
    } catch {
      print("[AEC] Error: \(error)")
    }
  }
  
  @objc func isHeadphonesConnected(_ callback: @escaping ([Any]) -> Void) {
    let session = AVAudioSession.sharedInstance()
    let currentRoute = session.currentRoute
    
    let hasHeadphones = currentRoute.outputs.contains { output in
      let portType = output.portType
      return portType == .headphones ||
             portType == .bluetoothA2DP ||
             portType == .bluetoothHFP ||
             portType == .bluetoothLE ||
             portType == .usbAudio ||
             portType == .headsetMic
    }
    
    print("[AEC] Auriculares conectados: \(hasHeadphones)")
    callback([hasHeadphones])
  }
  
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
