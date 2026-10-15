# R8 keep rules for this module's dependencies, applied to the app as consumer
# rules (release builds shrink and obfuscate the app's code).

# The tailcat gomobile bridge (libs/tailcatbridge.jar + libgojni.so). The Go
# side calls back into these classes through JNI by name (go.Seq and the
# generated proxies), so neither the classes nor their members may be renamed.
-keep class go.** { *; }
-keep class dev.ghostex.tailcatbridge.** { *; }

# BouncyCastle registers its algorithms with the JCA as class-name strings
# ("org.bouncycastle.jcajce.provider.symmetric.AES$ECB") and instantiates them
# reflectively, so R8 cannot see those references.
-keep class org.bouncycastle.jcajce.provider.** { *; }
-keep class org.bouncycastle.jce.provider.** { *; }
-dontwarn org.bouncycastle.**

# SSHJ looks providers and optional crypto classes up by name and logs through
# slf4j without a binding; it is small, so keep it whole.
-keep class net.schmizz.** { *; }
-keep class com.hierynomus.** { *; }
-dontwarn net.schmizz.**
-dontwarn com.hierynomus.**
-dontwarn org.slf4j.**
-dontwarn javax.naming.**
-dontwarn sun.security.**
