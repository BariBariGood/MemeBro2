$ErrorActionPreference = "Stop"

function Normalize-MemeName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return (($Name.ToLowerInvariant() -replace "[^a-z0-9]+", " ").Trim() -replace "\s+", " ")
}

function Save-JpegWithQuality {
  param(
    [Parameter(Mandatory = $true)]
    [System.Drawing.Image]$Image,
    [Parameter(Mandatory = $true)]
    [string]$DestinationPath,
    [Parameter(Mandatory = $true)]
    [int]$Quality
  )

  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" } |
    Select-Object -First 1

  if (-not $jpegCodec) {
    throw "JPEG encoder is not available on this system."
  }

  $encoder = [System.Drawing.Imaging.Encoder]::Quality
  $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, [long]$Quality)

  try {
    $Image.Save($DestinationPath, $jpegCodec, $encoderParameters)
  } finally {
    $encoderParameters.Dispose()
  }
}

function New-PreviewImage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [Parameter(Mandatory = $true)]
    [string]$DestinationPath,
    [int]$MaxEdge = 360,
    [int]$Quality = 76
  )

  $image = [System.Drawing.Image]::FromFile($SourcePath)

  try {
    $scale = [Math]::Min(1, $MaxEdge / [Math]::Max($image.Width, $image.Height))
    $targetWidth = [Math]::Max(1, [int][Math]::Round($image.Width * $scale))
    $targetHeight = [Math]::Max(1, [int][Math]::Round($image.Height * $scale))

    $bitmap = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)

    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($image, 0, 0, $targetWidth, $targetHeight)
        Save-JpegWithQuality -Image $bitmap -DestinationPath $DestinationPath -Quality $Quality
      } finally {
        $graphics.Dispose()
      }
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $image.Dispose()
  }
}

Add-Type -AssemblyName System.Drawing

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicRoot = Resolve-Path (Join-Path $scriptRoot "..\public")
$assetsRoot = Join-Path $publicRoot "assets"
$previewRoot = Join-Path $assetsRoot "preview-images"
$templateRoot = Join-Path $assetsRoot "meme-templates"
$templateJsonPath = Join-Path $publicRoot "templates.json"

New-Item -ItemType Directory -Force -Path $previewRoot | Out-Null
New-Item -ItemType Directory -Force -Path $templateRoot | Out-Null

$templateCatalog = Get-Content -Raw -Path $templateJsonPath | ConvertFrom-Json
$apiResponse = Invoke-RestMethod -Uri "https://api.imgflip.com/get_memes"

if (-not $apiResponse.success) {
  throw "Imgflip get_memes API did not return success."
}

$nameOverrides = @{
  "awkward look monkey puppet" = "Monkey Puppet"
  "is this a pigeon" = "Is This A Pigeon"
  "mega-mind no bitches" = "Megamind no bitches"
}

$memesByName = @{}
$memesByNormalizedName = @{}

foreach ($meme in $apiResponse.data.memes) {
  $memesByName[$meme.name] = $meme
  $memesByNormalizedName[(Normalize-MemeName -Name $meme.name)] = $meme
}

$downloaded = @()

foreach ($template in $templateCatalog.templates) {
  $requestedName = if ($nameOverrides.ContainsKey($template.name.ToLowerInvariant())) {
    $nameOverrides[$template.name.ToLowerInvariant()]
  } else {
    $template.name
  }

  $meme = $memesByName[$requestedName]

  if (-not $meme) {
    $meme = $memesByNormalizedName[(Normalize-MemeName -Name $requestedName)]
  }

  if (-not $meme) {
    throw "No Imgflip meme match found for template '$($template.name)'."
  }

  $uri = [Uri]$meme.url
  $extension = [System.IO.Path]::GetExtension($uri.AbsolutePath)

  if ([string]::IsNullOrWhiteSpace($extension)) {
    $extension = ".jpg"
  }

  $fullAssetFileName = "{0}{1}" -f $template.id, $extension.ToLowerInvariant()
  $previewAssetFileName = "{0}.jpg" -f $template.id
  $fullAssetPath = Join-Path $templateRoot $fullAssetFileName
  $previewAssetPath = Join-Path $previewRoot $previewAssetFileName

  Invoke-WebRequest -Uri $meme.url -OutFile $fullAssetPath
  New-PreviewImage -SourcePath $fullAssetPath -DestinationPath $previewAssetPath

  $template.images.main = "/assets/meme-templates/$fullAssetFileName"
  $template.images.preview = "/assets/preview-images/$previewAssetFileName"
  $template.images.thumbnail = "/assets/preview-images/$previewAssetFileName"
  $template.images.width = [int]$meme.width
  $template.images.height = [int]$meme.height
  $template | Add-Member -NotePropertyName previewImage -NotePropertyValue $template.images.preview -Force
  $template | Add-Member -NotePropertyName templateImage -NotePropertyValue $template.images.main -Force

  $downloaded += [PSCustomObject]@{
    id = $template.id
    name = $template.name
    source = $meme.name
    main = $template.images.main
    preview = $template.images.preview
  }
}

$templateCatalog.collection.description = "Imgflip-sourced meme template dataset for the scrollable grid experience."
$templateCatalog.collection.sourcePolicy.imageAssets = "imgflip-get_memes"
$templateCatalog.collection.sourcePolicy.notes = "Preview images are locally compressed JPEGs. Full template images are local copies of Imgflip get_memes source assets."
$templateCatalog.templateSchema.fieldNotes.images = "Local paths for the compressed preview, thumbnail, and full meme template image."

$jsonOutput = $templateCatalog | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($templateJsonPath, $jsonOutput + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))

$downloaded | Sort-Object id | Format-Table -AutoSize
