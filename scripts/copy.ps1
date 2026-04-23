param(
    [Parameter(Mandatory=$true, Position=0, ValueFromRemainingArguments=$true)]
    [string[]]$Files
)

# Handles one quoted blob of Windows paths.
if ($Files.Count -eq 1 -and $Files[0] -match '\s+[A-Za-z]:\\') {
    $Files = $Files[0] -split '\s+(?=[A-Za-z]:\\)'
}

$allProcessedLines = @()

foreach ($file in $Files) {
    if (-not (Test-Path -LiteralPath $file)) {
        Write-Warning "File not found: $file"
        continue
    }

    $content = Get-Content -LiteralPath $file -Raw

    # Remove /* ... */ block comments
    $content = $content -replace '(?s)/\*.*?\*/', ''

    # Remove // line comments
    # Note: simple regex; can affect strings containing //.
    $content = $content -replace '(?m)^\s*//.*$', ''
    $content = $content -replace '(?m)\s+//.*$', ''

    $lines = $content -split "`r?`n"

    foreach ($line in $lines) {
        $trimmedLine = $line.Trim()

        if ([string]::IsNullOrWhiteSpace($trimmedLine)) {
            continue
        }

        # Skip TypeScript/Vite boilerplate
        if ($trimmedLine -match '^import\b') {
            continue
        }

        if ($trimmedLine -match '^export\s+type\b') {
            continue
        }

        if ($trimmedLine -match '^///\s*<reference\b') {
            continue
        }

        # Optional: skip pure re-export barrels
        if ($trimmedLine -match '^export\s+\{.*\}\s+from\b') {
            continue
        }

        $allProcessedLines += $trimmedLine
    }

    $allProcessedLines += ""
}

$finalOutput = $allProcessedLines -join [Environment]::NewLine
$finalOutput | Set-Clipboard

Write-Host "Successfully processed $($Files.Count) files and copied the chunk to your clipboard!" -ForegroundColor Green