import AVFoundation
import ExpoModulesCore
import UIKit

/// Un subtítulo ya cronometrado y partido en líneas (server/subtitleCues.js).
struct SubtitleCue: Record {
  @Field var start: Double = 0
  @Field var end: Double = 0
  @Field var lines: [String] = []
}

/// Estilo B, el mismo que el quemado del servidor: texto blanco seminegrita sobre UNA franja negra
/// al 60 % de opacidad, todo proporcional al vídeo para que se vea igual en 720p que en 4K.
private enum SubtitleStyle {
  static func fontSize(_ size: CGSize) -> CGFloat { min(size.width, size.height) * 0.046 }
  static func marginBottom(_ size: CGSize) -> CGFloat { size.height * 0.09 }
  static func marginSide(_ size: CGSize) -> CGFloat { size.width * 0.06 }
  static let boxOpacity: CGFloat = 0.6
}

enum SubtitleBurnerError: Error, CustomStringConvertible {
  case noVideoTrack
  case exportUnavailable
  case exportFailed(String)

  var description: String {
    switch self {
    case .noVideoTrack: return "El archivo no tiene pista de vídeo"
    case .exportUnavailable: return "No se pudo preparar la exportación"
    case .exportFailed(let reason): return "La exportación falló: \(reason)"
    }
  }
}

public class SubtitleBurnerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SubtitleBurner")

    Events("onProgress")

    /// Extrae el audio a .m4a (para transcribirlo sin subir el vídeo) y devuelve también el
    /// tamaño con el que se ve el vídeo (ya girado), que decide el ancho de línea.
    AsyncFunction("extractAudio") { (input: URL, output: URL, promise: Promise) in
      let asset = AVURLAsset(url: input)
      let display = Self.displaySize(of: asset)
      guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
        promise.reject(Exception(name: "ExtractAudioError", description: SubtitleBurnerError.exportUnavailable.description))
        return
      }
      try? FileManager.default.removeItem(at: output)
      session.outputURL = output
      session.outputFileType = .m4a
      session.exportAsynchronously {
        if session.status == .completed {
          promise.resolve([
            "uri": output.absoluteString,
            "width": Double(display?.width ?? 0),
            "height": Double(display?.height ?? 0),
          ])
        } else {
          promise.reject(Exception(name: "ExtractAudioError", description: session.error?.localizedDescription ?? "Error desconocido"))
        }
      }
    }

    /// Quema los subtítulos y exporta con el codificador de hardware, sin bajar la resolución.
    AsyncFunction("burnSubtitles") { (input: URL, output: URL, cues: [SubtitleCue], promise: Promise) in
      do {
        let session = try Self.makeExportSession(input: input, output: output, cues: cues)
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now(), repeating: 0.3)
        timer.setEventHandler { [weak self] in
          self?.sendEvent("onProgress", ["progress": Double(session.progress)])
        }
        timer.resume()
        session.exportAsynchronously {
          timer.cancel()
          if session.status == .completed {
            promise.resolve(output.absoluteString)
          } else {
            promise.reject(Exception(
              name: "BurnSubtitlesError",
              description: SubtitleBurnerError.exportFailed(session.error?.localizedDescription ?? "estado \(session.status.rawValue)").description
            ))
          }
        }
      } catch {
        promise.reject(Exception(name: "BurnSubtitlesError", description: "\(error)"))
      }
    }
  }

  // MARK: - Vídeo

  /// Tamaño visible: los vídeos de iPhone suelen ir en horizontal con una rotación de 90°.
  static func displaySize(of asset: AVAsset) -> CGSize? {
    guard let track = asset.tracks(withMediaType: .video).first else { return nil }
    let rect = CGRect(origin: .zero, size: track.naturalSize).applying(track.preferredTransform)
    return CGSize(width: abs(rect.width), height: abs(rect.height))
  }

  static func makeExportSession(input: URL, output: URL, cues: [SubtitleCue]) throws -> AVAssetExportSession {
    let asset = AVURLAsset(url: input)
    guard let sourceVideo = asset.tracks(withMediaType: .video).first else { throw SubtitleBurnerError.noVideoTrack }
    let duration = asset.duration
    let fullRange = CMTimeRange(start: .zero, duration: duration)

    // Copia de las pistas en una composición (vídeo + todas las de audio).
    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw SubtitleBurnerError.exportUnavailable
    }
    try videoTrack.insertTimeRange(fullRange, of: sourceVideo, at: .zero)
    for sourceAudio in asset.tracks(withMediaType: .audio) {
      let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
      try audioTrack?.insertTimeRange(fullRange, of: sourceAudio, at: .zero)
    }

    let renderSize = displaySize(of: asset) ?? sourceVideo.naturalSize
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    layerInstruction.setTransform(sourceVideo.preferredTransform, at: .zero)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = fullRange
    instruction.layerInstructions = [layerInstruction]

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    let fps = sourceVideo.nominalFrameRate > 0 ? sourceVideo.nominalFrameRate : 30
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
    videoComposition.instructions = [instruction]

    // Capas: el vídeo debajo y cada subtítulo encima, visible solo en su intervalo.
    let parentLayer = CALayer()
    let videoLayer = CALayer()
    parentLayer.frame = CGRect(origin: .zero, size: renderSize)
    videoLayer.frame = parentLayer.frame
    parentLayer.addSublayer(videoLayer)
    for cue in cues where cue.end > cue.start && !cue.lines.isEmpty {
      parentLayer.addSublayer(subtitleLayer(for: cue, in: renderSize))
    }
    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parentLayer)

    // HEVC a la máxima calidad mantiene la resolución (4K incluido) y pesa la mitad que H.264.
    let presets = AVAssetExportSession.exportPresets(compatibleWith: composition)
    let preset = presets.contains(AVAssetExportPresetHEVCHighestQuality) ? AVAssetExportPresetHEVCHighestQuality : AVAssetExportPresetHighestQuality
    guard let session = AVAssetExportSession(asset: composition, presetName: preset) else { throw SubtitleBurnerError.exportUnavailable }
    try? FileManager.default.removeItem(at: output)
    session.outputURL = output
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true
    session.videoComposition = videoComposition
    return session
  }

  // MARK: - Subtítulos

  /// Franja + texto de un subtítulo. En la composición el origen está abajo a la izquierda.
  static func subtitleLayer(for cue: SubtitleCue, in size: CGSize) -> CALayer {
    let fontSize = SubtitleStyle.fontSize(size)
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byWordWrapping
    let attributes: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: fontSize, weight: .semibold),
      .foregroundColor: UIColor.white,
      .paragraphStyle: paragraph,
    ]
    let text = NSAttributedString(string: cue.lines.joined(separator: "\n"), attributes: attributes)
    let maxTextWidth = size.width - 2 * SubtitleStyle.marginSide(size)
    let bounds = text.boundingRect(
      with: CGSize(width: maxTextWidth, height: .greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      context: nil
    ).integral

    let padH = fontSize * 0.5
    let padV = fontSize * 0.28
    let boxSize = CGSize(width: bounds.width + 2 * padH, height: bounds.height + 2 * padV)
    let box = CALayer()
    box.frame = CGRect(
      x: (size.width - boxSize.width) / 2,
      y: SubtitleStyle.marginBottom(size),
      width: boxSize.width,
      height: boxSize.height
    )
    box.backgroundColor = UIColor.black.withAlphaComponent(SubtitleStyle.boxOpacity).cgColor
    box.cornerRadius = fontSize * 0.15

    let textLayer = CATextLayer()
    textLayer.string = text
    textLayer.isWrapped = true
    textLayer.alignmentMode = .center
    textLayer.contentsScale = 1
    textLayer.frame = CGRect(x: padH, y: padV, width: bounds.width, height: bounds.height)
    box.addSublayer(textLayer)

    // Oculto salvo durante su intervalo. AVFoundation trata beginTime 0 como "ahora", por eso
    // se usa AVCoreAnimationBeginTimeAtZero.
    box.opacity = 0
    let show = CABasicAnimation(keyPath: "opacity")
    show.fromValue = 1
    show.toValue = 1
    show.beginTime = cue.start <= 0 ? AVCoreAnimationBeginTimeAtZero : cue.start
    show.duration = cue.end - max(cue.start, 0)
    show.isRemovedOnCompletion = false
    show.fillMode = .removed
    box.add(show, forKey: "show")
    return box
  }
}
