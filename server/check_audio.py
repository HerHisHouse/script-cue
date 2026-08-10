import sys
import wave

try:
    from pydub import AudioSegment
    audio = AudioSegment.from_mp3("test_hume_preview.mp3")
    print(f"Duration: {len(audio)} ms")
    print(f"Max amplitude: {audio.max}")
except Exception as e:
    print(e)
