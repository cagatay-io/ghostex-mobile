# Waiting music: where the pieces come from

The four loops the voice agent's waiting music offers (`src/voice/waitingMusic.ts`). Each is dedicated to the public
domain by its author under **CC0 1.0 Universal** (https://creativecommons.org/publicdomain/zero/1.0/), as stated on
its OpenGameArt page. CC0 asks for no attribution; the app names the authors in Settings › Voice anyway.

Pages and files read and downloaded on 2026-11-26. The licence is the uploader's statement on the page.

| File | Title | Author | Source page | File downloaded | SHA-256 of the download |
|---|---|---|---|---|---|
| `ambient-relaxing-loop.m4a` | Ambient Relaxing Loop | isaiah658 | https://opengameart.org/content/ambient-relaxing-loop | https://opengameart.org/sites/default/files/Ambient-Loop-isaiah658.wav (`Ambient-Loop-isaiah658.wav`) | `8ccf91ef2b46b3286aee35811306dbf6484d462ddffb2fe5c8ab491453f39666` |
| `heavenly-loop.m4a` | Heavenly Loop | isaiah658 | https://opengameart.org/content/heavenly-loop | https://opengameart.org/sites/default/files/Heavenly%20Loop.flac (`Heavenly Loop.flac`) | `1324464c995635ce1a7833c5b3f33eba7356b60e17e802ebbf286bd1abe0a5a4` |
| `slow-stride.m4a` | Slow Stride | isaiah658 | https://opengameart.org/content/slow-stride | https://opengameart.org/sites/default/files/Slow%20Stride%20Loop.flac (`Slow Stride Loop.flac`) | `42598ee6d19ccc9b2659a6a4bde081aab0e8d0ea8fc6d97428d46803653ab337` |
| `calm-loop.m4a` | Calm Loop | wipics | https://opengameart.org/content/calm-loop | https://opengameart.org/sites/default/files/Relaxing_0.mp3 (the page lists it as `Relaxing.mp3`) | `1d7e386c079d4add6b3b1592054846e4977035f26844466e409467c6dc7bdbde` |

## Conversion

Every piece is mono AAC-LC at 64 kbit/s and the source's 44.1 kHz in an `.m4a`, encoded by macOS `afconvert`, which
records the encoder's priming and remainder frames, so the decoded file has exactly the source's length and loops
without a gap. Mono because a call's route (loudspeaker, Bluetooth hands-free, CarPlay) plays the call in mono.

Two steps per piece:

1. `ffmpeg` writes a 32-bit float WAV: only leading and trailing silence (below -60 dBFS) is trimmed, and one static
   gain brings each piece to the same loudness, -22 LUFS after the mono downmix, so one volume setting means the same
   for all four. No compression and no limiting.
2. `afconvert -f m4af -d aac -c 1 --mix -b 64000 -q 127 <piece>.wav <piece>.m4a`

| File | Trimmed | Gain | Commands |
|---|---|---|---|
| `ambient-relaxing-loop.m4a` | nothing (no silence at either end) | -0.2 dB | `ffmpeg -i Ambient-Loop-isaiah658.wav -af 'volume=-0.2dB' -c:a pcm_f32le ambient-relaxing-loop.wav`, then step 2 |
| `heavenly-loop.m4a` | nothing (no silence at either end) | +5.1 dB | `ffmpeg -i 'Heavenly Loop.flac' -af 'volume=5.1dB' -c:a pcm_f32le heavenly-loop.wav`, then step 2 |
| `slow-stride.m4a` | nothing (no silence at either end) | -1.3 dB | `ffmpeg -i 'Slow Stride Loop.flac' -af 'volume=-1.3dB' -c:a pcm_f32le slow-stride.wav`, then step 2 |
| `calm-loop.m4a` | 234 frames (5.3 ms) of leading and 5510 frames (124.9 ms) of trailing silence, the MP3's padding: frames 234 to 849273 of 854784 are kept | -9.6 dB | `ffmpeg -i Relaxing.mp3 -af 'atrim=start_sample=234:end_sample=849274,asetpts=N/SR/TB,volume=-9.6dB' -c:a pcm_f32le calm-loop.wav`, then step 2 |

Checked after encoding: each `.m4a` decodes (CoreAudio) to exactly as many frames as its WAV, and the step from its
last sample to its first is smaller than the 99th percentile of the steps between neighbouring samples inside the
piece, so the loop point has no click.
