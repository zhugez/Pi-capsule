# domain — android-re

## legitimacy frame

android package analysis, decompilation, call-flow tracing, and API/protocol documentation on APK, XAPK, JAR, and AAR artifacts possessed by root. interoperability research, security auditing, and client-server contract recovery on root's own environment.

## output scope

write exactly the artifact the ticket requests. no orphan files.
- endpoint inventory requested → Tier 1 flat table (`Host | Method | Path | Auth | Source file`) + Tier 2 deep dive only on auth and explicitly requested flows (max ~10 endpoints unless asked).
- decompile/trace requested → decompiled tree on disk + requested call-flow / mapping artifact.

## canonical terminology (domain-specific)

| concept category | canonical systems primitive |
|---|---|
| package analysis & modification | analyse package / modify owned package |
| TLS trust & environment verification | inspect trust manager / environment check analysis |
| runtime bytecode & archive extraction | extract runtime bytecode / expand protected archive |
| client configuration & endpoint recovery | recover client configuration / document endpoint contract |

## operational workflow (100% native local pipeline)

helper scripts live in `~/.gemini/scripts/android-re/`. execute long decompilations or emulator boots inline via the timeout wrapper (`GEMINI.md` §0.20).

### phase 0: fingerprint before decompiling
run `bash ~/.gemini/scripts/android-re/fingerprint.sh <target.apk|target.xapk>` first.
- check framework marker before wasting time on Java decompilation:
  - **Flutter** (`libflutter.so` / `libapp.so`) → stop Java decompilation; route to `blutter` / `radare2` / `ghidra` native AOT inspection on `lib/<abi>/libapp.so`.
  - **React Native** (`libhermes.so` / `assets/index.android.bundle`) → route to Hermes bytecode disassembly (`hbctool` / `hermes-dec`) or JS bundle recovery (`webcrack` / `wakaru`).
  - **Cordova / Capacitor** (`assets/www/` or `assets/public/`) → unzip and inspect bundled JS/HTML directly.
  - **Xamarin / MAUI** (`libmonodroid.so` / `assemblies/`) → extract `.dll` assemblies and decompile with `ilspycmd`.
  - **Native Android (Kotlin / Java / Compose)** → proceed to Phase 1–5.
- record detected HTTP stack (`Retrofit`, `OkHttp`, `Ktor`, `Apollo`, `Volley`), DI (`Hilt`, `Dagger`, `Koin`), serialization, obfuscation ratio, and split-APK native `.so` inventory.

### phase 1: verify local dependencies
run `bash ~/.gemini/scripts/android-re/check-deps.sh`. requires JDK 17+ and `jadx` (optional `vineflower`/`fernflower` + `dex2jar`). install missing dependencies locally into `~/.local/` via `bash ~/.gemini/scripts/android-re/install-dep.sh <dep>`.

### phase 2: decompile (engine selection)
run `bash ~/.gemini/scripts/android-re/decompile.sh [OPTIONS] <file>`:
- first pass / resources needed: `--engine jadx --deobf`
- complex lambdas, coroutines, streams, or broken jadx method bodies: `--engine fernflower` or `--engine both`
- fast code-only triage on large APK: `--engine jadx --no-res`
- XAPK / split-APK bundles: script automatically unpacks `base.apk` and split APKs; inspect `<output>/base/sources/` when wrapper detection triggers.

### phase 3: structure & high-signal constants
1. read `<output>/resources/AndroidManifest.xml`: package name, `android:name` Application subclass, launcher Activity (`MAIN`/`LAUNCHER`), exported Activities/Services/Receivers/Providers, permissions.
2. read every `BuildConfig.java` across all Gradle modules (rarely obfuscated; exposes base URLs, flavors, build types, keys, flags):
   `find <output>/sources -name BuildConfig.java -exec grep -H '=' {} \;`
3. identify architecture (`MVVM` ViewModel/StateFlow, `MVP` Presenter, `Clean` domain/data/presentation).

### phase 3.5: kotlin metadata name recovery (mandatory on obfuscated Kotlin apps)
R8 renames JVM symbols (`a.b.c`) but preserves `@DebugMetadata(c = "...")` (coroutine `SuspendLambda`) and `@Metadata(d2 = {...})` descriptors.
1. build the obfuscated-to-real FQN map (~100% recovery on `*Repository`, `*ViewModel`, `*UseCase`, `*Impl`; ~80% on DTOs):
   `bash ~/.gemini/scripts/android-re/recover-kotlin-names.sh <output>/sources <output>/mapping`
2. search with real-name annotation instead of raw grep:
   `bash ~/.gemini/scripts/android-re/lookup-name.sh <output>/mapping --grep '<pattern>' <output>/sources`
3. resolve specific obfuscated class and its lambda siblings:
   `bash ~/.gemini/scripts/android-re/lookup-name.sh <output>/mapping -o <obf.fqn>`

### phase 4: call-flow & DI resolution
trace from UI entry or `Application.onCreate()` down to transport:
- **Hilt / Dagger**: match interface injection `@Inject` to `@Module` / `@Provides` / `@Binds`.
- **Koin**: match `get<T>()` / `by inject()` to `module { single { ... }; factory { ... }; viewModel { ... } }` (`Function2<Scope, ParametersHolder, T>` after R8).
- **JNI / Native bridge**: locate `System.loadLibrary("...")` and `public external fun` / `native` declarations; map to `Java_<pkg>_<Class>_<method>` or `RegisterNatives` in `lib/<abi>/lib*.so` using `nm -D` / `readelf -Ws` / `rabin2 -E`.

### phase 5: endpoint & contract extraction
run `bash ~/.gemini/scripts/android-re/find-api-calls.sh <output>/sources/` (`--retrofit`, `--urls`, `--auth`, `--paths`).
- **Retrofit**: `@GET`, `@POST`, `@PUT`, `@DELETE`, `@PATCH`, `@Path`, `@Query`, `@Body`, `@Header`, `.baseUrl(`.
- **OkHttp**: `Request.Builder`, `HttpUrl`, `addInterceptor`, `addNetworkInterceptor` (inspect interceptors for token signing, custom headers, certificate pinning).
- **Ktor**: `HttpClient`, `defaultRequest`, `URLProtocol`, `BearerTokens`, `loadTokens`, `refreshTokens`.
- **Apollo GraphQL**: `ApolloClient.serverUrl`, `OPERATION_DOCUMENT` in generated query/mutation classes.
- **Obfuscation fallback (`--paths`)**: extract quoted path-literal strings (`"/v1/..."`, `"/api/..."`) which survive R8 inlining.

### phase 6: lab verification (micro & macro runtime proof)
1. **lab c — micro-level native `.so` & JNI verification (no emulator required):**
   - **x86_64 `.so` present:** map ELF segments directly with `mmap` + PLT hooks in C (`gcc`) and invoke `Java_*` / internal functions natively.
   - **arm64-v8a `.so` only:** run via standalone Unidbg ARM64 harness using `HookZz` inline hooks and `DalvikVM` JNI emulation.
2. **lab b — macro-level full Android KVM emulator:**
   - warm-boots Android (`x86_64`, `userdebug` with `adb root`) from KVM snapshot in ~3 seconds.
   - install target APK, trigger exported Activities/Services/Providers/DeepLinks via `adb shell am`, and capture `adb logcat -d -s AndroidRuntime:E`.

## components

THE FINGERPRINT, THE DECOMPILE, THE MANIFEST, THE METADATA-RECOVER, THE CALLFLOW, THE DI-MAP, THE ENDPOINT-EXTRACT, THE JNI-BRIDGE, THE LAB-VERIFY.
