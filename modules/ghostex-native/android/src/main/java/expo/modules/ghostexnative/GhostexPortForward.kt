package expo.modules.ghostexnative

import android.util.Log
import java.io.Closeable
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import net.schmizz.sshj.SSHClient

/**
 * One SSH local port forward on top of an existing, already-authenticated connection: a
 * loopback listener on the phone whose every accepted socket gets its own direct-tcpip
 * channel to `<remoteHost>:<remotePort>` on the machine, with bytes piped both ways.
 *
 * The forward is owned by [GhostexSshConnection]; it is closed when that connection is
 * disconnected, reconnected, or replaced, so a stale listener can never outlive the SSH
 * session it dials through. A per-connection failure closes only that socket and its
 * channel — the listener keeps serving.
 */
internal class GhostexPortForward(
  private val machineId: String,
  val remotePort: Int,
  /** direct-tcpip target host, resolved on the machine ([DEFAULT_REMOTE_HOST] unless the caller names one). */
  val remoteHost: String,
  private val clientProvider: () -> SSHClient?
) {

  private val serverSocket = openListener(machineId, remotePort, remoteHost)

  /** Loopback port the app connects to: the one this target had before, or one the OS assigns. */
  val localPort: Int = serverSocket.localPort

  private val closed = AtomicBoolean(false)

  /** Live per-connection socket/channel pairs, closed together when the forward stops. */
  private val liveConnections: MutableSet<ForwardedConnection> =
    Collections.newSetFromMap(ConcurrentHashMap<ForwardedConnection, Boolean>())

  /** One accept thread plus two pump threads per in-flight connection. */
  private val workers: ExecutorService = Executors.newCachedThreadPool { runnable ->
    Thread(runnable, "GhostexPortForward-$machineId-$remotePort").apply { isDaemon = true }
  }

  /** Begin accepting on the loopback listener. */
  fun start() {
    Log.i(LOG_TAG, "portForward $machineId:$remotePort listening on $LOOPBACK_HOST:$localPort")
    submit { acceptLoop() }
  }

  /** Close the listener and every in-flight connection. Safe to call repeatedly. */
  fun close() {
    if (!closed.compareAndSet(false, true)) return
    Log.i(LOG_TAG, "stopPortForward $machineId remotePort=$remotePort")
    closeQuietly(serverSocket)
    /*
     * The set is not cleared: a pump thread that is finishing its own connection
     * right now still has to find it here, and `remove` returning false is what
     * tells that thread the close below already happened. Every entry removes
     * itself in [finish].
     */
    for (connection in liveConnections.toList()) connection.close()
    workers.shutdownNow()
  }

  private fun acceptLoop() {
    while (!closed.get()) {
      val socket = try {
        serverSocket.accept()
      } catch (error: IOException) {
        if (!closed.get()) {
          Log.w(
            LOG_TAG,
            "portForward $machineId:$remotePort stopped accepting: " +
              (error.message ?: error.javaClass.simpleName)
          )
        }
        break
      }
      if (!submit { serveConnection(socket) }) closeQuietly(socket)
    }
  }

  /**
   * Give one accepted socket its own direct-tcpip channel and pipe both directions until
   * either side ends. Every failure here is local to this connection.
   */
  private fun serveConnection(socket: Socket) {
    val ssh = clientProvider()
    if (ssh == null || !ssh.isConnected) {
      Log.w(LOG_TAG, "portForward $machineId:$remotePort dropped a connection: SSH session is gone")
      closeQuietly(socket)
      return
    }
    val channel = try {
      ssh.newDirectConnection(remoteHost, remotePort)
    } catch (error: Exception) {
      Log.w(
        LOG_TAG,
        "portForward $machineId:$remotePort dial failed: " +
          (error.message ?: error.javaClass.simpleName)
      )
      closeQuietly(socket)
      return
    }

    val connection = ForwardedConnection(socket, channel)
    liveConnections.add(connection)
    /*
     * [close] may have swept the set between the dial above and this add, in
     * which case nothing else will ever close this pair. Re-checking here is the
     * only place that can catch it.
     */
    if (closed.get()) {
      finish(connection)
      return
    }
    try {
      socket.tcpNoDelay = true
    } catch (ignored: IOException) {
      // Nagle stays on; the forward still works.
    }

    // Remote -> local on a worker, local -> remote on this thread. Whichever direction
    // ends first tears the pair down, which unblocks the other pump's read.
    val remoteToLocalStarted = submit {
      pumpThenFinish(connection) { pump(channel.inputStream, socket.getOutputStream()) }
    }
    if (!remoteToLocalStarted) {
      finish(connection)
      return
    }
    pumpThenFinish(connection) { pump(socket.getInputStream(), channel.outputStream) }
  }

  /**
   * Runs one pump and retires its connection. `Socket.getInputStream`/`getOutputStream` throw
   * once the socket is closed, which [close] (a chat link repair stops the forward) or the other
   * pump can do at any moment, and an exception escaping a pool thread kills the whole app.
   */
  private fun pumpThenFinish(connection: ForwardedConnection, work: () -> Unit) {
    try {
      work()
    } catch (ignored: IOException) {
      // The pair is already closing; ordinary teardown.
    } finally {
      finish(connection)
    }
  }

  /**
   * Retire one connection. [ForwardedConnection.close] is idempotent, so it is
   * called whether or not this thread was the one to take the entry out of the
   * set — otherwise the loser of a race between the two pump threads, or between
   * a pump thread and [close], would drop a socket and a channel unclosed.
   */
  private fun finish(connection: ForwardedConnection) {
    liveConnections.remove(connection)
    connection.close()
  }

  private fun submit(work: () -> Unit): Boolean {
    return try {
      workers.execute(work)
      true
    } catch (ignored: RejectedExecutionException) {
      // The forward is being torn down; the caller closes what it holds.
      false
    }
  }

  /** One socket paired with the direct-tcpip channel that carries it. */
  private class ForwardedConnection(val socket: Socket, val channel: Closeable) {
    private val closed = AtomicBoolean(false)

    fun close() {
      if (!closed.compareAndSet(false, true)) return
      closeQuietly(socket)
      closeQuietly(channel)
    }
  }

  companion object {
    /** Same logcat tag as the rest of the SSH transport. */
    private const val LOG_TAG = "GhostexSsh"

    /** The forward is reachable from this device only; the SSH channel carries the traffic. */
    private const val LOOPBACK_HOST = "127.0.0.1"

    /**
     * The direct-tcpip target when the caller names none (Web Preview): `localhost`, so a dev
     * server bound only to `::1` is reached too. gxserver's own forward names `127.0.0.1`.
     */
    const val DEFAULT_REMOTE_HOST = "localhost"

    /** 0 asks the OS for a free port, which [localPort] then reports. */
    private const val ANY_LOCAL_PORT = 0
    private const val ACCEPT_BACKLOG = 32
    private const val PUMP_BUFFER_BYTES = 32 * 1024

    /** The phone port each machine target was last forwarded on, for this app run. */
    private val lastLocalPorts = ConcurrentHashMap<String, Int>()

    /**
     * The listener for one machine target, on the port that target had before when it is still free.
     *
     * CDXC:Mobile 2026-10-26 WHY: every forward dies with its SSH transport, and the chat link's repair closes and reopens gxserver's on purpose, so each reconnect used to move the target to a new random phone port. A page already open on the old one (a `ghostex show` page in the page sheet, a Web preview) then reached nothing: the user typed answers to every question of a page over Tailscale while the link reconnected, the page's drafts stopped landing, Send said "Failed to fetch", and closing the page lost the text. Binding the target's earlier port again keeps the page's address working once the link is back, so its pending drafts and send go through (server/src/visual_pages/theme.rs keeps trying them). A port another app took meanwhile is the one case that gets a new port.
     * SEE-ALSO: apps/mobile/app/src/chat/native/cards/PageSheet.tsx (moves an open page when its port changed anyway).
     */
    private fun openListener(machineId: String, remotePort: Int, remoteHost: String): ServerSocket {
      val key = "$machineId\u0000$remoteHost\u0000$remotePort"
      val loopback = InetAddress.getByName(LOOPBACK_HOST)
      val socket = lastLocalPorts[key]?.let { port ->
        val candidate = ServerSocket()
        try {
          // The old listener's accepted sockets may still be in TIME_WAIT on that port.
          candidate.reuseAddress = true
          candidate.bind(InetSocketAddress(loopback, port), ACCEPT_BACKLOG)
          candidate
        } catch (error: IOException) {
          Log.i(LOG_TAG, "portForward $machineId:$remotePort could not take back $LOOPBACK_HOST:$port: ${error.message}")
          closeQuietly(candidate)
          null
        }
      } ?: ServerSocket(ANY_LOCAL_PORT, ACCEPT_BACKLOG, loopback)
      lastLocalPorts[key] = socket.localPort
      return socket
    }

    private fun pump(input: InputStream, output: OutputStream) {
      val buffer = ByteArray(PUMP_BUFFER_BYTES)
      try {
        while (true) {
          val count = input.read(buffer)
          if (count == -1) break
          output.write(buffer, 0, count)
          output.flush()
        }
      } catch (ignored: IOException) {
        // Either end closing mid-transfer is ordinary teardown for a forwarded connection.
      }
    }

    private fun closeQuietly(closeable: Closeable) {
      try {
        closeable.close()
      } catch (ignored: Exception) {
        // Closing an already-dead socket or channel is not actionable.
      }
    }
  }
}
