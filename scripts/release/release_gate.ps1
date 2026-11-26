# Release gates for the P7 ERP `deploy` flow (Windows PowerShell 5.1 or PowerShell 7).
#
# This script only CHECKS. It never commits, pushes, tags, merges or changes the live
# server. The release steps in .cursor/rules/deployment-process.mdc run only after the
# matching gate here prints PASS.
#
# Run from the repository root:
#   powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 preflight
#   powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 ci <sha> -Branch main
#   powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 on-main <sha>
#   powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 tag-free v1.26.0
#   powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 images v1.26.0
#   powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 live-version v1.26.0
#
# Exit codes: 0 = PASS, 1 = FAIL (stop), 2 = timeout (stop),
#             3 = NEEDS DECISION (uncommitted changes; ask the user), 4 = UNKNOWN (could not verify; stop).

param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet('preflight', 'ci', 'on-main', 'tag-free', 'images', 'live-version')]
    [string]$Command,

    [Parameter(Position = 1)]
    [string]$Target,

    [string]$Workflow = 'CI',
    [string]$Event = 'push',
    # Branch or tag the run must belong to (for example main, dev, or v1.25.1). Empty = any.
    [string]$Branch = '',
    [int]$TimeoutMinutes = 25,
    [string]$Repo = 'prime7biz/p7erp_local',
    [string]$SshTarget = 'root@188.245.156.127',
    [string]$ServerUser = 'primeadmin',
    [string]$ServerPath = '/home/primeadmin/p7erp_local'
)

# Git writes progress to stderr even on success; check $LASTEXITCODE instead of stopping.
$ErrorActionPreference = 'Continue'

$Images = @('prime7biz/p7erp-backend', 'prime7biz/p7erp-frontend', 'prime7biz/p7erp-frontend-admin')

# Anonymous GitHub API calls are limited to 60 per hour, so authenticate when a token exists.
# The token comes from $env:GITHUB_TOKEN or from the same git credential store used for pushes.
# It is never printed.
function Get-GitHubHeaders {
    $headers = @{ 'User-Agent' = 'p7-release-gate'; 'Accept' = 'application/vnd.github+json' }
    $token = $env:GITHUB_TOKEN
    if (-not $token) {
        $env:GIT_TERMINAL_PROMPT = '0'
        $credential = "protocol=https`nhost=github.com`n`n" | & git credential fill 2>$null
        $line = @($credential | Where-Object { $_ -like 'password=*' }) | Select-Object -First 1
        if ($line) { $token = $line.Substring('password='.Length) }
    }
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    return $headers
}
$GitHubHeaders = Get-GitHubHeaders
# Docker Hub must not receive the GitHub token.
$DockerHubHeaders = @{ 'User-Agent' = 'p7-release-gate' }

function Pass([string]$Message) { Write-Output "PASS: $Message"; exit 0 }
function Fail([string]$Message) { Write-Output "FAIL: $Message"; exit 1 }
function Stop-Unknown([string]$Message) { Write-Output "UNKNOWN: $Message"; exit 4 }

# Runs git and returns its stdout as ONE string (or $null on failure). Returning one string
# avoids PowerShell turning single-line output into a character array.
function Get-GitText {
    param([string[]]$GitArgs)
    $output = & git @GitArgs 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return ((@($output) | ForEach-Object { [string]$_ }) -join "`n").Trim()
}

# Returns the non-empty lines of a git command, or an empty array.
function Get-GitLines {
    param([string[]]$GitArgs)
    $text = Get-GitText -GitArgs $GitArgs
    if (-not $text) { return @() }
    return @($text -split "`n" | Where-Object { $_ -ne '' })
}

function Get-FullSha([string]$Ref) {
    $sha = Get-GitText -GitArgs @('rev-parse', '--verify', "$Ref^{commit}")
    if (-not $sha -or $sha -notmatch '^[0-9a-f]{40}$') {
        Fail "'$Ref' is not a commit in this checkout."
    }
    return $sha
}

function Test-ReleaseVersion([string]$Version) {
    if ($Version -notmatch '^v\d+\.\d+\.\d+$') { Fail "Version must look like v1.2.3. Got '$Version'." }
}

function Get-HttpStatus($ErrorRecord) {
    try { return [int]$ErrorRecord.Exception.Response.StatusCode } catch { return 0 }
}

switch ($Command) {

    'preflight' {
        $branch = Get-GitText -GitArgs @('rev-parse', '--abbrev-ref', 'HEAD')
        if ($branch -ne 'dev') {
            Fail "Releases start from branch 'dev'. Current branch is '$branch'. Switch with: git switch dev"
        }

        & git fetch origin dev --quiet 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Unknown 'git fetch origin dev failed (network or credentials).' }

        $counts = Get-GitText -GitArgs @('rev-list', '--left-right', '--count', 'origin/dev...HEAD')
        if (-not $counts) { Stop-Unknown 'Could not compare with origin/dev.' }
        $behind = [int](($counts -split '\s+')[0])
        if ($behind -gt 0) {
            Fail "Local dev is behind origin/dev by $behind commit(s). Pull first; never force."
        }

        $changes = Get-GitLines -GitArgs @('status', '--porcelain', '--untracked-files=all')
        if ($changes.Count -gt 0) {
            $forbidden = @($changes | Where-Object {
                $path = $_.Substring(3).Trim('"')
                $path -match '(^|/)\.env($|\.)' -or
                $path -match '\.(pem|key|p12|pfx)$' -or
                $path -match '(^|/)(backend/media|frontend/dist|node_modules|__pycache__|\.pytest_cache)(/|$)' -or
                $path -match '\.(dump|sql|sql\.gz|bak)$' -or
                $path -match '(^|/)backups?/'
            })
            if ($forbidden.Count -gt 0) {
                Write-Output 'Files that must never be committed:'
                $forbidden | ForEach-Object { Write-Output "  $_" }
                Fail 'Remove these files from the change list before deploying.'
            }
            Write-Output 'Uncommitted changes (commit only the files you approve, or stop):'
            $changes | ForEach-Object { Write-Output "  $_" }
            Write-Output 'NEEDS DECISION: the working tree is not clean.'
            exit 3
        }

        $head = Get-FullSha -Ref 'HEAD'
        Pass "branch dev, clean tree, not behind origin/dev. HEAD=$head"
    }

    'ci' {
        if (-not $Target) { Fail 'Usage: ci <full-sha>' }
        $sha = Get-FullSha -Ref $Target
        $deadline = (Get-Date).AddMinutes($TimeoutMinutes)

        while ($true) {
            try {
                $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/actions/runs?head_sha=$sha&per_page=30" -Headers $GitHubHeaders
            } catch {
                Stop-Unknown "GitHub API request failed: $($_.Exception.Message)"
            }

            # Match the exact commit, never just the most recent run.
            $match = @($response.workflow_runs | Where-Object {
                $_.head_sha -eq $sha -and $_.name -eq $Workflow -and $_.event -eq $Event -and
                ($Branch -eq '' -or $_.head_branch -eq $Branch)
            })
            if ($match.Count -gt 0) {
                $run = $match | Sort-Object created_at -Descending | Select-Object -First 1
                if ($run.status -eq 'completed') {
                    if ($run.conclusion -eq 'success') { Pass "$Workflow on $sha succeeded. $($run.html_url)" }
                    Fail "$Workflow on $sha concluded '$($run.conclusion)'. $($run.html_url)"
                }
                Write-Output "waiting: $Workflow is $($run.status). $($run.html_url)"
            } else {
                Write-Output "waiting: no '$Workflow' run for $sha yet."
            }

            if ((Get-Date) -gt $deadline) { Write-Output "TIMEOUT: $Workflow on $sha after $TimeoutMinutes min."; exit 2 }
            Start-Sleep -Seconds 30
        }
    }

    'on-main' {
        if (-not $Target) { Fail 'Usage: on-main <full-sha>' }
        $sha = Get-FullSha -Ref $Target
        & git fetch origin main --quiet 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Unknown 'git fetch origin main failed.' }
        & git merge-base --is-ancestor $sha origin/main 2>$null
        if ($LASTEXITCODE -eq 0) { Pass "$sha is contained in origin/main." }
        Fail "$sha is NOT in origin/main. Promote it to main first; never tag a commit that is not on main."
    }

    'tag-free' {
        if (-not $Target) { Fail 'Usage: tag-free <vX.Y.Z>' }
        Test-ReleaseVersion -Version $Target

        & git fetch origin --tags --quiet 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Unknown 'git fetch origin --tags failed.' }
        if ((Get-GitLines -GitArgs @('tag', '-l', $Target)).Count -gt 0) {
            Fail "Tag $Target already exists locally. Choose the next version."
        }
        if ((Get-GitLines -GitArgs @('ls-remote', '--tags', 'origin', "refs/tags/$Target")).Count -gt 0) {
            Fail "Tag $Target already exists on origin. Choose the next version."
        }

        foreach ($image in $Images) {
            $status = 0
            try {
                Invoke-RestMethod -Uri "https://hub.docker.com/v2/repositories/$image/tags/$Target" -Headers $DockerHubHeaders | Out-Null
                $status = 200
            } catch {
                $status = Get-HttpStatus $_
            }
            if ($status -eq 200) { Fail "$image`:$Target already exists on Docker Hub. Publishing is once per version." }
            if ($status -ne 404) { Stop-Unknown "Docker Hub check for $image`:$Target returned HTTP $status." }
        }
        Pass "$Target is unused in git and on Docker Hub."
    }

    'images' {
        if (-not $Target) { Fail 'Usage: images <vX.Y.Z>' }
        Test-ReleaseVersion -Version $Target
        $missing = @()
        foreach ($image in $Images) {
            try {
                Invoke-RestMethod -Uri "https://hub.docker.com/v2/repositories/$image/tags/$Target" -Headers $DockerHubHeaders | Out-Null
            } catch {
                $status = Get-HttpStatus $_
                if ($status -eq 404) { $missing += "$image`:$Target" }
                else { Stop-Unknown "Docker Hub check for $image`:$Target returned HTTP $status." }
            }
        }
        if ($missing.Count -gt 0) { Fail "Missing images: $($missing -join ', ')" }
        Pass "All three immutable images exist for $Target."
    }

    'live-version' {
        # Read-only. Uses SSH to ask the backend on the server itself (127.0.0.1:8000/health).
        # The public site is behind a bot-challenge page that scripted HTTP clients cannot pass.
        if (-not $Target) { Fail 'Usage: live-version <vX.Y.Z>' }
        Test-ReleaseVersion -Version $Target
        $raw = & ssh -o BatchMode=yes -o ConnectTimeout=20 $SshTarget "sudo -u $ServerUser -H bash -lc 'curl -fsS --max-time 15 http://127.0.0.1:8000/health'" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $raw) { Stop-Unknown 'Could not read backend /health over SSH.' }
        try {
            $health = ($raw -join "`n") | ConvertFrom-Json
        } catch {
            Stop-Unknown 'Backend /health did not return JSON.'
        }
        $reported = [string]$health.version
        if ($reported -eq $Target -or $reported -eq $Target.TrimStart('v')) {
            Pass "Live backend reports version $reported."
        }
        Fail "Live backend reports '$reported', expected $Target."
    }
}
