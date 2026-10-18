#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the static landing-page data for the Pencil Scoop bucket.

.DESCRIPTION
    Merges the curated catalog in data/catalog.json (categories, stars and
    descriptions) with metadata read from every manifest under bucket/
    (recursively; homepage, version) and writes docs/data/apps.json.

    The output powers the GitHub Pages landing page. It is a plain static
    file, so the page keeps working on any static host with no server code.

.PARAMETER RepoRoot
    Repository root. Defaults to the parent of this script's directory.

.PARAMETER OutputPath
    Where to write the generated JSON. Defaults to docs/data/apps.json.
#>
[CmdletBinding()]
param(
    [string] $RepoRoot,
    [string] $OutputPath
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$catalogPath = Join-Path $RepoRoot 'data/catalog.json'
$bucketDir = Join-Path $RepoRoot 'bucket'
if (-not $OutputPath) {
    $OutputPath = Join-Path $RepoRoot 'docs/data/apps.json'
}

if (-not (Test-Path -LiteralPath $catalogPath)) {
    throw "Catalog not found: $catalogPath"
}
if (-not (Test-Path -LiteralPath $bucketDir)) {
    throw "Bucket directory not found: $bucketDir"
}

# Read explicitly as UTF-8: Windows PowerShell 5.1 otherwise uses the ANSI
# code page and turns emoji (and other non-ASCII text) into mojibake.
$catalog = Get-Content -LiteralPath $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
$categories = @($catalog.categories)

# Index catalog entries by manifest id so we can look them up in O(1).
$entries = @{}
foreach ($entry in $catalog.apps) {
    $entries[[string] $entry.id] = $entry
}

# Build the category display order (catalog order wins).
$categoryOrder = @{}
for ($i = 0; $i -lt $categories.Count; $i++) {
    $categoryOrder[[string] $categories[$i].id] = $i
}

$manifests = Get-ChildItem -LiteralPath $bucketDir -Filter '*.json' -File -Recurse | Sort-Object FullName
$apps = New-Object System.Collections.Generic.List[object]
$uncataloged = New-Object System.Collections.Generic.List[string]
$seenIds = @{}

foreach ($manifestFile in $manifests) {
    $id = [System.IO.Path]::GetFileNameWithoutExtension($manifestFile.Name)
    $relativePath = $manifestFile.FullName.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')

    if ($seenIds.ContainsKey($id)) {
        throw "Duplicate manifest id '$id' found at '$relativePath' and '$($seenIds[$id])'."
    }
    $seenIds[$id] = $relativePath

    # bucket/<collection>/<app>.json — anything directly in bucket/ is treated
    # as community for backwards compatibility.
    $pathParts = $relativePath -split '/'
    $collection = if ($pathParts.Count -ge 3) { $pathParts[1] } else { 'community' }

    $manifest = Get-Content -LiteralPath $manifestFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $entry = $null
    if ($entries.ContainsKey($id)) {
        $entry = $entries[$id]
    } else {
        $uncataloged.Add($id)
    }

    $category = 'utilities'
    $name = $id
    $star = $false
    $purpose = $manifest.description
    $note = $null
    if ($entry) {
        if ($entry.category) { $category = [string] $entry.category }
        if ($entry.name) { $name = [string] $entry.name }
        if ($entry.star) { $star = [bool] $entry.star }
        if ($entry.purpose) { $purpose = [string] $entry.purpose }
        if ($entry.note) { $note = [string] $entry.note }
    }

    $apps.Add([pscustomobject] @{
        id         = $id
        name       = $name
        category   = $category
        star       = $star
        purpose    = $purpose
        note       = $note
        homepage   = $manifest.homepage
        version    = $manifest.version
        manifest   = "https://github.com/prantosmss/Pencil/blob/main/$relativePath"
        collection = $collection
    })
}

foreach ($id in $uncataloged) {
    Write-Warning "Manifest '$id' has no data/catalog.json entry; filed under 'Utilities & Misc'."
}

foreach ($entry in $catalog.apps) {
    if (-not $seenIds.ContainsKey([string] $entry.id)) {
        Write-Warning "catalog.json entry '$($entry.id)' has no matching bucket manifest; skipped."
    }
}

$ordered = $apps | Sort-Object `
    @{ Expression = { $categoryOrder[[string] $_.category] } }, `
    @{ Expression = { -not $_.star } }, `
    @{ Expression = { $_.name.ToLowerInvariant() } }

$outApps = foreach ($app in $ordered) {
    $record = [ordered] @{
        id         = $app.id
        name       = $app.name
        category   = $app.category
        star       = $app.star
        purpose    = $app.purpose
        homepage   = $app.homepage
        version    = $app.version
        manifest   = $app.manifest
        collection = $app.collection
    }
    if ($app.note) {
        $record['note'] = $app.note
    }
    [pscustomobject] $record
}

$document = [ordered] @{
    generated  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    bucket     = 'https://github.com/prantosmss/Pencil'
    categories = $categories
    apps       = @($outApps)
}

$json = ($document | ConvertTo-Json -Depth 6)

# Windows PowerShell 5.1 escapes non-ASCII characters as \uXXXX. Decode those
# back to literal characters (including surrogate pairs such as emoji) so the
# generated file is identical whether it runs under Windows PowerShell or
# PowerShell 7. Control characters (< U+0020) stay escaped for valid JSON.
$json = [regex]::Replace($json, '(?<!\\)\\u([0-9a-fA-F]{4})', {
    param($match)
    $codePoint = [Convert]::ToInt32($match.Groups[1].Value, 16)
    if ($codePoint -lt 0x20) { $match.Value } else { [string] [char] $codePoint }
})

# Keep the output consistent with the repository's CRLF convention and make
# sure the file ends with a newline (Scoop's CI style checks enforce both).
$json = $json.Replace("`r`n", "`n").Replace("`n", "`r`n")
if (-not $json.EndsWith("`r`n")) {
    $json += "`r`n"
}

$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $json, $utf8NoBom)

Write-Host ("Wrote {0} app(s) across {1} categor(ies) to {2}" -f @($outApps).Count, $categories.Count, $OutputPath)
