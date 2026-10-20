package expo.modules.ghostexnative

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.PlaybackParams
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * The microphone, the speaker and the audio session of a voice conversation or dictation.
 *
 * Everything is 24 kHz mono PCM16, the format gxserver's `/api/voice` speaks in both directions
 * (docs/2026-10-20/voice-mode/voice-agent-client-contract.md, section 2), so nothing is resampled.
 *
 * CDXC:VoiceMode 2026-10-20 WHY: The provider's voice activity detection interrupts the agent
 * whenever it hears speech, so a speaker that leaks into the microphone makes the agent cut itself
 * off. A conversation therefore runs as a call: `MODE_IN_COMMUNICATION`, the `VOICE_COMMUNICATION`
 * microphone with `AcousticEchoCanceler`, and playback with `USAGE_VOICE_COMMUNICATION`, which is the
 * pairing Android's echo canceller takes its reference from. The same mode routes the microphone and
 * the speaker through a Bluetooth headset or a car's hands-free link when one is connected.
 * Dictation never plays anything, so it records with the plain `VOICE_RECOGNITION` source instead.
 * SEE-ALSO: GhostexVoice.kt (the socket), GhostexForegroundService.kt (the "Voice mode on" service).
 */
internal object GhostexVoiceAudio {
  const val SAMPLE_RATE = 24_000
  /** 40 ms of PCM16 mono at 24 kHz: what the CLI sends per frame (the contract allows 20 to 100 ms). */
  const val CHUNK_BYTES = 1_920
  const val BYTES_PER_MS = 48

  private const val TAG = "GhostexVoice"

  /**
   * Developer-only microphone stand-in: queued WAV audio replaces what the microphone hears, chunk
   * for chunk, so the timing stays the microphone's. Filled by [queueDebugWav] (an `adb shell am
   * broadcast` on debuggable builds, see GhostexVoice.kt). Never surfaced to users.
   */
  private val debugFeed = ConcurrentLinkedQueue<ByteArray>()

  /** Queues a 16-bit mono 24 kHz WAV for the microphone path. Answers a short error, or null. */
  fun queueDebugWav(path: String): String? {
    val bytes = try {
      File(path).readBytes()
    } catch (error: Exception) {
      return "Could not read $path: ${error.message}"
    }
    if (bytes.size < 44 || String(bytes, 0, 4) != "RIFF" || String(bytes, 8, 4) != "WAVE") return "$path is not a WAV file."
    var offset = 12
    var channels = 0
    var rate = 0
    var bits = 0
    while (offset + 8 <= bytes.size) {
      val id = String(bytes, offset, 4)
      val size = littleEndianInt(bytes, offset + 4)
      val body = offset + 8
      if (id == "fmt ") {
        channels = littleEndianShort(bytes, body + 2)
        rate = littleEndianInt(bytes, body + 4)
        bits = littleEndianShort(bytes, body + 14)
      } else if (id == "data") {
        if (channels != 1 || rate != SAMPLE_RATE || bits != 16) {
          return "$path must be 16-bit mono 24 kHz (it is $bits-bit, $channels channel(s), $rate Hz)."
        }
        val end = minOf(bytes.size, body + size)
        var at = body
        while (at < end) {
          val chunk = ByteArray(CHUNK_BYTES)
          System.arraycopy(bytes, at, chunk, 0, minOf(CHUNK_BYTES, end - at))
          debugFeed.add(chunk)
          at += CHUNK_BYTES
        }
        return null
      }
      offset = body + size + (size and 1)
    }
    return "$path has no audio data."
  }

  private fun littleEndianInt(bytes: ByteArray, at: Int): Int =
    (bytes[at].toInt() and 0xff) or ((bytes[at + 1].toInt() and 0xff) shl 8) or
      ((bytes[at + 2].toInt() and 0xff) shl 16) or ((bytes[at + 3].toInt() and 0xff) shl 24)

  private fun littleEndianShort(bytes: ByteArray, at: Int): Int =
    (bytes[at].toInt() and 0xff) or ((bytes[at + 1].toInt() and 0xff) shl 8)

  /**
   * Reads the microphone on its own thread and hands every 40 ms chunk to [onChunk] (which decides
   * whether it is sent). Echo cancellation and noise suppression are switched on when the device
   * has them.
   */
  class Capture(private val conversation: Boolean, private val onChunk: (ByteArray) -> Unit, private val onError: (String) -> Unit) {
    @Volatile private var running = false
    private var thread: Thread? = null

    @SuppressLint("MissingPermission")
    fun start() {
      if (running) return
      running = true
      thread = Thread({ loop() }, "GhostexVoiceMic").apply {
        isDaemon = true
        start()
      }
    }

    fun stop() {
      running = false
      thread?.interrupt()
      thread = null
    }

    @SuppressLint("MissingPermission")
    private fun loop() {
      val source = if (conversation) MediaRecorder.AudioSource.VOICE_COMMUNICATION else MediaRecorder.AudioSource.VOICE_RECOGNITION
      val minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      val record = try {
        AudioRecord(source, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum, CHUNK_BYTES * 4))
      } catch (error: Exception) {
        onError("Ghostex could not open the microphone.")
        return
      }
      if (record.state != AudioRecord.STATE_INITIALIZED) {
        record.release()
        onError("Ghostex could not open the microphone.")
        return
      }
      var echo: AcousticEchoCanceler? = null
      var noise: NoiseSuppressor? = null
      if (conversation) {
        if (AcousticEchoCanceler.isAvailable()) echo = AcousticEchoCanceler.create(record.audioSessionId)?.also { it.enabled = true }
        if (NoiseSuppressor.isAvailable()) noise = NoiseSuppressor.create(record.audioSessionId)?.also { it.enabled = true }
      }
      try {
        record.startRecording()
        val buffer = ByteArray(CHUNK_BYTES)
        while (running) {
          var filled = 0
          while (filled < CHUNK_BYTES && running) {
            val read = record.read(buffer, filled, CHUNK_BYTES - filled)
            if (read <= 0) break
            filled += read
          }
          if (!running) break
          if (filled < CHUNK_BYTES) {
            onError("The microphone stopped.")
            break
          }
          onChunk(debugFeed.poll() ?: buffer.copyOf())
        }
      } catch (error: Exception) {
        Log.w(TAG, "microphone loop ended: ${error.message}")
      } finally {
        try {
          record.stop()
        } catch (_: Exception) {
        }
        echo?.release()
        noise?.release()
        record.release()
      }
    }
  }

  /**
   * Streams the agent's audio to the speaker from a queue on its own thread, so the socket's reader
   * never blocks on the speaker. [cut] drops everything still queued or buffered at once (the
   * contract's `interrupted`) and says how much of that reply was actually heard.
   */
  class Player {
    private val queue = LinkedBlockingQueue<ByteArray>()
    private val generation = AtomicInteger(0)
    @Volatile private var running = true
    private val track: AudioTrack
    private val thread: Thread
    /** Frames handed to the track since it was created or last flushed. */
    @Volatile private var framesWritten = 0L
    /** The head position the current reply started at, or -1 before its first frame. */
    @Volatile private var itemStartFrame = -1L
    @Volatile var itemId: String? = null
      private set

    init {
      val minimum = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
      track = AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .setAudioFormat(
          AudioFormat.Builder()
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .build()
        )
        .setTransferMode(AudioTrack.MODE_STREAM)
        .setBufferSizeInBytes(maxOf(minimum, SAMPLE_RATE * 2 / 5))
        .build()
      track.play()
      thread = Thread({ loop() }, "GhostexVoiceSpeaker").apply {
        isDaemon = true
        start()
      }
    }

    fun beginItem(id: String) {
      itemId = id
      itemStartFrame = -1L
    }

    fun enqueue(audio: ByteArray) {
      if (running) queue.add(audio)
    }

    /**
     * Plays the agent's audio [speed] times as fast with its pitch kept (the voice screen's speed
     * buttons, `voiceAgentSpeed`).
     *
     * CDXC:VoiceMode 2026-10-20 WHY: neither provider talks faster than 1.5x and the user's buttons go to 2x, so the speed is the track's playback rate, like the desktop's time stretch. The track's head position still counts the provider's frames, so [cut] keeps reporting how much of the reply's audio was heard, in the provider's time.
     */
    fun setSpeed(speed: Float) {
      try {
        track.playbackParams = PlaybackParams().setSpeed(speed).setPitch(1f)
      } catch (_: IllegalArgumentException) {
      } catch (_: IllegalStateException) {
      }
    }

    /** True while agent audio is queued or still draining from the track. */
    fun playing(): Boolean = queue.isNotEmpty() || headFrame() < framesWritten

    private fun headFrame(): Long = track.playbackHeadPosition.toLong() and 0xffffffffL

    /** Stops the reply at once; answers the milliseconds of `id` the speaker played. */
    @Synchronized
    fun cut(id: String?): Long {
      generation.incrementAndGet()
      queue.clear()
      val played = if (id != null && id == itemId && itemStartFrame >= 0) maxOf(0L, headFrame() - itemStartFrame) else 0L
      try {
        track.pause()
        track.flush()
        track.play()
      } catch (_: IllegalStateException) {
      }
      framesWritten = headFrame()
      itemStartFrame = -1L
      return played * 1000 / SAMPLE_RATE
    }

    fun release() {
      running = false
      generation.incrementAndGet()
      queue.clear()
      thread.interrupt()
      try {
        track.pause()
        track.flush()
        track.release()
      } catch (_: IllegalStateException) {
      }
    }

    private fun loop() {
      while (running) {
        val chunk = try {
          queue.poll(250, TimeUnit.MILLISECONDS)
        } catch (_: InterruptedException) {
          null
        } ?: continue
        val written = generation.get()
        synchronized(this) {
          if (written != generation.get() || !running) return@synchronized
          if (itemStartFrame < 0) itemStartFrame = framesWritten
        }
        var offset = 0
        while (offset < chunk.size && running && written == generation.get()) {
          val count = try {
            track.write(chunk, offset, chunk.size - offset)
          } catch (_: IllegalStateException) {
            -1
          }
          if (count <= 0) break
          offset += count
          if (written == generation.get()) framesWritten += count / 2
        }
      }
    }
  }

  /**
   * The phone's audio session for a conversation: the call mode, the route (Bluetooth headset or
   * car first, then a wired or USB headset, then the loudspeaker, never the earpiece: the phone is
   * in a pocket or a holder) and audio focus. Focus is held as a transient gain; losing it (a call,
   * a navigation prompt) pauses the conversation through [onFocus] until it comes back.
   */
  class Session(context: Context, private val onFocus: (Boolean) -> Unit) {
    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val handler = Handler(Looper.getMainLooper())
    private val previousMode = audio.mode
    @Suppress("DEPRECATION")
    private val previousSpeaker = audio.isSpeakerphoneOn
    private var focusRequest: AudioFocusRequest? = null
    private var legacyBluetooth = false
    private val deviceCallback = object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) = route()
      override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) = route()
    }

    fun begin() {
      audio.mode = AudioManager.MODE_IN_COMMUNICATION
      route()
      audio.registerAudioDeviceCallback(deviceCallback, handler)
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .setWillPauseWhenDucked(true)
        .setOnAudioFocusChangeListener({ change ->
          when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> onFocus(true)
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> onFocus(false)
          }
        }, handler)
        .build()
      focusRequest = request
      if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) onFocus(false)
    }

    @Suppress("DEPRECATION")
    private fun route() {
      if (Build.VERSION.SDK_INT >= 31) {
        val devices = audio.availableCommunicationDevices
        val order = intArrayOf(
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
          AudioDeviceInfo.TYPE_BLE_HEADSET,
          AudioDeviceInfo.TYPE_USB_HEADSET,
          AudioDeviceInfo.TYPE_WIRED_HEADSET,
          AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
          AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
        )
        val pick = order.asSequence().mapNotNull { type -> devices.firstOrNull { it.type == type } }.firstOrNull()
        if (pick != null && audio.communicationDevice?.id != pick.id) audio.setCommunicationDevice(pick)
        return
      }
      val outputs = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      val bluetooth = outputs.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
      val wired = outputs.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || it.type == AudioDeviceInfo.TYPE_USB_HEADSET }
      if (bluetooth && !legacyBluetooth) {
        audio.startBluetoothSco()
        audio.isBluetoothScoOn = true
        legacyBluetooth = true
      } else if (!bluetooth && legacyBluetooth) {
        audio.stopBluetoothSco()
        audio.isBluetoothScoOn = false
        legacyBluetooth = false
      }
      audio.isSpeakerphoneOn = !bluetooth && !wired
    }

    @Suppress("DEPRECATION")
    fun end() {
      audio.unregisterAudioDeviceCallback(deviceCallback)
      focusRequest?.let { audio.abandonAudioFocusRequest(it) }
      focusRequest = null
      if (Build.VERSION.SDK_INT >= 31) {
        audio.clearCommunicationDevice()
      } else {
        if (legacyBluetooth) {
          audio.stopBluetoothSco()
          audio.isBluetoothScoOn = false
        }
        audio.isSpeakerphoneOn = previousSpeaker
      }
      audio.mode = previousMode
    }
  }
}
