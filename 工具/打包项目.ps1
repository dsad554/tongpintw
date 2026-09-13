#requires -Version 7.4
[CmdletBinding()]
param([ValidateSet('完整','网页','计划书')][string]$Kind='完整')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$approved=switch($Kind){
 '完整' {@('dist','源码','package.json','package-lock.json','tsconfig.json','产品说明计划书','文档','README.md','AGENTS.md','验收记录.md','工具','打开项目.html','启动本地预览.cmd','.openai/hosting.json')}
 '网页' {@('dist')}
 '计划书' {@('产品说明计划书')}
}
$files=[Collections.Generic.List[IO.FileInfo]]::new()
function Collect([string]$target){
 $item=Get-Item -LiteralPath $target -Force
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw '不打包符号链接或重解析点。'}
 if($item.PSIsContainer){foreach($child in Get-ChildItem -LiteralPath $item.FullName -Force){Collect $child.FullName};return}
 if($item.Name -match '(?i)(^\.env|secret|credential|密钥|凭证)' -or $item.Extension -in @('.key','.pem','.dpapi','.pfx','.p12','.exe','.zip')){throw ('不可交付文件：'+$item.Name)}
 if($item.Extension -notin @('.html','.css','.js','.json','.md','.txt','.ts','.tsx','.mjs','.cjs','.ps1','.cmd','.svg','.png','.jpg','.webp','.gif')){throw ('未批准文件类型：'+$item.Name)}
 if($item.Extension -notin @('.png','.jpg','.webp','.gif')){
  $text=[IO.File]::ReadAllText($item.FullName)
  if($text -match '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9_.-]{24,}'){throw '疑似密钥内容，停止打包。'}
 }
 $files.Add($item)
}
foreach($entry in $approved){Collect (Join-Path $root $entry)}
$output=Join-Path $root '交付包'
New-Item -ItemType Directory -Path $output -Force | Out-Null
if((Get-Item -LiteralPath $output).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '输出目录不能是重解析点。'}
$zipPath=Join-Path $output ('同频提问局_'+$Kind+'_'+(Get-Date -Format 'yyyyMMdd_HHmmssfff')+'.zip')
$base=if($Kind -eq '网页'){Join-Path $root 'dist'}else{$root}
$stream=[IO.File]::Open($zipPath,[IO.FileMode]::CreateNew)
$archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try{
 foreach($file in $files){
  $relative=[IO.Path]::GetRelativePath($base,$file.FullName).Replace('\','/')
  if($relative.StartsWith('../') -or [IO.Path]::IsPathRooted($relative)){throw '文件越出交付范围。'}
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal)|Out-Null
 }
}finally{$archive.Dispose();$stream.Dispose()}
[ordered]@{kind=$Kind;count=$files.Count;path=$zipPath;rawResearchIncluded=$false;externalConfigurationIncluded=$false}|ConvertTo-Json -Compress
