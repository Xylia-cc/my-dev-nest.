@echo off
REM ============================================================
REM  分仓组装量计算器 - GitHub Pages 一键发布（Windows 双击运行）
REM
REM  用法：双击本文件 -> 粘贴 token -> 回车 -> 自动完成
REM  token 生成：https://github.com/settings/tokens/new
REM            权限勾选：repo + workflow
REM ============================================================
setlocal

cd /d "%~dp0.."
set REPO=my-dev-nest.
set TOKENFILE=%USERPROFILE%\.workbuddy\github_token.txt

echo ============================================
echo  分仓组装量计算器 - GitHub Pages 发布
echo  仓库: Xylia-cc/%REPO%
echo ============================================
echo.

if exist "%TOKENFILE%" (
    echo [i] 检测到已保存的 token
    set USEEXISTING=1
) else (
    echo 首次使用请先生成 Personal Access Token:
    echo   1. 打开 https://github.com/settings/tokens/new
    echo   2. Note 填 assembly-calculator
    echo   3. Expiration 选 90 days
    echo   4. 勾选权限: repo  和  workflow
    echo   5. 点 Generate token，复制 ghp_ 开头的字符串
    echo.
    set /p TOKEN=请粘贴 token（粘贴后回车）: 
    if "%TOKEN%"=="" (
        echo [X] 未输入 token，已退出。
        pause
        exit /b 1
    )
    if not exist "%USERPROFILE%\.workbuddy" mkdir "%USERPROFILE%\.workbuddy"
    echo %TOKEN%> "%TOKENFILE%"
    echo [OK] token 已保存
    set USEEXISTING=0
)

echo.
echo [1/3] 发布中，请稍候...
echo.

if "%USEEXISTING%"=="1" (
    call node publish\github_auto_publish.js "%REPO%"
) else (
    call node publish\github_auto_publish.js "%REPO%" "%TOKEN%"
)

echo.
echo ============================================
echo  完成。首次部署需 1-3 分钟生效。
echo  地址: https://xylia-cc.github.io/my-dev-nest./
echo 进度: https://github.com/Xylia-cc/my-dev-nest./actions
echo ============================================
pause
