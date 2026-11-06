# Re-encodes tutorial videos to small VP9 files (about 85% smaller, text stays sharp).
# Uses an ffmpeg Docker image, so nothing is installed on the host.
#
# Usage (from this folder):
#   .\compress-videos.ps1                 # every video not yet compressed
#   .\compress-videos.ps1 -Name inv-create-po
#   .\compress-videos.ps1 -Parallel 3     # encode several at once (each takes ~3-4 minutes)
#
# A file is treated as already compressed when it is smaller than 2 MB.
param(
  [string]$Name = "",
  [int]$Parallel = 2,
  [int]$Crf = 42
)

$videos = (Resolve-Path "$PSScriptRoot\..\..\frontend\public\tutorials\videos").Path
$files = Get-ChildItem "$videos\*.webm" |
  Where-Object { -not $_.Name.StartsWith("_") } |
  Where-Object { $Name -eq "" -or $_.BaseName -eq $Name } |
  Where-Object { $Name -ne "" -or $_.Length -gt 2MB }

if (-not $files) {
  Write-Host "Nothing to compress."
  exit 0
}

$jobs = @()
foreach ($f in $files) {
  while (($jobs | Where-Object { $_.State -eq "Running" }).Count -ge $Parallel) { Start-Sleep -Seconds 5 }
  Write-Host "Compressing $($f.Name) ($([math]::Round($f.Length / 1MB, 1)) MB)…"
  $jobs += Start-Job -ArgumentList $videos, $f.Name, $Crf -ScriptBlock {
    param($dir, $file, $crf)
    $tmp = "_tmp_$file"
    docker run --rm -v "${dir}:/v" jrottenberg/ffmpeg:6.1-alpine -hide_banner -loglevel error -y `
      -i "/v/$file" -c:v libvpx-vp9 -crf $crf -b:v 0 -row-mt 1 -deadline good -cpu-used 5 -an "/v/$tmp"
    if ($LASTEXITCODE -eq 0 -and (Test-Path "$dir\$tmp")) {
      Move-Item -Force "$dir\$tmp" "$dir\$file"
      "$file -> $([math]::Round((Get-Item "$dir\$file").Length / 1KB)) KB"
    } else {
      Remove-Item -ErrorAction SilentlyContinue "$dir\$tmp"
      "$file FAILED"
    }
  }
}
$jobs | Wait-Job | Receive-Job
$jobs | Remove-Job
