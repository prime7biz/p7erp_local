<#
.SYNOPSIS
  Build and sign the Prime7 ERP Android app (app bundle for Google Play + test APK).

.DESCRIPTION
  Uses Google's Bubblewrap with the settings in this folder (twa-manifest.json). Builds in C:\p7-android\build,
  outside the repository and without spaces in the path, because:
  - Bubblewrap runs Java / apksigner without quotes, so a path like "C:\Users\First Last" breaks signing;
  - antivirus folder protection on Documents can block the generated Gradle files.
  Results are copied to C:\p7-android\release\<version>\.

  One-time setup (done 2026-11-11): Java 17 in %USERPROFILE%\.bubblewrap\jdk, Android SDK in
  %USERPROFILE%\.bubblewrap\android_sdk (build-tools 36.1.0, platform 36), Bubblewrap CLI in
  %USERPROFILE%\.bubblewrap\cli, junctions C:\p7-android\jdk and C:\p7-android\sdk (+ sdk\tools), upload key in
  Documents\Prime7-Keys (password in PRIME7-UPLOAD-KEY.txt or typed when asked). See README.md.

.EXAMPLE
  ./mobile/android-twa/build-android.ps1
#>
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$work = "C:\p7-android\build"
$keys = Join-Path $env:USERPROFILE "Documents\Prime7-Keys"
$keystore = Join-Path $keys "prime7-upload.keystore"
$bubblewrap = Join-Path $env:USERPROFILE ".bubblewrap\cli\node_modules\@bubblewrap\cli\bin\bubblewrap.js"

foreach ($p in "C:\p7-android\jdk\bin\java.exe", "C:\p7-android\sdk\build-tools\36.1.0\apksigner.bat", $keystore, $bubblewrap) {
  if (-not (Test-Path $p)) { throw "Missing: $p (see the one-time setup in README.md)" }
}

$password = ""
$note = Join-Path $keys "PRIME7-UPLOAD-KEY.txt"
if (Test-Path $note) {
  $password = ((Get-Content $note | Where-Object { $_ -like "Password*" }) -replace "^Password\s*:\s*", "" -split "\s+")[0]
}
if (-not $password) {
  $secure = Read-Host "Upload key password" -AsSecureString
  $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

$env:JAVA_HOME = "C:\p7-android\jdk"
$env:ANDROID_HOME = "C:\p7-android\sdk"
# Trust the Windows certificate store (antivirus HTTPS scanning breaks Java's and Node's own stores).
$env:JAVA_TOOL_OPTIONS = "-Djavax.net.ssl.trustStoreType=Windows-ROOT"
$env:NODE_OPTIONS = "--use-system-ca"
# No Gradle background process: it would keep build files and this window's output open after the build.
$env:GRADLE_OPTS = "-Dorg.gradle.daemon=false"
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = $password
$env:BUBBLEWRAP_KEY_PASSWORD = $password

New-Item -ItemType Directory -Force $work | Out-Null
$manifest = Get-Content (Join-Path $here "twa-manifest.json") -Raw | ConvertFrom-Json
$manifest.signingKey.path = $keystore
[IO.File]::WriteAllText((Join-Path $work "twa-manifest.json"), ($manifest | ConvertTo-Json -Depth 10))

# Bubblewrap prints the signing command, including the password, when signing fails: hide it.
function Hide-Secret([string]$line) {
  $line = $line -replace 'pass:"[^"]*"', 'pass:"***"'
  if ($password) { $line = $line.Replace($password, "***") }
  $line
}

Push-Location $work
[Environment]::CurrentDirectory = $work
# Node and Gradle write progress to stderr; in Windows PowerShell that must not count as a failure.
$ErrorActionPreference = "Continue"
try {
  # A Gradle background process from an earlier build keeps files open; stop it before regenerating.
  if (Test-Path ".\gradlew.bat") { .\gradlew.bat --stop 2>&1 | Out-Null }
  Remove-Item "app-release-bundle.aab", "app-release-signed.apk" -ErrorAction SilentlyContinue
  node $bubblewrap update --skipVersionUpgrade 2>&1 | ForEach-Object { Hide-Secret "$_" }
  if ($LASTEXITCODE -ne 0) { throw "bubblewrap update failed" }
  node $bubblewrap build --skipPwaValidation 2>&1 | ForEach-Object { Hide-Secret "$_" }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path "app-release-bundle.aab")) { throw "Build failed: no app-release-bundle.aab" }
} finally {
  $ErrorActionPreference = "Stop"
  Pop-Location
  Remove-Item Env:BUBBLEWRAP_KEYSTORE_PASSWORD, Env:BUBBLEWRAP_KEY_PASSWORD -ErrorAction SilentlyContinue
}

$version = "$($manifest.appVersion)-$($manifest.appVersionCode)"
$release = "C:\p7-android\release\$version"
New-Item -ItemType Directory -Force $release | Out-Null
Copy-Item (Join-Path $work "app-release-bundle.aab") (Join-Path $release "prime7erp-$version.aab") -Force
Copy-Item (Join-Path $work "app-release-signed.apk") (Join-Path $release "prime7erp-$version-upload-signed-TEST-ONLY.apk") -Force
Write-Host ""
Write-Host "Done. Upload to Google Play: $release\prime7erp-$version.aab"
Write-Host "The upload-signed APK is for testing on your own phone only; the website APK comes from Play Console."
