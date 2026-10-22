package expo.modules.ghostexnative

import android.content.Context
import android.content.pm.ApplicationInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

/**
 * Read aloud's speaker: the phone's own `TextToSpeech`, one utterance at a time for the whole app
 * (docs/2026-10-20/voice-mode/read-aloud-client-contract.md, sections 3 and 6).
 *
 * JavaScript hands over an utterance as a token and its segments; this object speaks them in order
 * with the phone's Voice and Speed and reports one `ended` event per token, natural or cut off.
 * Which chat owns a token, and what the chat core hears, is JavaScript's (`src/voice/readAloud.ts`).
 *
 * CDXC:VoiceMode 2026-10-21 DECISION: User (Q27): the phone speaks through a native module built on the voice agent's Kotlin audio code (audio focus, background playback, the foreground service), not `expo-speech`.
 * CDXC:VoiceMode 2026-10-22 WHY: every segment is queued into the engine at once, so a reply keeps playing to its end with the screen locked even while React Native's JavaScript timers sleep. Audio focus is a transient may-duck gain with `USAGE_ASSISTANT` speech attributes, so music and navigation duck under a reply and the reply follows the phone's assistant route (Bluetooth, the car). A navigation prompt or any other transient loss pauses the reply and replays the sentence it was in when focus returns (TextToSpeech has no pause); a call (the phone's audio mode turns to ringtone or in-call), a permanent loss or a pause longer than [PAUSE_LIMIT_MS] ends it as interrupted, so the core never waits on a reply that will not finish. It does not reuse `GhostexVoiceAudio.Session`, whose call mode and earpiece-free routing belong to a two-way conversation.
 * SEE-ALSO: GhostexVoiceAudio.kt (the voice agent's audio), GhostexForegroundService.kt ("Voice mode on").
 */
internal object GhostexSpeech {
  private const val TAG = "GhostexSpeech"
  /** A transient focus loss longer than this ends the reply instead of waiting for it forever. */
  private const val PAUSE_LIMIT_MS = 120_000L
  /** How long after a transient loss the audio mode is read to tell a call from a prompt. */
  private const val CALL_CHECK_MS = 700L

  /** Set by the module; every `ended` event for JavaScript goes through it. */
  @Volatile var emitter: ((Map<String, Any?>) -> Unit)? = null

  private val main = Handler(Looper.getMainLooper())

  // Everything below is touched on the main looper only.
  private var context: Context? = null
  private var engine: TextToSpeech? = null
  /** Null while the engine initialises; true once it can speak. */
  private var ready: Boolean? = null
  private val waiting = mutableListOf<(Boolean) -> Unit>()
  private var current: Utterance? = null
  /** Bumped whenever the engine is flushed, so its late callbacks for older text are ignored. */
  private var generation = 0
  private var focusRequest: AudioFocusRequest? = null
  private var debuggable = false
  /** Tokens stopped before their `speak` arrived (the module's calls may overtake each other). */
  private val stoppedEarly = ArrayDeque<String>()

  private class Utterance(val token: String, val segments: List<String>, val voice: String, val rate: Float) {
    /** The segment speaking now, and where in it the engine is (`onRangeStart`). */
    var index = 0
    var offset = 0
    /** Another app took the audio (a navigation prompt, a call ringing). */
    var pausedByFocus = false
    /** Pause in the "Voice mode on" notification. */
    var pausedByUser = false
    val paused: Boolean get() = pausedByFocus || pausedByUser
  }

  /** Starts the engine once; answers whether it can speak. */
  fun init(context: Context, done: (Boolean) -> Unit) {
    main.post {
      when (ready) {
        true -> done(true)
        false -> done(false)
        null -> {
          waiting.add(done)
          if (engine == null) create(context.applicationContext)
        }
      }
    }
  }

  private fun create(app: Context) {
    context = app
    debuggable = (app.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    engine = TextToSpeech(app) { status ->
      main.post {
        val ok = status == TextToSpeech.SUCCESS
        ready = ok
        if (ok) {
          engine?.setAudioAttributes(attributes())
          engine?.setOnUtteranceProgressListener(progress)
        } else {
          Log.w(TAG, "the phone's text-to-speech engine did not start ($status)")
          engine?.shutdown()
          engine = null
        }
        val callbacks = waiting.toList()
        waiting.clear()
        callbacks.forEach { it(ok) }
      }
    }
  }

  private fun attributes(): AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ASSISTANT)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()

  /**
   * The engine's voices: `name`, `language` (ISO 639), `locale` (BCP 47), `localeLabel` (in the
   * phone's language), `network` (needs a connection) and `notInstalled` (needs a download).
   */
  fun voices(done: (Map<String, Any?>) -> Unit) {
    main.post {
      val tts = engine
      if (ready != true || tts == null) {
        done(mapOf("voices" to emptyList<Map<String, Any?>>(), "defaultVoice" to null, "language" to Locale.getDefault().language))
        return@post
      }
      val list = try {
        tts.voices?.toList().orEmpty()
      } catch (error: Exception) {
        emptyList()
      }
      val voices = list.sortedWith(compareBy({ it.locale.toLanguageTag() }, { it.name })).map { voice ->
        mapOf(
          "name" to voice.name,
          "language" to voice.locale.language,
          "locale" to voice.locale.toLanguageTag(),
          "localeLabel" to voice.locale.displayName,
          "network" to voice.isNetworkConnectionRequired,
          "notInstalled" to (voice.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) == true),
        )
      }
      val default = try {
        tts.defaultVoice?.name
      } catch (error: Exception) {
        null
      }
      done(mapOf("voices" to voices, "defaultVoice" to default, "language" to Locale.getDefault().language))
    }
  }

  /** Speaks [segments] in order as utterance [token], replacing whatever is speaking. */
  fun speak(token: String, segments: List<String>, voice: String, rate: Double) {
    main.post {
      current?.let { finish(it, interrupted = true) }
      if (stoppedEarly.remove(token)) {
        emitEnded(token, interrupted = true)
        return@post
      }
      val tts = engine
      val texts = segments.filter { it.isNotBlank() }
      if (ready != true || tts == null || texts.isEmpty()) {
        emitEnded(token, interrupted = ready != true || tts == null)
        return@post
      }
      val utterance = Utterance(token, texts, voice, rate.toFloat().coerceIn(0.25f, 4f))
      if (!requestFocus()) {
        Log.i(TAG, "utterance $token not spoken: another app holds the audio")
        emitEnded(token, interrupted = true)
        return@post
      }
      current = utterance
      GhostexForegroundService.setReadAloudPlayback(speaking = true, paused = false)
      Log.i(TAG, "utterance $token: ${texts.size} segment(s), ${texts.sumOf { it.length }} characters, voice ${voice.ifEmpty { "default" }}, speed ${utterance.rate}x")
      play(utterance, 0, 0)
    }
  }

  /** Stops utterance [token] if it is still the one speaking (or paused); otherwise nothing. */
  fun stop(token: String) {
    main.post {
      val playing = current
      if (playing?.token == token) {
        finish(playing, interrupted = true)
      } else {
        // Already over, or not spoken yet: tokens are never reused, so remembering it only drops
        // a `speak` that lands after its own stop.
        stoppedEarly.addLast(token)
        while (stoppedEarly.size > 8) stoppedEarly.removeFirst()
      }
    }
  }

  /** Queues segment [from] (starting at character [offset]) and every segment after it. */
  private fun play(utterance: Utterance, from: Int, offset: Int) {
    val tts = engine ?: return
    generation += 1
    applyVoice(tts, utterance.voice)
    tts.setSpeechRate(utterance.rate)
    utterance.index = from
    utterance.offset = offset
    for (index in from until utterance.segments.size) {
      val text = utterance.segments[index]
      val start = if (index == from) offset.coerceIn(0, text.length) else 0
      val id = "${utterance.token}|$generation|$index|$start"
      val mode = if (index == from) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
      val result = tts.speak(text.substring(start), mode, Bundle(), id)
      if (result != TextToSpeech.SUCCESS) {
        Log.w(TAG, "the engine refused segment ${index + 1} of ${utterance.token}")
        finish(utterance, interrupted = true)
        return
      }
    }
  }

  private fun applyVoice(tts: TextToSpeech, name: String) {
    try {
      val chosen = if (name.isEmpty()) null else tts.voices?.firstOrNull { it.name == name }
      val target = chosen ?: tts.defaultVoice
      if (target != null && tts.voice?.name != target.name) tts.voice = target
    } catch (error: Exception) {
      Log.w(TAG, "voice not applied: ${error.message}")
    }
  }

  /** Ends [utterance]: flushes the engine, gives the audio back and tells JavaScript. */
  private fun finish(utterance: Utterance, interrupted: Boolean) {
    if (current !== utterance) return
    current = null
    generation += 1
    try {
      engine?.stop()
    } catch (_: Exception) {
    }
    main.removeCallbacksAndMessages(utterance)
    abandonFocus()
    GhostexForegroundService.setReadAloudPlayback(speaking = false, paused = false)
    Log.i(TAG, "utterance ${utterance.token} ${if (interrupted) "cut off" else "finished"} at segment ${utterance.index + 1} of ${utterance.segments.size}")
    emitEnded(utterance.token, interrupted)
  }

  private fun emitEnded(token: String, interrupted: Boolean) {
    try {
      emitter?.invoke(mapOf("token" to token, "kind" to "ended", "interrupted" to interrupted))
    } catch (error: Exception) {
      Log.w(TAG, "event dropped: ${error.message}")
    }
  }

  /** `token|generation|segment|offset` back to its parts, or null for text this object no longer speaks. */
  private fun parse(id: String?): Pair<Utterance, Int>? {
    val parts = id?.split('|') ?: return null
    if (parts.size != 4) return null
    val playing = current ?: return null
    if (parts[0] != playing.token || parts[1].toIntOrNull() != generation) return null
    val index = parts[2].toIntOrNull() ?: return null
    return playing to index
  }

  private fun startOf(id: String?): Int = id?.split('|')?.getOrNull(3)?.toIntOrNull() ?: 0

  private val progress = object : UtteranceProgressListener() {
    override fun onStart(utteranceId: String?) {
      main.post {
        val (utterance, index) = parse(utteranceId) ?: return@post
        val start = startOf(utteranceId)
        utterance.index = index
        utterance.offset = start
        val text = utterance.segments[index].substring(start)
        // The words themselves only in a debuggable build: a release logcat carries no chat text.
        val preview = if (debuggable) ": \"${text.take(48)}\"" else ""
        val from = if (start > 0) " from character $start" else ""
        Log.i(TAG, "utterance ${utterance.token} segment ${index + 1}/${utterance.segments.size} started$from (${text.length} characters)$preview")
      }
    }

    override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) {
      main.post {
        val (utterance, index) = parse(utteranceId) ?: return@post
        if (index == utterance.index) utterance.offset = startOf(utteranceId) + start
      }
    }

    override fun onDone(utteranceId: String?) {
      main.post {
        val (utterance, index) = parse(utteranceId) ?: return@post
        Log.i(TAG, "utterance ${utterance.token} segment ${index + 1}/${utterance.segments.size} done")
        if (index == utterance.segments.size - 1) finish(utterance, interrupted = false)
      }
    }

    @Deprecated("Deprecated in Java")
    override fun onError(utteranceId: String?) {
      main.post {
        val (utterance, _) = parse(utteranceId) ?: return@post
        Log.w(TAG, "the engine failed on ${utterance.token}")
        finish(utterance, interrupted = true)
      }
    }

    override fun onError(utteranceId: String?, errorCode: Int) {
      main.post {
        val (utterance, _) = parse(utteranceId) ?: return@post
        Log.w(TAG, "the engine failed on ${utterance.token} ($errorCode)")
        finish(utterance, interrupted = true)
      }
    }
  }

  // region audio focus

  private fun audio(): AudioManager? = context?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private fun requestFocus(): Boolean {
    val manager = audio() ?: return false
    focusRequest?.let { return true }
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      .setAudioAttributes(attributes())
      .setWillPauseWhenDucked(true)
      .setOnAudioFocusChangeListener({ change -> onFocus(change) }, main)
      .build()
    if (manager.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return false
    focusRequest = request
    return true
  }

  private fun abandonFocus() {
    val request = focusRequest ?: return
    focusRequest = null
    audio()?.abandonAudioFocusRequest(request)
  }

  private fun onFocus(change: Int) {
    val utterance = current ?: return
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS -> finish(utterance, interrupted = true)
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        if (utterance.pausedByFocus) return
        utterance.pausedByFocus = true
        hold(utterance)
        Log.i(TAG, "utterance ${utterance.token} paused: another app took the audio")
        main.postAtTime({ if (current === utterance && utterance.pausedByFocus && inCall()) finish(utterance, interrupted = true) }, utterance, android.os.SystemClock.uptimeMillis() + CALL_CHECK_MS)
        main.postAtTime({ if (current === utterance && utterance.pausedByFocus) finish(utterance, interrupted = true) }, utterance, android.os.SystemClock.uptimeMillis() + PAUSE_LIMIT_MS)
      }
      AudioManager.AUDIOFOCUS_GAIN -> {
        if (!utterance.pausedByFocus) return
        utterance.pausedByFocus = false
        main.removeCallbacksAndMessages(utterance)
        if (inCall()) {
          finish(utterance, interrupted = true)
          return
        }
        resume(utterance)
      }
    }
  }

  /**
   * The notification's Pause / Resume. A reply paused by hand waits without a time limit; it keeps
   * the speaker, so a reply that finishes meanwhile waits behind it as it would behind speech.
   */
  fun togglePauseByUser() {
    main.post {
      val utterance = current ?: return@post
      utterance.pausedByUser = !utterance.pausedByUser
      if (utterance.pausedByUser) {
        hold(utterance)
        Log.i(TAG, "utterance ${utterance.token} paused from the notification")
      } else {
        Log.i(TAG, "utterance ${utterance.token} resumed from the notification")
        resume(utterance)
      }
    }
  }

  /** The notification's Stop or Exit: the speech stops and JavaScript turns Auto-read off. */
  fun stopVoiceMode() {
    main.post {
      current?.let { finish(it, interrupted = true) }
      try {
        emitter?.invoke(mapOf("token" to "", "kind" to "voiceModeStop", "interrupted" to true))
      } catch (error: Exception) {
        Log.w(TAG, "event dropped: ${error.message}")
      }
    }
  }

  /** Silences the engine and keeps the place, for a pause of either kind. */
  private fun hold(utterance: Utterance) {
    generation += 1
    try {
      engine?.stop()
    } catch (_: Exception) {
    }
    GhostexForegroundService.setReadAloudPlayback(speaking = true, paused = true)
  }

  /** Picks up again at the start of the sentence it stopped in, once no pause holds it. */
  private fun resume(utterance: Utterance) {
    if (utterance.paused) return
    GhostexForegroundService.setReadAloudPlayback(speaking = true, paused = false)
    val text = utterance.segments[utterance.index]
    val from = sentenceStart(text, utterance.offset)
    Log.i(TAG, "utterance ${utterance.token} resumed at segment ${utterance.index + 1}, character $from")
    play(utterance, utterance.index, from)
  }

  private fun inCall(): Boolean {
    val mode = audio()?.mode ?: return false
    return mode == AudioManager.MODE_RINGTONE || mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION
  }

  /** The start of the sentence that holds character [offset]: where a paused reply picks up. */
  private fun sentenceStart(text: String, offset: Int): Int {
    var at = offset.coerceIn(0, text.length)
    while (at > 0) {
      val previous = text[at - 1]
      if ((previous == ' ' || previous == '\n') && at >= 2 && text[at - 2] in ".!?\n") return at
      at -= 1
    }
    return 0
  }

  // endregion
}
