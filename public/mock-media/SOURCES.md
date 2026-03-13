# Mock Media Sources

These bundled files are used only as local development fixtures for the Vyde Labs studio UI.

- `nasa-neowise.jpg`
  - Source page: `https://commons.wikimedia.org/wiki/File:PIA23792-1600x1200(1).jpg`
  - Notes: Wikimedia Commons file page is categorized `PD NASA`
- `jacmel-beach.jpg`
  - Source page: `https://commons.wikimedia.org/wiki/File:Playa_de_Hait%C3%AD_(cropped).jpg`
  - Notes: Wikimedia Commons file page is categorized `PD-user`
- `moon-passing-earth-clip.mp4`
  - Derived from: `https://commons.wikimedia.org/wiki/File:Video-MoonPassingEarth-20150716.webm`
  - Notes: local 6-second clip derived from a Wikimedia Commons file page categorized `PD NASA`
- `nasa-winston-clip.mp4`
  - Derived from: `https://commons.wikimedia.org/wiki/File:LARGE_MP4_Winston_narrated_large.webm`
  - Notes: local 6-second clip derived from a Wikimedia Commons file page categorized `PD NASA`
- `product-cutout.svg`
  - Source: locally authored vector illustration for transparent-background UI testing
  - Notes: converted locally to `product-cutout.png`
- `product-cutout.png`
  - Derived from: `product-cutout.svg`
  - Notes: local transparent PNG fixture used to test background-removal output handling
- `vydelabs-voiceover-sample.mp3`
  - Source: generated locally with macOS `say` and converted to MP3 with `ffmpeg`
  - Notes: short speech fixture for generated TTS output previews
- `vydelabs-voiceover-sample.wav`
  - Derived from: `vydelabs-voiceover-sample.mp3`
  - Notes: PCM WAV fixture used for Orpheus TTS output previews
- `vydelabs-voiceover-sample.flac`
  - Derived from: `vydelabs-voiceover-sample.mp3`
  - Notes: lossless FLAC fixture used for MiniMax high-fidelity output previews
- `vydelabs-uploaded-voice-note.mp3`
  - Source: generated locally with macOS `say` and converted to MP3 with `ffmpeg`
  - Notes: short speech fixture for uploaded audio asset previews
