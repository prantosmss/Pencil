#Requires -Version 5.1
<#
.SYNOPSIS
    Check bucket manifests for newer versions.

.DESCRIPTION
    Thin wrapper around Scoop's checkver that understands this bucket's nested
    layout (bucket/official and bucket/community).

    -App accepts a bare name (rustacity), a collection-qualified name
    (official/rustacity), a relative or absolute manifest path, or a wildcard
    (seanime-*). Resolved manifests are handed to Scoop as an exact file path;
    wildcards are passed through to Scoop's recursive search.

.PARAMETER App
    Manifest to check. Defaults to every manifest in the bucket.

.PARAMETER Dir
    Directory to search recursively. Defaults to the parent bucket directory.

.EXAMPLE
    .\bin\checkver.ps1 -App rustacity

.EXAMPLE
    .\bin\checkver.ps1 -App official/rustacity -Update

.EXAMPLE
    .\bin\checkver.ps1 -App 'seanime-*'

.EXAMPLE
    .\bin\checkver.ps1 -Update
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string] $App = '*',

    [Parameter(Position = 1)]
    [string] $Dir,

    [switch] $Update,
    [switch] $ForceUpdate,
    [switch] $SkipUpdated,
    [string] $Version = '',
    [switch] $ThrowError
)

if (!$env:SCOOP_HOME) { $env:SCOOP_HOME = Convert-Path (scoop prefix scoop) }
$checkver = "$env:SCOOP_HOME/bin/checkver.ps1"

if (!$Dir) { $Dir = "$PSScriptRoot/../bucket" } # checks the parent dir
$Dir = (Resolve-Path -LiteralPath $Dir).Path

# Forward every switch/option, but handle -App and -Dir ourselves.
$coreArgs = @{}
foreach ($key in $PSBoundParameters.Keys) {
    if ($key -notin @('App', 'Dir')) {
        $coreArgs[$key] = $PSBoundParameters[$key]
    }
}

$manifest = $null
if ($App -ne '*') {
    if (Test-Path -LiteralPath $App -PathType Leaf) {
        $manifest = (Resolve-Path -LiteralPath $App).Path
    } elseif (Test-Path -LiteralPath "$App.json" -PathType Leaf) {
        # A path was given without the .json extension.
        $manifest = (Resolve-Path -LiteralPath "$App.json").Path
    } elseif ($App -notmatch '[*?\[]') {
        # Bare or collection-qualified name, e.g. rustacity, official/rustacity
        # or bucket/community/anymex.
        $name = $App -replace '\.json$', ''
        $name = $name -replace '^[.][\\/]', ''
        $name = $name -replace '^bucket[\\/]', ''

        $candidates = @(
            Get-ChildItem -LiteralPath $Dir -Filter '*.json' -File -Recurse | ForEach-Object {
                $relative = $_.FullName.Substring($Dir.Length).TrimStart('\', '/').Replace('\', '/')
                [pscustomobject] @{
                    File     = $_
                    Relative = $relative
                    BaseName = $_.BaseName
                }
            }
        )

        $hits = @($candidates | Where-Object { $_.Relative -eq "$name.json" })
        if ($hits.Count -eq 0 -and $name -notmatch '/') {
            $hits = @($candidates | Where-Object { $_.BaseName -eq $name })
        }

        if ($hits.Count -eq 1) {
            $manifest = $hits[0].File.FullName
        } elseif ($hits.Count -eq 0) {
            throw "No manifest matching '$App' found under '$Dir'."
        } else {
            $paths = ($hits | ForEach-Object { $_.Relative }) -join ', '
            throw "Manifest name '$App' is ambiguous; matches: $paths."
        }
    }
}

if ($manifest) {
    $coreArgs['App'] = $manifest
} else {
    # Wildcards (or the default '*') need Scoop's recursive search.
    $coreArgs['App'] = $App
    $coreArgs['Dir'] = $Dir
}

& $checkver @coreArgs
