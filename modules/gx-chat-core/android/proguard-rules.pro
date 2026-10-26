# R8 keep rules for the Rust chat core, applied to the app as consumer rules
# (release builds shrink and obfuscate the app's code).

# UniFFI's Kotlin bindings reach libgx_chat_mobile.so through JNA, which binds
# interface methods, Structure fields and callbacks by their Java names
# (rules from UniFFI's Kotlin/Android guide and JNA's own Android notes).
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
-dontwarn java.awt.**
-keep class dev.ghostex.gxchatcore.uniffi.** { *; }
